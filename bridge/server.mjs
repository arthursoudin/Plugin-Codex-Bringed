import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { annotateTools } from '../tool-annotations.mjs';
import { runtimeInfo } from '../runtime-info.mjs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { openPublicPage } from '../browser-readonly.mjs';

const TEST_STATE_DIR = process.env.NODE_ENV === 'test' ? process.env.CODEXBRIDGE_TEST_STATE_DIR : '';
const HERE = path.resolve(TEST_STATE_DIR || path.dirname(fileURLToPath(import.meta.url)));
const HOME = os.homedir();
const AUTHORIZED_PROJECT = process.env.CODEXBRIDGE_PROJECT?.trim() ? path.resolve(process.env.CODEXBRIDGE_PROJECT) : '';
const CODEX_JS = process.env.CODEXBRIDGE_CODEX_JS || [
  path.join(HOME, 'npm-global', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
  path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
  path.join('/usr/local/lib/node_modules', '@openai', 'codex', 'bin', 'codex.js'),
].find(candidate => fs.existsSync(candidate)) || path.join(HOME, 'npm-global', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
const MAX_PROMPT = 12_000;
const MAX_RESPONSE = 8_000;
const MAX_STDOUT = 1_000_000;
const APPROVAL_TTL_MS = 5 * 60_000;
const APPROVAL_DIR = path.join(HERE, 'approvals');
const LOCK_PATH = path.join(HERE, 'jarvis-active.lock');
const TASK_TIMEOUT_MS = 120_000;
const active = new Map();
const tasks = new Map();
const approvals = new Map();
const timedOutTasks = new Set();
const cancelledTasks = new Set();
const MAX_RETAINED_TERMINAL_TASKS = 100;
const MAX_TASK_ACTIVITY_EVENTS = 80;
const MAX_PENDING_TASKS = 50;
const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'timeout', 'cancelled', 'rejected', 'expired']);
const PROJECTS_FILE = path.resolve(HERE, '..', 'history', 'projects.json');

function pruneTaskState(now = Date.now()) {
  for (const [id, task] of tasks) {
    const approval = approvals.get(id);
    const expiresAt = Math.min(task.expiresAt ?? Infinity, approval?.expiresAt ?? Infinity);
    if (task.state === 'prepared' && expiresAt <= now) {
      task.state = 'expired';
      approvals.delete(id);
    }
  }

  const terminal = [...tasks].filter(([, task]) => TERMINAL_TASK_STATES.has(task.state));
  while (terminal.length > MAX_RETAINED_TERMINAL_TASKS) {
    const [id] = terminal.shift();
    tasks.delete(id);
    approvals.delete(id);
  }

  for (const [id, approval] of approvals) {
    const task = tasks.get(id);
    if (!task || task.state !== 'prepared' || approval.expiresAt <= now) approvals.delete(id);
  }
}

function assertTaskCapacity() {
  pruneTaskState();
  const pending = [...tasks.values()].filter(task => task.state === 'prepared').length;
  if (pending >= MAX_PENDING_TASKS) throw new Error(`Limite de ${MAX_PENDING_TASKS} tarefas pendentes atingido. Aprove, recuse ou aguarde a expiração antes de preparar outra.`);
}

function projectPolicySnapshot(projectPath = AUTHORIZED_PROJECT) {
  try {
    const realpath = fs.realpathSync.native(projectPath), stat = fs.statSync(realpath);
    const rows = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')).projects || [];
    const project = rows.find(p => p.realpath?.toLowerCase() === realpath.toLowerCase()
      && String(p.dev) === String(stat.dev) && String(p.ino) === String(stat.ino));
    if (!project) return null;
    const policy = project.approval_policy || { level: 'manual', revision: 0 };
    const identity = policy.identity;
    if (identity && (identity.realpath?.toLowerCase() !== realpath.toLowerCase() || String(identity.dev) !== String(stat.dev) || String(identity.ino) !== String(stat.ino))) return null;
    return { project_id: project.id, identity: { realpath, dev: stat.dev, ino: stat.ino }, level: policy.level || 'manual', revision: Number(policy.revision || 0) };
  } catch { return null; }
}

function canonicalProject(candidate = AUTHORIZED_PROJECT) {
  if (!candidate) throw new Error('Informe explicitamente a pasta existente nesta chamada; selecione uma pasta para a tarefa.');
  if (String(candidate).split(/[\\/]+/).includes('..')) throw new Error('Path traversal rejeitado.');
  let supplied;
  try { supplied = fs.realpathSync.native(path.resolve(candidate)); }
  catch { throw new Error('Diretório do projeto inválido ou inexistente.'); }
  if (!fs.statSync(supplied).isDirectory()) throw new Error('O caminho selecionado não é uma pasta.');
  return supplied;
}

// Best-effort output cleanup only; this is not complete secret detection.
function safeText(value, limit = MAX_RESPONSE) {
  return String(value ?? '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/ig, '$1[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sess-[A-Za-z0-9_-]{8,})\b/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;"']+/ig, '$1[REDACTED]')
    .slice(0, limit);
}

function validatePrompt(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A instrução é obrigatória.');
  if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT) throw new Error(`Instrução excede ${MAX_PROMPT} bytes.`);
  return prompt.trim();
}

function hasDestructiveIntent(prompt) {
  return /\b(delete|remove|erase|wipe|format|rmdir|unlink|rm\s+-|git\s+clean|reset\s+--hard|overwrite|apague|apagar|exclua|excluir|remova|remover|formate|limpe|limpar)\b/i.test(prompt);
}

function writeReport(task) {
  const dir = path.join(HERE, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const report = {
    id: task.id, kind: task.kind, executor: task.executor || (task.kind === 'readonly' ? 'codex' : null), state: task.state,
    startedAt: task.startedAt ?? null, finishedAt: task.finishedAt ?? new Date().toISOString(),
    summary: safeText(task.summary ?? '', 4_000), result: safeText(task.result ?? '', MAX_RESPONSE),
    error: safeText(task.error ?? '', 2_000), durationMs: task.durationMs ?? null,
    duration_ms: task.durationMs ?? null, latency_ms: task.latencyMs ?? null,
    model: task.model ?? 'não detectado', effort: task.effort ?? 'não detectado',
    profile_origin: task.profileOrigin ?? 'metadados JSONL/configuração efetiva indisponíveis',
    activity_events: Array.isArray(task.activity_events) ? task.activity_events.slice(-MAX_TASK_ACTIVITY_EVENTS) : [],
  };
  fs.writeFileSync(path.join(dir, `${task.id}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
}

function codexCommandArgs(project, prompt, mode, outputPath, routingSnapshot) {
  const common = ['exec', '--cd', project, '--ephemeral', '--json'];
  const isolatedTools = [
    '--config', 'mcp_servers.node_repl.enabled=false',
    '--config', 'plugins."unified-computer-use@openai-bundled".enabled=false',
  ];
  const routing = routingSnapshot?.configured === true && routingSnapshot?.executor === 'codex'
    ? ['--model', routingSnapshot.model, '-c', `model_reasoning_effort=${routingSnapshot.effort}`]
    : [];
  if (mode === 'readonly') return [...common, ...isolatedTools, ...routing, '--sandbox', 'read-only', prompt];
  return [...common, ...isolatedTools, ...routing, '--sandbox', 'workspace-write', prompt];
}

function extractFinal(jsonl) {
  const lines = jsonl.split(/\r?\n/).filter(Boolean);
  let final = '';
  let error = '';
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') final = event.item.text ?? final;
      if (event.type === 'turn.failed') error = event.error?.message ?? 'Codex informou falha na execução.';
    } catch { /* ignore non-JSON CLI diagnostics */ }
  }
  return { final: safeText(final), error: safeText(error, 2_000) };
}

function extractProfile(jsonl) {
  let profile = null;
  for (const line of jsonl.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      const data = event.payload ?? event;
      if (!['turn_context', 'turn_context_updated', 'session_meta'].includes(event.type)) continue;
      const model = [data.model, data.model_name].find(x => typeof x === 'string' && x.trim());
      const effort = [data.effort, data.model_reasoning_effort].find(x => typeof x === 'string' && x.trim());
      if (model || effort) profile = { model: model || null, effort: effort || null, origin: `metadados JSONL (${event.type})` };
    } catch { /* ignore non-JSON CLI diagnostics */ }
  }
  return profile;
}

function recordActivityEvent(taskId, line) {
  let event;
  try { event = JSON.parse(line); } catch { return; }
  let activity;
  if (event.type === 'turn.started') activity = { station: 'desk', kind: 'planning', action: 'Preparando a tarefa' };
  else if (event.type === 'turn.failed' || event.type === 'error') activity = { station: 'generic', kind: 'error', action: 'A execução informou uma falha' };
  else if (event.type === 'turn.completed') activity = { station: 'generic', kind: 'completed', action: 'A execução foi concluída' };
  else if (['item.started', 'item.updated', 'item.completed'].includes(event.type)) {
    const itemType = event.item?.type;
    const stations = {
      file_change: ['workbench', 'editing', 'Editando arquivos'],
      command_execution: ['terminal', 'tool', 'Usando uma ferramenta local'],
      mcp_tool_call: ['terminal', 'tool', 'Usando uma ferramenta conectada'],
      web_search: ['antenna', 'research', 'Pesquisando na web'],
      reasoning: ['desk', 'planning', 'Preparando a próxima ação'],
      todo_list: ['desk', 'planning', 'Organizando as etapas'],
      agent_message: ['desk', 'response', 'Registrando uma resposta'],
      error: ['generic', 'error', 'Uma atividade informou uma falha'],
    };
    const known = stations[itemType];
    if (known) {
      const status = event.item?.status;
      const outcome = status === 'failed' ? ' · falhou' : (status === 'completed' || event.type === 'item.completed' ? ' · concluído' : '');
      activity = { station: known[0], kind: known[1], action: `${known[2]}${outcome}` };
    }
  }
  if (!activity) return;
  const task = tasks.get(taskId);
  if (!task) return;
  task.activity_events ||= [];
  const eventTime = typeof event.timestamp === 'string' && Number.isFinite(Date.parse(event.timestamp)) ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  task.activity_events.push({ at: eventTime, ...activity });
  if (task.activity_events.length > MAX_TASK_ACTIVITY_EVENTS) task.activity_events.splice(0, task.activity_events.length - MAX_TASK_ACTIVITY_EVENTS);
}

// Read only the three Codex profile keys we need. Never parse or return the
// rest of config.toml, which may contain credentials or unrelated settings.
function configuredProfile(codexHome = process.env.CODEX_HOME || path.join(HOME, '.codex')) {
  try {
    const source = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    const sections = new Map();
    let section = '';
    for (const line of source.split(/\r?\n/)) {
      const header = line.match(/^\s*\[profiles\.(?:"([^"]+)"|'([^']+)'|([^\]]+))\]\s*(?:#.*)?$/);
      if (header) { section = `profiles.${(header[1] || header[2] || header[3]).trim()}`; continue; }
      if (/^\s*\[/.test(line)) { section = ''; continue; }
      const entry = line.match(/^\s*(model|model_reasoning_effort|active_profile)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/);
      if (!entry) continue;
      const key = entry[1], value = entry[2] ?? entry[3] ?? '';
      if (key === 'active_profile' && !section) sections.set('active_profile', value);
      else if (section.startsWith('profiles.')) sections.set(`${section}.${key}`, value);
      else if (!section && key !== 'active_profile') sections.set(`default.${key}`, value);
    }
    const activeProfile = sections.get('active_profile');
    const model = (activeProfile && sections.get(`profiles.${activeProfile}.model`)) || sections.get('default.model') || null;
    const effort = (activeProfile && sections.get(`profiles.${activeProfile}.model_reasoning_effort`)) || sections.get('default.model_reasoning_effort') || null;
    if (!model && !effort) return null;
    return { model, effort, origin: 'configurado (config.toml; não observado no JSONL)' };
  } catch { return null; }
}

function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const forceDirect = () => { if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch {} } };
    const fallback = setTimeout(forceDirect, 750);
    fallback.unref?.();
    try {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => { clearTimeout(fallback); forceDirect(); });
      killer.on('close', (code) => { clearTimeout(fallback); if (code !== 0) forceDirect(); });
    } catch { clearTimeout(fallback); forceDirect(); }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
  }
}

function acquireProjectLock(taskId) {
  const record = JSON.stringify({ task_id: taskId, pid: process.pid, created_at: new Date().toISOString() });
  try { fs.writeFileSync(LOCK_PATH, record, { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code === 'EEXIST') throw new Error('Já existe outra instância executando tarefa neste projeto.'); throw e; }
}
function releaseProjectLock(taskId) {
  try {
    const current = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (current.task_id === taskId && current.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch {}
}
function runCodex(prompt, mode, taskId, timeoutMs = TASK_TIMEOUT_MS, scriptPath = CODEX_JS, routingSnapshot, projectPath, expectedIdentity, toolReceivedAt = performance.now()) {
  const latency = { tool_received_to_runner_start: Math.round(performance.now() - toolReceivedAt) };
  const project = canonicalProject(projectPath);
  if (expectedIdentity) {
    const stat = fs.statSync(project);
    if (project.toLowerCase() !== expectedIdentity.realpath.toLowerCase() || String(stat.dev) !== String(expectedIdentity.dev) || String(stat.ino) !== String(expectedIdentity.ino)) {
      throw new Error('A identidade da pasta mudou desde o preparo. Prepare nova tarefa.');
    }
  }
  acquireProjectLock(taskId);
  if (!fs.existsSync(scriptPath)) { releaseProjectLock(taskId); throw new Error('Codex CLI não encontrado no caminho configurado.'); }
  if (!fs.existsSync(CODEX_JS) && scriptPath === CODEX_JS) throw new Error('Codex CLI não encontrado no caminho npm global esperado.');
  let child;
  const spawnRequestedAt = performance.now();
  const cliArgs = codexCommandArgs(project, prompt, mode, undefined, routingSnapshot);
  const modelArg = cliArgs.indexOf('--model');
  const effortArg = cliArgs.findIndex((x, i) => i > 0 && cliArgs[i - 1] === '-c' && x.startsWith('model_reasoning_effort='));
  const routedProfile = modelArg >= 0 || effortArg >= 0;
  const profileFromArgs = routedProfile ? {
    model: modelArg >= 0 ? cliArgs[modelArg + 1] : null,
    effort: effortArg >= 0 ? cliArgs[effortArg].slice('model_reasoning_effort='.length) : null,
    origin: 'argumentos efetivamente passados ao Codex CLI',
  } : null;
  try { child = spawn(process.execPath, [scriptPath, ...cliArgs], {
    cwd: project, windowsHide: true, shell: false, detached: process.platform !== 'win32',
    env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' }, stdio: ['ignore', 'pipe', 'pipe'],
  }); } catch (e) { releaseProjectLock(taskId); throw e; }
  latency.spawn_call = Math.round(performance.now() - spawnRequestedAt);
  const startedAt = new Date().toISOString();
  active.set(taskId, child);
  let stdout = '';
  let stderr = '';
  let overflow = false;
  let firstData = null;
  let spawnConfirmed = null;
  const activityDecoder = new StringDecoder('utf8');
  let activityBuffer = '';
  const consumeActivityLines = (text, flush = false) => {
    activityBuffer += text;
    const lines = activityBuffer.split(/\r?\n/);
    activityBuffer = flush ? '' : lines.pop();
    for (const line of lines) if (line.length <= 64_000) recordActivityEvent(taskId, line);
    if (flush && activityBuffer.length <= 64_000) recordActivityEvent(taskId, activityBuffer);
    if (activityBuffer.length > 64_000) activityBuffer = '';
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => { timedOutTasks.add(taskId); terminateTree(child); }, timeoutMs);
    child.once('spawn', () => { spawnConfirmed = performance.now(); });
    child.stdout.on('data', (chunk) => {
      if (firstData === null) firstData = performance.now();
      const text = chunk.toString('utf8');
      consumeActivityLines(activityDecoder.write(chunk));
      if (stdout.length < MAX_STDOUT) stdout += text.slice(0, MAX_STDOUT - stdout.length);
      else overflow = true;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 24_000) stderr += chunk.toString('utf8').slice(0, 24_000 - stderr.length);
    });
    child.on('error', (err) => {
      clearTimeout(timer); active.delete(taskId); releaseProjectLock(taskId);
      const ended = performance.now();
      resolve({ state: 'failed', result: '', error: safeText(err.message, 2_000), durationMs: 0, startedAt,
        model: profileFromArgs?.model ?? 'não detectado', effort: profileFromArgs?.effort ?? 'não detectado',
        profileOrigin: profileFromArgs?.origin ?? 'metadados JSONL/configuração efetiva indisponíveis',
        latencyMs: { ...latency, spawn_confirmed: spawnConfirmed === null ? null : Math.round(spawnConfirmed - spawnRequestedAt), first_jsonl_data: null, process_end: Math.round(ended - spawnRequestedAt), response_extraction: 0 } });
    });
    child.on('close', (code, signal) => {
      const processEnded = performance.now();
      consumeActivityLines(activityDecoder.end(), true);
      clearTimeout(timer); active.delete(taskId); releaseProjectLock(taskId);
      const parsed = extractFinal(stdout);
      const observedProfile = extractProfile(stdout);
      const profile = profileFromArgs || observedProfile || configuredProfile();
      const extractedAt = performance.now();
      const timedOut = timedOutTasks.delete(taskId);
      const cancelled = cancelledTasks.delete(taskId);
      const failed = code !== 0 || parsed.error;
      resolve({
        state: timedOut ? 'timeout' : (cancelled ? 'cancelled' : (failed ? 'failed' : 'completed')),
        result: parsed.final || (failed ? '' : safeText(stdout, MAX_RESPONSE)),
        error: parsed.error || (failed ? safeText(stderr || `Codex terminou com código ${code}.`, 2_000) : (overflow ? 'Saída JSONL truncada pelo limite interno.' : '')),
        durationMs: Date.now() - Date.parse(startedAt), startedAt,
        model: profile?.model ?? 'não detectado', effort: profile?.effort ?? 'não detectado',
        profileOrigin: profile?.origin ?? 'metadados JSONL/configuração efetiva indisponíveis',
        latencyMs: { ...latency, spawn_confirmed: spawnConfirmed === null ? null : Math.round(spawnConfirmed - spawnRequestedAt), first_jsonl_data: firstData === null ? null : Math.round(firstData - spawnRequestedAt), process_end: Math.round(processEnded - spawnRequestedAt), response_extraction: Math.round(extractedAt - processEnded) },
      });
    });
  });
}

function taskView(task) {
  return {
    task_id: task.id, state: task.state, summary: safeText(task.summary ?? '', 1_000),
    result: safeText(task.result ?? '', MAX_RESPONSE), error: safeText(task.error ?? '', 2_000),
    duration_ms: task.durationMs ?? null, started_at: task.startedAt ?? null,
    latency_ms: task.latencyMs ?? null,
    model: task.model ?? 'não detectado', effort: task.effort ?? 'não detectado',
    profile_origin: task.profileOrigin ?? 'metadados JSONL/configuração efetiva indisponíveis',
    finished_at: task.finishedAt ?? null,
  };
}

async function execute(task, mode, runner = runCodex) {
  task.state = 'running'; task.startedAt = new Date().toISOString();
  task.activity_events ||= [];
  try {
    const result = await runner(task.prompt, mode, task.id, TASK_TIMEOUT_MS, CODEX_JS, undefined, undefined, undefined, task.toolReceivedAt ?? performance.now());
    Object.assign(task, result, { finishedAt: new Date().toISOString() });
  } catch (e) {
    Object.assign(task, { state: 'failed', error: safeText(e.message, 2_000), finishedAt: new Date().toISOString() });
  }
  writeReport(task);
  pruneTaskState();
  return taskView(task);
}

function persistedTaskView(id) {
  try {
    const report = JSON.parse(fs.readFileSync(path.join(HERE, 'reports', `${id}.json`), 'utf8'));
    if (report.id !== id) return null;
    return {
      task_id: id, state: report.state, summary: safeText(report.summary ?? '', 1_000),
      result: safeText(report.result ?? '', MAX_RESPONSE), error: safeText(report.error ?? '', 2_000),
      duration_ms: report.duration_ms ?? report.durationMs ?? null, started_at: report.startedAt ?? null,
      latency_ms: report.latency_ms ?? null, model: report.model ?? 'não detectado',
      effort: report.effort ?? 'não detectado', profile_origin: report.profile_origin ?? 'metadados JSONL/configuração efetiva indisponíveis',
      finished_at: report.finishedAt ?? null,
    };
  } catch { return null; }
}

function approvedTaskPrompt(originalPrompt) {
  return [
    'CodexBridge: aprovação humana local de uso único confirmada.',
    'Não é necessária uma segunda aprovação da própria CodexBridge.',
    'Esta aprovação não concede permissões adicionais ao sandbox configurado.',
    'Instrução original da tarefa:',
    originalPrompt,
  ].join('\n');
}

const tools = annotateTools([
  { name: 'public_page_open', description: 'Abre uma página pública HTTP/HTTPS em navegador isolado e retorna URL final, título e texto visível. Sem login, cliques ou alterações.', inputSchema: { type: 'object', properties: { url: { type: 'string', maxLength: 4_000 } }, required: ['url'], additionalProperties: false } },
  { name: 'public_page_read', description: 'Lê título e texto visível de uma URL pública HTTP/HTTPS em navegador isolado. Sem login, cliques ou alterações.', inputSchema: { type: 'object', properties: { url: { type: 'string', maxLength: 4_000 } }, required: ['url'], additionalProperties: false } },
  { name: 'codex_status', description: 'Mostra a disponibilidade e o estado local do Codex, sem executar tarefa.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'codex_run_readonly', description: 'Executa uma análise read-only. Informe project_directory nesta chamada quando não houver projeto padrão.', inputSchema: { type: 'object', properties: { instruction: { type: 'string', maxLength: MAX_PROMPT }, project_directory: { type: 'string' } }, required: ['instruction'], additionalProperties: false } },
  { name: 'codex_prepare_task', description: 'Prepara uma tarefa para aprovação local de uso único. Informe project_directory nesta chamada quando não houver projeto padrão.', inputSchema: { type: 'object', properties: { task: { type: 'string', maxLength: MAX_PROMPT }, project_directory: { type: 'string' } }, required: ['task'], additionalProperties: false } },
  { name: 'codex_execute_approved', description: 'Executa uma tarefa preparada apenas com sua frase de aprovação válida e de uso único.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, approval_phrase: { type: 'string' } }, required: ['task_id', 'approval_phrase'], additionalProperties: false } },
  { name: 'codex_task_result', description: 'Consulta um resultado local pelo identificador da tarefa.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'], additionalProperties: false } },
  { name: 'codex_cancel_task', description: 'Encerra a árvore de processos de uma execução Codex ativa.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'], additionalProperties: false } },
  { name: 'hermes_environment_check', description: 'Verifica Hermes CLI, versao, dependencias, projeto autorizado e disponibilidade do executor. Nao cria processos.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
]);

async function callTool(name, args = {}, dependencies = {}) {
  pruneTaskState();
  const toolReceivedAt = dependencies.toolReceivedAt ?? performance.now();
  const readPolicy = dependencies.projectPolicySnapshot ?? projectPolicySnapshot;
  if (name === 'public_page_open' || name === 'public_page_read') {
    if (typeof args.url !== 'string' || !args.url.trim() || args.url.length > 4_000) throw new Error('Informe uma URL válida de até 4000 caracteres.');
    return await (dependencies.openPublicPage ?? openPublicPage)({ url: args.url.trim(), includeContent: name === 'public_page_read' });
  }
  if (name === 'codex_status') {
    let version = 'unavailable'; let authenticated = false; let authError = '';
    const projectConfigured = Boolean(AUTHORIZED_PROJECT && fs.existsSync(AUTHORIZED_PROJECT));
    const projectError = projectConfigured ? null : (AUTHORIZED_PROJECT ? 'Configured project path does not exist.' : 'No project selected; choose one before file tasks.');
    try {
      if (fs.existsSync(CODEX_JS)) {
        const v = spawn(process.execPath, [CODEX_JS, '--version'], { windowsHide: true, shell: false });
        version = await new Promise((resolve) => { let out = ''; v.stdout.on('data', d => out += d); v.on('close', c => resolve(c === 0 ? safeText(out.trim(), 100) : 'unavailable')); v.on('error', () => resolve('unavailable')); });
        const a = spawn(process.execPath, [CODEX_JS, 'login', 'status'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        authenticated = await new Promise((resolve) => { let out = ''; a.stdout.on('data', d => out += d); a.stderr.on('data', d => out += d); a.on('close', c => resolve(c === 0 && /logged in/i.test(out))); a.on('error', () => resolve(false)); });
      }
    } catch (e) { authError = safeText(e.message, 500); }
    return { bridge: 'available', codex_cli: fs.existsSync(CODEX_JS), version, authenticated, project_configured: projectConfigured, project_directory: projectConfigured ? AUTHORIZED_PROJECT : null, project_error: projectError, execution_state: active.size || fs.existsSync(LOCK_PATH) ? 'running' : 'idle', sandbox: 'read-only for analysis; workspace-write only after one-use approval', error: authError };
  }  if (name === 'codex_run_readonly') {
    const prompt = validatePrompt(args.instruction); const project = canonicalProject(args.project_directory ?? AUTHORIZED_PROJECT);
    if (active.size) throw new Error('Já existe execução ativa neste projeto.');
    const id = crypto.randomUUID(); const stat = fs.statSync(project); const identity = { realpath: project, dev: stat.dev, ino: stat.ino }; const task = { id, kind: 'readonly', executor: 'codex', prompt, summary: prompt, project_directory: project, project_identity: identity, state: 'queued' };
    task.routing_snapshot = dependencies.routingSnapshot;
    tasks.set(id, task); task.toolReceivedAt = toolReceivedAt; return await execute(task, 'readonly', (p, mode, taskId, timeout, script, routing, projectPath, identity, received) => (dependencies.runCodex ?? runCodex)(p, mode, taskId, timeout, script, task.routing_snapshot, project, undefined, received));
  }
  if (name === 'codex_prepare_task') {
    const prompt = validatePrompt(args.task); const project = canonicalProject(args.project_directory ?? AUTHORIZED_PROJECT); const stat = fs.statSync(project); const identity = { realpath: project, dev: stat.dev, ino: stat.ino };
    if (active.size) throw new Error('Já existe execução ativa neste projeto.');
    if (hasDestructiveIntent(prompt)) throw new Error('Tarefa com intenção potencialmente destrutiva rejeitada.');
    assertTaskCapacity();
    const id = crypto.randomUUID();
    const phrase = `APROVAR ${id} ${crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`;
    const configuredPolicy = readPolicy(project);
    const policy = configuredPolicy && configuredPolicy.identity?.realpath?.toLowerCase() === identity.realpath.toLowerCase() && String(configuredPolicy.identity.dev) === String(identity.dev) && String(configuredPolicy.identity.ino) === String(identity.ino) ? configuredPolicy : null;
    const task = { id, kind: 'write', prompt, summary: prompt, state: 'prepared', expiresAt: Date.now() + APPROVAL_TTL_MS, executor: 'codex', scope: 'pasta selecionada nesta tarefa; sandbox workspace-write do Codex', project_directory: project, project_identity: identity, policy_revision: policy?.revision ?? null, project_identity_policy: policy?.identity ?? null, project_id: policy?.project_id ?? null, decision_basis: policy?.level === 'project_auto' && policy ? 'project_policy' : 'local_task_approval' };
    tasks.set(id, task); approvals.set(id, { phrase, expiresAt: task.expiresAt, used: false, auto: task.decision_basis === 'project_policy' });
    fs.mkdirSync(APPROVAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(APPROVAL_DIR, id + '.pending.json'), JSON.stringify({ task_id: id, project_directory: project, project_identity: identity, summary: safeText(prompt, 1_000), phrase, expiresAt: task.expiresAt, project_id: task.project_id, policy_revision: task.policy_revision, decision_basis: task.decision_basis, executor: task.executor, scope: task.scope }), { mode: 0o600 });
    return { task_id: id, state: 'prepared', project_directory: project, project_identity: identity, summary: safeText(prompt, 1_000), approval_phrase: phrase, expires_in_seconds: APPROVAL_TTL_MS / 1000, approval: task.decision_basis === 'project_policy' ? 'auto_approved_by_project_policy' : 'awaiting_local_approval', decision_basis: task.decision_basis, policy_revision: task.policy_revision, executed: false };
  }
  if (name === 'codex_execute_approved') {
    const task = tasks.get(args.task_id); const approval = approvals.get(args.task_id);
    if (task?.state === 'expired') throw new Error('Aprovação vencida.');
    if (!task || task.kind !== 'write' || task.state !== 'prepared' || !approval) throw new Error('Tarefa não preparada ou aprovação inexistente.');
    if (approval.used) throw new Error('Aprovação já utilizada.');
    if (Date.now() > approval.expiresAt) { approvals.delete(args.task_id); task.state = 'expired'; throw new Error('Aprovação vencida.'); }
    const currentStat = (() => { try { return fs.statSync(fs.realpathSync.native(task.project_directory)); } catch { return null; } })();
    const currentRealpath = (() => { try { return fs.realpathSync.native(task.project_directory); } catch { return ''; } })();
    if (!currentStat || currentRealpath.toLowerCase() !== task.project_identity.realpath.toLowerCase() || String(currentStat.dev) !== String(task.project_identity.dev) || String(currentStat.ino) !== String(task.project_identity.ino)) { approvals.delete(args.task_id); task.state = 'rejected'; throw new Error('A identidade da pasta mudou desde o preparo. Prepare nova tarefa.'); }
    const executionPolicy = task.project_id ? readPolicy(task.project_directory) : null;
    if (task.project_id && (!executionPolicy || executionPolicy.revision !== task.policy_revision || executionPolicy.project_id !== task.project_id
      || executionPolicy.identity.realpath.toLowerCase() !== task.project_identity.realpath.toLowerCase()
      || String(executionPolicy.identity.dev) !== String(task.project_identity.dev) || String(executionPolicy.identity.ino) !== String(task.project_identity.ino)
      || (task.decision_basis === 'project_policy' && executionPolicy.level !== 'project_auto')
      || (task.decision_basis === 'local_task_approval' && executionPolicy.level === 'project_auto'))) { approvals.delete(args.task_id); task.state = 'rejected'; throw new Error('Política ou identidade do projeto mudou desde o preparo. Prepare nova tarefa.'); }
    if (task.decision_basis === 'project_policy') {
      const current = executionPolicy;
      if (!current || current.level !== 'project_auto' || current.revision !== task.policy_revision || current.project_id !== task.project_id
        || current.identity.realpath.toLowerCase() !== task.project_identity.realpath.toLowerCase() || String(current.identity.dev) !== String(task.project_identity.dev) || String(current.identity.ino) !== String(task.project_identity.ino)) {
        approvals.delete(args.task_id); task.state = 'rejected'; throw new Error('Política automática revogada, desatualizada ou identidade alterada. Prepare nova tarefa.');
      }
    }
    if (typeof args.approval_phrase !== 'string') throw new Error('Aprovação explícita inválida.');
    const supplied = Buffer.from(args.approval_phrase); const expected = Buffer.from(approval.phrase);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new Error('Aprovação explícita inválida.');
    const proofPath = path.join(APPROVAL_DIR, task.id + '.approved.json');
    let proof; try { proof = JSON.parse(fs.readFileSync(proofPath, 'utf8')); } catch { if (!approval.auto) throw new Error('Aprovação local explícita ausente; confirme primeiro no PowerShell.'); }
    const phraseDigest = crypto.createHash('sha256').update(approval.phrase).digest('hex');
    if (!approval.auto && (proof.phrase_digest !== phraseDigest || proof.expiresAt < Date.now())) throw new Error('Comprovante local inválido ou vencido.');
    if (active.size) throw new Error('Já existe execução ativa neste projeto.');
    approval.used = true; approvals.delete(args.task_id);
    task.toolReceivedAt = toolReceivedAt;
    try { fs.unlinkSync(proofPath); } catch {}
    try { fs.unlinkSync(path.join(APPROVAL_DIR, task.id + '.pending.json')); } catch {}
    const originalPrompt = task.prompt;
    task.prompt = approvedTaskPrompt(originalPrompt);
    try {
      const runner = dependencies.runCodex ?? runCodex;
    return await execute(task, 'write', (prompt, mode, id, timeout, script, routing, projectPath, identity, received) => runner(prompt, mode, id, timeout, script, task.routing_snapshot, task.project_directory, task.project_identity, received));
    }
    finally { task.prompt = originalPrompt; }
  }
  if (name === 'codex_task_result') {
    const task = tasks.get(args.task_id); if (task) return taskView(task);
    const stored = persistedTaskView(args.task_id); if (stored) return stored;
    throw new Error('Tarefa não encontrada nesta sessão ou no histórico persistido.');
  }
  if (name === 'codex_cancel_task') {
    const child = active.get(args.task_id); if (!child) throw new Error('Nenhuma execução ativa com esse identificador.');
    cancelledTasks.add(args.task_id); terminateTree(child); const task = tasks.get(args.task_id); if (task) task.state = 'cancelled';
    return { task_id: args.task_id, state: 'cancelling' };
  }
  throw new Error('Ferramenta desconhecida.');
}

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
async function handle(message) {
  if (message.method === 'initialize') return { jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'codexbridge', version: runtimeInfo.version } } };
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
  if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
  if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools } };
  if (message.method === 'tools/call') {
    const { name, arguments: args } = message.params ?? {};
    try {
      const data = await callTool(name, args ?? {}, { toolReceivedAt: performance.now() });
      return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: safeText(JSON.stringify(data), MAX_RESPONSE) }], structuredContent: data, isError: false } };
    } catch (e) {
      const error = safeText(e.message, 1_000);
      return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: error }], isError: true } };
    }
  }
  if (message.id !== undefined) return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    if (buffer.length > 2_000_000) { process.exitCode = 1; process.stdin.destroy(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (!line) continue;
      try { const response = await handle(JSON.parse(line)); if (response) send(response); }
      catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC request' } }); }
    }
  });
}

export { APPROVAL_TTL_MS, AUTHORIZED_PROJECT, CODEX_JS, MAX_PROMPT, MAX_RESPONSE, MAX_PENDING_TASKS, MAX_RETAINED_TERMINAL_TASKS, LOCK_PATH, active, approvals, assertTaskCapacity, canonicalProject, callTool, configuredProfile, extractFinal, extractProfile, handle, hasDestructiveIntent, projectPolicySnapshot, pruneTaskState, runCodex, safeText, tasks, tools, validatePrompt };









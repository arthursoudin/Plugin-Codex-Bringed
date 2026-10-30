import fs from 'node:fs';
import path from 'node:path';

const EXECUTORS = new Set(['codex', 'hermes']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];
const MODEL_TIERS = new Map([
  ['gpt-6-luna', 0], ['gpt-6.1-terra', 1],
  ['gpt-6-sol', 2], ['gpt-6.1-sol', 2], ['gpt-6-astra', 3],
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/;

function identifier(value, label, optional = false) {
  if ((value === '' || value == null) && optional) return '';
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${label} inválido.`);
  return value;
}

export function validateRoutingPreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Preferências de roteamento inválidas.');
  const enabled = input.enabled;
  if (!Array.isArray(enabled) || enabled.some(x => !EXECUTORS.has(x)) || new Set(enabled).size !== enabled.length) throw new Error('Selecione executores válidos sem duplicatas.');
  if (!enabled.length) throw new Error('Ative pelo menos um executor.');
  const primary = input.primary;
  const complex = input.complex;
  if (!enabled.includes(primary) || !enabled.includes(complex)) throw new Error('As rotas simples e complexas devem usar executores ativados.');
  const executors = {};
  for (const name of enabled) {
    const value = input.executors?.[name];
    if (!value || typeof value !== 'object') throw new Error(`Configuração ausente para ${name}.`);
    const effort = value.effort;
    if (name === 'codex' && !EFFORTS.has(effort)) throw new Error('Esforço Codex inválido.');
    if (name === 'hermes' && effort && !EFFORTS.has(effort)) throw new Error('Esforço Hermes inválido.');
    executors[name] = Object.freeze({
      model: identifier(value.model, `Modelo ${name}`),
      ...(value.provider ? { provider: identifier(value.provider, `Provider ${name}`) } : {}),
      ...(effort ? { effort } : {}),
    });
  }
  const fallback = input.fallback ?? [];
  if (!Array.isArray(fallback) || fallback.some(x => !enabled.includes(x)) || new Set(fallback).size !== fallback.length) {
    throw new Error('Fallback deve listar executores ativados sem duplicatas.');
  }
  return Object.freeze({ active: input.active !== false, enabled: Object.freeze([...enabled]), primary, complex, executors: Object.freeze(executors), fallback: Object.freeze([...fallback]) });
}

export function createRoutingSnapshot(preferences, taskClass) {
  const config = validateRoutingPreferences(preferences);
  if (!['simple', 'complex'].includes(taskClass)) throw new Error('Classe da tarefa deve ser simple ou complex.');
  const executor = taskClass === 'complex' ? config.complex : config.primary;
  return Object.freeze({ task_class: taskClass, executor, ...config.executors[executor], routing_reason: `Rota ${taskClass} configurada pelo usuário.` });
}

export function validateSessionModelPolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Política de sessão inválida.');
  const floor = input.floor_model || 'gpt-6-luna';
  const ceiling = input.max_model;
  if (!MODEL_TIERS.has(floor) || !MODEL_TIERS.has(ceiling) || MODEL_TIERS.get(floor) > MODEL_TIERS.get(ceiling)) throw new Error('Escolha modelos conhecidos em ordem crescente entre mínimo e máximo.');
  if (!EFFORTS.has(input.max_effort)) throw new Error('Esforço máximo inválido.');
  return Object.freeze({ floor_model: floor, max_model: ceiling, max_effort: input.max_effort });
}

export function evaluateCodexTask(preferences, task, taskClass, floorModel = null) {
  const config = validateRoutingPreferences(preferences);
  if (!config.active || !config.enabled.includes('codex')) throw new Error('Ative o Codex no roteamento antes de avaliar o modelo.');
  if (typeof task !== 'string' || !task.trim() || task.length > 12_000) throw new Error('Tarefa inválida (1 a 12000 caracteres).');
  if (taskClass != null && !['simple', 'complex'].includes(taskClass)) throw new Error('Classe da tarefa inválida.');
  const prompt = task.trim();
  const deep = /\b(arquitetura|architecture|migra(?:ção|r|te|tion)|segurança|security|concorrência|concurrency)\b/i.test(prompt);
  const complex = /\b(refator(?:ar|ação|ing)|integração|integration|redesenhar|redesign|otimizar|optimize)\b/i.test(prompt);
  const broad = /\b(múltiplos arquivos|vários arquivos|multiple files|across files|todo o projeto|entire project|renomear em todo|rename across)\b/i.test(prompt);
  const investigation = /\b(investig(?:ar|ação|ate)|diagnostic(?:ar|o)?|diagnóstico|bug intermitente|intermittent bug|causa raiz|root cause)\b/i.test(prompt);
  const scoped = /\b(valida(?:ção|r|te)|formulário|form|função|function|teste unitário|unit test|tratamento de erro|error handling)\b/i.test(prompt);
  const visual = /\b(botão|button|cor|color|texto|text|rótulo|label|typo|ícone|icon|css|espaçamento|spacing)\b/i.test(prompt);
  const band = deep && broad ? 'critical' : deep ? 'deep' : complex || taskClass === 'complex' ? 'complex' : broad ? 'broad'
    : investigation ? 'investigation' : scoped ? 'scoped' : visual && prompt.length < 500 ? 'simple' : 'scoped';
  const recommendation = {
    simple: { tier: 0, effort: 'low' },
    scoped: { tier: 0, effort: 'medium' },
    investigation: { tier: 0, effort: 'high' },
    broad: { tier: 2, effort: 'low' },
    complex: { tier: 2, effort: 'medium' },
    deep: { tier: 3, effort: 'xhigh' },
    critical: { tier: 3, effort: 'max' },
  }[band];
  const master = config.executors.codex;
  const masterTier = MODEL_TIERS.get(master.model);
  const desiredTier = recommendation.tier;
  let model = masterTier == null ? master.model : desiredTier >= masterTier ? master.model
    : desiredTier === 0 ? 'gpt-6-luna' : 'gpt-6.1-sol';
  if (floorModel) {
    if (!MODEL_TIERS.has(floorModel) || masterTier == null || MODEL_TIERS.get(floorModel) > masterTier) throw new Error('Modelo mínimo fora do teto da sessão.');
    if (MODEL_TIERS.get(model) < MODEL_TIERS.get(floorModel)) model = floorModel;
  }
  const desiredEffort = masterTier != null && desiredTier > masterTier && band !== 'simple'
    ? EFFORT_ORDER[Math.max(EFFORT_ORDER.indexOf(recommendation.effort), EFFORT_ORDER.indexOf('medium'))]
    : recommendation.effort;
  const effort = EFFORT_ORDER[Math.min(EFFORT_ORDER.indexOf(master.effort), EFFORT_ORDER.indexOf(desiredEffort))];
  return Object.freeze({
    executor: 'codex', model, effort, configured: true, model_evaluator: true,
    task_band: band, task_class: ['broad', 'complex', 'deep', 'critical'].includes(band) ? 'complex' : 'simple',
    master_model: master.model, max_effort: master.effort,
    change_summary: prompt.slice(0, 300),
    routing_reason: `Avaliação local por palavras-chave: ${band}; modelo e esforço limitados ao teto configurado. Revise antes de aprovar.`,
  });
}

export function assertCodexWithinCap(snapshot, preferences) {
  if (!snapshot || snapshot.executor !== 'codex' || snapshot.model_evaluator !== true) throw new Error('Avaliação Codex ausente. Prepare novamente a tarefa.');
  const config = validateRoutingPreferences(preferences);
  if (!config.active || !config.enabled.includes('codex')) throw new Error('O teto Codex foi desativado. Prepare novamente a tarefa.');
  const master = config.executors.codex;
  const masterTier = MODEL_TIERS.get(master.model);
  const selectedTier = MODEL_TIERS.get(snapshot.model);
  if (snapshot.model !== master.model && (masterTier == null || selectedTier == null || selectedTier > masterTier)) throw new Error('Modelo acima ou fora do teto Codex atual. Prepare novamente a tarefa.');
  if (!EFFORTS.has(snapshot.effort) || EFFORT_ORDER.indexOf(snapshot.effort) > EFFORT_ORDER.indexOf(master.effort)) throw new Error('Esforço acima do teto Codex atual. Prepare novamente a tarefa.');
  return true;
}

export function buildExecutorArgv(snapshot, prompt) {
  if (!snapshot || !EXECUTORS.has(snapshot.executor) || typeof prompt !== 'string' || !prompt.trim()) throw new Error('Snapshot ou instrução inválidos.');
  const model = identifier(snapshot.model, 'Modelo');
  if (snapshot.executor === 'codex') {
    if (!EFFORTS.has(snapshot.effort)) throw new Error('Esforço Codex inválido.');
    return Object.freeze(['exec', '--model', model, '-c', `model_reasoning_effort=${snapshot.effort}`, prompt]);
  }
  const args = [];
  if (snapshot.provider) args.push('--provider', identifier(snapshot.provider, 'Provider'));
  args.push('--model', model);
  if (snapshot.effort) args.push('--reasoning', snapshot.effort);
  args.push('-z', prompt);
  return Object.freeze(args);
}

export function selectPreExecutionFallback(snapshot, preferences, failurePhase) {
  if (failurePhase !== 'before_start') return null;
  const config = validateRoutingPreferences(preferences);
  const next = config.fallback.find(name => name !== snapshot.executor);
  return next ? Object.freeze({ ...createRoutingSnapshot(config, snapshot.task_class), executor: next, ...config.executors[next], routing_reason: `Fallback configurado após falha antes do início de ${snapshot.executor}.` }) : null;
}

export function loadRoutingSettings(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const routing = validateRoutingPreferences(value.routing);
    return { revision: Number.isInteger(value.routing_revision) ? value.routing_revision : 1, routing };
  } catch { return null; }
}
export function saveRoutingSettings(file, routing) {
  const validated = validateRoutingPreferences(routing);
  let prior = {};
  try { prior = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const revision = (Number.isInteger(prior.routing_revision) ? prior.routing_revision : 0) + 1;
  fs.writeFileSync(file, JSON.stringify({ ...prior, routing: validated, routing_revision: revision }, null, 2), { mode: 0o600 });
  return { routing: validated, revision };
}

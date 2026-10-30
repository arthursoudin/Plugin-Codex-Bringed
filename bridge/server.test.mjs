import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const previousEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  testStateDir: process.env.CODEXBRIDGE_TEST_STATE_DIR,
  project: process.env.CODEXBRIDGE_PROJECT,
};
const testStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-state-'));
const testProject = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-project-'));
process.env.NODE_ENV = 'test';
process.env.CODEXBRIDGE_TEST_STATE_DIR = testStateDir;
process.env.CODEXBRIDGE_PROJECT = testProject;
const generated = new Set();
after(() => {
  try { fs.rmSync(testStateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  finally {
    fs.rmSync(testProject, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    for (const [key, value] of [['NODE_ENV', previousEnvironment.nodeEnv], ['CODEXBRIDGE_TEST_STATE_DIR', previousEnvironment.testStateDir], ['CODEXBRIDGE_PROJECT', previousEnvironment.project]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
const { active, approvals, assertTaskCapacity, AUTHORIZED_PROJECT, callTool, canonicalProject, configuredProfile, extractProfile, handle, LOCK_PATH, MAX_PENDING_TASKS, MAX_RETAINED_TERMINAL_TASKS, pruneTaskState, runCodex, safeText, tasks, tools, validatePrompt } = await import('./server.mjs');

const HERE = testStateDir;
const fixture = path.join(HERE, '.fake-codex.mjs');
const approvalDir = path.join(HERE, 'approvals');
const reportDir = path.join(HERE, 'reports');
fs.writeFileSync(fixture, `
const mode=process.argv.at(-1);
if(mode==='FAKE_FAIL'){console.error('Bearer abcdefghijklmnop');process.exit(7)}
if(mode==='FAKE_SLEEP'){setInterval(()=>{},1000)}
const text=mode==='FAKE_CAPTURE_ARGS'?JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}):'fake success';
process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}})+'\\n');
`);
test('MCP discovery exposes the expected tools', async () => {
  const response = await handle({ jsonrpc:'2.0', id:1, method:'tools/list' });
  assert.deepEqual(response.result.tools.map(t => t.name), tools.map(t => t.name));
  assert.ok(response.result.tools.some(t => t.name === 'codex_status'));
  for (const tool of response.result.tools) {
    assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${tool.name} readOnlyHint`);
    assert.equal(typeof tool.annotations?.openWorldHint, 'boolean', `${tool.name} openWorldHint`);
    assert.equal(typeof tool.annotations?.destructiveHint, 'boolean', `${tool.name} destructiveHint`);
  }
});

test('runtime task cache expires abandoned approvals and bounds terminal entries', () => {
  const previousTasks = [...tasks];
  const previousApprovals = [...approvals];
  try {
    tasks.clear(); approvals.clear();
    const terminalIds = [];
    for (let index = 0; index < MAX_RETAINED_TERMINAL_TASKS + 5; index++) {
      const id = crypto.randomUUID(); terminalIds.push(id);
      tasks.set(id, { id, state: 'completed', prompt: `task ${index}` });
    }
    pruneTaskState();
    assert.equal([...tasks.values()].filter(task => task.state === 'completed').length, MAX_RETAINED_TERMINAL_TASKS);
    assert.equal(tasks.has(terminalIds[0]), false);
    assert.equal(tasks.has(terminalIds.at(-1)), true);

    const activeId = crypto.randomUUID(); tasks.set(activeId, { id: activeId, state: 'running' });
    const expiredId = crypto.randomUUID();
    tasks.set(expiredId, { id: expiredId, state: 'prepared', expiresAt: Date.now() - 1 });
    approvals.set(expiredId, { expiresAt: Date.now() - 1, used: false });

    pruneTaskState();

    assert.equal([...tasks.values()].filter(task => ['completed', 'expired'].includes(task.state)).length, MAX_RETAINED_TERMINAL_TASKS);
    assert.equal(tasks.has(activeId), true);
    assert.equal(tasks.get(expiredId).state, 'expired');
    assert.equal(approvals.has(expiredId), false);

    for (let index = 0; index < MAX_PENDING_TASKS; index++) {
      const id = crypto.randomUUID(); tasks.set(id, { id, state: 'prepared', expiresAt: Date.now() + 60_000 });
    }
    assert.throws(() => assertTaskCapacity(), /Limite de 50 tarefas pendentes/);
  } finally {
    tasks.clear(); approvals.clear();
    for (const [id, task] of previousTasks) tasks.set(id, task);
    for (const [id, approval] of previousApprovals) approvals.set(id, approval);
  }
});

test('codex_task_result reads a persisted report after its runtime entry is gone', async () => {
  const id = crypto.randomUUID(); generated.add(id);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, `${id}.json`), JSON.stringify({ id, state: 'completed', summary: 'saved summary', result: 'saved result', finishedAt: new Date().toISOString() }));
  const result = await callTool('codex_task_result', { task_id: id });
  assert.equal(result.task_id, id);
  assert.equal(result.result, 'saved result');
});

test('project path is canonical, accepts an explicit existing folder, and rejects traversal', async () => {
  assert.equal(canonicalProject(), fs.realpathSync.native(testProject));
  assert.equal(canonicalProject(HERE), fs.realpathSync.native(HERE));
  const traversalPath = path.join(os.homedir(),'Desktop','CodexBridge') + '\\..\\Jarvis';
  assert.throws(() => canonicalProject(traversalPath), /traversal/i);
  const prepared = await callTool('codex_prepare_task',{task:'Inspect source',project_directory:HERE});
  generated.add(prepared.task_id);
  assert.equal(prepared.project_directory, fs.realpathSync.native(HERE));
});

test('an explicit task keeps its approved folder identity and rejects a changed path', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-identity-'));
  const selected = path.join(parent, 'selected'); fs.mkdirSync(selected);
  const prepared = await callTool('codex_prepare_task', { task: 'Inspect selected folder', project_directory: selected }); generated.add(prepared.task_id);
  const moved = path.join(parent, 'moved'); fs.renameSync(selected, moved);
  try {
    await assert.rejects(callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase }), /identidade da pasta mudou/i);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('no default project requires an explicit existing directory', () => {
  assert.throws(() => canonicalProject(''), /Informe explicitamente/i);
  assert.equal(canonicalProject(HERE), fs.realpathSync.native(HERE));
});

test('readonly, prepare and approved execution retain the explicitly selected canonical path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-selected-'));
  const selected = path.join(root, 'selected'); fs.mkdirSync(selected);
  const canonical = fs.realpathSync.native(selected);
  let readonlyArgs;
  try {
    const readonly = await callTool('codex_run_readonly', { instruction: 'Inspect selected project', project_directory: selected }, {
      runCodex: async (...args) => { readonlyArgs = args; return { state: 'completed', result: 'ok', error: '', durationMs: 1 }; },
    });
    assert.equal(readonly.state, 'completed');
    assert.equal(readonlyArgs[6], canonical);
    const prepared = await callTool('codex_prepare_task', { task: 'Update selected project', project_directory: selected }); generated.add(prepared.task_id);
    assert.equal(prepared.project_directory, canonical);
    assert.deepEqual(prepared.project_identity, { realpath: canonical, dev: fs.statSync(canonical).dev, ino: fs.statSync(canonical).ino });
    const pendingPath = path.join(approvalDir, `${prepared.task_id}.pending.json`);
    assert.equal(JSON.parse(fs.readFileSync(pendingPath, 'utf8')).project_directory, canonical);
    const proofPath = path.join(approvalDir, `${prepared.task_id}.approved.json`);
    const digest = (await import('node:crypto')).default.createHash('sha256').update(prepared.approval_phrase).digest('hex');
    fs.writeFileSync(proofPath, JSON.stringify({ task_id: prepared.task_id, phrase_digest: digest, expiresAt: Date.now() + 60_000 }));
    let writeArgs;
    const result = await callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase }, {
      runCodex: async (...args) => { writeArgs = args; return { state: 'completed', result: 'ok', error: '', durationMs: 1 }; },
    });
    assert.equal(result.state, 'completed');
    assert.equal(writeArgs[6], canonical);
    assert.deepEqual(writeArgs[7], prepared.project_identity);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('prompt size and secret filtering are bounded', () => {
  assert.throws(() => validatePrompt('x'.repeat(12_001)), /excede/);
  assert.match(safeText('Bearer abcdefghijklmnop sk-1234567890abcdef api_key=secretvalue'), /REDACTED/);
  assert.ok(safeText('x'.repeat(20_000)).length <= 8_000);
});

test('profile extraction accepts supported events and reads only the selected Codex config profile', () => {
  assert.deepEqual(extractProfile([
    JSON.stringify({ type: 'thread.started', payload: { model: 'wrong' } }),
    JSON.stringify({ type: 'turn_context_updated', payload: { model: 'gpt-observed', effort: 'high' } }),
  ].join('\n')), { model: 'gpt-observed', effort: 'high', origin: 'metadados JSONL (turn_context_updated)' });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-config-'));
  try {
    fs.writeFileSync(path.join(home, 'config.toml'), `model = "gpt-default"\nmodel_reasoning_effort = "low"\nactive_profile = "work"\napi_key = "must-not-escape"\n[profiles.work]\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "medium"\n`);
    assert.deepEqual(configuredProfile(home), { model: 'gpt-6-luna', effort: 'medium', origin: 'configurado (config.toml; não observado no JSONL)' });
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
test('task execution is denied without explicit approval', async () => {
  await assert.rejects(callTool('codex_execute_approved',{task_id:'not-prepared',approval_phrase:'yes'}), /não preparada|aprovação inexistente/i);
});

test('an incorrect approval phrase is rejected', async () => {
  const prepared = await callTool('codex_prepare_task',{task:'Inspect a harmless source file'}); generated.add(prepared.task_id);
  await assert.rejects(callTool('codex_execute_approved',{task_id:prepared.task_id,approval_phrase:'wrong phrase'}), /aprovação explícita inválida/i);
  assert.equal(tasks.get(prepared.task_id).state,'prepared');
});

test('a correct MCP phrase still requires local interactive proof', async () => {
  const prepared = await callTool('codex_prepare_task',{task:'Inspect a third harmless source file'}); generated.add(prepared.task_id);
  await assert.rejects(callTool('codex_execute_approved',{task_id:prepared.task_id,approval_phrase:prepared.approval_phrase}), /aprovação local explícita ausente/i);
});

test('expired and replayed approval records are rejected', async () => {
  const expired = await callTool('codex_prepare_task',{task:'Inspect a harmless source file'}); generated.add(expired.task_id);
  approvals.get(expired.task_id).expiresAt = Date.now() - 1;
  await assert.rejects(callTool('codex_execute_approved',{task_id:expired.task_id,approval_phrase:expired.approval_phrase}), /vencida/i);
  assert.equal(tasks.get(expired.task_id).state,'expired');
  const replay = await callTool('codex_prepare_task',{task:'Inspect another harmless source file'}); generated.add(replay.task_id);
  approvals.get(replay.task_id).used = true;
  await assert.rejects(callTool('codex_execute_approved',{task_id:replay.task_id,approval_phrase:replay.approval_phrase}), /já utilizada/i);
});

test('a valid local approval adds bounded authorization context and is consumed once', async () => {
  const prepared = await callTool('codex_prepare_task',{task:'Create a harmless test fixture'}); generated.add(prepared.task_id);
  const proofPath = path.join(approvalDir, prepared.task_id + '.approved.json');
  const phraseDigest = (await import('node:crypto')).default.createHash('sha256').update(prepared.approval_phrase).digest('hex');
  fs.writeFileSync(proofPath,JSON.stringify({task_id:prepared.task_id,phrase_digest:phraseDigest,expiresAt:Date.now()+60_000}));
  let captured;
  const result = await callTool('codex_execute_approved',{task_id:prepared.task_id,approval_phrase:prepared.approval_phrase},{runCodex:async (prompt,mode,id) => {
    captured={prompt,mode,id};
    return {state:'completed',result:'injected runner success',error:'',durationMs:1,startedAt:new Date().toISOString()};
  }});
  assert.equal(result.state,'completed');
  assert.equal(captured.mode,'write'); assert.equal(captured.id,prepared.task_id);
  assert.match(captured.prompt,/aprovação humana local de uso único/i);
  assert.match(captured.prompt,/Não é necessária uma segunda aprovação da própria CodexBridge/i);
  assert.match(captured.prompt,/não concede permissões adicionais/i);
  assert.match(captured.prompt,/Instrução original da tarefa:\nCreate a harmless test fixture/);
  assert.equal(fs.existsSync(proofPath),false);
  await assert.rejects(callTool('codex_execute_approved',{task_id:prepared.task_id,approval_phrase:prepared.approval_phrase}), /não preparada|aprovação inexistente/i);
});

test('a routed Codex task passes only its approved snapshot to the existing executor', async () => {
  const prepared = await callTool('codex_prepare_task', { task: 'Update a harmless routed fixture' }); generated.add(prepared.task_id);
  const snapshot = Object.freeze({ executor: 'codex', model: 'gpt-6.1-sol', effort: 'xhigh', configured: true });
  tasks.get(prepared.task_id).routing_snapshot = snapshot;
  const proofPath = path.join(approvalDir, prepared.task_id + '.approved.json');
  const phraseDigest = (await import('node:crypto')).default.createHash('sha256').update(prepared.approval_phrase).digest('hex');
  fs.writeFileSync(proofPath, JSON.stringify({ task_id: prepared.task_id, phrase_digest: phraseDigest, expiresAt: Date.now() + 60_000 }));
  let captured;
  const result = await callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase, model: 'caller/model', effort: 'low' }, {
    runCodex: async (...args) => { captured = args; return { state: 'completed', result: '', error: '', durationMs: 1 }; },
  });
  assert.equal(result.state, 'completed');
  assert.equal(captured[5], snapshot);
  assert.equal(tasks.get(prepared.task_id).state, 'completed');
});

test('readonly Codex execution also receives the evaluated model and effort', async () => {
  const id = 'readonly-model-cap'; generated.add(id);
  const result = await runCodex('FAKE_CAPTURE_ARGS', 'readonly', id, 5_000, fixture,
    { executor: 'codex', configured: true, model: 'gpt-6-luna', effort: 'low' });
  assert.equal(result.state, 'completed');
  const captured = JSON.parse(result.result);
  assert.ok(captured.args.includes('gpt-6-luna'));
  assert.ok(captured.args.includes('model_reasoning_effort=low'));
  assert.ok(captured.args.includes('read-only'));
});

function autoPolicy(overrides = {}) {
  return { project_id: 'fixture-project', level: 'project_auto', revision: 4,
    identity: { realpath: fs.realpathSync.native(testProject), dev: fs.statSync(testProject).dev, ino: fs.statSync(testProject).ino }, ...overrides };
}
const fakeRunner = async () => ({ state: 'completed', result: 'fixture runner success', error: '', durationMs: 1, startedAt: new Date().toISOString() });

test('project-auto policy approves a Codex task, then permits one explicit execution', async () => {
  const policy = autoPolicy();
  const dependencies = { projectPolicySnapshot: project => project && fs.realpathSync.native(project).toLowerCase() === policy.identity.realpath.toLowerCase() ? policy : null, runCodex: fakeRunner };
  const prepared = await callTool('codex_prepare_task', { task: 'Update a harmless fixture' }, dependencies); generated.add(prepared.task_id);
  assert.equal(prepared.approval, 'auto_approved_by_project_policy');
  assert.equal(prepared.executed, false);
  const result = await callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase }, dependencies);
  assert.equal(result.state, 'completed');
  await assert.rejects(callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase }, dependencies), /não preparada|aprovação inexistente/i);
});

test('project-auto approval fails closed after policy revision, revocation, or identity change', async () => {
  for (const change of [
    policy => ({ ...policy, revision: policy.revision + 1 }),
    policy => ({ ...policy, level: 'manual', revision: policy.revision + 1 }),
    policy => ({ ...policy, identity: { ...policy.identity, ino: String(policy.identity.ino) + '-changed' } }),
  ]) {
    let policy = autoPolicy();
    const dependencies = { projectPolicySnapshot: project => project && fs.realpathSync.native(project).toLowerCase() === policy.identity.realpath.toLowerCase() ? policy : null, runCodex: fakeRunner };
    const prepared = await callTool('codex_prepare_task', { task: 'Update a harmless fixture' }, dependencies); generated.add(prepared.task_id);
    policy = change(policy);
    await assert.rejects(callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase }, dependencies), /política|identidade/i);
    assert.notEqual(tasks.get(prepared.task_id).state, 'completed');
  }
});

test('project-auto tasks expire and cannot replay', async () => {
  const policy = autoPolicy();
  const dependencies = { projectPolicySnapshot: project => project && fs.realpathSync.native(project).toLowerCase() === policy.identity.realpath.toLowerCase() ? policy : null, runCodex: fakeRunner };
  const expired = await callTool('codex_prepare_task', { task: 'Update an expired fixture' }, dependencies); generated.add(expired.task_id);
  approvals.get(expired.task_id).expiresAt = Date.now() - 1;
  await assert.rejects(callTool('codex_execute_approved', { task_id: expired.task_id, approval_phrase: expired.approval_phrase }, dependencies), /vencida/i);
  const replay = await callTool('codex_prepare_task', { task: 'Update a replay fixture' }, dependencies); generated.add(replay.task_id);
  const first = await callTool('codex_execute_approved', { task_id: replay.task_id, approval_phrase: replay.approval_phrase }, dependencies);
  assert.equal(first.state, 'completed');
  await assert.rejects(callTool('codex_execute_approved', { task_id: replay.task_id, approval_phrase: replay.approval_phrase }, dependencies), /não preparada|aprovação inexistente/i);
});

test('manual policy requires local proof and Hermes has no automatic execution route', async () => {
  const manual = { ...autoPolicy(), level: 'manual' };
  const dependencies = { projectPolicySnapshot: () => manual, runCodex: fakeRunner };
  const prepared = await callTool('codex_prepare_task', { task: 'Update a manual fixture' }, dependencies); generated.add(prepared.task_id);
  await assert.rejects(callTool('codex_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase }, dependencies), /aprovação local explícita ausente/i);
  assert.equal(tools.some(tool => /hermes.*execute|execute.*hermes/i.test(tool.name)), false);
});

test('parallel project work is rejected', async () => {
  active.set('busy',{pid:1});
  try { await assert.rejects(callTool('codex_prepare_task',{task:'Inspect source'}), /execução ativa/i); }
  finally { active.delete('busy'); }
});

test('fake Codex success and process failure are reported safely', async () => {
  const ok = await runCodex('FAKE_OK','readonly','fake-ok',5_000,fixture);
  assert.equal(ok.state,'completed'); assert.equal(ok.result,'fake success');
  const fail = await runCodex('FAKE_FAIL','readonly','fake-fail',5_000,fixture);
  assert.equal(fail.state,'failed'); assert.match(fail.error,/REDACTED/);
});

test('child Codex receives workspace, sandbox, and per-invocation MCP overrides only', async () => {
  const result = await runCodex('FAKE_CAPTURE_ARGS','write','fake-args',5_000,fixture);
  assert.equal(result.state,'completed');
  const captured=JSON.parse(result.result);
  const args=captured.args;
  assert.equal(captured.cwd,fs.realpathSync.native(AUTHORIZED_PROJECT));
  assert.equal(args[0],'exec');
  assert.equal(args[args.indexOf('--cd')+1],fs.realpathSync.native(AUTHORIZED_PROJECT));
  assert.equal(args[args.indexOf('--sandbox')+1],'workspace-write');
  assert.ok(args.includes('mcp_servers.node_repl.enabled=false'));
  assert.ok(args.includes('plugins."unified-computer-use@openai-bundled".enabled=false'));
  assert.equal(args.includes('--add-dir'),false);
  assert.equal(args.includes('--ignore-user-config'),false);
  assert.equal(args.some(arg=>arg.startsWith('--dangerously-')),false);
  assert.equal(tools.some(tool=>tool.name==='node_repl'||tool.name==='cua_repl'),false);
});

test('timeout and explicit cancellation terminate the subprocess', async () => {
  const timeout = await runCodex('FAKE_SLEEP','readonly','fake-timeout',150,fixture);
  assert.equal(timeout.state,'timeout');
  const pending = runCodex('FAKE_SLEEP','readonly','fake-cancel',5_000,fixture);
  for (let i=0;i<50 && !active.has('fake-cancel');i++) await new Promise(r=>setTimeout(r,20));
  assert.ok(active.has('fake-cancel'));
  const cancelled = await callTool('codex_cancel_task',{task_id:'fake-cancel'});
  assert.equal(cancelled.state,'cancelling');
  assert.equal((await pending).state,'cancelled');
});




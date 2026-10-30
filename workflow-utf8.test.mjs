import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWorkflow } from './workflow.mjs';

const invoke = (workflow, name, args = {}, originalHandle = () => ({ jsonrpc: '2.0', id: 1, result: { tools: [] } })) =>
  workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, originalHandle);

test('workflow e server permanecem UTF-8 válido e expõem comandos de roteamento', async () => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const file of ['workflow.mjs', 'server.mjs']) decoder.decode(fs.readFileSync(new URL(file, import.meta.url)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-utf8-'));
  try {
    const bridge = { LOCK_PATH: path.join(root, 'active.lock'), tasks: new Map(), approvals: new Map(), safeText: String, MAX_RESPONSE: 8000 };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: root });
    const listed = await workflow.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, () => ({ jsonrpc: '2.0', id: 2, result: { tools: [] } }));
    const names = listed.result.tools.map(tool => tool.name);
    assert.ok(names.includes('codex_route_prepare_task'));
    assert.ok(names.includes('codex_route_execute_approved'));
    const setup = (await invoke(workflow, 'codex_plugin_setup')).result.structuredContent;
    assert.match(setup.project_requirement.next_action, /não exige cadastro no dashboard/i);
    assert.match(setup.setup_steps.join(' '), /pasta existente em project_directory/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('hermes_prepare_task accepts explicit unregistered directory and retains identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-explicit-folder-'));
  const folder = path.join(root, 'task-folder'); fs.mkdirSync(folder);
  try {
    const bridge = { LOCK_PATH: path.join(root, 'active.lock'), tasks: new Map(), approvals: new Map(), safeText: String, MAX_RESPONSE: 8000 };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: root, enableHermesExecution: true, hermesRunner: async () => ({ state: 'completed', output: '' }) });
    const result = await invoke(workflow, 'hermes_prepare_task', { task: 'Inspect this folder', project_directory: folder });
    assert.equal(result.result.isError, false);
    const task = result.result.structuredContent;
    assert.equal(task.project_directory, fs.realpathSync.native(folder));
    assert.equal(task.state, 'awaiting_local_approval');
    assert.equal(bridge.tasks.get(task.task_id).project_id, null);
    assert.equal(bridge.tasks.get(task.task_id).project_identity.realpath, fs.realpathSync.native(folder));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

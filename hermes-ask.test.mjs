import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createWorkflow } from './workflow.mjs';

test('hermes_ask shows the exact request and waits for one-time local approval before running', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ask-approval-'));
  const stat = fs.statSync(dir), realpath = fs.realpathSync.native(dir);
  const identity = { realpath, dev: stat.dev, ino: stat.ino };
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), active: new Map(), MAX_RESPONSE: 8000, safeText: value => String(value), projectPolicySnapshot: () => ({ project_id: 'test', level: 'manual', revision: 0, identity }) };
  const prompt = 'Summarize the local project and do not change files.';
  let hermesCalls = 0, checks = 0;
  const workflow = createWorkflow(bridge, {
    baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir,
    projectConfig: [{ id: 'test', name: 'Test', root: dir, ...identity }],
    hermesRunner: async (args, _timeout, cwd) => { hermesCalls++; assert.deepEqual(args, ['--safe-mode', '--ignore-user-config', '--ignore-rules', '-z', prompt]); assert.equal(fs.realpathSync.native(cwd), realpath); return { state: 'completed', output: 'Summary ready' }; },
    checkRunner: async () => { checks++; return { state: 'passed' }; },
  });
  const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected core call'); });
  const response = () => ({ status: null, data: '', headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const prepared = (await rpc('hermes_ask', { prompt })).result.structuredContent;
    assert.equal(prepared.state, 'awaiting_local_approval');
    assert.equal(prepared.prompt, prompt);
    assert.match(prepared.warning, /pasta selecionada/i);
    assert.equal(hermesCalls, 0);
    assert.equal((await rpc('hermes_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result.isError, true);
    assert.equal(hermesCalls, 0);

    const get = response();
    await workflow.serveApproval({ url: `/approve/${prepared.task_id}`, method: 'GET' }, get);
    assert.ok(get.data.includes(prompt));
    assert.match(get.data, /pode usar ferramentas disponiveis/);
    assert.match(get.data, /Aprovar este pedido ao Hermes/);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(get.data)[1];
    const approved = response();
    await workflow.serveApproval(Object.assign(Readable.from([`csrf=${token}`]), { url: `/approve/${prepared.task_id}`, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_approval=${token}` } }), approved);
    assert.equal(approved.status, 200);
    assert.equal((await rpc('hermes_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result.structuredContent.one_shot, true);
    for (let i = 0; i < 100 && hermesCalls === 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
    for (let i = 0; i < 100; i++) {
      const progress = (await rpc('hermes_task_progress', { task_id: prepared.task_id })).result.structuredContent;
      if (progress.state === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal((await rpc('hermes_task_progress', { task_id: prepared.task_id })).result.structuredContent.state, 'completed');
    assert.equal((await rpc('hermes_task_logs', { task_id: prepared.task_id })).result.structuredContent.result, 'Summary ready');
    assert.equal(checks, 0);
    assert.equal(hermesCalls, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

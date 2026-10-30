import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import * as bridge from './bridge/server.mjs';
import { dispatchMcp } from './server.mjs';
import { serveStdio } from './stdio.mjs';
import { createWorkflow } from './workflow.mjs';

test('stdio processes MCP requests, notifications and invalid JSON without HTTP', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let result = '';
  output.setEncoding('utf8');
  output.on('data', chunk => { result += chunk; });
  const methods = [];
  const running = serveStdio({
    input, output,
    dispatch: async message => {
      methods.push(message.method);
      if (message.id === undefined) return null;
      return { jsonrpc: '2.0', id: message.id, result: { method: message.method } };
    },
  });
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  input.write('{bad json}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  input.write('{"id":3,"method":"tools/list"}\n');
  input.end();
  await running;
  const replies = result.trim().split('\n').map(JSON.parse);
  assert.deepEqual(methods, ['initialize', 'notifications/initialized', 'tools/list']);
  assert.deepEqual(replies.filter(reply => reply.result).map(reply => reply.id), [1, 2]);
  assert.deepEqual(replies.filter(reply => reply.error).map(reply => reply.error.code), [-32700, -32600]);
});

test('stdio exposes the complete workflow tool inventory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-stdio-'));
  try {
    const workflow = createWorkflow(bridge, {
      baseUrl: 'http://127.0.0.1:18482', dashboardRoot: root, settingsFile: path.join(root, 'settings.json'),
    });
    const input = new PassThrough();
    const output = new PassThrough();
    let result = '';
    output.setEncoding('utf8');
    output.on('data', chunk => { result += chunk; });
    const running = serveStdio({ input, output, dispatch: message => dispatchMcp(message, workflow) });
    input.end('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n');
    await running;
    const reply = JSON.parse(result.trim());
    assert.equal(reply.result.tools.length, 45);
    assert.ok(reply.result.tools.some(tool => tool.name === 'codex_project_summary'));
    assert.ok(reply.result.tools.some(tool => tool.name === 'codex_mcp_configurator'));
    assert.ok(reply.result.tools.some(tool => tool.name === 'hermes_prepare_task'));
    assert.ok(reply.result.tools.some(tool => tool.name === 'codexbridge_project_advisor'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

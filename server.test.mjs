import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';

const projectFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-http-'));
let child;
async function cleanupFixture() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  fs.rmSync(projectFixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
after(cleanupFixture);
const testStateRoot = path.join(projectFixture, 'bridge');
fs.mkdirSync(path.join(testStateRoot, 'reports'), { recursive: true });
fs.mkdirSync(path.join(testStateRoot, 'approvals'), { recursive: true });
fs.mkdirSync(path.join(projectFixture, 'history', 'retention-archive'), { recursive: true });
fs.copyFileSync(new URL('./dashboard-workshop.js', import.meta.url), path.join(projectFixture, 'dashboard-workshop.js'));
const codexFixture = path.join(projectFixture, 'fake-status.mjs');
fs.writeFileSync(codexFixture, 'console.log(process.argv.includes("--version") ? "fixture codex" : "Logged in using fixture");');
const portProbe = net.createServer();
await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
const childEnv = {
  ...process.env,
  NODE_ENV: 'test',
  CODEXBRIDGE_HTTP_PORT: String(port),
  CODEXBRIDGE_PROJECT: projectFixture,
  CODEXBRIDGE_CODEX_JS: codexFixture,
  CODEXBRIDGE_TEST_STATE_DIR: path.join(projectFixture, 'bridge'),
  CODEXBRIDGE_TEST_DASHBOARD_ROOT: projectFixture,
};
delete childEnv.CODEXBRIDGE_SERVER;
child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: childEnv,
  stdio: ['ignore', 'ignore', 'pipe'],
});
const base = `http://127.0.0.1:${port}/mcp`;
async function ready() {
  for (let i = 0; i < 40; i++) {
    try { await fetch(base); return; } catch { await new Promise(r => setTimeout(r, 50)); }
  }
  throw new Error('HTTP adapter did not start');
}

test('MCP handshake, discovery, and safe status call', async () => {
  try {
    await ready();
    const rpc = async (id, method, params) => {
      const response = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'codexbridge');
    assert.equal(init.result.serverInfo.version, '0.2.4');
    const listed = await rpc(2, 'tools/list', {});
    const expectedTools = [
      'public_page_open', 'public_page_read',
      'codex_status', 'codex_run_readonly', 'codex_prepare_task', 'codex_execute_approved',
      'codex_task_result', 'codex_cancel_task', 'codex_model_session', 'codex_model_evaluate', 'codex_route_prepare_task', 'codex_route_execute_approved',
      'hermes_status', 'hermes_ask', 'hermes_environment_check', 'hermes_prepare_task',
      'hermes_approval_status', 'hermes_execute_approved', 'hermes_task_progress', 'hermes_task_logs',
      'hermes_validation_result', 'hermes_execution_health', 'hermes_list_tasks', 'codex_configure_project',
      'codex_plugin_setup', 'codex_mcp_configurator', 'codex_tunnel_setup_prompt', 'codex_plugin_instructions',
      'codex_plugin_capabilities', 'codex_bridge_guide', 'codex_project_readme', 'codex_project_summary', 'codexbridge_project_advisor', 'codex_project_note',
      'codex_approval_status', 'codex_execute_and_validate', 'codex_validation_result', 'codex_list_tasks',
      'codex_task_progress', 'codex_task_logs', 'codex_test_report', 'codex_environment_check',
      'codex_execution_health', 'codex_run_typecheck', 'codex_build_project',
    ];
    assert.equal(listed.result.tools.length, expectedTools.length);
    assert.deepEqual(listed.result.tools.map(tool => tool.name), expectedTools);
    for (const tool of listed.result.tools) {
      assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${tool.name} readOnlyHint`);
      assert.equal(typeof tool.annotations?.openWorldHint, 'boolean', `${tool.name} openWorldHint`);
      assert.equal(typeof tool.annotations?.destructiveHint, 'boolean', `${tool.name} destructiveHint`);
    }
    const hints = Object.fromEntries(listed.result.tools.map(tool => [tool.name, tool.annotations]));
    assert.deepEqual(hints.codex_run_readonly, { readOnlyHint: true, openWorldHint: false, destructiveHint: false });
    assert.deepEqual(hints.hermes_ask, { readOnlyHint: false, openWorldHint: true, destructiveHint: true });
    assert.deepEqual(hints.codex_build_project, { readOnlyHint: false, openWorldHint: true, destructiveHint: true });
    assert.ok(listed.result.tools.some(t => t.name === 'codex_mcp_configurator'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_tunnel_setup_prompt'));
    assert.equal(new Set(listed.result.tools.map(tool => tool.name)).size, listed.result.tools.length);
    assert.ok(listed.result.tools.some(t => t.name === 'codex_status'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_configure_project'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_project_readme'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_project_summary'));
    assert.ok(listed.result.tools.some(t => t.name === 'hermes_prepare_task'));
    assert.ok(listed.result.tools.some(t => t.name === 'hermes_execute_approved'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_plugin_setup'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_plugin_instructions'));
    assert.ok(listed.result.tools.some(t => t.name === 'codex_plugin_capabilities'));
    const status = await rpc(3, 'tools/call', { name: 'codex_status', arguments: {} });
    assert.equal(status.result.isError, false);
    assert.equal(status.result.structuredContent.bridge, 'available');
    assert.equal(status.result.structuredContent.project_directory, projectFixture);
    assert.equal(status.result.structuredContent.version, 'fixture codex');
    for (const route of ['/dashboard', '/dashboard/codex-workshop', '/dashboard/catalog', '/dashboard/coming-soon', '/dashboard/retention', '/dashboard/requests', '/dashboard/tunnels']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${route}`)).status, 200, route);
    }
    for (const directory of [
      path.join(projectFixture, 'history'),
      path.join(projectFixture, 'history', 'retention-archive'),
      path.join(testStateRoot, 'reports'),
      path.join(testStateRoot, 'approvals'),
    ]) assert.ok(fs.existsSync(directory), `test state directory exists: ${directory}`);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(base, { headers: { Host: `example.com:${port}` } }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
    });
    assert.equal(foreignHostStatus, 403);
    const discover = await rpc(4, 'server/discover', {});
    assert.equal(discover.error.code, -32601);
  } finally {
    await cleanupFixture();
  }
});


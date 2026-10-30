import http from 'node:http';
import path from 'node:path';
import { defaultMcpTokenFile, loadOrCreateMcpToken, matchesMcpToken } from './http-auth.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createWorkflow } from './workflow.mjs';

const host = '127.0.0.1';
const bridgePath = process.env.CODEXBRIDGE_SERVER ||
  fileURLToPath(new URL('./bridge/server.mjs', import.meta.url));
const bridge = await import(pathToFileURL(bridgePath).href);
const { handle } = bridge;
const settingsFile = fileURLToPath(new URL('./config/settings.json', import.meta.url));
const testDashboardRoot = process.env.NODE_ENV === 'test' && process.env.CODEXBRIDGE_TEST_DASHBOARD_ROOT
  ? path.resolve(process.env.CODEXBRIDGE_TEST_DASHBOARD_ROOT)
  : undefined;

export function dispatchMcp(message, workflow) {
  return message.method === 'server/discover'
    ? { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32601, message: 'Method not found' } }
    : workflow.handle(message, handle);
}

function createHttpServer(workflow, port, mcpToken) { return http.createServer(async (req, res) => {
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
    res.writeHead(403).end();
    return;
  }
  if (req.url?.startsWith('/validate/')) {
    await workflow.serveValidation(req, res);
    return;
  }
  if (req.url?.startsWith('/dashboard')) {
    await workflow.serveDashboard(req, res);
    return;
  }
  if (req.url?.startsWith('/approve/')) {
    await workflow.serveApproval(req, res);
    return;
  }
  if (req.url !== '/mcp') {
    res.writeHead(404).end();
    return;
  }
  if (req.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) {
    res.writeHead(403).end();
    return;
  }
  if (!['POST', 'DELETE'].includes(req.method)) {
    res.writeHead(405, { Allow: 'POST, DELETE' }).end();
    return;
  }
  if (!matchesMcpToken(req.headers['x-codexbridge-token'], mcpToken)) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ error: 'MCP authentication required.' }));
    return;
  }
  if (req.method === 'DELETE') {
    res.writeHead(204).end();
    return;
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    res.writeHead(415).end();
    return;
  }

  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new Error('Request too large');
      chunks.push(chunk);
    }
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!message || message.jsonrpc !== '2.0' || Array.isArray(message) || typeof message.method !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }));
      return;
    }
    // ChatGPT can fall back to the standard MCP handshake after this response.
    const reply = await dispatchMcp(message, workflow);
    if (reply == null) {
      res.writeHead(202).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(reply));
  } catch (error) {
    const code = error.message === 'Request too large' ? 413 : 400;
    res.writeHead(code, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON request' } }));
  }
}); }

export async function startHttpAdapter({ port = Number(process.env.CODEXBRIDGE_HTTP_PORT || 18473), allowFallback = false } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CODEXBRIDGE_HTTP_PORT');
  const mcpTokenFile = defaultMcpTokenFile({ env: process.env, testDashboardRoot });
  const mcpToken = loadOrCreateMcpToken(mcpTokenFile);
  for (let candidate = port; candidate <= Math.min(port + (allowFallback ? 9 : 0), 65535); candidate++) {
    const workflow = createWorkflow(bridge, {
      baseUrl: `http://${host}:${candidate}`,
      settingsFile: testDashboardRoot ? path.join(testDashboardRoot, 'config', 'settings.json') : settingsFile,
      dashboardRoot: testDashboardRoot,
      enableHermesExecution: process.env.CODEXBRIDGE_ENABLE_HERMES_EXECUTION === '1',
    });
    const server = createHttpServer(workflow, candidate, mcpToken);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(candidate, host, () => { server.off('error', reject); resolve(); });
      });
      process.stderr.write(`CodexBridge HTTP MCP listening at http://${host}:${candidate}/mcp\n`);
      return { server, workflow, port: candidate };
    } catch (error) {
      if (!allowFallback || error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('Nenhuma porta local disponível para o dashboard.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startHttpAdapter();
}

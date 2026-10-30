import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('preflight PowerShell cobre endpoint saudável, indisponível e impede run antes das verificações', t => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const powershell = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'Preflight.Tests.ps1')], { encoding: 'utf8' });
  if (powershell.error?.code === 'ENOENT') return t.skip('Windows PowerShell não está disponível neste ambiente.');
  assert.equal(powershell.status, 0, `${powershell.stdout}\n${powershell.stderr}`);
});

test('Start-Adapter aguarda endpoint sem encerrar processos em timeout', () => {
  const script = fs.readFileSync(new URL('./scripts/Start-Adapter.ps1', import.meta.url), 'utf8');
  assert.match(script, /Wait-LocalMcpEndpoint -Port \$Port -TimeoutSeconds 15/);
  assert.match(script, /allowAutomaticToolInstall -ne \$true/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('./config/settings.example.json', import.meta.url), 'utf8')).allowAutomaticToolInstall, false);
  assert.match(script, /continua ativo no processo/);
  assert.doesNotMatch(script, /Stop-Process|taskkill/i);
});

test('Start-Tunnel só instala ferramentas automaticamente com opt-in explícito', () => {
  const script = fs.readFileSync(new URL('./scripts/Start-Tunnel.ps1', import.meta.url), 'utf8');
  assert.equal((script.match(/allowAutomaticToolInstall -ne \$true/g) || []).length, 2);
});

test('Start-Tunnel autentica o cliente com token local e bloqueia perfil antigo sem rede externa', async t => {
  if (process.platform !== 'win32') return t.skip('A integração exige Windows PowerShell e um stub .cmd local.');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-tunnel-fixture-'));
  const token = 'A'.repeat(43);
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/mcp' && req.method === 'GET') return res.writeHead(405, { Allow: 'POST, DELETE' }).end();
    res.writeHead(404).end();
  });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  try {
    const root = path.dirname(fileURLToPath(import.meta.url));
    const scripts = path.join(fixture, 'scripts');
    const tunnels = path.join(fixture, 'config', 'tunnels');
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(tunnels, { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'Common.ps1'), path.join(scripts, 'Common.ps1'));
    fs.copyFileSync(path.join(root, 'scripts', 'Start-Tunnel.ps1'), path.join(scripts, 'Start-Tunnel.ps1'));
    const fakeClient = path.join(fixture, 'fake-tunnel-client.cmd');
    fs.writeFileSync(fakeClient, '@echo off\necho %~1>>"%~dp0calls.txt"\nif /I "%~1"=="doctor" (\n  if "%CODEXBRIDGE_MCP_TOKEN%"=="%CODEXBRIDGE_TEST_EXPECTED_TOKEN%" (echo token-present>>"%~dp0calls.txt") else (exit /b 17)\n)\nexit /b 0\n');
    fs.writeFileSync(path.join(fixture, 'config', 'settings.local.json'), JSON.stringify({ tunnelClientPath: fakeClient, httpPort: port, allowAutomaticToolInstall: false }));
    fs.writeFileSync(path.join(tunnels, 'fixture.yaml'), 'mcp:\n  extra_headers:\n    X-CodexBridge-Token: "env:CODEXBRIDGE_MCP_TOKEN"\n  server_urls:\n    - url: "http://127.0.0.1:' + port + '/mcp"\n');
    const tokenFile = path.join(fixture, 'mcp-token');
    fs.writeFileSync(tokenFile, token);
    const env = { ...process.env, LOCALAPPDATA: path.join(fixture, 'local-app-data'), CODEXBRIDGE_MCP_TOKEN_FILE: tokenFile, CODEXBRIDGE_TEST_EXPECTED_TOKEN: token, CONTROL_PLANE_API_KEY: 'synthetic-fixture-key' };
    delete env.MCP_EXTRA_HEADERS;
    const runTunnel = () => new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'Start-Tunnel.ps1'), '-ProfileName', 'fixture'], { cwd: fixture, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', code => resolve({ code, stdout, stderr }));
    });
    const successfulRun = await runTunnel();
    assert.equal(successfulRun.code, 0, `${successfulRun.stdout}\n${successfulRun.stderr}`);
    assert.deepEqual(fs.readFileSync(path.join(fixture, 'calls.txt'), 'utf8').trim().split(/\r?\n/), ['doctor', 'token-present', 'run']);
    fs.writeFileSync(path.join(tunnels, 'fixture.yaml'), 'mcp:\n  server_urls:\n    - url: "http://127.0.0.1:' + port + '/mcp"\n');
    const staleRun = await runTunnel();
    assert.notEqual(staleRun.code, 0);
    assert.match(staleRun.stderr + staleRun.stdout, /outdated/i);
    assert.deepEqual(fs.readFileSync(path.join(fixture, 'calls.txt'), 'utf8').trim().split(/\r?\n/), ['doctor', 'token-present', 'run']);
  } finally {
    await new Promise(resolve => httpServer.close(resolve));
    fs.rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

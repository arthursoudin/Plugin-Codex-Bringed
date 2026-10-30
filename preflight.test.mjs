import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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
  assert.match(script, /continua ativo no processo/);
  assert.doesNotMatch(script, /Stop-Process|taskkill/i);
});

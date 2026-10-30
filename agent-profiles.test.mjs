import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_PROFILES, installNativeAgents, manageAgentProfiles, renderNativeAgent } from './agent-profiles.mjs';
import { installProfilesWithConsent } from './scripts/Install-Agent-Profiles.mjs';
import { createWorkflow } from './workflow.mjs';

test('guarda escolha, autonomia e memória limitadas em arquivo isolado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-agent-state-'));
  const file = path.join(dir, 'history', 'agents.json');
  try {
    assert.equal(manageAgentProfiles(file).agents.length, 6);
    const picked = manageAgentProfiles(file, { action: 'select', profile_id: 'programador' });
    assert.equal(picked.selected, 'programador');
    assert.match(picked.instructions, /Preserve alterações locais/);
    for (let i = 0; i < 10; i++) manageAgentProfiles(file, { action: 'remember', profile_id: 'programador', note: `nota-${i}` });
    const status = manageAgentProfiles(file, { action: 'status' });
    assert.equal(status.selected, 'programador');
    assert.equal(status.agents.find(item => item.id === 'programador').memory_count, 8);
    manageAgentProfiles(file, { action: 'set_autonomy', enabled: true });
    assert.equal(manageAgentProfiles(file).autonomy, true);
    assert.match(manageAgentProfiles(file, { action: 'select', profile_id: 'github-committer' }).instructions, /nunca faça push/i);
    assert.equal(fs.existsSync(file), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('gera formatos nativos e não substitui arquivos existentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-native-agents-'));
  try {
    assert.match(renderNativeAgent(AGENT_PROFILES[0], 'codex'), /^name = "programador"/);
    assert.match(renderNativeAgent(AGENT_PROFILES[0], 'claude_code'), /^---\nname: programador/);
    assert.match(renderNativeAgent(AGENT_PROFILES[0], 'antigravity'), /^---\nname: programador/);
    const codex = path.join(dir, 'codex');
    const files = installNativeAgents('codex', codex);
    assert.equal(files.length, 6);
    const preserved = fs.readFileSync(files[0], 'utf8');
    assert.throws(() => installNativeAgents('codex', codex), /preservados/);
    assert.equal(fs.readFileSync(files[0], 'utf8'), preserved);
    for (const client of ['claude_code', 'antigravity']) assert.equal(installNativeAgents(client, path.join(dir, client)).length, 6);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('instalador exige confirmação no próprio ponto de entrada antes de gravar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-agent-consent-'));
  try {
    const target = path.join(dir, 'user-profile', 'agents');
    const cancelled = await installProfilesWithConsent({ client: 'codex', targetDirectory: target, ask: async prompt => {
      assert.match(prompt, /digite INSTALAR/i);
      return 'não';
    } });
    assert.equal(cancelled.installed, false);
    assert.equal(fs.existsSync(target), false);
    const accepted = await installProfilesWithConsent({ client: 'codex', targetDirectory: target, ask: async () => 'INSTALAR' });
    assert.equal(accepted.installed, true);
    assert.equal(accepted.files.length, 6);
    assert.equal(fs.existsSync(accepted.files[0]), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memória ignora IDs desconhecidos e valida notas e ações', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-agent-validation-'));
  try {
    const file = path.join(dir, 'state.json');
    assert.throws(() => manageAgentProfiles(file, { action: 'select', profile_id: '../../outside' }), /Perfil inválido/);
    assert.throws(() => manageAgentProfiles(file, { action: 'remember', profile_id: 'design', note: 'x'.repeat(501) }), /500 caracteres/);
    assert.throws(() => manageAgentProfiles(file, { action: 'set_autonomy', enabled: 'yes' }), /true ou false/);
    assert.throws(() => manageAgentProfiles(file, { action: 'nope' }), /Ação inválida/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preserva memória corrompida ou de versão futura em vez de sobrescrever', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-agent-corrupt-'));
  try {
    const file = path.join(dir, 'state.json');
    for (const content of ['{broken', JSON.stringify({ version: 999, selected: 'design' })]) {
      fs.writeFileSync(file, content);
      assert.throws(() => manageAgentProfiles(file, { action: 'set_autonomy', enabled: false }), /memória local.*preservado/i);
      assert.equal(fs.readFileSync(file, 'utf8'), content);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ferramenta MCP seleciona perfis e persiste apenas no history isolado da instância', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-agent-tool-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'bridge', 'active.lock'), tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: value => String(value) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const rpc = (name, args) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected core call'); });
    const listed = (await rpc('codexbridge_agents', { action: 'list' })).result.structuredContent;
    assert.equal(listed.agents.length, 6);
    assert.equal(listed.autonomy, false);
    const selected = (await rpc('codexbridge_agents', { action: 'select', profile_id: 'frontend' })).result.structuredContent;
    assert.equal(selected.selected, 'frontend');
    await rpc('codexbridge_agents', { action: 'remember', profile_id: 'frontend', note: 'Usar componentes atuais' });
    await rpc('codexbridge_agents', { action: 'set_autonomy', enabled: true });
    const restarted = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const state = await restarted.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codexbridge_agents', arguments: { action: 'status' } } }, () => { throw new Error('Unexpected core call'); });
    assert.equal(state.result.structuredContent.selected, 'frontend');
    assert.equal(state.result.structuredContent.autonomy, true);
    assert.equal(state.result.structuredContent.agents.find(agent => agent.id === 'frontend').memory_count, 1);
    assert.equal(fs.existsSync(path.join(dir, 'history', 'agent-state.json')), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

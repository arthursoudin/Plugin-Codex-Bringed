import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { createWorkflow } from './workflow.mjs';

test('política global escala por tarefa e termina ao reiniciar o workflow', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-model-session-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const rpc = (name, args) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected core call'); });
    const created = (await rpc('codex_model_session', { action: 'set', floor_model: 'gpt-6-luna', max_model: 'gpt-6-astra', max_effort: 'xhigh' })).result.structuredContent;
    assert.match(created.session_id, /^[0-9a-f-]{36}$/);
    const simple = (await rpc('codex_model_evaluate', { task: 'Mude a cor do botão', session_id: created.session_id })).result.structuredContent;
    const deep = (await rpc('codex_model_evaluate', { task: 'Revise a arquitetura e segurança de vários módulos', session_id: created.session_id })).result.structuredContent;
    assert.equal(simple.model, 'gpt-6-luna');
    assert.equal(deep.model, 'gpt-6-astra');
    assert.equal(deep.model_session_revision, 1);
    assert.equal((await rpc('codex_model_evaluate', { task: 'Mude a cor do botão' })).result.structuredContent.model, 'gpt-6-luna');
    const restarted = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const afterRestart = await restarted.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codex_model_evaluate', arguments: { task: 'Mude a cor do botão' } } }, () => { throw new Error('Unexpected core call'); });
    assert.equal(afterRestart.result.isError, true);
    const updated = (await rpc('codex_model_session', { action: 'set', session_id: created.session_id, max_model: 'gpt-6.1-sol', max_effort: 'medium' })).result.structuredContent;
    assert.equal(updated.revision, 2);
    assert.equal((await rpc('codex_model_session', { action: 'clear', session_id: created.session_id })).result.structuredContent.cleared, true);
    assert.equal((await rpc('codex_model_evaluate', { task: 'Revise a arquitetura', session_id: created.session_id })).result.isError, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ChatGPT configura o projeto autorizado uma vez e preserva o histórico', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-configure-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const originalHandle = () => { throw new Error('Unexpected original call'); };
    const rpc = args => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'codex_configure_project', arguments: args } }, originalHandle);
    const first = (await rpc({ name: 'Meu projeto' })).result.structuredContent;
    assert.equal(first.state, 'configured');
    assert.equal(first.identity_verified, true);
    assert.equal(first.project.name, 'Meu projeto');
    assert.equal((await rpc({ name: 'Outro nome' })).result.structuredContent.state, 'already_configured');
    assert.equal((await rpc({ name: 'Outro nome' })).result.structuredContent.project.name, 'Meu projeto');
    assert.equal((await rpc({ name: '' })).result.isError, true);
    fs.writeFileSync(path.join(dir, 'README.md'), '# Como iniciar o projeto');
    const invoke = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, originalHandle);
    const setup = (await invoke('codex_plugin_setup')).result.structuredContent;
    assert.equal(setup.checks.project_registered, true);
    assert.equal(setup.secrets_exposed, false);
    const hermesGuidance = (await invoke('codex_plugin_instructions')).result.structuredContent.hermes_workflow;
    assert.equal(hermesGuidance.length, 1);
    assert.match(hermesGuidance[0], /desativada por padrao/i);
    assert.doesNotMatch(hermesGuidance.join(' '), /CODEXBRIDGE_ENABLE_HERMES_EXECUTION/);
    assert.ok((await invoke('codex_plugin_capabilities')).result.structuredContent.groups.some(group => group.name === 'Hermes executor'));
    assert.match((await invoke('codex_bridge_guide')).result.structuredContent.guide, /tunnel/i);
    assert.match((await invoke('codex_project_readme')).result.structuredContent.readme, /Como iniciar/);
    assert.equal((await invoke('codex_project_note', { note: 'Validar typecheck antes do build.' })).result.structuredContent.state, 'saved');
    const restarted = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const afterRestart = await restarted.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codex_project_readme', arguments: {} } }, originalHandle);
    assert.equal(afterRestart.result.structuredContent.notes.length, 1);
    assert.equal((await invoke('codex_project_readme')).result.structuredContent.notes[0].text, 'Validar typecheck antes do build.');
    assert.equal((await invoke('codex_project_note', { note: ' ' })).result.isError, true);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'projects.json'), 'utf8'));
    assert.equal(stored.projects.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'history', 'project-events.jsonl'), 'utf8').trim().split('\n').length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cadastro explícito funciona sem projeto padrão e conserva nome opcional e identidade', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-configure-explicit-'));
  const project = path.join(root, 'chosen'); fs.mkdirSync(project);
  try {
    const bridge = { LOCK_PATH: path.join(root, 'active.lock'), tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: root });
    const rpc = args => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'codex_configure_project', arguments: args } }, () => { throw new Error('Unexpected original call'); });
    const configured = (await rpc({ project_directory: project })).result.structuredContent;
    assert.equal(configured.state, 'configured');
    assert.equal(configured.project.name, 'chosen');
    assert.equal(configured.project.directory, fs.realpathSync.native(project));
    assert.equal(configured.identity_verified, true);
    const named = (await rpc({ name: 'Friendly name', project_directory: project })).result.structuredContent;
    assert.equal(named.state, 'already_configured');
    assert.equal(named.project.name, 'chosen');
    assert.equal((await rpc({ name: 'No directory' })).result.isError, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('guias, capacidades e diagnóstico de conexão funcionam sem projeto cadastrado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-no-project-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const rpc = name => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }, () => ({ result: { tools: [] } }));
    const setup = (await rpc('codex_plugin_setup')).result.structuredContent;
    assert.equal(setup.checks.project_registered, false);
    assert.match(setup.runtime.version, /^\d+\.\d+\.\d+$/);
    assert.match(setup.runtime.installation_id, /^[0-9a-f]{12}$/);
    assert.match(setup.runtime.source_revision, /^[0-9a-f]{12}$/);
    assert.equal(setup.checks.tunnel_check, 'não verificado nesta chamada');
    assert.match(setup.connection, /não comprova que o tunnel está ativo/i);
    assert.match(setup.project_requirement.next_action, /selecione uma pasta existente com project_directory/i);
    assert.ok(setup.project_requirement.not_required_for.includes('ler guias e capacidades'));
    assert.equal(setup.fallback_policy.automatic_switch, false);
    assert.match(setup.fallback_policy.if_failed_or_timed_out, /alteração parcial/i);
    assert.equal(setup.other_mcp_compatibility.coexists, true);
    assert.equal(setup.other_mcp_compatibility.boundaries.length, 3);
    assert.match(setup.other_mcp_compatibility.connect_steps.join(' '), /Apps ou Conectores/i);
    const instructions = (await rpc('codex_plugin_instructions')).result.structuredContent;
    assert.ok(instructions.startup.some(item => /Sem projeto/i.test(item)));
    assert.ok(instructions.chat_permission_flow.some(item => /resumo curto.*executor.*pasta.*ação\/modelo.*validação/i.test(item)));
    assert.ok(instructions.chat_permission_flow.some(item => /aguarde aprovação explícita.*chat/i.test(item)));
    assert.ok(instructions.chat_permission_flow.some(item => /confirmação nativa do ChatGPT/i.test(item)));
    assert.ok(instructions.chat_permission_flow.some(item => /servidor não recebe prova verificável/i.test(item)));    assert.ok(!instructions.startup.some(item => /configure.*authorized project/i.test(item)));
    assert.ok(instructions.fallback_policy.some(item => /Nunca troque/i.test(item)));
    assert.ok(instructions.approval_checklist.some(item => /executor/i.test(item)));
    assert.ok(instructions.other_mcp_connections.some(item => /não configura/i.test(item)));
    assert.ok(instructions.other_mcp_connections.some(item => /nunca compartilhe/i.test(item)));
    const listed = await workflow.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, () => ({ result: { tools: [] } }));
    const writeDescriptions = listed.result.tools.filter(tool => ['codex_execute_and_validate', 'hermes_execute_approved', 'codex_build_project'].includes(tool.name)).map(tool => tool.description).join(' ');
    assert.match(writeDescriptions, /aprovação explícita do usuário no chat/i);
    assert.match(writeDescriptions, /confirmação nativa do ChatGPT/i);
    assert.match(writeDescriptions, /servidor não recebe prova verificável/i);    assert.ok((await rpc('codex_plugin_capabilities')).result.structuredContent.project_requirement.required_for.length > 0);
    assert.match((await rpc('codex_bridge_guide')).result.structuredContent.guide, /tunnel/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('configurador de MCP prepara passos sem guardar nem aceitar segredos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-mcp-configurator-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const rpc = args => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'codex_mcp_configurator', arguments: args } }, () => ({ result: { tools: [] } }));
    const result = (await rpc({ server_name: 'Agenda', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp', auth_method: 'oauth' })).result.structuredContent;
    assert.equal(result.state, 'instructions_prepared');
    assert.equal(result.server_url, 'https://mcp.example.com/mcp');
    assert.match(result.after_connecting, /ferramentas que esse MCP expuser/);
    assert.match(result.codex_cli.command, /^codex mcp add 'Agenda' --url 'https:\/\/mcp\.example\.com\/mcp'$/);
    assert.match(result.hermes_cli.command, /^hermes mcp add 'Agenda' --url 'https:\/\/mcp\.example\.com\/mcp' --auth oauth$/);
    assert.match(result.gemini_cli.command, /^gemini mcp add --scope user --transport http 'Agenda' 'https:\/\/mcp\.example\.com\/mcp'$/);
    assert.equal(result.opencode_cli.command, null);
    assert.deepEqual(JSON.parse(result.opencode_cli.config_snippet), { mcp: { servers: { Agenda: { type: 'remote', url: 'https://mcp.example.com/mcp' } } } });
    assert.ok(result.chatgpt_steps.some(item => /ChatGPT.*Criar app.*servidor MCP personalizado/i.test(item)));
    assert.ok(result.codex_cli.steps.some(item => /codex mcp list/.test(item)));
    assert.ok(result.hermes_cli.steps.some(item => /hermes mcp list/.test(item)));
    assert.ok(result.hermes_cli.steps.some(item => /hermes mcp test/.test(item)));
    assert.ok(result.gemini_cli.steps.some(item => /gemini mcp list/.test(item)));
    assert.ok(result.opencode_cli.steps.some(item => /opencode mcp auth/.test(item)));
    assert.ok(result.limitations.some(item => /ChatGPT, Codex CLI, Hermes CLI, Gemini CLI e OpenCode CLI.*própria configuração e autenticação/i.test(item)));
    assert.ok(result.limitations.some(item => /n[aã]o consegue confirmar nem conectar.*ChatGPT/i.test(item)));
    assert.ok(result.limitations.some(item => /não altera configurações externas, não executa comandos/i.test(item)));
    assert.ok(result.limitations.some(item => /nunca cole o valor.*salva somente o nome da variável/i.test(item)));
    const onlyHermes = (await rpc({ server_name: 'Agenda', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp', auth_method: 'none', target_clients: ['hermes_cli'] })).result.structuredContent;
    assert.deepEqual(onlyHermes.selected_cli_destinations, ['hermes_cli']);
    assert.match(onlyHermes.hermes_cli.command, /^hermes mcp add 'Agenda' --url 'https:\/\/mcp\.example\.com\/mcp'$/);
    assert.equal(Object.hasOwn(onlyHermes, 'codex_cli'), false);
    assert.equal((await rpc({ server_name: 'Bad', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp', auth_method: 'none', target_clients: ['unknown_cli'] })).result.isError, true);
    assert.equal((await rpc({ server_name: 'Bad', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp?token=secret', auth_method: 'api_key' })).result.isError, true);
    assert.equal((await rpc({ server_name: 'Agenda; echo unsafe', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp', auth_method: 'none' })).result.isError, true);
    assert.equal((await rpc({ server_name: 'Bad', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp#', auth_method: 'none' })).result.isError, true);
    assert.equal((await rpc({ server_name: 'Bad', connection_type: 'remote_url', server_url: 'https://user:pass@mcp.example.com/mcp', auth_method: 'none' })).result.isError, true);
    assert.equal((await rpc({ server_name: 'Bad', connection_type: 'remote_url', server_url: 'http://example.com/mcp', auth_method: 'none' })).result.isError, true);
    const stdio = (await rpc({ server_name: 'Files', connection_type: 'local_stdio', stdio_command: 'npx', stdio_args: ['-y', '@modelcontextprotocol/server-filesystem', "C:\\Data", "folder's name"], auth_method: 'none' })).result.structuredContent;
    assert.equal(stdio.server_url, null);
    assert.match(stdio.codex_cli.command, /^codex mcp add 'Files' -- 'npx' '-y' '@modelcontextprotocol\/server-filesystem' 'C:\\Data' 'folder''s name'$/);
    assert.match(stdio.hermes_cli.command, /^hermes mcp add 'Files' --command 'npx' --args '-y' '@modelcontextprotocol\/server-filesystem' 'C:\\Data' 'folder''s name'$/);
    assert.match(stdio.gemini_cli.command, /^gemini mcp add --scope user --transport stdio 'Files' 'npx' '-y' '@modelcontextprotocol\/server-filesystem' 'C:\\Data' 'folder''s name'$/);
    assert.deepEqual(JSON.parse(stdio.opencode_cli.config_snippet).mcp.servers.Files.command, ['npx', '-y', '@modelcontextprotocol/server-filesystem', 'C:\\Data', "folder's name"]);
    assert.match(stdio.chatgpt_steps.join(' '), /não pode ser conectado diretamente ao ChatGPT/);
    assert.equal((await rpc({ server_name: 'Files', connection_type: 'local_stdio', auth_method: 'none' })).result.isError, true);
    const stdioApiKey = (await rpc({ server_name: 'Files', connection_type: 'local_stdio', stdio_command: 'node', stdio_args: ['--version'], auth_method: 'api_key', auth_env_var: 'TEST_MCP_TOKEN' })).result.structuredContent;
    assert.equal(JSON.parse(stdioApiKey.hermes_cli.config_snippet).mcp_servers.Files.env.TEST_MCP_TOKEN, '${env:TEST_MCP_TOKEN}');
    assert.deepEqual(JSON.parse(stdioApiKey.gemini_cli.config_snippet).mcpServers.Files, { command: 'node', args: ['--version'], env: { TEST_MCP_TOKEN: '${TEST_MCP_TOKEN}' } });
    assert.equal((await rpc({ server_name: 'Files', connection_type: 'local_stdio', stdio_command: 'npx', stdio_args: ['--token=secret-value'], auth_method: 'none', target_clients: ['codex_cli'] })).result.isError, true);
    assert.equal((await rpc({ server_name: 'Agenda', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp', auth_method: 'api_key' })).result.isError, true);
    const apiKey = (await rpc({ server_name: 'Agenda', connection_type: 'remote_url', server_url: 'https://mcp.example.com/mcp', auth_method: 'api_key', auth_env_var: 'TEST_MCP_TOKEN' })).result.structuredContent;
    assert.match(apiKey.codex_cli.command, /--bearer-token-env-var 'TEST_MCP_TOKEN'/);
    assert.equal(apiKey.hermes_cli.command, null);
    assert.equal(JSON.parse(apiKey.hermes_cli.config_snippet).mcp_servers.Agenda.headers.Authorization, 'Bearer ${env:TEST_MCP_TOKEN}');
    assert.equal(apiKey.gemini_cli.command, null);
    assert.equal(apiKey.gemini_cli.config_snippet, null);
    assert.match(apiKey.gemini_cli.command_unavailable_reason, /HTTP/);
    assert.equal(apiKey.opencode_cli.command, null);
    assert.equal(JSON.parse(apiKey.opencode_cli.config_snippet).mcp.servers.Agenda.headers.Authorization, 'Bearer {env:TEST_MCP_TOKEN}');
    for (const output of [apiKey.codex_cli.command, apiKey.hermes_cli.config_snippet, apiKey.opencode_cli.config_snippet]) assert.doesNotMatch(output, /secret-value|sk-[A-Za-z0-9]{20,}/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Hermes execution is disabled and hidden by default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hermes-disabled-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map(), active: new Map(), MAX_RESPONSE: 8000, safeText: String };
    let runs = 0;
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, hermesRunner: async () => { runs++; return { state: 'completed' }; } });
    const listed = await workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, () => ({ result: { tools: [] } }));
    assert.equal(listed.result.tools.some(tool => ['hermes_ask', 'hermes_prepare_task', 'hermes_execute_approved'].includes(tool.name)), false);
    const reply = await workflow.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hermes_ask', arguments: { prompt: 'hello', project_directory: dir } } }, () => ({ result: {} }));
    assert.equal(reply.result.isError, true);
    assert.equal(runs, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prompt de setup do tunnel exige segredo oculto e não usa credenciais pessoais', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tunnel-prompt-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
    const result = await workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'codex_tunnel_setup_prompt', arguments: {} } }, () => ({ result: { tools: [] } }));
    const setup = result.result.structuredContent;
    assert.match(setup.prompt, /Read-Host -AsSecureString/);
    assert.match(setup.prompt, /sem sobrescrever YAML existente/);
    assert.match(setup.prompt, /CONTROL_PLANE_API_KEY/);
    assert.match(setup.prompt, /adicionar esse tunnel nas Configurações do ChatGPT/);
    assert.doesNotMatch(setup.prompt, /tunnel_6ada75a2cf54819187883752120e7f2e/);
    assert.match(setup.secret_handling, /nunca nesta conversa/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Hermes executa somente após aprovação local, consome a frase e salva validação consultável', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-approval-'));
  const stat = fs.statSync(dir);
  const projectIdentity = { realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino };
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), active: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x), projectPolicySnapshot: () => ({ project_id: 'test', level: 'manual', revision: 0, identity: projectIdentity }) };
  let hermesCalls = 0; const checks = [];
  const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, enableHermesExecution: true,
    projectConfig: [{ id: 'test', name: 'Test', root: dir, realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino }],
    hermesRunner: async (args, _timeout, cwd) => { hermesCalls++; assert.deepEqual(args[0], '-z'); assert.equal(fs.realpathSync.native(cwd), fs.realpathSync.native(dir)); return { state: 'completed', output: 'Edited files' }; },
    checkRunner: async (_root, script) => { checks.push(script); return { script, state: 'passed', exit_code: 0 }; } });
  const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected original call'); });
  const response = () => ({ status: null, data: '', headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const prepared = (await rpc('hermes_prepare_task', { task: 'Add a small feature' })).result.structuredContent;
    assert.equal(prepared.state, 'awaiting_local_approval');
    assert.equal((await rpc('hermes_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result.isError, true);
    assert.equal(hermesCalls, 0);
    const get = response(); await workflow.serveApproval({ url: `/approve/${prepared.task_id}`, method: 'GET' }, get);
    assert.match(get.data, /one-shot ignora aprovações internas/);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(get.data)[1];
    const approved = response();
    await workflow.serveApproval(Object.assign(Readable.from([`csrf=${token}`]), { url: `/approve/${prepared.task_id}`, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_approval=${token}` } }), approved);
    assert.equal(approved.status, 200);
    assert.equal((await rpc('hermes_approval_status', { task_id: prepared.task_id })).result.structuredContent.state, 'approved');
    assert.equal((await rpc('hermes_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result.structuredContent.state, 'running');
    for (let i = 0; i < 100 && hermesCalls === 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
    for (let i = 0; i < 200; i++) {
      const result = (await rpc('hermes_validation_result', { task_id: prepared.task_id })).result.structuredContent;
      if (result.state === 'not_started' && !fs.existsSync(bridge.LOCK_PATH)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const report = (await rpc('hermes_validation_result', { task_id: prepared.task_id })).result.structuredContent;
    assert.equal(report.state, 'not_started', JSON.stringify(report));
    assert.deepEqual(checks, []);
    assert.equal(hermesCalls, 1);
    assert.equal((await rpc('hermes_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result.isError, true);
    assert.equal((await rpc('hermes_task_logs', { task_id: prepared.task_id })).result.structuredContent.result, 'Edited files');
    assert.equal((await rpc('hermes_list_tasks')).result.structuredContent.total, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test('após reiniciar, uma etapa interrompida não aparece como concluída', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-interrupted-'));
  try {
    const id = 'bed7782b-d53a-4299-9453-27e3498eadb7';
    const realpath = fs.realpathSync.native(dir);
    const stat = fs.statSync(dir);
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    fs.mkdirSync(path.join(dir, 'history'));
    fs.writeFileSync(path.join(dir, 'history', `${id}.json`), JSON.stringify({ task_id: id, project_id: 'jarvis', project_directory: dir, state: 'running', validation: { task_id: id, state: 'running', checks: [] } }));
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath, dev: stat.dev, ino: stat.ino }] });
    const rpc = name => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { task_id: id } } }, () => { throw new Error('Unexpected original call'); });
    assert.equal((await rpc('codex_task_progress')).result.structuredContent.state, 'interrupted');
    assert.equal((await rpc('codex_validation_result')).result.structuredContent.state, 'interrupted');
    assert.equal((await rpc('codex_approval_status')).result.structuredContent.state, 'unavailable');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('typecheck separado exige aprovação local e registra relatório consultável', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-check-'));
  let calls = 0;
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', build: 'vite build' } }));
    const stat = fs.statSync(dir);
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), active: new Map(), CODEX_JS: path.join(dir, 'missing-codex.js'), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir,
      projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino }],
      checkRunner: async (_root, script) => { calls++; return { script, state: 'passed', exit_code: 0 }; } });
    const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected original call'); });
    assert.equal((await rpc('codex_environment_check')).result.structuredContent.validation_scripts[0].available, true);
    assert.equal((await rpc('codex_execution_health')).result.structuredContent.lock_status, 'absent');
    const prepared = (await rpc('codex_run_typecheck', { action: 'prepare' })).result.structuredContent;
    assert.equal(prepared.state, 'awaiting_local_approval');
    assert.equal((await rpc('codex_run_typecheck', { action: 'start', request_id: prepared.request_id })).result.isError, true);
    assert.equal((await rpc('codex_build_project', { action: 'start', request_id: prepared.request_id })).result.isError, true);
    assert.equal(calls, 0);
    const response = () => ({ status: null, data: '', headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
    const page = response();
    await workflow.serveValidation({ method: 'GET', url: `/validate/${prepared.request_id}` }, page);
    assert.equal(page.status, 200);
    assert.match(page.data, /<main id="main-content">/);
    assert.match(page.data, /a\{color:#a8d5ff\}/);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(page.data)[1];
    const unchecked = response();
    await workflow.serveValidation(Object.assign(Readable.from([`csrf=${token}`]), { method: 'POST', url: `/validate/${prepared.request_id}`, headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_validation=${token}` } }), unchecked);
    assert.equal(unchecked.status, 400);
    assert.equal(calls, 0);
    const denied = response();
    await workflow.serveValidation(Object.assign(Readable.from([`csrf=${token}&confirm_project_scripts=yes`]), { method: 'POST', url: `/validate/${prepared.request_id}`, headers: { host: 'elsewhere.invalid', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_validation=${token}` } }), denied);
    assert.equal(denied.status, 403);
    const approved = response();
    await workflow.serveValidation(Object.assign(Readable.from([`csrf=${token}&confirm_project_scripts=yes`]), { method: 'POST', url: `/validate/${prepared.request_id}`, headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_validation=${token}` } }), approved);
    assert.equal(approved.status, 200);
    assert.equal((await rpc('codex_run_typecheck', { action: 'start', request_id: prepared.request_id })).result.structuredContent.state, 'running');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal((await rpc('codex_run_typecheck', { action: 'start', request_id: prepared.request_id })).result.isError, true);
    const report = (await rpc('codex_test_report', { task_id: prepared.request_id })).result.structuredContent;
    assert.equal(report.state, 'passed');
    assert.equal(report.electron_tests, 'not_run');
    assert.equal(report.checks[0].exit_code, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('validação separada executa um script npm inofensivo após aprovação local', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-npm-check-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"' } }));
    const stat = fs.statSync(dir);
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), active: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const commands = [];
    const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, projectConfig: [{ id: 'local', name: 'Local', root: dir, realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino }], checkRunner: async (_root, script) => { commands.push(`npm run ${script}`); return { script, state: 'passed', exit_code: 0 }; } });
    const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected original call'); });
    const prepared = (await rpc('codex_run_typecheck', { action: 'prepare' })).result.structuredContent;
    const id = prepared.request_id;
    assert.equal(prepared.command, 'npm run typecheck');
    const response = () => ({ status: null, data: '', writeHead(status) { this.status = status; return this; }, end(data = '') { this.data = data; return this; } });
    const page = response(); await workflow.serveValidation({ method: 'GET', url: `/validate/${id}` }, page);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(page.data)[1];
    const approved = response();
    await workflow.serveValidation(Object.assign(Readable.from([`csrf=${token}&confirm_project_scripts=yes`]), { method: 'POST', url: `/validate/${id}`, headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_validation=${token}` } }), approved);
    assert.equal(approved.status, 200);
    const packagePath = path.join(dir, 'package.json');
    const originalPackage = fs.readFileSync(packagePath, 'utf8');
    fs.writeFileSync(packagePath, JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(9)"' } }));
    assert.equal((await rpc('codex_run_typecheck', { action: 'start', request_id: id })).result.isError, true);
    fs.writeFileSync(packagePath, originalPackage);
    assert.equal((await rpc('codex_run_typecheck', { action: 'start', request_id: id })).result.structuredContent.state, 'running');
    let report;
    for (let attempt = 0; attempt < 200; attempt++) {
      report = (await rpc('codex_test_report', { task_id: id })).result.structuredContent;
      if (report.state !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(report.state, 'passed', JSON.stringify(report));
    assert.equal(report.checks[0].exit_code, 0);
    assert.deepEqual(commands, ['npm run typecheck']);
  } finally {
    const tempRoot = fs.realpathSync.native(os.tmpdir());
    assert.equal(path.dirname(fs.realpathSync.native(dir)).toLowerCase(), tempRoot.toLowerCase());
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('a execução exige aprovação local e a página registra a aprovação da tarefa correta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-approval-'));
  const id = '12345678-1234-4234-8234-123456789abc';
  const approvals = new Map([[id, { phrase: 'APROVAR teste', expiresAt: Date.now() + 60_000, used: false }]]);
  const selectedIdentity = { realpath: fs.realpathSync.native(dir), dev: fs.statSync(dir).dev, ino: fs.statSync(dir).ino };
  const tasks = new Map([[id, { id, state: 'prepared', prompt: 'Criar recurso <seguro>', project_directory: dir, project_identity: selectedIdentity }]]);
  fs.mkdirSync(path.join(dir, 'approvals'));
  let executed = false;
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, approvals, tasks, MAX_RESPONSE: 8000,
    safeText: x => String(x), callTool: async () => { executed = true; tasks.get(id).state = 'failed'; return { state: 'failed' }; } };
  const stat = fs.statSync(dir);
  const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino }] });
  const originalTools = [{ name: 'codex_status' }];
  const list = () => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, () => ({ result: { tools: originalTools } }));
  assert.equal((await list()).result.tools.length, 35);
  assert.equal((await list()).result.tools.length, 35);
  assert.equal(originalTools.length, 1);
  const rpc = (name, args) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected original call'); });
  const args = { task_id: id, approval_phrase: 'APROVAR teste' };
  assert.equal((await rpc('codex_execute_and_validate', args)).result.isError, true);
  assert.equal(executed, false);

  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const get = response();
    await workflow.serveApproval({ url: `/approve/${id}`, method: 'GET' }, get);
    assert.equal(get.status, 200);
    assert.match(get.data, /O que você está aprovando/);
    assert.match(get.data, /Executor:<\/strong> Codex/);
    assert.match(get.data, /Pasta selecionada:<\/strong>/);
    assert.match(get.data, /Uso:<\/strong> uma única execução/);
    assert.match(get.data, /Nenhum script npm ser.*iniciado automaticamente/);
    assert.match(get.data, /<details><summary>Ver instrução completa<\/summary>/);
    assert.match(get.data, /Criar recurso &lt;seguro&gt;/);
    assert.doesNotMatch(get.data, /<pre>Criar recurso <seguro><\/pre>/);
    assert.doesNotMatch(get.data, /npm run typecheck/);
    assert.match(get.data, /Sem sua aprovação, esta tarefa não começa\./);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(get.data)[1];
    const bad = response();
    await workflow.serveApproval(Object.assign(Readable.from([`csrf=${token}`]), { url: `/approve/${id}`, method: 'POST', headers: { host: 'malicious.invalid', origin: 'http://malicious.invalid', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_approval=${token}` } }), bad);
    assert.equal(bad.status, 403);
    assert.equal(fs.existsSync(path.join(dir, 'approvals', `${id}.approved.json`)), false);
    const wrongToken = response();
    await workflow.serveApproval(Object.assign(Readable.from(['csrf=wrong']), { url: `/approve/${id}`, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_approval=${token}` } }), wrongToken);
    assert.equal(wrongToken.status, 403);
    const approved = response();
    await workflow.serveApproval(Object.assign(Readable.from([`csrf=${token}`]), { url: `/approve/${id}`, method: 'POST', headers: { host: '127.0.0.1:18473', origin: 'null', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_approval=${token}` } }), approved);
    assert.equal(approved.status, 200);
    assert.equal((await rpc('codex_approval_status', { task_id: id })).result.structuredContent.state, 'approved');
    assert.equal((await rpc('codex_list_tasks', { limit: 5 })).result.structuredContent.tasks.length, 1);
    const dashboard = response();
    await workflow.serveDashboard({ url: '/dashboard', method: 'GET' }, dashboard);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.data, /Jarvis/);
    assert.match(dashboard.data, /Aprovada/);
    assert.equal((await rpc('codex_execute_and_validate', args)).result.structuredContent.state, 'running');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await rpc('codex_validation_result', { task_id: id })).result.structuredContent.state, 'skipped');
    assert.equal((await rpc('codex_task_progress', { task_id: id })).result.structuredContent.state, 'failed');
    assert.equal((await rpc('codex_task_logs', { task_id: id })).result.structuredContent.validation.state, 'skipped');
    const afterRestart = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino }] });
    const persisted = await afterRestart.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'codex_validation_result', arguments: { task_id: id } } }, () => { throw new Error('Unexpected original call'); });
    assert.equal(persisted.result.structuredContent.state, 'skipped');
    assert.equal(executed, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});



test('roteamento aplicado fica no snapshot, aparece na aprovação e governa os argumentos Hermes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routed-approval-'));
  const stat = fs.statSync(dir); const settingsFile = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ routing_revision: 4, routing: { active: true, enabled: ['hermes', 'codex'], primary: 'hermes', complex: 'codex', fallback: [], executors: { hermes: { provider: 'openrouter', model: 'provider/model', effort: 'high' }, codex: { model: 'gpt-6.1-sol', effort: 'xhigh' } } } }));
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), active: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x), projectPolicySnapshot: () => ({ project_id: 'routed', revision: 0 }) };
  let actualArgs;
  const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, enableHermesExecution: true, settingsFile,
    projectConfig: [{ id: 'routed', name: 'Projeto', root: dir, realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino }],
    hermesRunner: async args => { actualArgs = args; return { state: 'completed', output: 'ok' }; },
    checkRunner: async (_root, script) => ({ script, state: 'passed' }) });
  const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected original call'); });
  const response = () => ({ status: null, data: '', headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const prepared = (await rpc('codex_route_prepare_task', { task: 'Edite uma função pequena' })).result.structuredContent;
    assert.equal(prepared.routing_snapshot.executor, 'hermes');
    assert.equal(prepared.routing_snapshot.model, 'provider/model');
    const task = bridge.tasks.get(prepared.task_id);
    const approvalPage = response(); await workflow.serveApproval({ url: '/approve/' + prepared.task_id, method: 'GET' }, approvalPage);
    assert.match(approvalPage.data, /provider\/model/);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(approvalPage.data)[1];
    const approved = response();
    await workflow.serveApproval(Object.assign(Readable.from(['csrf=' + token]), { url: '/approve/' + prepared.task_id, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: 'codex_approval=' + token } }), approved);
    task.routing_snapshot = { ...task.routing_snapshot, model: 'tampered/model' };
    assert.equal((await rpc('codex_route_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result.isError, true);
    task.routing_snapshot = prepared.routing_snapshot;
    const executed = (await rpc('codex_route_execute_approved', { task_id: prepared.task_id, approval_phrase: prepared.approval_phrase })).result;
    assert.equal(executed.isError, false, executed.content?.map(item => item.text).join('\n') || 'Resposta sem conteúdo de diagnóstico');
    assert.equal(executed.structuredContent.state, 'running');
    for (let i = 0; i < 100 && !actualArgs; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(actualArgs, ['--provider', 'openrouter', '--model', 'provider/model', '--reasoning', 'high', '-z', 'Edite uma função pequena']);
    assert.equal(actualArgs[1], 'openrouter');
    assert.equal(actualArgs[3], 'provider/model');
    assert.equal(actualArgs[5], 'high');
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test('avaliador Codex limita preparo direto e bloqueia execução após redução do teto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-model-cap-'));
  const settingsFile = path.join(dir, 'settings.json');
  const config = { active: true, enabled: ['codex'], primary: 'codex', complex: 'codex', fallback: [], executors: { codex: { model: 'gpt-6.1-sol', effort: 'medium' } } };
  fs.writeFileSync(settingsFile, JSON.stringify({ routing_revision: 1, routing: config }));
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), active: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
  const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, settingsFile });
  let originalCalls = 0;
  const original = async message => {
    originalCalls++;
    const id = crypto.randomUUID();
    bridge.tasks.set(id, { id, state: 'prepared', executor: 'codex', project_directory: dir, expiresAt: Date.now() + 300_000, prompt: message.params.arguments.task });
    return { jsonrpc: '2.0', id: message.id, result: { isError: false, structuredContent: { task_id: id, project_directory: dir, summary: message.params.arguments.task, expires_in_seconds: 300, approval: 'awaiting_local_approval' }, content: [{ type: 'text', text: '' }] } };
  };
  const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, original);
  try {
    const evaluated = (await rpc('codex_model_evaluate', { task: 'Mude a cor do botão' })).result.structuredContent;
    assert.equal(evaluated.model, 'gpt-6-luna'); assert.equal(evaluated.effort, 'low');
    const prepared = (await rpc('codex_prepare_task', { task: 'Revise arquitetura e segurança', project_directory: dir })).result.structuredContent;
    assert.equal(prepared.routing_snapshot.model, 'gpt-6.1-sol');
    assert.equal(bridge.tasks.get(prepared.task_id).routing_snapshot.effort, 'medium');
    const routedReply = (await rpc('codex_route_prepare_task', { task: 'Mude a cor do botão', project_directory: dir })).result;
    assert.equal(routedReply.isError, false, routedReply.content?.[0]?.text);
    const routed = routedReply.structuredContent;
    assert.equal(routed.routing_snapshot.model, 'gpt-6-luna');
    assert.equal(routed.routing_snapshot.effort, 'low');
    const session = (await rpc('codex_model_session', { action: 'set', max_model: 'gpt-6-astra', max_effort: 'xhigh' })).result.structuredContent;
    const larger = (await rpc('codex_route_prepare_task', { task: 'Revise a arquitetura e segurança de todo o projeto', project_directory: dir })).result.structuredContent;
    assert.equal(larger.routing_snapshot.model, 'gpt-6-astra');
    assert.equal(larger.routing_snapshot.model_session_revision, 1);
    await rpc('codex_model_session', { action: 'set', session_id: session.session_id, max_model: 'gpt-6-luna', max_effort: 'low' });
    const staleSession = await rpc('codex_execute_and_validate', { task_id: larger.task_id, approval_phrase: 'unused' });
    assert.equal(staleSession.result.isError, true);
    assert.match(staleSession.result.content[0].text, /Política de modelo da sessão mudou/);
    fs.writeFileSync(settingsFile, JSON.stringify({ routing_revision: 2, routing: { ...config, executors: { codex: { model: 'gpt-6-luna', effort: 'low' } } } }));
    const blocked = await rpc('codex_execute_and_validate', { task_id: prepared.task_id, approval_phrase: 'unused' });
    assert.equal(blocked.result.isError, true);
    assert.match(blocked.result.content[0].text, /teto Codex|Avaliação Codex/);
    assert.equal(originalCalls, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('roteamento classifica as ferramentas novas e o snapshot Codex governa argumentos aprovados', async () => {
  const { annotateTools } = await import('./tool-annotations.mjs');
  const annotated = annotateTools([
    { name: 'codex_route_prepare_task' }, { name: 'codex_route_execute_approved' },
  ]);
  assert.deepEqual(annotated.map(tool => tool.annotations), [
    { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
  ]);
});

test('fluxos sem projeto padrão aceitam pasta explícita e diagnósticos globais não quebram', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-no-default-'));
  const project = path.join(dir, 'existing'); fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'README.md'), '# Selecionado');
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { typecheck: 'echo ok', build: 'echo ok' } }));
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map(), active: new Map(), CODEX_JS: null, MAX_RESPONSE: 8000, safeText: x => String(x) };
  const hermesCalls = [];
  const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir, enableHermesExecution: true,
    hermesRunner: async (args, _timeout, cwd) => { hermesCalls.push({ args, cwd }); return { state: 'completed', output: 'Hermes 1' }; } });
  const rpc = (name, args = {}) => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, () => { throw new Error('Unexpected original call'); });
  try {
    const firstHermesStatus = (await rpc('hermes_status')).result.structuredContent;
    assert.equal(firstHermesStatus.state, 'completed');
    assert.equal(firstHermesStatus.version_cache_hit, false);
    assert.ok(firstHermesStatus.command_duration_ms >= 0);
    assert.equal(hermesCalls[0].cwd, null);
    assert.equal((await rpc('codex_plugin_setup')).result.structuredContent.checks.project_registered, false);
    assert.equal((await rpc('codex_environment_check')).result.structuredContent.package_state, 'not_checked');
    assert.equal((await rpc('codex_environment_check', { project_directory: project })).result.structuredContent.package_state, 'readable');
    const hermesEnvironment = (await rpc('hermes_environment_check', { project_directory: project })).result.structuredContent;
    assert.equal(hermesEnvironment.project_identity_verified, true);
    assert.equal(hermesEnvironment.version_cache_hit, true);
    assert.equal(hermesCalls.length, 1);
    const readme = (await rpc('codex_project_readme', { project_directory: project })).result.structuredContent;
    assert.match(readme.readme, /Selecionado/);
    const note = (await rpc('codex_project_note', { project_directory: project, note: 'Próximo passo: revisar' })).result.structuredContent;
    assert.equal(note.state, 'saved');
    assert.equal((await rpc('codex_project_readme', { project_directory: project })).result.structuredContent.notes.length, 1);
    const prepared = (await rpc('hermes_prepare_task', { task: 'Editar arquivos', project_directory: project })).result.structuredContent;
    assert.equal(prepared.state, 'awaiting_local_approval');
    assert.equal(bridge.tasks.get(prepared.task_id).project_identity.realpath, fs.realpathSync.native(project));
    assert.equal((await rpc('hermes_list_tasks')).result.structuredContent.total, 1);
    assert.equal((await rpc('codex_list_tasks')).result.structuredContent.total, 0);
    assert.equal((await rpc('codex_execution_health')).result.structuredContent.lock_status, 'absent');
    assert.equal((await rpc('hermes_execution_health')).result.structuredContent.active_tasks, 0);
    assert.equal((await rpc('hermes_prepare_task', { task: 'sem pasta' })).result.isError, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test('orientação $graphify aparece somente quando Graphify foi selecionado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-graphify-guidance-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map(), MAX_RESPONSE: 8000, safeText: x => String(x) };
    const invokeInstructions = async () => {
      const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir });
      const result = await workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'codex_plugin_instructions', arguments: {} } }, () => ({ result: { tools: [] } }));
      return result.result.structuredContent;
    };
    let instructions = await invokeInstructions();
    assert.deepEqual(instructions.token_savings.graphify_guidance, []);
    assert.deepEqual(instructions.token_savings.task_guidance, []);
    assert.ok(!instructions.constraints.some(item => /\$graphify/.test(item)));
    fs.mkdirSync(path.join(dir, 'history'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'history', 'token-savings-preferences.json'), JSON.stringify({ selected: ['rtk'], skipped: false }));
    instructions = await invokeInstructions();
    assert.ok(!instructions.token_savings.graphify_guidance.some(item => /\$graphify/.test(item)));
    fs.writeFileSync(path.join(dir, 'history', 'token-savings-preferences.json'), JSON.stringify({ selected: ['graphify'], skipped: false }));
    instructions = await invokeInstructions();
    assert.ok(instructions.token_savings.graphify_guidance.some(item => /\$graphify/.test(item)));
    assert.ok(instructions.constraints.some(item => /\$graphify/.test(item)));
    fs.writeFileSync(path.join(dir, 'history', 'token-savings-preferences.json'), JSON.stringify({ selected: ['rtk', 'headroom', 'graphify', 'skills'], skipped: false }));
    instructions = await invokeInstructions();
    assert.equal(instructions.token_savings.task_guidance.length, 4);
    assert.ok(instructions.token_savings.task_guidance.some(item => /skills\.sh/.test(item)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Hermes status shares concurrent spawn and retries after timeout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hermes-status-cache-'));
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map(), active: new Map(), CODEX_JS: null, MAX_RESPONSE: 8000, safeText: x => String(x) };
  let calls = 0;
  const workflow = createWorkflow(bridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: dir,
    hermesRunner: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 25)); return { state: 'completed', output: 'Hermes 1' }; } });
  const rpc = name => workflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }, () => { throw new Error('Unexpected original call'); });
  try {
    const [status, environment] = await Promise.all([rpc('hermes_status'), rpc('hermes_environment_check')]);
    assert.equal(status.result.structuredContent.state, 'completed');
    assert.equal(environment.result.structuredContent.cli_state, 'completed');
    assert.equal(calls, 1);
    assert.equal([status.result.structuredContent.version_shared_inflight, environment.result.structuredContent.version_shared_inflight].filter(Boolean).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }

  const retryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hermes-status-retry-'));
  const retryBridge = { LOCK_PATH: path.join(retryDir, 'active.lock'), tasks: new Map(), approvals: new Map(), active: new Map(), CODEX_JS: null, MAX_RESPONSE: 8000, safeText: x => String(x) };
  let attempts = 0;
  const retryWorkflow = createWorkflow(retryBridge, { baseUrl: 'http://127.0.0.1:18473', dashboardRoot: retryDir,
    hermesRunner: async () => ++attempts === 1 ? { state: 'timeout', output: '' } : { state: 'completed', output: 'Hermes 1' } });
  const retryRpc = () => retryWorkflow.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'hermes_status', arguments: {} } }, () => { throw new Error('Unexpected original call'); });
  try {
    assert.equal((await retryRpc()).result.structuredContent.state, 'timeout');
    const recovered = (await retryRpc()).result.structuredContent;
    assert.equal(recovered.state, 'completed');
    assert.equal(recovered.version_cache_hit, false);
    assert.equal(attempts, 2);
  } finally { fs.rmSync(retryDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

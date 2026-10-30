test('navegação compartilhada agrupa destinos e marca a página atual', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-dashboard-nav-'));
  const isolatedDirectories = [path.join(dir, 'history'), path.join(dir, 'reports'), path.join(dir, 'approvals')];
  for (const directory of isolatedDirectories) fs.mkdirSync(directory, { recursive: true });
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const routes = ['/dashboard', '/dashboard/codex-workshop', '/dashboard/catalog', '/dashboard/coming-soon', '/dashboard/retention', '/dashboard/requests', '/dashboard/routing', '/dashboard/tunnels', '/dashboard/mcps', '/dashboard/impact', '/dashboard/token-savings'];
    const links = [['/dashboard','Início'], ['/dashboard/codex-workshop','Oficina Codex'], ['/dashboard/catalog','Projetos'], ['/dashboard/coming-soon','Em breve'], ['/dashboard/retention','Retencao'], ['/dashboard/requests','Requests'], ['/dashboard/routing','Roteamento'], ['/dashboard/tunnels','Tunnels'], ['/dashboard/mcps','MCPs'], ['/dashboard/impact','Impacto'], ['/dashboard/token-savings','Economia de tokens']];
    for (const route of routes) {
      const res = response(); await dashboard.serve({ url: route, method: 'GET' }, res);
      assert.equal(res.status, 200);
      for (const group of ['Operação', 'Configuração', 'Relatórios']) assert.ok(res.data.includes('>' + group + '</h2>'));
      for (const [href, label] of links) assert.ok(res.data.includes('href="' + href + '">' + label + '</a>') || res.data.includes('href="' + href + '" aria-current="page">' + label + '</a>'));
      const nav = /<nav\b[^>]*>([\s\S]*?)<\/nav>/.exec(res.data)?.[1];
      assert.ok(nav, 'navigation block is present');
      assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
      assert.ok(res.data.includes('href="' + route + '" aria-current="page"'));
    }
    const archiveDir = path.join(dir, 'history', 'retention-archive');
    assert.ok(fs.existsSync(archiveDir));
    for (const directory of [...isolatedDirectories, archiveDir]) {
      assert.ok(path.resolve(directory).startsWith(path.resolve(dir) + path.sep));
      assert.ok(fs.existsSync(directory));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard guia configuração de MCP sem projeto, guarda roteiro local e acompanha progresso manual', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-dashboard-mcp-'));
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const fieldsFrom = data => new URLSearchParams({ csrf: /name="csrf" value="([0-9a-f]+)"/.exec(data)?.[1] || '' });
  const post = async (page, route, fields) => {
    const cookie = page.headers['Set-Cookie'].split(';')[0];
    const out = response();
    await dashboard.serve(Object.assign(Readable.from([fields.toString()]), { url: route, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), out);
    return out;
  };
  try {
    let page = response(); await dashboard.serve({ url: '/dashboard/mcps', method: 'GET' }, page);
    assert.equal(page.status, 200);
    assert.match(page.data, /sem cadastrar um projeto/i);
    assert.match(page.data, /Roteiros salvos neste computador \(0\)/);
    assert.match(page.data, /target_clients/);
    assert.match(page.data, /O que vou receber para cada CLI\?/);
    assert.match(page.data, /OpenCode CLI:<\/strong> recebe trecho JSON\/JSONC para mesclar/);
    assert.match(page.data, /Passo 2: escolha em quais CLIs preparar instruções/);
    const invalid = fieldsFrom(page.data); invalid.set('server_name', 'Agenda'); invalid.set('connection_type', 'remote_url'); invalid.set('server_url', 'https://mcp.example.com/mcp?token=private'); invalid.set('authentication', 'api_key'); invalid.append('target_clients', 'hermes_cli');
    page = await post(page, '/dashboard/mcps/setup', invalid);
    assert.equal(page.status, 400);
    assert.doesNotMatch(page.data, /private/);
    assert.equal(fs.existsSync(path.join(dir, 'history', 'mcp-setups.json')), false);
    const fields = fieldsFrom(page.data);
    fields.set('server_name', 'Agenda'); fields.set('connection_type', 'remote_url'); fields.set('server_url', 'https://mcp.example.com/mcp'); fields.set('authentication', 'oauth');
    fields.append('target_clients', 'hermes_cli'); fields.append('target_clients', 'codex_cli');
    page = await post(page, '/dashboard/mcps/setup', fields);
    assert.equal(page.status, 200);
    assert.match(page.data, /Roteiro de Agenda salvo localmente/);
    assert.match(page.data, /hermes mcp add &#39;Agenda&#39;/);
    assert.match(page.data, /codex mcp add &#39;Agenda&#39;/);
    assert.match(page.data, /O progresso é uma anotação local sua/);
    assert.equal(fs.existsSync(path.join(dir, 'config.toml')), false);
    const storeFile = path.join(dir, 'history', 'mcp-setups.json');
    const saved = JSON.parse(fs.readFileSync(storeFile, 'utf8')).setups[0];
    assert.deepEqual(saved.target_clients, ['hermes_cli', 'codex_cli']);
    assert.equal(saved.server_url, 'https://mcp.example.com/mcp');
    let statusFields = fieldsFrom(page.data); statusFields.set('id', saved.id); statusFields.set('client', 'hermes_cli'); statusFields.set('status', 'configured');
    page = await post(page, '/dashboard/mcps/status', statusFields);
    assert.equal(page.status, 200);
    assert.match(page.data, /Progresso local atualizado/);
    assert.match(page.data, /Configurado por você/);
    assert.equal(JSON.parse(fs.readFileSync(storeFile, 'utf8')).setups[0].statuses.hermes_cli, 'configured');
    let removeFields = fieldsFrom(page.data); removeFields.set('id', saved.id);
    page = await post(page, '/dashboard/mcps/remove', removeFields);
    assert.equal(page.status, 200);
    assert.match(page.data, /Roteiro removido do histórico local/);
    assert.equal(JSON.parse(fs.readFileSync(storeFile, 'utf8')).setups.length, 0);
    let stdioPage = response(); await dashboard.serve({ url: '/dashboard/mcps', method: 'GET' }, stdioPage);
    let stdioFields = fieldsFrom(stdioPage.data); stdioFields.set('server_name', 'Files'); stdioFields.set('connection_type', 'local_stdio'); stdioFields.set('authentication', 'none'); stdioFields.set('stdio_command', 'npx'); stdioFields.set('stdio_args_json', JSON.stringify(['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Data'])); stdioFields.append('target_clients', 'opencode_cli');
    stdioPage = await post(stdioPage, '/dashboard/mcps/setup', stdioFields);
    assert.equal(stdioPage.status, 200);
    assert.match(stdioPage.data, /&quot;type&quot;: &quot;local&quot;/);
    assert.match(stdioPage.data, /&quot;command&quot;: \[/);
    assert.match(stdioPage.data, /Servidor local \(stdio\): npx -y @modelcontextprotocol\/server-filesystem/);
    const stdioSaved = JSON.parse(fs.readFileSync(storeFile, 'utf8')).setups[0];
    assert.equal(stdioSaved.stdio_command, 'npx');
    assert.deepEqual(stdioSaved.stdio_args, ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Data']);
    let secretPage = response(); await dashboard.serve({ url: '/dashboard/mcps', method: 'GET' }, secretPage);
    let secretFields = fieldsFrom(secretPage.data); secretFields.set('server_name', 'Bad'); secretFields.set('connection_type', 'local_stdio'); secretFields.set('authentication', 'none'); secretFields.set('stdio_command', 'npx'); secretFields.set('stdio_args_json', '["--token=hidden-value"]'); secretFields.append('target_clients', 'codex_cli');
    secretPage = await post(secretPage, '/dashboard/mcps/setup', secretFields);
    assert.equal(secretPage.status, 400);
    assert.doesNotMatch(secretPage.data, /hidden-value/);
    assert.equal(JSON.parse(fs.readFileSync(storeFile, 'utf8')).setups.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createDashboard } from './dashboard.mjs';


test('adds a remote Codex MCP only after trust consent and rejects duplicate names', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-dashboard-add-mcp-'));
  const codexHome = path.join(dir, 'codex-home');
  fs.mkdirSync(codexHome);
  const fakeCodex = path.join(dir, 'fake-codex.cjs');
  const argsFile = path.join(dir, 'args.json');
  const previousHome = process.env.CODEX_HOME;
  const previousArgsFile = process.env.CODEX_TEST_ARGS_FILE;
  process.env.CODEX_HOME = codexHome;
  process.env.CODEX_TEST_ARGS_FILE = argsFile;
  const fakeSource = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const args = process.argv.slice(2);',
    "const config = path.join(process.env.CODEX_HOME, 'config.toml');",
    "if (args[0] === 'mcp' && args[1] === 'add') {",
    "  fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });",
    "  const url = args[args.indexOf('--url') + 1];",
    "  fs.appendFileSync(config, '[mcp_servers.' + args[2] + ']\\nurl = \"' + url + '\"\\n');",
    "  fs.writeFileSync(process.env.CODEX_TEST_ARGS_FILE, JSON.stringify(args));",
    "  process.stdout.write('Added');",
    "} else if (args[0] === 'mcp' && args[1] === 'list') {",
    "  const content = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';",
    "  for (const match of content.matchAll(/^\\[mcp_servers\\.([^\\]]+)\\]/gm)) process.stdout.write(match[1] + '\\n');",
    '} else process.exitCode = 2;'
  ].join(String.fromCharCode(10));
  fs.writeFileSync(fakeCodex, fakeSource);
  const dashboard = createDashboard({ CODEX_JS: fakeCodex, LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async () => { const page = response(); await dashboard.serve({ url: '/dashboard/mcps', method: 'GET' }, page); return page; };
  const fieldsFrom = page => new URLSearchParams({ csrf: /name="csrf" value="([0-9a-f]+)"/.exec(page.data)?.[1] || '' });
  const post = async (page, fields) => { const cookie = page.headers['Set-Cookie'].split(';')[0]; const out = response(); await dashboard.serve(Object.assign(Readable.from([fields.toString()]), { url: '/dashboard/mcps/codex-create', method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), out); return out; };
  const fill = page => { const fields = fieldsFrom(page); fields.set('codex_server_name', 'DocsMCP'); fields.set('codex_description', 'Internal docs'); fields.set('codex_connection_type', 'tunnel'); fields.set('codex_server_url', 'https://mcp.example.com/mcp'); fields.set('codex_authentication', 'bearer_env'); fields.set('codex_auth_env_var', 'TEST_MCP_TOKEN'); fields.set('codex_trust_confirm', 'yes'); return fields; };
  try {
    let page = await get();
    assert.equal(page.status, 200);
    assert.match(page.data, /Adicionar servidor ao Codex/);
    const unconfirmedFields = fill(page); unconfirmedFields.delete('codex_trust_confirm');
    const unconfirmed = await post(page, unconfirmedFields);
    assert.equal(unconfirmed.status, 400);
    assert.equal(fs.existsSync(argsFile), false);
    page = await get();
    page = await post(page, fill(page));
    assert.equal(page.status, 200);
    assert.match(page.data, /DocsMCP adicionado ao Codex/);
    const args = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
    assert.deepEqual(args, ['mcp', 'add', 'DocsMCP', '--url', 'https://mcp.example.com/mcp', '--bearer-token-env-var', 'TEST_MCP_TOKEN']);
    assert.match(fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'), /\[mcp_servers\.DocsMCP\]/);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'codex-mcp-servers.json'), 'utf8')).servers[0];
    assert.equal(saved.description, 'Internal docs');
    assert.equal(saved.connection_type, 'tunnel');
    assert.equal(saved.auth_env_var, 'TEST_MCP_TOKEN');
    const duplicatePage = await get();
    const duplicate = await post(duplicatePage, fill(duplicatePage));
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.data, /DocsMCP/);
    assert.equal(JSON.parse(fs.readFileSync(argsFile, 'utf8')).length, args.length);
  } finally {
    if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome;
    if (previousArgsFile === undefined) delete process.env.CODEX_TEST_ARGS_FILE; else process.env.CODEX_TEST_ARGS_FILE = previousArgsFile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detalhe de tarefa concluída mescla métricas do relatório e mostra indisponível com escape HTML', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-profile-'));
  const id = 'a3b14d40-bb7f-405f-bb12-458efb87c76c';
  const reports = path.join(dir, 'reports'); fs.mkdirSync(reports);
  fs.writeFileSync(path.join(reports, `${id}.json`), JSON.stringify({ id, state: 'completed', durationMs: 1234, latency_ms: { process_end: 1200, response_extraction: null }, model: '<model>', effort: 'high' }));
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
  const res = { headers: {}, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } };
  try {
    await dashboard.serve({ url: `/dashboard/task/${id}`, method: 'GET' }, res);
    assert.equal(res.status, 200);
    assert.match(res.data, /Perfil de execução/);
    assert.match(res.data, /Modelo: &lt;model&gt;/);
    assert.match(res.data, /Esforço: high/);
    assert.match(res.data, /Duração total: 1234 ms/);
    assert.match(res.data, /process_end: 1200 ms/);
    assert.match(res.data, /response_extraction: indisponível/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('impacto importa e deduplica agregados, agrega período e exige CSRF sem projeto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-impact-'));
  const projects = [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir) }, { id: 'ultron', name: 'Ultron', root: null }];
  const day = offset => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: projects });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async (period, project) => { const query = new URLSearchParams(); if (period) query.set('period', period); if (project) query.set('project', project); const res = response(); await dashboard.serve({ url: `/dashboard/impact${query.size ? `?${query}` : ''}`, method: 'GET' }, res); return res; };
  const post = async (res, route, fields, csrf = /name="csrf" value="([0-9a-f]+)"/.exec(res.data)?.[1]) => { const cookie = res.headers['Set-Cookie'].split(';')[0]; const body = new URLSearchParams({ ...fields, csrf }).toString(); const out = response(); await dashboard.serve(Object.assign(Readable.from([body]), { url: route, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), out); return out; };
  try {
    let page = await get();
    assert.equal(page.status, 200); assert.match(page.data, /Sem dados neste per[ií]odo/); assert.match(page.data, /name="period"/); assert.match(page.data, /href="\#importar-dados"/); assert.match(page.data, /href="\#comparacao-manual"/); assert.match(page.data, /id="importar-dados"/); assert.match(page.data, /id="comparacao-manual"/);
    const payload = JSON.stringify([{ date: day(2), tokens_saved: 1200, id: 'same' }]);
    assert.equal((await post(page, '/dashboard/impact/import', { source: 'RTK', report: payload }, 'invalid')).status, 403);
    page = await get();
    assert.equal((await post(page, '/dashboard/impact/import', { source: 'RTK', report: payload })).status, 200);
    page = await get();
    const assigned = await post(page, '/dashboard/impact/import', { source: 'RTK', report: payload, project: 'jarvis' });
    assert.equal(assigned.status, 200);
    assert.match(assigned.data, /1 registro\(s\) existente\(s\) atribu[ií]do\(s\) agora ao projeto escolhido/);
    page = await get();
    assert.equal((await post(page, '/dashboard/impact/import', { source: 'RTK', report: payload, project: 'ultron' })).status, 400);
    const projectOnly = await get('monthly', 'jarvis');
    assert.match(projectOnly.data, /Exibindo: <strong>Jarvis<\/strong>/);
    assert.match(projectOnly.data, /RTK, importados: 1\.200 tokens/);
    page = await get();
    assert.equal((await post(page, '/dashboard/impact/import', { source: 'RTK', report: payload })).status, 200);
    page = await get();
    const rtkAggregated = JSON.stringify({ total_saved: 15, by_day: { [day(4)]: 10, [day(15)]: 5 } });
    assert.equal((await post(page, '/dashboard/impact/import', { source: 'RTK', report: rtkAggregated })).status, 200);
    page = await get('monthly');
    assert.match(page.data, /1\.215/); assert.match(page.data, /<svg/); assert.match(page.data, /role="img"/); assert.match(page.data, /RTK/);
    assert.match(page.data, /Gráfico de colunas agrupadas: tokens importados e manuais por origem/);
    assert.match(page.data, /aria-label="RTK, importados: 1\.215 tokens"/);
    assert.match(page.data, /aria-label="Legenda do gráfico"/);
    assert.match(page.data, /Importados/); assert.match(page.data, /Manuais/);
    assert.match(page.data, /<rect[^>]+fill="#64d693"/);
    assert.match(page.data, /<rect[^>]+fill="#79b9ff"/);
    assert.equal(fs.readdirSync(path.join(dir, 'history')).filter(name => name === 'impact.json').length, 1);
    const headroom = await get();
    assert.equal((await post(headroom, '/dashboard/impact/import', { source: 'Headroom', report: JSON.stringify({ ts: `${day(3)}T18:30:00Z`, saved: 50 }) })).status, 200);
    const invalid = await get();
    assert.equal((await post(invalid, '/dashboard/impact/import', { source: 'RTK', report: '{"date":"bad","tokens_saved":-1}' })).status, 400);
    const manual = await get();
    assert.equal((await post(manual, '/dashboard/impact/manual', { source: 'CLI', date: day(1), before: '500', after: '320' })).status, 200);
    assert.match((await get()).data, /n[aã]o s[aã]o telemetria CodexBridge/);
    const restarted = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
    const persisted = response(); await restarted.serve({ url: '/dashboard/impact?period=daily', method: 'GET' }, persisted);
    assert.match(persisted.data, /1\.440/);
    const weekly = response(); await restarted.serve({ url: '/dashboard/impact?period=weekly', method: 'GET' }, weekly);
    assert.match(weekly.data, /<svg/); assert.match(weekly.data, /1\.445/);
    const monthly = response(); await restarted.serve({ url: '/dashboard/impact?period=monthly', method: 'GET' }, monthly);
    assert.match(monthly.data, /1\.445/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('painel recusa uma tarefa e conserva a decisão após reiniciar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-dashboard-'));
  const id = 'd9443b93-9ac5-4e16-a32c-e8d2dd73ba9d';
  const approvalsDir = path.join(dir, 'approvals');
  fs.mkdirSync(approvalsDir);
  fs.writeFileSync(path.join(approvalsDir, `${id}.pending.json`), JSON.stringify({ task_id: id, expiresAt: Date.now() + 60_000, summary: 'Criar menu' }));
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map([[id, { state: 'prepared', prompt: 'Criar menu' }]]), approvals: new Map([[id, { expiresAt: Date.now() + 60_000 }]]) };
  const options = { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir) }, { id: 'ultron', name: 'Ultron', root: null }] };
  const dashboard = createDashboard(bridge, options);
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    dashboard.save(id, { project_id: 'jarvis', prompt: 'Criar menu', state: 'pending', expires_at: new Date(Date.now() + 60_000).toISOString() });
    const overview = response();
    await dashboard.serve({ url: '/dashboard', method: 'GET' }, overview);
    assert.equal(overview.status, 200);
    assert.match(overview.data, /Jarvis/);
    assert.match(overview.data, /Ultron/);
    const detail = response();
    await dashboard.serve({ url: `/dashboard/task/${id}`, method: 'GET' }, detail);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(detail.data)[1];
    const denied = response();
    await dashboard.serve(Object.assign(Readable.from(['csrf=wrong']), { url: `/dashboard/reject/${id}`, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_dashboard=${token}` } }), denied);
    assert.equal(denied.status, 403);
    assert.equal(bridge.tasks.get(id).state, 'prepared');
    const rejected = response();
    await dashboard.serve(Object.assign(Readable.from([`csrf=${token}`]), { url: `/dashboard/reject/${id}`, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_dashboard=${token}` } }), rejected);
    assert.equal(rejected.status, 200);
    assert.equal(bridge.tasks.get(id).state, 'rejected');
    assert.equal(bridge.approvals.has(id), false);
    assert.equal(createDashboard(bridge, options).records().find(t => t.task_id === id).state, 'rejected');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preferências de roteamento têm GET protegido, salvamento validado e revisão crescente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-routing-ui-'));
  const file = path.join(dir, 'config', 'settings.json');
  fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, JSON.stringify({ other_local_option: 'preservar' }));
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, settingsFile: file, baseUrl: 'http://127.0.0.1:18473' });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async () => { const res = response(); await dashboard.serve({ url: '/dashboard/routing', method: 'GET' }, res); return { res, token: /name="csrf" value="([0-9a-f]+)"/.exec(res.data)[1], cookie: res.headers['Set-Cookie'].split(';')[0] }; };
  const sendPost = async (fields, token, cookie, host = '127.0.0.1:18473') => { const res = response(); const body = new URLSearchParams({ ...fields, csrf: token }).toString(); await dashboard.serve(Object.assign(Readable.from([body]), { url: '/dashboard/routing', method: 'POST', headers: { host, 'content-type': 'application/x-www-form-urlencoded', cookie } }), res); return res; };
  const valid = { active: 'yes', enabled: 'codex', primary: 'codex', complex: 'codex', codex_model: 'gpt-6-luna', codex_provider: '', codex_effort: 'low', hermes_model: '', hermes_provider: '', hermes_effort: '', fallback: '' };
  try {
    const first = await get();
    assert.equal(first.res.status, 200); assert.match(first.res.data, /n[aã]o recebe chaves de API/i); assert.match(first.res.data, /Revis[aã]o atual: sem prefer[eê]ncias salvas/);
    assert.match(first.res.data, /Modelo mestre \(teto\)/); assert.match(first.res.data, /Pensamento máximo/);
    assert.equal((await sendPost(valid, first.token, first.cookie, 'attacker.test')).status, 403);
    const page1 = await get(); assert.equal((await sendPost(valid, page1.token, 'codex_dashboard=wrong')).status, 403);
    const page2 = await get(); const saved = await sendPost({ ...valid, codex_model: 'inválido com espaços' }, page2.token, page2.cookie); assert.equal(saved.status, 400); assert.match(saved.data, /Não foi possível salvar/);
    const page3 = await get(); const result = await sendPost(valid, page3.token, page3.cookie); assert.equal(result.status, 200, result.data); assert.match(result.data, /Revis[aã]o 1/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).other_local_option, 'preservar');
    const page4 = await get(); const second = await sendPost({ ...valid, active: '' }, page4.token, page4.cookie); assert.equal(second.status, 200, second.data); assert.match(second.data, /Revis[aã]o 2/);
    const settings = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(settings.routing.active, false); assert.equal(settings.routing_revision, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cadastro solicita nome e pasta e conserva a identidade do projeto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-project-'));
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const options = { root: dir, baseUrl: 'http://127.0.0.1:18473' };
  const dashboard = createDashboard(bridge, options);
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    assert.equal(dashboard.verifyProject(dir).ok, false);
    const form = response();
    await dashboard.serve({ url: '/dashboard/projects/new', method: 'GET' }, form);
    assert.equal(form.status, 200);
    assert.match(form.data, /seleciona nem autoriza uma pasta para execu/);
    assert.match(form.data, /Cada tarefa em arquivos informa uma pasta existente em project_directory/);
    assert.doesNotMatch(form.data, /só pode trabalhar no projeto escolhido explicitamente quando foi iniciado/);
    assert.match(form.data, /Guias, ajuda, recursos e diagnóstico da conexão continuam disponíveis sem projeto cadastrado/);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(form.data)[1];
    const registered = response();
    const body = new URLSearchParams({ name: 'Projeto de teste', root: dir, csrf: token }).toString();
    await dashboard.serve(Object.assign(Readable.from([body]), { url: '/dashboard/projects', method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_dashboard=${token}` } }), registered);
    assert.equal(registered.status, 200);
    assert.match(registered.data, /<main id="main-content">/);
    assert.match(registered.data, /volte.{1,3}conversa do Codex conectada ao CodexBridge/);
    assert.match(registered.data, /cadastro.*organiza o painel.*inicia nem autoriza/s);
    assert.match(registered.data, /project_directory/);
    assert.match(registered.data, /href="\/dashboard\/mcps">Ver conex.o MCP/);
    assert.equal(bridge.AUTHORIZED_PROJECT, dir);
    assert.equal(createDashboard(bridge, options).verifyProject(dir).ok, true);
    const events = fs.readFileSync(path.join(dir, 'history', 'project-events.jsonl'), 'utf8');
    assert.match(events, /"action":"configured"/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('política começa em manual, persiste por identidade e incrementa revisão ao revogar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-policy-'));
  try {
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
    const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
    const registered = dashboard.configureProject('Projeto', dir).project;
    assert.equal(registered.approval_policy, undefined);
    const enabled = dashboard.setApprovalPolicy(registered.id, 'project_auto');
    assert.equal(enabled.level, 'project_auto');
    assert.equal(enabled.revision, 1);
    const revoked = dashboard.setApprovalPolicy(registered.id, 'manual');
    assert.equal(revoked.level, 'manual');
    assert.equal(revoked.revision, 2);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'projects.json'), 'utf8')).projects[0];
    assert.equal(saved.approval_policy.revision, 2);
    assert.equal(saved.approval_policy.identity.ino, fs.statSync(dir).ino);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('painel filtra tarefas por projeto, estado e texto e oferece recarga manual', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-dashboard-filter-'));
  const pendingId = 'd9443b93-9ac5-4e16-a32c-e8d2dd73ba9d';
  const rejectedId = '1041891f-a0e5-45fc-955c-4eff665b1d3e';
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map([[pendingId, { id: pendingId, state: 'prepared' }]]), approvals: new Map() };
  const options = { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir) }, { id: 'ultron', name: 'Ultron', root: null }] };
  const dashboard = createDashboard(bridge, options);
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    dashboard.save(pendingId, { project_id: 'jarvis', project_directory: dir, executor: 'codex', prompt: 'Corrigir botão de busca', summary: 'Corrigir botão de busca', state: 'pending', created_at: new Date().toISOString() });
    dashboard.save(rejectedId, { project_id: 'ultron', executor: 'hermes', prompt: 'Tarefa arquivada', summary: 'Tarefa arquivada', state: 'rejected', created_at: new Date().toISOString() });
    const filtered = response();
    await dashboard.serve({ url: '/dashboard?state=pending&project=jarvis&q=bot%C3%A3o&sort=newest', method: 'GET' }, filtered);
    assert.equal(filtered.status, 200);
    assert.match(filtered.data, /Tarefas recentes \(1\)/);
    assert.match(filtered.data, new RegExp(pendingId));
    assert.doesNotMatch(filtered.data, new RegExp(rejectedId));
    assert.match(filtered.data, /Aplicar filtros/);
    assert.match(filtered.data, /Atualizar/);
    assert.match(filtered.data, /Limpar/);
    const overview = response();
    await dashboard.serve({ url: '/dashboard', method: 'GET' }, overview);
    assert.match(overview.data, /Resumo das tarefas/);
    assert.match(overview.data, /Tarefas recentes \(2\)/);
    const details = response();
    await dashboard.serve({ url: `/dashboard/task/${pendingId}`, method: 'GET' }, details);
    assert.match(details.data, /Pr[oó]ximo passo/);
    assert.match(details.data, /se algo estiver estranho, recuse/i);
    const empty = response();
    await dashboard.serve({ url: '/dashboard?state=completed', method: 'GET' }, empty);
    assert.match(empty.data, /Nenhuma tarefa corresponde aos filtros/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard raiz e histórico do projeto renderizam português correto sem reescrever registros', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-dashboard-utf8-'));
  const id = 'd9443b93-9ac5-4e16-a32c-e8d2dd73ba9d';
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir) }] });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    dashboard.save(id, { project_id: 'jarvis', summary: 'Tarefa histórica', state: 'completed' });
    const recordPath = path.join(dir, 'history', `${id}.json`);
    const before = fs.readFileSync(recordPath, 'utf8');
    const eventsPath = path.join(dir, 'history', 'project-events.jsonl');
    fs.writeFileSync(eventsPath, `${JSON.stringify({ action: 'configured', project_id: 'jarvis', at: '2026-10-24T12:00:00.000Z', identity: { realpath: dir } })}\n`);
    const beforeEvents = fs.readFileSync(eventsPath, 'utf8');

    const home = response();
    await dashboard.serve({ url: '/dashboard', method: 'GET' }, home);
    assert.match(home.data, /Painel de aprovações/);
    assert.match(home.data, /Resumo das tarefas/);
    assert.match(home.data, /Tarefas recentes \(1\)/);
    assert.doesNotMatch(home.data, /�f|�,|â|£|§|©|³|¡|­|µ|º|�/);

    const project = response();
    await dashboard.serve({ url: '/dashboard/project/jarvis', method: 'GET' }, project);
    assert.match(project.data, /Histórico da identidade/);
    assert.match(project.data, /Nenhuma verificação anterior|Projeto registrado/);
    assert.doesNotMatch(project.data, /�f|�,|â|£|§|©|³|¡|­|µ|º|�/);
    assert.equal(fs.readFileSync(recordPath, 'utf8'), before);
    assert.equal(fs.readFileSync(eventsPath, 'utf8'), beforeEvents);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tarefa preparada perde a condição de pendente ao reiniciar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-expired-'));
  try {
    const id = '1041891f-a0e5-45fc-955c-4eff665b1d3e';
    const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
    const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [{ id: 'jarvis', name: 'Jarvis', realpath: dir, root: dir }] });
    dashboard.save(id, { project_id: 'jarvis', project_directory: dir, state: 'prepared', expires_at: new Date(Date.now() + 60_000).toISOString() });
    assert.equal(dashboard.records().find(x => x.task_id === id).state, 'expired');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Requests mostra as seis seções e filtra por projeto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-requests-'));
  const ids = ['d9443b93-9ac5-4e16-a32c-e8d2dd73ba9d', '1041891f-a0e5-45fc-955c-4eff665b1d3e', '2512396d-5f35-4daa-9db4-1bad75f6f7ab'];
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const options = { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [{ id: 'jarvis', name: 'Jarvis', root: dir, realpath: fs.realpathSync.native(dir) }, { id: 'ultron', name: 'Ultron', root: null }] };
  const dashboard = createDashboard(bridge, options);
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    dashboard.save(ids[0], { project_id: 'jarvis', summary: 'Aprovada', state: 'approved', approved_at: new Date().toISOString() });
    dashboard.save(ids[1], { project_id: 'jarvis', summary: 'Recusada', state: 'rejected' });
    dashboard.save(ids[2], { project_id: 'ultron', summary: 'Expirada', state: 'expired' });
    const all = response();
    await dashboard.serve({ url: '/dashboard/requests', method: 'GET' }, all);
    assert.equal(all.status, 200);
    for (const section of [/Recentes/, /Conclu.das/, /Expiradas/, /Tempo esgotado/, /Exclu.das/, /Recusadas/]) assert.match(all.data, section);
    assert.match(all.data, /Resumo das aprova/);
    const home = response();
    await dashboard.serve({ url: '/dashboard', method: 'GET' }, home);
    assert.match(home.data, /class="donut"/);
    assert.match(home.data, /aprovadas; 1 recusadas/);
    const jarvis = response();
    await dashboard.serve({ url: '/dashboard/requests?project=jarvis', method: 'GET' }, jarvis);
    assert.match(jarvis.data, /Jarvis/);
    assert.match(jarvis.data, new RegExp(ids[0]));
    assert.doesNotMatch(jarvis.data, new RegExp(ids[2]));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('request encerrada pode ser movida para Excluídas e restaurada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-archive-'));
  const id = 'd9443b93-9ac5-4e16-a32c-e8d2dd73ba9d';
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const post = async (route, token) => {
    const res = response();
    await dashboard.serve(Object.assign(Readable.from([`csrf=${token}`]), { url: route, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: `codex_dashboard=${token}` } }), res);
    return res;
  };
  try {
    dashboard.save(id, { project_id: 'unconfigured', summary: 'Request finalizada', state: 'rejected' });
    const detail = response();
    await dashboard.serve({ url: `/dashboard/task/${id}`, method: 'GET' }, detail);
    let token = /name="csrf" value="([0-9a-f]+)"/.exec(detail.data)[1];
    assert.equal((await post(`/dashboard/delete/${id}`, token)).status, 200);
    assert.equal(dashboard.records().find(x => x.task_id === id).state, 'deleted');
    const deleted = response();
    await dashboard.serve({ url: `/dashboard/task/${id}`, method: 'GET' }, deleted);
    token = /name="csrf" value="([0-9a-f]+)"/.exec(deleted.data)[1];
    assert.equal((await post(`/dashboard/restore/${id}`, token)).status, 200);
    assert.equal(dashboard.records().find(x => x.task_id === id).state, 'rejected');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard cria, edita e remove perfil de tunnel sem armazenar chave', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tunnel-ui-'));
  const tunnelDir = path.join(dir, 'tunnel-client');
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473', tunnelProfilesDir: tunnelDir });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const getForm = async url => {
    const res = response();
    await dashboard.serve({ url, method: 'GET' }, res);
    return { res, token: /name="csrf" value="([0-9a-f]+)"/.exec(res.data)[1], cookie: res.headers['Set-Cookie'].split(';')[0] };
  };
  const postForm = async (route, fields, token, cookie) => {
    const res = response();
    const body = new URLSearchParams({ ...fields, csrf: token, runtime_key: 'must-never-be-saved' }).toString();
    await dashboard.serve(Object.assign(Readable.from([body]), { url: route, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), res);
    return res;
  };
  try {
    const page = await getForm('/dashboard/tunnels');
    assert.match(page.res.data, /Configurar tunnels/);
    assert.match(page.res.data, /href="\/dashboard\/tunnels"/);
    const steps = /<ol class="setup-steps">([\s\S]*?)<\/ol>/.exec(page.res.data);
    assert.ok(steps, 'assistente visual de configuração está presente');
    assert.equal((steps[1].match(/<li>/g) || []).length, 3);
    assert.match(steps[1], /Escolha ou crie o Tunnel na OpenAI Platform/);
    assert.match(steps[1], /Salve o ID abaixo/);
    assert.match(steps[1], /Inicie o adapter e o tunnel/);
    assert.match(steps[1], /mesmo Tunnel ID no ChatGPT/);
    assert.match(page.res.data, /Sem projeto: ficam disponíveis guias e diagnósticos/);
    assert.match(page.res.data, /runtime key será solicitada de forma oculta/);
    assert.doesNotMatch(page.res.data, /name="runtime_key"/);
    assert.match(page.res.data, /settings\/organization\/api-keys/);
    assert.match(page.res.data, /Conectar em três passos/);
    assert.match(page.res.data, /URL MCP local/);
    assert.match(page.res.data, /Não cole a API key neste campo/);
    assert.match(page.res.data, /settings\/organization\/tunnels/);
    assert.match(page.res.data, /settings\/Connectors/);
    assert.doesNotMatch(page.res.data, /name="mcp_url" type="url" required/);
    const added = await postForm('/dashboard/tunnels/save', { profile: 'test-tunnel', tunnel_id: 'tunnel_12345678abcdef00', mcp_url: '', health_port: '18081', id: '' }, page.token, page.cookie);
    assert.equal(added.status, 200, added.data);
    const profileFile = path.join(tunnelDir, 'test-tunnel.yaml');
    const initialYaml = fs.readFileSync(profileFile, 'utf8');
    assert.match(initialYaml, /tunnel_12345678abcdef00/);
    assert.match(initialYaml, /env:CONTROL_PLANE_API_KEY/);
    assert.match(initialYaml, /server_urls:/);
    assert.ok(initialYaml.includes('url: "http://127.0.0.1:18473/mcp"'), 'empty URL uses the local MCP endpoint');
    assert.doesNotMatch(initialYaml, /must-never-be-saved/);
    const registry = fs.readFileSync(path.join(dir, 'history', 'tunnel-profiles.json'), 'utf8');
    assert.doesNotMatch(registry, /must-never-be-saved/);
    const editPage = await getForm('/dashboard/tunnels');
    assert.match(editPage.res.data, /Perfis locais salvos \(1\)/);
    assert.match(editPage.res.data, /test-tunnel/);
    const id = JSON.parse(registry).profiles[0].id;
    const edited = await postForm('/dashboard/tunnels/save', { profile: 'test-tunnel', tunnel_id: 'tunnel_87654321fedcba00', mcp_url: 'https://example.test/mcp', health_port: '18082', id }, editPage.token, editPage.cookie);
    assert.equal(edited.status, 200);
    assert.match(fs.readFileSync(profileFile, 'utf8'), /tunnel_87654321fedcba00/);
    assert.equal(fs.readdirSync(tunnelDir).filter(name => name.includes('.backup-')).length, 1);
    const removePage = await getForm('/dashboard/tunnels');
    const removed = await postForm('/dashboard/tunnels/remove', { id }, removePage.token, removePage.cookie);
    assert.equal(removed.status, 200);
    assert.equal(fs.existsSync(profileFile), false);
    assert.equal(fs.readdirSync(tunnelDir).filter(name => name.includes('.removed-') && name.endsWith('.bak')).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard não sobrescreve arquivo de perfil existente nem removido fora dele', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tunnel-guard-'));
  const tunnelDir = path.join(dir, 'tunnel-client');
  fs.mkdirSync(tunnelDir);
  fs.writeFileSync(path.join(tunnelDir, 'keep.yaml'), 'personal: true\n');
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473', tunnelProfilesDir: tunnelDir });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const form = response();
    await dashboard.serve({ url: '/dashboard/tunnels', method: 'GET' }, form);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(form.data)[1];
    const cookie = form.headers['Set-Cookie'].split(';')[0];
    const body = new URLSearchParams({ csrf: token, profile: 'keep', tunnel_id: 'tunnel_12345678abcdef00', mcp_url: 'http://127.0.0.1:18473/mcp', health_port: '18081' }).toString();
    const denied = response();
    await dashboard.serve(Object.assign(Readable.from([body]), { url: '/dashboard/tunnels/save', method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), denied);
    assert.equal(denied.status, 400);
    assert.equal(fs.readFileSync(path.join(tunnelDir, 'keep.yaml'), 'utf8'), 'personal: true\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard bloqueia edição se perfil gerenciado foi alterado externamente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tunnel-tamper-'));
  const tunnelDir = path.join(dir, 'tunnel-client');
  const bridge = { LOCK_PATH: path.join(dir, 'active.lock'), AUTHORIZED_PROJECT: dir, tasks: new Map(), approvals: new Map() };
  const dashboard = createDashboard(bridge, { root: dir, baseUrl: 'http://127.0.0.1:18473', tunnelProfilesDir: tunnelDir });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const initial = response();
    await dashboard.serve({ url: '/dashboard/tunnels', method: 'GET' }, initial);
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(initial.data)[1];
    const cookie = initial.headers['Set-Cookie'].split(';')[0];
    const addBody = new URLSearchParams({ csrf: token, profile: 'tamper-test', tunnel_id: 'tunnel_12345678abcdef00', mcp_url: 'http://127.0.0.1:18473/mcp', health_port: '18081' }).toString();
    const added = response();
    await dashboard.serve(Object.assign(Readable.from([addBody]), { url: '/dashboard/tunnels/save', method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), added);
    assert.equal(added.status, 200);
    const file = path.join(tunnelDir, 'tamper-test.yaml');
    fs.appendFileSync(file, '# external change\n');
    const registry = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'tunnel-profiles.json'), 'utf8'));
    const id = registry.profiles[0].id;
    const editForm = response();
    await dashboard.serve({ url: `/dashboard/tunnels?edit=${id}`, method: 'GET' }, editForm);
    const editToken = /name="csrf" value="([0-9a-f]+)"/.exec(editForm.data)[1];
    const editCookie = editForm.headers['Set-Cookie'].split(';')[0];
    const editBody = new URLSearchParams({ csrf: editToken, id, profile: 'tamper-test', tunnel_id: 'tunnel_87654321fedcba00', mcp_url: 'http://127.0.0.1:18473/mcp', health_port: '18081' }).toString();
    const denied = response();
    await dashboard.serve(Object.assign(Readable.from([editBody]), { url: '/dashboard/tunnels/save', method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie: editCookie } }), denied);
    assert.equal(denied.status, 400);
    assert.match(fs.readFileSync(file, 'utf8'), /external change/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('opções de economia de tokens salvam, persistem, validam CSRF e permitem pular', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-token-savings-'));
  const options = { root: dir, baseUrl: 'http://127.0.0.1:18473' };
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async dashboard => { const res = response(); await dashboard.serve({ url: '/dashboard/token-savings', method: 'GET' }, res); return { res, token: /name="csrf" value="([0-9a-f]+)"/.exec(res.data)?.[1], cookie: res.headers['Set-Cookie']?.split(';')[0] }; };
  const post = async (dashboard, fields, token, cookie, host = '127.0.0.1:18473') => { const res = response(); const params = new URLSearchParams(); for (const [key, value] of Object.entries(fields)) { for (const item of Array.isArray(value) ? value : [value]) params.append(key, item); } params.append('csrf', token); const body = params.toString(); await dashboard.serve(Object.assign(Readable.from([body]), { url: '/dashboard/token-savings', method: 'POST', headers: { host, 'content-type': 'application/x-www-form-urlencoded', cookie } }), res); return res; };
  try {
    const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, options);
    const initial = await get(dashboard);
    assert.equal(initial.res.status, 200);
    assert.match(initial.res.data, /token-savings|Graphify/i);
    assert.match(initial.res.data, /Pular por enquanto/);
    assert.match(initial.res.data, /value="skills"/);
    assert.match(initial.res.data, /value="token-monitor"/);
    assert.equal((await post(dashboard, { intent: 'save', selected: ['rtk', 'graphify'] }, initial.token, initial.cookie, 'attacker.test')).status, 403);
    const stale = await get(dashboard);
    assert.equal((await post(dashboard, { intent: 'save', selected: 'graphify' }, stale.token, 'codex_dashboard=wrong')).status, 403);
    const saveForm = await get(dashboard);
    assert.equal((await post(dashboard, { intent: 'save', selected: ['rtk', 'graphify', 'skills', 'token-monitor'] }, saveForm.token, saveForm.cookie)).status, 200);
    const preferenceFile = path.join(dir, 'history', 'token-savings-preferences.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(preferenceFile, 'utf8')).selected, ['rtk', 'graphify', 'skills', 'token-monitor']);
    const restarted = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, options);
    const persisted = await get(restarted);
    assert.match(persisted.res.data, /value="rtk" checked/);
    assert.match(persisted.res.data, /value="graphify" checked/);
    assert.match(persisted.res.data, /value="skills" checked/);
    assert.match(persisted.res.data, /value="token-monitor" checked/);
    assert.match(persisted.res.data, /Ver grafos Graphify/);
    assert.match(persisted.res.data, /Obter Token Monitor/);
    const skipForm = await get(restarted);
    assert.equal((await post(restarted, { intent: 'skip' }, skipForm.token, skipForm.cookie)).status, 200);
    const skipped = JSON.parse(fs.readFileSync(preferenceFile, 'utf8'));
    assert.deepEqual(skipped.selected, []);
    assert.equal(skipped.skipped, true);
    assert.match((await get(restarted)).res.data, /Pular por enquanto/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sincronização sob demanda importa só a série diária do RTK e é idempotente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-rtk-sync-'));
  let calls = 0;
  const report = JSON.stringify({ summary: { total_saved: 9999 }, daily: [
    { date: '2026-10-23', saved_tokens: 120 },
    { date: '2026-10-24', saved: 35 },
  ] });
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, {
    root: dir, baseUrl: 'http://127.0.0.1:18473',
    rtkReport: async () => { calls += 1; return report; },
  });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async () => { const res = response(); await dashboard.serve({ url: '/dashboard/token-savings', method: 'GET' }, res); return res; };
  const post = async (form, route, fields = {}, host = '127.0.0.1:18473') => {
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(form.data)?.[1];
    const cookie = form.headers['Set-Cookie']?.split(';')[0];
    const body = new URLSearchParams({ ...fields, csrf: token }).toString();
    const out = response();
    await dashboard.serve(Object.assign(Readable.from([body]), { url: route, method: 'POST', headers: { host, 'content-type': 'application/x-www-form-urlencoded', cookie } }), out);
    return out;
  };
  try {
    let form = await get();
    assert.equal(calls, 0, 'abrir o dashboard não executa RTK');
    form = await post(form, '/dashboard/token-savings', { intent: 'save', selected: 'rtk' });
    assert.equal(form.status, 200);
    assert.match(form.data, /Atualizar dados do RTK/);
    assert.ok(form.headers['Set-Cookie'], 'salvar preferências renova o cookie CSRF para a ação seguinte');
    assert.equal((await post(form, '/dashboard/token-savings/rtk-sync', {}, 'attacker.test')).status, 403);
    assert.equal(calls, 0, 'origem não autorizada não inicia o executável');
    form = await post(form, '/dashboard/token-savings/rtk-sync');
    assert.equal(form.status, 200);
    assert.match(form.data, /2 registro\(s\) diário\(s\) do RTK importado\(s\)/);
    let saved = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'impact.json'), 'utf8')).events;
    assert.deepEqual(saved.map(event => event.tokens), [120, 35]);
    assert.equal(calls, 1);
    form = await post(form, '/dashboard/token-savings/rtk-sync');
    assert.match(form.data, /nenhum registro duplicado/);
    saved = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'impact.json'), 'utf8')).events;
    assert.equal(saved.length, 2);
    assert.equal(calls, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sincronização RTK informa falha de instalação e recusa relatório sem série diária', async () => {
  for (const [name, rtkReport, expected] of [
    ['missing', async () => { const error = new Error('private executable path'); error.code = 'ENOENT'; throw error; }, /RTK não encontrado/],
    ['timeout', async () => { const error = new Error('private command details'); error.killed = true; error.code = 'ETIMEDOUT'; throw error; }, /excedeu o tempo limite/],
    ['permission', async () => { const error = new Error('private process details'); error.code = 'EPERM'; throw error; }, /Windows bloqueou a execução do RTK/],
    ['aggregate', async () => JSON.stringify({ summary: { total_saved: 500 } }), /não trouxe uma série diária/],
    ['invalid', async () => 'not json', /relatório RTK válido/],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codex-rtk-${name}-`));
    const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473', rtkReport });
    const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
    const get = async () => { const res = response(); await dashboard.serve({ url: '/dashboard/token-savings', method: 'GET' }, res); return res; };
    const post = async (form, route, fields = {}) => {
      const token = /name="csrf" value="([0-9a-f]+)"/.exec(form.data)?.[1];
      const cookie = form.headers['Set-Cookie']?.split(';')[0];
      const body = new URLSearchParams({ ...fields, csrf: token }).toString();
      const out = response();
      await dashboard.serve(Object.assign(Readable.from([body]), { url: route, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), out);
      return out;
    };
    try {
      let form = await get();
      form = await post(form, '/dashboard/token-savings', { intent: 'save', selected: 'rtk' });
      form = await post(form, '/dashboard/token-savings/rtk-sync');
      assert.equal(form.status, 200);
      assert.match(form.data, expected);
      assert.equal(fs.existsSync(path.join(dir, 'history', 'impact.json')), false, 'falhas não gravam dados');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('sincronização Headroom importa ledger local, ignora apenas a linha final incompleta e deduplica', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-headroom-sync-'));
  const ledgerFile = path.join(dir, 'headroom', 'savings_events.jsonl');
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  const first = { v: 1, ts: '2026-10-23T12:00:00Z', before: 100, after: 20, saved: 80, cost_usd: 0.01, model: 'test-model', client: 'codex', source: 'mcp', pid: 123 };
  const second = { v: 1, ts: '2026-10-24T12:00:00Z', before: 50, after: 20, saved: 30, cost_usd: 0.005, model: 'test-model', client: 'codex', source: 'proxy', pid: 124 };
  fs.writeFileSync(ledgerFile, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n{"v":1`);
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473', headroomLedgerFile: ledgerFile });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async () => { const res = response(); await dashboard.serve({ url: '/dashboard/token-savings', method: 'GET' }, res); return res; };
  const post = async (form, route, fields = {}, host = '127.0.0.1:18473') => {
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(form.data)?.[1];
    const cookie = form.headers['Set-Cookie']?.split(';')[0];
    const body = new URLSearchParams({ ...fields, csrf: token }).toString();
    const out = response();
    await dashboard.serve(Object.assign(Readable.from([body]), { url: route, method: 'POST', headers: { host, 'content-type': 'application/x-www-form-urlencoded', cookie } }), out);
    return out;
  };
  try {
    let form = await get();
    assert.doesNotMatch(form.data, /Atualizar dados do Headroom/);
    form = await post(form, '/dashboard/token-savings', { intent: 'save', selected: 'headroom' });
    assert.equal(form.status, 200);
    assert.match(form.data, /Atualizar dados do Headroom/);
    assert.equal((await post(form, '/dashboard/token-savings/headroom-sync', {}, 'attacker.test')).status, 403);
    form = await post(form, '/dashboard/token-savings/headroom-sync');
    assert.equal(form.status, 200);
    assert.match(form.data, /2 registro\(s\) do Headroom importado\(s\)/);
    let events = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'impact.json'), 'utf8')).events;
    assert.deepEqual(events.map(event => event.tokens), [80, 30]);
    assert.deepEqual(events.map(event => event.source), ['Headroom', 'Headroom']);
    form = await post(form, '/dashboard/token-savings/headroom-sync');
    assert.match(form.data, /nenhum registro duplicado/);
    events = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'impact.json'), 'utf8')).events;
    assert.equal(events.length, 2);
    fs.writeFileSync(ledgerFile, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n${JSON.stringify({ ...second, ts: '2026-10-25T12:00:00Z', saved: 10 })}\n`);
    form = await post(form, '/dashboard/token-savings/headroom-sync');
    events = JSON.parse(fs.readFileSync(path.join(dir, 'history', 'impact.json'), 'utf8')).events;
    assert.equal(events.length, 3);
    assert.match(form.data, /1 registro\(s\) do Headroom importado\(s\)/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sincronização Headroom orienta quando o ledger ainda não existe e não cria dados', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-headroom-missing-'));
  const ledgerFile = path.join(dir, 'missing', 'savings_events.jsonl');
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473', headroomLedgerFile: ledgerFile });
  const response = () => ({ headers: {}, status: null, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  const get = async () => { const res = response(); await dashboard.serve({ url: '/dashboard/token-savings', method: 'GET' }, res); return res; };
  const post = async (form, route, fields = {}) => {
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(form.data)?.[1];
    const cookie = form.headers['Set-Cookie']?.split(';')[0];
    const body = new URLSearchParams({ ...fields, csrf: token }).toString();
    const out = response();
    await dashboard.serve(Object.assign(Readable.from([body]), { url: route, method: 'POST', headers: { host: '127.0.0.1:18473', 'content-type': 'application/x-www-form-urlencoded', cookie } }), out);
    return out;
  };
  try {
    let form = await get();
    form = await post(form, '/dashboard/token-savings', { intent: 'save', selected: 'headroom' });
    form = await post(form, '/dashboard/token-savings/headroom-sync');
    assert.equal(form.status, 200);
    assert.match(form.data, /O ledger ainda não existe/);
    assert.equal(fs.existsSync(path.join(dir, 'history', 'impact.json')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('dashboard de primeira visita prioriza cadastro e oferece guias sem projeto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-empty-'));
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473' });
  const res = { headers: {}, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } };
  try {
    await dashboard.serve({ url: '/dashboard', method: 'GET' }, res);
    assert.equal(res.status, 200);
    assert.match(res.data, /Primeira visita/);
    assert.match(res.data, /href="\/dashboard\/projects\/new"[^>]*>Cadastrar primeiro projeto/);
    assert.match(res.data, /Guias e diagnósticos estão disponíveis sem projeto cadastrado/);
    assert.match(res.data, /Resumo das tarefas/);
    assert.match(res.data, /Tarefas recentes \(0\)/);
    assert.match(res.data, /href="\/dashboard\/routing"/);
    assert.match(res.data, /href="\/dashboard\/tunnels"/);
    assert.match(res.data, /href="\/dashboard\/impact"[^>]*>Abrir diagnóstico de impacto/);
    assert.match(res.data, /cada tarefa recebe sua pasta explicitamente/);
    assert.doesNotMatch(res.data, /tunnel.{0,30}conectado|ChatGPT.{0,30}conectado/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Graphify abre apenas o grafo do projeto cadastrado e com identidade preservada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-graphify-view-'));
  const graphDir = path.join(dir, 'graphify-out');
  fs.mkdirSync(graphDir);
  fs.writeFileSync(path.join(graphDir, 'graph.html'), '<h1>Grafo local</h1>');
  const stat = fs.statSync(dir);
  const project = { id: 'sample', name: 'Exemplo', realpath: fs.realpathSync.native(dir), dev: stat.dev, ino: stat.ino };
  const response = () => ({ status: null, headers: {}, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } });
  try {
    const dashboard = createDashboard({ tasks: new Map(), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [project] });
    const listing = response();
    await dashboard.serve({ method: 'GET', url: '/dashboard/graphify' }, listing);
    assert.equal(listing.status, 200);
    assert.match(listing.data, /Abrir grafo/);
    const view = response();
    await dashboard.serve({ method: 'GET', url: '/dashboard/graphify/view?project=sample' }, view);
    assert.equal(view.status, 200);
    assert.match(String(view.data), /Grafo local/);
    assert.match(view.headers['Content-Security-Policy'], /sandbox allow-scripts/);
    const unknown = response();
    await dashboard.serve({ method: 'GET', url: '/dashboard/graphify/view?project=other' }, unknown);
    assert.equal(unknown.status, 404);
    project.ino = -1;
    const changed = response();
    await dashboard.serve({ method: 'GET', url: '/dashboard/graphify/view?project=sample' }, changed);
    assert.equal(changed.status, 404);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard com projeto prioriza requests e resume as tarefas locais', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-project-'));
  const id = 'd9443b93-9ac5-4e16-a32c-e8d2dd73ba9d';
  const project = { id: 'projeto-local', name: 'Meu projeto', root: dir };
  const dashboard = createDashboard({ LOCK_PATH: path.join(dir, 'active.lock'), tasks: new Map([[id, {}]]), approvals: new Map() }, { root: dir, baseUrl: 'http://127.0.0.1:18473', projectConfig: [project] });
  const res = { headers: {}, data: '', writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(data = '') { this.data = data; return this; } };
  try {
    dashboard.save(id, { project_id: project.id, summary: 'Revisar arquivo local', state: 'pending' });
    await dashboard.serve({ url: '/dashboard', method: 'GET' }, res);
    assert.equal(res.status, 200);
    assert.match(res.data, /Uso diário/);
    assert.match(res.data, /href="\/dashboard\/requests"[^>]*>Revisar requests/);
    assert.match(res.data, /Meu projeto/);
    assert.match(res.data, /Resumo das tarefas/);
    assert.match(res.data, /Tarefas recentes \(1\)/);
    assert.match(res.data, /1 pendentes/);
    assert.match(res.data, /Revisar arquivo local/);
    assert.match(res.data, /class="donut"/);
    assert.match(res.data, /cada tarefa recebe sua pasta explicitamente/);
    assert.doesNotMatch(res.data, /tunnel.{0,30}conectado|ChatGPT.{0,30}conectado/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

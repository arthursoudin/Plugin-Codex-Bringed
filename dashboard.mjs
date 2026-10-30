import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRoutingSettings, saveRoutingSettings, validateRoutingPreferences } from './routing.mjs';
import { MCP_CLIENTS, prepareMcpSetup } from './mcp-setup.mjs';
import { projectCatalog, PROJECT_CATALOG_CHECKED_AT } from './project-catalog.mjs';
import { createTaskRetention, TASK_RETENTION } from './task-retention.mjs';
import { createChildEnvironment, terminateProcessTree } from './process-safety.mjs';

function execFileAsync(file, args, options = {}) {
  const timeoutMs = Number(options.timeout) || 0;
  return new Promise((resolve, reject) => {
    let child;
    let timeoutError = null;
    let timer;
    const finish = (error, stdout, stderr) => {
      if (timer) clearTimeout(timer);
      if (error) {
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') terminateProcessTree(child);
        error.stdout ??= stdout;
        error.stderr ??= stderr;
        reject(timeoutError || error);
      } else if (timeoutError) {
        timeoutError.stdout = stdout;
        timeoutError.stderr = stderr;
        reject(timeoutError);
      } else resolve({ stdout, stderr });
    };
    try { child = execFile(file, args, { ...options, timeout: 0 }, finish); }
    catch (error) { reject(error); return; }
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timeoutError = Object.assign(new Error(`Command timed out after ${timeoutMs} ms`), { code: 'ETIMEDOUT', killed: true });
        terminateProcessTree(child);
      }, timeoutMs);
    }
  });
}
async function readRtkReport() {
  const command = process.platform === 'win32' ? 'rtk.exe' : 'rtk';
  const { stdout } = await execFileAsync(command, ['gain', '--all', '--format', 'json'], {
    encoding: 'utf8', timeout: 8_000, maxBuffer: 1_000_000, windowsHide: true, shell: false, env: createChildEnvironment(),
  });
  return stdout;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9_-]{1,40}$/;
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formatTime = x => x ? new Date(x).toLocaleString('pt-BR') : '—';
const page = (title, content, current = '') => {
  const link = (href, label) => `<a class="navlink" href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`;
  const mainContent = /<main\b/i.test(content) ? content : `<main id="main-content">${content}</main>`;
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>:root{color-scheme:dark}body{font:15px system-ui;line-height:1.5;background:#101318;color:#e8edf3;max-width:1120px;margin:0 auto;padding:24px}a{color:#a8d5ff}.site-header{margin-bottom:30px}.site-header nav{display:flex;gap:clamp(12px,2vw,24px);align-items:stretch;flex-wrap:wrap;padding:14px;background:#1d232c;border:1px solid #3a4553;border-radius:12px}.brand{align-self:center;margin-right:8px}.nav-group{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.nav-group h2{font-size:12px;line-height:1.2;text-transform:uppercase;letter-spacing:.08em;color:#c1cbd7;margin:0 2px 0 0}.navlink{font:inherit;background:#252d38;color:#e8edf3;border:1px solid #526071;border-radius:8px;padding:8px 12px;text-decoration:none}.navlink:hover{background:#334354}.navlink:focus-visible{outline:3px solid #79b9ff;outline-offset:2px}.navlink[aria-current="page"]{background:#bdedc7;color:#102017;border-color:#bdedc7;font-weight:700;box-shadow:inset 0 -3px 0 #315f3e}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end}.filter-grid label,.field{display:grid;gap:5px}.filter-grid input,.filter-grid select,.field input,.field select{font:inherit;color:inherit;background:#101318;border:1px solid #526071;border-radius:7px;padding:9px}.card{background:#1d232c;border:1px solid #3a4553;border-radius:12px;padding:18px;margin:12px 0}h1,h2{line-height:1.2}.muted{color:#afbac8}.badge{border-radius:20px;background:#334354;padding:3px 10px}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}button,.button{font:inherit;background:#bdedc7;color:#102017;border:0;border-radius:7px;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-block}button.secondary{background:#3a4553;color:#e8edf3}.button.secondary{background:#3a4553;color:#e8edf3}button.reject{background:#f4bab6;color:#2c1211}button.archive{background:#3a4553;color:#e8edf3}button.danger{background:#f4bab6;color:#2c1211}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0e1116;border-radius:8px;padding:16px}form{display:inline-block}.filters{background:#1d232c;border:1px solid #3a4553;border-radius:12px;padding:16px;margin:18px 0}.stats{display:flex;gap:10px;flex-wrap:wrap}.stats span{background:#252d38;border-radius:20px;padding:5px 11px}.setup-steps{display:grid;gap:14px;padding-left:24px}.setup-steps li{padding:12px 14px;background:#252d38;border-radius:8px}.setup-steps p{margin:8px 0 0}.next-step{background:#202a35;border-left:4px solid #8fc9a1;padding:12px 16px;border-radius:6px}summary{cursor:pointer;font-weight:600}.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}.project-card{display:flex;gap:16px;align-items:center}.donut{width:92px;height:92px;flex:none;border-radius:50%;display:grid;place-items:center;position:relative}.donut:before{content:"";position:absolute;inset:12px;background:#1d232c;border-radius:50%}.donut span{position:relative;font-weight:700;font-size:14px;text-align:center;line-height:1.1}.legend{display:flex;gap:8px 14px;flex-wrap:wrap;font-size:13px}.legend span:before{content:"";display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:50%;background:var(--dot)}.project-chooser{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.project-chooser a{background:#252d38;color:#e8edf3;border:1px solid #3a4553;border-radius:999px;padding:8px 13px;text-decoration:none}.project-chooser a.active{background:#bdedc7;color:#102017;border-color:#bdedc7}.chart{max-width:700px}.chart-row{display:grid;grid-template-columns:130px 1fr 50px;align-items:center;gap:12px;margin:10px 0}.bar-track{height:14px;background:#303946;border-radius:99px;overflow:hidden}.bar{height:100%;border-radius:99px;background:#64d693}.bar.red{background:#f17777}.bar.white{background:#f1f3f5}.bar.amber{background:#e7b85c}.workshop-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px;align-items:start}.work-station{padding:14px;background:#171c23;border:1px solid #3a4553;border-radius:12px;min-width:0}.work-station h2{font-size:1.05rem}.work-task{padding:12px;margin:10px 0;background:#252d38;border:1px solid #3a4553;border-radius:9px;overflow-wrap:anywhere}.work-task h3{font-size:1rem;margin:.7em 0}.work-task p{margin:.5em 0}.workshop-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,.75fr);gap:16px}.workshop-heading{display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap}.workshop-heading h2{margin:.45em 0}.workshop-state{max-width:400px;padding:9px 13px;border:1px solid #648c70;border-radius:999px;background:#203128}.workshop-scene{padding:18px;background:radial-gradient(ellipse at 50% 45%,#34404a 0,#202832 62%,#171c23 100%);border:1px solid #526071;border-radius:16px;overflow:hidden}.workshop-floor{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:14px 6px 20px;transform:skewY(-2deg);background:linear-gradient(145deg,#3a4850,#25332f 52%,#293746);border:1px solid #586d67;border-radius:16px;box-shadow:0 20px 30px #0005}.workshop-tile{position:relative;display:flex;min-height:98px;flex-direction:column;justify-content:center;align-items:center;gap:7px;padding:10px;text-align:center;color:inherit;background:linear-gradient(150deg,#303946,#20262e);border:1px solid #596777;border-radius:10px;transform:skewY(2deg);box-shadow:0 5px 0 #12171c;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}.workshop-icon{font-size:1.6rem;color:#bde8ce}.workshop-tile strong{font-size:.82rem;line-height:1.25}.workshop-tile.is-active{border:2px solid #a6e4b5;box-shadow:0 0 18px #71d69655,0 5px 0 #12171c;transform:skewY(2deg) translateY(-4px)}.workshop-tile.is-complete:not(.is-active){border-color:#6b9f7a}.workshop-agent{position:absolute;top:-19px;right:3px;padding:3px 7px;background:#bdedc7;border-radius:50%;font-size:1.25rem;box-shadow:0 3px 8px #0005;animation:workshop-bob 2s ease-in-out infinite}@keyframes workshop-bob{50%{transform:translateY(-4px)}}.workshop-layout[data-state=pending] .workshop-state{background:#3a3020;border-color:#a78140}.workshop-layout[data-state=failed] .workshop-state,.workshop-layout[data-state=timeout] .workshop-state{background:#3a2225;border-color:#ba7378}.workshop-layout[data-state=cancelled] .workshop-state{background:#30333a;border-color:#7e8792}.workshop-layout[data-state=completed] .workshop-state{background:#203128;border-color:#648c70}.workshop-controls{display:grid;gap:8px;margin:14px 0}.workshop-controls label{display:flex;gap:9px;align-items:center}.workshop-task-picker{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:14px 0}.workshop-task-picker label{display:grid;gap:5px}.workshop-task-picker select{font:inherit;padding:9px;color:inherit;background:#101318;border:1px solid #526071;border-radius:7px}.workshop-feed{padding:14px;border:1px solid #3a4553;border-radius:12px;background:#1d232c}.workshop-feed ol{padding-left:24px}.workshop-feed li{margin:8px 0}.workshop-feed summary{overflow-wrap:anywhere}.workshop-feed time{font-variant-numeric:tabular-nums}.workshop-layout [hidden]{display:none!important}.workshop-no-motion *{animation:none!important;transition:none!important}@media(prefers-reduced-motion:reduce){.workshop-tile,.workshop-agent{transition:none!important;animation:none!important}}@media(max-width:760px){.workshop-layout{grid-template-columns:1fr}.workshop-floor{grid-template-columns:repeat(2,minmax(0,1fr))}.workshop-state{max-width:none}}.request-section{scroll-margin-top:20px}.mcp-targets{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:10px 0}.mcp-target{padding:10px;background:#252d38;border:1px solid #3a4553;border-radius:8px}.mcp-profile{border-left:4px solid #79b9ff}.mcp-command{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.mcp-status{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.mcp-status label{display:grid;gap:4px}.progress-track{height:8px;background:#303946;border-radius:99px;overflow:hidden}.progress-value{height:100%;background:#64d693}.field{margin:12px 0}.field input,.field select{width:100%;box-sizing:border-box}.checklist{display:flex;gap:8px;flex-wrap:wrap}.checklist label{background:#252d38;border-radius:8px;padding:8px 10px}@media(max-width:540px){body{padding:16px}.site-header{margin-bottom:22px}.site-header nav{gap:14px}.brand{width:100%}.nav-group{width:100%;align-items:flex-start}.nav-group h2{width:100%;margin-bottom:2px}.chart-row{grid-template-columns:105px 1fr 40px;gap:8px}.project-card{align-items:flex-start}.donut{width:78px;height:78px}}</style><style>html{scroll-behavior:smooth}body{max-width:1240px}.site-header{position:sticky;top:8px;z-index:10;backdrop-filter:blur(10px)}.card,.filters{box-shadow:0 8px 24px #00000012}.card h2{letter-spacing:-.02em}.home-shortcuts{counter-reset:journey}.home-shortcuts>a{transition:transform .16s ease,border-color .16s ease}.home-shortcuts>a:hover{transform:translateY(-2px);border-color:#79b9ff}.home-shortcuts>a:before{counter-increment:journey;content:"0" counter(journey);font-size:.76rem;font-weight:750;color:#bdedc7;letter-spacing:.08em}.home-shortcuts>a span{line-height:1.4}.chart-data table{width:100%;border-collapse:collapse;margin-top:12px}.chart-data th,.chart-data td{text-align:left;padding:8px;border-bottom:1px solid #526071}.filter-grid select:focus-visible,.filter-grid input:focus-visible,button:focus-visible,.button:focus-visible{outline:3px solid #79b9ff;outline-offset:2px}@media(prefers-color-scheme:light){:root{color-scheme:light}body{background:#f4f6f8;color:#20252d}a{color:#1769aa}.site-header nav,.card,.filters,.home-shortcuts>a,.mcp-target{background:#fff;border-color:#d9dfe7}.site-header nav{box-shadow:0 8px 24px #1e293b12}.nav-group h2,.muted,.home-shortcuts span{color:#5d6673}.navlink,.project-chooser a{background:#f0f3f7;color:#28313c;border-color:#d3dae4}.navlink:hover,.home-shortcuts>a:hover{background:#e8eef5}.navlink[aria-current=page],.project-chooser a.active{background:#d8f3e4;color:#143324;border-color:#8cc6a3}.filter-grid input,.filter-grid select,.field input,.field select{background:#fff;color:#20252d;border-color:#c8d0db}.stats span,.setup-steps li,.mcp-target,.checklist label{background:#edf1f5}.badge{background:#e5eaf0;color:#344154}pre{background:#edf1f5;color:#20252d}.next-step{background:#e8f4ec}.donut:before{background:#fff}.bar-track,.progress-track{background:#e2e7ed}.chart-data th,.chart-data td{border-color:#d9dfe7}.work-station{background:#edf1f5;border-color:#d9dfe7}.work-task{background:#fff;border-color:#d9dfe7}.workshop-scene{background:radial-gradient(ellipse at 50% 45%,#e8eef0 0,#dce5e2 62%,#edf1f5 100%);border-color:#c6d2d2}.workshop-floor{background:linear-gradient(145deg,#d1dfda,#bfd0c7 52%,#c9d5df);border-color:#aabdb4;box-shadow:0 20px 30px #1e293b22}.workshop-tile{background:linear-gradient(150deg,#fff,#edf1f5);border-color:#c4ced8;box-shadow:0 5px 0 #b6c0c9}.workshop-tile.is-active{box-shadow:0 0 18px #71d69655,0 5px 0 #b6c0c9}.workshop-state{background:#e5f3e8;color:#183325}.workshop-layout[data-state=pending] .workshop-state{background:#fff0c2;color:#483800;border-color:#a78140}.workshop-layout[data-state=failed] .workshop-state,.workshop-layout[data-state=timeout] .workshop-state{background:#fce1e1;color:#541e24;border-color:#ba7378}.workshop-layout[data-state=cancelled] .workshop-state{background:#e4e8ed;color:#2b3138;border-color:#7e8792}.workshop-feed{background:#fff;border-color:#d9dfe7}.workshop-task-picker select{background:#fff;color:#20252d;border-color:#c8d0db}.project-chooser a{color:#28313c}.button.secondary{background:#e5eaf0;color:#344154}.chart svg text{fill:#485365!important}}</style><header class="site-header"><nav aria-label="Navegação principal"><strong class="brand">CodexBridge</strong><section class="nav-group" aria-labelledby="nav-operation"><h2 id="nav-operation">Operação</h2>${link('/dashboard','Início')}${link('/dashboard/codex-workshop','Oficina Codex')}${link('/dashboard/catalog','Projetos')}${link('/dashboard/coming-soon','Em breve')}${link('/dashboard/retention','Retencao')}${link('/dashboard/requests','Requests')}${link('/dashboard/routing','Roteamento')}</section><section class="nav-group" aria-labelledby="nav-configuration"><h2 id="nav-configuration">Configuração</h2>${link('/dashboard/tunnels','Tunnels')}${link('/dashboard/mcps','MCPs')}</section><section class="nav-group" aria-labelledby="nav-reports"><h2 id="nav-reports">Relatórios</h2>${link('/dashboard/impact','Impacto')}${link('/dashboard/token-savings','Economia de tokens')}</section></nav></header>${mainContent}</html>`;
};
const send = (res, status, body, cookie) => res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...(cookie ? { 'Set-Cookie': cookie } : {}) }).end(body);

function createSessionStore({ ttlMs = 300_000, maxEntries = 500 } = {}) {
  const entries = new Map();
  function prune(now = Date.now()) {
    for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }
  return {
    set(key, value) {
      prune();
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      prune();
      return this;
    },
    get(key) {
      prune();
      const entry = entries.get(key);
      return entry?.value;
    },
    delete(key) { return entries.delete(key); },
  };
}

export function createDashboard(bridge, { baseUrl, root = path.dirname(fileURLToPath(import.meta.url)), projectConfig, tunnelProfilesDir, settingsFile = path.join(root, 'config', 'settings.json'), rtkReport = readRtkReport, headroomLedgerFile = process.env.HEADROOM_SAVINGS_EVENTS_PATH ? path.resolve(process.env.HEADROOM_SAVINGS_EVENTS_PATH) : path.join(os.homedir(), '.headroom', 'savings_events.jsonl') } = {}) {
  const store = path.join(root, 'history');
  const bridgeStore = bridge.LOCK_PATH ? path.dirname(bridge.LOCK_PATH) : path.join(root, 'bridge');
  const retention = createTaskRetention({ historyDir: store, reportsDir: path.join(bridgeStore, 'reports'), approvalsDir: path.join(bridgeStore, 'approvals'), tasks: bridge.tasks });
  let retentionError = null;
  let retentionInitialized = false;
  function sweepRetention() {
    try { retention.sweep(); retentionError = null; retentionInitialized = true; }
    catch { retentionError = 'A limpeza de retenção falhou; os arquivos restantes foram preservados. Revise permissões e espaço em disco.'; }
  }
  const sessions = createSessionStore();
  const projectsFile = path.join(store, 'projects.json');
  const tunnelRegistryFile = path.join(store, 'tunnel-profiles.json');
  const mcpSetupsFile = path.join(store, 'mcp-setups.json');
  const mcpSetupSession = 'mcp-setups';
  const codexMcpRecordsFile = path.join(store, 'codex-mcp-servers.json');
  const impactFile = path.join(store, 'impact.json');
  const impactSession = 'impact';
  const impactSources = ['RTK', 'Headroom', 'CLI', 'interface'];
  function codexMcpRecords() {
    try {
      const value = JSON.parse(fs.readFileSync(codexMcpRecordsFile, 'utf8'));
      return Array.isArray(value.servers) ? value.servers.filter(item => item && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(item.name || '')) : [];
    } catch { return []; }
  }
  function writeCodexMcpRecords(servers) {
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(codexMcpRecordsFile, JSON.stringify({ servers }, null, 2), { mode: 0o600 });
  }
  function codexMcpConfigFile() {
    const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
    return path.join(codexHome, 'config.toml');
  }
  async function codexMcpListState(name) {
    if (!bridge.CODEX_JS || !fs.existsSync(bridge.CODEX_JS)) return null;
    const childEnv = createChildEnvironment({ ci: true });
    try {
      const { stdout } = await execFileAsync(process.execPath, [bridge.CODEX_JS, 'mcp', 'list'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 64_000, windowsHide: true, shell: false, env: childEnv });
      return String(stdout || '').split(/\r?\n/).some(line => line.trim().split(/[\s|]+/).some(cell => cell === name));
    } catch { return null; }
  }
  function resolveCliExecutable(name) {
    const extensions = process.platform === 'win32' ? ['.exe'] : [''];
    for (const directory of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
      for (const extension of extensions) {
        const candidate = path.join(directory, `${name}${extension}`);
        try { if (fs.statSync(candidate).isFile()) return candidate; } catch {}
      }
    }
    return null;
  }
  async function cliMcpListState(cli, name) {
    const executable = resolveCliExecutable(cli);
    if (!executable) return null;
    const childEnv = createChildEnvironment({ ci: true });
    try {
      const { stdout } = await execFileAsync(executable, ['mcp', 'list'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 64_000, windowsHide: true, shell: false, env: childEnv });
      return String(stdout || '').split(/\r?\n/).some(line => line.trim().split(/[\s|]+/).some(cell => cell === name));
    } catch { return null; }
  }
  function geminiUserMcpState(name) {
    const configFile = path.join(os.homedir(), '.gemini', 'settings.json');
    try {
      const stat = fs.statSync(configFile);
      if (!stat.isFile() || stat.size > 1_000_000) return null;
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return Boolean(config && config.mcpServers && Object.hasOwn(config.mcpServers, name));
    } catch (error) { return error.code === 'ENOENT' ? false : null; }
  }
  async function verifyMcpProfileClient(client, name) {
    if (client === 'codex_cli') return codexMcpListState(name);
    if (client === 'hermes_cli') return cliMcpListState('hermes', name);
    if (client === 'gemini_cli') return geminiUserMcpState(name);
    return null;
  }
  async function testHermesMcpConnection(name) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(name)) return 'unavailable';
    const executable = resolveCliExecutable('hermes');
    if (!executable) return 'unavailable';
    try {
      await execFileAsync(executable, ['mcp', 'test', name], {
        encoding: 'utf8', timeout: 60_000, maxBuffer: 64_000, windowsHide: true, shell: false,
        env: createChildEnvironment({ ci: true }),
      });
      return 'connected';
    } catch (error) {
      return error.code === 'ENOENT' ? 'unavailable' : 'failed';
    }
  }
  function impactData() {
    try { const data = JSON.parse(fs.readFileSync(impactFile, 'utf8')); return Array.isArray(data.events) ? data : { events: [] }; }
    catch { return { events: [] }; }
  }
  function validImpactNumber(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000; }
  function addImpactEvents(incoming) {
    const data = impactData();
    if (data.events.length + incoming.length > 10000) throw new Error('Limite de 10.000 registros atingido.');
    const known = new Map(data.events.map(event => [event.id, event]));
    let added = 0;
    let reassigned = 0;
    for (const event of incoming) {
      const existing = known.get(event.id);
      if (!existing) { data.events.push(event); known.set(event.id, event); added += 1; continue; }
      if (event.project_id && existing.project_id && existing.project_id !== event.project_id) throw new Error('Este relatório contém registros já associados a outro projeto. Remova ou revise a associação antes de importar.');
      if (event.project_id && !existing.project_id) { existing.project_id = event.project_id; reassigned += 1; }
    }
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(impactFile, JSON.stringify(data), { mode: 0o600 });
    return { added, reassigned };
  }
  const savingsFile = path.join(store, 'token-savings-preferences.json');
  const savingsSession = 'token-savings';
  const savingsOptions = ['rtk', 'headroom', 'graphify', 'skills', 'token-monitor'];
  function graphifyInstallStatus() {
    const executableName = process.platform === 'win32' ? 'graphify.exe' : 'graphify';
    const candidates = [path.join(os.homedir(), '.local', 'bin', executableName), ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, executableName))];
    const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
    return { cli: candidates.some(candidate => fs.existsSync(candidate)), codex: fs.existsSync(path.join(codexHome, 'skills', 'graphify', 'SKILL.md')) };
  }
  function savingsCliStatus(name) {
    const executableName = process.platform === 'win32' ? `${name}.exe` : name;
    const candidates = [path.join(os.homedir(), '.local', 'bin', executableName), path.join(os.homedir(), 'bin', executableName), ...(process.platform === 'win32' ? [path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', executableName)] : []), ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, executableName))];
    return candidates.find(candidate => { try { return fs.statSync(candidate).isFile(); } catch { return false; } }) || null;
  }
  function codexMcpConfigState(name) {
    const configFile = codexMcpConfigFile();
    try {
      const stat = fs.statSync(configFile);
      if (!stat.isFile() || stat.size > 1_000_000) return null;
      const section = new RegExp(`^\\s*\\[mcp_servers\\.(?:["']?${name}["']?)(?:\\.[^\\]]+)?\\]\\s*(?:#.*)?$`, 'm');
      return section.test(fs.readFileSync(configFile, 'utf8'));
    } catch (error) { return error.code === 'ENOENT' ? false : null; }
  }
  function savingsPreferences() {
    try {
      const value = JSON.parse(fs.readFileSync(savingsFile, 'utf8'));
      if (Array.isArray(value.selected) && value.selected.every(x => savingsOptions.includes(x))) return { selected: value.selected, skipped: value.skipped === true };
    } catch {}
    return { selected: [], skipped: false };
  }
  function tokenSavingsPage(notice = '') {
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(savingsSession, token);
    const prefs = savingsPreferences();
    const checked = key => prefs.selected.includes(key) ? ' checked' : '';
    const toolGuide = `<section class="card"><h2>O que faz cada ferramenta</h2><details><summary>RTK - reduz a sa\u00edda dos comandos do terminal</summary><p>Quando os comandos passam pelo RTK, ele comprime a sa\u00edda antes de chegar ao modelo. O painel importa o relat\u00f3rio local somente quando voc\u00ea clica; os ganhos s\u00e3o estimativas, n\u00e3o valores de cobran\u00e7a. No Windows, instale com <code>winget install --id rtk-ai.rtk --exact</code> e confira <code>rtk --version</code> e <code>rtk gain</code>.</p></details><details><summary>Headroom - otimiza contexto em clientes compat\u00edveis</summary><p>Headroom pode reduzir contexto repetido em requisi\u00e7\u00f5es encaminhadas pelo proxy ou SDK compat\u00edvel. Instalar o CLI sozinho n\u00e3o configura o Codex nem cria uma chave de provedor. No Codex, voc\u00ea tamb\u00e9m pode conectar as ferramentas MCP Headroom e us\u00e1-las sob demanda. O proxy separado permite compress\u00e3o autom\u00e1tica do tr\u00e1fego compat\u00edvel. O painel l\u00ea o ledger local quando voc\u00ea pede a sincroniza\u00e7\u00e3o. Com uv e Python 3.13, a documenta\u00e7\u00e3o oficial indica <code>uv tool install --python 3.13 &quot;headroom-ai[all]&quot;</code>.</p></details><details><summary>Graphify - pesquisa rela\u00e7\u00f5es do c\u00f3digo</summary><p>Graphify cria um grafo local de arquivos, fun\u00e7\u00f5es e rela\u00e7\u00f5es para pesquisar a arquitetura. Pode evitar releituras de contexto, mas n\u00e3o mede economia diretamente. A an\u00e1lise estrutural de c\u00f3digo \u00e9 local; documentos e m\u00eddia podem usar o modelo para extra\u00e7\u00e3o sem\u00e2ntica.</p></details></section>`;
    const graphifyStatus = graphifyInstallStatus();
    const graphifySetup = prefs.selected.includes('graphify') ? `<section class="card"><h2>Preparar Graphify para o Codex</h2><p>Status: CLI ${graphifyStatus.cli ? 'encontrado' : 'n\u00e3o encontrado'}; integra\u00e7\u00e3o no Codex ${graphifyStatus.codex ? 'encontrada' : 'n\u00e3o encontrada'}.</p><p>O Graphify CLI vem do pacote Python oficial <code>graphifyy</code>. A integra\u00e7\u00e3o instala ou atualiza as instru\u00e7\u00f5es no perfil Codex deste usu\u00e1rio, fora de um projeto. Se o CLI estiver ausente, usa <code>uv tool install graphifyy</code>. O grafo do c\u00f3digo \u00e9 criado separadamente quando voc\u00ea pede uma pesquisa.</p><form method="post" action="/dashboard/token-savings/graphify-install"><input type="hidden" name="csrf" value="${token}"><label><input type="checkbox" name="allow_profile_update" value="yes" required> Permito instalar o CLI se necess\u00e1rio e registrar a integra\u00e7\u00e3o Graphify no meu perfil Codex.</label><p><button type="submit">Preparar Graphify no Codex</button></p></form></section>` : '';
    const savingsToolSetup = ['rtk', 'headroom'].filter(tool => prefs.selected.includes(tool)).map(tool => {
      const label = tool === 'rtk' ? 'RTK' : 'Headroom';
      const status = savingsCliStatus(tool);
      const description = tool === 'rtk'
        ? 'Instala ou verifica o RTK pelo winget. Isso instala o CLI, mas n&atilde;o altera configuracoes do Codex nem ativa hooks automaticamente.'
        : 'Instala o CLI Headroom em ambiente isolado pelo uv e Python 3.13. No Windows, dependencias podem exigir ferramentas de compilacao. Nao configura provedores nem chaves.';
      return `<section class="card"><h2>Preparar ${label}</h2><p>Status do CLI: ${status ? 'encontrado' : 'n&atilde;o encontrado'}.</p><p>${description}</p><form method="post" action="/dashboard/token-savings/install-tool"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="tool" value="${tool}"><label><input type="checkbox" name="allow_install" value="yes" required> Autorizo instalar ${label} e as dependencias necessarias neste computador.</label><p><button type="submit">${status ? 'Verificar' : 'Instalar'} ${label}</button></p></form></section>`;
    }).join('');
    const headroomCodexSetup = prefs.selected.includes('headroom') ? (() => {
      const executable = savingsCliStatus('headroom');
      const configured = codexMcpConfigState('headroom');
      const configLabel = configured === true ? 'MCP j\u00e1 aparece no config.toml do Codex.' : configured === false ? 'MCP ainda n\u00e3o est\u00e1 registrado no Codex.' : 'N\u00e3o foi poss\u00edvel consultar config.toml com seguran\u00e7a.';
      const body = !executable
        ? '<p>Instale o Headroom primeiro. O instalador n\u00e3o configura o Codex.</p>'
        : configured === true
          ? '<p>O Codex j\u00e1 tem um MCP chamado <code>headroom</code>. Nenhuma configura\u00e7\u00e3o ser\u00e1 sobrescrita.</p>'
          : configured === null
            ? '<p>Confira manualmente o config.toml do Codex antes de continuar.</p>'
            : `<p>O painel registrar\u00e1 o comando local <code>${esc(executable)} mcp serve</code> no Codex, sem enviar conte\u00fado ou chaves agora. Nas pr\u00f3ximas sess\u00f5es, o Codex poder\u00e1 iniciar esse MCP e chamar ferramentas de compress\u00e3o, recupera\u00e7\u00e3o e estat\u00edsticas. A ferramenta de compress\u00e3o pode ser chamada pelo agente sob demanda; para compress\u00e3o autom\u00e1tica do tr\u00e1fego, configure o proxy Headroom separadamente.</p><form method="post" action="/dashboard/token-savings/headroom-codex"><input type="hidden" name="csrf" value="${token}"><label><input type="checkbox" name="allow_codex_mcp" value="yes" required> Autorizo adicionar o MCP Headroom ao Codex. Entendo que as ferramentas locais ficar\u00e3o dispon\u00edveis nas pr\u00f3ximas sess\u00f5es.</label><p><button type="submit">Adicionar Headroom ao Codex</button></p></form>`;
      return `<section class="card" id="headroom-codex-setup"><h2>Conectar Headroom ao Codex</h2><p class="muted">${configLabel}</p>${body}</section>`;
    })() : '';
    const shortcuts = `<section class="card"><h2>Acessos rápidos</h2><div class="actions">${prefs.selected.includes('graphify') ? '<a class="button" href="/dashboard/graphify">Ver grafos Graphify</a>' : ''}${prefs.selected.includes('headroom') ? '<a class="button" href="http://127.0.0.1:8787/dashboard" target="_blank" rel="noopener noreferrer">Ver dashboard Headroom</a>' : ''}${prefs.selected.includes('token-monitor') ? '<a class="button" href="https://github.com/Javis603/token-monitor/releases" target="_blank" rel="noopener noreferrer">Obter Token Monitor</a>' : ''}</div><p class="muted">Graphify mostra relações do código, não mede economia. Headroom abre na porta padrão 8787 se o proxy estiver ativo. Token Monitor é um aplicativo separado para consumo e custos estimados.</p></section>`;
    const form = `<form class="card" method="post" action="/dashboard/token-savings"><input type="hidden" name="csrf" value="${token}"><fieldset><legend>Escolha uma ou mais opções</legend><label><input type="checkbox" name="selected" value="rtk"${checked('rtk')}> RTK</label><p>Instalação e configuração são feitas por você, separadamente. Os dados podem ser lidos sob demanda com <code>rtk gain --all --format json</code>. O RTK estima tokens a partir da saída de comandos; não é uma medição de faturamento.</p><label><input type="checkbox" name="selected" value="headroom"${checked('headroom')}> Headroom</label><p>Instalação e configuração são feitas por você, separadamente. A sincronização lê o ledger local do Headroom quando você clicar; os valores são estimativas do próprio Headroom.</p><label><input type="checkbox" name="selected" value="graphify"${checked('graphify')}> Graphify</label><p>Ajuda a IA a pesquisar relações no código com um grafo local; não mede economia diretamente. Depois de salvar esta opção, use a preparação guiada abaixo para registrar Graphify no perfil Codex do usuário.</p><label><input type="checkbox" name="selected" value="skills"${checked('skills')}> skills.sh</label><p>Permite ao Codex consultar o diretório público skills.sh quando uma tarefa se beneficiar de instruções especializadas. A busca não instala skills; revise a origem e aprove qualquer instalação separadamente.</p><label><input type="checkbox" name="selected" value="token-monitor"${checked('token-monitor')}> Token Monitor</label><p>Aplicativo separado para acompanhar consumo e custos estimados do Codex. Ativar esta opção mostra o acesso à página oficial; o bridge não instala nem lê dados do aplicativo.</p></fieldset><p class="muted">Recomendamos configurar ao menos uma opção. Você também pode pular agora; todas as funções do CodexBridge continuam disponíveis. Preferências locais não incluem segredos.</p><div class="actions"><button type="submit" name="intent" value="save">Salvar opções</button><button class="secondary" type="submit" name="intent" value="skip">Pular por enquanto</button></div></form>${prefs.selected.includes('rtk') ? `<form class="card" method="post" action="/dashboard/token-savings/rtk-sync"><input type="hidden" name="csrf" value="${token}"><h2>Sincronizar dados do RTK</h2><p>Executa somente <code>rtk gain --all --format json</code> quando você clicar. Os dados ficam nesta máquina.</p><button type="submit">Atualizar dados do RTK</button> <a href="/dashboard/impact">Ver gráficos</a></form>` : ''}${prefs.selected.includes('headroom') ? `<form class="card" method="post" action="/dashboard/token-savings/headroom-sync"><input type="hidden" name="csrf" value="${token}"><h2>Sincronizar dados do Headroom</h2><ol><li>Instale o Headroom e, se quiser usar ferramentas no Codex, adicione o MCP no <a href="#headroom-codex-setup">cart\u00e3o de configura\u00e7\u00e3o abaixo</a>.</li><li>Em uma sess\u00e3o Codex com o MCP carregado, pe\u00e7a para usar <code>headroom_compress</code> em uma sa\u00edda ou texto apropriado. O proxy Headroom tamb\u00e9m pode gerar eventos quando processa tr\u00e1fego compat\u00edvel.</li><li>Volte aqui e sincronize. O painel l\u00ea somente o ledger local e n\u00e3o envia o relat\u00f3rio pela rede.</li></ol><p class="muted">A conex\u00e3o MCP permite compress\u00e3o sob demanda; n\u00e3o configura o proxy nem comprime automaticamente todas as solicita\u00e7\u00f5es.</p><button type="submit">Atualizar dados do Headroom</button> <a href="/dashboard/impact">Ver gráficos</a></form>` : ''}`;
    return page('Opções de Economia de Tokens', `<h1>Opções de Economia de Tokens</h1><p>RTK e Headroom ajudam a reduzir ou acompanhar o uso de tokens; Graphify ajuda pesquisas sobre a arquitetura do código.</p>${notice ? `<p class="next-step">${esc(notice)}</p>` : ''}${shortcuts}${form}${toolGuide}${graphifySetup}${savingsToolSetup}${headroomCodexSetup}<p>Fontes: <a href="https://github.com/rtk-ai/rtk/blob/develop/INSTALL.md">RTK</a> · <a href="https://github.com/headroomlabs-ai/headroom/blob/main/docs/content/docs/installation.mdx">Headroom</a> · <a href="https://docs.headroomlabs.ai/docs/mcp">Headroom MCP</a> · <a href="https://github.com/Graphify-Labs/graphify">Graphify</a></p>`, '/dashboard/token-savings');
  }
  async function saveTokenSavings(req, res) {
    const token = sessions.get(savingsSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Bloqueado', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 10000) return send(res, 413, page('Erro', '<p>Requisição excede o limite.</p>')); }
    const fields = new URLSearchParams(body);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Bloqueado', '<p>Confirmação local inválida. Atualize a página.</p>'));
    sessions.delete(savingsSession);
    const selected = fields.getAll('selected'); const intent = fields.get('intent');
    if (!['save', 'skip'].includes(intent) || selected.some(x => !savingsOptions.includes(x)) || (intent === 'save' && !selected.length)) return send(res, 400, tokenSavingsPage('Selecione ao menos uma opção ou escolha “Pular por enquanto”.'));
    const preferences = { selected: intent === 'skip' ? [] : [...new Set(selected)], skipped: intent === 'skip', updated_at: new Date().toISOString() };
    fs.mkdirSync(store, { recursive: true }); fs.writeFileSync(savingsFile, JSON.stringify(preferences), { mode: 0o600 });
    const html = tokenSavingsPage(intent === 'skip' ? 'Tudo certo. Você pode configurar essas opções depois; todas as funções continuam disponíveis.' : 'Preferências salvas localmente. As instalações permanecem separadas e manuais.');
    return send(res, 200, html, `codex_dashboard=${sessions.get(savingsSession)}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
  }
  async function syncRtkSavings(req, res) {
    const token = sessions.get(savingsSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Bloqueado', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 10000) return send(res, 413, page('Erro', '<p>Requisição excede o limite.</p>')); }
    const fields = new URLSearchParams(body);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Bloqueado', '<p>Confirmação local inválida. Atualize a página.</p>'));
    sessions.delete(savingsSession);
    let notice;
    try {
      if (!savingsPreferences().selected.includes('rtk')) throw new Error('Selecione e salve RTK antes de sincronizar.');
      const report = await rtkReport();
      const parsed = JSON.parse(String(report));
      const daily = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? parsed.daily : null;
      if (!Array.isArray(daily) || daily.length === 0) throw new Error('O relatório do RTK não trouxe uma série diária. Nenhum total agregado foi atribuído a uma data.');
      const { added } = addImpactEvents(parseImpactReport('RTK', JSON.stringify(daily)));
      notice = added ? `${added} registro(s) diário(s) do RTK importado(s). Veja os gráficos em Impacto.` : 'Os dados diários do RTK já estavam sincronizados; nenhum registro duplicado foi criado.';
    } catch (error) {
      if (error.code === 'ENOENT') notice = 'RTK não encontrado. Instale/configure o executável e reinicie o CodexBridge para atualizar o PATH.';
      else if (error.killed || error.code === 'ETIMEDOUT') notice = 'O RTK excedeu o tempo limite. Tente novamente depois.';
      else if (error.code === 'EPERM' || error.code === 'EACCES') notice = 'O Windows bloqueou a execução do RTK pelo CodexBridge. Confira as permissões e o caminho do executável.';
      else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') notice = 'O relatório do RTK excedeu o limite permitido. Reduza o histórico e tente novamente.';
      else {
        const message = typeof error?.message === 'string' ? error.message : '';
        notice = message === 'Selecione e salve RTK antes de sincronizar.' || message.startsWith('O relatório do RTK') ? message : 'Não foi possível ler um relatório RTK válido. Confira a versão do RTK e tente novamente.';
      }
    }
    const html = tokenSavingsPage(notice);
    return send(res, 200, html, `codex_dashboard=${sessions.get(savingsSession)}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
  }
  async function syncHeadroomSavings(req, res) {
    const token = sessions.get(savingsSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Bloqueado', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 10000) return send(res, 413, page('Erro', '<p>Requisição excede o limite.</p>')); }
    const fields = new URLSearchParams(body);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Bloqueado', '<p>Confirmação local inválida. Atualize a página.</p>'));
    sessions.delete(savingsSession);
    let notice;
    try {
      if (!savingsPreferences().selected.includes('headroom')) throw new Error('Selecione e salve Headroom antes de sincronizar.');
      const stat = fs.statSync(headroomLedgerFile);
      if (!stat.isFile()) throw new Error('Ledger do Headroom inválido.');
      if (stat.size > 1_000_000) throw new Error('O ledger do Headroom excede o limite de 1 MB.');
      const ledger = fs.readFileSync(headroomLedgerFile, 'utf8');
      const lastCompleteLine = ledger.endsWith('\n') ? ledger.length : ledger.lastIndexOf('\n') + 1;
      const snapshot = ledger.slice(0, lastCompleteLine);
      if (!snapshot.trim()) throw new Error('O ledger do Headroom ainda não contém eventos completos.');
      const { added } = addImpactEvents(parseImpactReport('Headroom', snapshot));
      notice = added ? `${added} registro(s) do Headroom importado(s). Veja os gráficos em Impacto.` : 'Os dados do Headroom já estavam sincronizados; nenhum registro duplicado foi criado.';
    } catch (error) {
      if (error.code === 'ENOENT') notice = 'O ledger ainda n\u00e3o existe. Adicione o MCP Headroom ao Codex e use headroom_compress uma vez, ou configure o proxy; depois sincronize novamente.';
      else {
        const message = typeof error?.message === 'string' ? error.message : '';
        notice = message === 'Selecione e salve Headroom antes de sincronizar.' || message.startsWith('O ledger do Headroom') || message.startsWith('Ledger do Headroom') ? message : 'Não foi possível ler um ledger Headroom válido. Confira a versão e tente novamente.';
      }
    }
    const html = tokenSavingsPage(notice);
    return send(res, 200, html, `codex_dashboard=${sessions.get(savingsSession)}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
  }
  async function addHeadroomMcpToCodex(req, res) {
    if (process.platform !== 'win32') return send(res, 400, tokenSavingsPage('A configura&ccedil;&atilde;o guiada do MCP Headroom esta disponivel no Windows.'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisicao bloqueada', '<p>Endereco local invalido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4000) return send(res, 413, page('Erro', '<p>Requisicao longa.</p>')); }
    const fields = new URLSearchParams(body);
    const token = sessions.get(savingsSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisicao bloqueada', '<p>Confirmacao invalida. Atualize a pagina.</p>'));
    sessions.delete(savingsSession);
    if (fields.get('allow_codex_mcp') !== 'yes' || !savingsPreferences().selected.includes('headroom')) return send(res, 400, tokenSavingsPage('Selecione Headroom e autorize a conexao MCP antes de continuar.'));
    if (!bridge.CODEX_JS || !fs.existsSync(bridge.CODEX_JS)) return send(res, 400, tokenSavingsPage('Codex CLI n&atilde;o encontrado. Confira a instalacao e reinicie o adapter.'));
    const executable = savingsCliStatus('headroom');
    if (!executable) return send(res, 400, tokenSavingsPage('Headroom CLI n&atilde;o encontrado. Instale o Headroom primeiro.'));
    const listed = await codexMcpListState('headroom');
    if (listed === true) return send(res, 200, tokenSavingsPage('Ja existe um MCP chamado headroom na configura&ccedil;&atilde;o do Codex; nenhuma configura&ccedil;&atilde;o foi sobrescrita.'));
    if (listed === null || codexMcpConfigState('headroom') !== false) return send(res, 409, tokenSavingsPage('Nao consegui confirmar que o nome headroom esta livre na configura&ccedil;&atilde;o local. Confira codex mcp list antes de tentar novamente.'));
    const childEnv = createChildEnvironment();
    try {
      await execFileAsync(process.execPath, [bridge.CODEX_JS, 'mcp', 'add', 'headroom', '--', executable, 'mcp', 'serve'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16_000, windowsHide: true, shell: false, env: childEnv });
    } catch {
      return send(res, 500, tokenSavingsPage('O Codex n\u00e3o confirmou o cadastro do MCP Headroom. Confira codex mcp list; nenhuma chave foi solicitada ou armazenada.'));
    }
    const confirmed = await codexMcpListState('headroom');
    const notice = confirmed === true
      ? 'MCP Headroom registrado no Codex e localizado em codex mcp list. Isso habilita as ferramentas nas pr\u00f3ximas sess\u00f5es, mas n\u00e3o ativa compress\u00e3o autom\u00e1tica do tr\u00e1fego.'
      : 'O comando do Codex terminou, mas n\u00e3o consegui confirmar o registro na lista. Confira codex mcp list; n\u00e3o tente adicionar novamente at\u00e9 verificar.';
    return send(res, confirmed === true ? 200 : 502, tokenSavingsPage(notice));
  }
  async function installGraphify(req, res) {
    if (process.platform !== 'win32') return send(res, 400, tokenSavingsPage('A instala\\u00e7\\u00e3o do Graphify pelo painel est\\u00e1 dispon\\u00edvel no Windows.'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisicao bloqueada', '<p>Endereco local invalido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4000) return send(res, 413, page('Erro', '<p>Requisicao longa.</p>')); }
    const fields = new URLSearchParams(body);
    const token = sessions.get(savingsSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisicao bloqueada', '<p>Confirmacao invalida. Atualize a pagina.</p>'));
    sessions.delete(savingsSession);
    if (fields.get('allow_profile_update') !== 'yes' || !savingsPreferences().selected.includes('graphify')) return send(res, 400, tokenSavingsPage('Selecione Graphify e autorize a alteracao do perfil Codex.'));
    const installer = path.join(root, 'scripts', 'Install-Graphify.ps1');
    if (!fs.existsSync(installer)) return send(res, 500, tokenSavingsPage('O instalador Install-Graphify.ps1 n&atilde;o foi encontrado.'));
    try {
      const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer], { encoding: 'utf8', timeout: 300_000, maxBuffer: 1_000_000, windowsHide: true, shell: false, env: createChildEnvironment() });
      const details = esc((stdout + (stderr ? '\n' + stderr : '')).trim().slice(-8000));
      return send(res, 200, page('Graphify preparado', '<h1>Graphify est\u00e1 pronto no Codex</h1><p>O Graphify CLI e sua integra\u00e7\u00e3o Codex foram preparados. RTK comprime a sa\u00edda do terminal; Headroom otimiza contexto em clientes de API compat\u00edveis; Graphify pesquisa rela\u00e7\u00f5es do c\u00f3digo.</p><details><summary>Detalhes da instala\u00e7\u00e3o</summary><pre>' + details + '</pre></details><p><a href="/dashboard/token-savings">Voltar para Economia de tokens</a></p>', '/dashboard/token-savings'));
    } catch (error) {
      const details = esc(((error.stdout || '') + (error.stderr ? '\n' + error.stderr : '') + (error.message || '')).trim().slice(-8000));
      return send(res, 500, page('Falha ao preparar Graphify', '<h1>N\u00e3o foi poss\u00edvel preparar Graphify</h1><p>Confira os detalhes e tente novamente. Nenhuma chave de API foi solicitada ou armazenada.</p><details open><summary>Detalhes da instala\u00e7\u00e3o</summary><pre>' + details + '</pre></details><p><a href="/dashboard/token-savings">Voltar para Economia de tokens</a></p>', '/dashboard/token-savings'));
    }
  }
  async function installSavingsTool(req, res) {
    if (process.platform !== 'win32') return send(res, 400, tokenSavingsPage('A instalacao guiada de RTK e Headroom esta disponivel no Windows.'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisicao bloqueada', '<p>Endereco local invalido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4000) return send(res, 413, page('Erro', '<p>Requisicao longa.</p>')); }
    const fields = new URLSearchParams(body);
    const tool = fields.get('tool');
    const token = sessions.get(savingsSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisicao bloqueada', '<p>Confirmacao invalida. Atualize a pagina.</p>'));
    sessions.delete(savingsSession);
    if (!['rtk', 'headroom'].includes(tool) || fields.get('allow_install') !== 'yes' || !savingsPreferences().selected.includes(tool)) return send(res, 400, tokenSavingsPage('Selecione e salve a ferramenta desejada antes de autorizar a instalacao.'));
    const installer = path.join(root, 'scripts', 'Install-TokenSavingsTool.ps1');
    if (!fs.existsSync(installer)) return send(res, 500, tokenSavingsPage('O instalador de ferramentas de economia n&atilde;o foi encontrado.'));
    try {
      const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer, '-Tool', tool], { encoding: 'utf8', timeout: 600_000, maxBuffer: 1_000_000, windowsHide: true, shell: false, env: createChildEnvironment() });
      const details = esc((stdout + (stderr ? '\n' + stderr : '')).trim().slice(-8000));
      const label = tool === 'rtk' ? 'RTK' : 'Headroom';
      const description = tool === 'rtk' ? 'RTK reduz a saida dos comandos do terminal e fornece estimativas de economia.' : 'Headroom otimiza contexto em clientes de API configurados para usar o proxy ou SDK. Esta instalacao n&atilde;o configura a conexao do provedor.';
      return send(res, 200, page(`${label} preparado`, `<h1>${label} preparado</h1><p>${description} Nenhuma chave foi pedida ou armazenada.</p><details><summary>Detalhes</summary><pre>${details}</pre></details><p><a href="/dashboard/token-savings">Voltar para Economia de tokens</a></p>`, '/dashboard/token-savings'));
    } catch (error) {
      const details = esc(((error.stdout || '') + (error.stderr ? '\n' + error.stderr : '') + (error.message || '')).trim().slice(-8000));
      return send(res, 500, page(`Falha ao preparar ${tool}`, `<h1>Nao foi possivel preparar ${tool}</h1><p>Confira as dependencias e tente novamente. Nenhuma chave foi pedida ou armazenada.</p><details open><summary>Detalhes</summary><pre>${details}</pre></details><p><a href="/dashboard/token-savings">Voltar para Economia de tokens</a></p>`, '/dashboard/token-savings'));
    }
  }
  function parseImpactReport(source, text) {
    if (Buffer.byteLength(text, 'utf8') > 1_000_000) throw new Error('Arquivo excede o limite de 1 MB.');
    const rows = source === 'Headroom' ? text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : (() => { const value = JSON.parse(text); return Array.isArray(value) ? value : ['events', 'days', 'daily', 'weekly', 'monthly'].map(key => value[key]).find(Array.isArray) || [value]; })();
    if (!rows.length || rows.length > 10000) throw new Error('Relatório vazio ou com mais de 10.000 linhas.');
    const events = [];
    const normalizedRows = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Estrutura de relatório inválida.');
      if (source === 'RTK' && row.by_day && typeof row.by_day === 'object' && !Array.isArray(row.by_day)) {
        for (const [date, value] of Object.entries(row.by_day)) normalizedRows.push(typeof value === 'object' && value !== null ? { date, ...value } : { date, tokens_saved: value, id: `by_day:${date}` });
      } else normalizedRows.push(row);
    }
    if (!normalizedRows.length || normalizedRows.length > 10000) throw new Error('Relatório vazio ou com mais de 10.000 linhas.');
    for (const row of normalizedRows) {
      const dateValue = row.date ?? row.day ?? row.ts ?? row.timestamp ?? row.created_at ?? row.at;
      let date = '';
      if (typeof dateValue === 'string') { const parsed = Date.parse(dateValue.length === 10 ? `${dateValue}T00:00:00Z` : dateValue); if (!Number.isNaN(parsed)) date = new Date(parsed).toISOString().slice(0, 10); }
      if (typeof dateValue === 'number' && Number.isFinite(dateValue) && Math.abs(dateValue) < 8_640_000_000_000) { const timestamp = dateValue < 10_000_000_000 ? dateValue * 1000 : dateValue; try { date = new Date(timestamp).toISOString().slice(0, 10); } catch {} }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Data ausente ou inválida no relatório.');
      const amount = row.tokens_saved ?? row.saved_tokens ?? row.savings_tokens ?? row.tokensSaved ?? row.saved ?? row.savings ?? row.gain ?? row.total_saved ?? row.total_saved_tokens;
      if (!validImpactNumber(amount)) throw new Error('Economia de tokens ausente ou inválida no relatório.');
      const sourceId = row.id ?? row.event_id ?? row.hash ?? `${date}:${amount}:${JSON.stringify(row)}`;
      events.push({ id: `${source}:${crypto.createHash('sha256').update(String(sourceId)).digest('hex')}`, source, date, tokens: amount, kind: 'imported' });
    }
    return events;
  }
  async function impactPost(req, res, action) {
    const token = sessions.get(impactSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Bloqueado', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 1_100_000) return send(res, 413, page('Erro', '<p>Requisição excede 1 MB.</p>')); }
    const fields = new URLSearchParams(body);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Bloqueado', '<p>Confirmação local inválida. Atualize a página.</p>'));
    sessions.delete(impactSession);
    let successNotice = 'Registro salvo.';
    try {
      if (action === 'manual') {
        const date = fields.get('date');
        const before = fields.get('before') === '' ? null : Number(fields.get('before'));
        const after = fields.get('after') === '' ? null : Number(fields.get('after'));
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || (before !== null && !validImpactNumber(before)) || (after !== null && !validImpactNumber(after)) || (before === null && after === null)) throw new Error('Informe uma data válida e pelo menos um valor de tokens válido.');
        const tokens = before !== null && after !== null ? Math.max(0, before - after) : null;
        const projectId = String(fields.get('project') || '');
        if (projectId && !projects().some(project => project.id === projectId)) throw new Error('Projeto escolhido não está cadastrado. Atualize a página.');
        const entry = { id: `manual:${crypto.randomUUID()}`, source: fields.get('source'), date, before, after, ...(tokens === null ? {} : { tokens }), ...(projectId ? { project_id: projectId } : {}), kind: 'manual' };
        if (!['CLI', 'interface'].includes(entry.source)) throw new Error('Origem manual inválida.');
        addImpactEvents([entry]);
      } else {
        const source = fields.get('source');
        if (!['RTK', 'Headroom'].includes(source)) throw new Error('Origem de importação inválida.');
        const projectId = String(fields.get('project') || '');
        if (projectId && !projects().some(project => project.id === projectId)) throw new Error('Projeto escolhido não está cadastrado. Atualize a página.');
        const text = fields.get('report') || '';
        const imported = parseImpactReport(source, text).map(event => projectId ? { ...event, project_id: projectId } : event);
        const result = addImpactEvents(imported);
        const projectName = projectId ? projects().find(project => project.id === projectId)?.name : '';
        successNotice = `${result.added} novo(s) registro(s) importado(s)${projectName ? ` para ${projectName}` : ' em dados gerais'}; ${result.reassigned} registro(s) existente(s) atribuído(s) agora ao projeto escolhido.`;
      }
      return send(res, 200, page('Impacto registrado', `<h1>Registro salvo</h1><p>${esc(successNotice)}</p><p><a href="/dashboard/impact">Voltar ao impacto</a></p>`));
    } catch (error) { return send(res, 400, impactPage(new URLSearchParams(), error.message)); }
  }
  function impactPage(params = new URLSearchParams(), notice = '') {
    const period = ['daily', 'weekly', 'monthly'].includes(params.get('period')) ? params.get('period') : 'weekly';
    const now = new Date(); const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
    if (period === 'daily') start.setUTCDate(start.getUTCDate() - 6);
    else if (period === 'weekly') start.setUTCDate(start.getUTCDate() - 41);
    else start.setUTCDate(1), start.setUTCMonth(start.getUTCMonth() - 5);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const requestedProject = params.get('project') || 'all';
    const selectedProject = requestedProject === 'global' || requestedProject === 'unconfigured' || projects().some(project => project.id === requestedProject) ? requestedProject : 'all';
    const allEvents = impactData().events.filter(event => event.date >= start.toISOString().slice(0, 10) && event.date <= today.toISOString().slice(0, 10));
    const events = allEvents.filter(event => selectedProject === 'all' || (selectedProject === 'global' || selectedProject === 'unconfigured' ? !event.project_id : event.project_id === selectedProject));
    const buckets = new Map();
    const keyFor = date => { const d = new Date(`${date}T00:00:00Z`); if (period === 'daily') return date; if (period === 'weekly') { d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); } return `${date.slice(0, 7)}-01`; };
    for (const event of events) { const key = keyFor(event.date); if (!buckets.has(key)) buckets.set(key, Object.fromEntries(impactSources.map(source => [source, { imported: 0, manual: 0 }]))); if (event.tokens != null) buckets.get(key)[event.source][event.kind === 'manual' ? 'manual' : 'imported'] += event.tokens; }
    const bucketTotal = (key, source) => { const bucket = buckets.get(key)[source]; return bucket.imported + bucket.manual; };
    const keys = [...buckets.keys()].sort(); const totals = Object.fromEntries(impactSources.map(source => [source, events.filter(e => e.source === source).reduce((n, e) => n + (e.tokens || 0), 0)]));
    const colors = ['#64d693', '#79b9ff', '#e7b85c', '#c59cff']; const total = impactSources.reduce((n, source) => n + totals[source], 0);
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(impactSession, token);
    const series = keys.map(key => ({ key, value: impactSources.reduce((n, source) => n + bucketTotal(key, source), 0) }));
    const seriesMax = Math.max(1, ...series.map(point => point.value));
    const chartX = index => series.length < 2 ? 370 : 78 + index * 590 / (series.length - 1);
    const chartY = value => 178 - value / seriesMax * 140;
    const linePoints = series.map((point, index) => `${chartX(index)},${chartY(point.value)}`).join(' ');
    const dateLabel = key => { const date = new Date(`${key}T00:00:00Z`); return period === 'monthly' ? date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }); };
    const compactTokens = value => value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : value >= 10_000 ? `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : value >= 1_000 ? `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : Math.round(value).toLocaleString('pt-BR');
    let angle = 0; const donut = `conic-gradient(${impactSources.map((source, i) => { const from = angle; angle += total ? totals[source] / total * 360 : 0; return `${colors[i]} ${from}deg ${angle}deg`; }).join(',')})`;
    const periodNames = { daily: 'últimos 7 dias', weekly: 'últimas 6 semanas', monthly: 'últimos 6 meses' };
    const axis = [0, 0.25, 0.5, 0.75, 1].map(ratio => { const y = 178 - ratio * 140; const value = seriesMax * ratio; return `<g><line x1="70" y1="${y}" x2="680" y2="${y}" stroke="#394451" stroke-dasharray="${ratio === 0 ? '0' : '3 5'}"/><text x="62" y="${y + 4}" fill="#c1cbd7" text-anchor="end" font-size="11">${esc(compactTokens(value))}</text></g>`; }).join('');
    const lineTable = series.length ? `<details class="chart-data"><summary>Ver os valores da linha em tabela</summary><table><caption>Economia estimada em tokens por período</caption><thead><tr><th>Período</th><th>Tokens estimados</th></tr></thead><tbody>${series.map(point => `<tr><td>${esc(dateLabel(point.key))}</td><td>${point.value.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table></details>` : '';
    const lines = `<p class="muted">${periodNames[period]} · cada ponto mostra a soma registrada nesse intervalo.</p><svg role="img" aria-label="Gráfico de linhas da economia estimada nos ${periodNames[period]}, em tokens" viewBox="0 0 700 225" width="100%" height="225"><title>Economia estimada por intervalo (tokens)</title>${axis}<polyline points="${linePoints}" fill="none" stroke="#64d693" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${series.map((point, i) => `<circle cx="${chartX(i)}" cy="${chartY(point.value)}" r="5" fill="#101318" stroke="#64d693" stroke-width="3"><title>${esc(dateLabel(point.key))}: ${point.value.toLocaleString('pt-BR')} tokens estimados</title></circle><text x="${chartX(i)}" y="210" fill="#d7dee8" text-anchor="middle" font-size="11">${esc(dateLabel(point.key))}</text>`).join('')}</svg>${lineTable}`;
    const pie = `<div role="img" aria-label="Gráfico circular da economia por origem, em tokens" class="donut" style="background:${donut}"><span>${total.toLocaleString('pt-BR')}<br>tokens</span></div><div class="legend" aria-label="Legenda do gráfico circular">${impactSources.map((source, i) => { const share = total ? Math.round(totals[source] / total * 100) : 0; return `<span style="--dot:${colors[i]}">${source}: ${totals[source].toLocaleString('pt-BR')} (${share}%)</span>`; }).join('')}</div>`;
    const sourceValues = impactSources.map(source => { const sourceEvents = events.filter(e => e.source === source); return { source, imported: sourceEvents.filter(e => e.kind !== 'manual').reduce((n, e) => n + (e.tokens || 0), 0), manual: sourceEvents.filter(e => e.kind === 'manual').reduce((n, e) => n + (e.tokens || 0), 0), comparisons: sourceEvents.filter(e => e.kind === 'manual') }; });
    const maxBars = Math.max(1, ...sourceValues.flatMap(value => [value.imported, value.manual]));
    const barHeight = value => Math.round(value / maxBars * 150);
    const importedColor = '#64d693'; const manualColor = '#79b9ff';
    const bars = `<div class="legend" aria-label="Legenda do gráfico"><span style="--dot:${importedColor}">Importados</span><span style="--dot:${manualColor}">Manuais</span></div><svg role="img" aria-label="Gráfico de colunas agrupadas: tokens importados e manuais por origem" viewBox="0 0 700 235" width="100%" height="235"><title>Comparação entre origens (tokens estimados)</title>${[0, 0.5, 1].map(ratio => { const y = 180 - ratio * 150; return `<g><line x1="42" y1="${y}" x2="680" y2="${y}" stroke="#394451" stroke-dasharray="${ratio ? '3 5' : '0'}"/><text x="35" y="${y + 4}" fill="#c1cbd7" text-anchor="end" font-size="11">${esc(compactTokens(maxBars * ratio))}</text></g>`; }).join('')}${sourceValues.map((value, i) => { const center = 105 + i * 185; const importedHeight = barHeight(value.imported); const manualHeight = barHeight(value.manual); return `<g><rect x="${center - 29}" y="${180 - importedHeight}" width="28" height="${importedHeight}" fill="${importedColor}" role="img" aria-label="${esc(value.source)}, importados: ${value.imported.toLocaleString('pt-BR')} tokens"><title>${esc(value.source)} — importados: ${value.imported.toLocaleString('pt-BR')}</title></rect><rect x="${center + 1}" y="${180 - manualHeight}" width="28" height="${manualHeight}" fill="${manualColor}" role="img" aria-label="${esc(value.source)}, manuais: ${value.manual.toLocaleString('pt-BR')} tokens"><title>${esc(value.source)} — manuais: ${value.manual.toLocaleString('pt-BR')}</title></rect><text x="${center - 15}" y="${Math.max(25, 174 - importedHeight)}" fill="#d7dee8" text-anchor="middle" font-size="10">${compactTokens(value.imported)}</text><text x="${center + 15}" y="${Math.max(25, 174 - manualHeight)}" fill="#d7dee8" text-anchor="middle" font-size="10">${compactTokens(value.manual)}</text><text x="${center}" y="205" fill="#d7dee8" text-anchor="middle" font-size="12">${esc(value.source)}</text></g>`; }).join('')}</svg>${sourceValues.flatMap(value => value.comparisons.map(e => `<p class="muted">Comparação manual: ${e.before == null ? 'antes não informado' : e.before.toLocaleString('pt-BR')} → ${e.after == null ? 'depois não informado' : e.after.toLocaleString('pt-BR')} tokens${e.tokens == null ? ' (economia indisponível)' : ` (${e.tokens.toLocaleString('pt-BR')} estimados)`}</p>`)).join('')}`;
    const projectFilterOptions = projects().map(project => `<option value="${esc(project.id)}"${selectedProject === project.id ? ' selected' : ''}>${esc(project.name)}</option>`).join('');
    const selectedProjectName = selectedProject === 'all' ? 'Todos os projetos e dados gerais' : selectedProject === 'global' || selectedProject === 'unconfigured' ? 'Dados gerais (sem projeto)' : projects().find(project => project.id === selectedProject)?.name || 'Projeto';
    const projectFilter = `<label>Projeto <select name="project"><option value="all"${selectedProject === 'all' ? ' selected' : ''}>Todos os projetos e dados gerais</option><option value="global"${selectedProject === 'global' || selectedProject === 'unconfigured' ? ' selected' : ''}>Dados gerais (sem projeto)</option>${projectFilterOptions}</select></label>`;
    const manualProjectOptions = projects().map(project => `<option value="${esc(project.id)}"${selectedProject === project.id ? ' selected' : ''}>${esc(project.name)}</option>`).join('');    const manual = `<form id="comparacao-manual" class="card" method="post" action="/dashboard/impact/manual"><h2>Registrar comparação manual</h2><p class="muted">Valores informados por você; não são telemetria CodexBridge. A diferença só é calculada quando ambos os valores são fornecidos. Diferença negativa é exibida como zero economia.</p><input type="hidden" name="csrf" value="${token}"><label>Origem<select name="source"><option>CLI</option><option>interface</option></select></label> <label>Projeto<select name="project"><option value="">Dados gerais (sem projeto)</option>${manualProjectOptions}</select></label> <label>Data<input type="date" name="date" required></label> <label>Tokens antes<input type="number" min="0" max="1000000000000" name="before"></label> <label>Tokens depois<input type="number" min="0" max="1000000000000" name="after"></label> <button>Salvar comparação</button></form>`;
    const importProjectOptions = projects().map(project => `<option value="${esc(project.id)}"${selectedProject === project.id ? ' selected' : ''}>${esc(project.name)}</option>`).join('');
    const imports = `<form id="importar-dados" class="card" method="post" action="/dashboard/impact/import"><h2>Importar relatório agregado</h2><p class="muted">Cole o conteúdo JSON/JSONL exportado pelo RTK (incluindo rtk gain) ou o ledger oficial Headroom savings_events.jsonl. Nenhum arquivo é pesquisado automaticamente.</p><input type="hidden" name="csrf" value="${token}"><label>Origem<select name="source"><option>RTK</option><option>Headroom</option></select></label><label>Associar a projeto (opcional)<select name="project"><option value="">Dados gerais, sem projeto</option>${importProjectOptions}</select><span class="muted">Os relatórios não identificam a pasta. Escolher um projeto é uma classificação manual sua para separar os gráficos.</span></label><p><label class="field">Conteúdo JSON ou JSONL<textarea name="report" required maxlength="1000000" rows="8" style="width:100%;background:#101318;color:inherit"></textarea></label></p><button>Importar dados</button></form>`;
    const overview = `<section class="grid impact-overview" aria-label="Resumo do período"><article class="card"><p class="muted">Economia estimada</p><strong>${total.toLocaleString('pt-BR')} tokens</strong></article><article class="card"><p class="muted">Janela selecionada</p><strong>${periodNames[period]}</strong><p>${start.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${today.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p></article><article class="card"><p class="muted">Registros no período</p><strong>${events.length.toLocaleString('pt-BR')}</strong><p>${[...new Set(events.map(event => event.source))].join(', ') || 'Nenhuma origem ainda'}</p></article></section>`;
    return page('Impacto', `<h1>Economia de tokens</h1><p class="muted">Estimativas de ferramentas e registros informados manualmente. Não representam cobrança ou faturamento.</p>${notice ? `<p class="next-step">${esc(notice)}</p>` : ''}${overview}<form class="filters" method="get" action="/dashboard/impact"><div class="filter-grid">${projectFilter}<label>Período <select name="period"><option value="daily"${period === 'daily' ? ' selected' : ''}>Diário</option><option value="weekly"${period === 'weekly' ? ' selected' : ''}>Semanal</option><option value="monthly"${period === 'monthly' ? ' selected' : ''}>Mensal</option></select></label><div class="actions"><button>Aplicar filtros</button><a class="button secondary" href="/dashboard/impact">Limpar</a></div></div></form><p class="muted">Exibindo: <strong>${esc(selectedProjectName)}</strong>. RTK e Headroom não identificam uma pasta; você pode associar manualmente cada relatório a um projeto na importação. Sem associação, os eventos ficam em dados gerais.</p>${total || events.some(e => e.before != null) ? `<section class="card"><h2>Evolução por período (tokens estimados)</h2>${lines}</section><section class="card"><h2>Economia estimada por origem</h2>${pie}</section><section class="card"><h2>Comparação entre origens (tokens estimados)</h2>${bars}</section>` : '<section class="card empty-state"><h2>Sem dados neste período</h2><p>Os gráficos aparecem depois que você importa dados do RTK ou Headroom, ou registra uma comparação entre CLI e interface.</p><ol><li>Escolha o período desejado e aplique o filtro.</li><li>Importe um relatório agregado ou registre uma comparação manual.</li><li>Para separar os gráficos por projeto, associe o relatório ao projeto na importação. Sem associação, os dados ficam no resumo geral.</li></ol><div class="actions"><a class="button" href="#importar-dados">Importar dados</a><a class="button secondary" href="#comparacao-manual">Registrar comparação</a></div></section>'}${imports}${manual}`, '/dashboard/impact');
  }
  const tunnelRoot = path.resolve(tunnelProfilesDir || path.join(root, 'config', 'tunnels'));
  function routingPage(notice = '', error = '') {
    const saved = loadRoutingSettings(settingsFile);
    const config = saved?.routing;
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set('routing', token);
    const enabled = config?.enabled || [];
    const checked = name => enabled.includes(name) ? ' checked' : '';
    const value = (name, key, fallback = '') => esc(config?.executors?.[name]?.[key] ?? fallback);
    const active = config?.active !== false && Boolean(config);
    const executorOptions = (selected, available) => ['codex', 'hermes'].filter(x => available.includes(x)).map(x => `<option value="${x}"${selected === x ? ' selected' : ''}>${x === 'codex' ? 'Codex' : 'Hermes'}</option>`).join('');
    const content = `<h1>Preferências de roteamento</h1><p>Ative o roteamento para avaliar o modelo das tarefas Codex antes do preparo. A seleção aparece no resumo de aprovação e é conferida novamente antes da execução. As aprovações continuam obrigatórias conforme a política do projeto.</p>${notice ? `<p class="next-step">${esc(notice)}</p>` : ''}${error ? `<p class="next-step">${esc(error)}</p>` : ''}${!settingsFile ? '<p class="next-step">Arquivo local de preferências não configurado. O fluxo atual das ferramentas continua igual.</p>' : ''}${settingsFile && !saved ? '<p class="next-step">O arquivo local de preferências está inválido ou não contém roteamento válido. Corrija-o antes de salvar; as ferramentas continuam no fluxo atual.</p>' : ''}<p>Para todas as conversas deste adapter até reiniciar, peça ao assistente para definir uma política com <code>codex_model_session</code> e os limites mínimo, máximo e de pensamento. Cada nova tarefa mostra a escolha antes da aprovação.</p><p>Este formulário não recebe chaves de API. Configure provedores externos e credenciais no agente correspondente.</p><form class="card" method="post" action="/dashboard/routing"><input type="hidden" name="csrf" value="${token}"><label><input type="checkbox" name="active" value="yes"${active ? ' checked' : ''}> Ativar o roteamento</label><p class="muted">Desmarque para manter o roteamento desligado. Revisão atual: ${saved?.revision ?? 'sem preferências salvas'}.</p><h2>Executores disponíveis</h2><label><input type="checkbox" name="enabled" value="codex"${checked('codex')}> Codex</label> <label><input type="checkbox" name="enabled" value="hermes"${checked('hermes')}> Hermes</label><p><label class="field">Executor principal<select name="primary">${executorOptions(config?.primary, ['codex','hermes'])}</select></label></p><p><label class="field">Executor para tarefas complexas<select name="complex">${executorOptions(config?.complex, ['codex','hermes'])}</select></label></p><h2>Codex</h2><p class="muted">O avaliador examina o pedido antes de preparar a tarefa. Ele mostra o que será alterado, escolhe modelo e pensamento e nunca ultrapassa os tetos abaixo quando o roteamento está ativo. Ex.: mudar a cor de um botão pode usar Luna/low; uma mudança complexa usa até o limite configurado.</p><p><label class="field">Modelo mestre (teto)<input name="codex_model" maxlength="128" value="${value('codex','model')}" placeholder="Ex.: gpt-6-luna"></label></p><p><label class="field">Provedor (opcional)<input name="codex_provider" maxlength="128" value="${value('codex','provider')}" placeholder="Nome configurado no Codex"></label></p><p><label class="field">Pensamento máximo<select name="codex_effort">${['low','medium','high','xhigh','max'].map(x => `<option value="${x}"${config?.executors?.codex?.effort === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label></p><h2>Hermes</h2><p><label class="field">Modelo<input name="hermes_model" maxlength="128" value="${value('hermes','model')}" placeholder="Modelo configurado no Hermes"></label></p><p><label class="field">Provedor (opcional)<input name="hermes_provider" maxlength="128" value="${value('hermes','provider')}" placeholder="Nome configurado no Hermes"></label></p><p><label class="field">Esforço (opcional)<select name="hermes_effort"><option value="">Não informado</option>${['low','medium','high','xhigh'].map(x => `<option value="${x}"${config?.executors?.hermes?.effort === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label></p><p class="muted">O avaliador Codex pode usar até max em tarefas amplas e críticas, sempre respeitando o teto escolhido. Hermes usa a configuração separada acima. A disponibilidade dos modelos depende da sua conta.</p><p><label class="field">Ordem de fallback (nomes separados por vírgula)<input name="fallback" value="${esc((config?.fallback || []).join(', '))}" placeholder="codex, hermes"></label></p><button type="submit">Salvar preferências</button></form>`;
    return page('Preferências de roteamento', content, '/dashboard/routing');
  }
  async function saveRouting(req, res) {
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisição bloqueada', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 12000) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const fields = new URLSearchParams(body); const token = sessions.get('routing');
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, routingPage('', 'Confirmação inválida. Atualize a página.'), `codex_dashboard=${sessions.get('routing')}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
    sessions.delete('routing');
    try {
      const enabled = fields.getAll('enabled');
      const config = validateRoutingPreferences({ active: fields.get('active') === 'yes', enabled, primary: fields.get('primary'), complex: fields.get('complex'), executors: { codex: { model: fields.get('codex_model') || '', provider: fields.get('codex_provider') || '', effort: fields.get('codex_effort') }, hermes: { model: fields.get('hermes_model') || '', provider: fields.get('hermes_provider') || '', effort: fields.get('hermes_effort') } }, fallback: (fields.get('fallback') || '').split(',').map(x => x.trim()).filter(Boolean) });
      const result = saveRoutingSettings(settingsFile, config);
      return send(res, 200, routingPage(`Preferências salvas. Revisão ${result.revision}.`), `codex_dashboard=${sessions.get('routing')}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
    } catch (e) { return send(res, 400, routingPage('', `Não foi possível salvar: ${e.message}`), `codex_dashboard=${sessions.get('routing')}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`); }
  }
  const projects = () => {
    if (projectConfig) return projectConfig;
    try { return JSON.parse(fs.readFileSync(projectsFile, 'utf8')).projects || []; }
    catch { return []; }
  };
  const byId = id => projects().find(p => p.id === id);
  function graphifyFile(project) {
    if (!project?.realpath) return null;
    try {
      const rootPath = fs.realpathSync.native(project.realpath);
      const rootStat = fs.statSync(rootPath);
      if (rootPath.toLowerCase() !== project.realpath.toLowerCase() || String(rootStat.dev) !== String(project.dev) || String(rootStat.ino) !== String(project.ino)) return null;
      const expected = path.join(rootPath, 'graphify-out', 'graph.html');
      const actual = fs.realpathSync.native(expected);
      const stat = fs.statSync(actual);
      return actual.toLowerCase() === expected.toLowerCase() && stat.isFile() && stat.size <= 10_000_000 ? actual : null;
    } catch { return null; }
  }
  function graphifyPage() {
    const entries = projects().map(project => `<li>${esc(project.name)} — ${graphifyFile(project) ? `<a href="/dashboard/graphify/view?project=${encodeURIComponent(project.id)}" target="_blank" rel="noopener noreferrer">Abrir grafo</a>` : 'grafo ainda não gerado'}</li>`).join('');
    return page('Grafos Graphify', `<h1>Grafos Graphify</h1><p>Abra o grafo de um projeto cadastrado. Para gerar um, use Graphify na pasta do projeto; o arquivo esperado é <code>graphify-out/graph.html</code>. Graphify não mede tokens economizados.</p><ul>${entries || '<li>Nenhum projeto cadastrado.</li>'}</ul><p><a href="/dashboard/token-savings">Voltar à economia de tokens</a></p>`, '/dashboard/token-savings');
  }
  function serveGraphifyView(res, id) {
    const file = graphifyFile(byId(id));
    if (!file) return send(res, 404, page('Grafo indisponível', '<p>Grafo não encontrado ou projeto alterado.</p>'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    return res.end(fs.readFileSync(file));
  }
  const actualRoot = p => p.root ? path.resolve(p.root.startsWith('~/') ? path.join(os.homedir(), p.root.slice(2)) : p.root) : null;
  const projectFor = projectPath => {
    let realpath;
    try { realpath = fs.realpathSync.native(projectPath); }
    catch { realpath = String(projectPath); }
    return projects().find(p => p.realpath?.toLowerCase() === realpath.toLowerCase())?.id || null;
  };
  const fingerprint = projectPath => {
    const realpath = fs.realpathSync.native(projectPath);
    const stat = fs.statSync(realpath);
    if (!stat.isDirectory()) throw new Error('A pasta do projeto não existe.');
    return { realpath, dev: stat.dev, ino: stat.ino };
  };
  function configureProject(name, supplied, { allowIdentityChange = false } = {}) {
    if (projectConfig) throw new Error('Cadastro indisponível nesta configuração.');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || typeof supplied !== 'string' || !path.isAbsolute(supplied) || supplied.length > 800) {
      throw new Error('Informe o caminho absoluto de uma pasta existente e, se quiser, um nome curto.');
    }
    const identity = fingerprint(supplied);
    const existing = projects().find(p => p.realpath.toLowerCase() === identity.realpath.toLowerCase());
    if (existing) {
      const same = String(existing.ino) === String(identity.ino) && String(existing.dev) === String(identity.dev);
      if (same) return { state: 'already_configured', project: existing };
      if (!allowIdentityChange) throw new Error('A identidade da pasta mudou. Reconfirme pessoalmente em /dashboard/projects/new.');
      const confirmed = { ...existing, ...identity, root: supplied, configured_at: new Date().toISOString() };
      fs.mkdirSync(store, { recursive: true });
      fs.writeFileSync(projectsFile, JSON.stringify({ projects: projects().map(p => p.id === existing.id ? confirmed : p) }, null, 2), { mode: 0o600 });
      fs.appendFileSync(path.join(store, 'project-events.jsonl'), JSON.stringify({ action: 'identity_reconfirmed', project_id: existing.id, previous: { realpath: existing.realpath, dev: existing.dev, ino: existing.ino }, identity, at: confirmed.configured_at }) + '\n', { mode: 0o600 });
      return { state: 'identity_reconfirmed', project: confirmed };
    }
    const project = { id: crypto.randomUUID(), name: name.trim(), root: supplied, ...identity, configured_at: new Date().toISOString() };
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(projectsFile, JSON.stringify({ projects: [...projects(), project] }, null, 2), { mode: 0o600 });
    fs.appendFileSync(path.join(store, 'project-events.jsonl'), JSON.stringify({ action: 'configured', project_id: project.id, name: project.name, root: supplied, identity, at: project.configured_at }) + '\n', { mode: 0o600 });
    return { state: 'configured', project };
  }
  function verifyProject(projectPath) {
    const id = projectFor(projectPath);
    const project = id && byId(id);
    if (!project) return { ok: false, reason: 'Projeto ainda não configurado.' };
    try {
      const now = fingerprint(project.root);
      const same = now.realpath.toLowerCase() === project.realpath.toLowerCase()
        && (!project.ino || !now.ino || String(project.ino) === String(now.ino))
        && (!project.dev || !now.dev || String(project.dev) === String(now.dev));
      return same ? { ok: true, project, fingerprint: now } : { ok: false, project, reason: 'A pasta registrada mudou de identidade. Configure o projeto novamente.' };
    } catch { return { ok: false, project, reason: 'A pasta registrada não está acessível.' }; }
  }
  function setApprovalPolicy(id, level) {
    if (projectConfig) throw new Error('Políticas indisponíveis nesta configuração.');
    if (!['manual', 'assisted'].includes(level)) throw new Error('Nível de política inválido.');
    const project = byId(id);
    if (!project) throw new Error('Projeto desconhecido.');
    const verified = verifyProject(project.realpath);
    if (!verified.ok) throw new Error(verified.reason);
    const revision = Number(project.approval_policy?.revision || 0) + 1;
    const updated = { ...project, approval_policy: { level, revision, identity: { realpath: verified.fingerprint.realpath, dev: verified.fingerprint.dev, ino: verified.fingerprint.ino }, updated_at: new Date().toISOString() } };
    fs.writeFileSync(projectsFile, JSON.stringify({ projects: projects().map(p => p.id === id ? updated : p) }, null, 2), { mode: 0o600 });
    fs.appendFileSync(path.join(store, 'project-events.jsonl'), JSON.stringify({ action: 'approval_policy_changed', project_id: id, level, revision, at: updated.approval_policy.updated_at }) + '\n', { mode: 0o600 });
    return updated.approval_policy;
  }
  const notesFile = path.join(store, 'project-notes.json');
  function projectNotes(projectPath) {
    const verified = verifyProject(projectPath);
    if (!verified.ok) throw new Error(verified.reason);
    let notes = [];
    try { notes = JSON.parse(fs.readFileSync(notesFile, 'utf8')).notes || []; } catch {}
    return notes.filter(note => note.project_id === verified.project.id);
  }
  function addProjectNote(projectPath, note) {
    const verified = verifyProject(projectPath);
    if (!verified.ok) throw new Error(verified.reason);
    if (typeof note !== 'string' || !note.trim() || note.trim().length > 2000) throw new Error('Nota inválida: escreva até 2000 caracteres.');
    let notes = [];
    try { notes = JSON.parse(fs.readFileSync(notesFile, 'utf8')).notes || []; } catch {}
    if (notes.length >= 200) throw new Error('Limite de 200 notas atingido; revise o histórico antes de adicionar mais.');
    const entry = { id: crypto.randomUUID(), project_id: verified.project.id, text: note.trim(), created_at: new Date().toISOString() };
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(notesFile, JSON.stringify({ notes: [...notes, entry] }, null, 2), { mode: 0o600 });
    return entry;
  }
  const recordPath = id => path.join(store, `${id}.json`);
  function get(id) {
    if (!UUID.test(id)) return null;
    try { return JSON.parse(fs.readFileSync(recordPath(id), 'utf8')); } catch { return null; }
  }
  function save(id, patch) {
    if (!UUID.test(id)) throw new Error('ID de tarefa inválido');
    fs.mkdirSync(store, { recursive: true });
    const previous = get(id) || { task_id: id, project_id: projectFor(patch.project_directory || bridge.AUTHORIZED_PROJECT) || 'unconfigured', created_at: new Date().toISOString() };
    const value = { ...previous, ...patch, updated_at: new Date().toISOString() };
    fs.writeFileSync(recordPath(id), JSON.stringify(value, null, 2), { mode: 0o600 });
    sweepRetention();
    return value;
  }
  function records() {
    const all = new Map();
    try { for (const name of fs.readdirSync(store)) if (UUID.test(name.replace(/\.json$/, '')) && name.endsWith('.json')) {
      const item = get(name.slice(0, -5)); if (item) all.set(item.task_id, item);
    } } catch {}
    const approvalsDir = path.join(path.dirname(bridge.LOCK_PATH), 'approvals');
    try { for (const name of fs.readdirSync(approvalsDir)) if (name.endsWith('.pending.json')) {
      const id = name.slice(0, -'.pending.json'.length);
      if (!UUID.test(id) || all.has(id)) continue;
      const pending = JSON.parse(fs.readFileSync(path.join(approvalsDir, name), 'utf8'));
      const proof = path.join(approvalsDir, `${id}.approved.json`);
      const approved = fs.existsSync(proof);
      all.set(id, { task_id: id, project_directory: bridge.AUTHORIZED_PROJECT, project_id: projectFor(bridge.AUTHORIZED_PROJECT) || 'unconfigured', summary: pending.summary, state: approved ? 'approved' : pending.expiresAt > Date.now() && bridge.tasks.has(id) ? 'pending' : 'expired', ...(approved ? { approved_at: fs.statSync(proof).mtime.toISOString() } : {}), created_at: new Date(pending.expiresAt - 300_000).toISOString(), expires_at: new Date(pending.expiresAt).toISOString() });
    } } catch {}
    const reportDir = path.join(path.dirname(bridge.LOCK_PATH), 'reports');
    try { for (const name of fs.readdirSync(reportDir)) if (name.endsWith('.json')) {
      const id = name.slice(0, -5); if (!UUID.test(id)) continue;
      const report = JSON.parse(fs.readFileSync(path.join(reportDir, name), 'utf8'));
      const old = all.get(id) || { task_id: id, project_directory: bridge.AUTHORIZED_PROJECT, project_id: projectFor(bridge.AUTHORIZED_PROJECT) || 'unconfigured' };
      all.set(id, { ...old, state: old.state === 'deleted' ? 'deleted' : report.state, summary: old.summary || report.summary, result: old.result || report.result, finished_at: report.finishedAt, activity_events: Array.isArray(report.activity_events) ? report.activity_events.slice(-80) : old.activity_events,
        duration_ms: report.duration_ms ?? report.durationMs ?? old.duration_ms ?? null,
        latency_ms: report.latency_ms ?? old.latency_ms ?? null,
        model: report.model ?? old.model ?? null, effort: report.effort ?? old.effort ?? null,
        profile_origin: report.profile_origin ?? old.profile_origin ?? null });
    } } catch {}
    for (const task of bridge.tasks.values()) if ((task.executor === 'codex' || task.kind === 'readonly') && !all.has(task.id)) {
      all.set(task.id, { task_id: task.id, executor: 'codex', project_directory: task.project_directory, project_id: task.project_id || projectFor(task.project_directory) || 'unconfigured', state: task.state === 'prepared' ? 'pending' : task.state, created_at: task.startedAt || (task.expiresAt ? new Date(task.expiresAt - 300_000).toISOString() : new Date().toISOString()), updated_at: task.startedAt, activity_events: task.activity_events || [] });
    }
    return [...all.values()].map(item => {
      const live = bridge.tasks.get(item.task_id);
      if (live) item = { ...item, state: live.state === 'prepared' ? (item.state === 'approved' ? 'approved' : 'pending') : live.state || item.state, started_at: live.startedAt || item.started_at, activity_events: live.activity_events || item.activity_events };
      if (item.project_directory) item = { ...item, project_id: projectFor(item.project_directory) || 'unconfigured' };
      if (item.state === 'deleted') return item;
      if (['pending', 'prepared'].includes(item.state) && !bridge.tasks.has(item.task_id)) return { ...item, state: 'expired' };
      if (['pending', 'prepared'].includes(item.state) && item.expires_at && Date.parse(item.expires_at) < Date.now()) return { ...item, state: 'expired' };
      if (item.state === 'prepared') return { ...item, state: 'pending' };
      return item;
    }).sort((a, b) => Date.parse(b.created_at || b.updated_at || 0) - Date.parse(a.created_at || a.updated_at || 0));
  }
  const label = state => ({ pending: 'Pendente', approved: 'Aprovada', rejected: 'Recusada', completed: 'Concluída', failed: 'Falhou', expired: 'Expirada', running: 'Em execução', timeout: 'Tempo esgotado', cancelled: 'Cancelada', deleted: 'Excluída' })[state] || state;
  const nextStep = item => ({
    pending: 'Confira o executor, o projeto, a pasta e o pedido. Se tudo estiver certo, aprove; se algo estiver estranho, recuse.',
    approved: 'A aprovação foi guardada. Volte ao chat para iniciar essa tarefa.',
    running: 'A tarefa está em andamento. Aguarde e consulte o progresso; não inicie outra cópia.',
    completed: 'Abra o resultado e confira as validações. Testes que não aparecem como executados ainda precisam ser rodados separadamente.',
    rejected: 'Vocª recusou esta tarefa. Esta aprovação não iniciou a execução.',
    expired: 'A aprovação venceu. Prepare uma nova tarefa no chat se ainda quiser continuar.',
    failed: 'A tarefa falhou e pode ter feito mudanças parciais. Confira logs e arquivos antes de pedir uma nova tentativa.',
    timeout: 'A tarefa passou do tempo limite e pode ter feito mudanças parciais. Confira logs e arquivos antes de tentar de novo.',
    cancelled: 'A tarefa foi cancelada e pode ter feito mudanças antes de parar. Confira os arquivos antes de continuar.',
  })[item.state] || 'Confira o estado e o resultado antes de iniciar outra tarefa.';
  const card = t => `<article class="card"><div class="actions"><span class="badge">${esc(label(t.state))}</span><small class="muted">${esc(formatTime(t.created_at))}</small></div><h3><a href="/dashboard/task/${esc(t.task_id)}">${esc((t.summary || t.prompt || t.task_id).slice(0, 130))}</a></h3><p class="muted">${esc(byId(t.project_id)?.name || 'Projeto sem cadastro')} · ${esc(t.executor || 'Executor não informado')}</p><small class="muted">${esc(t.task_id)}</small><p><a class="button" href="/dashboard/task/${esc(t.task_id)}">Abrir detalhes</a></p></article>`;
  const sectionGroups = [
    ['recentes', 'Recentes', t => ['pending', 'approved', 'running', 'failed', 'cancelled'].includes(t.state)],
    ['concluidas', 'Concluídas', t => t.state === 'completed'],
    ['expiradas', 'Expiradas', t => t.state === 'expired'],
    ['timeout', 'Tempo esgotado', t => t.state === 'timeout'],
    ['excluidas', 'Excluídas', t => t.state === 'deleted'],
    ['recusadas', 'Recusadas', t => t.state === 'rejected'],
  ];
  const renderSections = (items, card) => sectionGroups.map(([key, title, match]) => {
    const group = items.filter(match);
    return `<section class="request-section" id="${key}"><h2>${title} <span class="muted">(${group.length})</span></h2>${group.map(card).join('') || '<p class="muted">Nenhuma request nesta seção.</p>'}</section>`;
  }).join('');
  const tunnelProfiles = () => {
    try { return JSON.parse(fs.readFileSync(tunnelRegistryFile, 'utf8')).profiles || []; }
    catch { return []; }
  };
  const tunnelYaml = profile => [
    'config_version: 1', 'control_plane:', '  base_url: "https://api.openai.com"', `  tunnel_id: ${JSON.stringify(profile.tunnel_id)}`,
    '  api_key: "env:CONTROL_PLANE_API_KEY"', 'health:', `  listen_addr: "127.0.0.1:${profile.health_port}"`,
    'admin_ui:', '  open_browser: false', 'log:', '  level: info', '  format: json', 'mcp:', '  extra_headers:', '    X-CodexBridge-Token: "env:CODEXBRIDGE_MCP_TOKEN"', '  server_urls:', '    - channel: main', `      url: ${JSON.stringify(profile.mcp_url)}`, '',
  ].join('\n');
  const tunnelDigest = text => crypto.createHash('sha256').update(text).digest('hex');
  function validateTunnelInput(fields) {
    const name = String(fields.get('profile') || '').trim().toLowerCase();
    const tunnelId = String(fields.get('tunnel_id') || '').trim();
    const mcpUrl = String(fields.get('mcp_url') || '').trim() || `${baseUrl}/mcp`;
    const port = Number(fields.get('health_port'));
    if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(name)) throw new Error('Use um nome de perfil com 1 a 48 caracteres: letras minúsculas, números e hífen.');
    if (!/^tunnel_[A-Za-z0-9_-]{8,80}$/.test(tunnelId)) throw new Error('Confira o ID do tunnel. Ele deve começar com tunnel_.');
    let parsed;
    try { parsed = new URL(mcpUrl); } catch { throw new Error('Informe uma URL válida do servidor MCP.'); }
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw new Error('Use HTTPS ou HTTP local. A URL não pode conter usuário, senha, par¢metros ou fragmento.');
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('A porta de saúde deve ser um número entre 1024 e 65535.');
    return { profile: name, tunnel_id: tunnelId, mcp_url: parsed.toString().replace(/\/$/, ''), health_port: port };
  }
  function writeTunnelRegistry(entries) {
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(tunnelRegistryFile, JSON.stringify({ profiles: entries }, null, 2), { mode: 0o600 });
  }
  function saveTunnelProfile(input, id = '') {
    const fields = validateTunnelInput(input);
    const current = tunnelProfiles();
    const existing = id ? current.find(x => x.id === id) : null;
    if (id && !existing) throw new Error('Perfil não encontrado. Atualize a página e tente novamente.');
    if (current.some(x => x.profile === fields.profile && x.id !== id)) throw new Error('Já existe um perfil com esse nome neste painel.');
    if (current.some(x => x.health_port === fields.health_port && x.id !== id)) throw new Error('Esta porta de saúde já está reservada por outro perfil.');
    const file = path.join(tunnelRoot, `${fields.profile}.yaml`);
    if (path.dirname(file) !== path.resolve(tunnelRoot)) throw new Error('Nome de perfil inválido.');
    let oldText = '';
    if (existing) {
      if (existing.profile !== fields.profile) throw new Error('O nome do perfil não pode ser alterado. Crie outro perfil e remova o anterior.');
      if (path.resolve(existing.file) !== path.resolve(file)) throw new Error('O cadastro do perfil aponta para um caminho inesperado. Alteração bloqueada.');
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('O arquivo do perfil não é um arquivo regular. Alteração bloqueada.');
      oldText = fs.readFileSync(file, 'utf8');
      if (tunnelDigest(oldText) !== existing.sha256) throw new Error('O arquivo foi alterado fora do dashboard. Para preservar suas mudanças, nenhuma alteração foi feita.');
    } else if (fs.existsSync(file)) throw new Error('Já existe um arquivo com esse nome no tunnel-client. Escolha outro nome para não sobrescrevª-lo.');
    fs.mkdirSync(tunnelRoot, { recursive: true });
    const nextText = tunnelYaml(fields);
    let backup = '';
    try {
      if (existing) {
        backup = `${file}.backup-${Date.now()}`;
        fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
        fs.writeFileSync(file, nextText, { mode: 0o600 });
      } else {
        fs.writeFileSync(file, nextText, { mode: 0o600, flag: 'wx' });
      }
    } catch (error) {
      if (backup) try { fs.copyFileSync(backup, file); } catch {}
      throw error;
    }
    const entry = { id: existing?.id || crypto.randomUUID(), ...fields, file, sha256: tunnelDigest(nextText), updated_at: new Date().toISOString(), ...(backup ? { backup } : {}) };
    try { writeTunnelRegistry(existing ? current.map(x => x.id === id ? entry : x) : [...current, entry]); }
    catch (error) {
      if (existing && backup) try { fs.copyFileSync(backup, file); } catch {}
      else if (!existing) try { fs.unlinkSync(file); } catch {}
      throw error;
    }
    return entry;
  }
  function removeTunnelProfile(id) {
    const current = tunnelProfiles();
    const entry = current.find(x => x.id === id);
    if (!entry) throw new Error('Perfil não encontrado.');
    if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(entry.profile) || path.resolve(entry.file) !== path.resolve(tunnelRoot, `${entry.profile}.yaml`)) throw new Error('O cadastro do perfil aponta para um caminho inesperado. Remoção bloqueada.');
    const stat = fs.lstatSync(entry.file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('O arquivo do perfil não é regular. Remoção bloqueada.');
    const text = fs.readFileSync(entry.file, 'utf8');
    if (tunnelDigest(text) !== entry.sha256) throw new Error('O arquivo foi alterado fora do dashboard. Para preservar suas mudanças, nenhuma alteração foi feita.');
    const backup = `${entry.file}.removed-${Date.now()}.bak`;
    fs.copyFileSync(entry.file, backup, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(entry.file);
    try { writeTunnelRegistry(current.filter(x => x.id !== id)); }
    catch (error) { try { fs.copyFileSync(backup, entry.file); } catch {} throw error; }
    return backup;
  }
  function requestsPage(params = new URLSearchParams()) {
    const rows = records();
    const requested = params.get('project') || 'all';
    const project = requested === 'all' || requested === 'unconfigured' || projects().some(p => p.id === requested) ? requested : 'all';
    const query = String(params.get('q') || '').trim().slice(0, 100).toLocaleLowerCase('pt-BR');
    const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
    let filtered = rows.filter(item => {
      if (project !== 'all' && item.project_id !== project) return false;
      return !query || [item.summary, item.prompt, item.task_id, item.executor, byId(item.project_id)?.name].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(query));
    });
    if (sort === 'oldest') filtered = [...filtered].reverse();
    const chooser = `<div class="project-chooser"><a class="${project === 'all' ? 'active' : ''}" href="/dashboard/requests?project=all">Todas as requests</a>${projects().map(p => `<a class="${project === p.id ? 'active' : ''}" href="/dashboard/requests?project=${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join('')}<a class="${project === 'unconfigured' ? 'active' : ''}" href="/dashboard/requests?project=unconfigured">Sem projeto</a></div>`;
    const chartRows = rows.filter(t => project === 'all' || t.project_id === project);
    const outcomes = [['Aprovadas', chartRows.filter(t => ['approved', 'completed', 'running'].includes(t.state) || t.approved_at).length, ''], ['Recusadas', chartRows.filter(t => t.state === 'rejected').length, 'red'], ['Expiradas', chartRows.filter(t => t.state === 'expired').length, 'white'], ['Tempo esgotado', chartRows.filter(t => t.state === 'timeout').length, 'amber']];
    const max = Math.max(1, ...outcomes.map(([, n]) => n));
    const chart = `<div class="card chart"><h2>Resumo das aprovações</h2>${outcomes.map(([name, n, color]) => `<div class="chart-row"><span>${name}</span><div class="bar-track"><div class="bar ${color}" style="width:${Math.round(n * 100 / max)}%"></div></div><strong>${n}</strong></div>`).join('')}</div>`;
    const filters = `<form class="filters" method="get" action="/dashboard/requests"><input type="hidden" name="project" value="${esc(project)}"><div class="filter-grid"><label>Buscar request<input name="q" value="${esc(params.get('q') || '')}" maxlength="100" placeholder="Nome, texto ou ID"></label><label>Ordem<select name="sort"><option value="newest"${sort === 'newest' ? ' selected' : ''}>Mais recentes</option><option value="oldest"${sort === 'oldest' ? ' selected' : ''}>Mais antigas</option></select></label><div class="actions"><button type="submit">Aplicar</button><a class="button" href="/dashboard/requests?project=${encodeURIComponent(project)}">Limpar</a></div></div></form>`;
    const title = project === 'all' ? 'Todas as requests' : project === 'unconfigured' ? 'Sem projeto' : byId(project)?.name || 'Projeto';
    return page('Requests', `<h1>Requests</h1><p class="muted">Escolha um projeto. As seis seções ficam visíveis em cada seleção.</p>${chooser}<h2>${esc(title)}</h2>${chart}${filters}${renderSections(filtered, card)}`, '/dashboard/requests');
  }
  function tunnelsPage(params = new URLSearchParams(), notice = '') {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set('tunnel-profiles', token);
    const profiles = tunnelProfiles();
    let profileIndex = 1; let suggestedProfile = 'codexbridge';
    while (profiles.some(profile => profile.profile === suggestedProfile)) suggestedProfile = `codexbridge-${profileIndex++}`;
    const editId = String(params.get('edit') || '');
    const editing = editId ? profiles.find(p => p.id === editId) : null;
    let suggestedPort = 18080;
    while (profiles.some(p => p.health_port === suggestedPort)) suggestedPort += 1;
    const form = `<form class="card" method="post" action="/dashboard/tunnels/save"><h2>${editing ? 'Editar conexão' : 'Configurar conexão'}</h2><p>O único dado obrigatório aqui é o Tunnel ID que você já criou ou selecionou na OpenAI Platform.</p><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(editing?.id || '')}"><input type="hidden" name="profile" value="${esc(editing?.profile || suggestedProfile)}"><input type="hidden" name="mcp_url" value="${esc(editing?.mcp_url || `${baseUrl}/mcp`)}"><input type="hidden" name="health_port" value="${esc(editing?.health_port || suggestedPort)}"><label class="field">Tunnel ID<input name="tunnel_id" required maxlength="86" value="${esc(editing?.tunnel_id || '')}" placeholder="tunnel_..." autocomplete="off"><span class="muted">Não cole a API key neste campo. A runtime key será solicitada de forma oculta ao iniciar o túnel.</span></label><details><summary>Opções avançadas</summary><p><label class="field">Nome do perfil<input name="profile_edit" value="${esc(editing?.profile || suggestedProfile)}" maxlength="48" pattern="[a-z0-9][a-z0-9-]{0,46}[a-z0-9]?" ${editing ? 'readonly' : ''}></label></p><p><label class="field">URL MCP local<input name="mcp_url_edit" type="url" maxlength="2000" value="${esc(editing?.mcp_url || `${baseUrl}/mcp`)}"></label></p><p><label class="field">Porta local de saúde<input name="health_port_edit" type="number" min="1024" max="65535" value="${esc(editing?.health_port || suggestedPort)}"></label></p></details><div class="actions"><button type="submit">${editing ? 'Salvar conexão' : 'Salvar Tunnel ID'}</button>${editing ? '<a class="button secondary" href="/dashboard/tunnels">Cancelar</a>' : ''}</div></form>`;
    const list = profiles.map(p => `<article class="card"><h3>${esc(p.profile)}</h3><p>Tunnel ID: <code>${esc(p.tunnel_id)}</code></p><p>Servidor MCP: <code>${esc(p.mcp_url)}</code></p><p>Arquivo: <code>${esc(p.file)}</code></p><p class="muted">Runtime key: variável de ambiente, não salva aqui.</p><div class="actions"><a class="button" href="/dashboard/tunnels?edit=${encodeURIComponent(p.id)}">Alterar</a><details><summary>Remover perfil</summary><p>O arquivo será retirado de uso e guardado como backup. O tunnel da OpenAI Platform não será apagado.</p><form method="post" action="/dashboard/tunnels/remove"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(p.id)}"><button class="danger" type="submit">Confirmar remoção</button></form></details></div></article>`).join('');
    const launchProjects = projects().filter(project => project?.id && project.realpath && verifyProject(project.realpath).ok);
    const launchProjectId = String(params.get('launch_project') || '');
    const selectedLaunchProject = launchProjects.find(project => project.id === launchProjectId);
    const projectOptions = launchProjects.map(project => `<option value="${esc(project.id)}"${selectedLaunchProject?.id === project.id ? ' selected' : ''}>${esc(project.name || path.basename(project.realpath))}</option>`).join('');
    const projectPicker = `<form class="card" method="get" action="/dashboard/tunnels"><h2>Escolher projeto para iniciar</h2><p>Selecione uma pasta cadastrada e verificada. Essa escolha monta o comando de inicializa\u00e7\u00e3o; n\u00e3o altera o projeto autorizado do adapter em execu\u00e7\u00e3o.</p><label class="field">Pasta do projeto<select name="launch_project"><option value=""${selectedLaunchProject ? '' : ' selected'}>Sem projeto (guias e diagn\u00f3sticos)</option>${projectOptions}</select></label><p><button type="submit">Preparar comandos</button> <a href="/dashboard/projects/new">Cadastrar outra pasta</a></p></form>`;
    const adapterCommand = '& "' + path.join(root, 'Start.cmd') + '"' + (selectedLaunchProject ? ' -Project "' + selectedLaunchProject.realpath + '"' : '');
    const tunnelCommands = profiles.length ? profiles.map(profile => `<details><summary>${esc(profile.profile)} · Tunnel ${esc(profile.tunnel_id)}</summary><p>Inicie este comando em outro PowerShell e digite a runtime key quando solicitado. A entrada fica oculta e a chave n\u00e3o \u00e9 salva:</p><pre>${esc('& "' + path.join(root, 'Tunnel.cmd') + '" -ProfileName "' + profile.profile + '"')}</pre></details>`).join('') : '<p>Salve um Tunnel ID acima para preparar o comando de conexao.</p>'
    const launchGuide = `<section class="card"><h2>Iniciar adapter e tunnel</h2>${projectPicker}<p>Primeiro, rode o adapter com o projeto indicado:</p><pre>${esc(adapterCommand)}</pre>${selectedLaunchProject ? `<p class="muted">Projeto escolhido: ${esc(selectedLaunchProject.name)} \u00b7 ${esc(selectedLaunchProject.realpath)}</p>` : '<p class="muted">Sem projeto: ficam dispon\u00edveis guias e diagn\u00f3sticos; para tarefas com arquivos, informe uma pasta explicitamente.</p>'}<h3>Depois, inicie a conex\u00e3o MCP</h3>${tunnelCommands}</section>`;
    const onboarding = `<section class="card" aria-labelledby="tunnel-steps"><h2 id="tunnel-steps">Conectar em três passos</h2><ol class="setup-steps"><li><strong>Escolha ou crie o Tunnel na OpenAI Platform.</strong><p>Copie o Tunnel ID e crie uma runtime API key. O formulário abaixo pede somente o ID; nunca cole a chave no dashboard.</p><p><a class="button secondary" href="https://platform.openai.com/settings/organization/tunnels" target="_blank" rel="noreferrer">Abrir Tunnels</a> <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" rel="noreferrer">Criar runtime key</a></p></li><li><strong>Salve o ID abaixo.</strong><p>O CodexBridge prepara o perfil local e preenche o endpoint e a porta automaticamente.</p></li><li><strong>Inicie o adapter e o tunnel.</strong><p>Escolha a pasta explicitamente ao iniciar o adapter. O comando do tunnel pede a runtime key com entrada oculta. Depois, conecte o mesmo Tunnel ID no ChatGPT.</p></li></ol><p class="muted">O Tunnel precisa existir na Platform. Criá-lo automaticamente exige uma credencial administrativa separada; esta configuração usa somente a runtime key.</p></section>`;
    const instructions = `<details class="card"><summary>Ajuda: projeto, runtime key e conexão no ChatGPT</summary><ol><li>Para escolher a pasta de trabalho, inicie <code>Start.cmd -Project "CAMINHO_DA_PASTA"</code>. Cadastrar uma pasta no painel organiza o histórico; não muda a pasta autorizada do adapter que já está rodando.</li><li>Inicie o perfil pelo comando mostrado acima. Quando solicitado, digite a runtime key no terminal; o texto não aparece na tela e o CodexBridge não a guarda.</li><li>Em <a href="https://chatgpt.com/#settings/Connectors" target="_blank" rel="noreferrer">Configurações de conectores do ChatGPT</a>, adicione o servidor e informe o Tunnel ID. A revisão das permissões e a criação no workspace continuam sendo feitas por você.</li></ol></details>`;
    let toolManifest = null;
    try {
      const manifestFile = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'CodexBridge', 'tools', 'current.json') : '';
      if (manifestFile) toolManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    } catch {}
    const toolState = [['Node.js', toolManifest?.node], ['tunnel-client', toolManifest?.tunnelClient]].map(([label, tool]) => tool?.path && fs.existsSync(tool.path) ? label + ' ' + String(tool.version || 'instalado') : label + ' sem instala\u00e7\u00e3o gerenciada registrada').join(' e ');
    const toolsInstall = `<section class="card"><h2>Preparar ferramentas deste computador</h2><p><strong>Estado:</strong> ${esc(toolState)}</p><p>Instala Node.js e tunnel-client na pasta do seu usu\u00e1rio, sem pedir administrador. O estado acima verifica apenas a instala\u00e7\u00e3o gerenciada pelo CodexBridge. Os pacotes oficiais s\u00e3o conferidos por SHA-256 antes da instala\u00e7\u00e3o. Nenhuma chave é solicitada ou salva.</p><form method="post" action="/dashboard/tunnels/install-tools"><input type="hidden" name="csrf" value="${token}"><label><input type="checkbox" name="allow_install" value="yes" required> Permito baixar e instalar as ferramentas oficiais verificadas.</label><p><button type="submit">Instalar ou atualizar ferramentas</button></p></form><p class="muted">O download pode levar alguns minutos. Para desativar a instala\u00e7\u00e3o autom\u00e1tica ao iniciar adapter/tunnel, defina <code>autoInstallTools</code> como <code>false</code> em <code>config/settings.local.json</code>.</p></section>`;
    return page('Configurar tunnels', `<h1>Configurar conexão MCP</h1><p class="muted">Informe o Tunnel ID. O projeto é escolhido quando você inicia o adapter; a runtime key é digitada de forma oculta ao iniciar o tunnel.</p>${notice ? `<p class="next-step" role="status">${esc(notice)}</p>` : ''}${onboarding}${toolsInstall}${form}${launchGuide}${instructions}<details class="card"><summary>Perfis locais salvos (${profiles.length})</summary><p>Configurações deste computador em <code>${esc(tunnelRoot)}</code>. Arquivos protegidos por verificação de integridade e backup.</p>${list || '<p class="muted">Nenhum perfil salvo.</p>'}</details>`, '/dashboard/tunnels');
  }
  async function installTunnelTools(req, res) {
    if (process.platform !== 'win32') return send(res, 400, tunnelsPage(new URLSearchParams(), 'A instala\u00e7\u00e3o pelo painel est\u00e1 dispon\u00edvel no Windows.'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisi\u00e7\u00e3o bloqueada', '<p>Endere\u00e7o local inv\u00e1lido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2000) return send(res, 413, page('Erro', '<p>Requisi\u00e7\u00e3o longa.</p>')); }
    const fields = new URLSearchParams(body);
    const token = sessions.get('tunnel-profiles');
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisi\u00e7\u00e3o bloqueada', '<p>Confirma\u00e7\u00e3o inv\u00e1lida. Atualize a p\u00e1gina.</p>'));
    sessions.delete('tunnel-profiles');
    if (fields.get('allow_install') !== 'yes') return send(res, 400, tunnelsPage(new URLSearchParams(), 'Marque a permiss\u00e3o para iniciar a instala\u00e7\u00e3o.'));
    const installer = path.join(root, 'scripts', 'Install-Tools.ps1');
    if (!fs.existsSync(installer)) return send(res, 500, tunnelsPage(new URLSearchParams(), 'O instalador scripts/Install-Tools.ps1 n\u00e3o foi encontrado.'));
    try {
      const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer, '-Component', 'All'], { encoding: 'utf8', timeout: 300_000, maxBuffer: 1_000_000, windowsHide: true, shell: false, env: createChildEnvironment() });
      const details = esc((stdout + (stderr ? '\n' + stderr : '')).trim().slice(-8000));
      return send(res, 200, page('Ferramentas instaladas', '<h1>Instala\u00e7\u00e3o conclu\u00edda</h1><p>Node.js e tunnel-client foram preparados para este usu\u00e1rio.</p><details><summary>Ver detalhes</summary><pre>' + details + '</pre></details><p><a href="/dashboard/tunnels">Voltar para Tunnels</a></p>', '/dashboard/tunnels'));
    } catch (error) {
      const details = esc(((error.stdout || '') + (error.stderr ? '\n' + error.stderr : '') + (error.message || '')).trim().slice(-8000));
      return send(res, 500, page('Falha na instala\u00e7\u00e3o', '<h1>N\u00e3o foi poss\u00edvel instalar as ferramentas</h1><p>Confira a conex\u00e3o e tente novamente. Nenhuma chave de API foi solicitada.</p><details open><summary>Detalhes do erro</summary><pre>' + details + '</pre></details><p><a href="/dashboard/tunnels">Voltar para Tunnels</a></p>', '/dashboard/tunnels'));
    }
  }
  async function handleTunnelPost(req, res, action) {
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisição bloqueada', '<p>Endereço local inválido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 6000) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const fields = new URLSearchParams(body);
    const token = sessions.get('tunnel-profiles');
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisição bloqueada', '<p>Confirmação inválida. Atualize a página.</p>'));
    sessions.delete('tunnel-profiles');
    try {
      if (action === 'save') {
      const id = String(fields.get('id') || '');
        if (id && !UUID.test(id)) throw new Error('ID de perfil inválido.');
        const profileFields = new URLSearchParams(fields);
        if (fields.has('profile_edit')) profileFields.set('profile', fields.get('profile_edit'));
        if (fields.has('mcp_url_edit')) profileFields.set('mcp_url', fields.get('mcp_url_edit'));
        if (fields.has('health_port_edit')) profileFields.set('health_port', fields.get('health_port_edit'));
        const entry = saveTunnelProfile(profileFields, id);
        return send(res, 200, tunnelsPage(new URLSearchParams(), `Perfil ${entry.profile} salvo. Runtime key não armazenada.`));
      }
      const backup = removeTunnelProfile(String(fields.get('id') || ''));
      return send(res, 200, tunnelsPage(new URLSearchParams(), `Perfil removido. Backup preservado em ${backup}.`));
    } catch (error) { return send(res, 400, tunnelsPage(new URLSearchParams(), error.message)); }
  }
  function mcpSetups() {
    try {
      const value = JSON.parse(fs.readFileSync(mcpSetupsFile, 'utf8'));
      return Array.isArray(value.setups) ? value.setups.filter(item => item && UUID.test(item.id || '') && Array.isArray(item.target_clients)) : [];
    } catch { return []; }
  }
  function writeMcpSetups(setups) {
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(mcpSetupsFile, JSON.stringify({ setups }, null, 2), { mode: 0o600 });
  }
  function mcpSetupPage(notice = '', draft = {}) {
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(mcpSetupSession, token);
    const value = key => esc(draft[key] || '');
    const selected = new Set(Array.isArray(draft.target_clients) ? draft.target_clients : ['codex_cli']);
    const profiles = mcpSetups();
    const profileCards = profiles.map(profile => {
      let prepared;
      try { prepared = prepareMcpSetup({ server_name: profile.server_name, connection_type: profile.connection_type, server_url: profile.server_url || undefined, stdio_command: profile.stdio_command, stdio_args: profile.stdio_args, auth_method: profile.authentication, auth_env_var: profile.auth_env_var, auth_header_name: profile.auth_header_name || undefined, target_clients: profile.target_clients }); }
      catch { return `<article class="card mcp-profile"><h2>${esc(profile.server_name || 'MCP')}</h2><p class="muted">Este cadastro local tem dados inválidos e não foi convertido em comandos.</p></article>`; }
      const done = prepared.selected_cli_destinations.filter(client => profile.statuses?.[client] === 'configured' || profile.statuses?.[client] === 'skipped').length;
      const progress = Math.round(done / prepared.selected_cli_destinations.length * 100);
      const connectionSummary = profile.connection_type === 'local_stdio'
        ? `Servidor local (stdio): ${profile.stdio_command || 'executável não informado'}${Array.isArray(profile.stdio_args) && profile.stdio_args.length ? ` ${profile.stdio_args.join(' ')}` : ''}`
        : profile.server_url || `Conexão: ${profile.connection_type || 'não especificada'}; solicite os dados ao responsável`;
      const clients = prepared.selected_cli_destinations.map(client => {
        const status = ['pending', 'configured', 'skipped'].includes(profile.statuses?.[client]) ? profile.statuses[client] : 'pending';
        const stateLabel = { pending: 'Pendente', configured: 'Configurado por você', skipped: 'Ignorado' }[status];
        const command = prepared[client].config_snippet ? `<h4>Trecho ${esc(prepared[client].config_format || 'JSON/JSONC')} para revisar e mesclar</h4><pre class="mcp-command">${esc(prepared[client].config_snippet)}</pre>` : prepared[client].command ? `<h4>Comando para revisar</h4><pre class="mcp-command">${esc(prepared[client].command)}</pre>` : `<p class="next-step">${esc(prepared[client].command_unavailable_reason || 'Este destino requer configuração manual.')}</p>`;
        const checkResult = profile.verifications?.[client];
        const checkLabel = checkResult?.status === 'found' ? `Registro encontrado (${esc(formatTime(checkResult.checked_at))})` : checkResult?.status === 'missing' ? `Registro n&atilde;o encontrado na ultima consulta (${esc(formatTime(checkResult.checked_at))})` : checkResult?.status === 'unavailable' ? 'CLI ou configura&ccedil;&atilde;o indisponivel para consulta' : 'Registro local ainda n&atilde;o conferido';
        const verification = client === 'opencode_cli'
          ? `<p class="muted">${checkLabel}. O painel n&atilde;o consulta OpenCode automaticamente: a configura&ccedil;&atilde;o pode ser JSONC global ou por projeto, e <code>opencode mcp list</code> mostra estado de conexao.</p>`
          : `<p class="muted">${checkLabel}. A consulta verifica somente o registro local, n&atilde;o a conexao remota nem a autenticacao.</p><form method="post" action="/dashboard/mcps/verify-cli"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(profile.id)}"><input type="hidden" name="client" value="${esc(client)}"><button class="secondary" type="submit">Conferir registro local</button></form>`;
        const connectionTest = client === 'hermes_cli'
          ? (() => {
              const result = profile.connection_tests?.hermes_cli;
              const registered = profile.verifications?.hermes_cli?.status === 'found';
              const label = result?.status === 'connected' ? `Conex\u00e3o testada com sucesso (${esc(formatTime(result.checked_at))})` : result?.status === 'failed' ? `Falha no \u00faltimo teste (${esc(formatTime(result.checked_at))}); confira o Hermes para ver o motivo` : result?.status === 'not_registered' ? `Hermes n\u00e3o encontrou esse servidor na verifica\u00e7\u00e3o mais recente (${esc(formatTime(result.checked_at))})` : result?.status === 'unavailable' ? 'N\u00e3o foi poss\u00edvel verificar o Hermes no \u00faltimo teste' : 'Conex\u00e3o ainda n\u00e3o testada';
              const action = registered
                ? `<form method="post" action="/dashboard/mcps/test-connection"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(profile.id)}"><input type="hidden" name="client" value="hermes_cli"><label class="checklist"><input type="checkbox" name="allow_connection_test" value="yes" required> Autorizo o Hermes a testar agora a conex\u00e3o deste servidor.</label><button class="secondary" type="submit">Testar conex\u00e3o do Hermes</button></form>`
                : '<p class="muted">Confira primeiro o registro local do Hermes. O teste de conex\u00e3o s\u00f3 fica dispon\u00edvel quando o Hermes listar esse nome.</p>';
              return `<p class="muted">${label}. O teste usa a configura\u00e7\u00e3o Hermes com este nome, pode acessar o servidor e usar credenciais j\u00e1 configuradas no Hermes. O painel guarda apenas o resultado e hor\u00e1rio, nunca a sa\u00edda do terminal.</p>${action}`;
            })()
          : '';
        return `<details class="mcp-target"><summary>${esc(MCP_CLIENTS[client] || client)} · ${stateLabel}</summary>${command}${verification}${connectionTest}<ol>${prepared[client].steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><form class="mcp-status" method="post" action="/dashboard/mcps/status"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(profile.id)}"><input type="hidden" name="client" value="${esc(client)}"><label>Progresso<select name="status">${[['pending','Pendente'],['configured','Configurado por mim'],['skipped','Ignorado']].map(([key,label]) => `<option value="${key}"${status === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button class="secondary" type="submit">Salvar</button></form></details>`;
      }).join('');
      return `<article class="card mcp-profile"><details><summary><strong>${esc(profile.server_name)}</strong> <span class="badge">${done}/${prepared.selected_cli_destinations.length} destinos revisados</span></summary><p class="muted">${esc(connectionSummary)} · autenticação: ${esc(profile.authentication)}${profile.auth_env_var ? ` &middot; vari&aacute;vel: <code>${esc(profile.auth_env_var)}</code>${profile.auth_header_name ? ` &middot; cabe&ccedil;alho: <code>${esc(profile.auth_header_name)}</code>` : ''}` : ''}</p><div class="progress-track" role="img" aria-label="Progresso: ${progress}%"><div class="progress-value" style="width:${progress}%"></div></div><div class="mcp-targets">${clients}</div><p class="muted">O progresso é uma anotação local sua. Para Hermes, o teste de conexão aparece no destino Hermes e só roda após seu aceite.</p></details><form method="post" action="/dashboard/mcps/remove"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(profile.id)}"><button class="danger" type="submit">Remover este roteiro</button></form></article>`;
    }).join('');
    const connectionOptions = [['remote_url','URL remota HTTPS'],['local_stdio','Servidor local stdio'],['openai_tunnel','Tunnel'],['local_dev','Desenvolvimento local'],['not_sure','Ainda não sei']];
    const codexServers = codexMcpRecords();
    const codexConfigPath = codexMcpConfigFile();
    const codexServerCards = codexServers.map(server => `<article class="card"><h3>${esc(server.name)}</h3><p>${esc(server.description)}</p><p class="muted">${esc(server.connection_type === 'tunnel' ? 'Endpoint de tunnel' : 'HTTPS')} · ${esc(server.url)} · autenticação: ${esc(server.authentication_label)}</p><p class="muted">Adicionado em ${esc(formatTime(server.created_at))} · descrição local deste painel</p>${server.authentication === 'oauth' ? `<p>Para autenticar, execute <code>codex mcp login ${esc(server.name)}</code>.</p>` : ''}<p class="muted">${server.configuration_status === 'listed' ? `Localizado em codex mcp list (${esc(formatTime(server.configuration_checked_at))}).` : server.configuration_status === 'not_listed' ? `N\u00e3o localizado na \u00faltima consulta (${esc(formatTime(server.configuration_checked_at))}).` : server.configuration_status === 'check_failed' ? 'N\u00e3o foi poss\u00edvel consultar a lista do Codex.' : 'Registro do Codex ainda n\u00e3o conferido pelo painel.'} Esta verifica\u00e7\u00e3o consulta somente a lista local; n\u00e3o testa rede nem autentica\u00e7\u00e3o.</p><form method="post" action="/dashboard/mcps/verify"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="codex_server_name" value="${esc(server.name)}"><button class="secondary" type="submit">Conferir registro local</button></form><p>Para remover, use <code>codex mcp remove ${esc(server.name)}</code>.</p></article>`).join('');
    const clientGuides = `<details class="mcp-client-guide"><summary>O que vou receber para cada CLI?</summary><ul><li><strong>Codex CLI:</strong> para URL remota com bearer, o comando usa o nome da vari&aacute;vel, nunca o token. O Codex aceita bearer por vari&aacute;vel apenas em MCP HTTP.</li><li><strong>Hermes CLI:</strong> sem chave, recebe comando para revisar. Com chave, recebe trecho JSON/YAML de configura&ccedil;&atilde;o com referencia de ambiente; o Hermes tamb&eacute;m aceita env em servidores stdio.</li><li><strong>Gemini CLI:</strong> sem chave, recebe comando para revisar. Com chave em stdio, recebe trecho JSON que expande env. Para chave em cabe&ccedil;alho HTTP, fica manual: a CLI aceita cabe&ccedil;alhos, mas n&atilde;o documenta expansao de env neles.</li><li><strong>OpenCode CLI:</strong> recebe trecho JSON/JSONC para mesclar; o trecho usa referencias de ambiente em env local ou cabe&ccedil;alhos remotos.</li></ul><p class="muted">Cada CLI mant&eacute;m sua configura&ccedil;&atilde;o. O roteiro n&atilde;o grava segredos nem altera os arquivos dos clientes; somente o formulario separado do Codex cria um servidor ap&oacute;s seu aceite.</p></details>`;
    const codexForm = `<form class="card mcp-codex-form" method="post" action="/dashboard/mcps/codex-create"><h2>Adicionar servidor ao Codex</h2><p class="muted">Cria no Codex deste computador, em escopo global de usuário, sem exigir projeto. O Codex Desktop, CLI e extensão compartilham essa configuração.</p><input type="hidden" name="csrf" value="${token}"><label class="field">Nome<input name="codex_server_name" required maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,79}" placeholder="ex.: docs"><span class="muted">Letras, números, hífen e sublinhado.</span></label><label class="field">Descrição<input name="codex_description" required maxlength="300" placeholder="Para que serve este servidor MCP"></label><label class="field">Conexão<select name="codex_connection_type" required><option value="https">HTTPS</option><option value="tunnel">Tunnel (URL do endpoint)</option></select></label><label class="field">URL do endpoint MCP<input type="url" name="codex_server_url" required maxlength="2048" placeholder="https://servidor.exemplo/mcp"><span class="muted">Use a URL HTTPS do endpoint. Para Tunnel, informe a URL MCP gerada pelo tunnel; o Codex CLI não configura um Tunnel ID isolado.</span></label><label class="field">Autenticação<select name="codex_authentication"><option value="none">Sem autenticação</option><option value="oauth">OAuth</option><option value="bearer_env">Token salvo em variável de ambiente</option></select></label><label class="field mcp-codex-auth-env">Nome da variável de ambiente<input name="codex_auth_env_var" maxlength="128" placeholder="Ex.: MINHA_MCP_TOKEN"><span class="muted">Preencha somente quando usar token. Informe o nome da variável, nunca o valor secreto.</span></label><label><input type="checkbox" name="codex_trust_confirm" value="yes" required> Confio neste servidor, vou revisar as ferramentas e as permissões e concordo com as normas de uso.</label><p class="muted">A descrição fica salva no painel. O Codex CLI não tem um campo de descrição de servidor em sua configuração. Tokens não são enviados nem guardados por este formulário. Arquivo do Codex: <code>${esc(codexConfigPath)}</code>.</p><button type="submit">Criar no Codex</button></form>`;
    const form = `<form class="card mcp-setup-form" method="post" action="/dashboard/mcps/setup"><h2>Novo roteiro de configuração</h2><p class="muted">Passo 1: use o nome e os dados de conexão fornecidos pelo responsável do servidor MCP. Se não souber o transporte, pergunte a ele antes de continuar.</p><input type="hidden" name="csrf" value="${token}"><label class="field">Nome do MCP<input name="server_name" value="${value('server_name')}" maxlength="80" placeholder="ex.: Agenda" required><span class="muted">Use letras sem acento, números, ponto, hífen ou sublinhado.</span></label><label class="field">Como o servidor é acessado<select name="connection_type">${connectionOptions.map(([key,label]) => `<option value="${key}"${(draft.connection_type || 'remote_url') === key ? ' selected' : ''}>${label}</option>`).join('')}</select><span class="muted">Escolha o transporte indicado pelo responsável. Abaixo aparecerão os dados relevantes para essa opção.</span></label><div class="mcp-transport-fields"><div data-transport="remote_url"><label class="field">URL do servidor MCP<input name="server_url" value="${value('server_url')}" maxlength="2048" placeholder="https://servidor.exemplo/mcp"><span class="muted">Use o endereço HTTPS informado pelo responsável. Não inclua senha, chave ou token em nenhum trecho, parâmetro ou fragmento. O endereço é salvo localmente.</span></label></div><div data-transport="local_stdio"><label class="field">Executável local (stdio)<input name="stdio_command" value="${value('stdio_command')}" maxlength="512" placeholder="ex.: npx, python ou caminho do executável"><span class="muted">Informe só o programa. Os argumentos vão no campo seguinte; não inclua credenciais.</span></label><label class="field">Argumentos do servidor stdio (JSON)<input name="stdio_args_json" value="${value('stdio_args_json')}" maxlength="6000" placeholder='["-y", "@modelcontextprotocol/server-filesystem", "C:\\Dados"]'><span class="muted">Lista JSON de textos. Se houver autenticação, faça-a no cliente pelo método oficial.</span></label></div><div data-transport="openai_tunnel"><p><strong>Conexão por tunnel</strong></p><p class="muted">Configure o tunnel primeiro na seção <a href="/dashboard/tunnels">Tunnels</a>. Use os dados do endpoint fornecidos pelo responsável do MCP.</p></div><div data-transport="local_dev"><p><strong>Desenvolvimento local</strong></p><p class="muted">Peça ao responsável o comando ou endereço de desenvolvimento e escolha o transporte correspondente (URL remota ou stdio) para gerar instruções de CLI.</p></div><div data-transport="not_sure"><p><strong>Antes de continuar</strong></p><p class="muted">Pergunte ao responsável se o servidor usa URL HTTPS ou stdio local e qual método de autenticação requer. Depois selecione a opção correspondente.</p></div></div><label class="field">Autenticação<select name="authentication">${[['oauth','OAuth'],['none','Sem autenticação'],['api_key','Chave de API (não informe a chave)'],['not_sure','Ainda não sei']].map(([key,label]) => `<option value="${key}"${(draft.authentication || 'oauth') === key ? ' selected' : ''}>${label}</option>`).join('')}</select><span class="muted">Selecione apenas o que o responsável informou. O painel não pede nem guarda chaves.</span></label><label class="field">Nome da vari&aacute;vel de ambiente<input name="auth_env_var" value="${value('auth_env_var')}" maxlength="128" placeholder="Ex.: MINHA_MCP_TOKEN"><span class="muted">Use letras mai&uacute;sculas, n&uacute;meros e sublinhado, come&ccedil;ando por letra ou _. Informe apenas o nome, nunca o valor secreto. Necess&aacute;rio para chave de API.</span></label><label class="field">Nome do cabe&ccedil;alho HTTP (opcional)<input name="auth_header_name" value="${value('auth_header_name')}" maxlength="128" placeholder="Authorization"><span class="muted">Para URL remota com chave, vazio usa Authorization: Bearer. Use outro nome somente se o respons&aacute;vel exigir um cabe&ccedil;alho personalizado.</span></label><p class="muted">O painel guarda apenas o nome da vari&aacute;vel e do cabe&ccedil;alho. Configure o valor secreto no ambiente do seu sistema ou no armazenamento do cliente. Alguns clientes n&atilde;o oferecem refer&ecirc;ncia segura de vari&aacute;vel para cabe&ccedil;alhos HTTP; nesses casos o roteiro explica a limita&ccedil;&atilde;o.</p>${clientGuides}<fieldset><legend>Passo 2: escolha em quais CLIs preparar instruções</legend><div class="checklist">${Object.entries(MCP_CLIENTS).map(([key,label]) => `<label><input type="checkbox" name="target_clients" value="${key}"${selected.has(key) ? ' checked' : ''}> ${label}</label>`).join('')}</div></fieldset><p class="muted">Passo 3: revise o roteiro gerado e siga cada CLI separadamente. Nada será executado nem adicionado às configurações dos clientes.</p><button type="submit">Preparar roteiro</button></form>`;
    return page('Configurar MCPs', `<style>@supports selector(form:has(select)){.mcp-transport-fields>[data-transport]{display:none}.mcp-setup-form:has(select[name="connection_type"] option[value="remote_url"]:checked) .mcp-transport-fields>[data-transport="remote_url"],.mcp-setup-form:has(select[name="connection_type"] option[value="local_stdio"]:checked) .mcp-transport-fields>[data-transport="local_stdio"],.mcp-setup-form:has(select[name="connection_type"] option[value="openai_tunnel"]:checked) .mcp-transport-fields>[data-transport="openai_tunnel"],.mcp-setup-form:has(select[name="connection_type"] option[value="local_dev"]:checked) .mcp-transport-fields>[data-transport="local_dev"],.mcp-setup-form:has(select[name="connection_type"] option[value="not_sure"]:checked) .mcp-transport-fields>[data-transport="not_sure"]{display:block}}@supports selector(form:has(select)){.mcp-codex-auth-env{display:none}.mcp-codex-form:has(select[name="codex_authentication"] option[value="bearer_env"]:checked) .mcp-codex-auth-env{display:grid}}</style><h1>Configurar servidores MCP</h1><aside class="next-step"><strong>Token do MCP local:</strong> no Windows, o arquivo fica em <code>%LOCALAPPDATA%\\CodexBridge\\auth\\mcp-token</code>; nos demais sistemas, em <code>~/.codexbridge/auth/mcp-token</code>. Para rotacioná-lo, pare o adapter e o tunnel, remova somente esse arquivo e reinicie ambos; o adapter criará um novo token. Atualize clientes HTTP diretos antes de reconectar. Perfis Tunnel gerados usam uma referência de ambiente e não precisam ser salvos novamente. O navegador pedirá usuário codexbridge e senha igual ao token MCP. No Windows, consulte o valor com Get-Content -Raw "$env:LOCALAPPDATA\\CodexBridge\\auth\\mcp-token"; nos demais sistemas, leia ~/.codexbridge/auth/mcp-token. O token não aparece nesta página. Processos da mesma conta ainda podem ler o arquivo.</aside><p>Use este guia sem cadastrar um projeto. O primeiro formulário pode adicionar um servidor HTTP ao Codex local depois do seu aceite. O segundo prepara instruções manuais para outras CLIs e conexões.</p>${notice ? `<p class="next-step" role="status">${esc(notice)}</p>` : ''}${codexForm}<h2>Servidores adicionados ao Codex por este painel (${codexServers.length})</h2>${codexServerCards || '<p class="muted">Nenhum servidor adicionado pelo formulário ainda.</p>'}<p class="muted">${esc(codexConfigPath)}</p>${form}<h2>Roteiros salvos neste computador (${profiles.length})</h2>${profileCards || '<p class="muted">Nenhum roteiro salvo ainda.</p>'}<p class="muted">Os marcadores de progresso são manuais. Eles não comprovam que o servidor conectou.</p>`, '/dashboard/mcps');
  }
  function sendMcpSetupPage(res, status = 200, notice = '') {
    const content = mcpSetupPage(notice);
    return send(res, status, content, `codex_dashboard=${sessions.get(mcpSetupSession)}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
  }
  async function handleMcpSetupPost(req, res, action) {
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisição bloqueada', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 12000) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const fields = new URLSearchParams(body);
    const token = sessions.get(mcpSetupSession);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return sendMcpSetupPage(res, 403, 'Confirmação inválida. Atualize a página.');
    sessions.delete(mcpSetupSession);
    try {
      const setups = mcpSetups();
      if (action === 'setup') {
        const stdioArgsText = String(fields.get('stdio_args_json') || '').trim();
        let stdioArgs = [];
        if (stdioArgsText) { try { stdioArgs = JSON.parse(stdioArgsText); } catch { throw new Error('Os argumentos stdio precisam ser uma lista JSON, por exemplo ["-y", "pacote-mcp"].'); } }
        const draft = { server_name: String(fields.get('server_name') || '').trim(), connection_type: fields.get('connection_type'), server_url: String(fields.get('server_url') || '').trim(), stdio_command: String(fields.get('stdio_command') || '').trim(), stdio_args: stdioArgs, authentication: fields.get('authentication'), auth_env_var: String(fields.get('auth_env_var') || '').trim(), auth_header_name: String(fields.get('auth_header_name') || '').trim(), target_clients: fields.getAll('target_clients') };
        if (draft.connection_type === 'remote_url' && !draft.server_url) throw new Error('Informe a URL HTTPS para preparar uma conexão remota.');
        const prepared = prepareMcpSetup({ server_name: draft.server_name, connection_type: draft.connection_type, server_url: draft.server_url || undefined, stdio_command: draft.stdio_command || undefined, stdio_args: draft.stdio_args, auth_method: draft.authentication, auth_env_var: draft.auth_env_var, auth_header_name: draft.auth_header_name || undefined, target_clients: draft.target_clients });
        if (setups.length >= 100) throw new Error('O limite local de 100 roteiros foi atingido. Remova roteiros antigos para continuar.');
        if (setups.some(item => item.server_name === prepared.server_name)) throw new Error('Já existe um roteiro com esse nome. Remova-o ou escolha outro nome.');
        setups.unshift({ id: crypto.randomUUID(), server_name: prepared.server_name, connection_type: prepared.connection_type, server_url: prepared.server_url, stdio_command: prepared.stdio_command, stdio_args: prepared.stdio_args, authentication: prepared.authentication, ...(prepared.auth_env_var ? { auth_env_var: prepared.auth_env_var, auth_header_name: prepared.auth_header_name } : {}), target_clients: prepared.selected_cli_destinations, statuses: Object.fromEntries(prepared.selected_cli_destinations.map(client => [client, 'pending'])), created_at: new Date().toISOString() });
        writeMcpSetups(setups);
        return sendMcpSetupPage(res, 200, `Roteiro de ${prepared.server_name} salvo localmente. Confira cada comando e marque os passos conforme concluir.`);
      }
      if (action === 'codex_create') {
        const name = String(fields.get('codex_server_name') || '').trim();
        const description = String(fields.get('codex_description') || '').trim();
        const connectionType = String(fields.get('codex_connection_type') || '');
        const rawUrl = String(fields.get('codex_server_url') || '').trim();
        const authentication = String(fields.get('codex_authentication') || '');
        const authEnvVar = String(fields.get('codex_auth_env_var') || '').trim();
        if (fields.get('codex_trust_confirm') !== 'yes') throw new Error('Leia o aviso de risco e confirme que confia no servidor antes de criá-lo.');
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(name)) throw new Error('Use no nome somente letras, números, hífen ou sublinhado; o nome deve começar com letra ou número.');
        if (!description || description.length > 300 || /[\u0000-\u001f\u007f]/.test(description)) throw new Error('Informe uma descrição curta, de até 300 caracteres.');
        if (!['https', 'tunnel'].includes(connectionType)) throw new Error('Escolha HTTPS ou Tunnel.');
        if (!['none', 'oauth', 'bearer_env'].includes(authentication)) throw new Error('Escolha um método de autenticação válido.');
        let parsedUrl;
        try { parsedUrl = new URL(rawUrl); } catch { throw new Error('Informe a URL HTTPS do endpoint MCP.'); }
        if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || rawUrl.length > 2048) throw new Error('Use uma URL HTTPS limpa, sem usuário, senha, query ou fragmento.');
        if (authentication === 'bearer_env' && !/^[A-Z_][A-Z0-9_]{0,127}$/.test(authEnvVar)) throw new Error('Informe o nome de uma variável de ambiente válida, sem incluir seu valor secreto.');
        if (authentication !== 'bearer_env' && authEnvVar) throw new Error('O nome da variável só é aceito para autenticação por token.');
        if (!bridge.CODEX_JS || !fs.existsSync(bridge.CODEX_JS)) throw new Error('Codex CLI não foi encontrado. Confira a instalação e reinicie o adapter.');
        const configFile = codexMcpConfigFile();
        if (fs.existsSync(configFile)) {
          const stat = fs.statSync(configFile);
          if (!stat.isFile() || stat.size > 1_000_000) throw new Error('O config.toml do Codex é inválido ou excede 1 MB; nenhum servidor foi adicionado.');
          const source = fs.readFileSync(configFile, 'utf8');
          const section = new RegExp(`^\\s*\\[mcp_servers\\.(?:["']?${name}["']?)(?:\\.[^\\]]+)?\\]\\s*(?:#.*)?$`, 'm');
          if (section.test(source)) throw new Error(`Já existe uma configuração MCP chamada ${name}. Escolha outro nome para preservar a configuração atual.`);
        }
        const records = codexMcpRecords();
        if (records.length >= 100) throw new Error('O limite local de 100 descrições MCP foi atingido. Remova registros antigos do histórico antes de adicionar outro.');
        if (records.some(record => record.name.toLowerCase() === name.toLowerCase())) throw new Error(`Este painel já registrou ${name}. Confira a lista de MCPs do Codex antes de tentar novamente.`);
        const cliArgs = ['mcp', 'add', name, '--url', parsedUrl.toString()];
        if (authentication === 'bearer_env') cliArgs.push('--bearer-token-env-var', authEnvVar);
        const childEnv = createChildEnvironment();
        try {
          await execFileAsync(process.execPath, [bridge.CODEX_JS, ...cliArgs], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16_000, windowsHide: true, shell: false, env: childEnv });
        } catch (error) {
          throw new Error(`Codex não confirmou a criação do servidor. ${bridge.safeText(error.stderr || error.message || '', 500)}`);
        }
        const listed = await codexMcpListState(name);
        const authenticationLabel = { none: 'Sem autenticação', oauth: 'OAuth (login pendente)', bearer_env: `Token pela variável ${authEnvVar}` }[authentication];
        records.unshift({ name, description, connection_type: connectionType, url: parsedUrl.toString(), authentication, authentication_label: authenticationLabel, ...(authentication === 'bearer_env' ? { auth_env_var: authEnvVar } : {}), created_at: new Date().toISOString(), config_file: configFile, configuration_status: listed === true ? 'listed' : listed === false ? 'not_listed' : 'check_failed', configuration_checked_at: new Date().toISOString() });
        try { writeCodexMcpRecords(records.slice(0, 100)); }
        catch { return sendMcpSetupPage(res, 500, `O Codex informou que ${name} foi adicionado. Não consegui salvar a descrição local no painel; confira com codex mcp list.`); }
        const followUp = authentication === 'oauth' ? ` Depois conclua o login com codex mcp login ${name}.` : authentication === 'bearer_env' ? ` Configure a variável ${authEnvVar} no ambiente do Codex.` : '';
        const verifySummary = listed === true
          ? 'A lista local do Codex confirmou o registro; a rede e a autenticacao ainda n&atilde;o foram testadas.'
          : listed === false
            ? 'O comando adicionou o servidor, mas n&atilde;o consegui encontra-lo na lista local do Codex.'
            : 'O comando adicionou o servidor, mas a consulta automatica da lista falhou.';
        return sendMcpSetupPage(res, 200, name + ' adicionado ao Codex. ' + verifySummary + followUp + ' Reinicie o Codex para carregar o servidor.');
      }
      if (action === 'codex_verify') {
      const name = String(fields.get('codex_server_name') || '').trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(name)) throw new Error('Nome de servidor MCP inv\u00e1lido.');
      const records = codexMcpRecords();
      const record = records.find(item => item.name === name);
      if (!record) throw new Error('Este servidor n\u00e3o foi registrado pelo painel.');
      const listed = await codexMcpListState(name);
      record.configuration_status = listed === true ? 'listed' : listed === false ? 'not_listed' : 'check_failed';
      record.configuration_checked_at = new Date().toISOString();
      writeCodexMcpRecords(records);
      const notice = listed === true
        ? `${name} aparece em codex mcp list. Isso confirma o registro local, n\u00e3o a conex\u00e3o de rede nem o login.`
        : listed === false
          ? `${name} n\u00e3o apareceu em codex mcp list. Confira se o perfil Codex selecionado e o mesmo usado pelo adapter.`
          : `N\u00e3o consegui consultar codex mcp list para ${name}. Confira a instala\u00e7\u00e3o local do Codex CLI.`;
      return sendMcpSetupPage(res, listed === null ? 502 : 200, notice);
      }
      if (action === 'verify_cli') {
        const id = String(fields.get('id') || '');
        const client = String(fields.get('client') || '');
        if (!UUID.test(id)) throw new Error('Identificador de roteiro invalido.');
        const profile = setups.find(item => item.id === id);
        if (!profile || !Array.isArray(profile.target_clients) || !profile.target_clients.includes(client)) throw new Error('Destino ou roteiro n&atilde;o encontrado.');
        if (!['codex_cli', 'hermes_cli', 'gemini_cli'].includes(client)) throw new Error('Este destino precisa de verificacao manual.');
        const result = await verifyMcpProfileClient(client, profile.server_name);
        const status = result === true ? 'found' : result === false ? 'missing' : 'unavailable';
        profile.verifications = { ...(profile.verifications || {}), [client]: { status, checked_at: new Date().toISOString() } };
        profile.updated_at = new Date().toISOString();
        writeMcpSetups(setups);
        const clientName = MCP_CLIENTS[client] || client;
        const notice = status === 'found'
          ? `${profile.server_name} aparece na configura&ccedil;&atilde;o local de ${clientName}. Essa consulta n&atilde;o testa rede nem login.`
          : status === 'missing'
            ? `${profile.server_name} n&atilde;o aparece na configura&ccedil;&atilde;o de usuario consultada para ${clientName}.`
            : `Nao consegui consultar ${clientName}; confira se o CLI esta instalado e no PATH.`;
        return sendMcpSetupPage(res, status === 'unavailable' ? 502 : 200, notice);
      }
      if (action === 'test_connection') {
        const id = String(fields.get('id') || '');
        const client = String(fields.get('client') || '');
        if (!UUID.test(id)) throw new Error('Identificador de roteiro inválido.');
        const profile = setups.find(item => item.id === id);
        if (client !== 'hermes_cli' || !profile || !Array.isArray(profile.target_clients) || !profile.target_clients.includes(client)) throw new Error('Destino Hermes ou roteiro não encontrado.');
        if (fields.get('allow_connection_test') !== 'yes') throw new Error('Confirme a autorização antes de testar a conexão.');
        const registration = await cliMcpListState('hermes', profile.server_name);
        const checkedAt = new Date().toISOString();
        const status = registration === true
          ? await testHermesMcpConnection(profile.server_name)
          : registration === false ? 'not_registered' : 'unavailable';
        profile.verifications = { ...(profile.verifications || {}), hermes_cli: { status: registration === true ? 'found' : registration === false ? 'missing' : 'unavailable', checked_at: checkedAt } };
        profile.connection_tests = { ...(profile.connection_tests || {}), hermes_cli: { status, checked_at: new Date().toISOString() } };
        profile.updated_at = new Date().toISOString();
        writeMcpSetups(setups);
        const notice = status === 'connected'
          ? `O Hermes concluiu o teste de conex\u00e3o de ${profile.server_name}. Isso confirma a conex\u00e3o neste momento; n\u00e3o garante disponibilidade futura.`
          : status === 'not_registered'
            ? `O Hermes n\u00e3o encontrou ${profile.server_name} na lista local; nenhum teste de conex\u00e3o foi executado.`
            : status === 'unavailable'
              ? 'N\u00e3o consegui consultar o Hermes CLI; nenhum teste de conex\u00e3o foi executado.'
              : `O teste do Hermes para ${profile.server_name} falhou. O painel n\u00e3o guarda a sa\u00edda; confira hermes mcp test ${profile.server_name} no terminal para ver o motivo.`;
        return sendMcpSetupPage(res, status === 'failed' || status === 'unavailable' ? 502 : 200, notice);
      }
      const id = String(fields.get('id') || '');
      if (!UUID.test(id)) throw new Error('Identificador de roteiro inválido.');
      const index = setups.findIndex(item => item.id === id);
      if (index < 0) throw new Error('Roteiro não encontrado. Atualize a página.');
      if (action === 'remove') {
        setups.splice(index, 1); writeMcpSetups(setups);
        return sendMcpSetupPage(res, 200, 'Roteiro removido do histórico local. Nenhuma configuração de CLI foi alterada.');
      }
      const client = String(fields.get('client') || ''), status = String(fields.get('status') || '');
      if (!setups[index].target_clients.includes(client) || !['pending', 'configured', 'skipped'].includes(status)) throw new Error('Destino ou progresso inválido.');
      setups[index].statuses = { ...(setups[index].statuses || {}), [client]: status };
      setups[index].updated_at = new Date().toISOString();
      writeMcpSetups(setups);
      return sendMcpSetupPage(res, 200, 'Progresso local atualizado. A conexão continua dependendo da conferência manual no cliente.');
    } catch (error) { return sendMcpSetupPage(res, 400, error.message); }
  }
  const workshopStations = [
    ['generic', 'Área geral', '◈'], ['bookshelf', 'Estante de leitura', '▤'], ['desk', 'Mesa de planejamento', '▱'],
    ['workbench', 'Bancada de edição', '⚒'], ['terminal', 'Terminal de ferramentas', '⌘'],
    ['scanner', 'Scanner de código', '⌕'], ['antenna', 'Antena de pesquisa', '⌁'], ['approval', 'Aguardando você', '✋'],
  ];
  const workshopKinds = new Set(['planning', 'reading', 'editing', 'tool', 'research', 'search', 'response', 'error', 'completed']);
  const workshopActions = new Set(['Preparando a tarefa', 'A execução informou uma falha', 'A execução foi concluída', 'Uma atividade informou uma falha', 'Editando arquivos', 'Editando arquivos · concluído', 'Editando arquivos · falhou', 'Usando uma ferramenta local', 'Usando uma ferramenta local · concluído', 'Usando uma ferramenta local · falhou', 'Usando uma ferramenta conectada', 'Usando uma ferramenta conectada · concluído', 'Usando uma ferramenta conectada · falhou', 'Pesquisando na web', 'Pesquisando na web · concluído', 'Pesquisando na web · falhou', 'Preparando a próxima ação', 'Preparando a próxima ação · concluído', 'Organizando as etapas', 'Organizando as etapas · concluído', 'Registrando uma resposta', 'Registrando uma resposta · concluído']);
  const safeWorkshopEvents = item => (Array.isArray(item?.activity_events) ? item.activity_events : []).slice(-80).filter(event =>
    workshopStations.some(([id]) => id === event.station) && workshopKinds.has(event.kind) && workshopActions.has(event.action) && Number.isFinite(Date.parse(event.at))
  ).map(({ at, station, kind, action }) => ({ at, station, kind, action }));
  const workshopStatus = (item, events) => {
    if (item.state === 'pending') return 'Aguardando aprovação ou resposta do usuário';
    if (item.state === 'approved') return 'Aprovada · aguardando execução pelo fluxo existente';
    if (item.state === 'running') return events.at(-1)?.action || 'Em execução · Sem atividade conectada';
    return ({ completed: 'Concluída', failed: 'Erro na execução', timeout: 'Tempo esgotado', cancelled: 'Cancelada', rejected: 'Recusada', expired: 'Aprovação expirada' })[item.state] || 'Estado registrado';
  };
  function workshopSnapshot(item) {
    const live = bridge.tasks.get(item.task_id);
    const events = safeWorkshopEvents({ ...item, activity_events: live?.activity_events || item.activity_events });
    const state = live?.state === 'prepared' ? (item.state === 'approved' ? 'approved' : 'pending') : live?.state || item.state;
    const latest = events.at(-1);
    const station = state === 'pending' ? 'approval' : latest?.station || 'generic';
    return {
      task_id: item.task_id, state, status: workshopStatus({ ...item, state }, events), station,
      station_label: workshopStations.find(([id]) => id === station)?.[1] || 'Área geral',
      completed_stations: [...new Set(events.filter(event => event.action.endsWith(' · concluído')).map(event => event.station))],
      events, can_cancel: state === 'running' && bridge.active?.has(item.task_id) === true,
    };
  }
  function codexWorkshopPage(params = new URLSearchParams()) {
    const tasks = records().filter(item => item.executor === 'codex' && item.state !== 'deleted').slice(0, 40);
    const requestedId = String(params.get('task_id') || '');
    const selected = tasks.find(item => item.task_id === requestedId) || tasks.find(item => item.state === 'running') || tasks[0];
    const snapshot = selected ? workshopSnapshot(selected) : null;
    const activeId = selected?.task_id;
    let cancelCookie;
    const stationTiles = workshopStations.map(([id, name, icon]) => `<article class="workshop-tile${snapshot?.station === id ? ' is-active' : ''}${snapshot?.completed_stations.includes(id) ? ' is-complete' : ''}" data-station="${id}"><span class="workshop-icon" aria-hidden="true">${icon}</span><strong>${name}</strong>${snapshot?.station === id ? '<span class="workshop-agent" aria-label="Único agente Codex representado">🧑‍🔧</span>' : ''}</article>`).join('');
    const eventMarkup = snapshot?.events.length ? snapshot.events.slice(-20).reverse().map(event => `<li><details><summary><time datetime="${esc(event.at)}">${esc(new Date(event.at).toLocaleTimeString('pt-BR'))}</time> · ${esc(event.action)}</summary><p>Tipo de atividade: ${esc(event.kind)}</p></details></li>`).join('') : '<li>Sem atividade conectada para esta tarefa.</li>';
    const selector = tasks.length ? `<form class="workshop-task-picker" method="get" action="/dashboard/codex-workshop"><label for="workshop-task">Tarefa observada</label><select id="workshop-task" name="task_id">${tasks.slice(0, 12).map(item => `<option value="${esc(item.task_id)}"${item.task_id === activeId ? ' selected' : ''}>${esc(item.task_id.slice(0, 8))} · ${esc(label(item.state))}</option>`).join('')}</select><button class="secondary" type="submit">Abrir</button></form>` : '';
    let cancelForm = '';
    if (selected) {
      const key = `workshop-${activeId}`;
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(key, token);
      cancelCookie = `codex_dashboard=${token}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`;
      cancelForm = `<form method="post" action="/dashboard/codex-workshop/cancel/${esc(activeId)}" data-cancel-form${snapshot.can_cancel ? '' : ' hidden'}><input type="hidden" name="csrf" value="${token}"><details><summary>Opções da tarefa</summary><p>Cancelar usa a ferramenta existente codex_cancel_task e encerra o processo Codex ativo.</p><button class="danger" type="submit">Cancelar esta tarefa</button></details></form>`;
    }
    const notice = params.get('notice') === 'cancelled' ? '<p class="next-step" role="status">Pedido de cancelamento enviado pelo mecanismo CodexBridge existente.</p>' : '';
    const selectedMarkup = selected ? `<section class="workshop-layout" data-workshop data-state="${esc(snapshot.state)}" data-activity-url="/dashboard/codex-workshop/activity?task_id=${esc(activeId)}" data-initial-events="${esc(JSON.stringify(snapshot.events))}"><div><div class="workshop-heading"><div><span class="badge">Uma tarefa · um agente</span><h2>Tarefa ${esc(activeId.slice(0, 8))}</h2><p class="muted">${esc(byId(selected.project_id)?.name || 'Projeto sem cadastro')} · ${esc(formatTime(selected.created_at))}</p></div><span class="workshop-state" data-live-status aria-live="polite">${esc(snapshot.status)}</span></div><section class="workshop-scene" aria-labelledby="workshop-scene-title"><h3 id="workshop-scene-title">Oficina em atividade</h3><p class="muted">Agente representado: Codex · estação atual: <strong data-active-station>${esc(snapshot.station_label)}</strong></p><div class="workshop-floor">${stationTiles}</div></section><div class="workshop-controls"><label><input type="checkbox" data-follow> Acompanhar atividade automaticamente (atualiza a cada 4 s enquanto executa)</label><label><input type="checkbox" data-motion> Ativar animações</label></div><div class="actions"><a class="button secondary" href="/dashboard/codex-workshop?task_id=${esc(activeId)}">Atualizar agora</a><a class="button secondary" href="/dashboard/task/${esc(activeId)}">Detalhes da tarefa</a>${selected.state === 'pending' && bridge.tasks.has(activeId) ? `<a class="button" href="/approve/${esc(activeId)}">Revisar aprovação</a>` : ''}${cancelForm}</div><section class="workshop-feed" aria-labelledby="workshop-feed-title"><h3 id="workshop-feed-title">Atividade recente</h3><p class="muted">Rótulos derivados de eventos JSONL reconhecidos. Comandos, argumentos, caminhos, conteúdo de arquivos e raciocínio do modelo são omitidos.</p><ol data-event-feed>${eventMarkup}</ol></section></section>` : '<section class="card"><h2>Nenhuma tarefa Codex registrada</h2><p>Quando uma tarefa passar pelo fluxo do CodexBridge, ela poderá ser selecionada aqui. Sessões iniciadas diretamente no Codex CLI não são observadas.</p></section>';
    const recent = tasks.length > 1 ? `<details class="card"><summary>Escolher outra tarefa (${tasks.length} recentes)</summary><ul>${tasks.slice(0, 12).map(item => `<li><a href="/dashboard/codex-workshop?task_id=${esc(item.task_id)}">${esc(item.task_id.slice(0, 8))} · ${esc(label(item.state))}</a></li>`).join('')}</ul></details>` : '';
    return { body: page('Oficina Codex', `<h1>Oficina Codex</h1>${notice}<p class="next-step"><strong>Oficina opcional, local e de agente único.</strong> A cena mostra apenas o estado da tarefa selecionada e eventos JSONL que o CodexBridge reconhece. Ela não lê sessões externas do Codex CLI e não mostra prompts, comandos, argumentos, caminhos, arquivos, segredos ou cadeia de pensamento.</p>${selector}${selectedMarkup}${recent}<script src="/dashboard/assets/workshop.js" defer></script>`, '/dashboard/codex-workshop'), cookie: cancelCookie };
  }
  function workshopActivityApi(res, id) {
    if (!UUID.test(id)) return res.writeHead(400, { 'Cache-Control': 'no-store' }).end();
    const item = records().find(row => row.task_id === id && row.executor === 'codex');
    if (!item) return res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    const body = JSON.stringify(workshopSnapshot(item));
    return res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" }).end(body);
  }
  async function cancelWorkshop(req, res, id) {
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Pedido bloqueado', '<p>Endereço local inválido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8_000) return send(res, 413, page('Pedido inválido', '<p>Requisição longa.</p>')); }
    const fields = new URLSearchParams(body);
    const key = `workshop-${id}`;
    const token = sessions.get(key);
    const cookie = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!UUID.test(id) || !token || fields.get('csrf') !== token || cookie !== token) { const rendered = codexWorkshopPage(new URLSearchParams({ task_id: id })); return send(res, 403, rendered.body, rendered.cookie); }
    sessions.delete(key);
    const task = bridge.tasks.get(id);
    if (!task || task.executor !== 'codex' || task.state !== 'running' || !bridge.active?.has(id) || typeof bridge.callTool !== 'function') { const rendered = codexWorkshopPage(new URLSearchParams({ task_id: id })); return send(res, 409, rendered.body, rendered.cookie); }
    try {
      await bridge.callTool('codex_cancel_task', { task_id: id });
      res.writeHead(303, { Location: `/dashboard/codex-workshop?task_id=${encodeURIComponent(id)}&notice=cancelled`, 'Cache-Control': 'no-store' }).end();
    } catch { const rendered = codexWorkshopPage(new URLSearchParams({ task_id: id })); return send(res, 409, rendered.body, rendered.cookie); }
  }
  function projectCatalogPage(params = new URLSearchParams()) {
    const query = String(params.get('q') || '').trim().slice(0, 120);
    const normalized = query.toLocaleLowerCase('pt-BR');
    const matches = projectCatalog.filter(item => !normalized || [item.name, item.summary, item.category, item.use, item.compatibility, item.permissions, item.risks, ...item.tags].join(' ').toLocaleLowerCase('pt-BR').includes(normalized));
    const cards = matches.map(item => `<article class="card"><h2>${esc(item.name)}</h2><p><span class="badge">${esc(item.category)}</span> <span class="badge">Opcional</span> <span class="badge">Confiança: ${esc(item.confidence)}</span></p><p>${esc(item.summary)}</p><p><strong>Possível utilidade:</strong> ${esc(item.use)}</p><p><strong>Compatibilidade:</strong> ${esc(item.compatibility)}</p><details><summary>Permissões, riscos e cuidados</summary><p><strong>Permissões/recursos:</strong> ${esc(item.permissions)}</p><p><strong>Riscos e limitações:</strong> ${esc(item.risks)}</p><p><strong>Cuidados:</strong> ${esc(item.care)}</p><p><strong>Licença:</strong> ${esc(item.license)} · <strong>Último push consultado:</strong> ${esc(item.lastPush)}</p></details><p><small class="muted">Verificado em ${esc(PROJECT_CATALOG_CHECKED_AT)} · Confiança: ${esc(item.confidence)}</small></p><p><a class="button" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Abrir repositório oficial</a></p></article>`).join('');
    return page('Projetos opcionais', `<h1>Projetos</h1><p class="next-step"><strong>Catálogo informativo:</strong> todos os projetos são opcionais e separados do CodexBridge, salvo quando identificados como integração MCP/skill. Nenhum projeto é baixado, instalado, iniciado ou conectado por esta página. Confira os detalhes no repositório oficial.</p><p>Compatibilidade, permissões e riscos que não puderam ser confirmados aparecem como “não verificado”. Riscos operacionais podem ser inferências da finalidade descrita; nenhum repositório foi auditado ou executado. As informações foram consultadas em ${esc(PROJECT_CATALOG_CHECKED_AT)}.</p><form class="filters" method="get" action="/dashboard/catalog"><div class="filter-grid"><label for="catalog-query">Buscar projetos<input id="catalog-query" name="q" value="${esc(query)}" maxlength="120" placeholder="Ex.: vídeo, SSH, banco, privacidade"></label><button type="submit">Buscar</button><a class="button secondary" href="/dashboard/catalog">Limpar</a></div></form><p>${matches.length} de ${projectCatalog.length} projetos</p>${cards || '<section class="card"><h2>Nenhum resultado</h2><p>Tente outros termos. Nenhum projeto foi recomendado para esta busca.</p></section>'}`, '/dashboard/catalog');
  }
  function comingSoonPage() {
    return page('Em breve', `<h1>Em breve</h1><p>Esta página descreve ideias planejadas. Os recursos abaixo ainda não estão disponíveis no CodexBridge.</p><article class="card"><p><span class="badge">Planejado · Não disponível</span></p><h2>Múltiplos agentes</h2><p>A ideia futura é coordenar revisores especializados em segurança, experiência do usuário, engenharia de software, design visual e revisão final.</p><p>Esta atualização não inicia agentes, não executa tarefas em paralelo e não muda aprovações nem o fluxo atual de execução.</p></article>`, '/dashboard/coming-soon');
  }
  function overview(params = new URLSearchParams()) {
    const rows = records();
    const states = ['pending', 'approved', 'rejected', 'completed', 'failed', 'expired', 'running', 'timeout', 'cancelled'];
    const requestedState = params.get('state') || 'all';
    const state = states.includes(requestedState) ? requestedState : 'all';
    const requestedProject = params.get('project') || 'all';
    const project = requestedProject === 'unconfigured' || projects().some(p => p.id === requestedProject) ? requestedProject : 'all';
    const query = String(params.get('q') || '').trim().slice(0, 100);
    const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
    const filtered = rows.filter(item => {
      if (state !== 'all' && item.state !== state) return false;
      if (project !== 'all' && item.project_id !== project) return false;
      if (query && ![item.summary, item.prompt, item.task_id, item.executor, byId(item.project_id)?.name].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))) return false;
      return true;
    });
    if (sort === 'oldest') filtered.reverse();
    const cards = projects().map(p => {
      const mine = rows.filter(t => t.project_id === p.id);
      return `<article class="card"><h2><a href="/dashboard/project/${esc(p.id)}">${esc(p.name)}</a></h2><p>${mine.filter(x => x.state === 'pending').length} pendentes · ${mine.filter(x => x.state === 'approved' || x.approved_at).length} aprovadas · ${mine.filter(x => x.state === 'rejected').length} recusadas</p><p class="muted">${p.root ? 'README e tarefas do projeto' : 'Pasta ainda não configurada'}</p></article>`;
    }).join('');
    const projectDonuts = projects().map(p => {
      const mine = rows.filter(t => t.project_id === p.id);
      const approved = mine.filter(t => ['approved', 'completed', 'running'].includes(t.state) || t.approved_at).length;
      const rejected = mine.filter(t => t.state === 'rejected').length;
      const expired = mine.filter(t => t.state === 'expired').length;
      const total = approved + rejected + expired;
      const a = total ? Math.round(approved * 100 / total) : 0;
      const r = total ? Math.round(rejected * 100 / total) : 0;
      const gradient = total ? `conic-gradient(#64d693 0 ${a}%, #f17777 ${a}% ${a + r}%, #f1f3f5 ${a + r}% 100%)` : '#303946';
      return `<article class="card project-card"><div class="donut" role="img" aria-label="${a}% aprovadas; ${rejected} recusadas; ${expired} expiradas" style="background:${gradient}"><span>${a}%<br><small>aprovadas</small></span></div><div><h2><a href="/dashboard/requests?project=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h2><div class="legend"><span style="--dot:#64d693">${approved} aprovadas</span><span style="--dot:#f17777">${rejected} recusadas</span><span style="--dot:#f1f3f5">${expired} expiradas</span></div><p><a href="/dashboard/project/${esc(p.id)}">Abrir projeto</a></p></div></article>`;
    }).join('');
    const counts = Object.fromEntries(['pending', 'approved', 'rejected', 'completed'].map(key => [key, rows.filter(item => item.state === key).length]));
    const projectOptions = projects().map(p => `<option value="${esc(p.id)}"${project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    const statusOptions = [['all', 'Todos os estados'], ['pending', 'Pendentes'], ['approved', 'Aprovadas'], ['rejected', 'Recusadas'], ['completed', 'Concluídas'], ['failed', 'Falhas'], ['expired', 'Expiradas'], ['running', 'Em execução'], ['timeout', 'Tempo esgotado'], ['cancelled', 'Canceladas']].map(([value, name]) => `<option value="${value}"${state === value ? ' selected' : ''}>${name}</option>`).join('');
    const filters = `<form class="filters" method="get" action="/dashboard"><div class="filter-grid"><label>Buscar tarefa<input name="q" value="${esc(query)}" maxlength="100" placeholder="Nome, texto ou ID"></label><label>Projeto<select name="project"><option value="all">Todos os projetos</option>${projectOptions}<option value="unconfigured"${project === 'unconfigured' ? ' selected' : ''}>Sem cadastro</option></select></label><label>Estado<select name="state">${statusOptions}</select></label><label>Ordem<select name="sort"><option value="newest"${sort === 'newest' ? ' selected' : ''}>Mais recentes</option><option value="oldest"${sort === 'oldest' ? ' selected' : ''}>Mais antigas</option></select></label><div class="actions"><button type="submit">Aplicar filtros</button><button type="submit" name="refresh" value="1">Atualizar</button><a class="button" href="/dashboard">Limpar</a></div></div></form>`;
    const hasProjects = projects().length > 0;
    const primary = hasProjects ? '<a class="button" href="/dashboard/requests">Revisar requests</a>' : '<a class="button" href="/dashboard/projects/new">Cadastrar primeiro projeto</a>';
    const start = hasProjects
      ? `<section class="home-hero card"><p class="eyebrow">Uso diário</p><h1>Painel de tarefas</h1><p class="muted">Consulte o histórico e revise as requests preparadas para os projetos cadastrados.</p><div class="actions">${primary}<a class="button secondary" href="/dashboard/projects/new">Adicionar projeto</a><a class="button secondary" href="/dashboard/mcps">Configurar MCPs</a></div></section>`
      : `<section class="home-hero card"><p class="eyebrow">Primeira visita</p><h1>Comece pelo que você precisa</h1><p class="muted">Cadastre uma pasta para organizar tarefas e histórico por projeto. Guias e diagnósticos estão disponíveis sem projeto cadastrado.</p><div class="actions">${primary}<a class="button secondary" href="/dashboard/mcps">Configurar MCPs sem projeto</a><a class="button secondary" href="/dashboard/impact">Abrir diagnóstico de impacto</a></div></section>`;
    const shortcuts = `<nav class="home-shortcuts" aria-label="Próximas etapas"><h2>Próximas etapas</h2><a href="/dashboard/requests">Requests <span>Revise decisões e tarefas</span></a><a href="/dashboard/mcps">MCPs <span>Prepare conexões por CLI</span></a><a href="/dashboard/routing">Roteamento <span>Consulte as opções disponíveis</span></a><a href="/dashboard/tunnels">Tunnels <span>Guias e configuração manual</span></a><a href="/dashboard/impact">Impacto <span>Importe ou registre dados</span></a></nav>`;
    const workNote = '<aside class="next-step"><strong>Tarefas em arquivos:</strong> cada tarefa recebe sua pasta explicitamente. O cadastro organiza o dashboard e não escolhe essa pasta por você.</aside>';
    const quickStart = `<details class="card"><summary>Como usar este painel</summary><ol><li>Use Requests para encontrar e revisar tarefas.</li><li>Abra os detalhes para conferir o executor, a pasta e o pedido completo.</li><li>Aprove somente quando os detalhes corresponderem ao que pediu.</li></ol><p><strong>Se uma tarefa falhar:</strong> confira o progresso e os logs antes de tentar novamente.</p><p>Guias e diagnósticos funcionam sem projeto cadastrado. Este painel mostra apenas dados locais já registrados.</p></details>`;
    const homeStyles = '<style>.dashboard-home{display:grid;gap:20px}.dashboard-home .home-hero{margin:0;padding:clamp(20px,4vw,34px);border-color:#526071}.home-hero h1{margin:.25em 0}.eyebrow{margin:0;color:#bdedc7;font-size:.8rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.home-shortcuts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px;align-items:stretch}.home-shortcuts h2{grid-column:1/-1;margin:0}.home-shortcuts>a{display:grid;gap:4px;padding:14px;background:#1d232c;border:1px solid #3a4553;border-radius:10px;text-decoration:none;font-weight:650}.home-shortcuts>a:hover{background:#252d38}.home-shortcuts span{font-size:.88rem;font-weight:400;color:#afbac8}.dashboard-home section>h2{margin-top:0}.dashboard-home .stats{margin:10px 0}.dashboard-home .next-step{margin:14px 0}.dashboard-home:focus-visible{outline:3px solid #79b9ff}@media(max-width:540px){.home-shortcuts{grid-template-columns:1fr 1fr}.dashboard-home .actions>*{flex:1 1 100%;text-align:center}}</style>';
    return page('Painel de aprovações', `${homeStyles}<main class="dashboard-home">${start}${shortcuts}<section aria-labelledby="task-summary"><h2 id="task-summary">Resumo das tarefas</h2><div class="stats" role="group" aria-label="Contagem por estado"><span>${counts.pending} pendentes</span><span>${counts.approved} aprovadas</span><span>${counts.rejected} recusadas</span><span>${counts.completed} concluídas</span></div>${workNote}<div class="project-grid">${projectDonuts}</div><div class="grid">${cards}</div>${rows.some(x => x.project_id === 'unconfigured') ? '<p>Há tarefas de uma pasta ainda sem projeto cadastrado.</p>' : ''}<h3>Tarefas recentes (${filtered.length})</h3>${filters}${filtered.slice(0, 50).map(card).join('') || '<p class="muted">Nenhuma tarefa corresponde aos filtros.</p>'}</section>${quickStart}</main>`, '/dashboard');
  }
  function setupPage() {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set('project-setup', token);
    const authorized = bridge.AUTHORIZED_PROJECT;
    const content = `<h1>Adicionar projeto ao painel</h1><p>O cadastro dá um nome à pasta e permite organizar o histórico. Guias, ajuda, recursos e diagnóstico da conexão continuam disponíveis sem projeto cadastrado.</p><ol><li>Escolha um nome fácil de reconhecer.</li><li>Informe o caminho completo da pasta e confira se é a pasta certa.</li><li>Registre e confira a identidade confirmada na tela seguinte.</li></ol><aside class="next-step"><strong>Cadastro e acesso são coisas diferentes.</strong> Este formulário só registra a pasta no dashboard; não seleciona nem autoriza uma pasta para execução. A pasta padrão do adapter é opcional. Cada tarefa em arquivos informa uma pasta existente em project_directory. Pasta padrão atual: <code>${esc(authorized || 'nenhum')}</code>. O cadastro no painel não concede acesso adicional nem altera as permissões locais do Codex.</aside><form method="post" action="/dashboard/projects"><p><label>Nome do projeto (opcional; usamos o nome da pasta se vazio)<br><input name="name" maxlength="80" style="width:min(95%,650px);padding:10px" placeholder="Ex.: Meu projeto" autocomplete="off"></label><br><small class="muted">Este nome organiza o histórico; não altera as permissões do adapter.</small></p><p><label>Caminho completo da pasta a registrar<br><input name="root" maxlength="800" required style="width:min(95%,650px);padding:10px" value="${esc(authorized || '')}" placeholder="Ex.: C:\\Projetos\\meu-projeto" autocomplete="off"></label><br><small class="muted">Use uma pasta existente. A identidade da pasta será verificada ao registrar.</small></p><input type="hidden" name="csrf" value="${token}"><button type="submit">Registrar esta pasta no painel</button></form>`;
    return { body: page('Configurar projeto', content), cookie: `codex_dashboard=${token}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300` };
  }
  async function register(req, res) {
    if (projectConfig) return send(res, 403, page('Indisponível', '<p>Registro desativado neste teste.</p>'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisição bloqueada', '<p>Endereço local inválido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 3000) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const fields = new URLSearchParams(body);
    const token = sessions.get('project-setup');
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || fields.get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisição bloqueada', '<p>Confirmação inválida.</p>'));
    sessions.delete('project-setup');
    const supplied = String(fields.get('root') || '').trim();
    const requestedName = String(fields.get('name') || '').trim();
    const name = requestedName || path.basename(supplied.replace(/[\\/]+$/, ''));
    if (!name || name.length > 80 || !path.isAbsolute(supplied) || supplied.length > 800) return send(res, 400, page('Dados inválidos', '<p>Informe o caminho absoluto de uma pasta existente e, se quiser, um nome curto.</p>'));
    let identity;
    try { identity = fingerprint(supplied); }
    catch { return send(res, 400, page('Pasta indisponível', '<p>A pasta informada não existe ou não é uma pasta acessível.</p>')); }
    const existing = projects().find(p => p.realpath.toLowerCase() === identity.realpath.toLowerCase());
    if (existing) {
      const same = String(existing.ino) === String(identity.ino) && String(existing.dev) === String(identity.dev);
      if (same) return send(res, 200, page('Projeto já configurado', `<h1>Projeto já registrado</h1><p>${esc(existing.name)} aponta para esta pasta e sua identidade continua igual.</p><p class="next-step">O cadastro não concede acesso de execução. Pasta padrão nesta execução: <code>${esc(bridge.AUTHORIZED_PROJECT || 'nenhum')}</code>.</p><p><a class="button" href="/dashboard/project/${esc(existing.id)}">Abrir projeto</a> <a href="/dashboard">Voltar ao painel</a> <a href="/dashboard/mcps">Ver conex?o MCP</a></p>`));
      const confirmed = { ...existing, ...identity, root: supplied, configured_at: new Date().toISOString() };
      fs.mkdirSync(store, { recursive: true });
      fs.writeFileSync(projectsFile, JSON.stringify({ projects: projects().map(p => p.id === existing.id ? confirmed : p) }, null, 2), { mode: 0o600 });
      fs.appendFileSync(path.join(store, 'project-events.jsonl'), JSON.stringify({ action: 'identity_reconfirmed', project_id: existing.id, previous: { realpath: existing.realpath, dev: existing.dev, ino: existing.ino }, identity, at: confirmed.configured_at }) + '\n', { mode: 0o600 });
      return send(res, 200, page('Identidade atualizada', `<h1>${esc(existing.name)} reconfirmado</h1><p>A identidade da pasta foi confirmada novamente. O histórico conserva a identidade anterior e esta confirmação.</p><p class="next-step">Reconfirmar o cadastro não autoriza a execução. Pasta padrão nesta execução: <code>${esc(bridge.AUTHORIZED_PROJECT || 'nenhum')}</code>.</p><p><a class="button" href="/dashboard/project/${esc(existing.id)}">Abrir projeto</a> <a href="/dashboard">Voltar ao painel</a></p>`));
    }
    const project = { id: crypto.randomUUID(), name, root: supplied, ...identity, configured_at: new Date().toISOString() };
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(projectsFile, JSON.stringify({ projects: [...projects(), project] }, null, 2), { mode: 0o600 });
    fs.appendFileSync(path.join(store, 'project-events.jsonl'), JSON.stringify({ action: 'configured', project_id: project.id, name, root: supplied, identity, at: project.configured_at }) + '\n', { mode: 0o600 });
    return send(res, 200, page('Projeto registrado', `<h1>${esc(name)} adicionado ao painel</h1><p>Pasta confirmada: <code>${esc(identity.realpath)}</code></p><aside class="next-step"><strong>Próximo passo:</strong> volte \u00e0 conversa do Codex conectada ao CodexBridge e prepare a tarefa informando esta pasta em <code>project_directory</code>. O cadastro s\u00f3 organiza o painel; n\u00e3o inicia nem autoriza execu\u00e7\u00e3o. Use o painel para consultar requests, hist\u00f3rico e informa\u00e7\u00f5es desta pasta. Nesta execução, o adapter continua limitado à pasta escolhida explicitamente na inicialização: <code>${esc(bridge.AUTHORIZED_PROJECT || 'nenhum')}</code>. Para autorizar outra pasta, encerre e reinicie o adapter com a escolha explícita dessa pasta.</aside><p><a class="button" href="/dashboard/project/${esc(project.id)}">Abrir projeto</a> <a href="/dashboard">Voltar ao painel</a> <a href="/dashboard/mcps">Ver conex\u00e3o MCP</a></p>`));
  }
  function projectPage(id) {
    const project = byId(id);
    if (!project) return null;
    const mine = records().filter(t => t.project_id === id);
    const verifiedNotes = verifyProject(project.realpath);
    const notes = verifiedNotes.ok ? projectNotes(project.realpath).map(n => `<li><small>${esc(formatTime(n.created_at))}</small> ${esc(n.text)}</li>`).join('') : '';
    const notesSection = `<h2>Notas do projeto</h2><ul>${notes || '<li>Nenhuma nota registrada.</li>'}</ul>`;
    const content = notesSection + `<p><a class="button" href="/dashboard/requests?project=${encodeURIComponent(id)}">Ver todas as requests do projeto</a></p>` + renderSections(mine, card);
    const verified = verifyProject(project.realpath);
    let events = [];
    try { events = fs.readFileSync(path.join(store, 'project-events.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).filter(e => e.project_id === id).slice(-30).reverse(); } catch {}
    const history = events.map(e => `<li>${esc(formatTime(e.at))}: ${e.action === 'configured' ? 'Projeto registrado' : 'Identidade da pasta reconfirmada'} · ${esc(e.identity?.realpath || '')}</li>`).join('');
    const savedPolicy = project.approval_policy || { level: 'manual', revision: 0 };
    const legacyAutomaticPolicy = savedPolicy.level === 'project_auto';
    const policy = legacyAutomaticPolicy ? { ...savedPolicy, level: 'manual' } : savedPolicy;
    const policyToken = crypto.randomBytes(32).toString('hex'); sessions.set(`policy-${id}`, policyToken);
    const names = { manual: 'Manual', assisted: 'Assistida' };
    const policyBox = `<section class="card"><h2>Política de aprovação</h2><p>Atual: <strong>${esc(names[policy.level] || names.manual)}</strong> · revisão ${Number(policy.revision || 0)}.</p>${legacyAutomaticPolicy ? '<p class="next-step"><strong>Política antiga desativada:</strong> esta versão voltou para Manual e exige aprovação local por tarefa.</p>' : ''}<p>Manual exige aprovação local para cada gravação. Assistida mostra orientação sobre política e risco, mas também exige aprovação local por tarefa. A política não autoriza execução automaticamente.</p><form method="post" action="/dashboard/project/${esc(id)}/policy"><input type="hidden" name="csrf" value="${policyToken}"><label>Nível <select name="level">${['manual','assisted'].map(x => `<option value="${x}"${policy.level === x ? ' selected' : ''}>${esc(names[x])}</option>`).join('')}</select></label> <button type="submit">Salvar política</button></form><form method="post" action="/dashboard/project/${esc(id)}/policy/manual"><input type="hidden" name="csrf" value="${policyToken}"><button type="submit">Voltar imediatamente para Manual</button></form></section>`;
    return page(project.name, `<h1>${esc(project.name)}</h1><p>Pasta: <code>${esc(project.realpath)}</code> · Identidade: <strong>${verified.ok ? 'confirmada' : esc(verified.reason)}</strong></p><p>Configurado em ${esc(formatTime(project.configured_at))}. <a href="/dashboard/project/${esc(id)}/readme">Abrir README</a></p>${policyBox}<h2>Histórico da identidade</h2><ul>${history || '<li>Nenhuma verificação anterior.</li>'}</ul>${content}`);
  }
  async function updatePolicy(req, res, id, forcedLevel) {
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Bloqueado', '<p>Endereço local inválido.</p>'));
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2048) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const token = sessions.get(`policy-${id}`), cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || new URLSearchParams(body).get('csrf') !== token || cookie !== token) return send(res, 403, page('Bloqueado', '<p>Confirmação local inválida.</p>'));
    const level = forcedLevel || new URLSearchParams(body).get('level');
    try { setApprovalPolicy(id, level); return send(res, 200, page('Política atualizada', `<p>Política salva. Revisão incrementada; tarefas pendentes anteriores perdem qualquer elegibilidade automática.</p><p><a href="/dashboard/project/${esc(id)}">Voltar ao projeto</a></p>`)); }
    catch (error) { return send(res, 400, page('Política não alterada', `<p>${esc(error.message)}</p>`)); }
  }
  function readmePage(id) {
    const project = byId(id);
    if (!project) return null;
    const rootPath = actualRoot(project);
    if (!rootPath) return page(`${project.name} · README`, `<h1>${esc(project.name)}</h1><p>Projeto ainda sem pasta configurada.</p>`);
    const verified = verifyProject(project.realpath);
    if (!verified.ok) return page(`${project.name} · README`, `<h1>${esc(project.name)}</h1><p>${esc(verified.reason)} O README ficará indisponível até reconfirmar a pasta.</p>`);
    try {
      const file = path.join(rootPath, 'README.md');
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 250_000) throw new Error('README grande ou inválido');
      return page(`${project.name} · README`, `<h1>README · ${esc(project.name)}</h1><pre>${esc(fs.readFileSync(file, 'utf8'))}</pre>`);
    } catch { return page(`${project.name} · README`, `<h1>${esc(project.name)}</h1><p>README.md não encontrado ou indisponível.</p>`); }
  }
  function detail(id) {
    const item = records().find(t => t.task_id === id);
    if (!item) return null;
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(id, token);
    const actionable = item.state === 'pending' && bridge.tasks.has(id);
    const terminal = ['completed', 'failed', 'expired', 'timeout', 'rejected', 'cancelled'].includes(item.state);
    const archiveAction = item.state === 'deleted' ? `<form method="post" action="/dashboard/restore/${esc(id)}"><input type="hidden" name="csrf" value="${token}"><button type="submit">Restaurar request</button></form>` : terminal ? `<form method="post" action="/dashboard/delete/${esc(id)}"><input type="hidden" name="csrf" value="${token}"><button class="archive" type="submit">Mover para Excluídas</button></form>` : '';
    const actions = `${actionable ? `<div class="actions"><a href="/approve/${esc(id)}">Revisar e aprovar</a><form method="post" action="/dashboard/reject/${esc(id)}"><input type="hidden" name="csrf" value="${token}"><button class="reject" type="submit">Recusar esta tarefa</button></form></div>` : ''}${archiveAction}`;
    const projectName = byId(item.project_id)?.name || 'Projeto sem cadastro';
    const profileText = value => value == null || value === '' ? 'indisponível' : String(value);
    const latency = item.latency_ms && typeof item.latency_ms === 'object'
      ? Object.entries(item.latency_ms).map(([name, value]) => `${name}: ${value == null ? 'indisponível' : `${value} ms`}`).join(' · ') || 'indisponível'
      : 'indisponível';
    const execution = `<section class="card"><h2>Perfil de execução</h2><p>Modelo: ${esc(profileText(item.model))} · Esforço: ${esc(profileText(item.effort))}</p><p>Duração total: ${item.duration_ms == null ? 'indisponível' : `${esc(item.duration_ms)} ms`}</p><p>Etapas de latência: ${esc(latency)}</p><p class="muted">Origem: ${esc(profileText(item.profile_origin))}</p></section>`;
    return { body: page(`Tarefa ${id}`, `<p>${item.project_id === 'unconfigured' ? '<a href="/dashboard/projects/new">Configurar projeto</a>' : `<a href="/dashboard/project/${esc(item.project_id)}">${esc(projectName)}</a>`}</p><h1>Detalhes da tarefa</h1><p><span class="badge">${esc(label(item.state))}</span> <small>${esc(id)}</small></p><p>Projeto registrado: ${esc(projectName)} · Pasta da tarefa: ${esc(item.project_directory || bridge.AUTHORIZED_PROJECT)}</p><p>Executor: ${esc(item.executor || 'não informado')}</p><p>Preparada: ${esc(formatTime(item.created_at))} · Aprovada: ${esc(formatTime(item.approved_at))} · Atualizada: ${esc(formatTime(item.updated_at))}</p><p class="next-step"><strong>Próximo passo:</strong> ${esc(nextStep(item))}</p>${execution}<h2>Instrução</h2><pre>${esc(item.prompt || item.summary || 'Detalhes anteriores indisponíveis.')}</pre>${actions}${item.result ? `<h2>Resultado</h2><pre>${esc(item.result)}</pre>` : ''}${item.error ? `<h2>Erro</h2><pre>${esc(item.error)}</pre>` : ''}${item.validation ? `<h2>Validação</h2><pre>${esc(JSON.stringify(item.validation, null, 2))}</pre>` : ''}`), cookie: `codex_dashboard=${token}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300` };
  }
  async function reject(req, res, id) {
    if (!UUID.test(id) || !bridge.tasks.has(id)) return send(res, 410, page('Não disponível', '<p>Tarefa não está pendente nesta sessão.</p>'));
    const item = bridge.tasks.get(id);
    const approval = bridge.approvals.get(id);
    if (item.state !== 'prepared' || !approval || Date.now() > approval.expiresAt) return send(res, 410, page('Expirada', '<p>Tarefa não está pendente.</p>'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisição bloqueada', '<p>Endereço local inválido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2048) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const token = sessions.get(id);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || new URLSearchParams(body).get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisição bloqueada', '<p>Confirmação inválida.</p>'));
    sessions.delete(id);
    item.state = 'rejected';
    bridge.approvals.delete(id);
    try { fs.unlinkSync(path.join(path.dirname(bridge.LOCK_PATH), 'approvals', `${id}.pending.json`)); } catch {}
    save(id, { state: 'rejected', rejected_at: new Date().toISOString() });
    return send(res, 200, page('Tarefa recusada', `<h1>Tarefa recusada</h1><p>Nenhuma execução foi iniciada.</p><p><a href="/dashboard/task/${esc(id)}">Ver detalhes</a></p>`));
  }
  async function archive(req, res, id, restore = false) {
    if (!UUID.test(id)) return send(res, 404, page('Not found', '<p>Request desconhecida.</p>'));
    if (req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Blocked', '<p>Endereço local inválido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2048) return send(res, 413, page('Erro', '<p>Requisição longa.</p>')); }
    const token = sessions.get(id);
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || new URLSearchParams(body).get('csrf') !== token || cookie !== token) return send(res, 403, page('Blocked', '<p>Confirmação inválida.</p>'));
    sessions.delete(id);
    const item = get(id);
    if (!item) return send(res, 404, page('Not found', '<p>Request desconhecida.</p>'));
    if (restore) {
      if (item.state !== 'deleted') return send(res, 409, page('Estado alterado', '<p>Esta request não está em Excluídas.</p>'));
      save(id, { state: item.deleted_from || 'completed', restored_at: new Date().toISOString() });
      return send(res, 200, page('Request restaurada', `<h1>Request restaurada</h1><p><a href="/dashboard/task/${esc(id)}">Ver detalhes</a></p>`));
    }
    if (!['completed', 'failed', 'expired', 'timeout', 'rejected', 'cancelled'].includes(item.state)) return send(res, 409, page('Não pode excluir', '<p>Somente requests encerradas podem ser movidas para Excluídas.</p>'));
    save(id, { state: 'deleted', deleted_from: item.state, deleted_at: new Date().toISOString() });
    return send(res, 200, page('Request movida', `<h1>Request movida para Excluídas</h1><p>Ela continua no histórico e pode ser restaurada.</p><p><a href="/dashboard/task/${esc(id)}">Ver detalhes</a></p>`));
  }
  function retentionPage() {
    const token = crypto.randomBytes(32).toString('hex'); sessions.set('retention', token);
    const entries = retention.listArchived();
    const cards = entries.map(bundle => {
      const read = key => { try { return JSON.parse(Buffer.from(bundle.files[key], 'base64').toString('utf8')); } catch { return null; } };
      const task = read('history') || {}, report = read('report') || {};
      const text = report.result || report.error || task.result || task.error || 'Sem resultado armazenado.';
      return '<article class="card"><h2>' + esc(bundle.summary || task.summary || task.prompt || bundle.task_id) + '</h2><p><span class="badge">' + esc(label(bundle.state)) + '</span> - Arquivada em ' + esc(formatTime(bundle.archived_at)) + ' - Expira em ' + esc(formatTime(bundle.purge_after)) + '</p><details><summary>Revisar resultado arquivado</summary><pre>' + esc(String(text).slice(0, 4000)) + '</pre></details><form method="post" action="/dashboard/retention/restore/' + esc(bundle.task_id) + '"><input type="hidden" name="csrf" value="' + token + '"><button type="submit">Restaurar para o hist\u00f3rico</button></form></article>';
    }).join('');
    const notice = retentionError ? '<p role="alert" class="next-step">' + esc(retentionError) + '</p>' : '';
    const policy = 'Mantemos at\u00e9 ' + TASK_RETENTION.maxActiveTasks + ' tarefas conclu\u00eddas e relat\u00f3rios recentes, por no m\u00e1ximo ' + TASK_RETENTION.activeDays + ' dias. Registros que saem do hist\u00f3rico ativo ficam aqui por ' + TASK_RETENTION.archiveDays + ' dias e podem ser revisados ou restaurados; depois s\u00e3o removidos automaticamente na inicializa\u00e7\u00e3o ou ap\u00f3s uma grava\u00e7\u00e3o. Aprova\u00e7\u00f5es ainda v\u00e1lidas n\u00e3o s\u00e3o arquivadas.';
    return { body: page('Reten\u00e7\u00e3o e recupera\u00e7\u00e3o', '<h1>Reten\u00e7\u00e3o e recupera\u00e7\u00e3o</h1><p>' + policy + '</p><p class="muted">O arquivamento grava e confere uma c\u00f3pia local antes de retirar os arquivos do hist\u00f3rico ativo. Restaurar n\u00e3o sobrescreve arquivos existentes.</p>' + notice + '<p>Arquivos no per\u00edodo de recupera\u00e7\u00e3o: ' + entries.length + '</p>' + (cards || '<p class="card">Nenhum registro arquivado no momento.</p>'), '/dashboard/retention'), cookie: 'codex_dashboard=' + token + '; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300' };
  }
  async function restoreRetention(req, res, id) {
    if (!UUID.test(id) || req.headers.host !== new URL(baseUrl).host || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 403, page('Requisi\u00e7\u00e3o bloqueada', '<p>Endere\u00e7o local inv\u00e1lido.</p>'));
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2048) return send(res, 413, page('Erro', '<p>Requisi\u00e7\u00e3o longa.</p>')); }
    const token = sessions.get('retention');
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_dashboard='))?.slice('codex_dashboard='.length);
    if (!token || new URLSearchParams(body).get('csrf') !== token || cookie !== token) return send(res, 403, page('Requisi\u00e7\u00e3o bloqueada', '<p>Confirma\u00e7\u00e3o inv\u00e1lida.</p>'));
    sessions.delete('retention');
    try { const restored = retention.restore(id); return send(res, 200, page('Tarefa restaurada', '<h1>Tarefa restaurada</h1><p>' + restored.restored_files + ' arquivos recuperados.</p><p><a href="/dashboard/task/' + esc(id) + '">Abrir tarefa</a> - <a href="/dashboard/retention">Voltar para Retencao</a></p>')); }
    catch (error) { return send(res, 409, page('Nao foi possivel restaurar', '<p>' + esc(error.message) + '</p><p><a href="/dashboard/retention">Voltar para a pagina de retencao</a></p>')); }
  }
  async function serve(req, res) {
    let requestUrl;
    try { requestUrl = new URL(req.url || '/', baseUrl); } catch { requestUrl = new URL('/', baseUrl); }
    if (req.method === 'GET' && ['/dashboard', '/dashboard/'].includes(requestUrl.pathname)) return send(res, 200, overview(requestUrl.searchParams));
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/assets/workshop.js') return res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' }).end(fs.readFileSync(path.join(root, 'dashboard-workshop.js')));
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/codex-workshop/activity') return workshopActivityApi(res, String(requestUrl.searchParams.get('task_id') || ''));
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/codex-workshop') { const rendered = codexWorkshopPage(requestUrl.searchParams); return send(res, 200, rendered.body, rendered.cookie); }
    const cancelWorkshopMatch = /^\/dashboard\/codex-workshop\/cancel\/([0-9a-f-]{36})$/.exec(requestUrl.pathname);
    if (req.method === 'POST' && cancelWorkshopMatch) return cancelWorkshop(req, res, cancelWorkshopMatch[1]);
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/catalog') return send(res, 200, projectCatalogPage(requestUrl.searchParams));
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/coming-soon') return send(res, 200, comingSoonPage());
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/retention') { if (!retentionInitialized) sweepRetention(); const rendered = retentionPage(); return send(res, 200, rendered.body, rendered.cookie); }
    const retentionRestoreMatch = /^\/dashboard\/retention\/restore\/([0-9a-f-]{36})$/.exec(requestUrl.pathname);
    if (req.method === 'POST' && retentionRestoreMatch) return restoreRetention(req, res, retentionRestoreMatch[1]);
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/requests') return send(res, 200, requestsPage(requestUrl.searchParams));
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/token-savings') return send(res, 200, tokenSavingsPage(), `codex_dashboard=${sessions.get(savingsSession)}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/graphify') return send(res, 200, graphifyPage());
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/graphify/view') return serveGraphifyView(res, requestUrl.searchParams.get('project'));
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/token-savings') return saveTokenSavings(req, res);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/token-savings/rtk-sync') return syncRtkSavings(req, res);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/token-savings/headroom-sync') return syncHeadroomSavings(req, res);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/token-savings/install-tool') return installSavingsTool(req, res);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/token-savings/headroom-codex') return addHeadroomMcpToCodex(req, res);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/token-savings/graphify-install') return installGraphify(req, res);
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/impact') return send(res, 200, impactPage(requestUrl.searchParams), `codex_dashboard=${sessions.get(impactSession)}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/impact/import') return impactPost(req, res, 'import');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/impact/manual') return impactPost(req, res, 'manual');
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/tunnels') return send(res, 200, tunnelsPage(requestUrl.searchParams), `codex_dashboard=${sessions.get('tunnel-profiles')}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/tunnels/save') return handleTunnelPost(req, res, 'save');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/tunnels/remove') return handleTunnelPost(req, res, 'remove');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/tunnels/install-tools') return installTunnelTools(req, res);
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/routing') return send(res, 200, routingPage(), `codex_dashboard=${sessions.get('routing')}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300`);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/routing') return saveRouting(req, res);
    if (req.method === 'GET' && requestUrl.pathname === '/dashboard/mcps') return sendMcpSetupPage(res);
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/setup') return handleMcpSetupPost(req, res, 'setup');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/codex-create') return handleMcpSetupPost(req, res, 'codex_create');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/verify') return handleMcpSetupPost(req, res, 'codex_verify');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/verify-cli') return handleMcpSetupPost(req, res, 'verify_cli');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/test-connection') return handleMcpSetupPost(req, res, 'test_connection');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/status') return handleMcpSetupPost(req, res, 'status');
    if (req.method === 'POST' && requestUrl.pathname === '/dashboard/mcps/remove') return handleMcpSetupPost(req, res, 'remove');
    if (req.method === 'GET' && req.url === '/dashboard/projects/new') {
      const item = setupPage(); return send(res, 200, item.body, item.cookie);
    }
    if (req.method === 'POST' && req.url === '/dashboard/projects') return register(req, res);
    const projectMatch = /^\/dashboard\/project\/([a-z0-9_-]+)(\/readme)?$/.exec(req.url || '');
    if (req.method === 'GET' && projectMatch && SLUG.test(projectMatch[1])) {
      const content = projectMatch[2] ? readmePage(projectMatch[1]) : projectPage(projectMatch[1]);
      const policyToken = sessions.get(`policy-${projectMatch[1]}`);
      return send(res, content ? 200 : 404, content || page('Não encontrado', '<p>Projeto desconhecido.</p>'), policyToken ? `codex_dashboard=${policyToken}; HttpOnly; SameSite=Strict; Path=/dashboard; Max-Age=300` : undefined);
    }
    const policyMatch = /^\/dashboard\/project\/([a-z0-9_-]+)\/policy(?:\/(manual))?$/.exec(requestUrl.pathname);
    if (req.method === 'POST' && policyMatch) return updatePolicy(req, res, policyMatch[1], policyMatch[2] ? 'manual' : null);
    const taskMatch = /^\/dashboard\/task\/([0-9a-f-]{36})$/.exec(req.url || '');
    if (req.method === 'GET' && taskMatch && UUID.test(taskMatch[1])) {
      const item = detail(taskMatch[1]);
      return send(res, item ? 200 : 404, item?.body || page('Não encontrado', '<p>Tarefa desconhecida.</p>'), item?.cookie);
    }
    const rejectMatch = /^\/dashboard\/reject\/([0-9a-f-]{36})$/.exec(req.url || '');
    if (req.method === 'POST' && rejectMatch && UUID.test(rejectMatch[1])) return reject(req, res, rejectMatch[1]);
    const archiveMatch = /^\/dashboard\/(delete|restore)\/([0-9a-f-]{36})$/.exec(requestUrl.pathname);
    if (req.method === 'POST' && archiveMatch && UUID.test(archiveMatch[2])) return archive(req, res, archiveMatch[2], archiveMatch[1] === 'restore');
    return send(res, 404, page('Não encontrado', '<p>Endereço desconhecido.</p>'));
  }
  return { serve, get, save, records, projects, projectFor, verifyProject, configureProject, projectNotes, addProjectNote, setApprovalPolicy, tokenSavingsPreferences: savingsPreferences };
}

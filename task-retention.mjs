import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TASK_RETENTION = Object.freeze({ maxActiveTasks: 100, activeDays: 180, archiveDays: 30 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = new Set(['completed', 'failed', 'timeout', 'cancelled', 'rejected', 'expired', 'deleted']);
const FILES = ['history', 'report', 'pending', 'approved'];

export function createTaskRetention({ historyDir, reportsDir, approvalsDir, tasks = new Map(), now = Date.now }) {
  const archiveDir = path.join(historyDir, 'retention-archive');
  const pathsFor = id => ({
    history: path.join(historyDir, `${id}.json`),
    report: path.join(reportsDir, `${id}.json`),
    pending: path.join(approvalsDir, `${id}.pending.json`),
    approved: path.join(approvalsDir, `${id}.approved.json`),
  });
  const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const activeApproval = (id, currentTime) => {
    const task = tasks.get(id);
    if (task && !TERMINAL.has(task.state)) return true;
    const files = pathsFor(id);
    for (const key of ['pending', 'approved']) {
      if (!fs.existsSync(files[key])) continue;
      const proof = readJson(files[key]);
      if (!proof) return true;
      const expires = typeof proof.expiresAt === 'number' ? proof.expiresAt : Date.parse(proof.expiresAt);
      if (!Number.isFinite(expires) || expires > currentTime) return true;
    }
    return false;
  };
  function archive(id, currentTime) {
    const sourcePaths = pathsFor(id);
    const files = {};
    for (const key of FILES) {
      try { files[key] = fs.readFileSync(sourcePaths[key]).toString('base64'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!files.history && !files.report) return false;
    const history = files.history ? JSON.parse(Buffer.from(files.history, 'base64').toString('utf8')) : null;
    const report = files.report ? JSON.parse(Buffer.from(files.report, 'base64').toString('utf8')) : null;
    const summary = String(history?.summary || report?.summary || history?.prompt || '').slice(0, 500);
    const bundle = { schema: 1, task_id: id, archived_at: new Date(currentTime).toISOString(), purge_after: new Date(currentTime + TASK_RETENTION.archiveDays * 86_400_000).toISOString(), state: report?.state || history?.state || 'terminal', summary, files };
    fs.mkdirSync(archiveDir, { recursive: true });
    const destination = path.join(archiveDir, `${id}.json`);
    if (fs.existsSync(destination)) return false;
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(bundle), { flag: 'wx', mode: 0o600 });
    try {
      const verified = readJson(temporary);
      if (verified?.task_id !== id || FILES.some(key => verified.files?.[key] !== files[key])) throw new Error('Arquivo de retenção não passou na conferência; originais foram preservados.');
      fs.renameSync(temporary, destination);
    } catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
    for (const key of FILES) if (files[key]) fs.unlinkSync(sourcePaths[key]);
    return true;
  }
  function sweep() {
    const currentTime = now();
    const cutoff = currentTime - TASK_RETENTION.activeDays * 86_400_000;
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const name of fs.readdirSync(archiveDir)) {
      if (!UUID.test(name.replace(/\.json$/, '')) || !name.endsWith('.json')) continue;
      const file = path.join(archiveDir, name), bundle = readJson(file);
      const purgeAfter = Date.parse(bundle?.purge_after || '');
      if (bundle?.schema === 1 && Number.isFinite(purgeAfter) && purgeAfter <= currentTime) fs.unlinkSync(file);
    }
    const ids = new Set();
    for (const [dir, suffix] of [[historyDir, '.json'], [reportsDir, '.json']]) {
      try { for (const name of fs.readdirSync(dir)) if (name.endsWith(suffix) && UUID.test(name.slice(0, -suffix.length))) ids.add(name.slice(0, -suffix.length)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const candidates = [];
    for (const id of ids) {
      if (activeApproval(id, currentTime)) continue;
      const files = pathsFor(id), history = readJson(files.history), report = readJson(files.report);
      const state = history?.state === 'deleted' ? 'deleted' : report?.state || history?.state;
      if (!TERMINAL.has(state)) continue;
      const exemptUntil = Date.parse(history?.retention_exempt_until || report?.retention_exempt_until || '');
      if (Number.isFinite(exemptUntil) && exemptUntil > currentTime) continue;
      const parsedAt = Date.parse(report?.finishedAt || history?.finished_at || history?.updated_at || history?.created_at || '');
      const at = Number.isFinite(parsedAt) ? parsedAt : Math.max(...['history', 'report'].map(key => { try { return fs.statSync(pathsFor(id)[key]).mtimeMs; } catch { return 0; } }));
      candidates.push({ id, at, mustArchive: at > 0 && at < cutoff });
    }
    candidates.sort((a, b) => b.at - a.at);
    for (const [index, item] of candidates.entries()) if (item.mustArchive || index >= TASK_RETENTION.maxActiveTasks) archive(item.id, currentTime);
    return { archived: listArchived().length, active_terminal: candidates.length - candidates.filter(item => item.mustArchive || candidates.indexOf(item) >= TASK_RETENTION.maxActiveTasks).length };
  }
  function listArchived() {
    try {
      return fs.readdirSync(archiveDir).filter(name => name.endsWith('.json') && UUID.test(name.slice(0, -5))).map(name => readJson(path.join(archiveDir, name))).filter(bundle => bundle?.schema === 1).sort((a, b) => Date.parse(b.archived_at) - Date.parse(a.archived_at));
    } catch { return []; }
  }
  function restore(id) {
    if (!UUID.test(id)) throw new Error('ID de tarefa inválido.');
    const bundlePath = path.join(archiveDir, `${id}.json`), bundle = readJson(bundlePath);
    if (bundle?.schema !== 1 || bundle.task_id !== id) throw new Error('Registro arquivado não encontrado ou inválido.');
    const destinations = pathsFor(id), restoreFiles = FILES.filter(key => typeof bundle.files?.[key] === 'string');
    if (!restoreFiles.length || restoreFiles.some(key => fs.existsSync(destinations[key]))) throw new Error('Já existe um arquivo ativo com este ID. Nada foi sobrescrito.');
    fs.mkdirSync(historyDir, { recursive: true }); fs.mkdirSync(reportsDir, { recursive: true }); fs.mkdirSync(approvalsDir, { recursive: true });
    const restoredAt = now();
    if (bundle.files.history) {
      const history = JSON.parse(Buffer.from(bundle.files.history, 'base64').toString('utf8'));
      history.restored_at = new Date(restoredAt).toISOString();
      history.retention_exempt_until = new Date(restoredAt + TASK_RETENTION.archiveDays * 86_400_000).toISOString();
      bundle.files.history = Buffer.from(JSON.stringify(history, null, 2)).toString('base64');
    } else if (bundle.files.report) {
      const report = JSON.parse(Buffer.from(bundle.files.report, 'base64').toString('utf8'));
      report.restored_at = new Date(restoredAt).toISOString();
      report.retention_exempt_until = new Date(restoredAt + TASK_RETENTION.archiveDays * 86_400_000).toISOString();
      bundle.files.report = Buffer.from(JSON.stringify(report, null, 2)).toString('base64');
    }
    const created = [];
    try {
      for (const key of restoreFiles) {
        const bytes = Buffer.from(bundle.files[key], 'base64');
        fs.writeFileSync(destinations[key], bytes, { flag: 'wx', mode: 0o600 });
        created.push(destinations[key]);
      }
    } catch (error) {
      for (const file of created) try { fs.unlinkSync(file); } catch {}
      throw error;
    }
    fs.unlinkSync(bundlePath);
    return { task_id: id, restored_files: restoreFiles.length };
  }
  return { sweep, listArchived, restore, archiveDir };
}

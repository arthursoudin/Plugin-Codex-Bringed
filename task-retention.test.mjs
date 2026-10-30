import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTaskRetention, TASK_RETENTION } from './task-retention.mjs';

test('retention archives overflow only after a recoverable copy and preserves active approvals', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-retention-'));
  const historyDir = path.join(root, 'history'), reportsDir = path.join(root, 'reports'), approvalsDir = path.join(root, 'approvals');
  const currentTime = Date.now(), tasks = new Map();
  fs.mkdirSync(historyDir, { recursive: true }); fs.mkdirSync(reportsDir, { recursive: true }); fs.mkdirSync(approvalsDir, { recursive: true });
  try {
    for (let i = 0; i < TASK_RETENTION.maxActiveTasks + 1; i++) {
      const id = crypto.randomUUID(), finishedAt = new Date(currentTime - i).toISOString();
      fs.writeFileSync(path.join(historyDir, `${id}.json`), JSON.stringify({ task_id: id, state: 'completed', summary: `task ${i}`, created_at: finishedAt }));
      fs.writeFileSync(path.join(reportsDir, `${id}.json`), JSON.stringify({ id, state: 'completed', finishedAt, result: `result ${i}` }));
    }
    const activeId = crypto.randomUUID();
    fs.writeFileSync(path.join(historyDir, `${activeId}.json`), JSON.stringify({ task_id: activeId, state: 'completed', created_at: new Date(currentTime - 400 * 86_400_000).toISOString() }));
    fs.writeFileSync(path.join(reportsDir, `${activeId}.json`), JSON.stringify({ id: activeId, state: 'completed', finishedAt: new Date(currentTime - 400 * 86_400_000).toISOString() }));
    fs.writeFileSync(path.join(approvalsDir, `${activeId}.pending.json`), JSON.stringify({ expiresAt: currentTime + 60_000 }));
    const retention = createTaskRetention({ historyDir, reportsDir, approvalsDir, tasks, now: () => currentTime });
    retention.sweep();
    const archived = retention.listArchived();
    assert.equal(archived.length, 1);
    const oldId = archived[0].task_id;
    assert.equal(fs.existsSync(path.join(historyDir, `${oldId}.json`)), false);
    assert.equal(fs.existsSync(path.join(reportsDir, `${oldId}.json`)), false);
    assert.equal(fs.existsSync(path.join(historyDir, `${activeId}.json`)), true);
    assert.equal(fs.existsSync(path.join(reportsDir, `${activeId}.json`)), true);
    assert.equal(Date.parse(archived[0].purge_after) - Date.parse(archived[0].archived_at), TASK_RETENTION.archiveDays * 86_400_000);
    const restored = retention.restore(oldId);
    assert.equal(restored.task_id, oldId);
    assert.equal(JSON.parse(fs.readFileSync(path.join(historyDir, `${oldId}.json`), 'utf8')).retention_exempt_until > new Date(currentTime).toISOString(), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(reportsDir, `${oldId}.json`), 'utf8')).result.startsWith('result '), true);
    assert.equal(retention.listArchived().length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('expired recovery bundles are removed only after their published recovery window', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-retention-expiry-'));
  const historyDir = path.join(root, 'history'), reportsDir = path.join(root, 'reports'), approvalsDir = path.join(root, 'approvals');
  let currentTime = Date.now();
  fs.mkdirSync(historyDir, { recursive: true }); fs.mkdirSync(reportsDir, { recursive: true });
  try {
    const id = crypto.randomUUID(), finishedAt = new Date(currentTime - 181 * 86_400_000).toISOString();
    fs.writeFileSync(path.join(historyDir, `${id}.json`), JSON.stringify({ task_id: id, state: 'completed', created_at: finishedAt }));
    fs.writeFileSync(path.join(reportsDir, `${id}.json`), JSON.stringify({ id, state: 'completed', finishedAt }));
    const retention = createTaskRetention({ historyDir, reportsDir, approvalsDir, now: () => currentTime });
    retention.sweep();
    assert.equal(retention.listArchived().length, 1);
    currentTime += (TASK_RETENTION.archiveDays + 1) * 86_400_000;
    retention.sweep();
    assert.equal(retention.listArchived().length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('restoring a report-only archive prevents an immediate re-archive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-retention-report-'));
  const historyDir = path.join(root, 'history'), reportsDir = path.join(root, 'reports'), approvalsDir = path.join(root, 'approvals');
  const currentTime = Date.now(), id = crypto.randomUUID();
  fs.mkdirSync(reportsDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(reportsDir, `${id}.json`), JSON.stringify({ id, state: 'completed', finishedAt: new Date(currentTime - 181 * 86_400_000).toISOString() }));
    const retention = createTaskRetention({ historyDir, reportsDir, approvalsDir, now: () => currentTime });
    retention.sweep();
    assert.equal(retention.listArchived().length, 1);
    retention.restore(id);
    const restored = JSON.parse(fs.readFileSync(path.join(reportsDir, `${id}.json`), 'utf8'));
    assert.equal(Date.parse(restored.retention_exempt_until), currentTime + TASK_RETENTION.archiveDays * 86_400_000);
    retention.sweep();
    assert.equal(fs.existsSync(path.join(reportsDir, `${id}.json`)), true);
    assert.equal(retention.listArchived().length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createChildEnvironment, terminateProcessTree } from './process-safety.mjs';

test('child process environment excludes unrelated secrets and preserves runtime essentials', () => {
  const environment = createChildEnvironment({
    platform: 'win32',
    ci: true,
    prependPath: 'C:\\Node',
    source: { Path: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows', CODEX_HOME: 'C:\\Users\\Test\\.codex', OPENAI_API_KEY: 'fixture-secret', GITHUB_TOKEN: 'fixture-token' },
  });
  assert.equal(environment.Path, 'C:\\Node;C:\\Windows\\System32');
  assert.equal(environment.SystemRoot, 'C:\\Windows');
  assert.equal(environment.CODEX_HOME, 'C:\\Users\\Test\\.codex');
  assert.equal(environment.CI, '1');
  assert.equal(Object.hasOwn(environment, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(environment, 'GITHUB_TOKEN'), false);
});

test('process tree termination targets the POSIX process group', () => {
  const calls = [];
  const child = { pid: 123, exitCode: null, signalCode: null, kill: signal => calls.push(['direct', signal]) };
  assert.equal(terminateProcessTree(child, { platform: 'linux', killProcess: (...args) => calls.push(args) }), true);
  assert.deepEqual(calls, [[-123, 'SIGKILL']]);
});

test('Windows process tree termination invokes taskkill and falls back if it fails', () => {
  const calls = [];
  const killer = new EventEmitter();
  const child = { pid: 456, exitCode: null, signalCode: null, kill: signal => calls.push(['direct', signal]) };
  assert.equal(terminateProcessTree(child, { platform: 'win32', spawnProcess: (...args) => { calls.push(args); return killer; } }), true);
  killer.emit('close', 1);
  assert.equal(calls[0][0], 'taskkill.exe');
  assert.deepEqual(calls.at(-1), ['direct', 'SIGKILL']);
});

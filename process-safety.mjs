import { spawn } from 'node:child_process';

const WINDOWS_ENV = ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'CODEX_HOME'];
const POSIX_ENV = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'CODEX_HOME'];

export function createChildEnvironment({ source = process.env, platform = process.platform, ci = false, prependPath } = {}) {
  const environment = {};
  const keys = platform === 'win32' ? WINDOWS_ENV : POSIX_ENV;
  for (const expected of keys) {
    const actual = Object.keys(source).find(key => key.toLowerCase() === expected.toLowerCase());
    if (actual && source[actual] !== undefined) environment[actual] = source[actual];
  }
  const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path');
  if (prependPath) {
    const sourcePathKey = Object.keys(source).find(key => key.toLowerCase() === 'path');
    const delimiter = platform === 'win32' ? ';' : ':';
    const value = sourcePathKey ? source[sourcePathKey] : '';
    environment[pathKey || sourcePathKey || 'PATH'] = [prependPath, value].filter(Boolean).join(delimiter);
  }
  environment.NO_COLOR = '1';
  environment.TERM = 'dumb';
  if (ci) environment.CI = '1';
  return environment;
}

export function terminateProcessTree(child, { platform = process.platform, spawnProcess = spawn, killProcess = process.kill } = {}) {
  if (!child?.pid) return false;
  const killDirect = () => {
    if (child.exitCode !== null && child.exitCode !== undefined) return;
    if (child.signalCode !== null && child.signalCode !== undefined) return;
    try { child.kill('SIGKILL'); } catch {}
  };
  if (platform !== 'win32') {
    try { killProcess(-child.pid, 'SIGKILL'); }
    catch { killDirect(); }
    return true;
  }
  const fallback = setTimeout(killDirect, 750);
  fallback.unref?.();
  try {
    const killer = spawnProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', env: createChildEnvironment({ platform: 'win32' }) });
    killer.once('error', () => { clearTimeout(fallback); killDirect(); });
    killer.once('close', code => { clearTimeout(fallback); if (code !== 0) killDirect(); });
  } catch { clearTimeout(fallback); killDirect(); }
  return true;
}

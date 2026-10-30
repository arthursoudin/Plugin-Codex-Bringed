import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function defaultMcpTokenFile({ env = process.env, testDashboardRoot } = {}) {
  if (testDashboardRoot) return path.join(path.resolve(testDashboardRoot), 'bridge', 'http-token');
  if (env.CODEXBRIDGE_MCP_TOKEN_FILE) return path.resolve(env.CODEXBRIDGE_MCP_TOKEN_FILE);
  const localAppData = env.LOCALAPPDATA;
  return localAppData
    ? path.join(localAppData, 'CodexBridge', 'auth', 'mcp-token')
    : path.join(os.homedir(), '.codexbridge', 'auth', 'mcp-token');
}

export function loadOrCreateMcpToken(tokenFile) {
  const file = path.resolve(tokenFile);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    const token = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(file, `${token}\n`, { flag: 'wx', mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
    return token;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128) throw new Error('CodexBridge MCP token file is not a regular, bounded file.');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) fs.chmodSync(file, 0o600);
  const token = fs.readFileSync(file, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('CodexBridge MCP token file is invalid; remove it and restart the adapter to rotate it.');
  return token;
}

export function matchesMcpToken(candidate, expected) {
  if (typeof candidate !== 'string') return false;
  const supplied = Buffer.from(candidate);
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && crypto.timingSafeEqual(supplied, secret);
}

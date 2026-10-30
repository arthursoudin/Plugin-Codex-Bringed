import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchMcp, startHttpAdapter } from './server.mjs';

const MAX_LINE = 1_000_000;

export async function serveStdio({ input, output, dispatch }) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  const send = response => output.write(`${JSON.stringify(response)}\n`);
  const errorResponse = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  for await (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE) {
      send(errorResponse(null, -32600, 'Request too large'));
      continue;
    }
    let message;
    try { message = JSON.parse(line); }
    catch { send(errorResponse(null, -32700, 'Parse error')); continue; }
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && !['number', 'string'].includes(typeof message.id) && message.id !== null)) {
      send(errorResponse(message?.id ?? null, -32600, 'Invalid Request'));
      continue;
    }
    const task = Promise.resolve().then(() => dispatch(message)).then(
      reply => { if (reply != null && message.id !== undefined) send(reply); },
      () => { if (message.id !== undefined) send(errorResponse(message.id, -32603, 'Internal error')); },
    );
    pending.add(task);
    task.finally(() => pending.delete(task));
  }
  await Promise.allSettled([...pending]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const adapter = await startHttpAdapter({ allowFallback: true });
  try {
    await serveStdio({ input: process.stdin, output: process.stdout, dispatch: message => dispatchMcp(message, adapter.workflow) });
  } finally {
    await new Promise(resolve => adapter.server.close(resolve));
  }
}

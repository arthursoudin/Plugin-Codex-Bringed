import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { installNativeAgents } from '../agent-profiles.mjs';

export async function installProfilesWithConsent({ client, targetDirectory, ask }) {
  if (!['codex', 'claude_code', 'antigravity'].includes(client)) throw new Error('Cliente inválido.');
  if (typeof ask !== 'function') throw new Error('A confirmação local é obrigatória.');
  const answer = await ask(`Isso criará seis arquivos no perfil local do ${client}. Digite INSTALAR para confirmar: `);
  if (answer !== 'INSTALAR') return { installed: false, files: [] };
  return { installed: true, files: installNativeAgents(client, targetDirectory) };
}

async function main() {
  const args = process.argv.slice(2);
  const clientIndex = args.indexOf('--client');
  const client = clientIndex >= 0 ? args[clientIndex + 1] : '';
  if (!['codex', 'claude_code', 'antigravity'].includes(client)) {
    console.error('Uso: node scripts/Install-Agent-Profiles.mjs --client codex|claude_code|antigravity');
    process.exitCode = 2;
    return;
  }
  const home = os.homedir();
  const target = client === 'codex'
    ? path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'agents')
    : client === 'claude_code'
      ? path.join(home, '.claude', 'agents')
      : path.join(home, '.gemini', 'config', 'agents');
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const result = await installProfilesWithConsent({ client, targetDirectory: target, ask: question => terminal.question(question) });
    if (!result.installed) {
      console.log('Cancelado. Nenhum arquivo foi alterado.');
      return;
    }
    console.log(`Perfis nativos instalados em ${target}: ${result.files.length} arquivos.`);
    console.log('Se o cliente já estava aberto, reinicie-o ou atualize a lista de agentes.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { terminal.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();

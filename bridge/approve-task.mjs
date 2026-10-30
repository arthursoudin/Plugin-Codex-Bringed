import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2] ?? '';
if (!/^[0-9a-f-]{36}$/i.test(id)) { console.error('Use: node approve-task.mjs <task_id>'); process.exit(2); }
if (!stdin.isTTY || !stdout.isTTY) { console.error('A aprovação exige um terminal PowerShell interativo.'); process.exit(2); }
const dir = path.join(HERE, 'approvals');
const pendingPath = path.join(dir, `${id}.pending.json`);
let pending;
try { pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8')); }
catch { console.error('Tarefa pendente inexistente ou expirada.'); process.exit(2); }
if (pending.task_id !== id || pending.expiresAt < Date.now()) { console.error('Tarefa pendente inválida ou expirada.'); process.exit(2); }
console.log(`Projeto: ${pending.project_directory || process.env.CODEXBRIDGE_PROJECT || path.join(process.env.USERPROFILE ?? '', 'Desktop', 'Jarvis')}`);
console.log(`Resumo: ${pending.summary}`);
console.log(`ID: ${id}`);
console.log(`Digite a frase exata para autorizar uma única execução (expira em até 5 minutos):\n${pending.phrase}`);
const rl = readline.createInterface({ input: stdin, output: stdout });
const answer = await rl.question('Frase de aprovação: ');
rl.close();
if (answer !== pending.phrase) { console.error('Frase incorreta; nenhuma autorização foi criada.'); process.exit(1); }
const approvedPath = path.join(dir, `${id}.approved.json`);
if (fs.existsSync(approvedPath)) { console.error('Esta tarefa já possui autorização local.'); process.exit(1); }
const phraseDigest = crypto.createHash('sha256').update(pending.phrase).digest('hex');
fs.writeFileSync(approvedPath, JSON.stringify({ task_id: id, phrase_digest: phraseDigest, expiresAt: pending.expiresAt }), { flag: 'wx', mode: 0o600 });
console.log('Autorização local criada. Agora envie codex_execute_approved com o mesmo ID e frase.');

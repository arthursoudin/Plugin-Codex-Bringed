import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = ['server.mjs', 'stdio.mjs', 'workflow.mjs', 'routing.mjs', 'dashboard.mjs', 'bridge/server.mjs'];
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^\uFEFF/, ''));
const sourceHash = crypto.createHash('sha256');
for (const relative of sourceFiles) {
  sourceHash.update(relative).update('\0').update(fs.readFileSync(path.join(root, relative))).update('\0');
}

// Stable for this installation and source revision; never exposes the local path.
export const runtimeInfo = Object.freeze({
  version: packageInfo.version,
  installation_id: crypto.createHash('sha256').update(fs.realpathSync.native(root)).digest('hex').slice(0, 12),
  source_revision: sourceHash.digest('hex').slice(0, 12),
});

// Agent character sheet instrument (design/mockups/49-agent-characters.html).
// The sheet imports the beings from src/agentWorld/beings.js so the sheet and
// the Org Map share one source. A published artifact is safest as ONE file,
// so this writes a copy with the module inlined in place of the import.
//   node scripts/agent-sheet/bundle.mjs <out.html>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2];
if (!out) { console.error('usage: node scripts/agent-sheet/bundle.mjs <out.html>'); process.exit(1); }

const page = await readFile(path.join(ROOT, 'design/mockups/49-agent-characters.html'), 'utf8');
const kit = await readFile(path.join(ROOT, 'src/agentWorld/beings.js'), 'utf8');
const IMPORT = "import { createBeingKit } from '../../src/agentWorld/beings.js';";
if (!page.includes(IMPORT)) { console.error('the sheet no longer imports the kit the way this expects'); process.exit(1); }
const inlined = kit.replace(/^export function createBeingKit/m, 'function createBeingKit');
if (/^\s*(export|import)\s/m.test(inlined)) { console.error('the kit has another import/export; inline it by hand'); process.exit(1); }
await writeFile(out, page.replace(IMPORT, inlined));
console.log(out, `${Math.round((page.length + kit.length) / 1024)}KB`);

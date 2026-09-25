// Agent sheet instrument (design/mockups/49-agent-characters.html, 50-habitat.html).
// The sheets import their modules from src/agentWorld/ so the sheets and the
// Org Map share one source. A published artifact is safest as ONE file, so
// this writes a copy with every src/agentWorld/*.js import inlined in place.
//   node scripts/agent-sheet/bundle.mjs <out.html> [--page 50-habitat.html]
// The default page is 49, and its output is what it always was.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const pi = args.indexOf('--page');
const pageName = pi >= 0 ? args[pi + 1] : '49-agent-characters.html';
const rest = pi >= 0 ? args.filter((_, i) => i !== pi && i !== pi + 1) : args;
const out = rest[0];
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!out || !pageName) fail('usage: node scripts/agent-sheet/bundle.mjs <out.html> [--page <file in design/mockups>]');

const page = await readFile(path.join(ROOT, 'design/mockups', pageName), 'utf8');
const IMPORT_RE = /^import \{ ([\w$, ]+) \} from '\.\.\/\.\.\/src\/agentWorld\/([\w-]+)\.js';$/gm;
const imports = [...page.matchAll(IMPORT_RE)];
if (!imports.length) fail(`${pageName} imports nothing from src/agentWorld/ the way this expects`);
// any other import (a relative path, a bare module) would break the one-file copy
const ONE_LINE = new RegExp(IMPORT_RE.source);
const others = page.split('\n').filter((l) => /^\s*import\s/.test(l) && !ONE_LINE.test(l));
if (others.length) fail(`${pageName} has an import this cannot inline:\n${others.join('\n')}`);

let html = page, bytes = page.length;
for (const [line, names, mod] of imports) {
  const src = await readFile(path.join(ROOT, 'src/agentWorld', `${mod}.js`), 'utf8');
  const inlined = src.replace(/^export (function|const|let|var|class) /gm, '$1 ');
  const stray = inlined.match(/^\s*(export|import)\b.*$/m);
  if (stray) fail(`${mod}.js has another import/export (${stray[0].trim()}); inline it by hand`);
  for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!new RegExp(`^(function|const|let|var|class) ${n.replace('$', '\\$')}\\b`, 'm').test(inlined)) fail(`${mod}.js does not define ${n} at the top level`);
  }
  html = html.replace(line, () => inlined);
  bytes += src.length;
}
await writeFile(out, html);
console.log(out, `${Math.round(bytes / 1024)}KB`, imports.map((m) => `${m[2]}.js`).join(' + '));

#!/usr/bin/env node
// SEED A BROWSER'S CONNECTION WITHOUT THE TOKEN EVER BEING PRINTED.
//
// Verifying a Nova UI change means opening the app against the real server,
// and the app reads its connection out of localStorage. Typing that token into
// a devtools console puts it in a transcript; every previous session either
// did that or gave up and verified nothing.
//
// So: this writes `public/_devconn.js`, which the dev server serves at
// /nova-os/_devconn.js. The page fetches and evals it, gets a connection, and
// the token stays on disk between two files that already hold it.
//
//   node scripts/dev-connect.mjs          # write it
//   node scripts/dev-connect.mjs --clean  # delete it
//
// ALWAYS run --clean when finished, and clear the keys in the browser too.
// The file is gitignored, but a token sitting in a served directory is exactly
// the kind of thing that outlives the session that needed it.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', '_devconn.js');

if (process.argv.includes('--clean')) {
  await unlink(OUT).catch(() => {});
  console.log('removed public/_devconn.js');
  process.exit(0);
}

const env = await readFile(path.join(ROOT, 'server', '.env'), 'utf8');
const token = env.match(/^\s*API_TOKEN\s*=\s*(.+?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '');
if (!token) {
  console.error('no API_TOKEN in server/.env — nothing written');
  process.exit(1);
}

// 127.0.0.1 for the API is correct and deliberate: the server binds loopback,
// and the CORS allowlist is about the PAGE's origin (localhost:5173), not this.
const conn = { baseUrl: 'http://127.0.0.1:4173', token };
const style = process.argv.includes('--command') ? 'command' : 'cupertino'; // his phone runs cupertino
await writeFile(OUT, [
  `localStorage.setItem('novaos.connection', ${JSON.stringify(JSON.stringify(conn))});`,
  `localStorage.setItem('novaos.style', ${JSON.stringify(style)});`,
  `'seeded ${style}'`,
  '',
].join('\n'), 'utf8');
console.log(`wrote public/_devconn.js (style=${style}, token ${token.length} chars, not printed)`);
console.log('in the page:  await fetch("/nova-os/_devconn.js").then(r=>r.text()).then(eval)  then reload');

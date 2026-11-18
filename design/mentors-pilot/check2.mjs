import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const { parsePlaybook, formatPlaybook } = await import(new URL('../../server/lib/playbooks.js', import.meta.url).href);
const HERE = process.env.PILOT_DIR || process.cwd(); // the scratch folder the pilot ran in
const norm = (s) => s.toLowerCase().replace(/\[[\d:]+\]/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
let all = '';
for (const id of ['cOSEgCFNJcw', 'QvIodMG8tKE', 'V3hvD_7FAK8', 'jC30mx2ozLI']) all += ' ' + norm(await readFile(path.join(HERE, id, 'transcript.txt'), 'utf8'));
const dir = path.join(HERE, 'vault/Wiki/Playbooks');
let rules = 0, phrases = 0, phrasesOk = 0, roundTrip = 0; const bad = [];
const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
for (const f of files) {
  const raw = await readFile(path.join(dir, f), 'utf8');
  let pb; try { pb = parsePlaybook(raw); } catch (e) { console.log('PARSE FAIL', f, e.message); continue; }
  const same = formatPlaybook(pb) === raw || formatPlaybook(pb).trim() === raw.trim();
  if (same) roundTrip++;
  rules += pb.rules.length; 
  for (const p of pb.phrases) { phrases++; const q = norm(String(p).replace(/^"|"$/g, '')); if (all.includes(q)) phrasesOk++; else bad.push(`${f}: ${p}`); }
  console.log(f, '| triggers', pb.triggers.length, '| method', pb.method.length, '| rules', pb.rules.length, '| phrases', pb.phrases.length, '| sources', pb.sources.length, '| round trip', same);
}
console.log(`playbooks ${files.length}, round trip identical ${roundTrip}, rules ${rules}, phrases word for word ${phrasesOk}/${phrases}`);
console.log(bad.slice(0, 12).join('\n'));
const book = await readFile(path.join(HERE, 'vault/Wiki/Mentors/Jefferson Fisher.md'), 'utf8');
const says = [...book.matchAll(/Say: "([^"]+)"/g)].map((m) => m[1]);
const ok = says.filter((s) => all.includes(norm(s)));
console.log(`book: ${book.length} chars, Say quotes ${ok.length}/${says.length} word for word`);
console.log(says.filter((s) => !all.includes(norm(s))).slice(0, 8).join('\n'));

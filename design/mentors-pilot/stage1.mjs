// Mentors pilot, Stage 1 (read). Scratch only: writes nothing outside this folder.
// node stage1.mjs            fetch + read all five
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const YT = '/opt/homebrew/bin/yt-dlp';
const READ_VERSION = 'read-v1';
const VIDEOS = [
  'cOSEgCFNJcw', // Responding To Rude Comments Without Losing Your Cool (solo, 16 min)
  'QvIodMG8tKE', // Being Nice Won't Save You in Difficult Conversations (solo, 21 min)
  'V3hvD_7FAK8', // You Need to Disappoint More People (solo, 25 min)
  'jC30mx2ozLI', // Chris Voss: FBI-Backed Tactics (guest, 41 min)
  'J6V3oPNBrac', // 3 Signs You Have a Toxic Boss ft. George Stern (guest, 84 min)
];

function run(cmd, args, { input, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-400)}`))));
    c.stdin.end(input || '');
  });
}

const mmss = (ms) => {
  const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};

async function fetchOne(id) {
  const dir = path.join(HERE, id);
  await mkdir(dir, { recursive: true });
  const tPath = path.join(dir, 'transcript.txt');
  const mPath = path.join(dir, 'meta.json');
  if (existsSync(tPath) && existsSync(mPath)) return JSON.parse(await readFile(mPath, 'utf8'));
  const t0 = Date.now();
  let raw = null; let tries = 0;
  for (const waitS of [0, 20, 20, 30, 30, 45, 45, 60, 60, 90, 90, 120]) {
    if (waitS) { console.log(`  ${id}: refused, waiting ${waitS}s`); await new Promise((r) => setTimeout(r, waitS * 1000)); }
    tries++;
    try {
      raw = await run(YT, ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'en', '--sub-format', 'srv1', '--sleep-requests', '1.5',
        '--print-json', '-o', path.join(dir, 'cap'), `https://www.youtube.com/watch?v=${id}`]);
      break;
    } catch (e) { if (!/429/.test(e.message)) throw e; }
  }
  if (!raw) throw new Error(`${id}: YouTube refused the captions twelve times (429)`);
  const info = JSON.parse(raw.trim().split('\n').pop());
  const capFile = path.join(dir, 'cap.en.srv1');
  if (!existsSync(capFile)) throw new Error(`${id}: no English captions`);
  const xml = await readFile(capFile, 'utf8');
  const ent = (t) => t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  const events = [...xml.matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({ tStartMs: Math.round(parseFloat(m[1]) * 1000), text: ent(ent(m[2])).replace(/\s+/g, ' ').trim() }));
  const lines = []; let cur = ''; let curStart = null;
  for (const e of events) {
    if (!e.text) continue;
    if (curStart === null) curStart = e.tStartMs;
    cur += (cur ? ' ' : '') + e.text;
    if (e.tStartMs - curStart >= 30000) { lines.push(`[${mmss(curStart)}] ${cur.trim()}`); cur = ''; curStart = null; }
  }
  if (cur.trim()) lines.push(`[${mmss(curStart || 0)}] ${cur.trim()}`);
  const transcript = lines.join('\n');
  const manual = !!(info.subtitles && Object.keys(info.subtitles).some((k) => k.startsWith('en')));
  const meta = {
    id, title: info.title, channel: info.channel, uploadDate: info.upload_date, durationSec: info.duration, views: info.view_count,
    url: `https://www.youtube.com/watch?v=${id}`, description: String(info.description || '').slice(0, 800),
    captions: manual ? 'manual' : 'auto', format: 'srv1', chars: transcript.length, fetchMs: Date.now() - t0, tries,
  };
  await writeFile(tPath, transcript, 'utf8');
  await writeFile(mPath, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

const readPrompt = (meta, transcript) => `You are reading one source for a personal knowledge vault.

SOURCE
Title: ${meta.title}
Channel: ${meta.channel}
Published: ${meta.uploadDate}
Length: ${Math.round(meta.durationSec / 60)} minutes
Link: ${meta.url}
Channel's own description (may name the guest): ${meta.description.replace(/\s+/g, ' ').slice(0, 500)}

The full transcript is below, from captions, with [mm:ss] marks. Captions carry no speaker labels, little punctuation, and some misheard words.

Write READING NOTES in markdown under exactly the headings below, in this order. Later stages see only these notes, never the transcript, so anything you leave out is LOST. Never merge two distinct ideas into one item. Paraphrase in your own words, except where a heading asks for exact words. Give the [mm:ss] mark for every item. Invent nothing: when the transcript does not say, write "not stated". When you cannot tell who is speaking, write "unclear".

## Summary
Three sentences.

## People
One line each: name | role here (host, guest, mentioned) | how the transcript shows it.

## Ideas
For each idea: "### <short name>", then 2 to 5 sentences giving the idea and the reasoning behind it, then a line "By: <name or unclear> | [mm:ss]".

## Frameworks
Every named or numbered method. For each: "### <name>", then lines "Use when: ...", "Steps:" with a numbered list, "Shape: <one of steps, cycle, ladder, versus, matrix, funnel, single>" (the diagram that fits it best), "By: <name> | [mm:ss]".

## Scripts
Exact words a speaker recommends saying, or warns against saying. One per line:
- Situation: ... | Say: "exact words" | Instead of: "exact words, or none" | By: ... | [mm:ss]
Copy the quoted words exactly as the transcript has them.

## Stories and examples
1 to 3 sentences each, with [mm:ss].

## Lines
Up to 12 lines that stand alone as a whole thought, copied word for word from the transcript:
- "..." | By: <name or unclear> | [mm:ss]

## References
Books, studies and people a speaker credits: - what | who credited it | [mm:ss]

## Applications
3 to 8 bullets: a concrete situation (leading a team, a hard conversation at work, family) and which idea or framework above to use in it.

## Open questions
Claims made without support, or that conflict with common evidence. "none" if none.

Output only the notes, starting with "## Summary".

TRANSCRIPT
${transcript}
`;

async function readOne(meta) {
  const dir = path.join(HERE, meta.id);
  const nPath = path.join(dir, `notes.${READ_VERSION}.md`);
  const ePath = path.join(dir, `envelope.${READ_VERSION}.json`);
  if (existsSync(nPath) && existsSync(ePath)) return JSON.parse(await readFile(ePath, 'utf8'));
  const transcript = await readFile(path.join(dir, 'transcript.txt'), 'utf8');
  const t0 = Date.now();
  const out = await run('claude', ['-p', '--model', 'sonnet', '--effort', 'low', '--tools', '', '--strict-mcp-config', '--no-session-persistence',
    '--output-format', 'json', '--system-prompt', 'You are a careful reader who writes complete, faithful notes from a transcript. You follow the requested format exactly.'],
  { input: readPrompt(meta, transcript), cwd: dir });
  const env = JSON.parse(out);
  if (env.is_error || !env.result) throw new Error(`${meta.id}: read failed: ${String(env.result || env.subtype).slice(0, 300)}`);
  const notes = env.result.slice(Math.max(0, env.result.indexOf('## Summary')));
  await writeFile(nPath, notes, 'utf8');
  const rec = { id: meta.id, title: meta.title, chars: meta.chars, minutes: Math.round(meta.durationSec / 60), costUsd: env.total_cost_usd, wallMs: Date.now() - t0,
    usage: env.usage, models: Object.keys(env.modelUsage || {}), notesChars: notes.length, envelopeKeys: Object.keys(env), envelope: { ...env, result: undefined } };
  await writeFile(ePath, JSON.stringify(rec, null, 2), 'utf8');
  return rec;
}

// word-for-word check of every quoted run in Scripts and Lines
const norm = (s) => s.toLowerCase().replace(/\[[\d:]+\]/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
async function checkQuotes(id) {
  const dir = path.join(HERE, id);
  const t = norm(await readFile(path.join(dir, 'transcript.txt'), 'utf8'));
  const notes = await readFile(path.join(dir, `notes.${READ_VERSION}.md`), 'utf8');
  const sect = (name) => (notes.split(/^## /m).find((s) => s.startsWith(name)) || '');
  const out = {};
  for (const name of ['Scripts', 'Lines']) {
    const quotes = [...sect(name).matchAll(/"([^"]{12,})"/g)].map((m) => m[1]);
    const found = quotes.filter((qt) => t.includes(norm(qt)));
    out[name] = { quoted: quotes.length, wordForWord: found.length, misses: quotes.filter((qt) => !t.includes(norm(qt))).slice(0, 4) };
  }
  return out;
}

const metas = [];
for (const id of VIDEOS) {
  if (process.argv.includes('--cached-only') && !existsSync(path.join(HERE, id, 'transcript.txt'))) { console.log('skipped (no transcript yet)', id); continue; }
  metas.push(await fetchOne(id)); console.log('have', id, metas.at(-1).chars, 'chars', metas.at(-1).captions);
}
if (process.argv.includes('--fetch-only')) process.exit(0);
const results = []; let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < metas.length) {
    const m = metas[next++];
    try { const r = await readOne(m); r.quotes = await checkQuotes(m.id); results.push(r); console.log('read', m.id, `$${r.costUsd?.toFixed(3)}`, `${Math.round(r.wallMs / 1000)}s`, JSON.stringify(r.quotes)); }
    catch (e) { console.log('FAILED', m.id, e.message); }
  }
}));
await writeFile(path.join(HERE, 'stage1-results.json'), JSON.stringify(results, null, 2), 'utf8');
const total = results.reduce((a, r) => a + (r.costUsd || 0), 0); const mins = results.reduce((a, r) => a + r.minutes, 0);
console.log(`TOTAL $${total.toFixed(3)} for ${mins} min of talk = $${(total / (mins / 60)).toFixed(3)} per hour, ${results.length}/${metas.length} read`);

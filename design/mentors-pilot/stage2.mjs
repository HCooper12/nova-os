// Mentors pilot, Stage 2 (weave). Works ONLY in a scratch copy of the vault's Wiki.
// node stage2.mjs [--model sonnet|opus]
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = process.env.VAULT_PATH; // the real vault is only READ (rsync out); nothing is written back
if (!VAULT) throw new Error('set VAULT_PATH');
const STAGE = path.join(HERE, 'vault');
const BEFORE = path.join(HERE, 'vault-before');
const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'sonnet';
if (!['sonnet', 'opus'].includes(MODEL)) throw new Error('weave model must be sonnet or opus');
const WEAVE_VERSION = 'weave-v1';
const IDS = ['cOSEgCFNJcw', 'QvIodMG8tKE', 'V3hvD_7FAK8', 'jC30mx2ozLI', 'J6V3oPNBrac'].filter((id) => existsSync(path.join(HERE, id, 'notes.read-v1.md')));
const N = IDS.length; const WORD = ['zero', 'one', 'two', 'three', 'four', 'five'][N];
const safe = (s) => s.replace(/[:/\\?*"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

// 1. stage: Wiki + CLAUDE.md, read from the real vault, never written back
if (!existsSync(STAGE)) {
  await mkdir(STAGE, { recursive: true });
  execFileSync('rsync', ['-a', '--exclude', '.nova-backups', '--exclude', '.obsidian', `${VAULT}/Wiki`, STAGE]);
  await cp(path.join(VAULT, 'CLAUDE.md'), path.join(STAGE, 'CLAUDE.md'));
  await mkdir(path.join(STAGE, 'Raw'), { recursive: true });
  await mkdir(path.join(STAGE, '_notes'), { recursive: true });
  const sources = [];
  for (const [i, id] of IDS.entries()) {
    const meta = JSON.parse(await readFile(path.join(HERE, id, 'meta.json'), 'utf8'));
    const title = safe(meta.title);
    const transcript = await readFile(path.join(HERE, id, 'transcript.txt'), 'utf8');
    const notes = await readFile(path.join(HERE, id, 'notes.read-v1.md'), 'utf8');
    const d = meta.uploadDate; const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    await writeFile(path.join(STAGE, 'Raw', `${title} (Transcript).md`),
      `Verbatim video transcript fetched by Nova's Watcher, received 2026-11-19.\nSource URL: ${meta.url}\nSource page: [[${title}]]\n\n---\n\n${transcript}\n`, 'utf8');
    await writeFile(path.join(STAGE, '_notes', `S${i + 1} ${id}.md`),
      `SOURCE S${i + 1}\nTitle: ${title}\nChannel: ${meta.channel}\nPublished: ${date}\nMinutes: ${Math.round(meta.durationSec / 60)}\nURL: ${meta.url}\nVideo id: ${id}\nRaw transcript: Raw/${title} (Transcript).md\n\n${notes}\n`, 'utf8');
    sources.push(`S${i + 1} | ${title} | ${date} | ${meta.url} | ${Math.round(meta.durationSec / 60)} min`);
  }
  await writeFile(path.join(HERE, 'sources.txt'), sources.join('\n'), 'utf8');
  await rm(BEFORE, { recursive: true, force: true });
  await cp(STAGE, BEFORE, { recursive: true });
  console.log('staged', STAGE);
}
const sources = await readFile(path.join(HERE, 'sources.txt'), 'utf8');

const prompt = `You are weaving reading notes into a personal knowledge vault (this folder). Read CLAUDE.md first and follow its conventions in batch mode. Work only inside this folder. Never edit anything under Raw/ or _notes/.

THE JOB
The folder _notes/ holds reading notes for ${WORD} videos from Jefferson Fisher's own channel (S1 to S${N}). Their full transcripts are already in Raw/. He is a person the vault's owner has chosen to study closely. Weave ALL of it in. The notes are the only record of these videos: an idea you do not write down is lost.

${sources}

BEFORE YOU WRITE
Read all ${WORD} notes files. Read Wiki/index.md, Wiki/Entities/Jefferson Fisher.md, and Grep Wiki/Concepts, Wiki/Sources and Wiki/Entities for each idea and each person, so you EDIT an existing page instead of creating a near-duplicate. The vault already holds other Fisher sources; link to them where they make the same idea.

WHAT TO WRITE

1. One Source page per video in Wiki/Sources/, named by the title given in its notes file. Frontmatter: type: source; raw: "[[Raw/<title> (Transcript)]]"; url; video_id; show: "The Jefferson Fisher Podcast"; people: a list of every person who SPEAKS; tags; created and updated 2026-11-19. Body: a summary, every idea and framework from its notes with a wikilink to its Concept page, and a "## Linked pages" section.

2. Concept pages in Wiki/Concepts/. One idea, one page. When several of these videos (or an existing vault source) make the same idea, there is ONE page that cites all of them in "sources:" and says what each adds. Every Concept page says who the idea comes from. An idea a guest made belongs to the guest: never file a guest's idea as Fisher's.

3. Entity pages in Wiki/Entities/. Update Jefferson Fisher. Every guest who speaks gets their own page (create it, or edit the existing one): who they are as the source states it, their ideas from the episode with links to the Concept pages, dated facts with a link to the Source page.

4. Playbook chapters in Wiki/Playbooks/. One page per distinct framework or skill (expect 5 to 9). These are applied by agents, so the format is strict and must be followed character for character:

---
type: playbook
triggers:
  - 'two to four word phrase a person would say when they need this'
agents:
  - all
sources:
  - 'S1 | <source title> | <speaker> | <url>'
created: '2026-11-19'
updated: '2026-11-19'
---
# <Topic>

<One sentence: what this playbook is for.>

## When to use it
- bullet
## The method
1. step
## Rules
- rule text (stated, S1 12:34)
- rule text (evidenced, S2 1:02:03; needs: what the listener must have for it to hold)
## Phrases to reuse
- short phrase
## Mistakes to avoid
- bullet
## Where it stops applying
- bullet

Rules for that format: 3 to 8 triggers, lower case, in single quotes. In "sources", number them S1, S2... in the order used ON THAT PAGE (not the S numbers above). Every rule ends with (stated|evidenced, S<n> <time>) using a real [mm:ss] from the notes. "Phrases to reuse" holds only words copied exactly from a Scripts or Lines entry in the notes. No other sections, no blank lines between a heading and its list.

5. The mentor book: Wiki/Mentors/Jefferson Fisher.md. This is the document the owner opens to revise. Use exactly this structure:

---
type: mentor
person: "[[Jefferson Fisher]]"
sources_read: ${N}
created: '2026-11-19'
updated: '2026-11-19'
---
# Jefferson Fisher

## At a glance
<Three sentences: who he is and what he teaches, from these sources only.>

### Core principles
- **<Name>.** <One sentence.> (S<n> mm:ss)
(5 to 8 of them, the ideas he returns to most across the ${WORD} videos; say "in 2 of ${N}" style counts when an idea recurs)

## Chapters
(one per playbook chapter you wrote, in a sensible learning order)
### <Chapter title>
Playbook: [[Playbooks/<Topic>]]
Summary: <two sentences>
Takeaways:
- <three bullets, each one sentence>
Diagram:
shape: <steps | cycle | ladder | versus | matrix | funnel | single>
title: <short>
nodes:
  - <label> | <one short line of detail>
Clip: S<n> mm:ss | <what he says or shows in that minute, one line>

(Diagram node rules. steps, cycle, ladder, funnel: 3 to 6 nodes in order. versus: nodes are "<left> | <right>" pairs, with the first node naming the two columns. matrix: first two nodes name the two axes, then four cells. single: one node. Pick the shape that is TRUE to the idea; use single when nothing else fits.)

## Scripts
(every Scripts entry from the notes worth keeping, exact words only)
- Situation: ... | Say: "..." | Instead of: "..." | S<n> mm:ss

## Revision cards
(10 to 15, for spaced recall)
- Q: <question> | A: <answer in one sentence> | S<n> mm:ss

## What he took from his guests
- [[<Guest>]]: <the idea, and how Fisher responded to it> (S<n> mm:ss)

## Sources
- S1 | <title> | <date> | <url> | <minutes> min
(S1 to S${N} exactly as listed at the top of this prompt)

## Books
- <title> | <year if a source states it, else "year not stated"> | file: not held

6. Update Wiki/index.md and append an entry to Wiki/log.md as CLAUDE.md requires.

HONESTY
Exact words appear only where copied from a Scripts or Lines entry in the notes. Every time mark comes from the notes. Do not add knowledge from outside the notes and the vault. Where the notes say "unclear" about a speaker, keep it unclear.

When done, reply with a short plain list: pages created, pages edited, and anything in the notes you could NOT place.`;

const t0 = Date.now();
const out = await new Promise((resolve, reject) => {
  const c = spawn('claude', ['-p', '--model', MODEL, '--effort', 'high', '--tools', 'Read,Write,Edit,Glob,Grep', '--permission-mode', 'acceptEdits',
    '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json'], { cwd: STAGE, stdio: ['pipe', 'pipe', 'pipe'] });
  let o = ''; let e = '';
  c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { e += d; });
  c.on('error', reject);
  c.on('close', (code) => (o ? resolve(o) : reject(new Error(`claude exited ${code}: ${e.slice(-500)}`))));
  c.stdin.end(prompt);
});
const env = JSON.parse(out);
const rec = { version: WEAVE_VERSION, model: MODEL, models: Object.keys(env.modelUsage || {}), costUsd: env.total_cost_usd, wallMs: Date.now() - t0, turns: env.num_turns, isError: env.is_error, usage: env.usage };
await writeFile(path.join(HERE, `stage2-${MODEL}.json`), JSON.stringify(rec, null, 2), 'utf8');
await writeFile(path.join(HERE, `stage2-${MODEL}-report.md`), String(env.result || ''), 'utf8');
console.log(`weave ${MODEL}: $${rec.costUsd?.toFixed(2)} in ${Math.round(rec.wallMs / 60000)} min, ${rec.turns} turns, error=${rec.isError}`);

// what changed, by plain file comparison
async function walk(dir, base = dir, acc = {}) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, base, acc); else if (e.name.endsWith('.md')) acc[path.relative(base, p)] = await readFile(p, 'utf8');
  }
  return acc;
}
const a = await walk(BEFORE); const b = await walk(STAGE);
const created = Object.keys(b).filter((k) => !(k in a)); const edited = Object.keys(b).filter((k) => k in a && a[k] !== b[k]); const gone = Object.keys(a).filter((k) => !(k in b));
await writeFile(path.join(HERE, `stage2-${MODEL}-changes.json`), JSON.stringify({ created, edited, gone }, null, 2), 'utf8');
console.log('created', created.length, 'edited', edited.length, 'deleted', gone.length);
console.log(created.join('\n'));
console.log('EDITED\n' + edited.join('\n'));
if (gone.length) console.log('DELETED (should be none)\n' + gone.join('\n'));

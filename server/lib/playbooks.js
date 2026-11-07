import { readFile, writeFile, mkdir, readdir, unlink, appendFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFile } from './backup.js';
import { hashOf, fileTitle, slugOf } from './practice.js';
import { localDateISO } from './localDate.js';

// PLAYBOOKS: a video or a podcast turned into a page of method and rules that
// the matching agents then APPLY (his ask, 7 Nov 2026, off a reel: "watch this,
// learn what it teaches, and turn it into a skill I can use forever").
//
// Watching already files Sources and Concepts, but nothing it filed changed how
// an agent did a task. A playbook does. Three parts, kept apart on purpose:
//   - the PAGE (Wiki/Playbooks/<Topic>.md) is knowledge and lives in the vault.
//     His to edit. Nothing here is a verbatim transcript: rules are paraphrased
//     and each points at a source and a timestamp.
//   - the MATCH is code: trigger words, no model, no vault scan per turn (a
//     cached index), at most two playbooks per turn.
//   - the LOG (server/data/playbooks/applied.jsonl) is operational: every turn
//     a playbook was put in front of an agent. That is the proof it is used.
//
// Format contract (change every reader and writer, or none). A parse -> format
// round trip of any page formatPlaybook wrote is byte-identical (pinned by test).
//
//   ---
//   type: playbook
//   triggers:
//     - 'sales follow up'
//   agents:
//     - all
//   sources:
//     - 'S1 | Title | Speaker | https://…'
//   created: 'YYYY-MM-DD'
//   updated: 'YYYY-MM-DD'
//   ---
//   # Topic
//
//   One sentence: what this playbook is for.
//
//   ## When to use it
//   - bullet
//   ## The method
//   1. step
//   ## Rules
//   - rule text (stated, S1 12:34)
//   - rule text (evidenced, S2 1:02:03; needs: the speaker's scale)
//   ## Phrases to reuse
//   - short phrase
//   ## Mistakes to avoid
//   - bullet
//   ## Where it stops applying
//   - bullet
//   ## Where sources disagree      (only when they do)
//   - bullet

export const PLAYBOOKS_DIR = 'Wiki/Playbooks';
export const AGENT_IDS = ['nova', 'coach', 'studio'];
// the most that goes into one turn, in characters: two playbooks share it
export const BLOCK_CHARS = 3200;
export const MAX_MATCHES = 2;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
export const appliedLogPath = () => path.join(dataRoot(), 'playbooks', 'applied.jsonl');

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
function unq(v) {
  const s = String(v ?? '').trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s.replace(/\s+#.*$/, '').trim();
}

/* -------------------------------- the page -------------------------------- */

const FM_RE = /^---\n([\s\S]*?)\n---(?:\n|(?![\s\S]))/;
const RULE_RE = /^- (.+) \((stated|evidenced), S(\d+) (\d+:\d{2}(?::\d{2})?)(?:; needs: (.+))?\)\s*$/;
const SOURCE_RE = /^S(\d+) \| (.*?) \| (.*?) \| (\S*)\s*$/;

const SECTIONS = [
  ['when', 'When to use it'], ['method', 'The method'], ['rules', 'Rules'],
  ['phrases', 'Phrases to reuse'], ['mistakes', 'Mistakes to avoid'], ['stops', 'Where it stops applying'],
  ['disagreements', 'Where sources disagree'],
];

export function emptyPlaybook() {
  return {
    type: 'playbook', title: '', summary: '', triggers: [], agents: ['all'], sources: [],
    created: null, updated: null,
    when: [], method: [], rules: [], phrases: [], mistakes: [], stops: [], disagreements: [],
  };
}

export function parsePlaybook(raw) {
  const text = String(raw || '');
  const pb = emptyPlaybook();
  pb.type = '';
  const fm = text.match(FM_RE);
  let body = text;
  if (fm) {
    body = text.slice(fm[0].length);
    let key = null;
    for (const line of fm[1].split('\n')) {
      const item = line.match(/^\s+-\s+(.*)$/);
      if (item && key) {
        const v = unq(item[1]);
        if (key === 'triggers') pb.triggers.push(v);
        else if (key === 'agents') pb.agents.push(v);
        else if (key === 'sources') {
          const m = v.match(SOURCE_RE);
          if (m) pb.sources.push({ n: Number(m[1]), title: m[2], speaker: m[3], url: m[4] });
        }
        continue;
      }
      const kv = line.match(/^([A-Za-z_]+):[ \t]*(.*)$/);
      if (!kv) continue;
      key = kv[1];
      const v = unq(kv[2]);
      if (key === 'type') pb.type = v;
      else if (key === 'created') pb.created = v || null;
      else if (key === 'updated') pb.updated = v || null;
      else if (key === 'agents') pb.agents = [];
    }
  }
  if (!pb.agents.length) pb.agents = ['all'];
  const h1 = body.match(/^# (.+?)\s*$/m);
  if (h1) pb.title = h1[1].trim();
  // the sentence between the title and the first section
  const afterH1 = h1 ? body.slice(h1.index + h1[0].length) : body;
  const firstH2 = afterH1.search(/^## /m);
  pb.summary = one(firstH2 === -1 ? afterH1 : afterH1.slice(0, firstH2));
  const parts = afterH1.split(/^## (.+?)[ \t]*$/m); // [pre, name, body, name, body…]
  for (let i = 1; i < parts.length; i += 2) {
    const sec = SECTIONS.find(([, name]) => name.toLowerCase() === parts[i].trim().toLowerCase());
    if (!sec) continue;
    const key = sec[0];
    for (const line of parts[i + 1].split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (key === 'rules') {
        const m = t.match(RULE_RE);
        if (m) pb.rules.push({ text: m[1].trim(), kind: m[2], source: Number(m[3]), at: m[4], ...(m[5] ? { needs: m[5].trim() } : {}) });
        else if (/^- /.test(t)) pb.rules.push({ text: t.slice(2).trim(), kind: 'stated', source: 0, at: '' }); // his own rule, no source
        continue;
      }
      const b = t.match(/^(?:- |\d+\.\s+)(.*)$/);
      if (b && b[1].trim()) pb[key].push(b[1].trim());
    }
  }
  return pb;
}

// a pipe in a title or a speaker would break the source line's fields
const pipeFree = (s) => one(s).replace(/\s*\|\s*/g, ' / ');
const list = (a) => a.map((x) => `- ${one(x)}`).join('\n');

export function formatRule(r) {
  if (!r.source) return `- ${one(r.text)}`; // a rule he added himself carries no source
  const need = r.needs ? `; needs: ${one(r.needs)}` : '';
  return `- ${one(r.text)} (${r.kind === 'evidenced' ? 'evidenced' : 'stated'}, S${r.source} ${r.at}${need})`;
}

export function formatPlaybook(pb) {
  const fm = [
    '---', 'type: playbook',
    'triggers:', ...pb.triggers.map((t) => `  - ${q(one(t))}`),
    'agents:', ...(pb.agents.length ? pb.agents : ['all']).map((a) => `  - ${one(a)}`),
    'sources:', ...pb.sources.map((s) => `  - ${q(`S${s.n} | ${pipeFree(s.title)} | ${pipeFree(s.speaker)} | ${one(s.url)}`)}`),
    `created: ${q(pb.created || '')}`, `updated: ${q(pb.updated || '')}`, '---',
  ];
  const out = [fm.join('\n'), `# ${one(pb.title)}`, '', one(pb.summary), ''];
  for (const [key, name] of SECTIONS) {
    const items = pb[key] || [];
    if (key === 'disagreements' && !items.length) continue;
    out.push(`## ${name}`);
    if (key === 'method') out.push(...items.map((m, i) => `${i + 1}. ${one(m)}`));
    else if (key === 'rules') out.push(...items.map(formatRule));
    else if (items.length) out.push(list(items));
    out.push('');
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/* -------------------------------- the library ----------------------------- */

export async function listPlaybooks(vaultPath) {
  const dir = path.join(vaultPath, PLAYBOOKS_DIR);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort(); } catch { return []; }
  const out = [];
  const seen = new Set();
  for (const f of files) {
    let raw;
    try { raw = await readFile(path.join(dir, f), 'utf8'); } catch { continue; }
    const pb = parsePlaybook(raw);
    if (pb.type && pb.type !== 'playbook') continue;
    if (!pb.title) pb.title = f.replace(/\.md$/, '');
    const slug = slugOf(pb.title);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ ...pb, slug, relPath: `${PLAYBOOKS_DIR}/${f}`, hash: hashOf(raw) });
  }
  return out;
}

export async function readPlaybook(vaultPath, slug) {
  if (!slug) return null;
  return (await listPlaybooks(vaultPath)).find((p) => p.slug === slug) || null;
}

/* ------------------------------ merging a learn --------------------------- */

const normText = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const addNew = (have, extra) => {
  const seen = new Set(have.map(normText));
  return [...have, ...extra.filter((x) => { const k = normText(x); if (!k || seen.has(k)) return false; seen.add(k); return true; })];
};

// `incoming.sources` are numbered from 1 within the learn; `incoming.rules`
// point at them. Merged into an existing page they take the next free numbers
// (or a page's existing number when the same link is already a source), and
// every prior source, rule and edit of his stays.
export function mergePlaybook(existing, incoming, { now = new Date() } = {}) {
  const today = localDateISO(now);
  if (!existing) {
    return { ...emptyPlaybook(), ...incoming, created: today, updated: today, agents: incoming.agents?.length ? incoming.agents : ['all'] };
  }
  const sources = [...existing.sources];
  const remap = new Map();
  for (const s of incoming.sources) {
    const same = s.url && sources.find((x) => x.url === s.url);
    if (same) { remap.set(s.n, same.n); continue; }
    const n = Math.max(0, ...sources.map((x) => x.n)) + 1;
    sources.push({ ...s, n });
    remap.set(s.n, n);
  }
  const haveRule = new Set(existing.rules.map((r) => normText(r.text)));
  const newRules = incoming.rules
    .filter((r) => !haveRule.has(normText(r.text)))
    .map((r) => ({ ...r, source: remap.get(r.source) ?? r.source }));
  return {
    ...existing,
    title: existing.title || incoming.title,
    summary: existing.summary || incoming.summary,
    triggers: addNew(existing.triggers, incoming.triggers || []),
    agents: existing.agents,
    sources,
    created: existing.created || today,
    updated: today,
    when: addNew(existing.when, incoming.when || []),
    method: addNew(existing.method, incoming.method || []),
    rules: [...existing.rules, ...newRules],
    phrases: addNew(existing.phrases, incoming.phrases || []),
    mistakes: addNew(existing.mistakes, incoming.mistakes || []),
    stops: addNew(existing.stops, incoming.stops || []),
    disagreements: addNew(existing.disagreements, incoming.disagreements || []),
  };
}

/* --------------------------------- writing -------------------------------- */

const fullFor = (vaultPath, relPath) => {
  const full = path.resolve(vaultPath, relPath);
  if (!full.startsWith(path.resolve(vaultPath, PLAYBOOKS_DIR) + path.sep)) throw new Error('that is not a playbook page');
  return full;
};

// Where a topic's page goes, and whether one is there already.
export async function findPlaybookFor(vaultPath, title) {
  const slug = slugOf(title);
  const hit = (await listPlaybooks(vaultPath)).find((p) => p.slug === slug);
  if (hit) return hit;
  const rel = `${PLAYBOOKS_DIR}/${fileTitle(title)}.md`;
  if (existsSync(path.join(vaultPath, rel))) {
    const raw = await readFile(path.join(vaultPath, rel), 'utf8');
    return { ...parsePlaybook(raw), title: parsePlaybook(raw).title || title, relPath: rel, slug };
  }
  return null;
}

export async function writePlaybookPage(vaultPath, incoming, { now = new Date() } = {}) {
  const existing = await findPlaybookFor(vaultPath, incoming.title);
  const merged = mergePlaybook(existing, incoming, { now });
  const content = formatPlaybook(merged);
  const rel = existing ? existing.relPath : `${PLAYBOOKS_DIR}/${fileTitle(merged.title)}.md`;
  const full = fullFor(vaultPath, rel);
  let prior = null;
  if (existing) {
    prior = await readFile(full, 'utf8');
    await backupFile(full);
  } else {
    await mkdir(path.dirname(full), { recursive: true });
  }
  await writeFile(full, content, 'utf8');
  dropPlaybookCache();
  return { relPath: rel, hash: hashOf(content), created: !existing, content, ...(existing ? { prior } : {}) };
}

export async function undoPlaybook(vaultPath, undo = {}) {
  const full = fullFor(vaultPath, undo.relPath);
  if (!existsSync(full)) return 'the playbook page was already gone';
  const raw = await readFile(full, 'utf8');
  if (hashOf(raw) !== undo.hash) {
    throw new Error('the playbook page has been edited since filing, so it was left in place. Change it in Obsidian if you still want it gone');
  }
  await backupFile(full);
  dropPlaybookCache();
  if (typeof undo.prior === 'string') {
    await writeFile(full, undo.prior, 'utf8');
    return 'put the playbook page back as it was before this learn';
  }
  await unlink(full);
  return 'deleted the playbook page';
}

/* ----------------------------- matching a turn ---------------------------- */

// light stemming so "follow-ups" meets "follow up" and "emailing" meets "email"
const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, (m, off) => (off >= 3 ? '' : m));
const tokens = (s) => normText(s).split(' ').filter(Boolean).map(stem);

let cache = null; // { vault, at, mtime, items }
const CACHE_MS = 60_000;
export function dropPlaybookCache() { cache = null; }

function dirMtime(dir) { try { return statSync(dir).mtimeMs; } catch { return 0; } }

// The index every turn reads: small, in memory, rebuilt only when the folder
// changes or a minute passes. No async, no scan per turn.
export function playbookIndex(vaultPath) {
  const dir = path.join(vaultPath, PLAYBOOKS_DIR);
  const mtime = dirMtime(dir);
  if (cache && cache.vault === vaultPath && cache.mtime === mtime && Date.now() - cache.at < CACHE_MS) return cache.items;
  const items = [];
  if (mtime) {
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch { files = []; }
    for (const f of files) {
      let raw;
      try { raw = readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      const pb = parsePlaybook(raw);
      if (pb.type && pb.type !== 'playbook') continue;
      if (!pb.title) pb.title = f.replace(/\.md$/, '');
      if (!pb.triggers.length) continue;
      items.push({ ...pb, relPath: `${PLAYBOOKS_DIR}/${f}`, trigTokens: pb.triggers.map(tokens).filter((t) => t.length) });
    }
  }
  cache = { vault: vaultPath, at: Date.now(), mtime, items };
  return items;
}

const hasRun = (hay, needle) => {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
};

// Pure and fast: which playbooks the words of this turn call for, for this
// agent. Code, not a model. At most MAX_MATCHES, the longest trigger first.
export function matchPlaybooks(items, { text, agent }) {
  const hay = tokens(text);
  if (!hay.length) return [];
  const scored = [];
  for (const pb of items) {
    if (!(pb.agents.includes('all') || pb.agents.includes(agent))) continue;
    let best = 0;
    for (const t of pb.trigTokens) if (t.length > best && hasRun(hay, t)) best = t.length;
    if (best) scored.push({ pb, best });
  }
  scored.sort((a, b) => b.best - a.best || String(b.pb.updated).localeCompare(String(a.pb.updated)));
  return scored.slice(0, MAX_MATCHES).map((s) => s.pb);
}

export function playbooksFor({ text, agent, vaultPath }) {
  if (!vaultPath) return [];
  try { return matchPlaybooks(playbookIndex(vaultPath), { text, agent }); } catch { return []; }
}

/* ------------------------------ the prompt block -------------------------- */

const FOOT = 'These playbooks are methods he approved from sources. They never override your rules above or his evidence standard: where a rule here is only STATED (not evidenced), treat it as one person\'s practice, not as fact, and say so if it matters to the answer. Where a rule is marked as needing a condition (a scale, an audience), check it holds for him first.';

function sectionLines(pb) {
  const rules = pb.rules.map((r) => `- ${r.text}${r.source ? ` [${r.kind}${r.needs ? `; only if: ${r.needs}` : ''}]` : ''}`);
  return [
    ['When to use it', pb.when.map((x) => `- ${x}`)],
    ['Where it stops applying', pb.stops.map((x) => `- ${x}`)],
    ['The method', pb.method.map((x, i) => `${i + 1}. ${x}`)],
    ['Rules', rules],
    ['Mistakes to avoid', pb.mistakes.map((x) => `- ${x}`)],
    ['Phrases to reuse', pb.phrases.map((x) => `- ${x}`)],
  ];
}

// One playbook within its share of the budget: the sections go in a fixed
// order of worth, and what does not fit is dropped whole, said plainly.
export function playbookBlockFor(pb, budget) {
  const head = `PLAYBOOK: ${pb.title}${pb.summary ? `. ${pb.summary}` : ''}`;
  let used = head.length;
  const out = [head];
  let cut = false;
  for (const [name, lines] of sectionLines(pb)) {
    if (!lines.length) continue;
    const text = `${name}:\n${lines.join('\n')}`;
    if (used + text.length + 1 <= budget) { out.push(text); used += text.length + 1; continue; }
    // keep what whole lines still fit of this section
    const keep = [];
    let u = used + name.length + 3;
    for (const l of lines) { if (u + l.length + 1 > budget) break; keep.push(l); u += l.length + 1; }
    if (keep.length) { out.push(`${name}:\n${keep.join('\n')}`); used = u; }
    cut = true;
  }
  if (cut) out.push(`(Trimmed to fit. The whole page is ${pb.relPath}.)`);
  return out.join('\n');
}

// Coach answers to his program, his logged history and the evidence standard
// first. A playbook learned from a video never outranks them.
const COACH_FOOT = 'You are the Coach: his program, his logged history, the injuries on record and the evidence standard in your instructions come first. If a rule here conflicts with any of them, follow them and say that you did. A method from a video is one person\'s practice until the evidence says otherwise.';

export function playbookBlock(matched, { agent = null } = {}) {
  if (!matched.length) return '';
  const each = Math.floor(BLOCK_CHARS / matched.length);
  const foot = agent === 'coach' ? `${FOOT} ${COACH_FOOT}` : FOOT;
  return `[PLAYBOOKS TO APPLY THIS TURN. Hayden approved these methods for this kind of task. Apply them to what he asked.\n\n${matched.map((m) => playbookBlockFor(m, each)).join('\n\n')}\n\n${foot}]`;
}

/* --------------------------------- the log -------------------------------- */

export function logApplied(matched, { agent, turnId = null, now = new Date() } = {}) {
  if (!matched.length) return;
  const lines = matched.map((m) => JSON.stringify({ date: localDateISO(now), at: now.toISOString(), playbook: m.title, agent, turnId })).join('\n');
  mkdir(path.dirname(appliedLogPath()), { recursive: true })
    .then(() => appendFile(appliedLogPath(), `${lines}\n`, 'utf8'))
    .catch(() => {}); // the log never fails a turn
}

// One call for a turn: what to put in the prompt, and the line that says so.
// `turnId` is the job id the reply will carry.
export function playbookTurn({ text, agent, vaultPath, turnId = null }) {
  const matched = playbooksFor({ text, agent, vaultPath });
  if (!matched.length) return { block: '', titles: [], matched };
  logApplied(matched, { agent, turnId });
  return { block: playbookBlock(matched, { agent }), titles: matched.map((m) => m.title), matched };
}

// The authorship line: "using: Sales follow-ups". Set on the job so the
// reply's result carries it whichever path settles it. Chains any status
// accessor already on the job (the same pattern as askDispatch labelRouted).
export function labelPlaybooks(job, titles) {
  if (!job || !titles?.length) return;
  const line = `using: ${titles.join(', ')}`;
  const prior = Object.getOwnPropertyDescriptor(job, 'status');
  let status = job.status;
  Object.defineProperty(job, 'status', {
    enumerable: true,
    configurable: true,
    get: () => (prior?.get ? prior.get() : status),
    set: (v) => {
      if (v === 'ready' && job.result && typeof job.result === 'object' && job.result.text) job.result = { ...job.result, usedPlaybooks: titles, playbookLine: line };
      if (prior?.set) prior.set(v); else status = v;
    },
  });
}

// What the log says, for the second-brain audit: uses per playbook.
export async function appliedSummary({ since = null } = {}) {
  let raw = '';
  try { raw = await readFile(appliedLogPath(), 'utf8'); } catch { return { total: 0, byPlaybook: {} }; }
  const byPlaybook = {};
  let total = 0;
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    let r; try { r = JSON.parse(l); } catch { continue; }
    if (since && r.date < since) continue;
    total++;
    const b = (byPlaybook[r.playbook] ||= { uses: 0, agents: {}, last: null });
    b.uses++;
    b.agents[r.agent] = (b.agents[r.agent] || 0) + 1;
    if (!b.last || r.date > b.last) b.last = r.date;
  }
  return { total, byPlaybook };
}

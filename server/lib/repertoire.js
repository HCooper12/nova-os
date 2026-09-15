import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableSchedule } from './spacing.js';
import { backupFile } from './backup.js';

// THE REPERTOIRE — the techniques he is actually learning to perform.
//
// His ask, 15 Sep, off a Mentalist reel: analyse this, research the others
// like it, build a plan, and put ONE in front of me a day that I can develop
// and use. So this is not a reading list. It is a curriculum with a drill
// attached, and the unit of progress is "I tried it", not "I saw it".
//
// TWO STORES, ON PURPOSE, matching librarySpacing's reasoning exactly:
//   - the CATALOGUE is knowledge and lives in the vault, one page he can edit
//     in Obsidian like any other (the format contract below is the seam);
//   - the SCHEDULE is operational bookkeeping and lives in server/data, so
//     Nova is not rewriting a page he owns every morning for a field only it
//     reads. Rebuilding server/data resets the spacing, which costs nothing
//     real: everything simply becomes due again.
//
// Format contract — change every reader and writer, or none:
//   ## Family
//   ### Technique name
//   One line on what it is.
//   - **Move:** the mechanism, in a sentence
//   - **Drill:** what to actually do today
//   - **Tell:** how you know it landed
//   - **Source:** where it comes from

export const REPERTOIRE_REL = 'Wiki/Library/Repertoire.md';
export const LOG_REL = 'Wiki/Library/Repertoire Log.md';

const HEADER = `# Repertoire

Techniques Nova is teaching one a day — what each one is, the move behind it,
and a drill small enough to actually run today. Built from sources you sent it;
safe to edit here, Nova reads this page as the source of truth.

Format: \`## Family\`, then \`### Technique\`, a one-line summary, then
**Move** / **Drill** / **Tell** / **Source** bullets.
`;

const LOG_HEADER = `# Repertoire Log

Every technique you practised, and how it went. Nova appends here; newest first.
`;

const FIELDS = ['move', 'drill', 'tell', 'source'];
const FIELD_RE = /^- \*\*(Move|Drill|Tell|Source):\*\*\s*(.+?)\s*$/i;

/* ------------------------------- the page -------------------------------- */

export function slugFor(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function parseRepertoire(raw) {
  const families = [];
  let family = null;
  let tech = null;
  for (const line of String(raw || '').split('\n')) {
    const fam = line.match(/^##\s+(?!#)(.+?)\s*$/);
    if (fam) { family = { name: fam[1].trim(), techniques: [] }; families.push(family); tech = null; continue; }
    const t = line.match(/^###\s+(.+?)\s*$/);
    if (t) {
      if (!family) { family = { name: 'Unfiled', techniques: [] }; families.push(family); }
      tech = { id: slugFor(t[1]), name: t[1].trim(), summary: '', move: '', drill: '', tell: '', source: '' };
      family.techniques.push(tech);
      continue;
    }
    if (!tech) continue;
    const f = line.match(FIELD_RE);
    if (f) { tech[f[1].toLowerCase()] = f[2].trim(); continue; }
    // the first ordinary prose line under the heading is the summary; later
    // ones are ignored rather than concatenated, so a hand-written paragraph
    // in Obsidian cannot silently become a 400-character card
    if (!tech.summary && line.trim() && !line.startsWith('-')) tech.summary = line.trim();
  }
  return families.filter((f) => f.techniques.length);
}

export function formatTechnique(t) {
  const lines = [`### ${String(t.name).trim()}`];
  if (t.summary) lines.push(String(t.summary).trim());
  for (const f of FIELDS) {
    if (t[f]) lines.push(`- **${f[0].toUpperCase()}${f.slice(1)}:** ${String(t[f]).trim()}`);
  }
  return lines.join('\n');
}

export function formatRepertoire(families) {
  const body = families
    .filter((f) => f.techniques?.length)
    .map((f) => `## ${String(f.name).trim()}\n\n${f.techniques.map(formatTechnique).join('\n\n')}`)
    .join('\n\n');
  return `${HEADER}\n${body}\n`;
}

function repPath(vaultPath) { return path.join(vaultPath, REPERTOIRE_REL); }

export async function loadRepertoire(vaultPath) {
  const full = repPath(vaultPath);
  if (!existsSync(full)) return [];
  return parseRepertoire(await readFile(full, 'utf8'));
}

// Flat, in page order, each technique carrying its family. Page order IS
// curriculum order — the lane writes it deliberately (foundations first), and
// re-ordering the page in Obsidian re-orders what he is taught next.
export function flatten(families = []) {
  const out = [];
  const seen = new Set();
  for (const f of families) {
    for (const t of f.techniques || []) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ ...t, family: f.name });
    }
  }
  return out;
}

// Merge new techniques into the page WITHOUT clobbering his edits: an id that
// already exists is left exactly as he has it. The lane can therefore be run
// twice on related sources and only ever adds.
export async function addTechniques(vaultPath, incoming = []) {
  const full = repPath(vaultPath);
  const existing = existsSync(full) ? parseRepertoire(await readFile(full, 'utf8')) : [];
  const have = new Set(flatten(existing).map((t) => t.id));
  const byFamily = new Map(existing.map((f) => [f.name, f]));
  const added = [];
  for (const t of incoming) {
    const id = slugFor(t.name);
    if (!id || have.has(id)) continue;
    have.add(id);
    const famName = String(t.family || 'Unfiled').trim();
    if (!byFamily.has(famName)) {
      const fam = { name: famName, techniques: [] };
      byFamily.set(famName, fam);
      existing.push(fam);
    }
    const rec = { id, name: String(t.name).trim(), summary: t.summary || '', move: t.move || '', drill: t.drill || '', tell: t.tell || '', source: t.source || '' };
    byFamily.get(famName).techniques.push(rec);
    added.push(rec);
  }
  if (!added.length) return { added: [], total: flatten(existing).length };
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  await writeFile(full, formatRepertoire(existing), 'utf8');
  return { added, total: flatten(existing).length };
}

// The undo half of addTechniques: takes back exactly the ids that filing
// added, and nothing else. A family emptied by the removal goes with it, so
// undo leaves the page as it found it rather than littered with bare
// headings. Techniques he has since edited are still removed — it is his undo
// of his own approval — but the backup taken here is the way back.
export async function removeTechniques(vaultPath, ids = []) {
  const full = repPath(vaultPath);
  if (!existsSync(full) || !ids.length) return { removed: 0 };
  const families = parseRepertoire(await readFile(full, 'utf8'));
  const drop = new Set(ids);
  let removed = 0;
  for (const f of families) {
    const before = f.techniques.length;
    f.techniques = f.techniques.filter((t) => !drop.has(t.id));
    removed += before - f.techniques.length;
  }
  if (!removed) return { removed: 0 };
  await backupFile(full);
  await writeFile(full, formatRepertoire(families.filter((f) => f.techniques.length)), 'utf8');
  return { removed };
}

/* -------------------------------- spacing -------------------------------- */
//
// Widening gaps, driven by times TRIED and never by times shown. That is the
// difference between this and the Library's shelf: exposure is not practice,
// so a technique surfaced three times and never once attempted keeps coming
// back at the short interval instead of quietly graduating away from him.
export const REVIEW_INTERVALS = [2, 5, 12, 30];
export const SCHEDULE = tableSchedule(REVIEW_INTERVALS); // pinned beside the Library's and the Leader's in twins.test.js
export const intervalFor = (tried) => SCHEDULE(tried);

// Every third day is a review day. Deterministic on purpose: a curriculum that
// re-rolls its mix on each render is not a curriculum, and Home and the spoken
// brief MUST name the same technique — they both read this one function.
export const REVIEW_EVERY = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'repertoire.json');

// DAY ARITHMETIC, NOT INSTANT ARITHMETIC. This curriculum runs on his local
// days — "shown on the 13th, due again on the 15th" — and the first draft
// compared a local noon against UTC stamps, which in AEST (+10) put a
// technique's due moment six hours into the future of the day it was due and
// silently skipped every review. Worse, a surfacing recorded as local 08:00
// serialised to the PREVIOUS UTC date, so the schedule was reading the wrong
// day entirely. Both faults vanish by comparing at the resolution we display:
// whole calendar days, as strings, never crossing a timezone on the way.
export function daysBetween(fromISO, toISO) {
  const a = Date.parse(`${String(fromISO).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toISO).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

export function shiftDate(dateISO, days) {
  const t = Date.parse(`${String(dateISO).slice(0, 10)}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export async function readState() {
  if (!existsSync(STATE_PATH())) return { techniques: {}, days: {} };
  try {
    const raw = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    return { techniques: raw.techniques || {}, days: raw.days || {} };
  } catch { return { techniques: {}, days: {} }; }
}

export async function writeState(state) {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(STATE_PATH(), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

/* -------------------------------- the pick ------------------------------- */

// PURE. Given the curriculum, the state and the date, which ONE technique is
// today's — and is it new work or a return? Exported separately from the IO so
// the whole rota can be tested without touching disk.
//
// Order of decision:
//   1. a day already served keeps its answer forever (he may open Home twice);
//   2. every REVIEW_EVERY-th served day is a review, if anything is genuinely
//      due — most overdue first;
//   3. otherwise the next untaught technique, in page order;
//   4. when the curriculum is exhausted, every day is a review — the most
//      overdue, due or not, because "nothing today" helps nobody;
//   5. an empty catalogue returns null and the surfaces say so honestly.
export function pickForDay(techniques = [], state = {}, dateISO, { reviewEvery = REVIEW_EVERY } = {}) {
  const days = state.days || {};
  const settled = days[dateISO];
  if (settled?.id) {
    const found = techniques.find((t) => t.id === settled.id);
    if (found) return { technique: found, mode: settled.mode === 'review' ? 'review' : 'new', why: settled.why || null, settled: true };
  }
  if (!techniques.length) return null;

  const st = state.techniques || {};
  const lastOn = (t) => st[t.id]?.lastSurfacedOn || String(st[t.id]?.lastSurfacedAt || '').slice(0, 10) || null;
  const untaught = techniques.filter((t) => !lastOn(t));
  const taught = techniques.filter((t) => lastOn(t));

  // whole days late: elapsed days minus the gap his practice count has earned
  const overdueBy = (t) => daysBetween(lastOn(t), dateISO) - SCHEDULE(Number(st[t.id]?.tried) || 0);
  const reviews = taught
    .map((t) => ({ t, over: overdueBy(t) }))
    .sort((a, b) => b.over - a.over || String(a.t.id).localeCompare(String(b.t.id)));

  const servedCount = Object.keys(days).length;
  const isReviewDay = reviewEvery > 0 && servedCount > 0 && (servedCount + 1) % reviewEvery === 0;

  const due = reviews.filter((r) => r.over >= 0);
  if (isReviewDay && due.length) {
    return { technique: due[0].t, mode: 'review', why: `due again — ${practisedPhrase(st[due[0].t.id])}` };
  }
  if (untaught.length) return { technique: untaught[0], mode: 'new', why: null };
  if (reviews.length) {
    const top = reviews[0];
    return { technique: top.t, mode: 'review', why: `the whole catalogue is taught — ${practisedPhrase(st[top.t.id])}` };
  }
  return null;
}

function practisedPhrase(s = {}) {
  const tried = Number(s.tried) || 0;
  if (!tried) return 'shown before, never tried';
  return `practised ${tried} time${tried === 1 ? '' : 's'}`;
}

/* ---------------------------------- IO ----------------------------------- */

// Today's technique, stable: the first call on a given date RECORDS the pick,
// so every later reader — Home, the brief, the API — is handed the same one.
export async function techniqueForDay(vaultPath, dateISO, { record = true } = {}) {
  const techniques = flatten(await loadRepertoire(vaultPath));
  const state = await readState();
  const pick = pickForDay(techniques, state, dateISO);
  if (!pick) return null;
  if (record && !pick.settled) {
    state.days[dateISO] = { id: pick.technique.id, mode: pick.mode, why: pick.why || null, outcome: null };
    const prev = state.techniques[pick.technique.id] || {};
    state.techniques[pick.technique.id] = {
      ...prev,
      seen: (Number(prev.seen) || 0) + 1,
      tried: Number(prev.tried) || 0,
      skipped: Number(prev.skipped) || 0,
      // the LOCAL day it was served, as a date string — the schedule reads
      // this; the instant below is only a receipt for a human reading the file
      lastSurfacedOn: dateISO,
      lastSurfacedAt: new Date().toISOString(),
    };
    await writeState(state).catch(() => {});
  }
  const s = state.techniques[pick.technique.id] || {};
  return {
    ...pick,
    outcome: state.days[dateISO]?.outcome || null,
    tried: Number(s.tried) || 0,
    streak: computeStreak(state, dateISO),
    position: techniques.findIndex((t) => t.id === pick.technique.id) + 1,
    total: techniques.length,
  };
}

// Consecutive days, counting back from today, on which he actually tried the
// technique. A day he has not answered yet does not break it; a "not today"
// does — an honest streak has to be breakable or it means nothing.
export function computeStreak(state = {}, dateISO) {
  const days = state.days || {};
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const day = days[shiftDate(dateISO, -i)];
    if (day?.outcome === 'tried') streak += 1;
    else if (day?.outcome === 'skipped') break;
    else if (i > 0) break; // an unanswered past day ends the count
  }
  return streak;
}

// He marks it. 'tried' advances the interval for that technique; 'skipped'
// deliberately does NOT — exposure is not practice, so a technique he passed
// on comes back at the same short gap rather than graduating on a shrug.
export async function logPractice(vaultPath, dateISO, outcome, note = '') {
  if (!['tried', 'skipped'].includes(outcome)) throw new Error("outcome must be 'tried' or 'skipped'");
  const state = await readState();
  const day = state.days[dateISO];
  if (!day?.id) throw new Error('no technique has been served for that day yet');
  const prev = state.techniques[day.id] || {};
  const was = day.outcome;
  if (was === outcome && !note) return { unchanged: true, outcome };

  // re-marking the same day corrects the tally rather than double-counting it
  const tried = (Number(prev.tried) || 0) - (was === 'tried' ? 1 : 0) + (outcome === 'tried' ? 1 : 0);
  const skipped = (Number(prev.skipped) || 0) - (was === 'skipped' ? 1 : 0) + (outcome === 'skipped' ? 1 : 0);
  state.techniques[day.id] = { ...prev, tried: Math.max(0, tried), skipped: Math.max(0, skipped), lastOutcome: outcome, lastOutcomeAt: new Date().toISOString() };
  state.days[dateISO] = { ...day, outcome, note: String(note || '').slice(0, 300) || null };
  await writeState(state);

  let logged = false;
  try {
    const techniques = flatten(await loadRepertoire(vaultPath));
    const t = techniques.find((x) => x.id === day.id);
    if (t) { await appendLog(vaultPath, dateISO, t.name, outcome, note); logged = true; }
  } catch { /* the vault log is a nicety; the tally is the record */ }
  return { outcome, tried: state.techniques[day.id].tried, streak: computeStreak(state, dateISO), logged };
}

export function formatLogLine(dateISO, name, outcome, note = '') {
  const verb = outcome === 'tried' ? 'tried' : 'passed';
  const n = String(note || '').replace(/\s+/g, ' ').trim();
  return `- ${dateISO} · **${name}** — ${verb}${n ? ` · ${n}` : ''}`;
}

async function appendLog(vaultPath, dateISO, name, outcome, note) {
  const full = path.join(vaultPath, LOG_REL);
  await mkdir(path.dirname(full), { recursive: true });
  const raw = existsSync(full) ? await readFile(full, 'utf8') : LOG_HEADER;
  if (existsSync(full)) await backupFile(full);
  const line = formatLogLine(dateISO, name, outcome, note);
  // newest first, and a re-mark of the same day REPLACES its line instead of
  // stacking a contradicting second one
  const kept = raw.split('\n').filter((l) => !l.startsWith(`- ${dateISO} · **${name}**`));
  const headEnd = kept.findIndex((l) => l.startsWith('- '));
  const at = headEnd === -1 ? kept.length : headEnd;
  kept.splice(at, 0, line);
  await writeFile(full, kept.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');
}

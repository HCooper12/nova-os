import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFile } from './backup.js';

// THE DAILY REVIEW, ON A FORGETTING CURVE (mockup 96, audit
// design/audits/redesign-2026-09/27-daily-review.md). His intent: concepts
// and topics from his vault resurface on a widening schedule so he actually
// remembers them, without re-reading or re-listening every time.
//
// His calls (11 Oct 2026), honoured exactly:
//   - gaps 1·3·7·16·35·90·180 days, at most 5 a morning, one new concept on
//     a day with fewer than 3 due, most-overdue-first ordering
//   - answering is OPTIONAL — Next records grade 'read' and advances a step
//     like Got it; Got it/Fuzzy/Forgot stay as secondary, more precise taps
//   - a card only shown, never tapped, does not move
//   - his answers live in the vault (Wiki/Library/Review Log.md, one line
//     per answer); the schedule here is REBUILT from that log, never the
//     other way around — the log is the source of truth, this file is a
//     cache derived from it.
//
// WHY "NEW" NEEDS NO PERSISTED STATE: a page that has never been answered
// has no log line and so never enters `rebuildState`'s output. Each
// morning's "new" pick is therefore recomputed fresh from the same
// deterministic ordering (newest page first, then most backlinked, then
// title) — so an introduced-but-never-answered page is simply picked again
// tomorrow. The one case this simplification does not cover: a page shown
// as new today and never tapped will be offered again as "new" rather than
// "still due", which is the same honest outcome (it climbs nothing, it
// keeps showing) reached a different way.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'concept-review.json');

export const LOG_REL = 'Wiki/Library/Review Log.md';
const LOG_HEADER = `# Review Log

One line per answer, newest first. Rebuilt into concept-review.json; this
file is the record he can read and edit.

`;

// pinned beside the Library's and the Leader's schedules in twins.test.js
export const GAPS = [1, 3, 7, 16, 35, 90, 180];
export const DAILY = 5;
export const NEW_WHEN_BELOW = 3;
export const GRADES = ['got', 'fuzzy', 'forgot', 'read'];
export const GRADE_LABEL = { got: 'Got it', fuzzy: 'Fuzzy', forgot: 'Forgot', read: 'Read' };
const LABEL_GRADE = Object.fromEntries(Object.entries(GRADE_LABEL).map(([g, l]) => [l, g]));

/* ------------------------------ date math -------------------------------- */
// Pure calendar-string arithmetic — dates in and out are local YYYY-MM-DD
// strings (localDate.js's localDateISO at the caller), never machine-local
// Date math, so this file carries no timezone opinion of its own (the AEST
// trap this platform has already paid for more than once).

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
export function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------- grading --------------------------------- */

// The next step after a grade, from the audit's table — 'read' behaves like
// 'got' (his change to the mockup: answering is optional, Next still moves
// the card). Pure; no dates.
export function nextStep(step, grade) {
  const s = Math.max(0, Number(step) || 0);
  if (grade === 'got' || grade === 'read') return Math.min(s + 1, GAPS.length - 1);
  if (grade === 'fuzzy') return s;
  return 0; // forgot
}

// One grade applied to one card. `card` is {step, due} or null (never seen).
export function answer(card, grade, today) {
  if (!GRADES.includes(grade)) throw new Error(`grade must be one of: ${GRADES.join(', ')}`);
  const step = nextStep(card?.step, grade);
  return { step, due: shiftDate(today, GAPS[step]) };
}

/* --------------------------------- state ---------------------------------- */

export async function readLog(vaultPath) {
  const full = path.join(vaultPath, LOG_REL);
  if (!existsSync(full)) return [];
  const raw = await readFile(full, 'utf8');
  return raw.split('\n').filter((l) => l.startsWith('- '));
}

export function parseLogLine(line) {
  const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+\[\[([^\]]+)\]\]\s+·\s+(.+?)\s*$/);
  if (!m) return null;
  const [, date, title, label] = m;
  const grade = LABEL_GRADE[label.trim()];
  if (!grade) return null;
  return { date, title: title.trim(), grade };
}

export function formatLogLine(date, title, grade) {
  return `- ${date} · [[${title}]] · ${GRADE_LABEL[grade]}`;
}

// Replay every answer, oldest first PER CONCEPT (file order does not need to
// be chronological across concepts — only a single concept's own answers
// need to apply in date order, and the re-mark rule below keeps one line per
// concept per day so there is exactly one grade to apply for that day).
// Returns { [pageId]: { step, due } } plus the per-concept answer history
// (date + grade), used for the card's curve dots.
export function rebuildState(lines, titleToId) {
  const byConcept = new Map(); // id -> [{date, grade}]
  for (const raw of lines) {
    const parsed = parseLogLine(raw);
    if (!parsed) continue;
    const id = titleToId.get(parsed.title.toLowerCase());
    if (!id) continue; // a renamed/deleted page — the log line stays, honestly orphaned
    if (!byConcept.has(id)) byConcept.set(id, []);
    byConcept.get(id).push({ date: parsed.date, grade: parsed.grade });
  }
  const cards = {};
  const history = {};
  for (const [id, answers] of byConcept) {
    answers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let card = null;
    for (const a of answers) card = answer(card, a.grade, a.date);
    cards[id] = card;
    history[id] = answers;
  }
  return { cards, history };
}

export async function loadReviewState(vaultPath, titleToId) {
  const lines = await readLog(vaultPath);
  return rebuildState(lines, titleToId);
}

// cache so a day of card renders doesn't re-read + re-parse the log on every
// request; invalidated by writing a new answer
let cache = null;
export async function getReviewState(vaultPath, titleToId) {
  if (cache && cache.vaultPath === vaultPath) return cache.state;
  const state = await loadReviewState(vaultPath, titleToId);
  cache = { vaultPath, state };
  await persistState(state.cards).catch(() => {}); // best-effort mirror to disk, never load-bearing
  return state;
}
function invalidateCache() { cache = null; }

async function persistState(cards) {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(STATE_PATH(), JSON.stringify({ cards, rebuiltAt: new Date().toISOString() }, null, 2), 'utf8');
}

/* --------------------------------- picking --------------------------------- */

// Which previously-answered cards are due today, ranked furthest-past-their-
// own-gap first (daysBetween(due, today) / GAPS[step]), then the lower step,
// then title — the audit's ordering, exactly.
export function dueCards(cards, pagesById, today) {
  const out = [];
  for (const [id, card] of Object.entries(cards)) {
    const page = pagesById.get(id);
    if (!page) continue; // the page is gone from the vault; nothing to show
    if (card.due > today) continue;
    const late = Math.max(0, daysBetween(card.due, today));
    out.push({ id, page, step: card.step, due: card.due, score: late / GAPS[card.step] });
  }
  out.sort((a, b) => b.score - a.score || a.step - b.step || a.page.title.localeCompare(b.page.title));
  return out;
}

// Candidates never in the log, ranked newest page first (its concept page's
// own date, standing in for "the day after the source was ingested, while
// the curve is steepest"), then most backlinked, then title.
export function newCandidates(pages, cards, backlinkCounts) {
  const seen = new Set(Object.keys(cards));
  return pages
    .filter((p) => (p.type === 'concept' || p.type === 'topic') && !seen.has(p.id))
    .map((p) => ({ id: p.id, page: p, backlinks: backlinkCounts?.get(p.id) || 0 }))
    .sort((a, b) => (b.page.date || '').localeCompare(a.page.date || '')
      || b.backlinks - a.backlinks
      || a.page.title.localeCompare(b.page.title));
}

// The whole day's queue: up to DAILY ids, due cards first (most overdue),
// one new concept slotted in when fewer than NEW_WHEN_BELOW are due.
export function buildQueue({ pages, cards, backlinkCounts, today, daily = DAILY, newWhenBelow = NEW_WHEN_BELOW }) {
  const pagesById = new Map(pages.map((p) => [p.id, p]));
  const due = dueCards(cards, pagesById, today);
  const queue = due.slice(0, daily).map((d) => ({ id: d.id, page: d.page, step: d.step, kind: 'due' }));
  if (due.length < newWhenBelow && queue.length < daily) {
    const [pick] = newCandidates(pages, cards, backlinkCounts);
    if (pick) queue.push({ id: pick.id, page: pick.page, step: 0, kind: 'new' });
  }
  return { queue: queue.slice(0, daily), dueCount: due.length };
}

/* ---------------------------------- write ---------------------------------- */

// One answer, written to the vault log (newest line first; re-grading the
// SAME concept on the SAME day replaces its one line rather than stacking a
// contradiction, same rule as the Repertoire Log). Returns enough to build
// an inbox undoData that reverses this exact write.
export async function appendAnswer(vaultPath, { date, title, grade }) {
  const full = path.join(vaultPath, LOG_REL);
  await mkdir(path.dirname(full), { recursive: true });
  const existedBefore = existsSync(full);
  const raw = existedBefore ? await readFile(full, 'utf8') : LOG_HEADER;
  if (existedBefore) await backupFile(full);
  const line = formatLogLine(date, title, grade);
  const lines = raw.split('\n');
  const prevLine = lines.find((l) => l.startsWith(`- ${date} · [[${title}]] ·`)) || null;
  const kept = lines.filter((l) => !l.startsWith(`- ${date} · [[${title}]] ·`));
  const headEnd = kept.findIndex((l) => l.startsWith('- '));
  const at = headEnd === -1 ? kept.length : headEnd;
  kept.splice(at, 0, line);
  const out = `${kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;
  await writeFile(full, out, 'utf8');
  invalidateCache();
  return { relPath: LOG_REL, line, prevLine, createdFile: !existedBefore };
}

// The exact reverse of appendAnswer: take the written line back out, and put
// back whatever line (if any) it replaced — an identity round-trip, never
// touching any other line in the file.
export async function undoAnswer(vaultPath, undo) {
  const full = path.join(vaultPath, undo.relPath || LOG_REL);
  if (!existsSync(full)) return false;
  await backupFile(full);
  const raw = await readFile(full, 'utf8');
  const lines = raw.split('\n');
  const i = lines.indexOf(undo.line);
  if (i === -1) return false;
  if (undo.prevLine) lines[i] = undo.prevLine;
  else lines.splice(i, 1);
  const out = `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;
  await writeFile(full, out, 'utf8');
  invalidateCache();
  return true;
}

export { invalidateCache as _invalidateReviewCache };

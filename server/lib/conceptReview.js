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
  out.sort((a, b) => b.score - a.score || a.step - b.step || titleKey(a.page.title).localeCompare(titleKey(b.page.title)));
  return out;
}

// The week ahead, by pages due (mockup 96's done state), and the next day
// anything is due at all (the "nothing due" row). Counted from the real
// schedule only; a page whose card is gone from the vault is not counted.
export function aheadOf(cards, pagesById, today, days = 7) {
  const counts = new Map();
  let next = null;
  for (const [id, card] of Object.entries(cards)) {
    if (!pagesById.has(id) || !card?.due || card.due <= today) continue;
    counts.set(card.due, (counts.get(card.due) || 0) + 1);
    if (!next || card.due < next) next = card.due;
  }
  const ahead = [];
  for (let i = 1; i <= days; i++) {
    const date = shiftDate(today, i);
    ahead.push({ date, count: counts.get(date) || 0 });
  }
  return { ahead, nextDue: next ? { date: next, count: counts.get(next) } : null };
}

// Frontmatter is YAML: a bare `date: 2026-09-14` arrives as a Date object
// and a numeric title as a number. Every comparison goes through these, so
// one odd page can never 500 the whole morning (it did, on his vault, 11 Oct).
const dateKey = (v) => (v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : String(v ?? ''));
const titleKey = (v) => String(v ?? '');

// Candidates never in the log, ranked newest page first (its concept page's
// own date, standing in for "the day after the source was ingested, while
// the curve is steepest"), then most backlinked, then title.
export function newCandidates(pages, cards, backlinkCounts) {
  const seen = new Set(Object.keys(cards));
  return pages
    .filter((p) => (p.type === 'concept' || p.type === 'topic') && !seen.has(p.id))
    .map((p) => ({ id: p.id, page: p, backlinks: backlinkCounts?.get(p.id) || 0 }))
    .sort((a, b) => dateKey(b.page.date).localeCompare(dateKey(a.page.date))
      || b.backlinks - a.backlinks
      || titleKey(a.page.title).localeCompare(titleKey(b.page.title)));
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

/* ----------------------------- composition --------------------------------- */
// Everything above is pure or vault-only. These are the whole-vault views the
// route layer actually serves: the day's queue with a source, connected
// notes and a curve ready to draw, and the write path for one tap.

export function titleToIdMap(pages) {
  return new Map(pages.map((p) => [p.title.toLowerCase(), p.id]));
}

// 2 to 4 connected notes from the page's own links — mutual links (the
// target links back) first, then the most backlinked overall, then title.
export function connectedNotes(page, pages, backlinkCounts, max = 4) {
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
  const mutual = [];
  const rest = [];
  for (const link of page.links || []) {
    const target = byTitle.get(String(link).toLowerCase());
    if (!target || target.id === page.id) continue;
    const linksBack = (target.links || []).some((l) => String(l).toLowerCase() === page.title.toLowerCase());
    (linksBack ? mutual : rest).push(target);
  }
  const rank = (a, b) => (backlinkCounts.get(b.id) || 0) - (backlinkCounts.get(a.id) || 0) || titleKey(a.title).localeCompare(titleKey(b.title));
  mutual.sort(rank);
  rest.sort(rank);
  return [...mutual, ...rest].slice(0, max).map((p) => ({ id: p.id, title: p.title, type: p.type }));
}

// The first `sources:` page, by its real url — never the concept's own
// title as a stand-in (the honesty rule mockup 96 names explicitly).
export function resolveSource(page, pages) {
  if (!page.sources?.length) return null;
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
  const [first, ...more] = page.sources;
  const src = byTitle.get(first.title.toLowerCase());
  return { title: first.title, time: first.time || null, url: src?.url || null, extra: more.length };
}

// The one card shape every caller below returns — the fields the mockup's
// card and sheet both read.
function buildItemView({ id, kind, page, pages, cards, history, backlinkCounts, today }) {
  const card = cards[id] || null;
  const answered = !!card && card.due > today;
  return {
    id, kind, answered,
    title: page.title, type: page.type,
    gist: page.paragraphs?.[0] || null,
    source: resolveSource(page, pages),
    connected: connectedNotes(page, pages, backlinkCounts),
    history: history[id] || [],
    step: card ? card.step : 0,
    due: card ? card.due : null,
  };
}

async function loadVaultView(vaultPath, vault) {
  const pages = await vault.listPages();
  const titleToId = titleToIdMap(pages);
  const backlinkCounts = await vault.backlinkCounts(pages);
  const { cards, history } = await getReviewState(vaultPath, titleToId);
  return { pages, backlinkCounts, cards, history };
}

// in-memory only: which ids were picked for today, so the pips ("N of M")
// stay stable through the session even once an answer moves a card off
// today's due list. Lost on restart — the honest fallback is simply picking
// fresh (still deterministic, still correct), never inventing a count.
let todayPick = null;

export async function reviewToday(vaultPath, vault, now = new Date()) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO(now);
  const { pages, backlinkCounts, cards, history } = await loadVaultView(vaultPath, vault);

  if (!todayPick || todayPick.date !== today) {
    const { queue } = buildQueue({ pages, cards, backlinkCounts, today });
    todayPick = { date: today, items: queue.map((q) => ({ id: q.id, kind: q.kind })) };
  }

  const pagesById = new Map(pages.map((p) => [p.id, p]));
  const items = todayPick.items
    .map(({ id, kind }) => ({ id, kind, page: pagesById.get(id) }))
    .filter((i) => i.page)
    .map(({ id, kind, page }) => buildItemView({ id, kind, page, pages, cards, history, backlinkCounts, today }));

  const dueCount = dueCards(cards, pagesById, today).length;
  const { ahead, nextDue } = aheadOf(cards, pagesById, today);
  return {
    ahead, nextDue,
    date: today,
    items,
    total: items.length,
    doneCount: items.filter((i) => i.answered).length,
    dueCount, // the real backlog, independent of what fit in today's cap
  };
}

// "Draw one early" (his call: the shuffle reel survives only here, once the
// day's reviews are done). A random concept/topic page never yet logged —
// the same pool buildQueue's "new" rule draws from, just unordered. It
// enters as new: answering it writes the very same log line any other
// answer would.
export async function drawEarly(vaultPath, vault, now = new Date()) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO(now);
  const { pages, backlinkCounts, cards, history } = await loadVaultView(vaultPath, vault);
  const candidates = newCandidates(pages, cards, backlinkCounts);
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return buildItemView({ id: pick.id, kind: 'new', page: pick.page, pages, cards, history, backlinkCounts, today });
}

// One arbitrary page's card view (used after the reel lands, and by the
// sheet for a page outside today's queue). Returns null for a page the
// vault no longer has.
export async function reviewItemFor(vaultPath, vault, pageId, now = new Date()) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO(now);
  const { pages, backlinkCounts, cards, history } = await loadVaultView(vaultPath, vault);
  const page = pages.find((p) => p.id === pageId);
  if (!page) return null;
  const kind = cards[pageId] ? 'due' : 'new';
  return buildItemView({ id: pageId, kind, page, pages, cards, history, backlinkCounts, today });
}

// One tap: write the vault log line, rebuild the schedule, and return the
// Inbox record (kind 'concept-recall', undoable) plus the item's new state.
export async function submitAnswer(vaultPath, vault, { pageId, grade }, now = new Date()) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO(now);
  const page = await vault.getPage(pageId).catch(() => null);
  if (!page) throw new Error('that page is no longer in the vault');
  if (!GRADES.includes(grade)) throw new Error(`grade must be one of: ${GRADES.join(', ')}`);

  const written = await appendAnswer(vaultPath, { date: today, title: page.title, grade });

  const pages = await vault.listPages();
  const titleToId = titleToIdMap(pages);
  const { cards } = await getReviewState(vaultPath, titleToId);
  const card = cards[pageId] || null;

  const { createRecord } = await import('./inboxStore.js');
  const { randomUUID } = await import('node:crypto');
  const at = now.toISOString();
  const record = await createRecord({
    id: randomUUID().slice(0, 8), kind: 'concept-recall',
    text: `Daily review: ${page.title} — ${GRADE_LABEL[grade]}.`,
    source: 'review', mode: 'auto', status: 'filed', auto: true,
    createdAt: at, filedAt: at, destination: written.relPath,
    undoData: { route: 'concept-recall', ...written },
  });

  return { record, pageId, grade, step: card?.step ?? 0, due: card?.due ?? null };
}

export async function undoConceptAnswer(vaultPath, undo) {
  const removed = await undoAnswer(vaultPath, undo);
  return removed ? 'took that review answer back off the Review Log' : 'that review answer was already gone from the Review Log';
}

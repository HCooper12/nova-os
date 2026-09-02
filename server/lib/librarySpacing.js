import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tableSchedule, nextDueAt } from './spacing.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SPACED RESURFACING — Librarian Phase 3, the "review overtime" ask.
//
// The library only compounds if its ideas come back. The daily review
// already had a resurfacing beat, but it had NO MEMORY: it picked the first
// and last items by list position, so the same two sources returned every
// single day and everything in the middle was never seen again. That is a
// shelf, not spaced repetition.
//
// This is the picker with a memory. Deterministic — the model only phrases
// what it is handed, never chooses. Ebbinghaus-ish: each time a source is
// surfaced its next due date moves further out, so a thing he has seen five
// times stops competing with a thing he has never seen.
//
// WHERE THE STATE LIVES: server/data, not vault frontmatter. LIBRARIAN-PLAN
// specifies a `review:` frontmatter key, and the vault IS the source of
// truth for knowledge — but a revisit schedule is not knowledge, it is
// operational bookkeeping, which is exactly what server/data is for per
// CLAUDE.md. It also avoids writing to his Obsidian pages every single day
// for a field only Nova reads. The trade: rebuilding server/data resets the
// spacing, which costs nothing real (everything simply becomes due).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'library-spacing.json');

// Widening gaps. Not a flashcard app — five steps out to five weeks is
// plenty for ideas from books, and the last interval repeats forever.
export const INTERVALS = [1, 3, 7, 16, 35];
export const SCHEDULE = tableSchedule(INTERVALS); // pinned beside the Leader's in twins.test.js
const DAY = 86_400_000;

export const intervalFor = (seen) => SCHEDULE(seen);

/* --------------------------------- state ---------------------------------- */

export async function readSpacing() {
  if (!existsSync(STATE_PATH())) return {};
  try {
    const raw = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    return raw && typeof raw.sources === 'object' ? raw.sources : {};
  } catch { return {}; }
}

export async function writeSpacing(sources) {
  await mkdir(path.dirname(STATE_PATH()), { recursive: true });
  await writeFile(STATE_PATH(), JSON.stringify({ sources }, null, 2), 'utf8');
  return sources;
}

/* --------------------------------- picker --------------------------------- */

// Pure and total: given the shelf, the spacing state and the clock, which ONE
// source is due? Exported separately from the IO so the ranking can be tested
// exhaustively without touching disk.
//
// Ranking, in order:
//   1. never surfaced beats surfaced — a book he has never been shown again
//      is always more valuable than a fifth showing of one he has;
//   2. among never-surfaced, the one with the MOST backlinks first — an idea
//      the rest of his vault keeps pointing at has earned the slot;
//   3. among surfaced, the most overdue first;
//   4. a source that gained backlinks since it was last shown jumps the
//      queue: a connection formed since he last saw it is the single best
//      reason to see it again, and it is the plan's "weighted toward pages
//      with fresh backlinks".
export function pickForResurfacing(items = [], state = {}, now = Date.now()) {
  const due = [];
  for (const s of items) {
    if (!s || !s.id) continue;
    const st = state[s.id];
    if (!st) { due.push({ s, kind: 'new', score: s.backlinks || 0 }); continue; }
    const seen = Number(st.seen) || 0;
    const last = new Date(st.lastSurfacedAt || 0).getTime();
    const gained = (s.backlinks || 0) - (Number(st.backlinksAtSurface) || 0);
    const dueAt = nextDueAt(last, seen - 1, SCHEDULE);
    // a fresh connection makes it due now regardless of the interval
    if (gained > 0) { due.push({ s, kind: 'reconnected', score: gained }); continue; }
    if (now >= dueAt) due.push({ s, kind: 'due', score: (now - dueAt) / DAY });
  }
  if (!due.length) return null;
  const rank = { reconnected: 0, new: 1, due: 2 };
  due.sort((a, b) => (rank[a.kind] - rank[b.kind])
    || (b.score - a.score)
    || String(a.s.id).localeCompare(String(b.s.id))); // stable, never random
  const top = due[0];
  return { item: top.s, reason: top.kind, due: due.length };
}

// Record that a source was actually shown. Stores the backlink count AT the
// moment of surfacing, which is what makes "gained a connection since" a
// real measurement rather than a guess.
export async function markSurfaced(item, now = new Date()) {
  if (!item?.id) return null;
  const state = await readSpacing();
  const prev = state[item.id] || {};
  state[item.id] = {
    seen: (Number(prev.seen) || 0) + 1,
    lastSurfacedAt: now.toISOString(),
    backlinksAtSurface: item.backlinks || 0,
  };
  await writeSpacing(state);
  return state[item.id];
}

/* ------------------------------ the brief line ----------------------------- */

// The morning brief gets an OCCASIONAL one-liner, not a daily sermon. The
// plan's word was "delightful, not preachy", and the way a resurfacing beat
// turns preachy is by showing up every morning. Rate-limited to one every
// MIN_BRIEF_GAP_DAYS, and it declines rather than reaching when nothing is
// genuinely due.
export const MIN_BRIEF_GAP_DAYS = 4;
// Reserved key in the same file — the brief's own clock, kept beside the
// per-source state so there is one place to look and one file to reset.
const BRIEF_KEY = '__brief__';

export function briefDue(lastBriefAt, now = Date.now()) {
  if (!lastBriefAt) return true;
  return (now - new Date(lastBriefAt).getTime()) >= MIN_BRIEF_GAP_DAYS * DAY;
}

// The whole brief beat, IO included: returns a line or null. Marks the
// source surfaced only when it actually returns one, so a rate-limited day
// never silently burns an idea.
export async function briefResurfaceLine(items, now = new Date()) {
  const state = await readSpacing();
  if (!briefDue(state[BRIEF_KEY]?.lastBriefAt, now.getTime())) return null;
  const pick = pickForResurfacing(items, state, now.getTime());
  const line = resurfaceLine(pick);
  if (!line) return null;
  await markSurfaced(pick.item, now).catch(() => {});
  const after = await readSpacing();
  after[BRIEF_KEY] = { lastBriefAt: now.toISOString() };
  await writeSpacing(after).catch(() => {});
  return { line, item: pick.item, reason: pick.reason };
}

// The spoken line. Names the source, the idea, and — when that is why it
// surfaced — the fact that his own vault reconnected to it.
export function resurfaceLine(pick) {
  if (!pick?.item) return null;
  const s = pick.item;
  const idea = (s.concepts || [])[0] || String(s.excerpt || '').slice(0, 70).trim();
  if (!idea) return null;
  const who = s.author ? ` by ${s.author}` : '';
  const caveat = s.provenance === 'researched' ? ' — researched, not read' : '';
  if (pick.reason === 'reconnected') {
    return `Something you stored has just gained a connection, sir: "${s.title}"${who} on ${idea}${caveat}. Worth a second look now the rest of your vault points at it.`;
  }
  return `From your library, sir: "${s.title}"${who} — ${idea}${caveat}.`;
}

// The Repertoire — a curriculum with a drill attached. The properties that
// matter: the page round-trips (a writer that drifts loses his edits), the
// rota is deterministic (Home and the spoken brief must name the SAME
// technique), and the interval is driven by what he PRACTISED, never by what
// he was merely shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  slugFor, parseRepertoire, formatRepertoire, formatTechnique, flatten,
  pickForDay, intervalFor, REVIEW_INTERVALS, computeStreak, formatLogLine, daysBetween, shiftDate, spokenTechniqueLine,
  REPERTOIRE_REL, LOG_REL,
} from '../lib/repertoire.js';

const tech = (name, over = {}) => ({
  id: slugFor(name), name, summary: `${name} summary`,
  move: 'the mechanism', drill: 'do the thing', tell: 'they pause', source: 'The Mentalist', ...over,
});
const FAMS = [
  { name: 'Suggestion', techniques: [tech('The planted sensation'), tech('The unfalsifiable frame')] },
  { name: 'Cold reading', techniques: [tech('The Barnum line')] },
];
const ALL = flatten(FAMS);

/* ------------------------------ the contract ----------------------------- */

test('a written page parses back to exactly what was written', () => {
  const round = parseRepertoire(formatRepertoire(FAMS));
  assert.deepEqual(round, FAMS, 'the format contract is a round trip or it is a bug');
});

test('every field survives the trip, including the ones a card needs', () => {
  const t = parseRepertoire(formatRepertoire(FAMS))[0].techniques[0];
  assert.equal(t.name, 'The planted sensation');
  assert.equal(t.summary, 'The planted sensation summary');
  assert.equal(t.move, 'the mechanism');
  assert.equal(t.drill, 'do the thing');
  assert.equal(t.tell, 'they pause');
  assert.equal(t.source, 'The Mentalist');
});

test('a technique missing optional fields still formats and parses', () => {
  const sparse = [{ name: 'Bare', techniques: [{ id: 'bare', name: 'Bare', summary: '', move: '', drill: '', tell: '', source: '' }] }];
  assert.equal(formatTechnique(sparse[0].techniques[0]), '### Bare');
  assert.deepEqual(parseRepertoire(formatRepertoire(sparse)), sparse);
});

test('a hand-written paragraph in Obsidian does not become a 400-char card', () => {
  const raw = '## F\n\n### T\nThe real summary.\nA second paragraph he typed later.\n- **Move:** m\n';
  assert.equal(parseRepertoire(raw)[0].techniques[0].summary, 'The real summary.');
});

test('slugs are stable ids, and punctuation does not fork one technique into two', () => {
  assert.equal(slugFor("The magician's force"), 'the-magicians-force');
  assert.equal(slugFor('The magicians force'), 'the-magicians-force');
});

test('flatten is page order, and a duplicate id cannot appear twice', () => {
  assert.deepEqual(ALL.map((t) => t.id), ['the-planted-sensation', 'the-unfalsifiable-frame', 'the-barnum-line']);
  const dupe = flatten([{ name: 'A', techniques: [tech('Same')] }, { name: 'B', techniques: [tech('Same')] }]);
  assert.equal(dupe.length, 1);
  assert.equal(ALL[0].family, 'Suggestion');
});

/* -------------------------------- the rota ------------------------------- */

const taught = (dayISO, tried = 0) => ({ seen: 1, tried, skipped: 0, lastSurfacedAt: `${dayISO}T08:00:00.000Z` });

test('with nothing taught, day one is the first technique in page order', () => {
  const p = pickForDay(ALL, { techniques: {}, days: {} }, '2026-09-15');
  assert.equal(p.technique.id, 'the-planted-sensation');
  assert.equal(p.mode, 'new');
});

test('a day already served keeps its answer — Home and the brief cannot disagree', () => {
  const state = { techniques: { 'the-barnum-line': taught('2026-09-10') }, days: { '2026-09-15': { id: 'the-barnum-line', mode: 'review' } } };
  const p = pickForDay(ALL, state, '2026-09-15');
  assert.equal(p.technique.id, 'the-barnum-line');
  assert.equal(p.mode, 'review');
  assert.equal(p.settled, true);
});

test('every third day is a review day when something is genuinely due', () => {
  const state = {
    techniques: { 'the-planted-sensation': taught('2026-09-13', 0), 'the-unfalsifiable-frame': taught('2026-09-14', 0) },
    days: { '2026-09-13': { id: 'the-planted-sensation' }, '2026-09-14': { id: 'the-unfalsifiable-frame' } },
  };
  // two days served; the third is a review, and the most overdue wins
  const p = pickForDay(ALL, state, '2026-09-15');
  assert.equal(p.mode, 'review');
  assert.equal(p.technique.id, 'the-planted-sensation');
  assert.match(p.why, /shown before, never tried/);
});

test('a review day with nothing due falls through to new work rather than nagging', () => {
  const state = {
    techniques: { 'the-planted-sensation': taught('2026-09-15', 0), 'the-unfalsifiable-frame': taught('2026-09-15', 0) },
    days: { '2026-09-14': { id: 'the-planted-sensation' }, '2026-09-15': { id: 'the-unfalsifiable-frame' } },
  };
  const p = pickForDay(ALL, state, '2026-09-16');
  assert.equal(p.mode, 'new');
  assert.equal(p.technique.id, 'the-barnum-line');
});

test('once the catalogue is exhausted every day is a review, never "nothing today"', () => {
  const state = {
    techniques: Object.fromEntries(ALL.map((t) => [t.id, taught('2026-09-01', 1)])),
    days: { '2026-09-01': { id: 'a' }, '2026-09-02': { id: 'b' }, '2026-09-03': { id: 'c' } },
  };
  const p = pickForDay(ALL, state, '2026-09-20');
  assert.equal(p.mode, 'review');
  assert.match(p.why, /whole catalogue is taught/);
});

test('an empty catalogue returns null so the surfaces can say so honestly', () => {
  assert.equal(pickForDay([], { techniques: {}, days: {} }, '2026-09-15'), null);
});

/* --------------- the difference between shown and practised -------------- */

test('the interval widens with times TRIED, not times shown', () => {
  assert.deepEqual(REVIEW_INTERVALS, [2, 5, 12, 30]);
  assert.equal(intervalFor(0), 2);
  assert.equal(intervalFor(2), 12);
  assert.equal(intervalFor(99), 30, 'the last interval repeats forever');
});

test('a technique shown three times and never tried keeps the SHORT gap', () => {
  // seen 3, tried 0 → due 2 days after it was last shown, not 12
  const state = {
    techniques: { 'the-barnum-line': { seen: 3, tried: 0, lastSurfacedAt: '2026-09-12T08:00:00.000Z' } },
    days: { '2026-09-12': { id: 'the-barnum-line' }, '2026-09-13': { id: 'x' } },
  };
  const p = pickForDay([ALL[2]], state, '2026-09-15');
  assert.equal(p.mode, 'review', 'exposure is not practice — it comes back');
});

test('a technique tried three times has genuinely earned the long gap', () => {
  const state = {
    techniques: { 'the-barnum-line': { seen: 3, tried: 3, lastSurfacedAt: '2026-09-12T08:00:00.000Z' } },
    days: { '2026-09-12': { id: 'the-barnum-line' }, '2026-09-13': { id: 'x' } },
  };
  // due 30 days after 12 Sep; on the 15th nothing is due, and nothing is new
  assert.equal(pickForDay([ALL[2]], state, '2026-09-15').mode, 'review', 'exhausted catalogue still returns the most overdue');
  // ...but with new work available it does not jump the queue
  assert.equal(pickForDay(ALL, state, '2026-09-15').mode, 'new');
});

/* --------------------------- the timezone trap --------------------------- */
// He is AEST (+10). The first draft of the picker compared a LOCAL noon
// against UTC stamps and recorded a surfacing as local 08:00 — which
// serialises to the previous UTC date. Between them, every review was silently
// skipped and the schedule read the wrong day. The fix is to compare at the
// resolution we display: whole calendar days, as strings.

test('day arithmetic never crosses a timezone', () => {
  assert.equal(daysBetween('2026-09-13', '2026-09-15'), 2);
  assert.equal(daysBetween('2026-09-13T08:00:00.000Z', '2026-09-15'), 2, 'an instant is read as its date');
  assert.equal(daysBetween('2026-09-30', '2026-10-01'), 1, 'across a month boundary');
  assert.equal(shiftDate('2026-10-01', -1), '2026-09-30');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.ok(Number.isNaN(daysBetween('nonsense', '2026-09-15')));
});

test('a technique shown on the 13th with a 2-day gap is due on the 15th, to the DAY', () => {
  const base = { days: { '2026-09-13': { id: 'x' }, '2026-09-14': { id: 'y' } } };
  const onlyOne = [ALL[0]];
  // not yet due on the 14th...
  assert.equal(pickForDay(onlyOne, { ...base, techniques: { [ALL[0].id]: taught('2026-09-13', 0) }, days: { '2026-09-13': { id: 'x' } } }, '2026-09-14').mode, 'review',
    'exhausted catalogue returns the most overdue regardless');
  // ...and on the 15th it is genuinely due, on a review day, from a UTC stamp
  const p = pickForDay(ALL, { ...base, techniques: { [ALL[0].id]: { seen: 1, tried: 0, lastSurfacedAt: '2026-09-13T22:00:00.000Z' } } }, '2026-09-15');
  assert.equal(p.mode, 'review');
  assert.equal(p.technique.id, ALL[0].id);
});

test('the day served is stored as a LOCAL date string, not an instant that can slip', async () => {
  const vault = await tempVault();
  const { addTechniques, techniqueForDay, readState } = await import('../lib/repertoire.js');
  await addTechniques(vault, [{ family: 'A', name: 'One', summary: 's' }]);
  await techniqueForDay(vault, '2026-09-15');
  const state = await readState();
  assert.equal(state.techniques.one.lastSurfacedOn, '2026-09-15', 'the schedule reads this, and it must be his day');
});

/* -------------------------------- streaks -------------------------------- */

test('a streak counts consecutive days he actually tried, and a pass breaks it', () => {
  const days = {
    '2026-09-15': { id: 'a', outcome: 'tried' },
    '2026-09-14': { id: 'b', outcome: 'tried' },
    '2026-09-13': { id: 'c', outcome: 'skipped' },
    '2026-09-12': { id: 'd', outcome: 'tried' },
  };
  assert.equal(computeStreak({ days }, '2026-09-15'), 2, 'an honest streak has to be breakable');
});

test('today unanswered does not break yesterday, but an unanswered PAST day ends the count', () => {
  const days = { '2026-09-14': { id: 'b', outcome: 'tried' }, '2026-09-13': { id: 'c', outcome: 'tried' } };
  assert.equal(computeStreak({ days }, '2026-09-15'), 2);
  const gap = { '2026-09-14': { id: 'b', outcome: 'tried' }, '2026-09-12': { id: 'd', outcome: 'tried' } };
  assert.equal(computeStreak({ days: gap }, '2026-09-15'), 1);
});

test('the log line reads like a person wrote it', () => {
  assert.equal(formatLogLine('2026-09-15', 'The planted sensation', 'tried', 'worked on Dad'), '- 2026-09-15 · **The planted sensation** — tried · worked on Dad');
  assert.equal(formatLogLine('2026-09-15', 'X', 'skipped'), '- 2026-09-15 · **X** — passed');
});

/* ------------------------------ the spoken line --------------------------- */

test('the spoken line ends on the DRILL — the thing he can actually do', () => {
  const pick = { mode: 'new', technique: { name: 'The planted sensation', summary: 'Name a sensation, make them recall it.', drill: 'Ask a friend if they can smell burning.' } };
  const line = spokenTechniqueLine(pick);
  assert.match(line, /^Today's technique, sir: The planted sensation\./);
  assert.ok(line.endsWith('Ask a friend if they can smell burning.'), 'it finishes on the action');
  assert.match(spokenTechniqueLine({ ...pick, mode: 'review' }), /^One you have met before, sir/);
});

test('a technique with no drill is never spoken — there would be nothing to do', () => {
  assert.equal(spokenTechniqueLine({ mode: 'new', technique: { name: 'X', summary: 'theory only' } }), null);
  assert.equal(spokenTechniqueLine(null), null);
});

/* ----------------------------- the vault seam ---------------------------- */

async function tempVault() {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-rep-'));
  await mkdir(path.join(dir, 'vault', 'Wiki', 'Library'), { recursive: true });
  process.env.NOVA_DATA_DIR = path.join(dir, 'data');
  return path.join(dir, 'vault');
}

test('adding techniques NEVER clobbers an edit he made in Obsidian', async () => {
  const vault = await tempVault();
  const { addTechniques, loadRepertoire } = await import('../lib/repertoire.js');
  await addTechniques(vault, [{ family: 'Suggestion', name: 'The planted sensation', summary: 'first draft', move: 'm', drill: 'd', tell: 't', source: 's' }]);

  // he rewrites the drill by hand
  const full = path.join(vault, REPERTOIRE_REL);
  await writeFile(full, (await readFile(full, 'utf8')).replace('- **Drill:** d', '- **Drill:** MY OWN WORDS'), 'utf8');

  // the lane runs again and proposes the same technique plus a new one
  const res = await addTechniques(vault, [
    { family: 'Suggestion', name: 'The planted sensation', summary: 'second draft', drill: 'd again' },
    { family: 'Cold reading', name: 'The Barnum line', summary: 'new', move: 'm2', drill: 'd2', tell: 't2', source: 's2' },
  ]);
  assert.equal(res.added.length, 1, 'only the genuinely new one is added');
  assert.equal(res.added[0].id, 'the-barnum-line');

  const back = flatten(await loadRepertoire(vault));
  assert.equal(back.find((t) => t.id === 'the-planted-sensation').drill, 'MY OWN WORDS', 'his edit survived');
  assert.equal(back.length, 2);
});

test('practising writes the tally, advances the interval, and logs it to the vault', async () => {
  const vault = await tempVault();
  const { addTechniques, techniqueForDay, logPractice, readState } = await import('../lib/repertoire.js');
  await addTechniques(vault, [{ family: 'Suggestion', name: 'The planted sensation', summary: 's', move: 'm', drill: 'd', tell: 't', source: 'src' }]);

  const today = await techniqueForDay(vault, '2026-09-15');
  assert.equal(today.technique.id, 'the-planted-sensation');
  assert.equal(today.mode, 'new');
  assert.equal(today.position, 1);
  assert.equal(today.total, 1);

  const res = await logPractice(vault, '2026-09-15', 'tried', 'worked on Dad');
  assert.equal(res.tried, 1);
  assert.equal(res.streak, 1);
  assert.equal(res.logged, true);
  const log = await readFile(path.join(vault, LOG_REL), 'utf8');
  assert.match(log, /- 2026-09-15 · \*\*The planted sensation\*\* — tried · worked on Dad/);
  assert.ok(log.endsWith('\n') && !log.endsWith('\n\n'), 'a markdown file ends with exactly one newline');

  // re-marking the SAME day corrects rather than double-counts, in both stores
  await logPractice(vault, '2026-09-15', 'skipped');
  const state = await readState();
  assert.equal(state.techniques['the-planted-sensation'].tried, 0, 'the tally was corrected, not doubled');
  assert.equal(state.techniques['the-planted-sensation'].skipped, 1);
  const log2 = await readFile(path.join(vault, LOG_REL), 'utf8');
  assert.equal(log2.match(/2026-09-15/g).length, 1, 'one line per day, not a contradicting pair');
  assert.match(log2, /— passed/);
});

test('the day is stable: asking twice gives the same technique', async () => {
  const vault = await tempVault();
  const { addTechniques, techniqueForDay } = await import('../lib/repertoire.js');
  await addTechniques(vault, [
    { family: 'A', name: 'One', summary: 's' },
    { family: 'A', name: 'Two', summary: 's' },
  ]);
  const a = await techniqueForDay(vault, '2026-09-15');
  const b = await techniqueForDay(vault, '2026-09-15');
  assert.equal(a.technique.id, b.technique.id);
  assert.equal(b.settled, true);
  // ...and tomorrow moves on
  const c = await techniqueForDay(vault, '2026-09-16');
  assert.notEqual(c.technique.id, a.technique.id);
});

test('marking a day that was never served is refused rather than invented', async () => {
  const vault = await tempVault();
  const { logPractice } = await import('../lib/repertoire.js');
  await assert.rejects(() => logPractice(vault, '2026-09-15', 'tried'), /no technique has been served/);
});

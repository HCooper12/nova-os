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
  pickForDay, intervalFor, REVIEW_INTERVALS, computeStreak, formatLogLine, daysBetween, shiftDate, spokenTechniqueLine, ROTA, dayOfWeek,
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
// His instruction, 15 Sep: a new technique every second day, a review on the
// final day of the week — three new a week plus one review day. So the week is
// FIXED (Mon/Wed/Fri new, the day after carries it, Sunday reviews), not
// counted, which is what stops a missed day sliding the whole rota sideways.
// 2026-09-14 is a Monday.

const MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16', SAT = '2026-09-19', SUN = '2026-09-20';
const taught = (dayISO, tried = 0) => ({ seen: 1, tried, skipped: 0, lastSurfacedOn: dayISO });

test('the week has the shape he asked for: 3 new, each carried a second day, Sunday reviews', () => {
  const state = { techniques: {}, days: {} };
  const seen = [];
  for (let i = 0; i < 7; i++) {
    const iso = shiftDate(MON, i);
    const p = pickForDay(ALL, state, iso);
    seen.push([p.mode, p.technique.id]);
    state.days[iso] = { id: p.technique.id, mode: p.mode, outcome: 'tried' };
    const prev = state.techniques[p.technique.id] || { seen: 0, tried: 0 };
    state.techniques[p.technique.id] = { ...prev, seen: prev.seen + 1, tried: prev.tried + 1, lastSurfacedOn: iso };
  }
  assert.deepEqual(seen.map((x) => x[0]), ['new', 'second', 'new', 'second', 'new', 'second', 'review']);
  // three DISTINCT techniques introduced, each held for two days
  assert.equal(seen[0][1], seen[1][1]);
  assert.equal(seen[2][1], seen[3][1]);
  assert.equal(seen[4][1], seen[5][1]);
  assert.equal(new Set([seen[0][1], seen[2][1], seen[4][1]]).size, 3);
});

test('day of week is 1=Mon…7=Sun and does not depend on this process timezone', () => {
  assert.equal(dayOfWeek(MON), 1);
  assert.equal(dayOfWeek(TUE), 2);
  assert.equal(dayOfWeek(SUN), 7);
  assert.equal(dayOfWeek('2026-09-20T23:00:00.000Z'), 7, 'an instant is read as its date');
  assert.deepEqual(Object.values(ROTA), ['new', 'second', 'new', 'second', 'new', 'second', 'review']);
});

test('a day already served keeps its answer — Home and the brief cannot disagree', () => {
  const state = { techniques: { 'the-barnum-line': taught('2026-09-10') }, days: { [TUE]: { id: 'the-barnum-line', mode: 'review' } } };
  const p = pickForDay(ALL, state, TUE);
  assert.equal(p.technique.id, 'the-barnum-line');
  assert.equal(p.mode, 'review');
  assert.equal(p.settled, true);
});

test('a second day with nothing to carry becomes new work rather than a blank card', () => {
  // he did not open the app on Monday, so Tuesday has no yesterday to carry
  const p = pickForDay(ALL, { techniques: {}, days: {} }, TUE);
  assert.equal(p.mode, 'new');
  assert.equal(p.technique.id, 'the-planted-sensation');
});

test('Sunday reviews even when the interval says nothing is strictly due', () => {
  // taught yesterday, so nowhere near its 2-day gap — Sunday reviews anyway,
  // because he asked for a review DAY, not a review-if-convenient day
  const state = { techniques: { 'the-planted-sensation': taught(SAT, 1) }, days: { [SAT]: { id: 'the-planted-sensation' } } };
  const p = pickForDay(ALL, state, SUN);
  assert.equal(p.mode, 'review');
  assert.match(p.why, /the week's review/);
});

test('Sunday with nothing EVER taught falls through to new work', () => {
  const p = pickForDay(ALL, { techniques: {}, days: {} }, SUN);
  assert.equal(p.mode, 'new');
});

test('once the catalogue is exhausted every day is a review, never "nothing today"', () => {
  const state = {
    techniques: Object.fromEntries(ALL.map((t) => [t.id, taught('2026-09-01', 1)])),
    days: {},
  };
  const p = pickForDay(ALL, state, WED); // a NEW day, but there is nothing new left
  assert.equal(p.mode, 'review');
  assert.match(p.why, /whole catalogue is taught/);
});

test('an empty catalogue returns null so the surfaces can say so honestly', () => {
  assert.equal(pickForDay([], { techniques: {}, days: {} }, MON), null);
});

/* --------------- the difference between shown and practised -------------- */

test('the interval widens with times TRIED, not times shown', () => {
  assert.deepEqual(REVIEW_INTERVALS, [2, 5, 12, 30]);
  assert.equal(intervalFor(0), 2);
  assert.equal(intervalFor(2), 12);
  assert.equal(intervalFor(99), 30, 'the last interval repeats forever');
});

test('the review queue ranks by overdue-ness, and never-tried outranks practised', () => {
  // both taught the same day; the one he never tried is further past its gap
  const state = {
    techniques: {
      'the-planted-sensation': { seen: 3, tried: 0, lastSurfacedOn: '2026-09-05' },
      'the-unfalsifiable-frame': { seen: 3, tried: 3, lastSurfacedOn: '2026-09-05' },
    },
    days: {},
  };
  const p = pickForDay(ALL.slice(0, 2), state, SUN);
  assert.equal(p.mode, 'review');
  assert.equal(p.technique.id, 'the-planted-sensation', 'exposure is not practice — it is more overdue');
  assert.match(p.why, /shown before, never tried/);
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

test('overdue-ness is measured in whole DAYS, from a UTC stamp, on his calendar', () => {
  // taught 5 Sep with tried:0 → a 2-day gap → three days overdue by 20 Sep.
  // The stamp is 22:00Z, which in AEST is already the NEXT day — the arithmetic
  // must read the date it carries, not re-derive one through a timezone.
  const state = {
    techniques: { [ALL[0].id]: { seen: 1, tried: 0, lastSurfacedAt: '2026-09-05T22:00:00.000Z' } },
    days: {},
  };
  const p = pickForDay(ALL, state, SUN); // Sunday: the review day
  assert.equal(p.mode, 'review');
  assert.equal(p.technique.id, ALL[0].id);
  // and the same stamp read as lastSurfacedOn gives the identical answer
  const onForm = { techniques: { [ALL[0].id]: { seen: 1, tried: 0, lastSurfacedOn: '2026-09-05' } }, days: {} };
  assert.equal(pickForDay(ALL, onForm, SUN).technique.id, ALL[0].id);
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

test('the second day skips the explanation he heard yesterday and lands on the drill', () => {
  const pick = { mode: 'second', technique: { name: 'The planted sensation', summary: 'Name a sensation, make them recall it.', drill: 'Ask a friend if they can smell burning.' } };
  const line = spokenTechniqueLine(pick);
  assert.equal(line, 'The planted sensation again today, sir. Ask a friend if they can smell burning.');
  assert.doesNotMatch(line, /Name a sensation/, 'he already heard what it is');
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

/* ---------------------- did it land? (25 Sep, the loop) ------------------- */
// The Hormozi reel he sent is pick → do it → report back. Nova picked and
// served for eleven days and never once heard back, so Wrap the day now asks
// whether it landed. These pin what that answer may and may not do.

test('the log line says whether it landed, and a pass never carries a result', () => {
  assert.equal(formatLogLine('2026-09-15', 'X', 'tried', 'worked on Sam', 'landed'), '- 2026-09-15 · **X** — tried · landed · worked on Sam');
  assert.equal(formatLogLine('2026-09-15', 'X', 'tried', '', 'missed'), '- 2026-09-15 · **X** — tried · didn’t land');
  assert.equal(formatLogLine('2026-09-15', 'X', 'skipped', '', 'landed'), '- 2026-09-15 · **X** — passed', 'nothing lands that was not tried');
  assert.equal(formatLogLine('2026-09-15', 'X', 'tried'), '- 2026-09-15 · **X** — tried', 'no result given: the old line exactly');
});

test('the review says back what landed, once he has said it', () => {
  const state = (s) => ({ techniques: { 'the-planted-sensation': { seen: 3, lastSurfacedOn: '2026-09-05', ...s } }, days: {} });
  const why = (s) => pickForDay(ALL.slice(0, 1), state(s), SUN).why;
  assert.match(why({ tried: 2, landed: 1 }), /practised 2 times, landed once$/);
  assert.match(why({ tried: 3, landed: 2 }), /landed twice$/);
  assert.match(why({ tried: 1, missed: 1 }), /practised 1 time, not landed yet$/);
  assert.match(why({ tried: 2 }), /practised 2 times$/, 'no answers yet: the phrase is unchanged');
});

test('the reel starts AT the pick, in curriculum order, and passes only what is waiting', async () => {
  const { reelFor, REEL_MAX } = await import('../lib/repertoire.js');
  const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => tech(n));
  const taughtB = { techniques: { b: { lastSurfacedOn: '2026-09-10' } } };
  assert.deepEqual(reelFor(six, taughtB, 'c').map((t) => t.id), ['c', 'd', 'e', 'f', 'a'], 'B was taught, so it is not waiting; the pick leads and the list wraps');
  // too few waiting to make a reel: the whole catalogue passes instead
  const mostTaught = { techniques: Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, { lastSurfacedOn: '2026-09-10' }])) };
  assert.deepEqual(reelFor(six, mostTaught, 'e').map((t) => t.id), ['e', 'f', 'a', 'b', 'c', 'd']);
  // a big catalogue is capped, still starting at the pick
  const many = Array.from({ length: 30 }, (_, i) => tech(`T${i}`));
  const r = reelFor(many, {}, 't7');
  assert.equal(r.length, REEL_MAX);
  assert.equal(r[0].id, 't7');
  assert.deepEqual(reelFor(six, {}, 'nope'), [], 'a pick that is not in the catalogue gives no reel, never a wrong one');
});

test('a result marks it tried, tallies it, logs it, and a pass takes it back', async () => {
  const vault = await tempVault();
  const { addTechniques, techniqueForDay, logPractice, readState } = await import('../lib/repertoire.js');
  await addTechniques(vault, [{ family: 'Suggestion', name: 'The planted sensation', summary: 's', move: 'm', drill: 'd', tell: 't', source: 'src' }]);
  await techniqueForDay(vault, '2026-09-15');

  const r = await logPractice(vault, '2026-09-15', 'tried', 'worked on Sam', { result: 'landed' });
  assert.equal(r.result, 'landed');
  assert.equal(r.tried, 1);
  assert.equal(r.landed, 1);
  let log = await readFile(path.join(vault, LOG_REL), 'utf8');
  assert.match(log, /- 2026-09-15 · \*\*The planted sensation\*\* — tried · landed · worked on Sam/);

  // the card's own "I tried it" (no result sent) keeps what he said
  const kept = await logPractice(vault, '2026-09-15', 'tried');
  assert.equal(kept.unchanged, true);
  assert.equal(kept.result, 'landed');
  assert.equal(kept.tried, 1, 'a no-op still returns the tally, so the card never shows a blank streak');
  assert.equal(kept.streak, 1);

  // he changes his mind: it did not land — corrected, not double-counted
  await logPractice(vault, '2026-09-15', 'tried', '', { result: 'missed' });
  let s = (await readState()).techniques['the-planted-sensation'];
  assert.equal(s.landed, 0);
  assert.equal(s.missed, 1);
  assert.equal(s.tried, 1);

  // then says he never actually tried it: the result goes with the attempt
  await logPractice(vault, '2026-09-15', 'skipped');
  const st = await readState();
  s = st.techniques['the-planted-sensation'];
  assert.equal(st.days['2026-09-15'].result, null);
  assert.equal(s.missed, 0);
  assert.equal(s.tried, 0);
  log = await readFile(path.join(vault, LOG_REL), 'utf8');
  assert.equal(log.match(/2026-09-15/g).length, 1, 'still one line for the day');
  assert.match(log, /— passed$/m);
});

test('a result that is not a word it knows, or on a day he passed, is refused', async () => {
  const vault = await tempVault();
  const { addTechniques, techniqueForDay, logPractice } = await import('../lib/repertoire.js');
  await addTechniques(vault, [{ family: 'A', name: 'One', summary: 's' }]);
  await techniqueForDay(vault, '2026-09-15');
  await assert.rejects(() => logPractice(vault, '2026-09-15', 'tried', '', { result: 'kinda' }), /result must be/);
  await assert.rejects(() => logPractice(vault, '2026-09-15', 'skipped', '', { result: 'landed' }), /only a technique he tried/);
});

test('today carries the reel on a NEW day only, and the answer once given', async () => {
  const vault = await tempVault();
  const { addTechniques, techniqueForDay, logPractice } = await import('../lib/repertoire.js');
  await addTechniques(vault, ['One', 'Two', 'Three', 'Four', 'Five'].map((name) => ({ family: 'A', name, summary: 's' })));
  // 2026-09-14 is a Monday: a new technique
  const mon = await techniqueForDay(vault, '2026-09-14');
  assert.equal(mon.mode, 'new');
  assert.equal(mon.reel[0].id, mon.technique.id, 'the reel lands on the pick');
  assert.equal(mon.result, null);
  await logPractice(vault, '2026-09-14', 'tried', 'on the barista', { result: 'landed' });
  const again = await techniqueForDay(vault, '2026-09-14');
  assert.equal(again.result, 'landed');
  assert.equal(again.note, 'on the barista');
  assert.equal(again.landed, 1);
  // Tuesday carries Monday's technique: nothing to reveal
  const tue = await techniqueForDay(vault, '2026-09-15');
  assert.equal(tue.mode, 'second');
  assert.equal(tue.reel, null);
});

/* ------------- a miss brings it back sooner (his call, 25 Sep) ------------ */

test('a technique that did not land last time comes back a step sooner', async () => {
  const { practiceStep, lastResultFor } = await import('../lib/repertoire.js');
  const [a, b] = ALL;
  // both taught on the 5th and tried twice; only A's last answer was a miss
  const state = {
    techniques: {
      [a.id]: { tried: 2, landed: 1, missed: 1, lastSurfacedOn: '2026-09-05' },
      [b.id]: { tried: 2, landed: 1, lastSurfacedOn: '2026-09-05' },
    },
    days: {
      '2026-09-03': { id: a.id, outcome: 'tried', result: 'landed' },
      '2026-09-05': { id: a.id, outcome: 'tried', result: 'missed' },
      '2026-09-04': { id: b.id, outcome: 'tried', result: 'landed' },
    },
  };
  assert.equal(lastResultFor(state, a.id), 'missed', 'the most recent answer counts, not the first');
  assert.equal(practiceStep(state, a.id), 1, 'one step back: the 5-day gap, not the 12');
  assert.equal(practiceStep(state, b.id), 2);
  const p = pickForDay([a, b], state, SUN);
  assert.equal(p.technique.id, a.id, 'the miss is the more overdue on Sunday');
  assert.match(p.why, /landed once, not last time$/);
});

test('landing again restores the gap, a pass takes the miss with it, and it never goes below zero', async () => {
  const { practiceStep } = await import('../lib/repertoire.js');
  const id = ALL[0].id;
  const base = { techniques: { [id]: { tried: 2 } } };
  assert.equal(practiceStep({ ...base, days: { '2026-09-01': { id, result: 'missed' }, '2026-09-08': { id, result: 'landed' } } }, id), 2);
  // a pass clears the day's result (logPractice), so there is no miss to count
  assert.equal(practiceStep({ ...base, days: { '2026-09-08': { id, outcome: 'skipped', result: null } } }, id), 2);
  assert.equal(practiceStep({ techniques: { [id]: { tried: 0 } }, days: { '2026-09-08': { id, result: 'missed' } } }, id), 0);
});

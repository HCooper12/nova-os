// The summary Home's pure builders (src/summaryFacts.js) and its Pinned
// order (src/pinned.js) — the sentence ladder, the Today strip, and the
// trend arrows all have to survive a clock they don't own and never
// disagree with the rings they sit beside (HOME-REDESIGN-PLAN.md §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shortLabel, stripSlots, nextLine, buildHighlight, buildTrends, summaryStandfirst,
} from '../../src/summaryFacts.js';
import { reconcilePinned, movePinned, PINNED_CARDS } from '../../src/pinned.js';
import { prLift, prBasis } from '../../src/missionFocus.js';

const joined = (segments) => segments.map((s) => s.t).join('');

// ---- shortLabel ----

test('shortLabel keeps whole words under the limit and drops emoji', () => {
  assert.equal(shortLabel('Deep work — video script 🎬'), 'Deep work');
  assert.equal(shortLabel('Gym'), 'Gym');
});

test('shortLabel stops at a standalone dash or bullet: the detail after it never rides along', () => {
  assert.equal(shortLabel('Gym — push day · wk 6'), 'Gym');
  assert.equal(shortLabel('Deep work — video script'), 'Deep work');
  assert.equal(shortLabel('Lunch · burrito bowl'), 'Lunch');
});

test('shortLabel never cuts a word in half, even one word over the limit', () => {
  // "Birthday" alone is 8 chars, "Birthday lunch" is 14 > 11 — stays at one word
  assert.equal(shortLabel('Birthday lunch', 11), 'Birthday');
  // a single word longer than max is still returned whole, never truncated
  assert.equal(shortLabel('Extraordinarily long single word', 5), 'Extraordinarily');
});

test('shortLabel on an emoji-only label keeps the emoji (plainLabel\'s own rule)', () => {
  assert.equal(shortLabel('🎉'), '🎉');
});

// ---- stripSlots ----

const DAY_A = [
  { time: '07:00', end: '07:30', label: 'Coffee', now: false, past: true, until: null, categoryHue: '1,1,1' },
  { time: '12:30', end: '13:30', label: 'Lunch — burrito bowl', now: true, past: false, until: null, categoryHue: '2,2,2' },
  { time: '15:30', end: '16:00', label: 'Work block', now: false, past: false, until: 'in 3h', categoryHue: '3,3,3' },
  { time: '17:00', end: '17:30', label: 'Gym', now: false, past: false, until: null, categoryHue: '4,4,4' },
  { time: '19:30', end: '21:00', label: 'Birthday lunch', now: false, past: false, until: null, categoryHue: '5,5,5' },
  { time: '21:30', end: '23:00', label: 'Night routine', now: false, past: false, until: null, categoryHue: '6,6,6' },
];

test('stripSlots reads past → now → next in time order, Now first-or-second, padded from the past', () => {
  const { slots, empty } = stripSlots(DAY_A);
  assert.equal(empty, null);
  assert.ok(slots.length <= 6);
  assert.equal(slots.length, 6, 'one past event pads the strip up to a full 6');
  const nowIndex = slots.findIndex((s) => s.kind === 'now');
  assert.ok(nowIndex === 0 || nowIndex === 1, `Now should lead or sit second, got index ${nowIndex}`);
  assert.equal(slots[nowIndex].time, 'Now');
  // "Birthday lunch" (14 chars) and "Night routine" (13) both run past the
  // default 11-char limit, so shortLabel keeps only their first word
  assert.deepEqual(slots.map((s) => s.label), ['Coffee', 'Lunch', 'Work block', 'Gym', 'Birthday', 'Night']);
  assert.deepEqual(slots.map((s) => s.kind), ['past', 'now', 'next', 'next', 'next', 'next']);
});

test('stripSlots pads from history and stops when history runs out, never fabricating a slot', () => {
  const short = [
    { time: '09:00', end: '09:30', label: 'Standup', now: false, past: true, until: null, categoryHue: '1,1,1' },
    { time: '12:00', end: '12:30', label: 'Lunch', now: true, past: false, until: null, categoryHue: '2,2,2' },
    { time: '17:00', end: '17:30', label: 'Gym', now: false, past: false, until: 'in 5h', categoryHue: '3,3,3' },
  ];
  const { slots } = stripSlots(short);
  assert.equal(slots.length, 3, 'only 3 real events exist — the strip never invents a 4th');
  assert.deepEqual(slots.map((s) => s.kind), ['past', 'now', 'next']);
});

test('stripSlots anchors on the most recent past event when nothing is live', () => {
  const allPast = [
    { time: '07:00', end: '07:30', label: 'Coffee', now: false, past: true, until: null, categoryHue: '1,1,1' },
    { time: '09:00', end: '10:00', label: 'Meeting', now: false, past: true, until: null, categoryHue: '2,2,2' },
  ];
  const { slots } = stripSlots(allPast);
  assert.deepEqual(slots.map((s) => s.label), ['Coffee', 'Meeting']);
  assert.deepEqual(slots.map((s) => s.kind), ['past', 'past']);
});

test('stripSlots with nothing past or now (early morning) lists the future plainly', () => {
  const allFuture = [
    { time: '09:00', end: '10:00', label: 'Meeting', now: false, past: false, until: 'in 1h', categoryHue: '1,1,1' },
    { time: '14:00', end: '15:00', label: 'Call', now: false, past: false, until: null, categoryHue: '2,2,2' },
  ];
  const { slots } = stripSlots(allFuture);
  assert.deepEqual(slots.map((s) => s.kind), ['next', 'next']);
});

test('stripSlots reports the placeholder label as `empty`, not a fake slot', () => {
  assert.deepEqual(stripSlots([{ time: '', label: 'Nothing on the calendar today' }]), { slots: [], empty: 'Nothing on the calendar today' });
  assert.deepEqual(stripSlots([{ time: '', label: 'Calendar not connected — set iCloud credentials in server/.env' }]).empty,
    'Calendar not connected — set iCloud credentials in server/.env');
});

// ---- nextLine ----

test('nextLine describes the current block by its end, and names the one after it', () => {
  const nl = nextLine(DAY_A);
  assert.deepEqual(nl, { lead: { b: 'Lunch — burrito bowl', rest: 'until 13:30' }, then: 'then Work block' });
});

const DAY_E = [
  { time: '09:00', end: '11:00', label: 'Deep work', now: false, past: true, until: null, categoryHue: '1,1,1' },
  { time: '15:30', end: '16:00', label: 'Work block', now: false, past: false, until: 'in 2h', categoryHue: '2,2,2' },
  { time: '19:30', end: '21:00', label: 'Birthday lunch 🎂', now: false, past: false, until: null, categoryHue: '3,3,3' },
];

test('nextLine with nothing live describes the next block by its start, and names the one after that', () => {
  const nl = nextLine(DAY_E);
  assert.deepEqual(nl, { lead: { b: 'Work block', rest: 'at 15:30' }, then: 'then Birthday lunch' });
});

test('nextLine is null when the day has no real events at all', () => {
  assert.equal(nextLine([{ time: '', label: 'Nothing on the calendar today' }]), null);
  assert.equal(nextLine([]), null);
});

// ---- buildHighlight ----

test('buildHighlight rung 1 (protein): the sentence and the axis read the SAME ring the Body card shows', () => {
  const hi = buildHighlight({
    ringVitals: [{ key: 'protein', value: '40', small: '/150G', pct: 27, state: 'behind' }],
    focalVital: 'protein', todayEvents: [], hour: 15,
  });
  assert.equal(hi.key, 'protein');
  assert.equal(joined(hi.segments), "You're 110 g under today's floor.");
  assert.equal(hi.axis, '40 of 150 g');
  assert.equal(hi.pct, 27);
  assert.deepEqual(hi.act, { label: 'Find 110 g', kind: 'recipes' });
});

test('buildHighlight rung 1 (protein, no floor set): no invented target', () => {
  const hi = buildHighlight({
    ringVitals: [{ key: 'protein', value: '62', small: '', pct: 0, state: 'behind' }],
    focalVital: 'protein', todayEvents: [], hour: 15,
  });
  assert.equal(joined(hi.segments), 'Protein sits at 62 g — no floor set.');
  assert.equal(hi.pct, null);
  assert.deepEqual(hi.act, { label: 'Set a floor', kind: 'recipes' });
});

test('buildHighlight rung 1 (steps): the TO GO figure in the hint drives the sentence', () => {
  const hi = buildHighlight({
    ringVitals: [{ key: 'steps', value: '2,361', small: '', pct: 24, hint: '24% · 7,639 TO GO', state: 'missed' }],
    focalVital: 'steps', todayEvents: [], hour: 15,
  });
  assert.equal(joined(hi.segments), '7,639 steps still on the plan.');
  assert.equal(hi.axis, '2,361 today');
});

test('buildHighlight rung 1 (steps, no TO GO in the hint): falls back to the percentage', () => {
  const hi = buildHighlight({
    ringVitals: [{ key: 'steps', value: '500', small: '', pct: 5, hint: 'goal reached', state: 'behind' }],
    focalVital: 'steps', todayEvents: [], hour: 15,
  });
  assert.equal(joined(hi.segments), 'Steps sit at 500 — 5% of the goal.');
});

test('buildHighlight rung 1 (sleep and readiness)', () => {
  const sleep = buildHighlight({
    ringVitals: [{ key: 'sleep', value: '5:40', pct: 71, state: 'behind' }],
    focalVital: 'sleep', todayEvents: [], hour: 8,
  });
  assert.equal(joined(sleep.segments), 'Sleep came in at 5:40 — 71% of eight hours.');
  assert.equal(sleep.act, null);

  const readiness = buildHighlight({
    ringVitals: [{ key: 'readiness', value: '41', pct: 41, hint: 'LOW HRV VS BASELINE', state: 'missed' }],
    focalVital: 'readiness', todayEvents: [], hour: 8,
  });
  assert.equal(joined(readiness.segments), 'Readiness reads 41 — go easy today.');
  assert.equal(readiness.axis, 'low hrv vs baseline');
  assert.deepEqual(readiness.act, { label: 'Open Train', kind: 'train' });
});

test('buildHighlight skips an absent focal ring rather than reporting a hole as a fact', () => {
  const hi = buildHighlight({
    ringVitals: [{ key: 'protein', value: '—', small: '', pct: 0, state: 'absent' }],
    focalVital: 'protein', todayEvents: [], hour: 15,
  });
  assert.notEqual(hi.key, 'protein');
});

test('buildHighlight rung 2 (the one thing): the plan\'s own settle count, not a re-derived one', () => {
  const hi = buildHighlight({
    oneThing: { text: 'The podcast write-up', mark: () => {} },
    planToday: { priorities: [{ outcome: 'done' }, { seen: 'x' }, {}] },
    todayEvents: [], hour: 15,
  });
  assert.equal(hi.key, 'one');
  assert.equal(joined(hi.segments), "Today's one thing: The podcast write-up");
  assert.equal(hi.pct, 67);
  assert.equal(hi.axis, '2 of 3 settled');
  assert.deepEqual(hi.act, { label: 'Done', kind: 'done' });
});

test('buildHighlight rung 2 without a mark() gets no act', () => {
  const hi = buildHighlight({ oneThing: { text: 'x' }, planToday: { priorities: [{}] }, todayEvents: [], hour: 15 });
  assert.equal(hi.act, null);
});

test('buildHighlight rung 3 (current event) matches nextLine\'s current case', () => {
  const hi = buildHighlight({ todayEvents: DAY_A, hour: 13 });
  assert.equal(hi.key, 'next');
  assert.equal(joined(hi.segments), 'Lunch — burrito bowl until 13:30.');
  assert.equal(hi.axis, 'then Work block');
  assert.deepEqual(hi.act, { label: 'Calendar', kind: 'calendar' });
});

test('buildHighlight rung 3 (upcoming event) reads "Clear until X, then Y"', () => {
  const hi = buildHighlight({ todayEvents: DAY_E, hour: 12 });
  assert.equal(joined(hi.segments), 'Clear until 15:30, then Work block.');
  assert.equal(hi.axis, 'then Birthday lunch');
});

test('buildHighlight rung 4 (clear): every ring good says so, anything else is just quiet', () => {
  const allGood = buildHighlight({
    ringVitals: [{ key: 'protein', state: 'good' }, { key: 'steps', state: 'good' }],
    todayEvents: [], hour: 20,
  });
  assert.equal(joined(allGood.segments), 'All four are on track.');

  const mixed = buildHighlight({
    ringVitals: [{ key: 'protein', state: 'good' }, { key: 'sleep', state: 'absent' }],
    todayEvents: [], hour: 20,
  });
  assert.equal(joined(mixed.segments), 'Nothing is behind right now.');
});

// ---- buildTrends ----

const TODAY = '2026-09-26';
function daysBack(n, fields) {
  const d = new Date(2026, 8, 26 - n, 12);
  const p2 = (x) => String(x).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, ...fields };
}

test('buildTrends: an unbroken week of goal days reads as an up streak', () => {
  const healthDays = [6, 5, 4, 3, 2, 1, 0].map((n) => daysBack(n, { steps: 11000 }));
  const [steps] = buildTrends({ healthDays, stepGoal: 10000, today: TODAY });
  assert.deepEqual(steps, { key: 'steps', label: 'Steps', dir: 'up', value: '7 days' });
});

test('buildTrends: an unbroken week of misses reads as a down streak', () => {
  const healthDays = [2, 1, 0].map((n) => daysBack(n, { steps: 4000 }));
  const [steps] = buildTrends({ healthDays, stepGoal: 10000, today: TODAY });
  assert.deepEqual(steps, { key: 'steps', label: 'Steps', dir: 'dn', value: '3 days' });
});

test('buildTrends: a mixed week reads as flat/mixed, not a false streak', () => {
  const healthDays = [daysBack(2, { steps: 11000 }), daysBack(1, { steps: 4000 }), daysBack(0, { steps: 11000 })];
  const [steps] = buildTrends({ healthDays, stepGoal: 10000, today: TODAY });
  assert.deepEqual(steps, { key: 'steps', label: 'Steps', dir: 'flat', value: 'mixed' });
});

test('buildTrends: the streak is the RUN ending today — a break earlier in the week does not erase it', () => {
  // miss, miss, then three goal days: the glance wants "3 days up", not "mixed"
  const healthDays = [daysBack(4, { steps: 4000 }), daysBack(3, { steps: 3000 }), daysBack(2, { steps: 11000 }), daysBack(1, { steps: 12000 }), daysBack(0, { steps: 10500 })];
  const [steps] = buildTrends({ healthDays, stepGoal: 10000, today: TODAY });
  assert.deepEqual(steps, { key: 'steps', label: 'Steps', dir: 'up', value: '3 days' });
  // ...and a run of misses ending today reads down, however good the week began
  const dn = [daysBack(3, { steps: 11000 }), daysBack(2, { steps: 11000 }), daysBack(1, { steps: 4000 }), daysBack(0, { steps: 2000 })];
  const [stepsDn] = buildTrends({ healthDays: dn, stepGoal: 10000, today: TODAY });
  assert.deepEqual(stepsDn, { key: 'steps', label: 'Steps', dir: 'dn', value: '2 days' });
});

test('buildTrends: fewer than 2 readings is honestly "no data", not a guess', () => {
  const healthDays = [daysBack(0, { steps: 11000 })];
  const [steps] = buildTrends({ healthDays, stepGoal: 10000, today: TODAY });
  assert.deepEqual(steps, { key: 'steps', label: 'Steps', dir: 'none', value: 'no data' });
});

test('buildTrends: protein reads floorMet off nutritionWeek.days, separately from healthDays', () => {
  const nutritionWeek = { days: [1, 0].map((n) => daysBack(n, { p: 160, floorMet: true })) };
  const [, protein] = buildTrends({ healthDays: [], nutritionWeek, today: TODAY });
  assert.deepEqual(protein, { key: 'protein', label: 'Protein', dir: 'up', value: '2 days' });
});

test('buildTrends: sleep treats a reported zero as "not reported" (IMPOSSIBLE_ZERO)', () => {
  const healthDays = [daysBack(2, { sleepAsleepMinutes: 420 }), daysBack(1, { sleepAsleepMinutes: 0 }), daysBack(0, { sleepAsleepMinutes: 430 })];
  const [, , sleep] = buildTrends({ healthDays, today: TODAY });
  // the zero day drops out entirely — only 2 real readings remain, both under goal
  assert.deepEqual(sleep, { key: 'sleep', label: 'Sleep', dir: 'dn', value: '2 days' });
});

test('buildTrends: HRV compares the last 3 readings against the ones before them', () => {
  const up = [4, 3, 2, 1, 0].map((n, i) => daysBack(n, { hrv: i < 2 ? 60 : 75 })); // before: 60,60 · last3: 75,75,75
  const [, , , hrvUp] = buildTrends({ healthDays: up, today: TODAY });
  assert.equal(hrvUp.dir, 'up');
  assert.equal(hrvUp.value, '+25%');

  const dn = [4, 3, 2, 1, 0].map((n, i) => daysBack(n, { hrv: i < 2 ? 80 : 60 })); // before: 80,80 · last3: 60,60,60
  const [, , , hrvDn] = buildTrends({ healthDays: dn, today: TODAY });
  assert.equal(hrvDn.dir, 'dn');
  assert.equal(hrvDn.value, '−25%', 'uses the real minus sign, not a hyphen');

  const steady = [4, 3, 2, 1, 0].map((n) => daysBack(n, { hrv: 70 }));
  const [, , , hrvSteady] = buildTrends({ healthDays: steady, today: TODAY });
  assert.deepEqual(hrvSteady, { key: 'hrv', label: 'HRV', dir: 'flat', value: 'steady' });

  const [, , , hrvNone] = buildTrends({ healthDays: [daysBack(0, { hrv: 70 })], today: TODAY });
  assert.deepEqual(hrvNone, { key: 'hrv', label: 'HRV', dir: 'none', value: 'no data' });
});

test('buildTrends always returns exactly the four rows, in order', () => {
  const rows = buildTrends({ healthDays: [], nutritionWeek: null, today: TODAY });
  assert.deepEqual(rows.map((r) => r.key), ['steps', 'protein', 'sleep', 'hrv']);
  assert.ok(rows.every((r) => r.dir === 'none' && r.value === 'no data'));
});

// ---- reconcilePinned / movePinned ----

test('reconcilePinned drops a retired key and appends a new one in meta order', () => {
  const meta = [...PINNED_CARDS, ['newcard', 'New card']];
  const list = reconcilePinned({ order: ['trends', 'retired', 'body'], off: [] }, meta);
  assert.deepEqual(list.map((x) => x.key), ['trends', 'body', 'today', 'plan', 'waiting', 'training', 'practice', 'newcard']);
});

test('reconcilePinned keeps `off` as on=false, and defaults everything else on', () => {
  const list = reconcilePinned({ order: ['body', 'today'], off: ['today'] });
  assert.equal(list.find((x) => x.key === 'body').on, true);
  assert.equal(list.find((x) => x.key === 'today').on, false);
  assert.equal(list.find((x) => x.key === 'trends').on, true, 'never-saved keys default on');
});

test('reconcilePinned treats garbage input as empty — the house default order, all on', () => {
  for (const garbage of [null, undefined, 'nope', 42, []]) {
    const list = reconcilePinned(garbage);
    assert.deepEqual(list.map((x) => x.key), PINNED_CARDS.map((x) => x[0]));
    assert.ok(list.every((x) => x.on));
  }
});

test('movePinned reorders, and an out-of-range move is a no-op returning the same array', () => {
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  assert.deepEqual(movePinned(list, 0, 2), [{ key: 'b' }, { key: 'c' }, { key: 'a' }]);
  assert.equal(movePinned(list, 0, 9), list);
  assert.equal(movePinned(list, -1, 1), list);
});

// ---- summaryStandfirst ----

test('summaryStandfirst passes the tagline through when there is no collision', () => {
  assert.equal(summaryStandfirst({ taglineTopic: 'routine', tagline: 'Push day at 17:30.', highlightKey: 'protein', todayEvents: [] }),
    'Push day at 17:30.');
});

test('summaryStandfirst on a protein/steps collision falls back to the next-event sentence', () => {
  const sf = summaryStandfirst({ taglineTopic: 'protein', tagline: '54 g of protein left to close tonight.', highlightKey: 'protein', todayEvents: DAY_A });
  assert.equal(sf, 'Lunch — burrito bowl until 13:30.');
});

test('summaryStandfirst falls back to the Recovery sentence when the highlight IS the next-event rung', () => {
  const heroStand = [
    { t: 'Recovery reads ' }, { t: 'strong', b: 1 }, { t: '. ' },
    { t: 'Tonight: ' }, { t: 'Upper Body', b: 1 }, { t: '.' },
  ];
  const sf = summaryStandfirst({ taglineTopic: 'next', tagline: 'Clear until 15:30, then Work block.', highlightKey: 'next', todayEvents: DAY_E, heroStand });
  assert.equal(sf, 'Recovery reads strong.');
});

test('summaryStandfirst returns null when a collision has nothing honest to fall back to', () => {
  assert.equal(summaryStandfirst({ taglineTopic: 'next', tagline: 'x', highlightKey: 'next', todayEvents: DAY_E, heroStand: [] }), null);
  assert.equal(summaryStandfirst({ taglineTopic: 'protein', tagline: 'x', highlightKey: 'protein', todayEvents: [] }), null);
});

// ---- prLift / prBasis (moved from MissionStructured.jsx / MissionControl.jsx) ----

test('prLift: an actual weight and reps, in his units', () => {
  assert.equal(prLift({ weight: 30, reps: 10 }), '30kg × 10');
});

test('prLift: an estimated 1RM is labelled as an estimate, never printed as if lifted', () => {
  assert.equal(prLift({ kind: 'e1rm', value: 11.2 }), 'est. 1RM 11.2kg');
});

test('prBasis: heaviest yet, with the delta arrow only when it actually improved', () => {
  assert.equal(prBasis({ kind: 'weight', value: 30, previous: 27.5 }), 'heaviest yet ▲2.5');
  assert.equal(prBasis({ kind: 'weight', value: 30, previous: null }), 'heaviest yet');
});

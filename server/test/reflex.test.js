// The Reflex Layer's contract: strict match, exact numbers, honest dates,
// NEVER guess (missing data falls through to the model), and analytical
// questions always reach real thought.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tryReflex } from '../lib/reflex.js';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = local(new Date());
const YESTERDAY = local(new Date(Date.now() - 86_400_000));

const deps = {
  recentDays: async () => [
    { date: YESTERDAY, steps: 8538, hrv: 61.4, weightKg: 82.7 },
    { date: TODAY, steps: 10986 },
  ],
  foodToday: async () => ({ entries: [
    { macros: { p: 42, kcal: 610 } },
    { macros: { p: 38, kcal: 540 } },
  ] }),
  pendingCount: async () => 60,
};

test('reflex: direct data questions answer from the live record with exact numbers', async () => {
  const steps = await tryReflex('What are my steps today?', deps);
  assert.match(steps.text, /10,986/);
  const yest = await tryReflex('how many steps yesterday', deps);
  assert.match(yest.text, /8,538/);
  assert.match(yest.text, /yesterday/);
  const hrv = await tryReflex('Hey Nova, what is my HRV?', deps);
  assert.match(hrv.text, /61 milliseconds/);
  assert.match(hrv.text, /yesterday/, 'a dated reading names its date — honest, never passed off as today');
  const weight = await tryReflex("what's my weight", deps);
  assert.match(weight.text, /82\.7 kilograms/);
  const protein = await tryReflex('how much protein today', deps);
  assert.match(protein.text, /80 grams/);
  const inbox = await tryReflex('anything pending for me?', deps);
  assert.match(inbox.text, /60/);
});

test('reflex: analytical or open questions always fall through to the model', async () => {
  for (const q of [
    'why are my steps so low today?',
    'should I train today given my HRV?',
    'how do my steps compare to last week',
    'what was my average HRV this month',
    'tell me about my training',
    'Brief me on my day — recovery, calendar, fuel, training, anything waiting on me.',
  ]) {
    assert.equal(await tryReflex(q, deps), null, `must not reflex: ${q}`);
  }
});

test('reflex: missing data means silence, never a guess', async () => {
  const empty = { ...deps, recentDays: async () => [] };
  assert.equal(await tryReflex('what are my steps today', empty), null);
  assert.equal(await tryReflex('what is my hrv', empty), null);
  const failing = { ...deps, pendingCount: async () => { throw new Error('boom'); } };
  assert.equal(await tryReflex('anything pending?', failing), null, 'a failing source falls through, never errors the ask');
});

// ---- [04] plans 4 + 5: sleep, resting heart rate, today's calendar; every number draws a card ----
test('reflex: sleep and resting heart rate answer from the loaded days, dated honestly, each with a card', async () => {
  const d = {
    ...deps,
    recentDays: async () => [
      { date: YESTERDAY, steps: 8538, hrv: 61.4, weightKg: 82.7, restingHeartRate: 52, sleepAsleepMinutes: 402 },
      { date: TODAY, steps: 10986, sleepAsleepMinutes: 431 },
    ],
  };
  const sleep = await tryReflex('how did I sleep last night', d);
  assert.equal(sleep.matched, 'sleep');
  assert.match(sleep.text, /7h 11m last night/);
  assert.equal(sleep.card.kind, 'metric');
  assert.equal(sleep.card.value, '7h 11m');
  const rhr = await tryReflex("what's my resting heart rate", d);
  assert.equal(rhr.matched, 'rhr');
  assert.match(rhr.text, /52 beats per minute — from yesterday/);
  assert.equal(rhr.card.unit, 'bpm');
  assert.equal(rhr.card.caption, 'YESTERDAY');
  // the older reflexes carry cards too
  const steps = await tryReflex('steps today', d);
  assert.equal(steps.card.label, 'STEPS');
  assert.equal(steps.card.value, '10,986');
  const protein = await tryReflex('how much protein today', d);
  assert.equal(protein.card.unit, 'g');
  // analytical phrasings still reach the model
  assert.equal(await tryReflex('why is my resting heart rate high', d), null);
  assert.equal(await tryReflex('is my sleep good enough', d), null);
});

test("reflex: today's calendar answers from the WARM cache only — a cold cache falls through to the model", async () => {
  const cached = [
    { date: TODAY, time: '09:30', end: '10:30', label: 'Cook block' },
    { date: TODAY, time: '13:20', end: '13:50', label: 'Workout' },
    { date: TODAY, time: '23:58', end: '23:59', label: 'Late thing' },
    { date: TODAY, time: null, label: 'Bin day' },
  ];
  const warm = { ...deps, calendarToday: async () => cached };
  const on = await tryReflex("what's on today", warm);
  assert.equal(on.matched, 'calendar-today');
  assert.match(on.text, /Late thing at 23:58/, 'the timed events still to come are listed');
  assert.equal(on.card, undefined, 'a list has no single number to draw');
  const next = await tryReflex("what's next", warm);
  assert.equal(next.matched, 'calendar-next');
  assert.match(next.text, /^Next up: .* at \d\d:\d\d/);
  const empty = await tryReflex('what is on my calendar today', { ...deps, calendarToday: async () => [] });
  assert.match(empty.text, /Nothing on the calendar today/);
  const cold = await tryReflex("what's on today", { ...deps, calendarToday: async () => null });
  assert.equal(cold, null, 'a cold cache is not an answer — the model waits on iCloud honestly');
});

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

test('reflex: "what\'s going on with X" answers from the record ledger, never from memory', async () => {
  const now = Date.now();
  const rec = { ...deps, records: async () => [
    { id: 'a1', kind: 'research', status: 'classifying', createdAt: new Date(now - 4 * 60_000).toISOString(), decision: { title: 'Research: creatine timing and sleep' } },
    { id: 'b2', kind: 'plan', status: 'pending', createdAt: new Date(now - 30 * 60_000).toISOString(), goal: 'watch the strength video then check its claims', decision: { title: 'Plan: watch the strength video then check its claims' } },
    { id: 'c3', kind: 'video', status: 'filed', createdAt: new Date(now - 5 * 86_400_000).toISOString(), decision: { title: 'Verdict: old video' } },
  ] };
  const r = await tryReflex("what's going on with the creatine research?", rec);
  assert.equal(r.matched, 'status');
  assert.match(r.text, /creatine/);
  assert.match(r.text, /still running — started 4 minutes ago/);
  const p = await tryReflex("how's the strength video plan going", rec);
  assert.match(p.text, /landed in your Inbox 30 minutes ago/);
  // older than two days, or nothing that matches → the model takes it
  assert.equal(await tryReflex("what's going on with the old video", rec), null);
  assert.equal(await tryReflex("what's going on with my reservation", rec), null);
  // an analytical question about a job is not a status read
  assert.equal(await tryReflex('why is the creatine research taking so long', rec), null);
});


// 14 Sep 2026: his morning push had not landed, and "what are my steps today"
// spent 41 SECONDS in the model and came back talking about protein. The step
// store is the only place a step count lives, so absence is this layer's
// answer, not the model's.
test('no reading for today is answered here, with the last real one, instead of costing 41s of model', async () => {
  const deps = {
    recentDays: async () => [
      { date: '2026-09-12', steps: 6121 },
      { date: YESTERDAY, steps: 9846 },
      { date: TODAY },                      // the row exists, the push has not landed
    ],
  };
  const r = await tryReflex('what are my steps today', deps);
  assert.ok(r, 'it answers rather than falling through');
  assert.equal(r.matched, 'steps-today-absent');
  assert.match(r.text, /No step count has come through for today yet/);
  assert.match(r.text, /9,846/, 'and says what the last real reading was');
  assert.match(r.text, /yesterday/);
  assert.equal(r.card.value, '9,846');
});

test('asked about yesterday with nothing for yesterday, it says so and dates the last one', async () => {
  const deps = { recentDays: async () => [{ date: '2026-09-12', steps: 6121 }] };
  const r = await tryReflex('how many steps yesterday', deps);
  assert.equal(r.matched, 'steps-yesterday-absent');
  assert.match(r.text, /for yesterday yet/);
  assert.match(r.text, /6,121 on 2026-09-12/);
});

test('but a store with no readings at all still goes to the model — that is a different problem', async () => {
  assert.equal(await tryReflex('what are my steps today', { recentDays: async () => [] }), null);
  assert.equal(await tryReflex('what are my steps today', { recentDays: async () => [{ date: TODAY }] }), null);
});


test('sleep: zero of his 56 day files have ever carried a figure, so this stops going to the model', async () => {
  const deps = { recentDays: async () => [{ date: YESTERDAY, steps: 9846 }, { date: TODAY, steps: 12 }] };
  const r = await tryReflex('how did I sleep last night', deps);
  assert.ok(r, 'answered here, not after five seconds of model');
  assert.equal(r.matched, 'sleep-absent');
  assert.match(r.text, /No sleep reading has come through/);
  assert.match(r.text, /Sleep Analysis/, 'and names the switch that would fix it');
  assert.equal(r.card.value, '—');
});

test('hrv and resting heart rate say the same thing, without guessing at a cause', async () => {
  const deps = { recentDays: async () => [{ date: TODAY, steps: 12 }] };
  const hrv = await tryReflex('what is my hrv', deps);
  assert.equal(hrv.matched, 'hrv-absent');
  assert.match(hrv.text, /No HRV reading has come through/);
  assert.ok(!/Sleep Analysis/.test(hrv.text), 'the setup hint belongs only to the one it explains');
  const rhr = await tryReflex('what is my resting heart rate', deps);
  assert.equal(rhr.matched, 'rhr-absent');
  assert.match(rhr.text, /resting heart rate reading/);
});

test('an empty store still goes to the model for all of them — no days is not the same as no reading', async () => {
  const deps = { recentDays: async () => [] };
  for (const q of ['how did I sleep last night', 'what is my hrv', 'what is my resting heart rate']) {
    assert.equal(await tryReflex(q, deps), null, q);
  }
});

// A PATTERN THAT MATCHES ONE PHRASING IS A REFLEX THAT MOSTLY DOES NOT FIRE.
// Found 14 Sep by asking Nova the way a person asks out loud: "what did I weigh
// last" missed and cost 16.4s of model to read back a number on disk; "how many
// things are in my inbox" cost 4.5s.
test('the direct asks fire however he phrases them', async () => {
  const deps = {
    recentDays: async () => [{ date: YESTERDAY, weightKg: 82.2, weightMeasuredOn: YESTERDAY }],
    pendingCount: async () => 4,
  };
  for (const q of ['what did I weigh last', 'what do I weigh', 'my weight', "what's my weight",
    'whats my weight', 'how much do I weigh', 'last weigh in', 'my last weight']) {
    const r = await tryReflex(q, deps);
    assert.ok(r && r.matched === 'weight', `weight should fire on: ${q}`);
    assert.match(r.text, /82\.2/);
  }
  for (const q of ['how many things are in my inbox', 'my inbox', 'how many drafts are pending',
    'anything pending', 'how many items do I have waiting', 'whats in my inbox']) {
    const r = await tryReflex(q, deps);
    assert.ok(r && r.matched === 'inbox', `inbox should fire on: ${q}`);
    assert.match(r.text, /4/);
  }
});

test('widening the phrasings did not widen what counts as a direct ask', async () => {
  const deps = { recentDays: async () => [{ date: YESTERDAY, weightKg: 82.2 }], pendingCount: async () => 4 };
  for (const q of ['why is my weight up', 'should I weigh less', 'what is my average weight',
    'is my weight good', 'how does my weight compare to last month', 'why is my inbox so full']) {
    assert.equal(await tryReflex(q, deps), null, `must still go to the model: ${q}`);
  }
});

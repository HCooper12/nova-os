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

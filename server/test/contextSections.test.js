// Named absence: an EMPTY section says nothing, a FAILED one is named to the
// model in the shared NOTE — never mistaken for thin logging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gatherContext, ABSENT_NOTE } from '../lib/contextSections.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('empty is silent, failed is named — and the prompt order is the array order', async () => {
  const { text, parts, failed } = await gatherContext([
    { label: 'profile', load: async () => 'PROFILE: he is Hayden' },
    { label: 'money', load: async () => { throw new Error('ledger.json: unexpected token'); } },
    { label: 'todos', load: async () => null }, // honestly empty
    { label: 'standing', load: () => 'STANDING: lift heavy' }, // a sync loader is fine
    { label: 'calendar', load: () => { throw new Error('sync throw'); } }, // a sync throw is a failure, not a crash
  ]);
  assert.deepEqual(parts, ['PROFILE: he is Hayden', 'STANDING: lift heavy']);
  assert.deepEqual(failed.map((f) => f.label), ['money', 'calendar']);
  assert.match(failed[0].reason, /unexpected token/);
  assert.ok(text.endsWith(ABSENT_NOTE(failed)), 'the NOTE is the last thing the model reads');
  assert.match(text, /NOTE — these context sections FAILED to load this turn \(an error or a timeout, NOT thin logging or an empty day\): money, calendar\./);
  assert.match(text, /never tell him to log more because of it/);
  assert.doesNotMatch(text, /todos/, 'an empty section is not a failure');
});

test('nothing failed → no NOTE; note:false → the caller names failures itself', async () => {
  const clean = await gatherContext([{ label: 'a', load: async () => 'A' }, { label: 'b', load: async () => '' }]);
  assert.equal(clean.text, 'A');
  assert.deepEqual(clean.failed, []);
  const quiet = await gatherContext([{ label: 'a', load: async () => 'A' }, { label: 'b', load: async () => { throw new Error('x'); } }], { note: false });
  assert.equal(quiet.text, 'A');
  assert.deepEqual(quiet.failed.map((f) => f.label), ['b']);
});

test('parallel with a deadline: a stalled section is FAILED and named as timed out — not silently absent', async () => {
  const t0 = Date.now();
  const { text, failed, parts } = await gatherContext([
    { label: 'quick', load: async () => 'Q' },
    { label: 'the brief', load: async () => { await sleep(400); return 'never arrives in time'; } },
    { label: 'slow but allowed', load: async () => { await sleep(120); return 'S'; }, ms: 1000 }, // its own leash overrides
  ], { parallel: true, ms: 60 });
  assert.ok(Date.now() - t0 < 350, 'the deadline bounds the wait — ran together, not in sequence');
  assert.deepEqual(parts, ['Q', 'S']);
  assert.deepEqual(failed.map((f) => f.label), ['the brief']);
  assert.match(failed[0].reason, /timed out after 0\.1s/);
  assert.match(text, /FAILED to load this turn .*: the brief\./);
});

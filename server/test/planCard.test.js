// THE PLAN HE WALKED AWAY FROM. His ask, 16 Sep: set a big task, go and do
// something else, come back to it ready. The planner already kept live
// per-step state and nothing ever showed it to him.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planCardFrom, elapsedLabel } from '../../src/planCard.js';

const plan = (over = {}) => ({
  id: 'p1', kind: 'plan', status: 'classifying',
  goal: 'find me three suppliers',
  startedAt: new Date(Date.now() - 7 * 60000).toISOString(),
  plan: { steps: [
    { id: 's1', what: 'search', status: 'done' },
    { id: 's2', what: 'read them', status: 'running' },
    { id: 's3', what: 'write it up' },
  ] },
  ...over,
});

test('a running plan says which steps are in and which is moving', () => {
  const c = planCardFrom([{ kind: 'note' }, plan()]);
  assert.equal(c.state, 'running');
  assert.equal(c.goal, 'find me three suppliers');
  assert.equal(c.total, 3);
  assert.equal(c.settled, 1);
  assert.equal(c.failedCount, 0);
  assert.equal(c.since, '7 min');
  // a step that has never started is 'waiting', NOT 'running' — that is the
  // whole question he is asking the card
  assert.deepEqual(c.steps.map((s) => s.status), ['done', 'running', 'waiting']);
  assert.equal(c.steps[1].error, null);
});

test('a finished plan is READY, and a proposal waiting on his yes is neither', () => {
  const done = { ...plan(), status: 'pending', finishedAt: new Date().toISOString() };
  assert.equal(planCardFrom([done]).state, 'ready');
  // proposed but never run: the Inbox asks for his approval, this card does not
  const proposed = { ...plan(), status: 'pending', finishedAt: undefined };
  assert.equal(planCardFrom([proposed]), null);
});

test('the thing still moving wins over the thing already finished', () => {
  const finished = { ...plan(), id: 'p0', status: 'pending', finishedAt: new Date().toISOString() };
  assert.equal(planCardFrom([finished, plan()]).id, 'p1');
});

test('a failed step is carried with its reason, and still counts as settled', () => {
  const c = planCardFrom([plan({ plan: { steps: [
    { id: 's1', what: 'search', status: 'done' },
    { id: 's2', what: 'read them', status: 'failed', error: 'the site refused' },
    { id: 's3', what: 'write it up', status: 'running' },
  ] } })]);
  assert.equal(c.settled, 2, 'failed is settled — it is no longer in flight');
  assert.equal(c.failedCount, 1);
  assert.equal(c.steps[1].error, 'the site refused');
  // a failure with no message still says something rather than nothing
  const bare = planCardFrom([plan({ plan: { steps: [{ id: 's1', status: 'failed' }] } })]);
  assert.equal(bare.steps[0].error, 'it failed');
  assert.equal(bare.steps[0].what, 'a step');
});

test('nothing to show is null, never an empty card', () => {
  assert.equal(planCardFrom([]), null);
  assert.equal(planCardFrom(null), null);
  assert.equal(planCardFrom([{ kind: 'capture', status: 'filed' }]), null);
  // a plan record with no steps yet has nothing to report on
  assert.equal(planCardFrom([plan({ plan: { steps: [] } })]), null);
});

test('elapsed is spoken the way he would say it', () => {
  const t = (mins) => elapsedLabel(new Date(Date.now() - mins * 60000).toISOString());
  assert.equal(t(0), 'just now');
  assert.equal(t(3), '3 min');
  assert.equal(t(59), '59 min');
  assert.equal(t(75), '1h 15m');
  assert.equal(elapsedLabel(null), '');
  assert.equal(elapsedLabel('not a date'), '');
});

// THE PLAN HE WALKED AWAY FROM. His ask, 16 Sep: set a big task, go and do
// something else, come back to it ready. The planner already kept live
// per-step state and nothing ever showed it to him.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planCardFrom, elapsedLabel, goalLine } from '../../src/planCard.js';

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
  // a record in his real inbox read "306h 4m" — past two days the hours stop
  // meaning anything and the number is just long
  assert.equal(t(47 * 60), '47h 0m');
  assert.equal(t(48 * 60), '2 days');
  assert.equal(t(12 * 24 * 60), '12 days');
  assert.equal(elapsedLabel(null), '');
  assert.equal(elapsedLabel('not a date'), '');
});

test('a skipped step is its own state on the card, never a waiting one', () => {
  const c = planCardFrom([plan({ status: 'pending', finishedAt: new Date().toISOString(), plan: { steps: [
    { id: 's1', what: 'find them', status: 'done' },
    { id: 's2', what: 'read the terms', status: 'failed', error: 'the site refused' },
    { id: 's3', what: 'write it up', status: 'skipped', error: 'it needed s2, which produced nothing' },
  ] } })]);
  assert.equal(c.done, 1);
  assert.equal(c.failedCount, 1);
  assert.equal(c.skippedCount, 1);
  assert.equal(c.settled, 3, 'skipped is settled — it is never coming back');
  // the line he reads first counts what LANDED, and names what did not
  assert.equal(c.tally, '1 of 3 · 1 failed · 1 skipped');
  assert.deepEqual(c.steps.map((s) => s.glyph), ['✓', '!', '–']);
  assert.equal(c.steps[2].error, 'it needed s2, which produced nothing');
  // a waiting step and a skipped one must not look alike
  assert.notEqual(LOOKUP(c, 's3').glyph, '·');
});
const LOOKUP = (card, id) => card.steps.find((s) => s.id === id);

test('a clean run claims nothing extra in its tally', () => {
  const c = planCardFrom([plan({ plan: { steps: [
    { id: 's1', what: 'one', status: 'done' }, { id: 's2', what: 'two', status: 'running' },
  ] } })]);
  assert.equal(c.tally, '1 of 2');
  assert.equal(c.skippedCount, 0);
});

test('a dictated goal reads as a sentence, not as an address', () => {
  // his real plan 3818f7ec opens with the YouTube URL it is about
  assert.equal(
    goalLine('https://www.youtube.com/watch?v=sxn5kPQ4Gl0 — watch and analyse this, then compare it'),
    'watch and analyse this, then compare it');
  assert.equal(goalLine('read https://a.com/x and summarise it'), 'read and summarise it');
  // ...but if the URL WAS the goal, a blank card is worse than an address
  assert.equal(goalLine('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(goalLine(''), '');
  assert.equal(planCardFrom([plan({ goal: '', text: '' })]).goal, 'a plan');
});

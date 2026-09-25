// THE WORKING GLASS: a research record's real stages become spoken lines and
// panels, written by code, narrated once each. Fixtures follow the shapes
// researcher.js actually writes (runPanel → updateRecord).
import test from 'node:test';
import assert from 'node:assert/strict';
import { researchStages, newStages, jobSettled } from '../../src/jobBeats.js';

const base = { id: 'r1', kind: 'research', text: 'Research: Is creatine loading necessary?', status: 'classifying' };
const W = (name, status = 'working', found = 0) => ({ name, status, found });
const panelOf = (workers, extra = {}) => {
  const back = workers.filter((w) => w.status !== 'working').length;
  return { total: workers.length, back, label: `${back} of ${workers.length} back`, workers, planned: true, ...extra };
};

test('a fresh record raises only the question', () => {
  const s = researchStages(base);
  assert.deepEqual(s.map((x) => x.key), ['go']);
  assert.equal(s[0].card.caption, 'Is creatine loading necessary?');
  assert.equal(s[0].card.kind, 'key');
});

test('the panel names the researchers, spoken as a sentence', () => {
  const rec = { ...base, panel: panelOf([W('Direct evidence'), W('The case against'), W('In practice')]) };
  const s = researchStages(rec);
  assert.deepEqual(s.map((x) => x.key), ['go', 'panel']);
  assert.equal(s[1].say, '3 researchers out: Direct evidence, The case against and In practice.');
  assert.equal(s[1].card.kind, 'list');
  assert.deepEqual(s[1].card.items.map((i) => i.note), ['OUT', 'OUT', 'OUT']);
});

test('each returning worker is its own stage with its real count', () => {
  const rec = { ...base, panel: panelOf([W('Direct evidence', 'done', 6), W('The case against', 'done', 0), W('In practice'), W('What is current', 'error')]) };
  const s = researchStages(rec);
  assert.deepEqual(s.map((x) => x.key), ['go', 'panel', 'back:Direct evidence', 'back:The case against', 'back:What is current']);
  assert.equal(s[2].say, 'Direct evidence is back with 6 findings.');
  assert.equal(s[3].say, 'The case against came back empty.');
  assert.equal(s[4].say, 'What is current failed.');
  assert.equal(s[4].card.foot, '3 of 4 back');
  assert.deepEqual(s[4].card.items.map((i) => i.note), ['6 FOUND', 'EMPTY', 'OUT', 'FAILED']);
});

test('merging counts findings from the done workers only', () => {
  const rec = { ...base, panel: panelOf([W('A', 'done', 6), W('B', 'done', 8), W('C', 'error')], { merging: true }) };
  const s = researchStages(rec);
  const m = s.find((x) => x.key === 'merging');
  assert.equal(m.say, 'All 3 back, 14 findings. Writing one brief.');
  assert.equal(m.card.kind, 'metric');
  assert.equal(m.card.value, '14');
  assert.equal(m.card.caption, 'FINDINGS · 3 ANGLES');
});

test('a repair and the brief, in order; merging stays true on a filed record and is not re-said', () => {
  const workers = [W('A', 'done', 6), W('B', 'done', 8)];
  const running = { ...base, panel: panelOf(workers, { merging: true, repairing: true }) };
  const done = { ...running, status: 'pending', decision: { title: 'Creatine Loading: Necessary or Not?' } };
  const first = newStages(running);
  assert.deepEqual(first.fresh.map((x) => x.key), ['go', 'panel', 'back:A', 'back:B', 'merging', 'repairing']);
  const second = newStages(done, first.seen);
  assert.deepEqual(second.fresh.map((x) => x.key), ['ready']);
  assert.equal(second.fresh[0].say, 'The brief is ready: Creatine Loading: Necessary or Not?. It is in your Inbox.');
  assert.equal(second.fresh[0].card.tone, 'good');
  // a third look at the same filed record narrates nothing
  const third = newStages({ ...done, status: 'filed' }, second.seen);
  assert.equal(third.fresh.length, 0);
  assert.equal(jobSettled(done), true);
  assert.equal(jobSettled(running), false);
});

test('a failed run says why and never claims a brief', () => {
  const rec = { ...base, status: 'error', error: 'all 4 researchers failed — rate limited', decision: { title: 'stale' } };
  const s = researchStages(rec);
  assert.equal(s[s.length - 1].key, 'error');
  assert.match(s[s.length - 1].say, /^The research failed: all 4 researchers failed/);
  assert.ok(!s.some((x) => x.key === 'ready'));
});

test('not a research record: nothing', () => {
  assert.deepEqual(researchStages({ kind: 'plan', status: 'classifying' }), []);
  assert.deepEqual(researchStages(null), []);
});

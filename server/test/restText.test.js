import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRestText } from '../../src/restText.js';

test('his real focus notes: the rest sentence is read and taken out, the rest of the note stays', () => {
  assert.deepEqual(parseRestText('Rest 2 minutes between sets'), { seconds: 120, range: false, rest: 'Rest 2 minutes between sets', without: '' });
  const a = parseRestText('Touch and pause on the chest every rep, elbows tucked. Rest 2 minutes between sets');
  assert.equal(a.seconds, 120);
  assert.equal(a.without, 'Touch and pause on the chest every rep, elbows tucked');
  const b = parseRestText('Shoulders pinned to the pad, 2 to 3 second lower. Rest 2 minutes');
  assert.equal(b.seconds, 120);
  assert.equal(b.without, 'Shoulders pinned to the pad, 2 to 3 second lower', 'a tempo is not a rest');
  const c = parseRestText('Chest up, slight lean, elbows to back pockets. Rest 2 minutes between sets');
  assert.equal(c.without, 'Chest up, slight lean, elbows to back pockets');
});

test('other wordings: seconds, words, trailing, leading number, and a note with no rest at all', () => {
  assert.equal(parseRestText('rest 90 seconds').seconds, 90);
  assert.equal(parseRestText('Rest 90s between sets').seconds, 90);
  assert.equal(parseRestText('rest two minutes').seconds, 120);
  assert.equal(parseRestText('Brace hard, rest 1.5 minutes after each set').seconds, 90);
  assert.equal(parseRestText('Brace hard, rest 1.5 minutes after each set').without, 'Brace hard');
  assert.equal(parseRestText('2 minutes rest, then go again').seconds, 120);
  const none = parseRestText('3s eccentric, same load');
  assert.deepEqual([none.seconds, none.rest, none.without], [null, null, '3s eccentric, same load']);
  assert.deepEqual(parseRestText(''), { seconds: null, range: false, rest: null, without: '' });
  assert.equal(parseRestText(null).seconds, null);
});

test('a range is found and removable but gives no single time, and nonsense gives none', () => {
  const r = parseRestText('Slow negatives. Rest 2-3 minutes');
  assert.deepEqual([r.seconds, r.range, r.without], [null, true, 'Slow negatives']);
  assert.equal(parseRestText('Rest 2 to 3 minutes').range, true);
  assert.equal(parseRestText('Rest 20 minutes').seconds, null, 'past ten minutes is not a rest between sets');
  assert.equal(parseRestText('Rest 5 seconds').seconds, null, 'under 15 s is not one either');
});

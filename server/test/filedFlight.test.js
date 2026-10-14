// TEXT → LAYOUT (15 Oct 2026): the words that fly out of his sentence must be
// what code filed, and a word he never said is never flown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filedFor, findWords } from '../../src/filedFlight.js';

const NOW = 1_800_000_000_000;
const chat = [
  { who: 'you', text: 'add oats and Greek yoghurt to the shop', at: NOW - 5000 },
  { who: 'nova', text: 'Captured.', at: NOW - 4000, acted: { title: 'Inbox — captured', record: { id: 'r1', kind: 'capture' } } },
];
const filed = (over = {}) => ({
  id: 'r1', status: 'filed', destination: 'Shopping List — Oats, Greek yoghurt',
  decision: { route: 'shopping', payload: { items: [{ name: 'oats', category: 'Pantry' }, { name: 'greek yoghurt', category: 'Dairy' }] } },
  ...over,
});

test('a filed shopping capture names the rows the list was written with, and the sentence it came from', () => {
  const f = filedFor(chat, 1, [filed()], NOW);
  assert.equal(f.state, 'filed');
  assert.equal(f.from, 0);
  assert.deepEqual(f.rows.map((r) => r.name), ['Oats', 'Greek yoghurt']);
});

test('the parsed names stand when the receipt does not agree item for item', () => {
  const f = filedFor(chat, 1, [filed({ destination: 'Shopping List — Oats' })], NOW);
  assert.deepEqual(f.rows.map((r) => r.name), ['oats', 'greek yoghurt']);
});

test('nothing is drawn for a capture that failed, waits on his call, or filed elsewhere', () => {
  assert.equal(filedFor(chat, 1, [filed({ status: 'error' })], NOW).state, 'other');
  assert.equal(filedFor(chat, 1, [filed({ status: 'pending' })], NOW).state, 'other');
  assert.equal(filedFor(chat, 1, [filed({ decision: { route: 'todo', payload: { text: 'x' } } })], NOW).state, 'other');
  assert.equal(filedFor(chat, 1, [filed({ status: 'error' })], NOW).rows, null);
});

test('routing now is waiting; a missing record is waiting only while the receipt is fresh', () => {
  assert.equal(filedFor(chat, 1, [filed({ status: 'classifying' })], NOW).state, 'waiting');
  assert.equal(filedFor(chat, 1, [], NOW).state, 'waiting');
  assert.equal(filedFor(chat, 1, [], NOW + 10 * 60 * 1000).state, 'other');
});

test('a line that is not a capture receipt is not a flight', () => {
  assert.equal(filedFor(chat, 0, [filed()], NOW), null);
  assert.equal(filedFor([{ who: 'nova', acted: { title: 'Shopping — ticked oats' } }], 0, [], NOW), null);
});

test('findWords: case-insensitive whole words, never the same words twice, null when not said', () => {
  const s = 'add oats and Greek yoghurt to the shop';
  assert.deepEqual(findWords(s, ['Oats', 'greek yoghurt']), [[4, 8], [13, 26]]);
  assert.deepEqual(findWords(s, ['yoghurt', 'Greek yoghurt']), [[19, 26], null]);
  assert.deepEqual(findWords('add goats cheese', ['oats']), [null]);
  assert.deepEqual(findWords(s, ['rolled oats']), [null]);
  assert.deepEqual(findWords('milk, milk and bread', ['milk', 'milk']), [[0, 4], [6, 10]]);
});

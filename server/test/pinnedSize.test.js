import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePinned, resizePinned, removePinned } from '../../src/pinned.js';

// 15 Oct 2026: edit Home the iPhone way; a card can be a whole row or half
test('a resized card keeps its size through a save and reload', () => {
  const list = reconcilePinned({ order: ['body', 'today'], off: [] });
  assert.equal(list[0].size, undefined, 'no size until he picks one');
  const halved = resizePinned(list, 'body', true);
  assert.equal(halved.find((x) => x.key === 'body').size, 'half');
  const back = reconcilePinned({ order: halved.map((x) => x.key), off: [], size: { body: 'half', today: 'huge' } });
  assert.equal(back.find((x) => x.key === 'body').size, 'half');
  assert.equal(back.find((x) => x.key === 'today').size, undefined, 'an unknown size is ignored');
  assert.equal(resizePinned(halved, 'body', false).find((x) => x.key === 'body').size, 'wide');
});

test('removing a card switches it off without losing its place', () => {
  const list = reconcilePinned({ order: ['body', 'today'], off: [] });
  const out = removePinned(list, 'body');
  assert.deepEqual(out.map((x) => x.key), list.map((x) => x.key));
  assert.equal(out.find((x) => x.key === 'body').on, false);
});

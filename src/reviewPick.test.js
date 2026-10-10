// pickReviewItem — which Daily review card is on screen (mockup 96). Pinned
// in plain node, the same way src/theme.test.js pins hourBand.
//
//   node --test src/reviewPick.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickReviewItem } from './reviewPick.js';

const item = (id, over = {}) => ({ id, title: id, answered: false, ...over });

test('with no items at all, there is nothing to show — never undefined-as-a-card', () => {
  assert.equal(pickReviewItem({ items: [], drawnExtra: null, openId: null }), null);
  assert.equal(pickReviewItem({ items: null, drawnExtra: null, openId: null }), null);
});

test('a drawn-early extra always wins, even over an open tap', () => {
  const extra = item('drawn');
  assert.equal(pickReviewItem({ items: [item('a')], drawnExtra: extra, openId: 'a' }), extra);
});

test('his own tap (openId) wins while it still names an item in the queue', () => {
  const items = [item('a'), item('b')];
  assert.equal(pickReviewItem({ items, drawnExtra: null, openId: 'b' }).id, 'b');
});

test('a stale openId (the item left the queue) falls through, never a crash', () => {
  const items = [item('a', { answered: true }), item('b')];
  assert.equal(pickReviewItem({ items, drawnExtra: null, openId: 'gone' }).id, 'b');
});

test('with no tap at all, the first not-yet-answered item leads', () => {
  const items = [item('a', { answered: true }), item('b'), item('c')];
  assert.equal(pickReviewItem({ items, drawnExtra: null, openId: null }).id, 'b');
});

test('once everything is answered, the first item still shows — never nothing', () => {
  const items = [item('a', { answered: true }), item('b', { answered: true })];
  assert.equal(pickReviewItem({ items, drawnExtra: null, openId: null }).id, 'a');
});

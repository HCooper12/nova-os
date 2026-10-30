import test from 'node:test';
import assert from 'node:assert/strict';
import { wishChip } from '../../src/vals/quickCapture.js';

test('the Wishlist chip shows for exactly one link and sends dest only when on', () => {
  assert.deepEqual(wishChip('', true), { show: false, on: false, dest: null });
  assert.deepEqual(wishChip('toothpaste', true), { show: false, on: false, dest: null });
  assert.deepEqual(wishChip('https://a.example/x', false), { show: true, on: false, dest: null });
  assert.deepEqual(wishChip('nice https://a.example/x', true), { show: true, on: true, dest: 'wishlist' });
  assert.deepEqual(wishChip('https://a.example/x https://b.example/y', true), { show: false, on: false, dest: null });
});

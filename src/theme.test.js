// The hour band is what the `sky` theme's gradient and Nova glass's aurora
// key off (design/HOME-REDESIGN-PLAN.md §2, §4 P1/P4) — a wrong boundary
// mislabels the sky for up to 15 minutes of real time, so every edge is
// pinned here, in plain node, the same way src/shelf3d/edition.test.js pins
// its own pure arithmetic.
//
//   node --test src/theme.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { hourBand } from './theme.js';

// A fixed day; only the hour:minute matters to hourBand.
const at = (h, m = 0) => new Date(2026, 8, 26, h, m);

test('hourBand: night runs up to 04:59', () => {
  assert.equal(hourBand(at(4, 59)), 'night');
});

test('hourBand: dawn starts at 05:00', () => {
  assert.equal(hourBand(at(5, 0)), 'dawn');
});

test('hourBand: dawn runs up to 07:59', () => {
  assert.equal(hourBand(at(7, 59)), 'dawn');
});

test('hourBand: day starts at 08:00', () => {
  assert.equal(hourBand(at(8, 0)), 'day');
});

test('hourBand: day runs up to 16:59', () => {
  assert.equal(hourBand(at(16, 59)), 'day');
});

test('hourBand: dusk starts at 17:00', () => {
  assert.equal(hourBand(at(17, 0)), 'dusk');
});

test('hourBand: dusk runs up to 19:59', () => {
  assert.equal(hourBand(at(19, 59)), 'dusk');
});

test('hourBand: night starts at 20:00', () => {
  assert.equal(hourBand(at(20, 0)), 'night');
});

test('hourBand: defaults to now when called with no argument', () => {
  // Not a boundary check — just proving the pure-function contract (no
  // document access at import time) didn't grow a hidden requirement.
  assert.ok(['dawn', 'day', 'dusk', 'night'].includes(hourBand()));
});

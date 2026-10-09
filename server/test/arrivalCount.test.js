// COUNT UP FROM ZERO ON EVERY ARRIVAL (9 Oct 2026, his call; the reel's first
// move). The arrival numbers the motion audit listed count from 0 when their
// page opens, staggered 40 ms a figure inside about 650 ms of motion, never
// again on a quick return to the page, and not at all under reduced motion.
// Cupertino's Home passes nothing new and is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createArrival, QUICK_BACK_MS, ARRIVAL_MS, STAGGER_MS, STAGGER_MAX, SLOT_WINDOW_MS } from '../../src/arrival.js';
import { countStart } from '../../src/countFigure.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');

test('a first visit counts; a quick return to the same page does not', () => {
  const a = createArrival();
  a.noteScreen('mission', 0);
  assert.equal(a.allowed(), true, 'the boot screen arrives');
  a.noteScreen('recipes', 2000);
  assert.equal(a.allowed(), true, 'a page never seen arrives');
  a.noteScreen('mission', 3500);
  assert.equal(a.allowed(), false, 'back to Home 1.5 s after leaving it: the figures stay still');
  a.noteScreen('recipes', 4000);
  assert.equal(a.allowed(), false, 'and Fuel, left 0.5 s ago, likewise');
  a.noteScreen('mission', 4000 + QUICK_BACK_MS + 1);
  assert.equal(a.allowed(), true, 'a return after the quick window is a new arrival');
  a.noteScreen('mission', 99999);
  assert.equal(a.allowed(), true, 'the same screen again is not a navigation');
});

test('figures that arrive together stagger 40 ms apart, inside 650 ms of motion', () => {
  const a = createArrival();
  const t = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => a.timing(1000 + i));
  assert.deepEqual(t.slice(0, 3).map((x) => x.delay), [0, STAGGER_MS, STAGGER_MS * 2]);
  for (const x of t) {
    assert.ok(x.delay <= STAGGER_MAX);
    assert.ok(x.delay + x.duration <= ARRIVAL_MS, 'no figure is still moving after 650 ms');
    assert.ok(x.duration >= 400, 'and none counts so fast it blurs');
  }
  // a later arrival starts its own stagger at 0
  assert.equal(a.timing(1000 + SLOT_WINDOW_MS + 50).delay, 0);
});

test('reduced motion: no count, arrival or not', () => {
  assert.equal(countStart({ prev: undefined, next: 96, fromZero: true, reduced: true }), null);
  assert.match(read('src/CountUp.jsx'), /fromZero: arriving, reduced: reducedMotion\(\)/);
});

test('CountUp asks the arrival clock, and only on a figure\'s first showing', () => {
  const src = read('src/CountUp.jsx');
  assert.match(src, /const arriving = fromZero && !arrivedRef\.current && isFigure\(figure\) && arrivalAllowed\(\);/);
  assert.match(src, /arriving \? arrivalTiming\(\) :/);
  // the screen is noted before the new screen's figures lay out
  const app = read('src/App.jsx');
  assert.match(app, /getSnapshotBeforeUpdate\(prevProps, prevState\) \{\s*if \(prevState\.screen !== this\.state\.screen\) noteScreen\(this\.state\.screen\);/);
});

test('the arrival numbers the audit listed count from zero; cupertino is untouched', () => {
  const has = (f, re) => assert.match(read(f), re, f);
  has('src/screens/MissionSummary.jsx', /<CountText text=\{r\.value\} fromZero \/>/);
  has('src/screens/MissionSummary.jsx', /<RingTile key=\{key\} \{\.\.\.r\} size=\{58\} arrive \/>/);
  has('src/screens/MissionSummary.jsx', /<CountText text=\{card\.count\} fromZero \/>/);
  has('src/screens/FuelSummary.jsx', /<CountUp value=\{protein\.value\} fromZero \/>/);
  has('src/screens/FuelSummary.jsx', /<CountUp value=\{k\.value\} format=\{kc\} fromZero \/>/);
  has('src/screens/SessionSummary.jsx', /<CountUp value=\{S\.progressDone\} duration=\{420\} fromZero \/>/);
  has('src/screens/Money.jsx', /<CountUp value=\{v\.moneySpent\} format=\{v\.moneyFmt\} fromZero \/>/);
  has('src/screens/InboxSummary.jsx', /<CountText text=\{S\.count\} fromZero \/>/);
  has('src/screens/Ambient.jsx', /<CountUp value=\{Number\(steps\)\} format=\{fmt\} fromZero \/>/);
  // RingTile's arrival is opt-in, so the cupertino Home's rings are as before
  assert.match(read('src/RingTile.jsx'), /arrive = false/);
  for (const f of ['src/screens/MissionStructured.jsx', 'src/screens/MissionControl.jsx']) {
    assert.ok(!/fromZero|\barrive \/>|\barrive=/.test(read(f)), `${f} does not count on arrival`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFrames, glassSummary } from '../../src/glassMeter.js';
import { cleanGlassReport } from '../lib/perfLog.js';

test('missed frames are counted against the display refresh', () => {
  const r = readFrames([8.3, 8.4, 8.3, 25, 8.3, 16.7], 8.33);
  assert.equal(r.frames, 6);
  assert.equal(r.missed, 2 + 1); // 25 ms is 3 refreshes (2 missed), 16.7 is 2 (1 missed)
  assert.equal(r.longest, 25);
});

test('the summary compares glass on with glass off, per screen, in his words', () => {
  const pass = (glass, missed, longest) => ({ glass, frames: 288, p50: 8.3, p95: 9, longest, missed });
  const [home, train] = glassSummary({ refreshMs: 8.3, screens: [
    { id: 'mission', panes: 6, passes: [pass(true, 3, 20), pass(false, 2, 17), pass(true, 3, 19)] },
    { id: 'workouts', panes: 5, passes: [pass(true, 40, 60), pass(false, 4, 18), pass(true, 36, 55)] },
  ] });
  assert.equal(home.ok, true);
  assert.equal(train.ok, false);
  assert.match(train.line, /Missed frames in a 2\.4 s scroll: 38 with glass, 4 without \(display 120 Hz\)/);
});

test('the server keeps only the known fields of a glass report', () => {
  const row = cleanGlassReport({ refreshMs: 8.33, screens: [{ id: 'workouts', panes: 5, passes: [{ glass: true, missed: 3, extra: 'x' }] }], secret: 'no' });
  assert.equal(row.secret, undefined);
  assert.deepEqual(Object.keys(row.screens[0].passes[0]).sort(), ['frames', 'glass', 'longest', 'missed', 'p50', 'p95']);
});

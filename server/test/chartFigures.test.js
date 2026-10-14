// THE CHART MORPH'S FIGURE (src/motion/chartFigures.js). Pinned so the
// percentage that lands is the first-to-last change of the bars drawn, and
// a session with no weight moved is left out rather than drawn as a zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { volumePoints, changeFigure } from '../../src/motion/chartFigures.js';

const S = (weight, reps) => ({ weight, reps, rpe: null });

test('volumes are per session, oldest first, sets summed', () => {
  const pts = volumePoints([
    { date: '2026-10-13', setRows: [S(82.5, 5), S(80, 6)] },
    { date: '2026-10-06', setRows: [S(80, 6)] },
  ]);
  assert.deepEqual(pts.map((p) => [p.date, p.value]), [['2026-10-06', 480], ['2026-10-13', 893]]);
});

test('a session with nothing lifted is not a bar', () => {
  const pts = volumePoints([
    { date: '2026-10-13', setRows: [S(0, 12)] },
    { date: '2026-10-06', setRows: [] },
    { date: '2026-09-29', setRows: [S(60, 8)] },
  ]);
  assert.deepEqual(pts.map((p) => p.date), ['2026-09-29']);
});

test('the figure is first to last, rounded, signed as he reads it', () => {
  const p = (...v) => v.map((value, i) => ({ key: String(i), date: `2026-10-0${i + 1}`, value }));
  assert.equal(changeFigure(p(1218, 1300, 1373)).text, '+13%');
  assert.equal(changeFigure(p(1000, 920)).text, '−8%');
  assert.equal(changeFigure(p(500, 502)).text, '0%');
  assert.equal(changeFigure(p(500)), null);
  assert.equal(changeFigure([]), null);
});

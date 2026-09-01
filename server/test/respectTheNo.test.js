// Respect the no — the one contract under five lanes. Both failure poles are
// pinned: a no never comes back on the calendar alone (no re-nag), and a no
// is not eternal once the number behind it has materially moved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latestDeclines, respectNo, declinedContext } from '../lib/respectTheNo.js';

const DAY = 86_400_000;
const T0 = Date.parse('2026-07-12T09:00:00Z');
const rec = (over) => ({ id: 'x', kind: 'coach-program', status: 'discarded', discardedAt: new Date(T0).toISOString(), findingKey: 'under:Chest:2026-07-06', finding: { kind: 'under-volume', avg: 8, target: 12 }, ...over });

test('latestDeclines: the newest no per subject wins, its reason and metric ride along, and the count is total', () => {
  const m = latestDeclines([
    rec({ discardedAt: new Date(T0 - 30 * DAY).toISOString(), declineReason: 'old reason', finding: { kind: 'under-volume', avg: 9, target: 12 } }),
    rec({ declineReason: 'shoulder', finding: { kind: 'under-volume', avg: 8, target: 12 } }),
    rec({ status: 'pending' }), // not a no
    rec({ kind: 'fuel-cross' }), // another lane
  ], { kind: 'coach-program', subjectOf: (r) => r.findingKey.split(':').slice(0, 2).join(':'), metricOf: (r) => r.finding.target - r.finding.avg });
  const d = m.get('under:Chest');
  assert.equal(d.at, T0);
  assert.equal(d.reason, 'shoulder');
  assert.equal(d.metric, 4);
  assert.equal(d.count, 2);
  assert.equal(m.size, 1);
});

test('respectNo: never declined → raise; inside the cooldown → no, whatever the number', () => {
  assert.equal(respectNo({ declined: null, cooldownDays: 28 }).raise, true);
  const inside = respectNo({ declined: { at: T0, metric: 4, count: 1 }, now: T0 + 10 * DAY, cooldownDays: 28, metric: 40 });
  assert.equal(inside.raise, false);
  assert.match(inside.why, /cooling down/);
});

test('respectNo: after the cooldown, only a materially larger number re-raises — and the history is named', () => {
  const same = respectNo({ declined: { at: T0, metric: 4, count: 1 }, now: T0 + 40 * DAY, cooldownDays: 28, metric: 4.5, materialChange: 0.2 });
  assert.equal(same.raise, false, '12.5% is not material');
  assert.match(same.why, /not materially moved \(4 → 4.5\)/);
  const worse = respectNo({ declined: { at: T0, metric: 4, reason: 'shoulder', count: 1 }, now: T0 + 40 * DAY, cooldownDays: 28, metric: 6, materialChange: 0.2 });
  assert.equal(worse.raise, true);
  assert.equal(worse.history, 'you passed on this on 12 Jul ("shoulder"); the number behind it has moved from 4 to 6');
});

test('respectNo: the calendar alone never re-raises — no number on either side means a no stays a no', () => {
  const r = respectNo({ declined: { at: T0, metric: null, count: 1 }, now: T0 + 400 * DAY, cooldownDays: 28, metric: 99 });
  assert.equal(r.raise, false);
  assert.match(r.why, /no number/);
  assert.equal(respectNo({ declined: { at: T0, metric: 4, count: 1 }, now: T0 + 400 * DAY, cooldownDays: 28, metric: null }).raise, false);
});

test('respectNo: a plain-cooldown lane returns after the cooldown with the history, and a standing no is capped', () => {
  const back = respectNo({ declined: { at: T0, metric: null, count: 1 }, now: T0 + 91 * DAY, cooldownDays: 90, materialChange: null });
  assert.equal(back.raise, true);
  assert.equal(back.history, 'you passed on this on 12 Jul');
  // a year later the history carries the year
  const later = respectNo({ declined: { at: T0, metric: null, count: 1 }, now: T0 + 400 * DAY, cooldownDays: 90, materialChange: null });
  assert.match(later.history, /12 Jul 2026/);
  // declined twice with maxReturns 1 → never again, however the number moves
  const twice = respectNo({ declined: { at: T0, metric: 3, count: 2 }, now: T0 + 400 * DAY, cooldownDays: 60, metric: 30, materialChange: 1, maxReturns: 1 });
  assert.equal(twice.raise, false);
  assert.match(twice.why, /standing no/);
});

test('declinedContext: recent no\'s as lines with reasons, the lane\'s only, within the window', () => {
  const lines = declinedContext([
    { kind: 'pattern', status: 'discarded', discardedAt: new Date(T0).toISOString(), decision: { title: 'Standing: log creatine daily' }, declineReason: 'I stopped taking it' },
    { kind: 'pattern', status: 'discarded', discardedAt: new Date(T0 - 100 * DAY).toISOString(), decision: { title: 'too old' } },
    { kind: 'pattern', status: 'filed', discardedAt: new Date(T0).toISOString(), decision: { title: 'a yes' } },
    { kind: 'review', status: 'discarded', discardedAt: new Date(T0).toISOString(), text: 'another lane' },
  ], { kind: 'pattern', days: 90, now: T0 + DAY });
  assert.deepEqual(lines, ['- Standing: log creatine daily — his reason: "I stopped taking it"']);
});

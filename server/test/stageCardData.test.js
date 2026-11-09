// THE DATA THE MAC STAGE'S FORMS NEED (mockup 114, round three), carried by
// the card builders from his own records and never made up: a weight card's
// real weigh-ins, the protein week's own target line, a draft row's record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricCard, barsCard, listCard } from '../lib/spokenCards.js';
import { proteinWeekCard } from '../lib/findingCards.js';
import { tryReflex } from '../lib/reflex.js';

test('a metric card carries a series only of real dated readings, three or more', () => {
  const s = [{ date: '2026-11-01', value: 82.1 }, { date: '2026-11-03', value: 82.6 }, { date: '2026-11-05', value: 82.4 }];
  assert.deepEqual(metricCard({ label: 'Weight', value: 82.4, unit: 'kg', series: s }).series, s);
  assert.equal(metricCard({ label: 'Weight', value: 82.4, series: s.slice(0, 2) }).series, undefined, 'two readings are no line');
  assert.equal(metricCard({ label: 'Weight', value: 82.4, series: [...s, { date: 'yesterday', value: 1 }, { date: '2026-11-06', value: 'x' }] }).series.length, 3, 'undated or non-numeric readings are dropped');
  assert.equal(metricCard({ label: 'Steps', value: 9000 }).series, undefined);
});

test('a bars card states its target only when given one, and its scale holds the line', () => {
  const b = barsCard({ label: 'Protein', bars: [{ name: 'M', value: 120 }, { name: 'T', value: 100 }], target: 140 });
  assert.equal(b.target, 140);
  assert.equal(b.targetPct, 100, 'a target above every bar is the top of the scale');
  assert.equal(b.bars[0].pct, Math.round((120 / 140) * 100));
  const plain = barsCard({ label: 'Sets', bars: [{ name: 'W1', value: 7 }, { name: 'W2', value: 8 }] });
  assert.equal(plain.target, undefined);
  assert.equal(plain.bars[1].pct, 100);
});

test('the protein week names its floor as the target only when every day shown had the same one', () => {
  const same = proteinWeekCard({ floor: 140, days: [{ date: '2026-11-03', p: 150, floorG: 140 }, { date: '2026-11-04', p: 98, floorG: 140 }, { date: '2026-11-05', p: 160, floorG: 140 }] });
  assert.equal(same.target, 140);
  // a goal changed mid-week (targetHistory): each day keeps its own, no single line
  const changed = proteinWeekCard({ floor: 150, days: [{ date: '2026-11-03', p: 150, floorG: 140 }, { date: '2026-11-04', p: 98, floorG: 150 }] });
  assert.equal(changed.target, undefined);
});

test('a list row keeps the record id it stands for, and only when it has one', () => {
  const l = listCard({ label: 'The fleet, overnight', items: [{ name: 'A brief', note: 'research', id: 'rec-1' }, { name: 'A note', note: 'distill' }] });
  assert.equal(l.items[0].id, 'rec-1');
  assert.equal('id' in l.items[1], false);
});

test('the weight reflex card carries his real weigh-ins, one per day on the scale, oldest first', async () => {
  const days = [
    { date: '2026-11-01', weightKg: 82.1, weightMeasuredOn: '2026-11-01' },
    { date: '2026-11-02', weightKg: 82.1, weightMeasuredOn: '2026-11-01' },
    { date: '2026-11-03', weightKg: 82.6, weightMeasuredOn: '2026-11-03' },
    { date: '2026-11-04', steps: 9000 },
    { date: '2026-11-05', weightKg: 82.4, weightMeasuredOn: '2026-11-05' },
  ];
  const r = await tryReflex("what's my weight", { recentDays: async () => days });
  assert.deepEqual(r.card.series, [{ date: '2026-11-01', value: 82.1 }, { date: '2026-11-03', value: 82.6 }, { date: '2026-11-05', value: 82.4 }]);
});

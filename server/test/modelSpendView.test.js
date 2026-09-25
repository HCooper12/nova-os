// The model board's spend line (src/modelSpendView.js): real ids read as
// their names, money reads as money, and a lane with no runs draws nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

const { modelName, dollars, seconds, spendView } = await import('../../src/modelSpendView.js');

test('modelName reads the ids the ledger records', () => {
  assert.equal(modelName('claude-sonnet-5'), 'Sonnet 5');
  assert.equal(modelName('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(modelName('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  assert.equal(modelName('claude-fable-5-1'), 'Fable 5.1');
  assert.equal(modelName('sonnet'), 'Sonnet');
  assert.equal(modelName(''), '');
});

test('dollars and seconds read as a person would say them', () => {
  assert.equal(dollars(0), '$0');
  assert.equal(dollars(0.003), '<$0.01');
  assert.equal(dollars(0.4211), '$0.42');
  assert.equal(dollars(12.6), '$13');
  assert.equal(seconds(640), '640 ms');
  assert.equal(seconds(3120), '3.1 s');
  assert.equal(seconds(47000), '47 s');
  assert.equal(seconds(null), null);
});

test('spendView: a total, a share of the dearest lane, and nothing for a lane never run', () => {
  const v = spendView([
    { id: 'coach', spend: { usd: 2, runs: 10, medianMs: 21000, lastModel: 'claude-opus-5-5', limitHits: 1, errors: 0 } },
    { id: 'inbox-classify', spend: { usd: 0.004, runs: 1, medianMs: 1500, lastModel: 'claude-haiku-4-5-20251001', limitHits: 0, errors: 0 } },
    { id: 'pulse', spend: null },
  ]);
  assert.equal(v.total, '$2.00');
  assert.equal(v.measured, true);
  assert.equal(v.byLane.coach.share, 1);
  assert.equal(v.byLane.coach.detail, '10 runs · 21 s typical · answered by Opus 5.5');
  assert.equal(v.byLane.coach.limitHits, 1);
  assert.equal(v.byLane['inbox-classify'].share, 0.02, 'a lane that spent anything gets a visible sliver');
  assert.equal(v.byLane['inbox-classify'].detail, '1 run · 1.5 s typical · answered by Haiku 4.5');
  assert.equal(v.byLane.pulse, undefined);
  assert.deepEqual(spendView([]), { total: '$0', measured: false, byLane: {} });
});

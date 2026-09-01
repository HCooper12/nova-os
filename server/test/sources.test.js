// The couldn't-look helper: a failed loader keeps its fallback so the caller's
// shape is unchanged, AND is named — never mistaken for an empty source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSources, unreadable } from '../lib/sources.js';

test('loadSources: fulfilled loaders return values, failed ones return their fallback and are named with the reason', async () => {
  const { values, failed, ok } = await loadSources({
    sessions: { load: async () => [{ date: '2026-09-01' }], fallback: [] },
    foodLog: { load: async () => { throw new Error('ENOENT: food-log.json'); }, fallback: [] },
    goals: { load: () => { throw new Error('sync threw'); }, fallback: null }, // a SYNC throw is caught too
  });
  assert.deepEqual(values.sessions, [{ date: '2026-09-01' }]);
  assert.deepEqual(values.foodLog, [], 'the fallback keeps the caller\'s code shape');
  assert.equal(values.goals, null);
  assert.equal(ok, false);
  assert.deepEqual(failed.map((f) => f.source), ['foodLog', 'goals']);
  assert.match(failed[0].reason, /ENOENT/);
});

test('loadSources: nothing failed → ok, empty failed list', async () => {
  const r = await loadSources({ a: { load: async () => 1, fallback: 0 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.failed, []);
  assert.equal(r.values.a, 1);
});

test('unreadable: names the sources in the consumer\'s labels, with the reason trimmed', () => {
  const line = unreadable(
    [{ source: 'foodLog', reason: 'ENOENT: no such file' }, { source: 'calendar', reason: 'x'.repeat(200) }],
    { foodLog: 'food log' },
  );
  assert.match(line, /^food log unreadable \(ENOENT: no such file\), calendar unreadable \(x{80}\)$/);
  assert.equal(unreadable([]), '');
});

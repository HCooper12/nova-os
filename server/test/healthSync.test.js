process.env.TZ = 'Australia/Sydney';
import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, daysToRead, usableMetrics, syncHealth } from '../../src/healthSync.js';

// Nova reads Apple Health itself (14 Oct 2026). Dates are HIS calendar days.
test('today and yesterday in his time zone, across midnight', () => {
  // 00:30 on 15 Oct in Sydney is still 14 Oct in UTC
  const at = new Date('2026-10-15T00:30:00+11:00').getTime();
  assert.deepEqual(daysToRead(at), ['2026-10-15', '2026-10-14']);
  assert.equal(localDate(new Date('2026-10-01T09:00:00+10:00')), '2026-10-01');
});

test('only real numbers are sent; a refused or empty metric is left out, never zero', () => {
  assert.deepEqual(usableMetrics({ steps: 979, hrv: 83.1, vo2Max: null, weightKg: NaN, junk: '5' }), { steps: 979, hrv: 83.1 });
  assert.deepEqual(usableMetrics(undefined), {});
});

test('outside the native shell nothing is read or sent', async () => {
  let sent = 0;
  const r = await syncHealth({ send: async () => { sent += 1; } });
  assert.equal(r.skipped, 'no-health');
  assert.equal(sent, 0);
});

test('in the shell: asks once, sends each day that has numbers, then rests five minutes', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  let asks = 0;
  const reads = [];
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { NovaHealth: {
    requestAccess: async () => { asks += 1; return { requested: true }; },
    readDay: async ({ date }) => { reads.push(date); return { date, metrics: date === '2026-10-15' ? { steps: 120 } : {} }; },
  } } } };
  try {
    const sent = [];
    let refreshed = 0;
    const at = new Date('2026-10-15T09:00:00+11:00').getTime();
    const r = await syncHealth({ send: async (d, m) => sent.push([d, m]), onSent: () => { refreshed += 1; }, now: at, force: true });
    assert.equal(r.sent, 1);
    assert.deepEqual(sent, [['2026-10-15', { steps: 120 }]], 'yesterday had nothing, so nothing went for it');
    assert.deepEqual(reads, ['2026-10-15', '2026-10-14']);
    assert.equal(asks, 1);
    assert.equal(refreshed, 1);
    const again = await syncHealth({ send: async () => sent.push(1), now: at + 60_000 });
    assert.equal(again.skipped, 'recent');
    await syncHealth({ send: async () => {}, now: at + 6 * 60_000 });
    assert.equal(asks, 1, 'the permission sheet is asked for once');
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

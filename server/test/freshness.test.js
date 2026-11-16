// One date rule (13 Nov 2026, his "old data" complaint): how old is too old
// to say out loud. Days are his AEST days, never a UTC slice.
process.env.TZ = 'Australia/Brisbane'; // AEST, no daylight saving
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-freshness-'));
const { FRESH_DAYS, ageDays, isFresh, freshOnly, datedLabel } = await import('../lib/freshness.js');

test('the table holds the six windows, frozen', () => {
  assert.deepEqual({ ...FRESH_DAYS }, { 'session-pain': 7, 'form-note': 21, 'lift-evidence': 28, 'open-injury': 14, 'pain-hold': 14, 'spoken-evidence': 21 });
  assert.ok(Object.isFrozen(FRESH_DAYS));
});

test('ageDays counts his local days: a UTC stamp late in the UTC day is already tomorrow in AEST', () => {
  // 14:30 UTC on the 12th is 00:30 AEST on the 13th
  const now = new Date('2026-11-13T00:30:00+10:00');
  assert.equal(ageDays('2026-11-12T14:30:00Z', now), 0, 'the same AEST day');
  assert.equal(ageDays('2026-11-12T13:30:00Z', now), 1, '23:30 AEST on the 12th is yesterday');
  assert.equal(ageDays('2026-11-12', now), 1);
  assert.equal(ageDays('2026-11-13', now), 0);
  assert.equal(ageDays('2026-11-03', now), 10);
  assert.equal(ageDays(null, now), null);
  assert.equal(ageDays('', now), null);
  assert.equal(ageDays('not a date', now), null);
});

test('isFresh: inside the window, on its edge, past it; a missing date is never fresh; an unknown kind throws', () => {
  const now = new Date('2026-11-13T08:00:00+10:00');
  assert.equal(isFresh('session-pain', '2026-11-06', now), true, 'seven days is still inside');
  assert.equal(isFresh('session-pain', '2026-11-05', now), false);
  assert.equal(isFresh('open-injury', undefined, now), false);
  assert.throws(() => isFresh('nonsense', '2026-11-13', now), /no freshness window/);
  const items = [{ date: '2026-11-12' }, { date: '2026-10-01' }, {}];
  assert.deepEqual(freshOnly(items, 'form-note', { now }), [{ date: '2026-11-12' }]);
  assert.equal(freshOnly([{ at: '2026-11-12' }], 'form-note', { now, dateOf: (x) => x.at }).length, 1);
});

test('datedLabel speaks plainly', () => {
  const now = new Date('2026-11-13T08:00:00+10:00');
  assert.equal(datedLabel('2026-11-13', now), 'today');
  assert.equal(datedLabel('2026-11-12', now), 'yesterday');
  assert.equal(datedLabel('2026-11-03', now), 'on Tue 3 Nov');
  assert.equal(datedLabel('2026-11-03', now, { on: false }), 'Tue 3 Nov');
  assert.equal(datedLabel('2026-11-12', now, { relative: false }), 'on Thu 12 Nov');
  assert.equal(datedLabel('2025-12-30', now), 'on Tue 30 Dec 2025', 'the year only when it differs');
  assert.equal(datedLabel(null, now), '');
});

test('each window: fresh at exactly the limit, not fresh one day past', () => {
  const now = new Date('2026-11-13T08:00:00+10:00');
  const dayOf = (n) => new Date(now.getTime() - n * 86_400_000);
  for (const [kind, limit] of Object.entries({ 'form-note': 21, 'lift-evidence': 28, 'open-injury': 14, 'pain-hold': 14, 'spoken-evidence': 21 })) {
    assert.equal(FRESH_DAYS[kind], limit, `${kind} window`);
    assert.equal(isFresh(kind, dayOf(limit), now), true, `${kind} at ${limit} days`);
    assert.equal(isFresh(kind, dayOf(limit + 1), now), false, `${kind} at ${limit + 1} days`);
    assert.equal(isFresh(kind, dayOf(0), now), true, `${kind} today`);
  }
});

test('a missing or garbage date is never fresh, for every kind', () => {
  const now = new Date('2026-11-13T08:00:00+10:00');
  for (const kind of Object.keys(FRESH_DAYS)) {
    for (const bad of [undefined, null, '', 'garbage', '2026-13-45x', {}]) {
      assert.equal(isFresh(kind, bad, now), false, `${kind} with ${JSON.stringify(bad)}`);
    }
  }
});

// every window, to the day: exactly N days old is fresh, N+1 is not
const edgeNow = new Date('2026-11-13T08:00:00+10:00');
const dayBefore = (n) => {
  const d = new Date(2026, 10, 13 - n); // local days, the zone is pinned above
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
for (const [kind, days] of Object.entries(FRESH_DAYS)) {
  test(`window edge for ${kind}: ${days} days is fresh, ${days + 1} is not`, () => {
    assert.equal(isFresh(kind, dayBefore(0), edgeNow), true, 'today');
    assert.equal(isFresh(kind, dayBefore(days), edgeNow), true, `exactly ${days} days old`);
    assert.equal(isFresh(kind, dayBefore(days + 1), edgeNow), false, `${days + 1} days old`);
    assert.equal(isFresh(kind, null, edgeNow), false, 'no date is never fresh');
    // a full timestamp is read as its local day, so late on the edge day is still the edge day
    assert.equal(isFresh(kind, `${dayBefore(days)}T23:59:00+10:00`, edgeNow), true);
  });
}

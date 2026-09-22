// Learning loop — temp dirs BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-learn-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { computePreferences, preferencesContext } = await import('../lib/learning.js');
const { createRecord, _resetInboxStore } = await import('../lib/inboxStore.js');
const { saveDay } = await import('../lib/nutritionLog.js');

const vault = dataDir; // learning reads data stores, not the vault, for these signals

test('thin data: honest — no invented habits, and the context says so', async () => {
  const { noticed, enoughData } = await computePreferences(vault);
  assert.equal(enoughData, false);
  assert.equal(noticed.length, 0);
  assert.match(await preferencesContext(vault), /not enough decisions/);
});

test('accept/skip tendencies emerge once there are enough real decisions', async () => {
  const rec = (kind, status, i) => ({ id: `${kind}-${i}`, kind, status, createdAt: `2026-07-${String(10 + i).padStart(2, '0')}T08:00:00Z` });
  // he keeps Daily Reviews (4 filed) and skips meal-prep (3 discarded)
  for (let i = 0; i < 4; i++) await createRecord(rec('review', 'filed', i));
  for (let i = 0; i < 3; i++) await createRecord(rec('meal-prep', 'discarded', i + 4));
  // only 2 research decisions — below threshold, must not be reported
  await createRecord(rec('research', 'filed', 7));
  await createRecord(rec('research', 'discarded', 8));

  const { noticed, enoughData } = await computePreferences(vault);
  assert.equal(enoughData, true);
  assert.ok(noticed.some((n) => /Acts on Daily Reviews — kept 4 of 4/.test(n)));
  assert.ok(noticed.some((n) => /skip meal-prep proposals — dismissed 3 of 3/.test(n)));
  assert.ok(!noticed.some((n) => /research/.test(n)), 'below-threshold kinds are not reported');

  const ctx = await preferencesContext(vault);
  assert.match(ctx, /WHAT HAYDEN TENDS TO DO/);
  assert.match(ctx, /adapt rather than repeat what he skips/);
});

test('nutrition: a real weekend protein gap gets noticed', async () => {
  _resetInboxStore();
  // weekdays hit the floor, weekends miss — enough of each
  const days = [
    ['2026-07-06', true], ['2026-07-07', true], ['2026-07-08', true], ['2026-07-09', true], ['2026-07-10', true], // Mon-Fri
    ['2026-07-11', false], ['2026-07-12', false], // Sat-Sun
    ['2026-07-13', true], ['2026-07-14', true],
    ['2026-07-18', false], ['2026-07-19', false], // Sat-Sun
  ];
  for (const [date, met] of days) {
    await saveDay(date, { p: met ? 160 : 90, c: 200, f: 60, kcal: 2300 }, 150);
  }
  const { noticed } = await computePreferences(vault);
  assert.ok(noticed.some((n) => /Protein floor slips on weekends/.test(n)), noticed.join(' | '));
});

// THE LANES ARE THE SAME SIGNAL AS THE SENTENCES. Settings draws the trust
// ladder from `lanes` and falls back to `noticed` when a server predates it,
// so the two must never disagree about a lane — a bar saying one thing and a
// sentence saying another is worse than either alone. Built on its own
// records rather than on whatever the machine happens to hold, so this test
// can actually fail.
test('lanes carry the same decisions as the sentences, worst first', async () => {
  // its OWN kinds, untouched by the tests above — `_resetInboxStore` clears
  // the cache, not the records on disk, so sharing a kind with an earlier
  // test silently adds to its counts
  const rec = (kind, status, i) => ({ id: `${kind}-l${i}`, kind, status, createdAt: `2026-08-${String(1 + (i % 27)).padStart(2, '0')}T08:00:00Z` });
  // acts on it (9/10), skips it (0/4), and one genuinely mixed (2/4)
  for (let i = 0; i < 9; i++) await createRecord(rec('video', 'filed', i));
  await createRecord(rec('video', 'discarded', 9));
  for (let i = 0; i < 4; i++) await createRecord(rec('cfo', 'discarded', 20 + i));
  for (let i = 0; i < 2; i++) await createRecord(rec('distill', 'filed', 40 + i));
  for (let i = 0; i < 2; i++) await createRecord(rec('distill', 'discarded', 42 + i));

  const { noticed, lanes, enoughData } = await computePreferences(vault);
  assert.equal(enoughData, true);
  assert.ok(lanes.length >= 3, `expected three lanes, got ${lanes.length}`);

  const by = Object.fromEntries(lanes.map((l) => [l.kind, l]));
  assert.deepEqual(
    { kept: by.video.kept, total: by.video.total, verdict: by.video.verdict },
    { kept: 9, total: 10, verdict: 'acts' });
  assert.deepEqual(
    { kept: by.cfo.kept, total: by.cfo.total, verdict: by.cfo.verdict },
    { kept: 0, total: 4, verdict: 'skips' });
  assert.equal(by.distill.verdict, 'mixed', 'two of four is neither acting nor skipping');

  for (const l of lanes) {
    assert.equal(l.kept + l.dropped, l.total, `${l.label}: kept + dropped must be the total`);
    const line = noticed.find((n) => n.includes(l.label));
    assert.ok(line, `${l.label} has no sentence`);
    assert.ok(line.includes(String(l.total)), `${l.label}: "${line}" does not carry ${l.total}`);
  }

  // the lane he might turn down leads; the one he acts on never outranks it
  assert.equal(lanes[0].verdict, 'skips', `first lane was ${lanes[0].verdict}`);
  const firstActs = lanes.findIndex((l) => l.verdict === 'acts');
  const lastNonActs = lanes.map((l) => l.verdict).lastIndexOf('skips');
  assert.ok(firstActs > lastNonActs, 'a lane worth easing off must not sit below one he acts on');
});

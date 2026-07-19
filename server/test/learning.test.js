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

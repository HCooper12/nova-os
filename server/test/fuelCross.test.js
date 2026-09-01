// The cross-reference agent's honesty contract: findings only from real
// joins, silence when the data is thin, and no finding without the targets
// it depends on. analyze() is the pure decision core — every threshold is
// exercised here without a vault.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, crossContext } from '../lib/fuelCross.js';

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const day = (daysAgo, p, kcal) => ({ date: iso(daysAgo), entries: [{ macros: { p, c: 100, f: 40, kcal } }] });
const keys = (f) => f.map((x) => x.key);

const PROFILE = { proteinFloorG: 150, targetKcal: 2600 };

test('rotation undershooting the floor is a high finding; within 10g stays silent', () => {
  const hit = analyze({ profile: PROFILE, rotationTotals: { p: 120, c: 0, f: 0, kcal: 0 } });
  assert.deepEqual(keys(hit), ['rotation-protein-floor']);
  assert.equal(hit[0].severity, 'high');
  assert.match(hit[0].line, /120g against the 150g floor/);
  const close = analyze({ profile: PROFILE, rotationTotals: { p: 145, c: 0, f: 0, kcal: 0 } });
  assert.deepEqual(close, []);
});

test('no profile floor → structural findings stay silent (missing target, not zero)', () => {
  assert.deepEqual(analyze({ profile: null, rotationTotals: { p: 20 } }), []);
});

test('training days underfuelled vs floor AND no better than rest days → finding', () => {
  const sessions = [0, 2, 4, 6].map((d) => ({ date: iso(d) }));
  const days = [
    day(0, 110, 2400), day(2, 115, 2400), day(4, 120, 2400), day(6, 110, 2400), // trained
    day(1, 118, 2400), day(3, 112, 2400), day(5, 120, 2400), // rest — same protein
  ];
  const f = analyze({ sessions, days, profile: { proteinFloorG: 150 } });
  assert.ok(keys(f).includes('training-day-protein'));
  assert.match(f.find((x) => x.key === 'training-day-protein').line, /4 logged/);
});

test('training days clearly OUT-eating rest days earns silence even under the floor', () => {
  const sessions = [0, 2, 4].map((d) => ({ date: iso(d) }));
  const days = [
    day(0, 130, 2400), day(2, 132, 2400), day(4, 131, 2400), // trained, floor-short but...
    day(1, 100, 2000), day(3, 98, 2000), day(5, 102, 2000), // ...far above rest days
  ];
  const f = analyze({ sessions, days, profile: { proteinFloorG: 150 } });
  assert.ok(!keys(f).includes('training-day-protein')); // he IS fuelling training days harder
});

test('fewer than 3 logged days on either side silences the day-type comparison', () => {
  const sessions = [0, 2].map((d) => ({ date: iso(d) }));
  const days = [day(0, 80, 2400), day(2, 85, 2400), day(1, 80, 2400), day(3, 82, 2400), day(5, 81, 2400)];
  const f = analyze({ sessions, days, profile: { proteinFloorG: 150 } });
  assert.ok(!keys(f).includes('training-day-protein'));
});

test('partial logs (under 800 kcal) are excluded as evidence', () => {
  const sessions = [0, 2, 4].map((d) => ({ date: iso(d) }));
  const days = [
    day(0, 30, 400), day(2, 25, 350), day(4, 28, 300), // "trained days" that are really unlogged
    day(1, 160, 2600), day(3, 158, 2600), day(5, 162, 2600),
  ];
  assert.deepEqual(analyze({ sessions, days, profile: { proteinFloorG: 150 } }), []);
});

test('gain goal + training days short of the kcal target → medium finding; no gain goal → silence', () => {
  const sessions = [0, 2, 4].map((d) => ({ date: iso(d) }));
  const days = [
    day(0, 160, 2100), day(2, 158, 2150), day(4, 161, 2050),
    day(1, 160, 2600), day(3, 158, 2600), day(5, 162, 2600),
  ];
  const gain = analyze({ sessions, days, profile: PROFILE, goal: 'build muscle' });
  assert.deepEqual(keys(gain), ['training-day-kcal']);
  assert.equal(gain[0].severity, 'medium');
  const cut = analyze({ sessions, days, profile: PROFILE, goal: 'lean out' });
  assert.deepEqual(cut, []);
});

test('floor missed on 60%+ of fully-logged days → pattern finding', () => {
  const days = [day(0, 100, 2400), day(1, 105, 2400), day(2, 110, 2400), day(3, 160, 2600), day(4, 95, 2400)];
  const f = analyze({ days, profile: { proteinFloorG: 150 } });
  assert.deepEqual(keys(f), ['floor-most-days']);
  assert.match(f[0].line, /4 of the last 5/);
});

test('crossContext: empty when nothing true to say, one line per finding otherwise', () => {
  assert.equal(crossContext(null), '');
  assert.equal(crossContext({ findings: [] }), '');
  const out = crossContext({ findings: [
    { key: 'a', severity: 'high', line: 'Line one.' },
    { key: 'b', severity: 'medium', line: 'Line two.' },
  ] });
  assert.match(out, /FUEL × TRAINING CROSS-CHECK/);
  assert.match(out, /\[high\] Line one\./);
  assert.equal(out.split('\n').length, 3); // header + two findings, no padding
});

// ---- the couldn't-look state: a source that could not be read is named,
// never mistaken for an empty one -------------------------------------------
test('crossCheck: an unreadable food log is named in couldntLook; findings from the sources that DID load still stand', async () => {
  const { crossCheck } = await import('../lib/fuelCross.js');
  const result = await crossCheck('/scratch', {
    loadSessions: async () => [],
    loadRecentDays: async () => { throw new Error('ENOENT: food-log.json'); },
    loadRecipeData: async () => ({ profile: PROFILE, recipes: [] }),
    getFitnessGoals: async () => ({ goal: '' }),
    loadRotation: async () => ({ totals: { p: 120, c: 0, f: 0, kcal: 0 } }),
  });
  assert.equal(result.sources.ok, false);
  assert.deepEqual(result.sources.failed.map((f) => f.source), ['foodLog']);
  assert.match(result.couldntLook, /couldn't check fuel × training — food log unreadable \(ENOENT/);
  assert.deepEqual(keys(result.findings), ['rotation-protein-floor'], 'the rotation join needs no food log — it still speaks');
  // the model is told first, in capitals, before any finding
  const ctx = crossContext(result);
  assert.match(ctx, /^NOTE: couldn't check fuel × training/);
  assert.match(ctx, /NOT checked today/);
  assert.match(ctx, /rotation .* 120g against the 150g floor/s);
});

test('crossCheck: every source readable → ok, no couldntLook, and an empty result is still the silent empty string', async () => {
  const { crossCheck } = await import('../lib/fuelCross.js');
  const result = await crossCheck('/scratch', {
    loadSessions: async () => [],
    loadRecentDays: async () => [],
    loadRecipeData: async () => null,
    getFitnessGoals: async () => null,
  });
  assert.equal(result.sources.ok, true);
  assert.equal(result.couldntLook, null);
  assert.deepEqual(result.findings, []);
  assert.equal(crossContext(result), '');
});

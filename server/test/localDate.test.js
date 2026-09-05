// Dates a person reads must be HIS date, not UTC's.
//
// He is in AEST (UTC+10) and wakes at 04:30, so between midnight and 10am
// local the UTC date is still yesterday. Every field Nova stamped in his
// morning was a day early. Caught on 4 Sep: writing his equipment and injury
// fields at 08:29 local stamped Fitness Goals.md `updated: '2026-09-03'`.
//
// Same family as the leader-timestamp confusion and the devtools clock — a
// recurring class in this codebase where a UTC instant is read as a local day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDateISO } from '../lib/localDate.js';

// THESE TESTS BROKE FIVE DEPLOYS. The first version built its dates from
// "+10:00" strings and asserted the Melbourne answer — so on GitHub's UTC
// runner, where 08:29+10:00 is 22:29 the previous day, the assertion was
// simply false and every deploy after it failed the test step. A test about
// "UTC read as local" that itself read Melbourne as the machine's zone.
//
// Now the dates are built from LOCAL components, so "08:29 local" is 08:29
// wherever the test runs, and the UTC-vs-local disagreement is asserted only
// where the machine's offset actually produces one.
const local = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);
const eastOfUTC = new Date().getTimezoneOffset() < 0; // Melbourne yes, GitHub no

test('the morning hours where UTC and local disagree', () => {
  // 02:00 local on 4 Sep — his 04:30 wake is squarely in this window
  const d = local(2026, 9, 4, 2, 0);
  assert.equal(localDateISO(d), '2026-09-04', 'his actual day, on any machine');
  if (eastOfUTC) {
    assert.equal(d.toISOString().slice(0, 10), '2026-09-03', 'the trap — east of UTC the UTC date is still yesterday');
  }
});

test('the real case: writing his goals at 08:29 local', () => {
  assert.equal(localDateISO(local(2026, 9, 4, 8, 29)), '2026-09-04');
});

test('afternoon, when the two agree anyway', () => {
  const d = local(2026, 9, 4, 15, 0);
  assert.equal(localDateISO(d), '2026-09-04');
  if (eastOfUTC) assert.equal(localDateISO(d), d.toISOString().slice(0, 10));
});

test('single-digit months and days are padded', () => {
  assert.equal(localDateISO(new Date(2026, 0, 5, 12)), '2026-01-05');
  assert.equal(localDateISO(new Date(2026, 11, 31, 12)), '2026-12-31');
});

test('the vault-facing writers no longer stamp UTC', () => {
  // these all write a date HE reads — `updated`, `startedAt`, `resolvedAt`,
  // "week of". Machine instants (createdAt, filedAt) keep toISOString, which
  // is correct and unambiguous, so this scan is deliberately narrow.
  for (const f of ['fitnessGoals', 'exerciseState', 'exercises', 'injuryLog', 'coachKnowledge', 'patternScout', 'healthMirror']) {
    const src = readFileSync(new URL(`../lib/${f}.js`, import.meta.url), 'utf8');
    const lines = src.split('\n').filter((l) => !l.trim().startsWith('//'));
    assert.ok(!lines.join('\n').includes('toISOString().slice(0, 10)'),
      `${f}.js still stamps a human-readable date in UTC`);
  }
});

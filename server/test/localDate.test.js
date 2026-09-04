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

test('the morning hours where UTC and local disagree', () => {
  // 4 Sep, 02:00 in Melbourne is still 3 Sep in UTC
  const d = new Date('2026-09-04T02:00:00+10:00');
  assert.equal(d.toISOString().slice(0, 10), '2026-09-03', 'the trap');
  assert.equal(localDateISO(d), '2026-09-04', 'his actual day');
});

test('the real case: writing his goals at 08:29 local', () => {
  const d = new Date('2026-09-04T08:29:00+10:00');
  assert.equal(localDateISO(d), '2026-09-04');
});

test('afternoon, when the two agree anyway', () => {
  const d = new Date('2026-09-04T15:00:00+10:00');
  assert.equal(localDateISO(d), d.toISOString().slice(0, 10));
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

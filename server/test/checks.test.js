// checks.js — "check <thing>": a deterministic lookup against a baseline or
// a target, never a model. Every case here injects `deps` directly, per the
// test-data-isolation rule (NOVA_DATA_DIR set before any import, so a default
// dep that forgets to be overridden still can't touch the real vault/data).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-checks-data-'));
process.env.VAULT_PATH = await mkdtemp(path.join(tmpdir(), 'nova-checks-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, CHECK_ALIASES } from '../lib/checks.js';

test.after(async () => {
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
  await rm(process.env.VAULT_PATH, { recursive: true, force: true });
});

const NOW = new Date('2026-10-15T12:00:00');

function daysFixture() {
  // 14 days, oldest-first (healthData.loadRecentDays's shape), ending today
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(NOW.getTime() - i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    out.push({ date });
  }
  return out;
}

test('sleep: present vs 14-day mean, with a signed delta', async () => {
  const days = daysFixture().map((d, i) => ({ ...d, sleepAsleepMinutes: i === 13 ? 360 : 420 })); // last night short
  const out = await runCheck('sleep', { now: NOW, deps: { recentDays: async () => days } });
  assert.match(out.text, /6h 00m last night/);
  assert.match(out.text, /-1h vs your 14-day mean of 7h 00m\./);
});

test('sleep: no reading at all is named, never invented', async () => {
  const out = await runCheck('sleep', { now: NOW, deps: { recentDays: async () => daysFixture() } });
  assert.equal(out.text, 'No sleep reading on record for last night.');
});

test('sleep: a reason clause leads with the generic "felt off" clause', async () => {
  const days = daysFixture().map((d, i) => ({ ...d, sleepAsleepMinutes: i === 13 ? 300 : 420 }));
  const out = await runCheck('sleep', { now: NOW, reason: true, deps: { recentDays: async () => days } });
  assert.match(out.text, /^Sleep felt off: /);
});

test('sleep: only one night on record — honest, no invented mean', async () => {
  const days = [{ date: '2026-10-15', sleepAsleepMinutes: 400 }];
  const out = await runCheck('sleep', { now: NOW, deps: { recentDays: async () => days } });
  assert.match(out.text, /no 14-day mean yet/);
});

test('hrv: in milliseconds, with a signed percentage vs the 14-day baseline', async () => {
  const days = daysFixture().map((d, i) => ({ ...d, hrv: i === 13 ? 60 : 80 }));
  const out = await runCheck('hrv', { now: NOW, deps: { recentDays: async () => days } });
  assert.match(out.text, /HRV is 60ms/);
  assert.match(out.text, /-25% vs your 14-day baseline of 80ms\./);
});

test('hrv: no reading on record for the window', async () => {
  const out = await runCheck('hrv', { now: NOW, deps: { recentDays: async () => daysFixture() } });
  assert.equal(out.text, 'No HRV reading on record for the last 14 days.');
});

test('steps: today so far vs the 7-day daily mean (no hourly store exists)', async () => {
  const days = [];
  for (let i = 6; i >= 1; i--) days.push({ date: `2026-10-${15 - i}`, steps: 10000 });
  days.push({ date: '2026-10-15', steps: 4000 });
  const out = await runCheck('steps', { now: NOW, deps: { recentDays: async () => days } });
  assert.match(out.text, /4,000 steps so far today, -60% vs your 7-day daily mean of 10,000\./);
});

test('steps: nothing in today yet', async () => {
  const days = [{ date: '2026-10-14', steps: 9000 }];
  const out = await runCheck('steps', { now: NOW, deps: { recentDays: async () => days } });
  assert.equal(out.text, 'No step count on record for today so far.');
});

test('weight: latest vs 7-day mean, kg to one decimal', async () => {
  const days = [
    { date: '2026-10-10', weightKg: 84.0 },
    { date: '2026-10-12', weightKg: 83.4 },
    { date: '2026-10-15', weightKg: 82.8 },
  ];
  const out = await runCheck('weight', { now: NOW, deps: { recentDays: async () => days } });
  assert.match(out.text, /82\.8kg/);
  assert.match(out.text, /vs your 7-day mean of 83\.4kg\./);
});

test('weight: no reading at all', async () => {
  const out = await runCheck('weight', { now: NOW, deps: { recentDays: async () => [] } });
  assert.equal(out.text, 'No weight reading on record for the last 14 days.');
});

test('protein: so far today vs the floor, signed delta in grams', async () => {
  const deps = {
    foodToday: async () => ({ entries: [{ macros: { p: 100 } }, { macros: { p: 40 } }] }),
    fuelProfile: async () => ({ profile: { proteinFloorG: 160 } }),
  };
  const out = await runCheck('protein', { now: new Date('2026-10-15T13:00:00'), deps });
  assert.equal(out.text, '140g logged so far today, -20g vs your 160g floor.');
});

test('protein: no floor set — honest, never assumes a target', async () => {
  const deps = {
    foodToday: async () => ({ entries: [{ macros: { p: 50 } }] }),
    fuelProfile: async () => ({ profile: null }),
  };
  const out = await runCheck('protein', { now: NOW, deps });
  assert.match(out.text, /no protein floor set to check against/);
});

test('calories: end-of-day drops "so far"', async () => {
  const deps = {
    foodToday: async () => ({ entries: [{ macros: { kcal: 2400 } }] }),
    fuelProfile: async () => ({ profile: { targetKcal: 2200 } }),
  };
  const out = await runCheck('calories', { now: new Date('2026-10-15T21:00:00'), deps });
  assert.equal(out.text, '2,400 kcal logged today, +200 kcal vs your 2,200 kcal target.');
});

test('the plan: counts done/skipped priorities', async () => {
  const deps = { plan: async () => ({ today: { status: 'filed', priorities: [{ outcome: 'done' }, { outcome: 'done' }, { outcome: 'skipped' }] } }) };
  const out = await runCheck('plan', { now: NOW, deps });
  assert.equal(out.text, '2 of 3 of today\'s priorities done, 1 skipped.');
});

test('the plan: nothing filed yet today', async () => {
  const out = await runCheck('plan', { now: NOW, deps: { plan: async () => ({ today: null }) } });
  assert.equal(out.text, 'No plan filed for today yet.');
});

test('the plan: still composing is said plainly', async () => {
  const out = await runCheck('the plan', { now: NOW, deps: { plan: async () => ({ today: { status: 'classifying', priorities: null } }) } });
  assert.equal(out.text, "Today's plan is still being composed.");
});

test('the inbox: pending count and the oldest age', async () => {
  const deps = {
    inbox: async () => [
      { status: 'pending', createdAt: new Date(NOW.getTime() - 3 * 3600_000).toISOString() },
      { status: 'pending', createdAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() },
      { status: 'filed', createdAt: NOW.toISOString() },
    ],
  };
  const out = await runCheck('inbox', { now: NOW, deps });
  assert.equal(out.text, '2 pending, oldest waiting 3 hours ago.');
});

test('the inbox: clear is said plainly', async () => {
  const out = await runCheck('the inbox', { now: NOW, deps: { inbox: async () => [] } });
  assert.equal(out.text, 'Inbox is clear, nothing pending.');
});

test('readiness: score and basis straight from computeReadiness', async () => {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(NOW.getTime() - i * 86_400_000);
    days.push({ date: d.toISOString().slice(0, 10), hrv: i <= 2 ? 90 : 70, sleepAsleepMinutes: i === 0 ? 450 : null });
  }
  const out = await runCheck('readiness', { now: NOW, deps: { recentDays: async () => days } });
  assert.match(out.text, /^Readiness is \d+, /);
});

test('readiness: no inputs on record', async () => {
  const out = await runCheck('readiness', { now: NOW, deps: { recentDays: async () => [] } });
  assert.equal(out.text, 'No readiness inputs on record, nothing recent for HRV or sleep.');
});

function session({ date, id = 'bench', name = 'Barbell Bench Press', sets }) {
  return { date, routineName: 'Push', exercises: [{ exerciseId: id, name, sets }] };
}

test('a lift: last top set vs the best of the previous three, plus volume', async () => {
  const sessions = [
    session({ date: '2026-10-14', sets: [{ weight: 80, reps: 6 }] }),
    session({ date: '2026-10-07', sets: [{ weight: 82.5, reps: 5 }] }),
    session({ date: '2026-09-30', sets: [{ weight: 80, reps: 6 }] }),
    session({ date: '2026-09-23', sets: [{ weight: 77.5, reps: 8 }] }),
  ];
  const out = await runCheck('bench', { now: NOW, deps: { sessions: async () => sessions } });
  assert.match(out.text, /^Barbell Bench Press: top set 80kg × 6, -2\.5kg vs your last three; volume /);
});

test('a lift: an exact repeat reads as "same as your last three" (rounded-comparisons rule)', async () => {
  const sessions = [
    session({ date: '2026-10-14', sets: [{ weight: 80, reps: 6 }] }),
    session({ date: '2026-10-07', sets: [{ weight: 80, reps: 6 }] }),
  ];
  const out = await runCheck('bench', { now: NOW, deps: { sessions: async () => sessions } });
  assert.match(out.text, /same as your last three/);
});

test('a lift: reason clause leads with the lift\'s own name', async () => {
  const sessions = [
    session({ date: '2026-10-14', sets: [{ weight: 80, reps: 6 }] }),
    session({ date: '2026-10-07', sets: [{ weight: 85, reps: 5 }] }),
  ];
  const out = await runCheck('bench', { now: NOW, reason: true, deps: { sessions: async () => sessions } });
  assert.match(out.text, /^Barbell Bench Press felt off: /);
});

test('a lift: no prior sessions to compare against', async () => {
  const sessions = [session({ date: '2026-10-14', sets: [{ weight: 80, reps: 6 }] })];
  const out = await runCheck('bench', { now: NOW, deps: { sessions: async () => sessions } });
  assert.match(out.text, /no prior sessions logged yet to compare/);
});

test('a lift: ambiguous name asks, never guesses', async () => {
  const sessions = [
    session({ date: '2026-10-14', id: 'bench-bb', name: 'Barbell Bench Press', sets: [{ weight: 80, reps: 6 }] }),
    session({ date: '2026-10-13', id: 'bench-db', name: 'Dumbbell Bench Press', sets: [{ weight: 30, reps: 8 }] }),
  ];
  const out = await runCheck('bench press', { now: NOW, deps: { sessions: async () => sessions } });
  assert.match(out.text, /^Which bench press/);
});

test('a lift: no match at all returns null (not this layer\'s to answer)', async () => {
  const out = await runCheck('unicorn squat', { now: NOW, deps: { sessions: async () => [] } });
  assert.equal(out, null);
});

test('systems: faults named first', async () => {
  const roster = async () => [
    { id: 'voice', label: "Nova's voice", state: 'off' },
    { id: 'vault', label: 'your Obsidian vault', state: 'working' },
    { id: 'calendar', label: 'Apple Calendar', state: 'set-up' },
  ];
  const out = await runCheck('systems', { now: NOW, deps: { roster } });
  assert.match(out.text, /^Faults: Nova's voice off\. 1 working, 1 set up\.$/);
});

test('systems: all clear, honest about what is merely set up (unproven)', async () => {
  const roster = async () => [
    { id: 'vault', label: 'your Obsidian vault', state: 'working' },
    { id: 'ears', label: 'speech-to-text', state: 'set-up' },
  ];
  const out = await runCheck('systems', { now: NOW, deps: { roster } });
  assert.equal(out.text, '1 systems working, 1 set up but unproven today, none off.');
});

test('frame rotation on repeated calls, never random, never identical every time', async () => {
  const days = daysFixture().map((d, i) => ({ ...d, sleepAsleepMinutes: i === 13 ? 390 : 420 }));
  const deps = { recentDays: async () => days };
  const a = await runCheck('sleep', { now: NOW, deps });
  const b = await runCheck('sleep', { now: NOW, deps });
  assert.notEqual(a.text, b.text); // the two frames alternate
  const c = await runCheck('sleep', { now: NOW, deps });
  assert.equal(a.text, c.text); // and it comes back around, not random
});

test('CHECK_ALIASES is the one word list — a known noun resolves to a stable category', () => {
  assert.equal(CHECK_ALIASES.sleep, 'sleep');
  assert.equal(CHECK_ALIASES['the plan'], 'plan');
  assert.equal(CHECK_ALIASES['the inbox'], 'inbox');
  assert.equal(CHECK_ALIASES.hrv, 'hrv');
});

test('a lift run with drop sets is measured by its top set, never quoted as lost volume', async () => {
  const sessions = [
    session({ date: '2026-10-14', sets: [{ weight: 4.5, reps: 15 }, { weight: 3.5, reps: 15, setType: 'drop' }, { weight: 3, reps: 15, setType: 'drop' }] }),
    session({ date: '2026-10-07', sets: [{ weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }] }),
    session({ date: '2026-09-30', sets: [{ weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }, { weight: 4.5, reps: 12 }] }),
  ];
  const out = await runCheck('bench', { now: NOW, deps: { sessions: async () => sessions } });
  assert.match(out.text, /top set 4\.5kg × 15, same as your last three; run with drop sets, so the top set is the measure, not volume\.$/);
  assert.doesNotMatch(out.text, /% under/);
});

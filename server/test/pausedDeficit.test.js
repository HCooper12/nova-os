import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-paused-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-paused-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

const P = await import('../lib/pausedDeficit.js');
const { earnedToday } = await import('../lib/earnedCalories.js');
const { recordPush } = await import('../lib/notifyPolicy.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const CUT = { facts: { goal: 'lose', pace: 'steady' }, plan: { deltaKcal: -500, targetKcal: 2138 } };

test('the amount is his own deficit from the Intake, and only on a cut', () => {
  assert.equal(P.deficitFromIntake(CUT), 500);
  assert.equal(P.deficitFromIntake({ facts: { goal: 'lose', pace: 'aggressive' }, plan: {} }), 750, 'the pace figure when the plan has no delta');
  assert.equal(P.deficitFromIntake({ facts: { goal: 'maintain' }, plan: { deltaKcal: 0 } }), null);
  assert.equal(P.deficitFromIntake({ facts: { goal: 'gain' }, plan: { deltaKcal: 300 } }), null);
  assert.equal(P.deficitFromIntake(null), null);
});

test('earned and paused never stack past the deficit', () => {
  assert.deepEqual(P.combineExtra({ earned: 150, paused: 500, deficit: 500 }), { earned: 0, paused: 500, total: 500 });
  assert.deepEqual(P.combineExtra({ earned: 150, paused: 300, deficit: 500 }), { earned: 150, paused: 300, total: 450 });
  assert.deepEqual(P.combineExtra({ earned: 400, paused: 300, deficit: 500 }), { earned: 200, paused: 300, total: 500 });
  assert.deepEqual(P.combineExtra({ earned: 150, paused: 0, deficit: 0 }), { earned: 150, paused: 0, total: 150 }, 'no pause: earned has its own cap');
});

test('a pause lasts at most 7 days, and ends when recovery affirmatively reads steady, not on thin data', () => {
  const state = P.startedState({ today: '2026-11-10', deficitKcal: 500 });
  assert.equal(state.until, '2026-11-16', 'seven days, today included');
  assert.equal(P.pausedNow({ state, today: '2026-11-16' }).active, true);
  assert.deepEqual(P.pausedNow({ state, today: '2026-11-17' }), { active: false, kcal: 0, until: '2026-11-16', end: 'expired' });
  assert.equal(P.pausedNow({ state, today: '2026-11-12', clear: true }).end, 'cleared');
  assert.equal(P.pausedNow({ state, today: '2026-11-12', clear: false }).kcal, 500);
  assert.equal(P.pausedNow({ state: { active: false }, today: '2026-11-12' }).kcal, 0);
});

// ---- the sleep rule, end to end through the real loader ---------------------

const ymd = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function writeHealth(lastThree) {
  await mkdir(path.join(dataDir, 'health'), { recursive: true });
  for (let ago = 13; ago >= 0; ago--) {
    const sleep = ago <= 2 ? lastThree[2 - ago] : 420;
    await writeFile(path.join(dataDir, 'health', `${ymd(ago)}.json`), JSON.stringify({ date: ymd(ago), hrv: 60, restingHeartRate: 55, sleepAsleepMinutes: sleep }));
  }
}
const memStore = () => {
  const rows = [];
  return { rows, listRecords: async () => rows, createRecord: async (r) => { rows.push(r); return r; } };
};
const profile = { intake: CUT };

test('the 68-minute night (a watch left off) never starts a pause; once he says it was real, it does', async () => {
  await writeHealth([330, 340, 68]);
  const store = memStore();
  assert.equal(await P.proposePausedDeficit(vault, { deps: { profile, store } }), null, 'unconfirmed short night is held back');
  assert.equal(store.rows.length, 0);
  // his answer, the same file lib/sleepCheck.js writes
  await writeFile(path.join(dataDir, 'health', 'sleep-checks.json'), JSON.stringify({ [ymd(0)]: { verdict: 'real', at: new Date().toISOString() } }));
  const card = await P.proposePausedDeficit(vault, { deps: { profile, store } });
  assert.equal(card.kind, 'paused-deficit');
  assert.match(card.text, /Pause the deficit/);
  assert.equal(card.decision.payload.deficitKcal, 500);
  assert.doesNotMatch(card.decision.payload.body, /[—–]/, 'plain words, no dashes');
  // 'missed' (the watch missed it) is a disputed night too
  await writeFile(path.join(dataDir, 'health', 'sleep-checks.json'), JSON.stringify({ [ymd(0)]: { verdict: 'missed', at: new Date().toISOString() } }));
  assert.equal(await P.proposePausedDeficit(vault, { deps: { profile, store: memStore() } }), null);
  await rm(path.join(dataDir, 'health', 'sleep-checks.json'));
});

test('at most one pending card; a no is respected for a week; not cutting proposes nothing', async () => {
  await writeHealth([330, 330, 330]); // three nights under 6 h that no check disputes: a real signal
  const store = memStore();
  const first = await P.proposePausedDeficit(vault, { deps: { profile, store } });
  assert.ok(first);
  assert.equal(await P.proposePausedDeficit(vault, { deps: { profile, store } }), null, 'one is already waiting');
  first.status = 'discarded'; first.discardedAt = new Date().toISOString();
  assert.equal(await P.proposePausedDeficit(vault, { deps: { profile, store } }), null, 'he said no this week');
  first.discardedAt = new Date(Date.now() - 8 * 86400000).toISOString();
  assert.ok(await P.proposePausedDeficit(vault, { deps: { profile, store } }), 'a week later it may ask again');
  assert.equal(await P.proposePausedDeficit(vault, { deps: { profile: { intake: { facts: { goal: 'maintain' }, plan: {} } }, store: memStore() } }), null);
  assert.equal(await P.proposePausedDeficit(vault, { deps: { profile: null, store: memStore() } }), null);
});

test('the Fuel label says what the room is', async () => {
  const { earnedWords, earnedOn } = await import('../../src/fuelSummaryFacts.js');
  assert.equal(earnedWords({ date: '2026-11-10', earnedKcal: 150, pausedKcal: 0 }, '2026-11-10'), 'earned');
  assert.equal(earnedWords({ date: '2026-11-10', earnedKcal: 0, pausedKcal: 500 }, '2026-11-10'), 'deficit paused');
  assert.equal(earnedWords({ date: '2026-11-10', earnedKcal: 100, pausedKcal: 300 }, '2026-11-10'), 'earned and paused');
  assert.equal(earnedOn({ date: '2026-11-10', kcal: 500 }, '2026-11-11'), 0, 'yesterday\'s room is not today\'s');
});

test('the card is Inbox only: it never pushes', () => {
  assert.equal(recordPush({ kind: 'paused-deficit', status: 'pending' }).push, false);
});

// ---- his yes, today's target, Undo ------------------------------------------

test('yes writes the state from his Intake (not the payload); the target moves by the same road earned uses; Undo restores', async () => {
  const { setIntake } = await import('../lib/profile.js');
  await setIntake(vault, CUT);
  const { fileDecision, undoFiling } = await import('../lib/inbox.js');
  const before = await earnedToday();
  assert.equal(before.kcal, 0);
  const filed = await fileDecision(vault, { route: 'paused-deficit', payload: { deficitKcal: 99999 } });
  assert.match(filed.destination, /Deficit paused/);
  const state = await P.readPausedState();
  assert.equal(state.active, true);
  assert.equal(state.deficitKcal, 500, 'recomputed, the payload number is ignored');
  await writeHealth([420, 420, 420]); // recovery reads steady... but thin HRV never clears, steady does
  const live = await earnedToday();
  assert.equal(live.pausedKcal, 0, 'steady recovery ended it on the first read');
  assert.equal((await P.readPausedState()).endedReason, 'cleared');
  // Undo puts the prior state back
  await undoFiling(vault, filed.undo);
  assert.equal((await P.readPausedState()).active, false);
  // and with the signal still firing the room is there, as a separate field
  await P.writePausedState(P.startedState({ today: ymd(0), deficitKcal: 500 }));
  await writeHealth([330, 330, 330]);
  const on = await earnedToday();
  assert.equal(on.pausedKcal, 500);
  assert.equal(on.kcal, 500, 'the total every reader adds to the target');
  assert.equal(on.earnedKcal, 0, 'earned is absorbed inside the maintenance figure');
  assert.equal(on.date, ymd(0));
  const { targetsForDay } = await import('../lib/runningTotal.js');
  const t = await targetsForDay(vault, ymd(0), { goals: null, profile: { targetKcal: 2138, proteinFloorG: 167 } });
  assert.equal(t.kcal, 2638, 'the running total reads it like earned room');
});

// The training check's dismiss carries one of four realities, and each one
// has a consumer — a chip nobody reads is capture without consumption.
// Temp data dir + temp vault BEFORE imports (the inbox store honours
// NOVA_DATA_DIR; the journal writes into the vault).
import { mkdtemp, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-tc-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-tc-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { classifyReason, plannedNameOf, checkDateOf, carryFromYesterday, missMemory, missMemoryContext, resolveTrainingCheck, TRAINING_CHECK_REASONS } = await import('../lib/trainingCheck.js');
const { createRecord, getRecord, listRecords } = await import('../lib/inboxStore.js');
const { discardRecord } = await import('../lib/inbox.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function checkRecord(id, { date, name = 'Pull', status = 'pending', declineReason = null, legacy = false } = {}) {
  return {
    id, kind: 'training-check', text: `Did ${name} happen today?`, source: 'nova', mode: 'draft', status,
    createdAt: new Date(`${date}T20:05:00`).toISOString(),
    ...(declineReason ? { declineReason } : {}),
    decision: {
      route: 'journal', confidence: 'high', title: `Did ${name} happen today?`, reason: 'x',
      payload: legacy
        ? { text: `Training reconciled ${date}: completed ${name} (confirmed from the schedule).`, category: 'training', label: 'Training check' }
        : { text: `Training reconciled ${date}: completed ${name} (confirmed from the schedule).`, category: 'training', label: 'Training check', plannedName: name, date },
    },
  };
}

test('the four chips classify tolerantly; free text is left alone', () => {
  assert.equal(classifyReason(TRAINING_CHECK_REASONS.didnt), 'didnt');
  assert.equal(classifyReason(TRAINING_CHECK_REASONS.swapped), 'swapped');
  assert.equal(classifyReason(TRAINING_CHECK_REASONS.tonight), 'tonight');
  assert.equal(classifyReason(TRAINING_CHECK_REASONS.elsewhere), 'elsewhere');
  assert.equal(classifyReason('went for a walk instead'), 'swapped');
  assert.equal(classifyReason("I'll do it tonight"), 'tonight');
  assert.equal(classifyReason('tracked it in Strong'), null, 'an unknown phrasing is not guessed into a reality');
  assert.equal(classifyReason(''), null);
});

test('legacy records still name their session and date from the title and timestamp', () => {
  const legacy = checkRecord('l1', { date: '2026-08-20', name: 'Upper Body', legacy: true });
  assert.equal(plannedNameOf(legacy), 'Upper Body');
  assert.equal(checkDateOf(legacy), '2026-08-20');
  const carried = { ...checkRecord('l2', { date: '2026-08-21', legacy: true }), text: "Did yesterday's Leg Day happen in the end?" };
  assert.equal(plannedNameOf(carried), 'Leg Day');
});

test('"swapped" journals an undoable active-rest receipt and leaves the check declined; "logged elsewhere" reconciles as trained', async () => {
  await mkdir(path.join(vault, 'Wiki', 'Journal'), { recursive: true });
  const today = daysAgo(0);
  await createRecord(checkRecord('sw1', { date: today, name: 'Push' }));
  const swapped = await discardRecord('sw1', TRAINING_CHECK_REASONS.swapped, { vaultPath: vault });
  assert.equal(swapped.status, 'discarded', 'a walk is not a session — the check stays declined for the streak');
  assert.equal(swapped.outcome, 'swapped');
  assert.equal(swapped.declineReason, TRAINING_CHECK_REASONS.swapped);
  const receipt = (await listRecords()).find((r) => r.parentId === 'sw1');
  assert.ok(receipt, 'the swap is filed as its own receipt');
  assert.equal(receipt.kind, 'journal');
  assert.equal(receipt.status, 'filed');
  assert.ok(receipt.undoData && receipt.undoData.route === 'journal', 'and it is undoable');
  assert.match(receipt.decision.payload.text, /swapped Push for active rest/);
  const files = await readdir(path.join(vault, 'Wiki', 'Journal'));
  const journal = await readFile(path.join(vault, 'Wiki', 'Journal', files[0]), 'utf8');
  assert.match(journal, /swapped Push for active rest/, 'the line is in his journal');

  await createRecord(checkRecord('el1', { date: today, name: 'Pull' }));
  const elsewhere = await discardRecord('el1', TRAINING_CHECK_REASONS.elsewhere, { vaultPath: vault });
  assert.equal(elsewhere.status, 'filed', 'logged elsewhere IS trained — filed like an approve');
  assert.equal(elsewhere.outcome, 'logged-elsewhere');
  assert.match(elsewhere.decision.payload.text, /completed Pull \(logged elsewhere\)/);
  assert.ok(elsewhere.undoData, 'undoable like any filing');

  await createRecord(checkRecord('tn1', { date: today, name: 'Pull' }));
  const tonight = await discardRecord('tn1', TRAINING_CHECK_REASONS.tonight, { vaultPath: vault });
  assert.equal(tonight.status, 'discarded');
  assert.equal(tonight.outcome, 'tonight');

  await createRecord(checkRecord('ft1', { date: today, name: 'Pull' }));
  const free = await discardRecord('ft1', 'tracked it in Strong', { vaultPath: vault });
  assert.equal(free.status, 'discarded');
  assert.equal(free.declineReason, 'tracked it in Strong', 'free text stays on record, as before');
  assert.equal(free.outcome, 'other');

  // no reason → the plain discard, untouched
  await createRecord(checkRecord('pl1', { date: today }));
  const plain = await discardRecord('pl1', undefined, { vaultPath: vault });
  assert.equal(plain.status, 'discarded');
  assert.equal(plain.declineReason, undefined);
});

test('a "tonight" promise with nothing logged carries into the next day — and is dropped once anything reconciles it', () => {
  const y = daysAgo(1);
  const promised = checkRecord('p1', { date: y, name: 'Leg Day', status: 'discarded', declineReason: TRAINING_CHECK_REASONS.tonight });
  assert.deepEqual(carryFromYesterday([promised], { yesterday: y, sessionDates: new Set() }), { name: 'Leg Day', date: y });
  assert.equal(carryFromYesterday([promised], { yesterday: y, sessionDates: new Set([y]) }), null, 'he logged it later that night');
  const filedLater = checkRecord('p2', { date: y, name: 'Leg Day', status: 'filed' });
  assert.equal(carryFromYesterday([promised, filedLater], { yesterday: y, sessionDates: new Set() }), null, 'a reconciled day carries nothing');
  const didnt = checkRecord('p3', { date: y, status: 'discarded', declineReason: TRAINING_CHECK_REASONS.didnt });
  assert.equal(carryFromYesterday([didnt], { yesterday: y, sessionDates: new Set() }), null, '"didn\'t happen" is an answer, not a promise');
});

test('miss memory: a weekday that keeps not happening is named; reconciled days count as done; one miss is not a pattern', () => {
  // today is a Wednesday; Mondays are Pull, Thursdays are Push, weekends rest
  const today = '2026-09-02';
  const schedule = { monday: 'pull', thursday: 'push', saturday: 'active-rest' };
  const sessionDates = new Set(['2026-08-31', '2026-08-24']); // two Mondays trained
  const records = [
    checkRecord('m1', { date: '2026-08-17', name: 'Pull', status: 'filed' }), // a Monday reconciled → done
    checkRecord('m2', { date: '2026-08-27', name: 'Push', status: 'discarded', declineReason: TRAINING_CHECK_REASONS.didnt }),
  ];
  const items = missMemory({ schedule, sessionDates, records, today, weeks: 4 });
  // Mondays in window: 08-10 (missed), 08-17 (reconciled), 08-24, 08-31 → 1 of 4 missed → not a pattern
  // Thursdays in window: 08-06, 08-13, 08-20, 08-27 → nothing logged → 4 of 4 missed
  assert.deepEqual(items, [{ weekday: 'Thursday', routineId: 'push', missed: 4, of: 4 }]);
  const ctx = missMemoryContext(items, { push: 'Push' });
  assert.match(ctx, /Thursday \(Push\) — missed 4 of the last 4/);
  assert.match(ctx, /schedule or life/);
  assert.equal(missMemoryContext([]), '', 'no pattern, no line');
  assert.deepEqual(missMemory({ schedule: {}, sessionDates, records, today }), [], 'no schedule, nothing to miss');
});

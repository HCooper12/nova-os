// PAIN IS ASKED ONCE (13 Nov 2026). His words: "one time I mentioned some
// slight pain during an exercise but wasn't ongoing (it should have merely
// asked if this was continual pain or not)". One asker, on the inbox rails;
// yes writes with an undo, no writes nothing, and nothing is asked twice.
// Temp data and vault, set before any import.
process.env.TZ = 'Australia/Brisbane';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

const root = await mkdtemp(path.join(tmpdir(), 'nova-paincheck-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
process.env.NOVA_VAULT_GRACE_MS = '0';
const vault = path.join(root, 'vault');
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
await mkdir(path.join(vault, 'Wiki', 'Health'), { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY = 86_400_000;
// pinned: 12:00 Brisbane on Thu 12 Nov 2026, so no test depends on the day it runs
const NOW = new Date('2026-11-12T02:00:00Z');
const daysAgo = (n) => local(new Date(NOW.getTime() - n * DAY));

// the old entry for the injury variant, written in the log's own format before anything reads it
await writeFile(path.join(vault, 'Wiki/Health/Injury Log.md'), matter.stringify('# Injury Log\n', {
  type: 'injury-log', updated: daysAgo(20),
  injuries: [{ id: 'oldknee', area: 'Left knee', note: 'twinge on squats', severity: 'niggle', startedAt: daysAgo(20) }],
}), 'utf8');

// a second vault for the answer-and-undo tests, with its own old entry
const vault2 = path.join(root, 'vault2');
await mkdir(path.join(vault2, 'Wiki', 'Health'), { recursive: true });
await writeFile(path.join(vault2, 'Wiki/Health/Injury Log.md'), matter.stringify('# Injury Log\n', {
  type: 'injury-log', updated: daysAgo(25),
  injuries: [{ id: 'oldwrist', area: 'Right wrist', note: 'ache on push-ups', severity: 'niggle', startedAt: daysAgo(25) }],
}), 'utf8');

const { painMentions, raisePainChecks, injuryIsFresh, freshInjuries } = await import('../lib/painCheck.js');
const { approveRecord, discardRecord, undoRecord } = await import('../lib/inbox.js');
const { getRecord, listRecords, updateRecord } = await import('../lib/inboxStore.js');
const { reopenRecord } = await import('../lib/inbox.js');
const { listInjuries } = await import('../lib/injuryLog.js');

const memStore = () => {
  const rows = [];
  return {
    rows,
    listRecords: async () => rows,
    createRecord: async (r) => { rows.push(r); return r; },
    updateRecord: async (id, patch) => Object.assign(rows.find((r) => r.id === id), patch),
  };
};
const session = (date, exercises) => ({ date, exercises });
const benchPain = (date, pain = 'Shoulder (left), during the set') => session(date, [{ exerciseId: 'bench', name: 'Bench Press', pain, sets: [{ weight: 80, reps: 8 }] }]);

test('a mention from yesterday raises exactly one question, and running again raises none', async () => {
  const store = memStore();
  const sessions = [benchPain(daysAgo(1))];
  const first = await raisePainChecks(vault, { store, sessions, injuries: [], now: NOW });
  assert.equal(first.raised.length, 1);
  const r = first.raised[0];
  assert.equal(r.kind, 'pain-check');
  assert.equal(r.status, 'pending');
  assert.equal(r.painKey, `pain:bench:${daysAgo(1)}`);
  assert.equal(r.area, 'Shoulder (left)');
  assert.equal(r.text, 'You logged pain on Bench Press yesterday. Is it still going on?');
  const again = await raisePainChecks(vault, { store, sessions, injuries: [], now: NOW });
  assert.equal(again.raised.length, 0);
  assert.equal(store.rows.length, 1);
});

test('today is too soon, eight days is too late', async () => {
  assert.equal(painMentions([benchPain(daysAgo(0))], { now: NOW }).length, 0);
  assert.equal(painMentions([benchPain(daysAgo(8))], { now: NOW }).length, 0);
  assert.equal(painMentions([benchPain(daysAgo(7))], { now: NOW }).length, 1);
  const store = memStore();
  const out = await raisePainChecks(vault, { store, sessions: [benchPain(daysAgo(0)), benchPain(daysAgo(8))], injuries: [], now: NOW });
  assert.equal(out.raised.length, 0);
});

test('a set-level pain flag and a pain note both count; soreness does not', () => {
  const s = [session(daysAgo(2), [
    { exerciseId: 'row', name: 'Barbell Row', sets: [{ reps: 8, pain: true }] },
    { exerciseId: 'curl', name: 'Curl', note: 'slight pinch in the elbow', sets: [{ reps: 10 }] },
    { exerciseId: 'dip', name: 'Dip', note: 'triceps sore from yesterday', sets: [{ reps: 10 }] },
  ])];
  const m = painMentions(s, { now: NOW });
  assert.deepEqual(m.map((x) => x.exerciseId), ['row', 'curl']);
  assert.equal(m[0].area, 'Barbell Row', 'no logged area: the exercise names it');
});

test('never more than two waiting at once; the rest wait for the next run', async () => {
  const store = memStore();
  const sessions = [session(daysAgo(1), ['a', 'b', 'c'].map((id) => ({ exerciseId: id, name: `Lift ${id}`, pain: `${id} spot`, sets: [{ reps: 5 }] })))];
  const out = await raisePainChecks(vault, { store, sessions, injuries: [], now: NOW });
  assert.equal(out.raised.length, 2);
  assert.equal((await raisePainChecks(vault, { store, sessions, injuries: [], now: NOW })).raised.length, 0);
  store.rows[0].status = 'discarded';
  const next = await raisePainChecks(vault, { store, sessions, injuries: [], now: NOW });
  assert.equal(next.raised.length, 1, 'one answered frees one slot');
});

test('an area already open on the log, or one he closed, raises nothing', async () => {
  const sessions = [benchPain(daysAgo(1), 'Shoulder (left), during the set')];
  const open = [{ id: 'i1', area: 'Left shoulder', severity: 'niggle', startedAt: daysAgo(3) }];
  assert.equal((await raisePainChecks(vault, { store: memStore(), sessions, injuries: open, now: NOW })).raised.length, 0);
  const closed = [{ id: 'i2', area: 'Shoulder', severity: 'niggle', startedAt: daysAgo(40), resolvedAt: daysAgo(1) }];
  assert.equal((await raisePainChecks(vault, { store: memStore(), sessions, injuries: closed, now: NOW })).raised.length, 0);
});

test('yes files one Injury Log entry and Undo removes it; no writes nothing and it is never asked again, even after expiring', async () => {
  const before = (await listInjuries(vault)).length;
  const sessions = [
    session(daysAgo(1), [{ exerciseId: 'press', name: 'Overhead Press', pain: 'Wrist (right), at the top', sets: [{ reps: 6 }] }]),
    session(daysAgo(2), [{ exerciseId: 'squat', name: 'Squat', pain: 'Hip, in the hole', sets: [{ reps: 5 }] }]),
  ];
  const { raised } = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  assert.equal(raised.length, 2);
  const yes = raised.find((r) => r.exerciseId === 'press');
  const no = raised.find((r) => r.exerciseId === 'squat');

  const filed = await approveRecord(vault, yes.id);
  assert.equal(filed.status, 'filed');
  assert.equal(filed.destination, 'Injury Log');
  const after = await listInjuries(vault);
  assert.equal(after.length, before + 1);
  const entry = after.find((i) => i.area === 'Wrist (right)');
  assert.ok(entry && !entry.resolvedAt);
  assert.equal(entry.severity, 'niggle');
  assert.match(entry.note, /^Logged pain on Overhead Press on \w{3} \d{1,2} \w{3}; he said it is still going on\.$/);
  await undoRecord(vault, yes.id);
  assert.equal((await listInjuries(vault)).length, before, 'undo removes exactly that entry');

  await discardRecord(no.id);
  await updateRecord(no.id, { discardedAt: NOW.toISOString() });
  assert.equal((await listInjuries(vault)).length, before, 'no writes nothing');
  const again = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  assert.equal(again.raised.filter((r) => r.painKey).length, 0, 'neither mention is asked twice');

  // an expired question is never re-asked either
  const third = session(daysAgo(3), [{ exerciseId: 'lunge', name: 'Lunge', pain: 'Ankle', sets: [{ reps: 8 }] }]);
  const { raised: r3 } = await raisePainChecks(vault, { sessions: [third], injuries: [], now: NOW });
  assert.equal(r3.length, 1);
  await updateRecord(r3[0].id, { status: 'discarded', discardedAt: NOW.toISOString(), expired: true });
  assert.equal((await raisePainChecks(vault, { sessions: [third], injuries: [], now: NOW })).raised.filter((r) => r.painKey).length, 0);
});

test('an old open entry is asked "has it cleared up?": yes resolves it and Undo reopens it', async () => {
  const injuries = await listInjuries(vault);
  const knee = injuries.find((i) => i.id === 'oldknee');
  assert.equal(injuryIsFresh(knee, [], NOW), false, 'twenty days with no word is not fresh');
  const { raised } = await raisePainChecks(vault, { sessions: [], now: NOW });
  const ask = raised.find((r) => r.injuryId === 'oldknee');
  assert.ok(ask);
  assert.match(ask.text, /^Your Injury Log still has Left knee open, since \w{3} \d{1,2} \w{3}\. Has it cleared up\?$/);

  await approveRecord(vault, ask.id);
  assert.ok((await listInjuries(vault)).find((i) => i.id === 'oldknee').resolvedAt, 'yes means it has cleared');
  await undoRecord(vault, ask.id);
  assert.equal((await listInjuries(vault)).find((i) => i.id === 'oldknee').resolvedAt, undefined, 'undo reopens it');
});

test('"not yet" keeps it open, keeps it fresh for 14 days, then it is asked once more', async () => {
  // the earlier yes was undone; clear the way so this run asks again
  for (const r of await listRecords()) {
    if (r.kind === 'pain-check' && r.injuryId === 'oldknee') await updateRecord(r.id, { createdAt: new Date(NOW.getTime() - 30 * DAY).toISOString() });
  }
  const { raised } = await raisePainChecks(vault, { sessions: [], now: NOW });
  const ask = raised.find((r) => r.injuryId === 'oldknee');
  assert.ok(ask, 'asked again once the last asking is old');
  await discardRecord(ask.id);
  await updateRecord(ask.id, { discardedAt: NOW.toISOString() }); // his answer is dated at the pinned clock
  const knee = (await listInjuries(vault)).find((i) => i.id === 'oldknee');
  assert.ok(!knee.resolvedAt, 'no writes nothing: it stays open');
  const records = await listRecords();
  assert.equal(injuryIsFresh(knee, records, NOW), true, 'his "not yet" keeps it current');
  assert.equal(freshInjuries([knee], records, new Date(NOW.getTime() + 10 * DAY)).length, 1);
  assert.equal(freshInjuries([knee], records, new Date(NOW.getTime() + 16 * DAY)).length, 0);

  const at = (d) => new Date(NOW.getTime() + d * DAY);
  assert.equal((await raisePainChecks(vault, { sessions: [], now: at(10) })).raised.filter((r) => r.injuryId).length, 0, 'not inside the fortnight');
  const later = await raisePainChecks(vault, { sessions: [], now: at(16) });
  assert.equal(later.raised.filter((r) => r.injuryId === 'oldknee').length, 1, 'asked again after it');
  assert.equal((await raisePainChecks(vault, { sessions: [], now: at(16) })).raised.filter((r) => r.injuryId).length, 0, 'and only once');
  assert.ok(await getRecord(later.raised[0].id));
});

test('a mention he already said yes to is not raised again', async () => {
  const store = memStore();
  const ownVault = path.join(root, 'vault-yes-once');
  await mkdir(path.join(ownVault, 'Wiki', 'Health'), { recursive: true });
  const sessions = [session(daysAgo(2), [{ exerciseId: 'cablerow', name: 'Cable Row', pain: 'Elbow (right), on the pull', sets: [{ reps: 10 }] }])];
  const { raised } = await raisePainChecks(ownVault, { store, sessions, injuries: [], now: NOW });
  assert.equal(raised.length, 1);
  const { approvePainCheck } = await import('../lib/painCheck.js');
  const filed = await approvePainCheck(ownVault, raised[0], { store });
  assert.equal(filed.status, 'filed');
  const again = await raisePainChecks(ownVault, { store, sessions, injuries: [], now: NOW });
  assert.equal(again.raised.length, 0, 'asked once, ever');
  assert.equal(store.rows.length, 1);
});

// ---- answers, undo and what a later run does -------------------------------

// free the two waiting slots left by earlier tests, without making any of it his answer
const clearPending = async () => {
  for (const r of await listRecords()) {
    if (r.kind === 'pain-check' && r.status === 'pending') await updateRecord(r.id, { status: 'discarded', expired: true, discardedAt: NOW.toISOString() });
  }
};
const elbow = (n) => [session(daysAgo(n), [{ exerciseId: 'curl2', name: 'Hammer Curl', pain: 'Elbow (left), on the way up', sets: [{ reps: 10 }] }])];

test('a yes on "still going on?" carries the injury-log undoData, and the same mention is not asked again', async () => {
  await clearPending();
  const sessions = elbow(2);
  const { raised } = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  assert.equal(raised.length, 1);
  const filed = await approveRecord(vault, raised[0].id);
  const entry = (await listInjuries(vault)).find((i) => i.area === 'Elbow (left)');
  assert.ok(entry);
  assert.deepEqual(filed.undoData, { route: 'injury-log', injuryId: entry.id, area: 'Elbow (left)' });
  const again = await raisePainChecks(vault, { sessions, injuries: await listInjuries(vault), now: NOW });
  assert.equal(again.raised.length, 0, 'answered yes, filed, and not asked a second time');
  await undoRecord(vault, raised[0].id); // leave the log as it was
});

test('after an undone yes the entry is gone and the same mention is still never asked again', async () => {
  await clearPending();
  const sessions = elbow(3);
  const { raised } = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  assert.equal(raised.length, 1);
  await approveRecord(vault, raised[0].id);
  assert.ok((await listInjuries(vault)).some((i) => i.area === 'Elbow (left)'));
  const undone = await undoRecord(vault, raised[0].id);
  assert.equal(undone.status, 'undone');
  assert.ok(!(await listInjuries(vault)).some((i) => i.area === 'Elbow (left)'), 'the entry is gone');
  const again = await raisePainChecks(vault, { sessions, injuries: await listInjuries(vault), now: NOW });
  assert.equal(again.raised.filter((r) => r.painKey).length, 0, 'the undone record still holds its painKey: asked once, ever');
});

test('a no cannot be undone or reopened (nothing was filed), and the mention stays answered', async () => {
  await clearPending();
  const sessions = [session(daysAgo(4), [{ exerciseId: 'raise', name: 'Lateral Raise', pain: 'Neck, on the last rep', sets: [{ reps: 12 }] }])];
  const { raised } = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  assert.equal(raised.length, 1);
  await discardRecord(raised[0].id);
  await assert.rejects(() => undoRecord(vault, raised[0].id), /only filed captures can be undone/);
  await assert.rejects(() => reopenRecord(raised[0].id), /only a Coach change/);
  assert.equal((await getRecord(raised[0].id)).status, 'discarded');
  const again = await raisePainChecks(vault, { sessions, injuries: await listInjuries(vault), now: NOW });
  assert.equal(again.raised.filter((r) => r.painKey).length, 0);
});

test('a yes on "has it cleared up?" carries the act/injury.close undoData; undo reopens, and it is asked again only after a fortnight', async () => {
  await clearPending();
  const { raised } = await raisePainChecks(vault2, { sessions: [], now: NOW });
  const ask = raised.find((r) => r.injuryId === 'oldwrist');
  assert.ok(ask);
  const filed = await approveRecord(vault2, ask.id);
  assert.deepEqual(filed.undoData, { route: 'act', verb: 'injury.close', ids: ['oldwrist'], area: 'Right wrist' });
  assert.ok((await listInjuries(vault2)).find((i) => i.id === 'oldwrist').resolvedAt);
  const undone = await undoRecord(vault2, ask.id);
  assert.equal(undone.status, 'undone');
  assert.equal((await listInjuries(vault2)).find((i) => i.id === 'oldwrist').resolvedAt, undefined, 'reopened');
  const at = (d) => new Date(NOW.getTime() + d * DAY);
  assert.equal((await raisePainChecks(vault2, { sessions: [], now: NOW })).raised.length, 0, 'the undone asking is recent: left alone');
  assert.equal((await raisePainChecks(vault2, { sessions: [], now: at(10) })).raised.length, 0, 'still inside the fortnight');
  const later = await raisePainChecks(vault2, { sessions: [], now: at(15) });
  assert.equal(later.raised.filter((r) => r.injuryId === 'oldwrist').length, 1, 'asked again once the last asking is old');
});

test('injuryIsFresh: an expired discard is not his confirmation; his own "not yet" is', () => {
  const injury = { id: 'x1', area: 'Left knee', startedAt: daysAgo(30) };
  const base = { kind: 'pain-check', injuryId: 'x1', status: 'discarded', discardedAt: NOW.toISOString() };
  assert.equal(injuryIsFresh(injury, [], NOW), false, 'old and unconfirmed');
  assert.equal(injuryIsFresh(injury, [{ ...base, expired: true }], NOW), false, 'expired unanswered is not an answer');
  assert.equal(injuryIsFresh(injury, [{ ...base }], NOW), true, 'his discard counts');
  assert.equal(injuryIsFresh(injury, [{ ...base, discardedAt: new Date(NOW.getTime() - 15 * DAY).toISOString() }], NOW), false, 'a fortnight and a day old is spent');
  assert.equal(injuryIsFresh({ ...injury, resolvedAt: daysAgo(1) }, [{ ...base }], NOW), false, 'a resolved entry is never current');
});

// THE AUDIT GATE (lib/exerciseAudit.js, 15 Oct 2026, his standing rule). A
// lift that is not audited counts for no muscle, and every count says how
// many sets that left out; an Inbox card carries a DRAFTED mapping that says
// it is a suggestion to check; his yes writes it onto the lift as his own and
// it counts; Undo puts the entry back exactly, unaudited again.
//
// NOVA_DATA_DIR is set BEFORE import: a test without its own data dir writes
// into his live server/data (the 30-fake-greetings lesson).
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-audit-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-audit-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
process.env.TZ = 'Australia/Sydney';

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { addCustomExercise, loadExerciseLibrary, LIBRARY_REL_PATH } = await import('../lib/exercises.js');
const { ensureAuditCards, proposalFor, AUDIT_ROUTE } = await import('../lib/exerciseAudit.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { weeklyMuscleVolume } = await import('../lib/trainingAnalytics.js');
const { plannedWeek } = await import('../lib/plannedWeek.js');
const { weekSetsView } = await import('../../src/weekSets.js');
const { isCoachSuggestion } = await import('../../src/coachSuggestions.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const hack = await addCustomExercise(vault, 'Hack Squat', 'Quads', 'weight_reps'); // audited
const fly = await addCustomExercise(vault, 'Seated Cable Fly', 'Chest', 'weight_reps'); // new to the audit
const lib = async () => (await loadExerciseLibrary(vault)).exercises;
const byId = async (id) => (await lib()).find((e) => e.id === id);
const sets = (n) => Array.from({ length: n }, () => ({ weight: 40, reps: 10 }));
const WEEK = [{ date: '2026-10-13', routineId: 'push', exercises: [{ exerciseId: fly.id, sets: sets(4) }, { exerciseId: hack.id, sets: sets(3) }] }];

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('an unaudited lift is marked pending, credits nothing, and every count says so', async () => {
  const f = await byId(fly.id);
  assert.equal(f.audit, 'pending');
  assert.equal((await byId(hack.id)).audit, 'audited');
  const [wk] = weeklyMuscleVolume(WEEK, await lib());
  assert.deepEqual(wk.groups, { Quads: 3, Glutes: 1.5 }, 'the fly adds nothing to Chest');
  assert.deepEqual(wk.uncounted, { sets: 4, lifts: [{ name: 'Seated Cable Fly', sets: 4 }] });
  // the planned week and the sheet say it too
  const exercises = await lib();
  const slot = (e) => ({ exerciseId: e.id, name: e.name, muscleGroup: e.muscleGroup, targetSets: 4 });
  const w = plannedWeek({ routines: [{ id: 'push', name: 'Push', exercises: [slot(f), slot(await byId(hack.id))] }], schedule: { tuesday: 'push' },
    sessions: WEEK, exercises, now: new Date('2026-10-15T10:00:00'), targetOf: () => ({ target: 10, goalMuscle: false }) });
  assert.equal(w.muscles.some((m) => m.muscle === 'Chest'), false);
  assert.deepEqual(w.uncounted.lifts.map((l) => [l.name, l.sets, l.planned]), [['Seated Cable Fly', 4, 4]]);
  const v = weekSetsView(w);
  assert.equal(v.uncounted.line, '4 sets on unaudited lifts not counted');
  assert.equal(v.uncounted.hint, 'Seated Cable Fly counts once you approve its muscles in your Inbox.');
});

test('the card proposes a drafted mapping and says it is a suggestion to check; one card per lift, ever', async () => {
  const p = proposalFor(await byId(fly.id));
  assert.equal(p.primary, 'Chest');
  assert.deepEqual(p.secondary, []);
  assert.ok(p.like, 'drafted from the nearest audited lift');
  const filed = await ensureAuditCards(vault);
  assert.equal(filed.length, 1, 'the audited hack squat gets no card');
  const r = filed[0];
  assert.equal(r.status, 'pending');
  assert.equal(r.decision.route, AUDIT_ROUTE);
  assert.match(r.text, /Seated Cable Fly is not audited yet, so its sets count for no muscle\. A suggestion to check/);
  assert.ok(isCoachSuggestion(r), 'it rides the Coach deck in Train');
  assert.deepEqual(await ensureAuditCards(vault), [], 'asked once');
});

test('his yes writes the mapping as his own and it counts; Undo puts the entry back exactly', async () => {
  const file = path.join(vault, LIBRARY_REL_PATH);
  const before = await readFile(file, 'utf8');
  const [card] = (await listRecords()).filter((x) => x.decision?.route === AUDIT_ROUTE);
  const filed = await approveRecord(vault, card.id);
  assert.equal(filed.status, 'filed');
  const f = await byId(fly.id);
  assert.deepEqual([f.audit, f.muscleGroup, f.secondary], ['approved', 'Chest', []]);
  assert.deepEqual(weeklyMuscleVolume(WEEK, await lib())[0].groups, { Chest: 4, Quads: 3, Glutes: 1.5 });
  assert.equal(weeklyMuscleVolume(WEEK, await lib())[0].uncounted.sets, 0);
  assert.match(await readFile(file, 'utf8'), /primary: Chest/, 'written into his library as an override');

  await undoRecord(vault, card.id);
  assert.equal((await getRecord(card.id)).status, 'undone');
  assert.equal((await byId(fly.id)).audit, 'pending', 'unaudited again');
  assert.doesNotMatch(await readFile(file, 'utf8'), /primary:/);
  assert.equal((await readFile(file, 'utf8')).replace(/updated: .*\n/, ''), before.replace(/updated: .*\n/, ''), 'the library is back as it was');
});

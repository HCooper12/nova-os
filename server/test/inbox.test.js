// Temp data dir + temp vault BEFORE imports (see healthData.test.js).
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-inbox-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-inbox-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { normalizeDecision, fileDecision, undoFiling } = await import('../lib/inbox.js');
const { createRecord, getRecord, updateRecord, listRecords, _resetInboxStore } = await import('../lib/inboxStore.js');
const { approveRecord, discardRecord, undoRecord } = await import('../lib/inbox.js');
const { loadShoppingList } = await import('../lib/shoppingList.js');
const { listEntries } = await import('../lib/journal.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('normalizeDecision coerces sloppy model output into typed decisions', () => {
  const d = normalizeDecision({
    route: 'shopping', confidence: 'HIGH', title: 'Buy things', reason: 'clearly a purchase',
    payload: { items: [{ name: '  tomatoes ', category: 'Produce' }, { name: 'wd-40', category: 'Nonsense Cat' }] },
  });
  assert.equal(d.confidence, 'low'); // anything not exactly "high" is low
  assert.equal(d.payload.items[0].name, 'tomatoes');
  assert.equal(d.payload.items[1].category, 'Household & Other');

  const n = normalizeDecision({ route: 'garbage-route', confidence: 'high', payload: { body: 'an idea' } });
  assert.equal(n.route, 'note'); // unknown routes fall back to note
  assert.equal(n.payload.body, 'an idea');

  assert.throws(() => normalizeDecision({ route: 'todo', confidence: 'high', payload: { items: [] } }));
});

test('shopping: files and undoes deterministic pre-categorized items', async () => {
  const decision = normalizeDecision({
    route: 'shopping', confidence: 'high', title: 'Tomatoes + spray',
    payload: { items: [{ name: 'tomatoes', category: 'Produce' }, { name: 'cleaning spray', category: 'Household & Other' }] },
  });
  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /tomatoes/);
  const { items } = await loadShoppingList(vault);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'inbox');

  const summary = await undoFiling(vault, undo);
  assert.match(summary, /removed 2/);
  const after = await loadShoppingList(vault);
  assert.equal(after.items.length, 0);
});

test('todo: appends checklist lines and undo removes exactly those lines', async () => {
  const decision = normalizeDecision({
    route: 'todo', confidence: 'high', title: 'Book dentist',
    payload: { items: ['Book the dentist appointment', 'Renew car rego'] },
  });
  const { undo } = await fileDecision(vault, decision);
  const todoPath = path.join(vault, 'Wiki/Inbox/To-Do.md');
  let raw = await readFile(todoPath, 'utf8');
  assert.match(raw, /- \[ \] Book the dentist appointment/);
  assert.match(raw, /- \[ \] Renew car rego/);

  await undoFiling(vault, undo);
  raw = await readFile(todoPath, 'utf8');
  assert.doesNotMatch(raw, /dentist/);
  assert.doesNotMatch(raw, /rego/);

  // undoing again reports honestly that there is nothing left to remove
  await assert.rejects(() => undoFiling(vault, undo), /edited or checked off/);
});

test('note: creates a vault page and undo deletes it only while unmodified', async () => {
  const decision = normalizeDecision({
    route: 'note', confidence: 'high', title: 'Compound interest of habits',
    payload: { title: 'Compound Interest of Habits', body: 'Small daily reps beat bursts.' },
  });
  const { undo } = await fileDecision(vault, decision);
  const full = path.join(vault, undo.relPath);
  assert.ok(existsSync(full));
  const { data } = matter(await readFile(full, 'utf8'));
  assert.equal(data.type, 'raw');
  assert.deepEqual(data.tags, ['inbox']);

  // edit the file → undo must refuse rather than delete user work
  await writeFile(full, (await readFile(full, 'utf8')) + '\nedited by hand\n', 'utf8');
  await assert.rejects(() => undoFiling(vault, undo), /edited since filing/);

  // restore content? no — file a fresh one and undo that cleanly
  const second = await fileDecision(vault, decision);
  assert.notEqual(second.undo.relPath, undo.relPath); // collision avoided
  await undoFiling(vault, second.undo);
  assert.ok(!existsSync(path.join(vault, second.undo.relPath)));
});

test('journal: files an entry and undo removes that exact section', async () => {
  const decision = normalizeDecision({
    route: 'journal', confidence: 'high', title: 'Grateful moment',
    payload: { text: 'Really grateful for the quiet morning walk today.' },
  });
  const { undo } = await fileDecision(vault, decision);
  let days = await listEntries(vault);
  assert.equal(days.length, 1);
  assert.match(days[0].sections[0].text, /quiet morning walk/);

  await undoFiling(vault, undo);
  days = await listEntries(vault);
  assert.equal(days.length, 0); // sole entry removed → day file deleted
});

test('food: logs an entry and undo removes it by date + id', async () => {
  const decision = normalizeDecision({
    route: 'food', confidence: 'high', title: 'Protein bar',
    payload: { name: 'Protein bar', macros: { p: 20, c: 15, f: 7, kcal: 200 } },
  });
  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /20P/);
  const dayFile = path.join(dataDir, 'food-log', `${undo.date}.json`);
  let day = JSON.parse(await readFile(dayFile, 'utf8'));
  assert.equal(day.entries.length, 1);

  await undoFiling(vault, undo);
  day = JSON.parse(await readFile(dayFile, 'utf8'));
  assert.equal(day.entries.length, 0);
});

test('store lifecycle: pending → approve files it; discard and undo guard statuses', async () => {
  const decision = normalizeDecision({
    route: 'todo', confidence: 'low', title: 'Maybe fix bike',
    payload: { items: ['Look at the bike brakes'] },
  });
  await createRecord({ id: 'test0001', text: 'maybe fix the bike brakes', source: 'text', mode: 'auto-high', status: 'pending', createdAt: new Date().toISOString(), decision });

  // approving files it and stores undo data
  const approved = await approveRecord(vault, 'test0001');
  assert.equal(approved.status, 'filed');
  assert.ok(approved.undoData);
  assert.match(approved.destination, /bike brakes/);

  // approve twice → clear error
  await assert.rejects(() => approveRecord(vault, 'test0001'), /only pending/);

  // undo reverses it and flips the status
  const undone = await undoRecord(vault, 'test0001');
  assert.equal(undone.status, 'undone');
  await assert.rejects(() => undoRecord(vault, 'test0001'), /only filed/);

  // discard only applies to pending records
  await createRecord({ id: 'test0002', text: 'random musing', source: 'text', mode: 'review-all', status: 'pending', createdAt: new Date().toISOString(), decision });
  const discarded = await discardRecord('test0002');
  assert.equal(discarded.status, 'discarded');

  const all = await listRecords();
  assert.ok(all.find((r) => r.id === 'test0001'));
  assert.ok(all.find((r) => r.id === 'test0002'));
});

// --- Breaker-found hardening regressions (sparring loop, first run) ---

test('cold-cache race: concurrent reader + writer share one load, nothing is lost', async () => {
  _resetInboxStore();
  const rec = { id: 'race0001', text: 'race test', source: 'text', mode: 'auto-high', status: 'discarded', createdAt: new Date().toISOString(), decision: null };
  // fire a lock-free read and a locked write into a cold cache simultaneously
  const [, listed] = await Promise.all([createRecord(rec), listRecords()]);
  assert.ok(Array.isArray(listed));
  _resetInboxStore();
  const after = await listRecords();
  assert.ok(after.find((r) => r.id === 'race0001'), 'record must survive a concurrent cold-cache read');
});

test('corrupt store file is quarantined, never silently overwritten', async () => {
  const { writeFile: wf, readdir } = await import('node:fs/promises');
  _resetInboxStore();
  const before = await listRecords(); // records that must survive via quarantine? no — corrupt wipes memory, but evidence is kept
  await wf(path.join(dataDir, 'inbox.json'), '{"items": [truncated', 'utf8');
  _resetInboxStore();
  const items = await listRecords();
  assert.deepEqual(items, []); // fresh store after corruption
  const files = await readdir(dataDir);
  assert.ok(files.some((f) => f.startsWith('inbox.json.corrupt-')), 'corrupt file must be quarantined: ' + files.join(','));
  // fresh store persists cleanly afterwards
  await createRecord({ id: 'fresh001', text: 'post-corruption', source: 'text', mode: 'auto-high', status: 'discarded', createdAt: new Date().toISOString(), decision: null });
  _resetInboxStore();
  assert.ok((await listRecords()).find((r) => r.id === 'fresh001'));
  assert.ok(before.length >= 0); // silence unused warning
});

test('error records are unresolved — never trimmed away', async () => {
  const errRecord = { id: 'err00001', text: 'a thought that failed to classify', source: 'text', mode: 'auto-high', status: 'error', createdAt: new Date(Date.now() - 10_000_000).toISOString(), decision: null, error: 'boom' };
  await createRecord(errRecord);
  // flood with enough newer resolved records to trigger trimming
  for (let i = 0; i < 405; i++) {
    await createRecord({ id: `flood${String(i).padStart(4, '0')}`, text: 'x', source: 'text', mode: 'auto-high', status: 'discarded', createdAt: new Date(Date.now() - 1000 + i).toISOString(), decision: null });
  }
  const items = await listRecords();
  assert.ok(items.find((r) => r.id === 'err00001'), 'error record must survive trimming');
  const resolved = items.filter((r) => !['classifying', 'pending', 'error'].includes(r.status));
  assert.ok(resolved.length <= 400, 'resolved records must still be bounded');
});

test('stash route: files a link into the vault Stash and undo strips it exactly', async () => {
  const d = normalizeDecision({
    route: 'stash', confidence: 'high', title: 'Stash face wash',
    payload: { category: 'Skincare', name: 'Face Wash', url: 'https://example.com/wash', note: 'restock' },
  });
  assert.equal(d.route, 'stash');
  const { destination, undo } = await fileDecision(vault, d);
  assert.match(destination, /Stash — Face Wash → Skincare/);
  const raw = await readFile(path.join(vault, 'Wiki/Library/Stash.md'), 'utf8');
  assert.ok(raw.includes('- [Face Wash](https://example.com/wash) — restock'));

  await undoFiling(vault, undo);
  const after = await readFile(path.join(vault, 'Wiki/Library/Stash.md'), 'utf8');
  assert.ok(!after.includes('Face Wash'), 'undo removed the exact stashed line');
});

test('stash route: refuses a capture with no real URL (never invents one)', () => {
  assert.throws(
    () => normalizeDecision({ route: 'stash', confidence: 'high', payload: { category: 'Skincare', name: 'Face Wash', url: 'facewash dot com' } }),
    /http/
  );
});

test('routine-edit route: coach swap files deterministically and undo restores the exact list', async () => {
  const { addCustomExercise } = await import('../lib/exercises.js');
  const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
  const { loadExerciseLibrary } = await import('../lib/exercises.js');
  const curl = await addCustomExercise(vault, 'Spider Curl', 'Biceps', 'weight_reps');
  const row = await addCustomExercise(vault, 'Lying T Bar Row', 'Back', 'weight_reps');
  let { exercises } = await loadExerciseLibrary(vault);
  const routine = await createRoutine(vault, exercises, 'Pull', [
    { exerciseId: row.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
    { exerciseId: curl.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
  ]);

  const { validateCoachEdit } = await import('../lib/coach.js');
  const { payload, title } = await validateCoachEdit(vault, {
    action: 'swap', routine: 'pull', remove: 'spider curl', add: 'Incline Dumbbell Curl',
    targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12, reason: 'elbow-friendly',
  });
  assert.match(title, /swap Spider Curl → Incline Dumbbell Curl in Pull/);
  assert.ok(payload.addExerciseId, 'known library exercise matched by name');
  const unknown = await validateCoachEdit(vault, { action: 'add', routine: 'Pull', add: 'Zercher Kickflip Curl', muscleGroup: 'Biceps' });
  assert.equal(unknown.payload.addExerciseId, null, 'truly unknown exercise defers creation to approve time');

  const { destination, undo } = await fileDecision(vault, { route: 'routine-edit', payload });
  assert.match(destination, /swapped Spider Curl → Incline Dumbbell Curl/);
  ({ exercises } = await loadExerciseLibrary(vault));
  let { routines } = await loadRoutines(vault, exercises);
  let pull = routines.find((r) => r.id === routine.id);
  assert.deepEqual(pull.exercises.map((e) => e.name), ['Lying T Bar Row', 'Incline Dumbbell Curl']);
  assert.equal(pull.exercises[1].targetRepsHigh, 12, 'proposed targets applied');

  await undoFiling(vault, undo);
  ({ routines } = await loadRoutines(vault, exercises));
  pull = routines.find((r) => r.id === routine.id);
  assert.deepEqual(pull.exercises.map((e) => e.name), ['Lying T Bar Row', 'Spider Curl'], 'undo restored the exact prior list');
});

test('routine-edit validation refuses unknown routines and exercises honestly', async () => {
  const { validateCoachEdit } = await import('../lib/coach.js');
  await assert.rejects(validateCoachEdit(vault, { action: 'swap', routine: 'Leg Day', remove: 'x', add: 'y' }), /no routine called/);
  await assert.rejects(validateCoachEdit(vault, { action: 'remove', routine: 'Pull', remove: 'Bench Press' }), /isn't in Pull/);
});

test('parseCoachProposal extracts the PROPOSE line and cleans the reply', async () => {
  const { parseCoachProposal } = await import('../lib/coach.js');
  const { cleanText, proposal } = parseCoachProposal('Swap makes sense — less elbow stress.\n\nPROPOSE {"action":"swap","routine":"Pull","remove":"A","add":"B"}');
  assert.equal(proposal.action, 'swap');
  assert.ok(!cleanText.includes('PROPOSE'));
  const none = parseCoachProposal('Just advice, no change needed.');
  assert.equal(none.proposal, null);
});

test('a fuel-cross finding approves as an acknowledgement — no decision, nothing written', async () => {
  await createRecord({ id: 'fuelx001', kind: 'fuel-cross', findingKey: 'floor-most-days', text: 'Fuel × training: the floor was missed.', source: 'coach', mode: 'draft', status: 'pending', createdAt: new Date().toISOString() });
  const approved = await approveRecord(vault, 'fuelx001');
  assert.equal(approved.status, 'filed');
  assert.equal(approved.destination, null); // a receipt, not a filing
  assert.ok(!approved.undoData); // nothing to undo — nothing was written
});

test('declining with a reason stores it; adviceContext holds the Coach to it', async () => {
  await createRecord({
    id: 'declin01', text: 'add weighted dips', source: 'text', mode: 'review-all', status: 'pending',
    createdAt: new Date().toISOString(),
    decision: { route: 'routine-edit', confidence: 'high', title: 'Add weighted dips to Push', reason: 'chest volume is low', payload: {} },
  });
  const declined = await discardRecord('declin01', '  no dip belt at my gym  ');
  assert.equal(declined.status, 'discarded');
  assert.equal(declined.declineReason, 'no dip belt at my gym'); // trimmed

  const { adviceContext } = await import('../lib/coach.js');
  const ctx = await adviceContext();
  assert.match(ctx, /Add weighted dips to Push → declined — his reason: "no dip belt at my gym"/);
  assert.match(ctx, /never re-ask why/);

  // declining WITHOUT a reason leaves the ask-once instruction instead
  await createRecord({
    id: 'declin02', text: 'deload next week', source: 'text', mode: 'review-all', status: 'pending',
    createdAt: new Date().toISOString(),
    decision: { route: 'training-block', confidence: 'high', title: 'Start a deload block', reason: 'fatigue signals', payload: {} },
  });
  await discardRecord('declin02');
  const ctx2 = await adviceContext();
  assert.match(ctx2, /Start a deload block → declined \(no reason recorded — ask why once/);
});

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
const { createRecord, getRecord, updateRecord, listRecords } = await import('../lib/inboxStore.js');
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

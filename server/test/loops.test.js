// Temp data dir + temp vault BEFORE imports (see healthData.test.js).
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-loops-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-loops-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { composeDispatch, runDispatch, getDispatchConfig, setDispatchConfig } = await import('../lib/dispatch.js');
const { runCompost, acceptProposal, dismissProposal, getCompost } = await import('../lib/compost.js');
const { undoFiling } = await import('../lib/inbox.js');
const { listRecords } = await import('../lib/inboxStore.js');
const { saveDay } = await import('../lib/healthData.js');
const { listEntries } = await import('../lib/journal.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('dispatch config: two slots, persistence, clamping, legacy migration', async () => {
  const initial = await getDispatchConfig();
  assert.equal(initial.morning.mode, 'draft'); // per Hayden: draft-for-review first
  assert.deepEqual(initial.evening, { mode: 'draft', hour: 21 });

  const set = await setDispatchConfig('morning', { mode: 'auto', hour: 6 });
  assert.deepEqual(set.morning, { mode: 'auto', hour: 6 });
  assert.equal(set.evening.mode, 'draft'); // untouched

  const bad = await setDispatchConfig('morning', { mode: 'nonsense', hour: 99 });
  assert.deepEqual(bad.morning, { mode: 'auto', hour: 6 }); // invalid patch changes nothing

  // legacy single-slot file shape migrates to the morning slot
  await writeFile(path.join(dataDir, 'dispatch.json'), JSON.stringify({ mode: 'auto', hour: 8 }), 'utf8');
  const migrated = await getDispatchConfig();
  assert.deepEqual(migrated.morning, { mode: 'auto', hour: 8 });
  assert.deepEqual(migrated.evening, { mode: 'draft', hour: 21 });

  await setDispatchConfig('morning', { mode: 'draft', hour: 7 });
});

test('composeDispatch degrades honestly with no data, and uses real data when present', async () => {
  const empty = await composeDispatch(vault);
  assert.match(empty.title, /Morning Dispatch/);
  assert.match(empty.text, /No health data yet\./);

  await saveDay(iso(-1), { hrv: 90, restingHeartRate: 52, sleepAsleepMinutes: 432, steps: 8200 });
  await saveDay(iso(-2), { hrv: 80 });
  const withData = await composeDispatch(vault);
  assert.match(withData.text, /HRV 90 ms/);
  assert.match(withData.text, /\+13% vs 7-day avg/); // 90 vs 80 baseline
  assert.match(withData.text, /resting 52 bpm/);
  assert.match(withData.text, /7h 12m asleep/);
  assert.match(withData.text, /8,200 steps yesterday/);
});

test('dispatch draft mode lands a pending inbox record; approve files to journal; re-run is guarded', async () => {
  const { record } = await runDispatch(vault);
  assert.equal(record.status, 'pending');
  assert.equal(record.kind, 'dispatch');
  assert.equal(record.decision.route, 'journal');

  // second run same day is a no-op
  const again = await runDispatch(vault);
  assert.equal(again.skipped, true);

  // force re-run supersedes the unactioned draft
  const forced = await runDispatch(vault, { force: true });
  assert.equal(forced.record.status, 'pending');
  const records = await listRecords();
  const superseded = records.find((r) => r.id === record.id);
  assert.equal(superseded.status, 'discarded');

  // approving the fresh draft files it into the real (temp) journal
  const { approveRecord } = await import('../lib/inbox.js');
  const approved = await approveRecord(vault, forced.record.id);
  assert.equal(approved.status, 'filed');
  const days = await listEntries(vault);
  assert.equal(days.length, 1);
  assert.match(days[0].sections[0].text, /Morning Dispatch/);

  // and the filing is undoable like any other
  const { undoRecord } = await import('../lib/inbox.js');
  const undone = await undoRecord(vault, forced.record.id);
  assert.equal(undone.status, 'undone');
  assert.equal((await listEntries(vault)).length, 0);
});

test('dispatch auto mode files immediately and stays undoable', async () => {
  await setDispatchConfig('morning', { mode: 'auto' });
  const { record } = await runDispatch(vault, { force: true });
  assert.equal(record.status, 'filed');
  assert.equal(record.auto, true);
  assert.match(record.destination, /Journal/);
  await undoFiling(vault, record.undoData);
  assert.equal((await listEntries(vault)).length, 0);
  await setDispatchConfig('morning', { mode: 'draft' });
});

test('evening debrief: independent slot guard, honest content, own title', async () => {
  const { composeDispatch: compose } = await import('../lib/dispatch.js');
  const debrief = await compose(vault, 'evening');
  assert.match(debrief.title, /Evening Debrief/);
  assert.match(debrief.text, /\*\*Fuel\.\*\*/);
  assert.match(debrief.text, /\*\*Training\.\*\*/);

  // evening run is guarded independently of the morning record
  const morning = await runDispatch(vault, { slot: 'morning', force: true });
  const evening = await runDispatch(vault, { slot: 'evening' });
  assert.equal(evening.record.slot, 'evening');
  assert.equal(evening.record.status, 'pending');
  assert.notEqual(evening.record.id, morning.record.id);
  const again = await runDispatch(vault, { slot: 'evening' });
  assert.equal(again.skipped, true);
  // and the morning guard still sees its own record
  const morningAgain = await runDispatch(vault, { slot: 'morning' });
  assert.equal(morningAgain.skipped, true);
});

test('compost detects stale captures, orphans, and sweepable to-dos', async () => {
  const inboxDir = path.join(vault, 'Wiki/Inbox');
  await mkdir(inboxDir, { recursive: true });
  // stale capture (created 30 days ago per frontmatter)
  await writeFile(path.join(inboxDir, 'Old Idea.md'),
    matter.stringify('# Old Idea\n\nDusty.\n', { type: 'raw', tags: ['inbox'], created: iso(-30), updated: iso(-30) }), 'utf8');
  // fresh capture (should NOT appear)
  await writeFile(path.join(inboxDir, 'Fresh Idea.md'),
    matter.stringify('# Fresh Idea\n\nNew.\n', { type: 'raw', tags: ['inbox'], created: iso(-1), updated: iso(-1) }), 'utf8');
  // orphan note (no links either way)
  await mkdir(path.join(vault, 'Wiki/Concepts'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Concepts/Lonely Island.md'),
    matter.stringify('# Lonely Island\n\nNothing links here.\n', { type: 'concept', created: iso(-5), updated: iso(-5) }), 'utf8');
  // to-do file with checked + unchecked lines
  await writeFile(path.join(inboxDir, 'To-Do.md'),
    matter.stringify(`# To-Do\n\n- [ ] Still open _(added ${iso(-3)})_\n- [x] Done thing _(added ${iso(-6)})_\n- [x] Another done _(added ${iso(-6)})_\n`, { type: 'raw', tags: ['inbox'], created: iso(-6), updated: iso(-3) }), 'utf8');

  // a system state page — must never be flagged as an orphan
  await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Health/Shopping List.md'),
    matter.stringify('# Shopping List\n\nManaged via Nova OS.\n', { type: 'shopping-list', updated: iso(0), items: [] }), 'utf8');

  const { proposals } = await runCompost(vault);
  const types = proposals.map((p) => p.type).sort();
  assert.ok(types.includes('stale-capture'));
  assert.ok(types.includes('sweep-todos'));
  assert.ok(types.includes('orphan'));
  assert.ok(!proposals.some((p) => p.title === 'Fresh Idea'));
  assert.ok(!proposals.some((p) => p.title === 'Shopping List'), 'system pages must not be orphans');
  const sweep = proposals.find((p) => p.type === 'sweep-todos');
  assert.equal(sweep.data.lines.length, 2);
});

test('compost accept: archive moves the note (undoable), sweep removes checked lines (undoable)', async () => {
  const { proposals } = await getCompost();
  const stale = proposals.find((p) => p.type === 'stale-capture');
  const { record: archiveRecord } = await acceptProposal(vault, stale.id);
  assert.ok(existsSync(path.join(vault, 'Wiki/Inbox/Archive/Old Idea.md')));
  assert.ok(!existsSync(path.join(vault, 'Wiki/Inbox/Old Idea.md')));

  await undoFiling(vault, archiveRecord.undoData);
  assert.ok(existsSync(path.join(vault, 'Wiki/Inbox/Old Idea.md')));

  const sweep = proposals.find((p) => p.type === 'sweep-todos');
  const { record: sweepRecord } = await acceptProposal(vault, sweep.id);
  let raw = await readFile(path.join(vault, 'Wiki/Inbox/To-Do.md'), 'utf8');
  assert.doesNotMatch(raw, /Done thing/);
  assert.match(raw, /Still open/);

  await undoFiling(vault, sweepRecord.undoData);
  raw = await readFile(path.join(vault, 'Wiki/Inbox/To-Do.md'), 'utf8');
  assert.match(raw, /Done thing/);
  assert.match(raw, /Another done/);
});

test('compost dismiss remembers the key across re-runs; orphans are informational', async () => {
  let { proposals } = await runCompost(vault);
  const orphan = proposals.find((p) => p.type === 'orphan' && p.title === 'Lonely Island');
  assert.ok(orphan);
  await assert.rejects(() => acceptProposal(vault, orphan.id), /informational/);
  await dismissProposal(orphan.id);

  ({ proposals } = await runCompost(vault));
  assert.ok(!proposals.some((p) => p.type === 'orphan' && p.title === 'Lonely Island'));
});

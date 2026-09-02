// Guardian integrity checks — temp dirs BEFORE imports (ESM hoisting).
import { mkdtemp, mkdir, readFile, writeFile, rm, unlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-guardian-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-guardian-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { runGuardian, getGuardian, runGuardianReport, listBackups, restoreBackup } = await import('../lib/guardian.js');
const { undoFiling } = await import('../lib/inbox.js');
const { beat } = await import('../lib/heartbeat.js');
const { listRecords } = await import('../lib/inboxStore.js');

// backupFile()'s naming: the ISO stamp with : and . flattened to -. Seeds are
// stamped from the clock because the check now ages a snapshot by its stamp —
// a hard-coded date would drift into "stale" and fail the suite one day.
const stampOf = (d) => d.toISOString().replace(/[:.]/g, '-');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('healthy vault with restorable snapshots reports ok/warn honestly', async () => {
  await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Inbox/To-Do.md'), '# To-Do\n', 'utf8');
  await writeFile(path.join(vault, 'Wiki/Note.md'), '# Note\n', 'utf8');

  // no snapshots yet → warn, not alert (nothing has been written back);
  // no heartbeats yet → warn with the honest explanation
  let report = await runGuardian(vault);
  const backups = report.checks.find((c) => c.id === 'backups');
  assert.equal(backups.status, 'warn');
  assert.match(backups.detail, /No snapshots found yet/);
  assert.match(report.checks.find((c) => c.id === 'loops').detail, /No heartbeats recorded yet/);

  // no health data yet → the feed check warns honestly (A6: a quiet feed is
  // flagged proactively, not discovered surface-by-surface)
  assert.match(report.checks.find((c) => c.id === 'health').detail, /never pushed/i);

  // schedulers stamp their ticks → loops check goes green
  for (const name of ['dispatch', 'todoist', 'compost', 'guardian']) await beat(name);

  // a complete yesterday + a today file → feed check ok. "Complete" means
  // received in the EVENING of its own day (or later) — a morning-received
  // snapshot is the partial case tested below.
  const p2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const todayIso = isoOf(now);
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yIso = isoOf(yd);
  const yEvening = new Date(yd); yEvening.setHours(21, 30, 0, 0);
  await mkdir(path.join(process.env.NOVA_DATA_DIR, 'health'), { recursive: true });
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'health', `${yIso}.json`), JSON.stringify({ date: yIso, steps: 14200, receivedAt: yEvening.toISOString() }), 'utf8');
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'health', `${todayIso}.json`), JSON.stringify({ date: todayIso, steps: 9000 }), 'utf8');

  // add a healthy snapshot → ok, sample restore-read passes
  const bakDir = path.join(vault, 'Wiki/Inbox/.nova-backups');
  await mkdir(bakDir, { recursive: true });
  await writeFile(path.join(bakDir, `To-Do.md.${stampOf(new Date(Date.now() - 60_000))}.bak`), '# To-Do\n- [ ] thing\n', 'utf8');
  report = await runGuardian(vault);
  assert.equal(report.checks.find((c) => c.id === 'backups').status, 'ok');
  assert.equal(report.checks.find((c) => c.id === 'vault').status, 'ok');
  assert.match(report.checks.find((c) => c.id === 'vault').detail, /2 pages reachable · To-Do page present/);
  assert.equal(report.checks.find((c) => c.id === 'loops').status, 'ok');
  assert.equal(report.checks.find((c) => c.id === 'health').status, 'ok');
  assert.equal(report.status, 'ok');

  // report persists
  const { lastReport } = await getGuardian();
  assert.equal(lastReport.status, 'ok');

  // the PARTIAL case (the 294-steps incident): yesterday received at 09:04 of
  // its own day and never finalized must WARN, never read as "Fresh"
  const yMorning = new Date(yd); yMorning.setHours(9, 4, 0, 0);
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'health', `${yIso}.json`), JSON.stringify({ date: yIso, steps: 294, receivedAt: yMorning.toISOString() }), 'utf8');
  report = await runGuardian(vault);
  let feed = report.checks.find((c) => c.id === 'health');
  assert.equal(feed.status, 'warn');
  assert.match(feed.detail, /PARTIAL/);
  assert.match(feed.detail, /294/);

  // yesterday missing entirely (the overnight push never landed) also warns
  const { rm: rmrf } = await import('node:fs/promises');
  await rmrf(path.join(process.env.NOVA_DATA_DIR, 'health', `${yIso}.json`));
  report = await runGuardian(vault);
  feed = report.checks.find((c) => c.id === 'health');
  assert.equal(feed.status, 'warn');
  assert.match(feed.detail, /never arrived/i);

  // a feed that went quiet two+ days ago warns and names the last data date
  const stale = new Date(Date.now() - 3 * 86400000);
  const staleIso = `${stale.getFullYear()}-${p2(stale.getMonth() + 1)}-${p2(stale.getDate())}`;
  await rmrf(path.join(process.env.NOVA_DATA_DIR, 'health', `${todayIso}.json`));
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'health', `${staleIso}.json`), JSON.stringify({ date: staleIso, steps: 9000 }), 'utf8');
  report = await runGuardian(vault);
  feed = report.checks.find((c) => c.id === 'health');
  assert.equal(feed.status, 'warn');
  assert.match(feed.detail, new RegExp(staleIso));
  assert.match(feed.detail, /stalled/i);
  // restore full freshness (and a green persisted report) for the later tests
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'health', `${yIso}.json`), JSON.stringify({ date: yIso, steps: 14200, receivedAt: yEvening.toISOString() }), 'utf8');
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'health', `${todayIso}.json`), JSON.stringify({ date: todayIso, steps: 9000 }), 'utf8');
  await runGuardian(vault);
});

test('an empty snapshot or a quarantined store escalates to alert', async () => {
  const bakDir = path.join(vault, 'Wiki/Inbox/.nova-backups');
  const empty = path.join(bakDir, `To-Do.md.${stampOf(new Date())}.bak`);
  await writeFile(empty, '', 'utf8');
  let report = await runGuardian(vault);
  const backups = report.checks.find((c) => c.id === 'backups');
  assert.equal(backups.status, 'alert');
  assert.match(backups.detail, /EMPTY/);
  await unlink(empty);

  await writeFile(path.join(dataDir, 'inbox.json.corrupt-123'), 'garbage', 'utf8');
  report = await runGuardian(vault);
  const stores = report.checks.find((c) => c.id === 'stores');
  assert.equal(stores.status, 'alert');
  assert.match(stores.detail, /quarantined: inbox\.json\.corrupt-123/);
  assert.equal(report.status, 'alert');
  await unlink(path.join(dataDir, 'inbox.json.corrupt-123'));
});

test('an unreachable vault path is an alert, never a crash', async () => {
  const report = await runGuardian(path.join(vault, 'no-such-subdir'));
  assert.equal(report.checks.find((c) => c.id === 'vault').status, 'alert');
});

test('a stalled loop heartbeat is called out by name', async () => {
  const beats = JSON.parse(await readFile(path.join(dataDir, 'heartbeat.json'), 'utf8'));
  beats.compost = new Date(Date.now() - 9 * 24 * 3600_000).toISOString();
  await writeFile(path.join(dataDir, 'heartbeat.json'), JSON.stringify(beats), 'utf8');

  const report = await runGuardian(vault);
  const loops = report.checks.find((c) => c.id === 'loops');
  assert.equal(loops.status, 'warn');
  assert.match(loops.detail, /compost last ticked \d+h ago/);
  assert.doesNotMatch(loops.detail, /dispatch last/);

  await beat('compost'); // restore for later tests
});

test('the newest snapshot is found by its stamp, not by where its folder sorts', async () => {
  // A fresh write-back in a folder that sorts FIRST, a stale one in a folder
  // that sorts LAST. Path order called the stale one "newest" and warned that
  // write-backs had stopped — on the live card, for 20 days, while the vault
  // was being written every morning.
  const fresh = path.join(vault, 'Wiki/Aaa/.nova-backups');
  const stale = path.join(vault, 'Wiki/Zzz/.nova-backups');
  await mkdir(fresh, { recursive: true });
  await mkdir(stale, { recursive: true });
  await writeFile(path.join(fresh, `Fresh.md.${stampOf(new Date())}.bak`), '# fresh\n', 'utf8');
  const old = path.join(stale, 'Old.md.2026-01-01T00-00-00-000Z.bak');
  await writeFile(old, '# old\n', 'utf8');
  await utimes(old, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z')); // as old on disk as in name
  let backups = (await runGuardian(vault)).checks.find((c) => c.id === 'backups');
  assert.equal(backups.status, 'ok');
  assert.doesNotMatch(backups.detail, /days old/);
  assert.match(backups.detail, /Newest written \d{4}-\d{2}-\d{2}\./);
  await rm(path.join(vault, 'Wiki/Aaa'), { recursive: true, force: true });
  await rm(path.join(vault, 'Wiki/Zzz'), { recursive: true, force: true });

  // and when every snapshot really is old, the warning is real — aged from the
  // NEWEST stamp, whichever folder holds it
  const onlyOld = await mkdtemp(path.join(tmpdir(), 'nova-guardian-old-'));
  try {
    const older = path.join(onlyOld, 'Wiki/Aaa/.nova-backups');
    const newer = path.join(onlyOld, 'Wiki/Zzz/.nova-backups');
    await mkdir(older, { recursive: true });
    await mkdir(newer, { recursive: true });
    await writeFile(path.join(older, 'A.md.2026-01-01T00-00-00-000Z.bak'), '# a\n', 'utf8');
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000);
    await writeFile(path.join(newer, 'Z.md.2026-01-02T00-00-00-000Z.bak'), '# z\n', 'utf8');
    await writeFile(path.join(older, `B.md.${stampOf(twentyDaysAgo)}.bak`), '# b\n', 'utf8');
    backups = (await runGuardian(onlyOld)).checks.find((c) => c.id === 'backups');
    assert.equal(backups.status, 'warn');
    assert.match(backups.detail, /\b(19|20|21) days old — write-backs may not be flowing/);
  } finally {
    await rm(onlyOld, { recursive: true, force: true });
  }
});

test('time machine: list snapshots, restore overwrites (after snapshotting current), undo puts it back', async () => {
  const todoPath = path.join(vault, 'Wiki/Inbox/To-Do.md');
  await writeFile(todoPath, '# To-Do\n- [ ] version ONE\n', 'utf8');
  const { backupFile } = await import('../lib/backup.js');
  await backupFile(todoPath); // snapshot of version ONE
  await new Promise((r) => setTimeout(r, 5)); // distinct stamp
  await writeFile(todoPath, '# To-Do\n- [ ] version TWO\n', 'utf8');

  const files = await listBackups(vault);
  const todo = files.find((f) => f.file === 'Wiki/Inbox/To-Do.md');
  assert.ok(todo, 'To-Do snapshots listed');
  assert.ok(todo.backups.length >= 1);

  // restore version ONE over version TWO (newest snapshot = the one just taken)
  const { record, file } = await restoreBackup(vault, todo.backups[0].backupRel);
  assert.equal(file, 'Wiki/Inbox/To-Do.md');
  assert.equal(record.status, 'filed');
  assert.ok(record.undoData, 'restore carries an undo');
  assert.match(await readFile(todoPath, 'utf8'), /version ONE/);

  // undo → back to version TWO (the pre-restore snapshot)
  const summary = await undoFiling(vault, record.undoData);
  assert.match(summary, /pre-restore state/);
  assert.match(await readFile(todoPath, 'utf8'), /version TWO/);

  await assert.rejects(() => restoreBackup(vault, 'Wiki/evil.md'), /not a snapshot path/);
});

test('monthly report drafts once per month onto the inbox rails; force re-drafts', async () => {
  const first = await runGuardianReport(vault);
  assert.equal(first.record.kind, 'guardian');
  assert.equal(first.record.status, 'pending');
  assert.equal(first.record.decision.route, 'journal');
  assert.match(first.record.decision.payload.text, /Guardian Report — /);
  assert.match(first.record.decision.payload.text, /\*\*Vault\.\*\*/);
  assert.match(first.record.decision.payload.text, /Last 30 days/);

  const again = await runGuardianReport(vault);
  assert.equal(again.skipped, true);

  const forced = await runGuardianReport(vault, { force: true });
  assert.equal(forced.record.status, 'pending');
  const records = await listRecords();
  // the restore receipt is also kind:'guardian' — count actual reports only
  assert.equal(records.filter((r) => r.kind === 'guardian' && r.text.startsWith('Guardian Report')).length, 2);
});

// ---- [22] plans 2, 3, 6: stores are found not listed; any worsened check speaks; the restore undo routes round-trip ----
test('a broken store OUTSIDE the old hand list is found and named; the count of parsed stores is said', async () => {
  const { listStoreFiles } = await import('../lib/guardian.js');
  await mkdir(path.join(dataDir, 'money'), { recursive: true });
  await writeFile(path.join(dataDir, 'money', '2025-03.json'), '{ nope', 'utf8');
  await writeFile(path.join(dataDir, 'brand-new-store.json'), '{"ok":true}', 'utf8');
  await writeFile(path.join(dataDir, 'scratch.json.tmp'), '{', 'utf8'); // a write temp is not a store
  const files = await listStoreFiles(dataDir);
  assert.ok(files.some((p) => p.endsWith('money/2025-03.json')), 'one level under money/ is scanned');
  assert.ok(files.some((p) => p.endsWith('brand-new-store.json')), 'a store nobody listed is found');
  assert.ok(!files.some((p) => p.endsWith('.tmp')), 'write temps are excluded');
  const report = await runGuardian(vault);
  const stores = report.checks.find((c) => c.id === 'stores');
  assert.equal(stores.status, 'alert');
  assert.match(stores.detail, /money\/2025-03\.json does not parse/);
  await unlink(path.join(dataDir, 'money', '2025-03.json'));
  const clean = await runGuardian(vault);
  assert.match(clean.checks.find((c) => c.id === 'stores').detail, /\d+ stores? parsed/);
});

test('worsenedChecks: a second check going red while the first already was is named — the roll-up alone missed it', async () => {
  const { worsenedChecks } = await import('../lib/guardian.js');
  const prev = { status: 'alert', checks: [{ id: 'stores', status: 'alert' }, { id: 'loops', status: 'ok' }, { id: 'health', status: 'warn' }] };
  const now = { status: 'alert', checks: [{ id: 'stores', status: 'alert', label: 'Data stores', detail: 'x' }, { id: 'loops', status: 'alert', label: 'Loops', detail: 'coach stalled' }, { id: 'health', status: 'ok', label: 'Health', detail: 'fine' }] };
  assert.deepEqual(worsenedChecks(now, prev).map((c) => c.id), ['loops'], 'stores was already red; health improved; loops is the news');
  assert.deepEqual(worsenedChecks(now, null).map((c) => c.id), ['stores', 'loops'], 'no prior report → every non-ok check is news');
  assert.deepEqual(worsenedChecks({ checks: [{ id: 'a', status: 'ok' }] }, prev), []);
});

test('the time machine undoes both ways: a restore over an existing page puts the pre-restore state back; a restore that created a page removes it', async () => {
  const { undoRecord } = await import('../lib/inbox.js');
  const { backupFile } = await import('../lib/backup.js');
  const pageRel = 'Wiki/Undo Me.md';
  const pageFull = path.join(vault, pageRel);
  await mkdir(path.dirname(pageFull), { recursive: true });
  await writeFile(pageFull, 'version one\n', 'utf8');
  const snap1 = await backupFile(pageFull); // snapshot of version one
  await writeFile(pageFull, 'version two\n', 'utf8');
  // restore version one over version two
  const { record: r1 } = await restoreBackup(vault, path.relative(vault, snap1));
  assert.equal(await readFile(pageFull, 'utf8'), 'version one\n');
  assert.equal(r1.undoData.route, 'restore');
  await undoRecord(vault, r1.id);
  assert.equal(await readFile(pageFull, 'utf8'), 'version two\n', 'undo put the pre-restore state back');
  // a restore that CREATES a page (the original is gone) is undone by removing it
  const snap2 = await backupFile(pageFull);
  await unlink(pageFull);
  const { record: r2 } = await restoreBackup(vault, path.relative(vault, snap2));
  assert.equal(r2.undoData.route, 'restore-created');
  assert.equal(await readFile(pageFull, 'utf8'), 'version two\n');
  await undoRecord(vault, r2.id);
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(pageFull), false, 'the created page is gone again — snapshotted first');
});

// Guardian integrity checks — temp dirs BEFORE imports (ESM hoisting).
import { mkdtemp, mkdir, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-guardian-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-guardian-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { runGuardian, getGuardian, runGuardianReport } = await import('../lib/guardian.js');
const { beat } = await import('../lib/heartbeat.js');
const { listRecords } = await import('../lib/inboxStore.js');

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

  // schedulers stamp their ticks → loops check goes green
  for (const name of ['dispatch', 'todoist', 'compost', 'guardian']) await beat(name);

  // add a healthy snapshot → ok, sample restore-read passes
  const bakDir = path.join(vault, 'Wiki/Inbox/.nova-backups');
  await mkdir(bakDir, { recursive: true });
  await writeFile(path.join(bakDir, 'To-Do.md.2026-07-19T01-00-00-000Z.bak'), '# To-Do\n- [ ] thing\n', 'utf8');
  report = await runGuardian(vault);
  assert.equal(report.checks.find((c) => c.id === 'backups').status, 'ok');
  assert.equal(report.checks.find((c) => c.id === 'vault').status, 'ok');
  assert.match(report.checks.find((c) => c.id === 'vault').detail, /2 pages reachable · To-Do page present/);
  assert.equal(report.checks.find((c) => c.id === 'loops').status, 'ok');
  assert.equal(report.status, 'ok');

  // report persists
  const { lastReport } = await getGuardian();
  assert.equal(lastReport.status, 'ok');
});

test('an empty snapshot or a quarantined store escalates to alert', async () => {
  const bakDir = path.join(vault, 'Wiki/Inbox/.nova-backups');
  const empty = path.join(bakDir, 'To-Do.md.2026-07-19T02-00-00-000Z.bak');
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
  assert.equal(records.filter((r) => r.kind === 'guardian').length, 2);
});

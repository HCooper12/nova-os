import { readFile, writeFile, mkdir, rename, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRecord, listRecords } from './inboxStore.js';
import { beat, readHeartbeats } from './heartbeat.js';

// Guardian — the integrity agent. Everything else in Nova writes (filings,
// briefs, Todoist sync, compost); Guardian is the independent check that the
// safety net under those writes actually holds: snapshots exist and are
// readable, the data stores parse, nothing sits quarantined unnoticed. It
// runs read-only, daily, and files a monthly report onto the inbox rails.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'guardian.json');

const STORE_FILES = ['inbox.json', 'dispatch.json', 'compost.json', 'todoist-sync.json'];
const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', '.trash']);

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/* ------------------------------- state ----------------------------------- */

async function loadState() {
  if (!existsSync(STATE_PATH())) return { lastReport: null };
  try {
    return JSON.parse(await readFile(STATE_PATH(), 'utf8'));
  } catch {
    return { lastReport: null };
  }
}

async function saveState(state) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STATE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, STATE_PATH());
}

/* ------------------------------- checks ---------------------------------- */

async function walkBackupDirs(root, found = []) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.name === '.nova-backups') found.push(full);
    else await walkBackupDirs(full, found);
  }
  return found;
}

// Snapshots: do they exist, is the newest recent, and do the latest ones
// actually read back (a backup that can't be restored is not a backup).
async function checkBackups(vaultPath) {
  const dirs = await walkBackupDirs(vaultPath);
  const baks = [];
  for (const dir of dirs) {
    for (const f of await readdir(dir)) {
      if (f.endsWith('.bak')) baks.push(path.join(dir, f));
    }
  }
  if (!baks.length) {
    return { id: 'backups', label: 'Vault snapshots', status: 'warn', detail: 'No snapshots found yet — they appear with the first vault write-back.' };
  }
  baks.sort(); // ISO stamp in the name sorts oldest→newest
  const newest = baks[baks.length - 1];
  let newestAgeDays = null;
  try {
    newestAgeDays = Math.floor((Date.now() - (await stat(newest)).mtimeMs) / 86400000);
  } catch { /* stat is best-effort */ }

  for (const sample of baks.slice(-3)) {
    try {
      const raw = await readFile(sample, 'utf8');
      if (!raw.trim()) {
        return { id: 'backups', label: 'Vault snapshots', status: 'alert', detail: `Snapshot reads back EMPTY: ${path.basename(sample)} — the net has a hole.` };
      }
    } catch (e) {
      return { id: 'backups', label: 'Vault snapshots', status: 'alert', detail: `Snapshot unreadable: ${path.basename(sample)} (${e.message}).` };
    }
  }

  const staleness = newestAgeDays != null && newestAgeDays > 7
    ? { status: 'warn', tail: ` Newest is ${newestAgeDays} days old — write-backs may not be flowing.` }
    : { status: 'ok', tail: '' };
  return {
    id: 'backups', label: 'Vault snapshots', status: staleness.status,
    detail: `${baks.length} snapshots across ${dirs.length} folders; latest 3 restore-read clean.${staleness.tail}`,
  };
}

// Stores: every data file parses, nothing sits quarantined, and filed inbox
// records still carry the undo data their receipts promise.
async function checkStores() {
  const problems = [];
  const notes = [];

  let rootFiles = [];
  try {
    rootFiles = await readdir(dataRoot());
  } catch { /* data dir may not exist yet */ }
  const quarantined = rootFiles.filter((f) => f.includes('.corrupt-'));
  if (quarantined.length) problems.push(`quarantined: ${quarantined.join(', ')}`);

  for (const f of STORE_FILES) {
    const full = path.join(dataRoot(), f);
    if (!existsSync(full)) continue; // stores appear on first use
    try {
      JSON.parse(await readFile(full, 'utf8'));
    } catch {
      problems.push(`${f} does not parse`);
    }
  }

  try {
    const items = await listRecords();
    const filed = items.filter((r) => r.status === 'filed');
    const bare = filed.filter((r) => !r.undoData).length;
    notes.push(`${items.length} inbox records (${filed.length} filed)`);
    if (bare) problems.push(`${bare} filed record${bare === 1 ? '' : 's'} missing undo data`);
  } catch (e) {
    problems.push(`inbox store unreadable: ${e.message}`);
  }

  if (problems.length) {
    return { id: 'stores', label: 'Data stores', status: 'alert', detail: problems.join(' · ') };
  }
  return { id: 'stores', label: 'Data stores', status: 'ok', detail: `All stores parse clean · ${notes.join(' · ')}` };
}

// The loops themselves: every scheduler stamps data/heartbeat.json on each
// tick; a stamp far past its cadence means a loop silently stalled — the
// failure class nothing else would surface.
const LOOP_CADENCE_HOURS = { dispatch: 2, todoist: 2, compost: 26, guardian: 26 };

async function checkLoops() {
  const beats = await readHeartbeats();
  const seen = Object.keys(LOOP_CADENCE_HOURS).filter((n) => beats[n]);
  if (!seen.length) {
    return { id: 'loops', label: 'Loop heartbeats', status: 'warn', detail: 'No heartbeats recorded yet — schedulers stamp them each tick after the next server start.' };
  }
  const stale = seen.filter((n) => Date.now() - new Date(beats[n]).getTime() > LOOP_CADENCE_HOURS[n] * 3600_000);
  if (stale.length) {
    const ago = (n) => `${Math.round((Date.now() - new Date(beats[n]).getTime()) / 3600_000)}h ago`;
    return { id: 'loops', label: 'Loop heartbeats', status: 'warn', detail: `Stalled: ${stale.map((n) => `${n} last ticked ${ago(n)}`).join(' · ')}.` };
  }
  return { id: 'loops', label: 'Loop heartbeats', status: 'ok', detail: `${seen.length} loop${seen.length === 1 ? '' : 's'} ticking on cadence (${seen.join(', ')}).` };
}

// The vault itself: reachable, populated, and the To-Do page where three
// different writers meet still exists.
async function checkVault(vaultPath) {
  if (!vaultPath || !existsSync(vaultPath)) {
    return { id: 'vault', label: 'Vault', status: 'alert', detail: 'Vault path unreachable — iCloud offline or the path moved.' };
  }
  let mdCount = 0;
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && e.name !== '.nova-backups') await walk(path.join(dir, e.name));
      } else if (e.name.endsWith('.md')) mdCount++;
    }
  };
  await walk(vaultPath);
  const todoThere = existsSync(path.join(vaultPath, 'Wiki/Inbox/To-Do.md'));
  return {
    id: 'vault', label: 'Vault', status: 'ok',
    detail: `${mdCount} pages reachable${todoThere ? ' · To-Do page present' : ''}.`,
  };
}

/* -------------------------------- runs ----------------------------------- */

const WORST = { ok: 0, warn: 1, alert: 2 };

export async function runGuardian(vaultPath) {
  const checks = [];
  for (const fn of [() => checkVault(vaultPath), () => checkBackups(vaultPath), () => checkStores(), () => checkLoops()]) {
    try {
      checks.push(await fn());
    } catch (e) {
      checks.push({ id: 'internal', label: 'Guardian', status: 'alert', detail: `check crashed: ${e.message}` });
    }
  }
  const status = checks.reduce((w, c) => (WORST[c.status] > WORST[w] ? c.status : w), 'ok');
  const report = { at: new Date().toISOString(), status, checks };
  const state = await loadState();
  await saveState({ ...state, lastReport: report });
  return report;
}

export async function getGuardian() {
  const state = await loadState();
  return { lastReport: state.lastReport || null };
}

/* --------------------------- monthly report ------------------------------ */

async function monthlyRecordExists() {
  const items = await listRecords();
  const key = monthKey();
  // LOCAL month of the record's creation instant (same lesson as dispatch)
  return items.some((r) => r.kind === 'guardian' && r.createdAt && monthKey(new Date(r.createdAt)) === key);
}

export async function runGuardianReport(vaultPath, { force = false } = {}) {
  if (!force && (await monthlyRecordExists())) return { skipped: true };
  const report = await runGuardian(vaultPath);

  const items = await listRecords();
  const cutoff = Date.now() - 30 * 86400000;
  const recent = items.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= cutoff);
  const undone = recent.filter((r) => r.status === 'undone').length;
  const filed = recent.filter((r) => r.status === 'filed').length;

  const monthLong = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const title = `Guardian Report — ${monthLong}`;
  const lines = [
    `Overall: ${report.status.toUpperCase()}.`,
    ...report.checks.map((c) => `**${c.label}.** [${c.status}] ${c.detail}`),
    `**Last 30 days.** ${recent.length} inbox records — ${filed} filed, ${undone} undone${undone ? ' (the undo net got used and held)' : ''}.`,
  ];
  const decision = {
    route: 'journal',
    confidence: 'high',
    title,
    reason: 'Monthly integrity report from Guardian’s read-only checks.',
    payload: { text: `${title}\n\n${lines.join('\n')}` },
  };
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'guardian',
    text: title,
    source: 'guardian',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision,
  };
  await createRecord(record);
  return { record };
}

// Hourly tick: refresh the daily report when it's older than a day, and on
// the 1st of the month draft the monthly report once.
async function tick(vaultPath) {
  beat('guardian');
  try {
    const { lastReport } = await getGuardian();
    if (!lastReport || Date.now() - new Date(lastReport.at).getTime() > 24 * 3600_000) {
      await runGuardian(vaultPath);
    }
  } catch (err) {
    console.error('guardian check failed:', err.message);
  }
  try {
    if (new Date().getDate() === 1) await runGuardianReport(vaultPath);
  } catch (err) {
    console.error('guardian report failed:', err.message);
  }
}

export function startGuardianScheduler(vaultPath) {
  tick(vaultPath);
  setInterval(() => tick(vaultPath), 3600_000);
}

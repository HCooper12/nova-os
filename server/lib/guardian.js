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
const LOOP_CADENCE_HOURS = { dispatch: 2, todoist: 2, compost: 26, guardian: 26, money: 2, mealprep: 3, review: 2 };

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
  return { lastReport: state.lastReport || null, lastExportAt: state.lastExportAt || null };
}

/* ------------------------------ time machine ----------------------------- */

// Browse the per-file snapshots backupFile() has been quietly keeping.
// Grouped by the original file, newest first, capped so the UI stays sane.
export async function listBackups(vaultPath) {
  const dirs = await walkBackupDirs(vaultPath);
  const files = [];
  for (const dir of dirs) {
    const parentRel = path.relative(vaultPath, path.dirname(dir));
    const byOriginal = new Map();
    for (const name of await readdir(dir)) {
      // <original>.<ISO-stamp>.bak — the stamp starts at the LAST .md. in the name
      const m = name.match(/^(.+\.md)\.(.+)\.bak$/);
      if (!m) continue;
      const originalRel = path.join(parentRel, m[1]);
      if (!byOriginal.has(originalRel)) byOriginal.set(originalRel, []);
      byOriginal.get(originalRel).push({
        backupRel: path.join(parentRel, '.nova-backups', name),
        stamp: m[2].replace(/-/g, (c, i) => (i === 13 || i === 16 ? ':' : c)), // readable-ish
      });
    }
    for (const [originalRel, backups] of byOriginal) {
      backups.sort((a, b) => (a.backupRel < b.backupRel ? 1 : -1));
      files.push({ file: originalRel, exists: existsSync(path.join(vaultPath, originalRel)), backups: backups.slice(0, 5) });
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

// Restore = snapshot the CURRENT state first, then copy the chosen backup
// over the original. The receipt rides the inbox rails with an undo that
// puts the pre-restore snapshot straight back — restore can never lose data.
export async function restoreBackup(vaultPath, backupRel) {
  if (!backupRel || !backupRel.includes('.nova-backups/') || !backupRel.endsWith('.bak')) {
    throw new Error('not a snapshot path');
  }
  const backupFull = path.join(vaultPath, backupRel);
  if (!existsSync(backupFull)) throw new Error('that snapshot no longer exists');
  const originalRel = path.join(path.dirname(path.dirname(backupRel)), path.basename(backupRel).replace(/^(.+\.md)\..+\.bak$/, '$1'));
  const originalFull = path.join(vaultPath, originalRel);

  const { backupFile } = await import('./backup.js');
  const priorSnapshot = existsSync(originalFull) ? await backupFile(originalFull) : null;
  const { copyFile } = await import('node:fs/promises');
  await copyFile(backupFull, originalFull);

  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'guardian',
    text: `Restored ${path.basename(originalRel)}`,
    source: 'guardian',
    mode: 'auto',
    status: 'filed',
    createdAt: new Date().toISOString(),
    destination: `Restored ${originalRel} from ${path.basename(backupRel)}`,
    auto: true,
    decision: {
      route: 'journal',
      confidence: 'high',
      title: `Restored ${path.basename(originalRel)}`,
      reason: 'Guardian time-machine restore — the pre-restore state was snapshotted first.',
      payload: { text: `Restored ${originalRel} from snapshot ${path.basename(backupRel)}.` },
    },
    undoData: priorSnapshot
      ? { route: 'restore', relPath: originalRel, priorBackupRel: path.relative(vaultPath, priorSnapshot) }
      : null,
  });
  return { record, file: originalRel };
}

// One-tap belt-and-braces: zip the vault + data dir to the Desktop. The
// vault already lives in iCloud; this covers the data dir and gives an
// off-app restore point a human can see and copy anywhere.
export async function exportVault(vaultPath) {
  const { spawn } = await import('node:child_process');
  const os = await import('node:os');
  const dest = path.join(os.homedir(), 'Desktop', `nova-export-${todayISO()}.zip`);
  await new Promise((resolve, reject) => {
    const child = spawn('zip', ['-r', '-q', dest, vaultPath, dataRoot()]);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`zip exited ${code}`))));
    child.on('error', reject);
  });
  const state = await loadState();
  await saveState({ ...state, lastExportAt: new Date().toISOString() });
  return { dest };
}

/* --------------------------- monthly report ------------------------------ */

async function monthlyRecordExists() {
  const items = await listRecords();
  const key = monthKey();
  // LOCAL month of the record's creation instant (same lesson as dispatch).
  // Restore receipts share kind:'guardian' — only actual reports count.
  return items.some((r) => r.kind === 'guardian' && (r.text || '').startsWith('Guardian Report') && r.createdAt && monthKey(new Date(r.createdAt)) === key);
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
      const report = await runGuardian(vaultPath);
      // a NEW alert deserves a phone notification; a persisting one doesn't re-fire daily
      if (report.status === 'alert' && lastReport?.status !== 'alert') {
        import('./push.js').then(({ sendPush }) => sendPush({
          title: 'Guardian ALERT — Nova',
          body: report.checks.find((c) => c.status === 'alert')?.detail || 'An integrity check failed.',
          tag: 'guardian-alert',
        })).catch(() => {});
      }
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

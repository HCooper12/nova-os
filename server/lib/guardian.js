import { readFile, writeFile, mkdir, rename, readdir, stat } from 'node:fs/promises';
import { monthlyWindowOpen } from './cadence.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRecord, listRecords } from './inboxStore.js';
import { beat, readHeartbeats } from './heartbeat.js';
import { loopCadenceHours } from './ops.js';
import { loadRecentDays } from './healthData.js';

// Guardian — the integrity agent. Everything else in Nova writes (filings,
// briefs, Todoist sync, compost); Guardian is the independent check that the
// safety net under those writes actually holds: snapshots exist and are
// readable, the data stores parse, nothing sits quarantined unnoticed. It
// runs read-only, daily, and files a monthly report onto the inbox rails.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'guardian.json');

// Every JSON store is FOUND, not listed. A hand list claimed "all stores
// parse clean" while reading 4 of ~13, was widened to 13, and had rotted
// again to ~20 by the August audit. Now the check enumerates *.json at the
// data root plus one level under money/ and health/; quarantined files and
// write temps are excluded. An absent dir is fine (stores appear on first use).
const STORE_SUBDIRS = ['money', 'health', 'distill'];
const STORE_SKIP = /\.corrupt-|\.tmp$|^\./;
export async function listStoreFiles(root = dataRoot()) {
  const out = [];
  const files = await readdir(root).catch(() => []);
  for (const f of files) if (f.endsWith('.json') && !STORE_SKIP.test(f)) out.push(path.join(root, f));
  for (const sub of STORE_SUBDIRS) {
    const dir = path.join(root, sub);
    for (const f of await readdir(dir).catch(() => [])) if (f.endsWith('.json') && !STORE_SKIP.test(f)) out.push(path.join(dir, f));
  }
  return out;
}
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

// backupFile() names every snapshot <file>.<ISO stamp, : and . as ->.bak, so
// the stamp — never the path — is the chronology. Sorting full paths ranked
// folders alphabetically and crowned a 20-day-old Topics/ snapshot "newest"
// while the vault was being written that same morning: the staleness warning
// was fiction, and the restore-read sampled stale files instead of fresh ones.
const STAMP_RE = /\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.bak$/;
function snapshotTakenAt(name) {
  const m = name.match(STAMP_RE);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
}

// Snapshots: do they exist, is the newest recent, and do the latest ones
// actually read back (a backup that can't be restored is not a backup).
async function checkBackups(vaultPath) {
  const dirs = await walkBackupDirs(vaultPath);
  const baks = [];
  for (const dir of dirs) {
    for (const f of await readdir(dir)) {
      if (f.endsWith('.bak')) baks.push({ full: path.join(dir, f), at: snapshotTakenAt(f) });
    }
  }
  if (!baks.length) {
    return { id: 'backups', label: 'Vault snapshots', status: 'warn', detail: 'No snapshots found yet — they appear with the first vault write-back.' };
  }
  baks.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)); // by stamp, oldest→newest; an unstamped name sinks to the front
  const newest = baks[baks.length - 1];
  let newestAt = newest.at;
  if (newestAt == null) {
    try { newestAt = (await stat(newest.full)).mtimeMs; } catch { /* stat is best-effort */ }
  }
  const newestAgeDays = newestAt != null ? Math.floor((Date.now() - newestAt) / 86400000) : null;

  for (const { full: sample } of baks.slice(-3)) {
    try {
      const raw = await readFile(sample, 'utf8');
      if (!raw.trim()) {
        return { id: 'backups', label: 'Vault snapshots', status: 'alert', detail: `Snapshot reads back EMPTY: ${path.basename(sample)} — the net has a hole.` };
      }
    } catch (e) {
      return { id: 'backups', label: 'Vault snapshots', status: 'alert', detail: `Snapshot unreadable: ${path.basename(sample)} (${e.message}).` };
    }
  }

  // name the newest write so the claim can be checked against the vault —
  // the false warning above stood for 20 days because nothing on the card
  // said WHICH file it had judged
  const written = newestAt != null ? todayISO(new Date(newestAt)) : null;
  const stale = newestAgeDays != null && newestAgeDays > 7;
  const tail = written == null ? ''
    : stale ? ` Newest written ${written}, ${newestAgeDays} days old — write-backs may not be flowing.`
    : ` Newest written ${written}.`;
  return {
    id: 'backups', label: 'Vault snapshots', status: stale ? 'warn' : 'ok',
    detail: `${baks.length} snapshots across ${dirs.length} folders; latest 3 restore-read clean.${tail}`,
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

  const storeFiles = await listStoreFiles();
  for (const full of storeFiles) {
    try {
      JSON.parse(await readFile(full, 'utf8'));
    } catch {
      problems.push(`${path.relative(dataRoot(), full)} does not parse`);
    }
  }
  notes.push(`${storeFiles.length} store${storeFiles.length === 1 ? '' : 's'} parsed`);

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
// Derived from the fleet roster in ops.js — the list the Ops ring and Nova's
// own self-knowledge already draw from. This was a hand-written map of 13
// loops sitting beside a roster of 29, so the other 16 could stop ticking
// with nothing to notice; keeping one list is the fix, not a longer one.
// (Loops with no beat at all are skipped below, so a lane that is switched
// off or unconfigured — Telegram without a token — never false-alarms.)
const LOOP_CADENCE_HOURS = loopCadenceHours();

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

// The health feed. Three failure shapes, all learned the hard way:
// (1) the feed goes quiet entirely (file ≥2 days old);
// (2) YESTERDAY is missing outright (the push never fired that night — the
//     Mac sleeps at 23:30, so this was the common case);
// (3) yesterday EXISTS but is a mid-day partial — a morning push wrote a
//     snapshot (e.g. 294 steps at 09:04) and nothing ever finalized it. The
//     old check called that "Fresh", which was exactly the wrong assurance.
// Evidence rides along: the last push ATTEMPT from the receipts log.
async function checkHealthFeed() {
  const { readPushLog } = await import('./healthData.js');
  const attempts = await readPushLog();
  const lastAttempt = attempts[attempts.length - 1];
  const evidence = lastAttempt
    ? ` Last push attempt: ${new Date(lastAttempt.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} (${lastAttempt.ok ? 'ok' : 'FAILED: ' + lastAttempt.error}).`
    : ' No push attempts logged yet (receipts began 2026-07-23).';

  const days = await loadRecentDays(3);
  if (!days.length) {
    return { id: 'health', label: 'Health feed', status: 'warn', detail: 'No health data yet — the phone Shortcut has never pushed.' + evidence };
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterdayIso = iso(y);
  const latest = days[days.length - 1];
  const age = Math.round((new Date(new Date().toDateString()) - new Date(`${latest.date}T12:00:00`)) / 86400000);

  if (age >= 2) {
    return { id: 'health', label: 'Health feed', status: 'warn', detail: `Last health data is from ${latest.date} (${age} days ago) — the automation is stalled. Enter missing days from the Steps card.` + evidence };
  }

  // one rule with the morning brief's steps-gap line (healthData.js)
  const { yesterdayStepsShape } = await import('./healthData.js');
  const yd = yesterdayStepsShape(days);
  if (yd.kind === 'missing') {
    return { id: 'health', label: 'Health feed', status: 'warn', detail: `Yesterday (${yesterdayIso}) never arrived — the 00:05 push didn't land. Check the phone automation ran (Shortcuts notification) and that the Mac was awake and plugged in. Tap the Steps card to enter it meanwhile.` + evidence };
  }
  if (yd.kind === 'partial') {
    return { id: 'health', label: 'Health feed', status: 'warn', detail: `Yesterday's steps (${yd.day.steps.toLocaleString()}) are a PARTIAL snapshot from ${pad2(yd.receivedAt.getHours())}:${pad2(yd.receivedAt.getMinutes())} — the end-of-day push never landed. Tap the Steps card to correct it.` + evidence };
  }
  return { id: 'health', label: 'Health feed', status: 'ok', detail: `Fresh — yesterday complete (${yd.day.steps.toLocaleString()} steps), latest data ${latest.date}.` + evidence };
}

/* -------------------------------- runs ----------------------------------- */

const WORST = { ok: 0, warn: 1, alert: 2 };

// The checks whose status got worse than in the previous report (a new
// report against nothing counts every non-ok check). Pure, exported for the test.
export function worsenedChecks(report, lastReport) {
  const worst = { ok: 0, warn: 1, alert: 2 };
  const prev = new Map((lastReport?.checks || []).map((c) => [c.id, c.status]));
  return (report?.checks || []).filter((c) => (worst[c.status] || 0) > (worst[prev.get(c.id) || 'ok'] || 0));
}

export async function runGuardian(vaultPath) {
  const checks = [];
  for (const fn of [() => checkVault(vaultPath), () => checkBackups(vaultPath), () => checkStores(), () => checkLoops(), () => checkHealthFeed()]) {
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
      payload: { text: `Restored ${originalRel} from snapshot ${path.basename(backupRel)}.`, category: 'system', label: 'Guardian restore' },
    },
    // restoring a file that didn't exist is undone by deleting it again —
    // undoData:null here was the ONE write on the rails with no undo
    undoData: priorSnapshot
      ? { route: 'restore', relPath: originalRel, priorBackupRel: path.relative(vaultPath, priorSnapshot) }
      : { route: 'restore-created', relPath: originalRel },
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
    payload: { text: `${title}\n\n${lines.join('\n')}`, category: 'system', label: 'Guardian report' },
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
      // a NEW degradation deserves a phone notification; a persisting one
      // doesn't re-fire daily. Warns count too — a quiet health feed is
      // exactly the thing worth hearing about the day it happens, not
      // discovering days later ("Nova doesn't know yesterday's steps").
      // PER CHECK, not just the roll-up: a second check worsening while the
      // first was already red used to be silent (the overall status had not
      // changed). Any check that got worse than its predecessor speaks.
      const worsened = worsenedChecks(report, lastReport);
      if (worsened.length) {
        const body = worsened.map((c) => `${c.label}: ${c.detail}`).join(' · ').slice(0, 300);
        import('./push.js').then(({ sendPush }) => sendPush({
          title: report.status === 'alert' ? 'Guardian ALERT — Nova' : 'Guardian — Nova noticed something',
          body,
          tag: 'guardian-alert',
        })).catch(() => {});
        // web push is easy to miss on a phone; the thread he actually reads
        // gets it too — a silent health feed discovered days later was the
        // original sin this check exists to prevent
        import('./telegram.js').then(({ sendTelegramText }) => sendTelegramText(
          `${report.status === 'alert' ? '⚠︎ Guardian ALERT' : '◇ Guardian noticed'}\n\n${body}`,
        )).catch(() => {});
      }
    }
  } catch (err) {
    console.error('guardian check failed:', err.message);
  }
  try {
    // the 1st onward — a slept 1st used to cost the whole month's report; monthlyRecordExists keeps it to one
    if (monthlyWindowOpen(new Date())) await runGuardianReport(vaultPath);
  } catch (err) {
    console.error('guardian report failed:', err.message);
  }
}

export function startGuardianScheduler(vaultPath) {
  tick(vaultPath);
  setInterval(() => tick(vaultPath), 3600_000);
}

import { readFile, readdir, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logPushAttempt, pickKnownMetrics } from './healthData.js';

// Store-and-forward health ingestion — the fix for "my Mac must be awake for
// the push to work". The phone's Shortcut SAVES the same JSON as a file into
// an iCloud folder (always succeeds, Mac state irrelevant); whenever the Mac
// next wakes, this watcher drains the folder into the health store. Same
// rail as Money/Imports: scan → ingest → archive to Processed. A direct URL
// push can still ride alongside for instant delivery when the Mac happens to
// be awake — the day-file upsert makes double-delivery a no-op.
export const DROPS_DIR_REL = 'Health Drops';

// iOS constraint, learned from his real Shortcut: an AUTOMATED "Save File"
// can only write inside iCloud Drive/Shortcuts — reaching the Obsidian
// container needs the interactive picker, which an automation must never
// need. So the scanner also drains iCloud Drive/Shortcuts/Health Drops.
// Tests must never touch the real iCloud folder: with NOVA_DATA_DIR set the
// extra dir is only what NOVA_SHORTCUTS_DROPS explicitly names (or nothing).
const CLOUD_SHORTCUTS_DROPS = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Shortcuts', 'Health Drops');
function extraDropDirs() {
  if (process.env.NOVA_SHORTCUTS_DROPS) return [process.env.NOVA_SHORTCUTS_DROPS];
  return process.env.NOVA_DATA_DIR ? [] : [CLOUD_SHORTCUTS_DROPS];
}

function normalizeRecords(parsed) {
  // one {date, steps, ...} object or an array of them; tolerate {date, metrics:{...}}
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((r) => {
    if (!r || typeof r.date !== 'string') return null;
    let metrics = r.metrics;
    if (!metrics || typeof metrics !== 'object') {
      const { date: _d, metrics: _m, ...rest } = r;
      metrics = rest;
    }
    // same case-insensitive + impossible-zero cleaning as the URL push
    const clean = pickKnownMetrics(metrics);
    return Object.keys(clean).length ? { date: r.date, metrics: clean } : null;
  }).filter(Boolean);
}

async function archiveDrop(dirAbs, file, { bad = false } = {}) {
  const from = path.join(dirAbs, file);
  const processed = path.join(dirAbs, 'Processed');
  await mkdir(processed, { recursive: true });
  let dest = path.join(processed, `${bad ? 'bad-' : ''}${file}`);
  if (existsSync(dest)) dest = path.join(processed, `${Date.now() % 100000}-${file}`);
  await rename(from, dest).catch(() => {});
}

async function drainDropsDir(dirAbs) {
  if (!existsSync(dirAbs)) {
    // create it so the folder is visible in Files/iCloud for the Shortcut to target
    await mkdir(dirAbs, { recursive: true }).catch(() => {});
    return 0;
  }
  let files;
  try {
    files = (await readdir(dirAbs)).filter((f) => f.toLowerCase().endsWith('.json'));
  } catch {
    return 0;
  }
  // .icloud placeholders (dataless files not yet materialized locally) show as
  // ".name.json.icloud" — skip them; they'll be real on a later tick
  files = files.filter((f) => !f.startsWith('.'));
  let ingested = 0;
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(dirAbs, file), 'utf8'));
    } catch (e) {
      // still-syncing or genuinely malformed — malformed gets archived so it
      // can't retry forever; a read/parse blip retries next tick
      if (e instanceof SyntaxError) {
        await logPushAttempt({ ok: false, source: 'drop', file, error: 'does not parse' });
        await archiveDrop(dirAbs, file, { bad: true });
      }
      continue;
    }
    const records = normalizeRecords(parsed);
    if (!records.length) {
      await logPushAttempt({ ok: false, source: 'drop', file, error: 'no usable metrics' });
      await archiveDrop(dirAbs, file, { bad: true });
      continue;
    }
    for (const r of records) {
      // the SHARED ingest gate: the drops channel gets the same midnight
      // date-shift + monotonic-steps protection as the URL push — a guard
      // living in only one writer is how the 9→10 Aug clobber happened
      const { ingestHealthPayload } = await import('./healthData.js');
      const result = await ingestHealthPayload({ date: r.date, metrics: r.metrics, source: 'drop', file });
      if (result.ok) ingested++;
    }
    await archiveDrop(dirAbs, file);
  }
  return ingested;
}

// Processed drops are archived duplicates of pushes already in the health
// store; they used to accumulate forever in his vault and iCloud folders.
// Files older than PROCESSED_KEEP_DAYS go at boot — the same shape as the
// Forge's sweep (audit [40] item 2). Only *.json under Processed/ is touched.
export const PROCESSED_KEEP_DAYS = 60;

export async function pruneProcessedDrops(dirAbs, { days = PROCESSED_KEEP_DAYS, now = Date.now() } = {}) {
  const processed = path.join(dirAbs, 'Processed');
  if (!existsSync(processed)) return { pruned: 0 };
  let files = [];
  try { files = (await readdir(processed)).filter((f) => f.toLowerCase().endsWith('.json') && !f.startsWith('.')); } catch { return { pruned: 0 }; }
  let pruned = 0;
  for (const f of files) {
    const full = path.join(processed, f);
    try {
      const st = await stat(full);
      if (now - st.mtimeMs > days * 86400e3) { await unlink(full); pruned++; }
    } catch { /* a vanished file is already pruned */ }
  }
  return { pruned };
}

export async function scanHealthDrops(vaultPath) {
  let ingested = 0;
  for (const dir of [path.join(vaultPath, DROPS_DIR_REL), ...extraDropDirs()]) {
    ingested += await drainDropsDir(dir);
  }
  if (ingested) {
    import('./events.js').then(({ broadcast }) => broadcast('health')).catch(() => {});
  }
  return { ingested };
}

// Every 2 minutes — iCloud sync latency means the file may land a beat after
// the Mac wakes; a tight loop drains the queue the moment it appears.
export function startHealthDropsScheduler(vaultPath) {
  // one boot-time sweep of the archives, not a recurring one
  Promise.all([path.join(vaultPath, DROPS_DIR_REL), ...extraDropDirs()].map((d) => pruneProcessedDrops(d)))
    .then((rs) => { const n = rs.reduce((a, r) => a + r.pruned, 0); if (n) console.log(`health drops: pruned ${n} processed file(s) older than ${PROCESSED_KEEP_DAYS} days`); })
    .catch(() => {});
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('health-drops');
    try {
      await scanHealthDrops(vaultPath);
    } catch (err) {
      console.error('health drops scan failed:', err.message);
    }
    // The missed-push sentinel rides this tick (2-min cadence is plenty for
    // a 09:00 once-a-day check) — a silent overnight failure becomes one
    // honest Telegram nudge instead of a hole he finds days later.
    try {
      const { runMissedPushSentinel } = await import('./healthSentinel.js');
      const r = await runMissedPushSentinel();
      if (r.nudged) console.log(`health sentinel: nudged — no data for ${r.date}`);
    } catch (err) {
      console.error('health sentinel failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 2 * 60_000);
}

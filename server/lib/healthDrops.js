import { readFile, readdir, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { saveDay, logPushAttempt, pickKnownMetrics } from './healthData.js';

// Store-and-forward health ingestion — the fix for "my Mac must be awake for
// the push to work". The phone's Shortcut SAVES the same JSON dictionary as a
// file into the vault's iCloud folder (always succeeds, Mac state irrelevant);
// whenever the Mac next wakes, this watcher drains the folder into the health
// store. Same rail as Money/Imports: scan → ingest → archive to Processed.
// A direct URL push can still ride alongside for instant delivery when the
// Mac happens to be awake — the day-file upsert makes double-delivery a no-op.
export const DROPS_DIR_REL = 'Health Drops';
const PROCESSED_DIR_REL = 'Health Drops/Processed';

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

async function archiveDrop(vaultPath, file, { bad = false } = {}) {
  const from = path.join(vaultPath, DROPS_DIR_REL, file);
  const dir = path.join(vaultPath, PROCESSED_DIR_REL);
  await mkdir(dir, { recursive: true });
  let dest = path.join(dir, `${bad ? 'bad-' : ''}${file}`);
  if (existsSync(dest)) dest = path.join(dir, `${Date.now() % 100000}-${file}`);
  await rename(from, dest).catch(() => {});
}

export async function scanHealthDrops(vaultPath) {
  const dir = path.join(vaultPath, DROPS_DIR_REL);
  if (!existsSync(dir)) {
    // create it so the folder is visible in Files/iCloud for the Shortcut to target
    await mkdir(dir, { recursive: true }).catch(() => {});
    return { ingested: 0 };
  }
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'));
  } catch {
    return { ingested: 0 };
  }
  // .icloud placeholders (dataless files not yet materialized locally) show as
  // ".name.json.icloud" — skip them; they'll be real on a later tick
  files = files.filter((f) => !f.startsWith('.'));
  let ingested = 0;
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    } catch (e) {
      // still-syncing or genuinely malformed — malformed gets archived so it
      // can't retry forever; a read/parse blip retries next tick
      if (e instanceof SyntaxError) {
        logPushAttempt({ ok: false, source: 'drop', file, error: 'does not parse' });
        await archiveDrop(vaultPath, file, { bad: true });
      }
      continue;
    }
    const records = normalizeRecords(parsed);
    if (!records.length) {
      logPushAttempt({ ok: false, source: 'drop', file, error: 'no usable metrics' });
      await archiveDrop(vaultPath, file, { bad: true });
      continue;
    }
    for (const r of records) {
      await saveDay(r.date, r.metrics);
      logPushAttempt({ ok: true, source: 'drop', file, date: r.date, keys: Object.keys(r.metrics), steps: r.metrics.steps ?? null });
      ingested++;
    }
    await archiveDrop(vaultPath, file);
  }
  if (ingested) {
    import('./events.js').then(({ broadcast }) => broadcast('health')).catch(() => {});
  }
  return { ingested };
}

// Every 2 minutes — iCloud sync latency means the file may land a beat after
// the Mac wakes; a tight loop drains the queue the moment it appears.
export function startHealthDropsScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('health-drops');
    try {
      await scanHealthDrops(vaultPath);
    } catch (err) {
      console.error('health drops scan failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 2 * 60_000);
}

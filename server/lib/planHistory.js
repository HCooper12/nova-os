// THE PLAN AS IT STOOD (25 Sep 2026). His program changes mid-week: this
// week Coach moved the rope extension and the straight-bar pushdown into
// Push on Friday, after he had trained Monday's Push with the cable overhead
// extension and the V-bar pushdown. Judged against today's plan, Monday
// showed exercises he was never asked to do as "not done". His call: "Nothing
// should count as missed if it can be helped." So the planned week asks what
// the plan WAS on each past day, and this file is where that answer lives.
//
// The source is exact for every write Nova makes: vaultStateFile snapshots
// the routines file before each write (lib/backup.js, the newest 20, named
// by the write's UTC time). Snapshot k is the plan that the write at its own
// stamp replaced, and the version after it began at that stamp. The live
// file's modified time covers an edit made in Obsidian, which leaves no
// snapshot. The snapshots rotate, so every Train overview folds new ones into
// a store here (server/data: operational, derived from the vault) that keeps
// the chain long after the files are gone.
//
// An observation is { at, plan }: "this plan was in force at `at`". planAt(t)
// is the latest observation at or before t; before the first one, the
// earliest known plan is the best evidence there is.

import { readFile, writeFile, readdir, stat, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTINES_REL_PATH, parseRoutines } from './workouts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = () => path.join(dataRoot(), 'plan-history.json');
const CAP = 400;

// the parts of the plan the week is built from, in a stable shape
export function planOf({ routines = [], schedule = {} } = {}) {
  return {
    schedule: { ...(schedule || {}) },
    routines: (routines || []).map((r) => ({
      id: r.id,
      name: r.name,
      exercises: (r.exercises || []).map((e) => ({
        exerciseId: e.exerciseId,
        targetSets: Number(e.targetSets) || 0,
        targetRepsLow: e.targetRepsLow ?? null,
        targetRepsHigh: e.targetRepsHigh ?? null,
      })),
    })),
  };
}

export const hashPlan = (plan) => createHash('sha1').update(JSON.stringify(plan)).digest('hex').slice(0, 16);

// "Workout Routines.md.2026-09-25T00-05-51-623Z.bak" (or "-1.bak" for a
// same-millisecond twin) → "2026-09-25T00:05:51.623Z"
export function stampOf(fileName) {
  const m = /\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-\d+)?\.bak$/.exec(fileName);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
}

export async function loadPlanHistory() {
  if (!existsSync(FILE())) return { versions: [], seen: [] };
  try {
    const raw = JSON.parse(await readFile(FILE(), 'utf8'));
    return { versions: Array.isArray(raw.versions) ? raw.versions : [], seen: Array.isArray(raw.seen) ? raw.seen : [] };
  } catch { return { versions: [], seen: [] }; }
}

async function save(store) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${FILE()}.tmp`;
  await writeFile(tmp, JSON.stringify(store), 'utf8');
  await rename(tmp, FILE());
}

// Pure: fold one observation into a store; same plan at the same moment is
// one observation, not two. Returns true when the store changed.
export function addObservation(store, { at, plan, source }) {
  if (!at || !plan) return false;
  const hash = hashPlan(plan);
  if (store.versions.some((v) => v.at === at && v.hash === hash)) return false;
  store.versions.push({ at, hash, source: source || 'observed', plan });
  store.versions.sort((a, b) => a.at.localeCompare(b.at));
  if (store.versions.length > CAP) store.versions.splice(0, store.versions.length - CAP);
  return true;
}

// Pure: the plan in force at `iso`.
export function planAt(versions, iso) {
  if (!versions?.length) return null;
  let found = null;
  for (const v of versions) {
    if (v.at <= iso) found = v;
    else break;
  }
  return (found || versions[0]).plan;
}

// Fold every snapshot not yet seen, and the live file, into the store.
export async function refreshPlanHistory(vaultPath) {
  const store = await loadPlanHistory();
  let changed = false;
  const full = path.join(vaultPath, ROUTINES_REL_PATH);
  const dir = path.join(path.dirname(full), '.nova-backups');
  const base = `${path.basename(ROUTINES_REL_PATH)}.`;
  const snaps = existsSync(dir)
    ? (await readdir(dir)).filter((f) => f.startsWith(base) && f.endsWith('.bak') && stampOf(f)).sort()
    : [];
  const read = async (p) => planOf(parseRoutines(await readFile(p, 'utf8')));

  const seen = new Set(store.seen);
  for (let i = 0; i < snaps.length; i++) {
    if (seen.has(snaps[i])) continue;
    const stamp = stampOf(snaps[i]);
    try {
      const before = await read(path.join(dir, snaps[i]));
      // the replaced plan was in force up to this write (its start is the
      // previous snapshot's stamp, when that snapshot is still on disk)
      const prev = i > 0 ? stampOf(snaps[i - 1]) : null;
      changed = addObservation(store, { at: prev || new Date(Date.parse(stamp) - 1).toISOString(), plan: before, source: 'snapshot' }) || changed;
      // and the plan that replaced it began at this write
      const after = i + 1 < snaps.length ? await read(path.join(dir, snaps[i + 1])) : (existsSync(full) ? await read(full) : null);
      if (after) changed = addObservation(store, { at: stamp, plan: after, source: 'snapshot' }) || changed;
    } catch { /* an unreadable snapshot is skipped, never fatal */ }
    store.seen.push(snaps[i]);
    changed = true;
  }
  if (store.seen.length > CAP) store.seen.splice(0, store.seen.length - CAP);

  // an edit made outside Nova (Obsidian) leaves no snapshot: the live file,
  // from its modified time
  if (existsSync(full)) {
    try {
      const { mtime } = await stat(full);
      changed = addObservation(store, { at: mtime.toISOString(), plan: await read(full), source: 'file' }) || changed;
    } catch { /* unreadable right now (iCloud): next time */ }
  }
  if (changed) await save(store);
  return store;
}

import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createWriteLock } from './vaultStateFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Off-plan eating (snacks, extras, anything not one of today's rotation
// recipes) — deliberately not in the Obsidian vault for the same reason as
// health data: this is raw daily telemetry, not synthesized knowledge.
// NOVA_DATA_DIR override exists for tests (read lazily so tests can set it).
const LOG_DIR = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'food-log');

function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today() {
  return localDay(new Date());
}

// Retro logging: an entry may target today or up to RETRO_DAYS back — the
// day-to-day reality of tracking (last night's dinner logged after
// midnight, yesterday filled in this morning). Never the future, never the
// deep past. No arg (or empty) resolves to today, so callers can use this
// as the single date gate.
const RETRO_DAYS = 30;
export function resolveLogDate(date) {
  if (date == null || date === '') return today();
  const d = String(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date must be YYYY-MM-DD');
  if (d > today()) throw new Error("can't log food to a future day");
  const floor = new Date();
  floor.setDate(floor.getDate() - RETRO_DAYS);
  if (d < localDay(floor)) throw new Error(`retro logging reaches back ${RETRO_DAYS} days — ${d} is older`);
  return d;
}

export async function getDay(date) {
  return loadDay(resolveLogDate(date));
}

async function loadDay(date) {
  const full = path.join(LOG_DIR(), `${date}.json`);
  if (!existsSync(full)) return { date, entries: [] };
  return JSON.parse(await readFile(full, 'utf8'));
}

async function saveDay(day) {
  await mkdir(LOG_DIR(), { recursive: true });
  // atomic tmp+rename — this was the one store with neither atomicity nor
  // backups; a mid-write kill could tear the day's food log
  const full = path.join(LOG_DIR(), `${day.date}.json`);
  // UNIQUE tmp name: a shared one let two concurrent saves collide — the
  // second rename found the first's temp file already moved and threw ENOENT,
  // failing the write outright rather than merely losing an entry.
  const tmp = `${full}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(day, null, 2), 'utf8');
  await rename(tmp, full);
}

export async function getToday() {
  return loadDay(today());
}

// EVERY mutation goes through one lock. Each was a read-modify-write on the
// same file: two logs landing together (a double tap, a re-log while a scan
// finishes, the offline outbox draining) both read the same day, both pushed,
// and the second write clobbered the first — an entry silently vanishing,
// which is exactly what "it didn't stay there" looked like.
const withWriteLock = createWriteLock();

export async function addEntry({ name, macros, source, date }) {
  return withWriteLock(() => addEntryUnlocked({ name, macros, source, date }));
}

async function addEntryUnlocked({ name, macros, source, date }) {
  const target = resolveLogDate(date);
  const day = await loadDay(target);
  const entry = {
    id: randomUUID().slice(0, 8),
    // the clock time is only true for same-day logs — stamping a retro
    // entry with the moment it was TYPED would be fiction about when he ate
    ...(target === today() ? { time: new Date().toTimeString().slice(0, 5) } : {}),
    name,
    macros: { p: Number(macros.p) || 0, c: Number(macros.c) || 0, f: Number(macros.f) || 0, kcal: Number(macros.kcal) || 0 },
  };
  // How it was logged — 'scan' | 'barcode' | 'manual' | 'history'. Optional and
  // additive: older entries simply lack it and every reader tolerates that.
  if (source) entry.source = String(source).slice(0, 20);
  day.entries.push(entry);
  await saveDay(day);
  return day;
}

// Most-recent-first list of day files, for cross-day history/aggregation. The
// per-day files are never deleted, so this is a durable log of everything
// eaten off-plan — nothing read across them until now.
export async function loadRecentDays(days = 45) {
  const dir = LOG_DIR();
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, days);
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(path.join(dir, f), 'utf8'))); } catch { /* skip a corrupt day, don't fail the query */ }
  }
  return out;
}

// Entries are only ever shown/removable for today, so no need to search
// across days for the id.
export async function removeEntry(entryId) {
  return withWriteLock(() => removeEntryUnlocked(entryId));
}

async function removeEntryUnlocked(entryId) {
  const day = await loadDay(today());
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return day;
}

// Date-addressed removal for inbox undo, which may run after midnight has
// rolled the "today" file over.
export async function removeEntryOn(date, entryId) {
  return withWriteLock(() => removeEntryOnUnlocked(date, entryId));
}

async function removeEntryOnUnlocked(date, entryId) {
  const day = await loadDay(date);
  const before = day.entries.length;
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return before - day.entries.length;
}

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Off-plan eating (snacks, extras, anything not one of today's rotation
// recipes) — deliberately not in the Obsidian vault for the same reason as
// health data: this is raw daily telemetry, not synthesized knowledge.
// NOVA_DATA_DIR override exists for tests (read lazily so tests can set it).
const LOG_DIR = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'food-log');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDay(date) {
  const full = path.join(LOG_DIR(), `${date}.json`);
  if (!existsSync(full)) return { date, entries: [] };
  return JSON.parse(await readFile(full, 'utf8'));
}

async function saveDay(day) {
  await mkdir(LOG_DIR(), { recursive: true });
  await writeFile(path.join(LOG_DIR(), `${day.date}.json`), JSON.stringify(day, null, 2), 'utf8');
}

export async function getToday() {
  return loadDay(today());
}

export async function addEntry({ name, macros, source }) {
  const day = await loadDay(today());
  const entry = {
    id: randomUUID().slice(0, 8),
    time: new Date().toTimeString().slice(0, 5),
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
  const day = await loadDay(today());
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return day;
}

// Date-addressed removal for inbox undo, which may run after midnight has
// rolled the "today" file over.
export async function removeEntryOn(date, entryId) {
  const day = await loadDay(date);
  const before = day.entries.length;
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return before - day.entries.length;
}

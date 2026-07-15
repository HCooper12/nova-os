import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Off-plan eating (snacks, extras, anything not one of today's rotation
// recipes) — deliberately not in the Obsidian vault for the same reason as
// health data: this is raw daily telemetry, not synthesized knowledge.
const LOG_DIR = path.join(__dirname, '..', 'data', 'food-log');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDay(date) {
  const full = path.join(LOG_DIR, `${date}.json`);
  if (!existsSync(full)) return { date, entries: [] };
  return JSON.parse(await readFile(full, 'utf8'));
}

async function saveDay(day) {
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(path.join(LOG_DIR, `${day.date}.json`), JSON.stringify(day, null, 2), 'utf8');
}

export async function getToday() {
  return loadDay(today());
}

export async function addEntry({ name, macros }) {
  const day = await loadDay(today());
  day.entries.push({
    id: randomUUID().slice(0, 8),
    time: new Date().toTimeString().slice(0, 5),
    name,
    macros: { p: Number(macros.p) || 0, c: Number(macros.c) || 0, f: Number(macros.f) || 0, kcal: Number(macros.kcal) || 0 },
  });
  await saveDay(day);
  return day;
}

// Entries are only ever shown/removable for today, so no need to search
// across days for the id.
export async function removeEntry(entryId) {
  const day = await loadDay(today());
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return day;
}

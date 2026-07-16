import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Day-indexed archive of what was *actually* consumed (rotation slots marked
// eaten + food log), separate from healthData/ since it's derived from vault
// state rather than an external device. Exists purely so "Nova noticed" can
// look back at real intake over time instead of only ever seeing today.
const LOG_DIR = path.join(__dirname, '..', 'data', 'nutrition-log');

export async function saveDay(date, totals, floorG) {
  await mkdir(LOG_DIR, { recursive: true });
  const record = {
    date,
    p: Math.round(totals.p * 10) / 10,
    c: Math.round(totals.c * 10) / 10,
    f: Math.round(totals.f * 10) / 10,
    kcal: Math.round(totals.kcal),
    floorG: floorG || null,
    floorMet: floorG ? totals.p >= floorG : null,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(LOG_DIR, `${date}.json`), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export async function loadRecentDays(n = 7) {
  if (!existsSync(LOG_DIR)) return [];
  const files = (await readdir(LOG_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  const days = [];
  for (const f of files.slice(0, n)) {
    days.push(JSON.parse(await readFile(path.join(LOG_DIR, f), 'utf8')));
  }
  return days.reverse(); // oldest-first
}

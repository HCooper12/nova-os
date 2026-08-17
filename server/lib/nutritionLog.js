import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Day-indexed archive of what was *actually* consumed (rotation slots marked
// eaten + food log), separate from healthData/ since it's derived from vault
// state rather than an external device. Exists purely so "Nova noticed" can
// look back at real intake over time instead of only ever seeing today.
// NOVA_DATA_DIR override exists for tests (read lazily so tests can set it).
const LOG_DIR = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'nutrition-log');

export async function saveDay(date, totals, floorG) {
  await mkdir(LOG_DIR(), { recursive: true });
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
  await writeFile(path.join(LOG_DIR(), `${date}.json`), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

// This calendar month, scored: how many tracked days actually met the
// protein floor. Honest denominators — days with no floor set are excluded
// from the percentage rather than counted either way.
export async function monthAdherence(now = new Date()) {
  if (!existsSync(LOG_DIR())) return { tracked: 0, met: 0, pct: null, avgP: null };
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const files = (await readdir(LOG_DIR())).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  let tracked = 0, met = 0, pSum = 0, pDays = 0;
  for (const f of files) {
    try {
      const d = JSON.parse(await readFile(path.join(LOG_DIR(), f), 'utf8'));
      if (d.p != null) { pSum += d.p; pDays++; }
      if (d.floorMet == null) continue;
      tracked++;
      if (d.floorMet) met++;
    } catch { /* one bad file never breaks the month */ }
  }
  return { tracked, met, pct: tracked ? Math.round((met / tracked) * 100) : null, avgP: pDays ? Math.round(pSum / pDays) : null };
}

export async function loadRecentDays(n = 7) {
  if (!existsSync(LOG_DIR())) return [];
  const files = (await readdir(LOG_DIR())).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  const days = [];
  for (const f of files.slice(0, n)) {
    days.push(JSON.parse(await readFile(path.join(LOG_DIR(), f), 'utf8')));
  }
  return days.reverse(); // oldest-first
}

// The last n CALENDAR days ending today — a missing file is an honest
// untracked day ({date, p: null}), never silently skipped. loadRecentDays
// above walks FILES, so with gaps in the log "the last 7" quietly spanned
// 10+ real days — the exact failure class the health code already guards
// against (coach.js's window rule).
export async function loadCalendarDays(n = 7) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
      days.push({ date, ...JSON.parse(await readFile(path.join(LOG_DIR(), `${date}.json`), 'utf8')) });
    } catch {
      days.push({ date, p: null, c: null, f: null, kcal: null, floorMet: null });
    }
  }
  return days; // oldest-first, exactly n entries
}

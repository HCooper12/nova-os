import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Deliberately NOT in the Obsidian vault — this is raw daily telemetry, not
// synthesized knowledge, so it doesn't belong under Wiki/. One small JSON
// file per calendar day, upserted (a day's Shortcut automation may run more
// than once, or a field may arrive from a separate automation later in the
// day) rather than the backup/write-lock machinery used for vault files —
// lower stakes, easy to regenerate, no human-authored content to protect.
// NOVA_DATA_DIR override exists for tests, which must never touch the real
// data directory.
const DATA_ROOT = process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const HEALTH_DIR = path.join(DATA_ROOT, 'health');

// The fixed set of metrics Nova understands for v1 — recovery/readiness
// signals that pair with what Nova already tracks (workouts, macros, sleep
// via journal). Deliberately excludes Apple Watch workout data: Nova's own
// Workouts feature is already the source of truth for training, so pulling
// a second copy from Health would just create a duplicate/conflicting one.
export const HEALTH_METRICS = [
  'steps', 'restingHeartRate', 'hrv', 'sleepAsleepMinutes', 'sleepInBedMinutes',
  'activeEnergyKcal', 'walkingRunningDistanceKm', 'vo2Max', 'weightKg',
];

function isValidDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

async function ensureDir() {
  await mkdir(HEALTH_DIR, { recursive: true });
}

export async function saveDay(date, metrics) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  await ensureDir();
  const full = path.join(HEALTH_DIR, `${date}.json`);
  const existing = existsSync(full) ? JSON.parse(await readFile(full, 'utf8')) : { date };
  const cleaned = {};
  for (const key of HEALTH_METRICS) {
    if (metrics[key] != null && !Number.isNaN(Number(metrics[key]))) cleaned[key] = Number(metrics[key]);
  }
  const merged = { ...existing, ...cleaned, date, receivedAt: new Date().toISOString() };
  await writeFile(full, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// Bodyweight trend from dated day files — the nutrition loop-closer ("intake
// vs goal vs the scale"). Pure and honest: null when no weight has ever
// arrived; delta only when two points exist. days must be oldest-first (the
// loadRecentDays shape).
export function computeWeightTrend(days) {
  const withW = (days || []).filter((d) => d.weightKg != null && d.date);
  if (!withW.length) return null;
  const latest = withW[withW.length - 1];
  const out = { latestKg: Math.round(latest.weightKg * 10) / 10, latestDate: latest.date, deltaKg: null, spanDays: null };
  if (withW.length >= 2) {
    const first = withW[0];
    out.deltaKg = Math.round((latest.weightKg - first.weightKg) * 10) / 10;
    out.spanDays = Math.round((new Date(`${latest.date}T12:00:00`) - new Date(`${first.date}T12:00:00`)) / 86400000);
  }
  return out;
}

// One context line for agent prompts; honest about the missing-data case.
export function weightTrendLine(days) {
  const t = computeWeightTrend(days);
  if (!t) return 'Bodyweight: no data yet (Body Mass not in the health push).';
  if (t.deltaKg == null) return `Bodyweight: ${t.latestKg} kg (${t.latestDate}; single reading, no trend yet).`;
  const dir = t.deltaKg > 0 ? '+' : '';
  return `Bodyweight: ${t.latestKg} kg (${t.latestDate}), ${dir}${t.deltaKg} kg over ${t.spanDays} days.`;
}

export async function loadDay(date) {
  const full = path.join(HEALTH_DIR, `${date}.json`);
  if (!existsSync(full)) return null;
  return JSON.parse(await readFile(full, 'utf8'));
}

export async function loadRecentDays(n = 14) {
  if (!existsSync(HEALTH_DIR)) return [];
  const files = (await readdir(HEALTH_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  const days = [];
  for (const f of files.slice(0, n)) {
    days.push(JSON.parse(await readFile(path.join(HEALTH_DIR, f), 'utf8')));
  }
  return days.reverse(); // oldest-first, easier to read as a trend
}

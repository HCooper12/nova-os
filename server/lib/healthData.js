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

// Metrics where a literal 0 is physiologically impossible — when the Shortcut
// finds no samples yet (a morning push before HRV/sleep exist), iOS sums an
// empty list to 0 and sends it. Storing that 0 turns "no data" into a fake
// measurement ("HRV 0 ms"), so ingestion treats it as absent. Deliberately
// NOT steps/activeEnergy/distance: 0 of those at 00:05 is a real reading.
export const IMPOSSIBLE_ZERO = new Set([
  'restingHeartRate', 'hrv', 'sleepAsleepMinutes', 'sleepInBedMinutes', 'vo2Max', 'weightKg',
]);

function isValidDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

async function ensureDir() {
  await mkdir(HEALTH_DIR, { recursive: true });
}

// Extract the known numeric metrics from a raw incoming object. Two guards:
//  - Case-insensitive keys: the phone Shortcut is hand-built, so a lowercase
//    "weightkg" for "weightKg" (or "vo2max" for "vo2Max") must NOT silently
//    drop the reading — exact case wins, then a lowercased fallback.
//  - Impossible zeros dropped: iOS sums an empty sample list to 0, so "no
//    HRV samples yet" arrives as hrv:0 — that's absence, not a measurement.
// HEALTH_METRICS lowercased are all distinct, so the fallback can't collide.
export function pickKnownMetrics(raw) {
  // Steps per DEVICE, folded by MAX — never summed. A Shortcut "Find Health
  // Samples" sums raw samples, so dropping the Source filter double-counts
  // every walk both the iPhone and the Watch recorded; filtering to ONE device
  // instead misses what only the other saw (his iPhone-only figure ran ~1,600
  // short of Health's own de-duplicated total). Sending each device separately
  // and taking the higher is the honest middle: a walk both recorded counts
  // once, and watch-only walking still lands.
  const src = { ...(raw || {}) };
  const lower = {};
  for (const [k, v] of Object.entries(src)) lower[k.toLowerCase()] = v;
  // Both word orders accepted: a hand-built Shortcut may as naturally say
  // "watchSteps" as "stepsWatch", and a silently dropped key is exactly the
  // failure mode that cost weeks on the weightKg casing bug.
  // pedometersteps: Pedometer++'s own count via its Shortcuts action — a
  // separate instrument (CMPedometer, not HealthKit) that reads higher than
  // Health's dedup; if he sends it, it competes in the same MAX fold
  const perDevice = ['steps', 'stepswatch', 'watchsteps', 'stepsiphone', 'iphonesteps', 'stepsphone', 'phonesteps', 'pedometersteps', 'stepspedometer']
    .map((k) => Number(lower[k]))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (perDevice.length) {
    src.steps = Math.max(...perDevice);
    lower.steps = src.steps;
  }

  const out = {};
  for (const key of HEALTH_METRICS) {
    const val = src[key] != null ? src[key] : lower[key.toLowerCase()];
    if (val == null || Number.isNaN(Number(val))) continue;
    const num = Number(val);
    if (num === 0 && IMPOSSIBLE_ZERO.has(key)) continue; // "no samples yet", not a reading
    out[key] = num;
  }
  return out;
}

// The just-after-midnight rule. His nightly automation now fires at 12:05am
// with every query on a rolling "in the last 1 day" window — so the numbers it
// carries describe YESTERDAY, while the Shortcut's own Formatted Date says
// today. A full day of steps/energy/distance cannot belong to a day that is
// five minutes old, so a push landing in the small hours and stamped with
// today's date is filed against yesterday instead. This spares him an Adjust
// Date action in Shortcuts, which is the step he has been stuck on.
//
// Deliberately narrow: only before HOUR_CUTOFF, only when the payload's date
// is today, and never for a manual correction. The shift is receipted
// (dateShifted) so it is visible rather than mysterious.
export const MIDNIGHT_SHIFT_HOUR_CUTOFF = 4;
export function resolvePushDate(date, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (date !== today || now.getHours() >= MIDNIGHT_SHIFT_HOUR_CUTOFF) return { date, shifted: false };
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return { date: `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`, shifted: true };
}

// The monotonic-steps rule. Steps within a calendar day only ever increase —
// you cannot un-walk — so for a PAST day the HIGHEST reported value is the
// most complete reading, and a lower later push is a truncated one to ignore.
//
// Evidence (pushlog, 23-27 July + his Health figure on 30 July): the nightly
// automation reports LESS than a later per-date reading for the same date, by
// inconsistent ratios (1.12x, 1.13x, 1.41x) — not phone+watch duplication,
// which would be a steady ~2x. Its Source filter is pinned to the iPhone, so
// it never saw watch-only walking: 8,311 stored vs 9,908 in Health.
//
// Human edits from the app (manual: true) bypass this entirely — his
// correction is always the truth of last resort.
// TODAY IS NOT EXEMPT (fixed 12 Aug 2026, after a real loss): this rule used
// to skip the current day — "today keeps updating freely" — and on 11 Aug a
// push reporting 813 landed one minute after a genuine 11,107 for the same
// day and overwrote it. You cannot un-walk within a day either; a lower
// later reading is a truncated one whatever day it names. Manual corrections
// (manual: true) still bypass this entirely — his edit is the last word.
export function shouldDropLowerSteps(existingSteps, incomingSteps) {
  if (incomingSteps == null) return false;
  if (existingSteps == null) return false;  // catch-up into a gap is welcome
  return Number(incomingSteps) <= Number(existingSteps); // only a HIGHER reading replaces
}

// A steps reading is only the day's TOTAL if it was captured after the day
// ended. Captured during the day, it is a partial — honest degradation, not a
// silent undercount.
export function stepsCaptureIsComplete(date, capturedAtIso) {
  if (!capturedAtIso) return false;
  const at = new Date(capturedAtIso);
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return localDay > date; // stamped on a later local day = the day was over
}

export async function saveDay(date, metrics, { manual = false } = {}) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  await ensureDir();
  const full = path.join(HEALTH_DIR, `${date}.json`);
  const existing = existsSync(full) ? JSON.parse(await readFile(full, 'utf8')) : { date };
  const cleaned = pickKnownMetrics(metrics);
  const merged = { ...existing, ...cleaned, date, receivedAt: new Date().toISOString() };
  // WHEN the steps figure was captured decides whether it can be the day's
  // total. His nightly automation runs at 23:45, so its number misses the rest
  // of the evening and any watch samples that hadn't synced — measured at
  // ~1,600 steps on 29 July (8,311 recorded vs 9,908 in Health). Stamping the
  // capture time lets every surface say "as of 23:45" instead of presenting a
  // truncated figure as final. A manual correction is complete by definition.
  if (cleaned.steps != null) {
    merged.stepsAt = new Date().toISOString();
    merged.stepsComplete = manual ? true : stepsCaptureIsComplete(date, merged.stepsAt);
  }
  await writeFile(full, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// Bodyweight trend from dated day files — the nutrition loop-closer ("intake
// vs goal vs the scale"). Pure and honest: null when no weight has ever
// arrived; delta only when two points exist. days must be oldest-first (the
// loadRecentDays shape).
export function computeWeightTrend(days) {
  const withW = (days || []).filter((d) => d.weightKg != null && d.weightKg !== 0 && d.date);
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

// Receipts for the health feed: every push ATTEMPT (success or failure) is
// logged, so "did the phone even try last night?" has an answer in evidence
// instead of guesswork — the missing-steps saga kept recurring because
// failures were invisible on both ends (iOS automations swallow errors).
const PUSHLOG = () => path.join(DATA_ROOT, 'health', 'pushlog.json');
export async function logPushAttempt(entry) {
  try {
    let log = [];
    if (existsSync(PUSHLOG())) {
      try { log = JSON.parse(await readFile(PUSHLOG(), 'utf8')).attempts || []; } catch { log = []; }
    }
    log.push({ at: new Date().toISOString(), ...entry });
    await mkdir(path.dirname(PUSHLOG()), { recursive: true });
    await writeFile(PUSHLOG(), JSON.stringify({ attempts: log.slice(-50) }, null, 2), 'utf8');
  } catch { /* receipts are best-effort, never block the push */ }
}
export async function readPushLog() {
  if (!existsSync(PUSHLOG())) return [];
  try { return JSON.parse(await readFile(PUSHLOG(), 'utf8')).attempts || []; } catch { return []; }
}

export async function loadDay(date) {
  const full = path.join(HEALTH_DIR, `${date}.json`);
  if (!existsSync(full)) return null;
  return JSON.parse(await readFile(full, 'utf8'));
}

// ONE ingest gate for BOTH channels — the URL push and the Health Drops
// folder. The midnight date-shift and the monotonic-steps rule are part of
// the FORMAT, not the transport: the 9→10 Aug steps clobber happened
// because a guard lived in only one of the two writers. Callers pass their
// transport receipts (rawBody / source / file) through to the pushlog.
export async function ingestHealthPayload({ date, metrics, manual = false, source, file, rawBody }) {
  const receipt = { ...(source ? { source } : {}), ...(file ? { file } : {}), ...(rawBody ? { rawBody } : {}) };
  // The phone may say it in words: "yesterday"/"today" resolve HERE, so a
  // morning catch-up Shortcut (Health is unreadable while the phone is
  // locked overnight — the whole reason midnight pushes die) needs no
  // Adjust Date gymnastics. The server owns the calendar math; the phone
  // owns the readings.
  if (typeof date === 'string' && /^(today|yesterday)$/i.test(date.trim())) {
    const d = new Date();
    if (date.trim().toLowerCase() === 'yesterday') d.setDate(d.getDate() - 1);
    const pad = (n) => String(n).padStart(2, '0');
    date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  metrics = pickKnownMetrics(metrics || {});
  const rawKeys = Object.keys(metrics);
  if (!rawKeys.length) {
    await logPushAttempt({ ok: false, ...receipt, date, error: 'no usable metrics' });
    return { ok: false, error: 'no usable metrics' };
  }
  let dateShifted = false;
  if (!manual) {
    const resolved = resolvePushDate(date);
    date = resolved.date;
    dateShifted = resolved.shifted;
  }
  let stepsDropped = false;
  if (!manual && metrics.steps != null) {
    const existing = await loadDay(date);
    if (shouldDropLowerSteps(existing?.steps, metrics.steps)) {
      delete metrics.steps;
      stepsDropped = true;
      if (!Object.keys(metrics).length) {
        await logPushAttempt({ ok: true, ...receipt, date, keys: rawKeys, steps: null, stepsDropped });
        return { ok: true, day: existing, date, stepsDropped, allDropped: true };
      }
    }
  }
  const day = await saveDay(date, metrics, { manual });
  await logPushAttempt({ ok: true, ...receipt, date, keys: rawKeys, steps: metrics.steps ?? null, ...(stepsDropped ? { stepsDropped } : {}), ...(dateShifted ? { dateShifted: true } : {}) });
  return { ok: true, day, date, stepsDropped, dateShifted };
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

// Apple Health workouts — the watch's account of what his body actually
// did, alongside what Nova's logger says he trained. Same doctrine as the
// metrics pipeline: tolerate Shortcut-shaped bodies, idempotent re-pushes,
// receipts in the pushlog, and honest degradation (a day with no push shows
// nothing rather than zeros).
//
// The join is the point: a watch strength-workout on a day with NO Nova
// session is an accountability signal the Coach raises; walks and cardio
// enrich the recovery picture the ring and briefs read.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const DIR = () => path.join(DATA_ROOT, 'health', 'workouts');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const localDateOf = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// HOW LONG IT RAN, most certain source first. A bare number under `duration`
// cannot say its unit: Apple's Duration detail is seconds, so a 20-minute
// walk arrived as 1200 and passed for 1,200 minutes (14 Oct 2026). So: the
// start and end times when both are sent; then a field that names its unit
// (`minutes`, `seconds`, or text like "20 min"); only then the old guess on a
// bare `duration` (a clock string, or a number over a day's minutes = seconds).
const UNIT_RE = /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds))?$/i;
function fromText(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const clock = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (clock) return clock[3] != null ? Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3]) / 60 : Number(clock[1]) + Number(clock[2]) / 60;
  const u = /[a-z]/i.test(t) && t.match(UNIT_RE);
  if (u && (u[1] || u[2] || u[3])) return Number(u[1] || 0) * 60 + Number(u[2] || 0) + Number(u[3] || 0) / 60;
  return null;
}
export function workoutMinutes(raw, startISO) {
  const endISO = String(raw.endISO || raw.end || raw.endDate || '').trim();
  const span = (new Date(endISO) - new Date(startISO)) / 60000;
  if (startISO && endISO && Number.isFinite(span) && span > 0) return span;
  const named = raw.minutes ?? raw.durationMinutes;
  if (named != null) return fromText(named) ?? (Number(named) || 0);
  const secs = raw.seconds ?? raw.durationSeconds;
  if (secs != null) return fromText(secs) ?? (Number(secs) || 0) / 60;
  const d = raw.duration;
  const text = fromText(d);
  if (text != null) return text;
  const n = Number(d) || 0;
  return n > 24 * 60 && n <= 24 * 3600 ? n / 60 : n;
}

// Pure + exported for tests: coerce one Shortcut-shaped workout into a
// typed record, or null if unusable. Field aliases cover what the
// Shortcuts "Find Workouts" action naturally produces.
export function normalizeWorkout(raw, fallbackDate) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || raw.workoutType || raw.name || '').trim().slice(0, 60);
  const startISO = String(raw.startISO || raw.start || raw.startDate || '').trim();
  const minutes = Math.round(workoutMinutes(raw, startISO));
  const kcal = Math.round(parseFloat(raw.kcal ?? raw.activeEnergyKcal ?? raw.energy) || 0);
  if (!type || minutes <= 0 || minutes > 24 * 60) return null;
  const date = localDateOf(startISO) || (DATE_RE.test(String(fallbackDate)) ? fallbackDate : null);
  if (!date) return null;
  return { type, date, startISO: localDateOf(startISO) ? new Date(startISO).toISOString() : null, minutes, kcal: kcal > 0 ? kcal : null };
}

// Idempotent merge: a re-push of the same workout (same type + start, or
// same type + minutes when start is missing) replaces rather than
// duplicates — the Shortcut runs "today's workouts" and may fire many times.
export function mergeWorkouts(existing, incoming) {
  const key = (w) => `${w.type}|${w.startISO || `~${w.minutes}`}`;
  const byKey = new Map(existing.map((w) => [key(w), w]));
  for (const w of incoming) byKey.set(key(w), w);
  return [...byKey.values()].sort((a, b) => String(a.startISO || '').localeCompare(String(b.startISO || '')));
}

export async function ingestWorkouts({ date, workouts, rawBody }) {
  const { logPushAttempt } = await import('./healthData.js');
  const list = (Array.isArray(workouts) ? workouts : []).map((w) => normalizeWorkout(w, date)).filter(Boolean);
  if (!list.length) {
    await logPushAttempt({ ok: false, kind: 'workouts', date: date || null, error: 'no usable workouts', rawBody });
    return { ok: false, error: 'no usable workouts (need type + minutes, and a start date or a valid date field)' };
  }
  // workouts carry their own calendar dates — group and save per day
  const byDate = new Map();
  for (const w of list) byDate.set(w.date, [...(byDate.get(w.date) || []), w]);
  const saved = {};
  await mkdir(DIR(), { recursive: true });
  for (const [d, ws] of byDate) {
    const full = path.join(DIR(), `${d}.json`);
    let existing = [];
    try { existing = JSON.parse(await readFile(full, 'utf8')).workouts || []; } catch { /* first push for the day */ }
    const merged = mergeWorkouts(existing, ws);
    await writeFile(full, JSON.stringify({ date: d, workouts: merged, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    saved[d] = merged.length;
  }
  await logPushAttempt({ ok: true, kind: 'workouts', dates: [...byDate.keys()], count: list.length });
  return { ok: true, saved };
}

export async function workoutsForDay(date) {
  try { return JSON.parse(await readFile(path.join(DIR(), `${date}.json`), 'utf8')).workouts || []; } catch { return []; }
}

export async function recentWorkoutDays(days = 7) {
  let files = [];
  try { files = (await readdir(DIR())).filter((f) => f.endsWith('.json')); } catch { return []; }
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const out = [];
  for (const f of files.sort().reverse()) {
    const d = f.replace('.json', '');
    if (d < cutoff) break;
    try { out.push(JSON.parse(await readFile(path.join(DIR(), f), 'utf8'))); } catch { /* skip corrupt */ }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const STRENGTH_RE = /strength|weight|functional|core train/i;

// The Coach's lines: what the watch saw this week, and the JOIN — watch
// strength work with no Nova session is the accountability signal.
export async function watchContext(vaultPath) {
  const days = await recentWorkoutDays(7);
  if (!days.length) return '';
  const { loadSessions } = await import('./workoutSessions.js');
  const sessions = await loadSessions(vaultPath, { limit: 20 }).catch(() => []);
  const loggedDates = new Set(sessions.map((s) => s.date));
  const lines = days.map((d) => `${d.date.slice(5)}: ${d.workouts.map((w) => `${w.type} ${w.minutes}min${w.kcal ? ` ${w.kcal}kcal` : ''}`).join(', ')}`);
  const unlogged = days.filter((d) => d.workouts.some((w) => STRENGTH_RE.test(w.type)) && !loggedDates.has(d.date)).map((d) => d.date);
  return `APPLE WATCH WORKOUTS (his watch's account, last 7 days):\n${lines.join('\n')}${unlogged.length ? `\nJOIN CHECK: watch recorded strength training on ${unlogged.join(', ')} with NO Nova session logged those days — sets and loads are missing from his history. Raise it once, gently: was it logged elsewhere, or forgotten?` : ''}`;
}

// QUIET HOURS — his call, 3 Oct 2026: "Yes notifications respect quiet hours."
//
// Every push Nova sends (lib/push.js sendPush) asks this module first. Inside
// the window a push is HELD, and delivered when the window ends: one push if
// one was held, one combined push if several were. A push flagged `urgent`
// goes at once; nothing is urgent today (see URGENT below).
//
// The window is in HIS local time, Australia/Melbourne (AEST +10, AEDT +11 in
// summer), because 22:00 means his evening wherever the Mac's clock is set.
// Every stamp this module stores stays UTC (the platform rule: see the
// nova-utc-timestamps memory); only the window comparison is local.
//
// Stored with the other server-side prefs as its own small file in the data
// dir (the modelPrefs.js pattern: read on demand, written atomically).
// Default 22:00 to 07:00, on. The held queue is a file too, so a restart in
// the night (scripts/reload-server.mjs) loses nothing: the boot schedules the
// delivery again (push.resumeHeldPushes).

import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const PREFS_PATH = () => path.join(dataRoot(), 'quiet-hours.json');

export const TIME_ZONE = 'Australia/Melbourne';
export const DEFAULT_QUIET_HOURS = Object.freeze({ enabled: true, start: '22:00', end: '07:00' });

// THE URGENT FLAG. A caller passes `urgent: true` on sendPush to go through
// the window. Defined, and used by nothing yet: his decision was that
// notifications respect quiet hours, and no notification today has earned
// waking him. A future one that has (a safety alert, say) names itself here.
export const URGENT = 'urgent';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isClock = (s) => typeof s === 'string' && HHMM.test(s);
const toMin = (s) => { const m = HHMM.exec(s); return Number(m[1]) * 60 + Number(m[2]); };

// His prefs, read on demand (a PUT is seen by the very next push). A missing
// or broken file is the default, never an error: notifications must not stop
// because a prefs file is unreadable.
export function getQuietHours() {
  try {
    if (!existsSync(PREFS_PATH())) return { ...DEFAULT_QUIET_HOURS };
    const raw = JSON.parse(readFileSync(PREFS_PATH(), 'utf8'));
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_QUIET_HOURS.enabled,
      start: isClock(raw.start) ? raw.start : DEFAULT_QUIET_HOURS.start,
      end: isClock(raw.end) ? raw.end : DEFAULT_QUIET_HOURS.end,
    };
  } catch {
    return { ...DEFAULT_QUIET_HOURS };
  }
}

// A partial patch, validated: an unreadable time is refused, not guessed.
export async function setQuietHours(patch = {}) {
  const next = { ...getQuietHours() };
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') throw new Error('enabled must be true or false');
    next.enabled = patch.enabled;
  }
  for (const k of ['start', 'end']) {
    if (patch[k] === undefined) continue;
    if (!isClock(patch[k])) throw new Error(`${k} must be a time like 22:00`);
    next[k] = patch[k];
  }
  if (next.start === next.end) throw new Error('quiet hours must start and end at different times');
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${PREFS_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  await rename(tmp, PREFS_PATH());
  return next;
}

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

// Minutes past midnight in Melbourne at instant `at` (a Date or ms), with the
// seconds kept as a fraction so the end of the window is exact.
export function melbourneMinutes(at) {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60;
}

// Is `at` inside the window? A window may cross midnight (22:00 to 07:00) or
// not (13:00 to 15:00). The start minute is inside; the end minute is not.
export function inQuietHours(prefs = getQuietHours(), at = Date.now()) {
  if (!prefs?.enabled) return false;
  const now = melbourneMinutes(at);
  const s = toMin(prefs.start);
  const e = toMin(prefs.end);
  return s < e ? now >= s && now < e : now >= s || now < e;
}

// The instant the window that contains `at` ends (Melbourne's `end`), as ms.
// Daylight saving moves an hour twice a year, so the first guess is checked
// against the clock it lands on and corrected once.
export function quietEndsAt(prefs = getQuietHours(), at = Date.now()) {
  const t = typeof at === 'number' ? at : new Date(at).getTime();
  const end = toMin(prefs.end);
  const wait = (end - melbourneMinutes(t) + 1440) % 1440 || 1440;
  let guess = t + Math.round(wait * 60_000);
  const drift = melbourneMinutes(guess) - end;
  if (Math.abs(drift) > 0.01 && Math.abs(drift) < 720) guess -= Math.round(drift * 60_000);
  return guess;
}

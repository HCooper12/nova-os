// EARNED CALORIES (his idea, 7 Nov 2026): the goal sets the target, and a day he
// moves more than usual earns a little room, without the goal losing its place.
// "If I have earned calories it should still consider my goals."
//
// Three guards keep fat loss in front, all in code:
//  - Measured against HIS usual day, not zero. The target and the weekly
//    calibration already price in normal activity; counting all movement would
//    count it twice. A quiet day never lowers the target.
//  - Half, because a wrist's calorie burn is an estimate: reviews put the error
//    above 30% (Germini et al., JMIR 2022). At half, the watch could read
//    double the truth and the planned deficit would still stand.
//  - A daily cap, so one odd reading can never hand back the deficit.
//
// His standing condition: if weight stops dropping for two weeks, the Monday
// review says so and proposes switching this off. It proposes; he decides.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { weightSlope } from './fuelReview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'fuel-earned.json');

export const EARN_SHARE = 0.5;
export const EARN_CAP = 200; // kcal a day
export const USUAL_WINDOW = 28;
export const MIN_USUAL_DAYS = 14;
export const STALL_DAYS = 14;
const MIN_STALL_WEIGHINS = 3, MIN_STALL_SPAN = 10;
const STILL_KG_PER_WEEK = -0.05; // slower than this is not dropping
const FIRST_ON = '2026-11-07';

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Pure. `past` is his finished days' active energy, today excluded. */
export function earnedFor({ active, past = [], on = true } = {}) {
  const days = past.filter((n) => Number(n) > 0);
  const none = (reason) => ({ on, kcal: 0, usual: null, active: Number(active) || null, days: days.length, reason });
  if (!on) return none('off');
  if (days.length < MIN_USUAL_DAYS) return none('not enough history');
  const usual = Math.round(median(days));
  if (!(Number(active) > 0)) return { ...none('no reading yet'), usual };
  const above = Math.max(0, active - usual);
  const kcal = Math.min(EARN_CAP, Math.round((above * EARN_SHARE) / 10) * 10);
  return { on, kcal, usual, active: Math.round(active), days: days.length, reason: null };
}

/** Pure. Two weeks in, is his weight dropping? 'unknown' never proposes anything. */
export function earnedCheck({ on, since, weighIns = [], today } = {}) {
  if (!on) return { verdict: 'off', line: null };
  const dayNum = (iso) => Math.round(new Date(`${iso}T12:00:00Z`).getTime() / 86400000);
  if (dayNum(today) - dayNum(since) < STALL_DAYS) {
    return { verdict: 'early', line: `Earned calories started ${since}; two weeks are needed to judge them.` };
  }
  const recent = weighIns.filter((w) => dayNum(today) - dayNum(w.on) <= STALL_DAYS);
  const span = recent.length ? dayNum(recent[recent.length - 1].on) - dayNum(recent[0].on) : 0;
  if (recent.length < MIN_STALL_WEIGHINS || span < MIN_STALL_SPAN) {
    return { verdict: 'unknown', line: `Earned calories: only ${recent.length} weigh-in${recent.length === 1 ? '' : 's'} in two weeks, too few to tell whether weight is dropping.` };
  }
  const perWeek = weightSlope(recent) * 7;
  const shown = `${perWeek > 0 ? '+' : ''}${perWeek.toFixed(2)} kg a week`;
  return perWeek > STILL_KG_PER_WEEK
    ? { verdict: 'stalled', perWeek, line: `Weight trend over two weeks: ${shown}, so it is not dropping with earned calories on.` }
    : { verdict: 'dropping', perWeek, line: `Weight trend over two weeks: ${shown}, so earned calories are not getting in the way.` };
}

export async function readEarnedState() {
  try {
    const s = JSON.parse(await readFile(STATE(), 'utf8'));
    return { on: s.on !== false, since: s.since || FIRST_ON };
  } catch { return { on: true, since: FIRST_ON }; }
}

export async function writeEarnedState(next) {
  await mkdir(path.dirname(STATE()), { recursive: true });
  const tmp = `${STATE()}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, STATE());
  return next;
}

/** Today's earned figure from the real record. Never throws: no room is the honest default. */
export async function earnedToday({ now = new Date() } = {}) {
  try {
    const { loadRecentDays } = await import('./healthData.js');
    const { localDateISO } = await import('./localDate.js');
    const date = localDateISO(now);
    const days = await loadRecentDays(USUAL_WINDOW + 1);
    const past = days.filter((d) => d.date < date && d.stepsComplete !== false).map((d) => d.activeEnergyKcal);
    const today = days.find((d) => d.date === date);
    const { on } = await readEarnedState();
    return { date, ...earnedFor({ active: today?.activeEnergyKcal, past, on }) };
  } catch {
    return { date: null, on: false, kcal: 0, usual: null, active: null, days: 0, reason: 'unavailable' };
  }
}

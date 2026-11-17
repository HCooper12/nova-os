import { buildWidgetToday } from './widgetToday.js';
import { addEntry, removeEntry, removeEntryOn, getDay, loadRecentDays } from './foodLog.js';
import { recordDaySnapshot } from './nutritionSnapshot.js';
// ONE implementation of "what he usually eats now": the phone's own folding
// (src/relogFacts.js is pure, and the server already imports from ../../src).
import { buildRelog, usualNow, logPayload, RAIL_MAX } from '../../src/relogFacts.js';

// THE WRIST'S DAY: the widget's small today read plus the foods he usually
// logs around now, and a one-tap log with its undo. Deterministic, no model.
// A value that is not known is null, never 0.

const USUALS_MAX = 6;
const HISTORY_DAYS = 90; // what the phone loads (GET /food-log/recent default)

const fail = (message, code) => Object.assign(new Error(message), { code });

// the lean shape GET /food-log/recent hands the phone
const lean = (days) => (days || []).map((d) => ({
  date: d.date,
  entries: (d.entries || []).filter((e) => e?.name && e.macros).map((e) => ({
    id: e.id, name: e.name, ...(e.time ? { time: e.time } : {}), ...(e.source ? { source: e.source } : {}),
    macros: { p: e.macros.p, c: e.macros.c, f: e.macros.f, kcal: e.macros.kcal },
  })),
}));

/** The foods he usually logs within an hour of `now`, on at least two
 *  different days (relogFacts.usualNow). Same order as the phone's rail:
 *  newest first, from the first RAIL_MAX foods. Foods already logged today are
 *  NOT hidden: the phone's rail keeps them (it shows "Today 12:10"), so does
 *  this. Rotation dishes are left out by the phone; the server has no rotation
 *  list here, so none are excluded.
 *  days: [{ date, entries:[{ id, name, time?, macros }] }]  -> at most 6 */
const asUsual = (f, times = 1) => {
  // times scales the amount he last logged; at 1 this is byte-identical to the
  // plain one-tap log (logPayload returns that entry's own macros)
  const pl = logPayload(f, f.last.amount * times);
  return { key: f.key, name: pl.name, macros: pl.macros, count: f.count, lastDate: f.last.date };
};

export function usualsFor({ days = [], now = new Date() } = {}) {
  const R = buildRelog({ days, rotationNames: [], now });
  return R.foods.slice(0, RAIL_MAX)
    .filter((f) => usualNow(f, now))
    .slice(0, USUALS_MAX)
    .map((f) => asUsual(f)); // not .map(asUsual): the index would arrive as `times`
}

/** One food by its key, whatever the hour. The watch shows a list read a
 *  moment ago; a tap that lands after the hour window has moved on must still
 *  log the row he tapped, so the lookup is not narrowed to "usual right now". */
export function foodByKey({ days = [], now = new Date(), key, times = 1 } = {}) {
  const f = buildRelog({ days, rotationNames: [], now }).foods.find((x) => x.key === key);
  return f ? asUsual(f, times) : null;
}

async function usualsNow(now) {
  return usualsFor({ days: lean(await loadRecentDays(HISTORY_DAYS)), now });
}

export async function buildWristToday(vaultPath, { now = new Date() } = {}) {
  const base = await buildWidgetToday(vaultPath, { now });
  try {
    return { ...base, usuals: await usualsNow(now) };
  } catch (err) {
    return { ...base, usuals: null, usualsError: err.message };
  }
}

async function totals(vaultPath) {
  const w = await buildWidgetToday(vaultPath);
  return { protein: w.protein, kcal: w.kcal };
}

export async function logUsual(vaultPath, key, { now = new Date(), times = 1 } = {}) {
  const usual = foodByKey({ days: lean(await loadRecentDays(HISTORY_DAYS)), now, key, times });
  if (!usual) throw fail('That food is no longer in your recent log.', 'unknown_usual');
  const before = new Set((await getDay()).entries.map((e) => e.id));
  // the same call POST /food-log makes, with the payload the phone's Log again
  // sends (name + macros; the lean history carries no item lines to send)
  const day = await addEntry({ name: usual.name, macros: usual.macros, source: 'watch' });
  recordDaySnapshot(vaultPath, day.date).catch(() => {});
  const added = day.entries.find((e) => !before.has(e.id)) || day.entries.at(-1);
  return {
    entry: { id: added.id, name: added.name, macros: added.macros },
    date: day.date,
    ...(await totals(vaultPath)),
  };
}

export async function undoUsual(vaultPath, id, { date } = {}) {
  const day = await getDay(date); // today when no date; refuses a bad or future date
  if (!day.entries.some((e) => e.id === id)) throw fail('That entry is not in the log.', 'not_found');
  if (date) await removeEntryOn(day.date, id); else await removeEntry(id);
  recordDaySnapshot(vaultPath, day.date).catch(() => {});
  return { removed: true, date: day.date, ...(await totals(vaultPath)) };
}

/** The entry as the watch is told about it, plus the day's running totals. */
export async function logWatchEntry(vaultPath, entryInput) {
  const before = new Set((await getDay()).entries.map((e) => e.id));
  const day = await addEntry({ ...entryInput, source: 'watch' });
  recordDaySnapshot(vaultPath, day.date).catch(() => {});
  const added = day.entries.find((e) => !before.has(e.id)) || day.entries.at(-1);
  return {
    entry: { id: added.id, name: added.name, macros: added.macros },
    date: day.date,
    ...(await totals(vaultPath)),
  };
}

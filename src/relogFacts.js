// LOG IT AGAIN (mockup 110, his yes on 4 Nov 2026, with one change: "make it
// so the log again includes items not found in the current meal rotation").
//
// Everything Fuel's "Again" rail and the Log again sheet show is derived here
// from the raw days of his log (GET /food-log/recent), pure, so the test can
// hold it to his real history:
//
//   - ONE FOOD, MANY AMOUNTS. "Crisp Power ... pretzel (1 piece)",
//     "... (1 piece) (4× serving)" and "... (8× serving)" are one food priced
//     per piece. A food whose name ends in a count ("(1 crisp)", "(3 balls)",
//     ", 1 slice") is a COUNT food: logged as 12 it is renamed "(12 crisps)".
//     Anything else is SERVINGS, named by src/portion.js ("(½ serving)").
//   - THE ROTATION IS LEFT OUT. A dish in today's rotation has its own tiles
//     and Right now card; Log again is everything else.
//   - NEWEST FIRST IS TRUE. A retro entry has no clock time (foodLog.js only
//     stamps one for today, on purpose); it takes the time of the timed entry
//     before it in the day, for ORDER only, and still shows no time.
//   - A DAY IS GROUPS. Entries within ten minutes of each other are one group
//     ("Log all"), and the same food twice in a group is one row with its total
//     (his ten separate "Pringles (1 crisp)" entries on 19 Oct).

import { PORTIONS, portionLabel } from './portion.js';

export const GROUP_GAP_MIN = 10;
export const RAIL_MAX = 12;
export const REGULARS = 6;
export const REGULAR_DAYS = 42;
export const USUAL_WINDOW_MIN = 60;
export const COUNT_MAX = 200;
export const SERVING_MAX = 20;

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
export const normName = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// ---- amounts ---------------------------------------------------------------
const GLYPH = { '¼': 0.25, '⅓': 1 / 3, '½': 0.5, '⅔': 2 / 3, '¾': 0.75, '1½': 1.5 };
const NOT_A_COUNT = /^(g|gm|grams?|kg|mg|ml|mls|l|litres?|liters?|cal|kcal|kj|oz|lb|lbs|cm|mm|min|mins|minutes?|percent|x)$/i;

const factorOf = (label) => {
  const t = String(label).trim();
  if (GLYPH[t] != null) return GLYPH[t];
  const m = /^(\d+(?:\.\d+)?)\s*×?$/.exec(t);
  return m ? Number(m[1]) : null;
};

export const singular = (w) => {
  const s = String(w || '');
  if (/(ches|shes|sses|xes)$/i.test(s)) return s.slice(0, -2);
  if (/[^aeiou]ies$/i.test(s) && !/(cookies|brownies|smoothies|pies|ties)$/i.test(s)) return `${s.slice(0, -3)}y`;
  if (/[^s]s$/i.test(s)) return s.slice(0, -1);
  return s;
};
export const plural = (w) => {
  const s = String(w || '');
  if (/(s|x|ch|sh)$/i.test(s)) return `${s}es`;
  if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
};
export const unitWord = (unit, n) => (Math.abs(n - 1) < 1e-9 ? unit : plural(unit));

/** What a logged name says about its amount.
 *  -> { base, kind: 'count'|'serving', amount, unit?, sep? } */
export function parseAmount(name) {
  let rest = String(name || '').trim();
  let mult = 1;
  const sv = /\s*\(([^()]+?)\s+servings?\)\s*$/i.exec(rest);
  if (sv) {
    const f = factorOf(sv[1]);
    if (f && f > 0) { mult = f; rest = rest.slice(0, sv.index).trim(); }
  }
  const paren = /\s*\((\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z-]*)\)\s*$/.exec(rest);
  const comma = paren ? null : /,\s*(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z-]*)\s*$/.exec(rest);
  const m = paren || comma;
  if (m && !NOT_A_COUNT.test(m[2]) && Number(m[1]) > 0) {
    return { base: rest.slice(0, m.index).trim(), kind: 'count', amount: Number(m[1]) * mult, unit: singular(m[2]).toLowerCase(), sep: paren ? 'paren' : 'comma' };
  }
  return { base: rest, kind: 'serving', amount: mult };
}

const fmtN = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** The amount in words: "12 crisps", "1 piece", "½ serving", "2 servings". */
export function amountLabel(food, amt) {
  if (food.kind === 'count') return `${fmtN(amt)} ${unitWord(food.unit, amt)}`;
  return `${portionLabel(amt).replace(/×$/, '')} ${amt > 1 + 1e-9 ? 'servings' : 'serving'}`;
}
/** The chip-sized amount: "12", "½". */
export const amountShort = (food, amt) => (food.kind === 'count' ? fmtN(amt) : portionLabel(amt).replace(/×$/, ''));

/** The name the entry is logged under at that amount. */
export function amountName(food, amt) {
  if (food.kind === 'count') {
    const a = `${fmtN(amt)} ${unitWord(food.unit, amt)}`;
    return food.sep === 'comma' ? `${food.base}, ${a}` : `${food.base} (${a})`;
  }
  if (Math.abs(amt - 1) < 1e-9) return food.base;
  return `${food.base} (${amountShort(food, amt)} ${amt > 1 ? 'servings' : 'serving'})`;
}

/** Macros at an amount, from the food's per-one macros. Grams keep a decimal
 *  (a piece of Turkish Delight is 0.2 g protein; nineteen of them rounded to
 *  0 g each would lose 4 g), kcal is its own scaled value (portion.js's rule). */
export function amountMacros(food, amt) {
  const u = food.unitMacros || {};
  const g = (v) => Math.round(num(v) * amt * 10) / 10;
  return { p: g(u.p), c: g(u.c), f: g(u.f), kcal: Math.round(num(u.kcal) * amt) };
}

export const validAmount = (food, amt) => {
  const a = Number(amt);
  return Number.isFinite(a) && a > 0 && a <= (food.kind === 'count' ? COUNT_MAX : SERVING_MAX);
};

// the steps − / + walk through
const SERVING_STEPS = [...PORTIONS.map((p) => p.factor), 2.5, 3, 4, 5, 6, 8, 10];
export function stepAmount(food, amt, dir) {
  if (food.kind === 'count') {
    const next = dir > 0 ? Math.floor(amt + 1e-9) + 1 : Math.ceil(amt - 1e-9) - 1;
    return Math.min(COUNT_MAX, Math.max(1, next));
  }
  if (dir > 0) return SERVING_STEPS.find((s) => s > amt + 1e-9) ?? amt;
  return [...SERVING_STEPS].reverse().find((s) => s < amt - 1e-9) ?? amt;
}

/** The tray's quick picks. A count food: the day totals he has used (up to
 *  three), then round counts above them. Servings: the recipe fractions,
 *  then 1, 1½ and 2. */
export function amountChips(food) {
  if (food.kind !== 'count') return { fractions: PORTIONS.filter((p) => p.factor < 1).map((p) => p.factor), whole: [1, 1.5, 2], used: [] };
  const used = [...(food.dayTotals || new Map()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([a]) => a).sort((a, b) => a - b);
  const top = used.length ? used[used.length - 1] : 1;
  const rounds = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].filter((r) => r > top && !used.includes(r));
  return { counts: [...used, ...rounds].slice(0, 5), used };
}

/** The tray's line under the chips: which of the counts are his, and when. */
export function usedHint(food) {
  const used = amountChips(food).used || [];
  if (!used.length) return null;
  const when = used.map((a) => food.totalDates?.get(a)).filter(Boolean)
    .map((iso) => { const d = new Date(`${iso}T12:00:00`); return { iso, d: d.getDate(), m: MO[d.getMonth()] }; })
    .sort((a, b) => (a.iso < b.iso ? -1 : 1));
  const nums = used.length === 1 ? `${used[0]} is the count` : `${used.slice(0, -1).join(', ')} and ${used[used.length - 1]} are the counts`;
  if (when.length !== used.length) return `${nums} you have logged in a day`;
  const sameMonth = when.every((w) => w.m === when[0].m);
  const dates = sameMonth
    ? `${when.map((w) => w.d).join(when.length === 2 ? ' and ' : ', ')} ${when[0].m}`
    : when.map((w) => `${w.d} ${w.m}`).join(when.length === 2 ? ' and ' : ', ');
  return `${nums} you logged on ${dates}`;
}

// ---- days -> foods ---------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minOf = (t) => (/^\d{2}:\d{2}$/.test(t || '') ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

/** Names of the dishes in the current rotation, normalised, with and without
 *  a trailing "(version)" so a logged "Lasagna (no cheese)" matches too. */
export function rotationSet(names) {
  const set = new Set();
  for (const n of names || []) {
    const a = normName(n);
    if (a) set.add(a);
    const b = normName(String(n || '').replace(/\s*\([^()]*\)\s*$/, ''));
    if (b) set.add(b);
  }
  return set;
}
const inRotation = (rot, name, base) => rot.has(normName(name)) || rot.has(normName(base))
  || rot.has(normName(String(name || '').replace(/\s*\([^()]*\)\s*$/, '')));

/**
 * buildRelog({ days, rotationNames, now }) -> { foods, days }
 *   days: [{ date, entries: [{ id, name, time, macros, source }] }], any order
 *   foods: one per food, newest first
 *   days:  newest first, each { date, groups: [{ from, to, rows }] }
 */
export function buildRelog({ days = [], rotationNames = [], now = new Date() } = {}) {
  const rot = rotationSet(rotationNames);
  const byKey = new Map();
  const outDays = [];
  const sorted = [...days].filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const day of sorted) {
    let lastTime = null;
    const occs = [];
    (day.entries || []).forEach((e, i) => {
      if (!e?.name || !e.macros) return;
      if (minOf(e.time) != null) lastTime = e.time;
      const pa = parseAmount(e.name);
      if (!pa.base || inRotation(rot, e.name, pa.base)) return;
      const key = `${normName(pa.base)}|${pa.kind}${pa.kind === 'count' ? `|${pa.unit}` : ''}`;
      const at = `${day.date} ${minOf(e.time) != null ? e.time : (lastTime || '00:00')} ${String(i).padStart(4, '0')}`;
      const m = { p: num(e.macros.p), c: num(e.macros.c), f: num(e.macros.f), kcal: num(e.macros.kcal) };
      const occ = { id: e.id, date: day.date, time: minOf(e.time) != null ? e.time : null, at, amount: pa.amount, macros: m, key };
      occs.push(occ);
      let food = byKey.get(key);
      if (!food) {
        food = { key, base: pa.base, kind: pa.kind, unit: pa.unit, sep: pa.sep, count: 0, last: null, occ: [], dayTotals: new Map(), totalDates: new Map(), oneAtATime: false, unitMacros: null };
        byKey.set(key, food);
      }
      food.count += 1;
      food.occ.push(occ);
      if (!food.last || at > food.last.at) {
        food.last = occ;
        const a = pa.amount || 1;
        food.unitMacros = { p: m.p / a, c: m.c / a, f: m.f / a, kcal: m.kcal / a };
        food.base = pa.base; food.sep = pa.sep;
      }
    });
    if (!occs.length) continue;
    // per-day totals, for a count food's "counts you use"
    const perDay = new Map();
    const ones = new Map();
    for (const o of occs) {
      perDay.set(o.key, (perDay.get(o.key) || 0) + o.amount);
      if (Math.abs(o.amount - 1) < 1e-9) ones.set(o.key, (ones.get(o.key) || 0) + 1);
    }
    for (const [k, total] of perDay) {
      const f = byKey.get(k);
      if (f.kind !== 'count') continue;
      f.dayTotals.set(total, (f.dayTotals.get(total) || 0) + 1);
      if (!f.totalDates.has(total)) f.totalDates.set(total, day.date); // days run newest first
      // three or more single units in a day: he logs it one at a time
      if ((ones.get(k) || 0) >= 3) f.oneAtATime = true;
    }
    outDays.push({ date: day.date, occs });
  }
  const foods = [...byKey.values()].sort((a, b) => (a.last.at < b.last.at ? 1 : a.last.at > b.last.at ? -1 : b.count - a.count));

  // days into groups and rows
  const daysOut = outDays.map(({ date, occs }) => {
    const ordered = [...occs].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const groups = [];
    for (const o of ordered) {
      const g = groups[groups.length - 1];
      const m = minOf(o.time);
      const gm = g ? minOf(g.to) : null;
      if (g && m != null && gm != null && m - gm <= GROUP_GAP_MIN) { g.items.push(o); g.to = o.time; }
      else if (g && m == null && g.untimed) g.items.push(o);
      else groups.push({ from: o.time, to: o.time, untimed: m == null, items: [o] });
    }
    return {
      date,
      groups: groups.map((g) => {
        const rows = [];
        const at = new Map();
        for (const o of g.items) {
          const r = at.get(o.key);
          if (r) { r.amount += o.amount; r.entries += 1; r.macros = addM(r.macros, o.macros); continue; }
          const row = { key: o.key, food: byKey.get(o.key), amount: o.amount, entries: 1, time: o.time, macros: { ...o.macros }, id: o.id };
          at.set(o.key, row);
          rows.push(row);
        }
        return { from: g.from, to: g.to, untimed: g.untimed, rows };
      }).reverse(), // newest group first, as the day reads down
    };
  });
  return { foods, days: daysOut, today: isoDay(now) };
}
const addM = (a, b) => ({ p: a.p + b.p, c: a.c + b.c, f: a.f + b.f, kcal: a.kcal + b.kcal });

/** The six he logs most, from the last six weeks. */
export function regulars(foods, now = new Date(), n = REGULARS) {
  const since = isoDay(new Date(now.getTime() - REGULAR_DAYS * 86400000));
  return foods
    .map((f) => ({ f, c: f.occ.filter((o) => o.date >= since).length }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c || (a.f.last.at < b.f.last.at ? 1 : -1))
    .slice(0, n)
    .map((x) => ({ food: x.f, count: x.c }));
}

/** "Usual now": logged within an hour of this clock time on at least two
 *  different days (twice this morning is not a habit, it is this morning). */
export function usualNow(food, now = new Date()) {
  const n = now.getHours() * 60 + now.getMinutes();
  const days = new Set();
  for (const o of food.occ) {
    const m = minOf(o.time);
    if (m == null) continue;
    const d = Math.abs(m - n);
    if (Math.min(d, 1440 - d) <= USUAL_WINDOW_MIN) days.add(o.date);
  }
  return days.size >= 2;
}

/** Search: anywhere in a word, newest first. */
export function searchFoods(foods, q) {
  const t = normName(q);
  if (!t) return [];
  return foods.filter((f) => normName(f.base).includes(t));
}

/** Where the typed text sits in a name, for the highlight. */
export function matchSpan(name, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return null;
  const i = String(name).toLowerCase().indexOf(t);
  return i < 0 ? null : [i, i + t.length];
}

// ---- words for when ----------------------------------------------------------
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dOf = (iso) => new Date(`${iso}T12:00:00`);
const daysAgo = (iso, today) => Math.round((dOf(today) - dOf(iso)) / 86400000);

/** A rail card's when: "Today 22:02", "Yest. 22:21", "Sun 17:14", "30 Oct". */
export function whenShort(occ, today) {
  const ago = daysAgo(occ.date, today);
  const t = occ.time ? ` ${occ.time}` : '';
  if (ago <= 0) return `Today${t}`;
  if (ago === 1) return `Yest.${t}`;
  if (ago < 7) return `${WD[dOf(occ.date).getDay()]}${t}`;
  const d = dOf(occ.date);
  return `${d.getDate()} ${MO[d.getMonth()]}`;
}
/** A search row's when, no clock: "Today", "Yest.", "30 Oct". */
export function whenDay(iso, today) {
  const ago = daysAgo(iso, today);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yest.';
  const d = dOf(iso);
  return `${d.getDate()} ${MO[d.getMonth()]}`;
}
/** A day section's heading and its date. */
export function dayHeading(iso, today) {
  const ago = daysAgo(iso, today);
  const d = dOf(iso);
  const date = `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
  if (ago <= 0) return { label: 'Today', date };
  if (ago === 1) return { label: 'Yesterday', date };
  if (ago < 7) return { label: WDL[d.getDay()], date: `${d.getDate()} ${MO[d.getMonth()]}` };
  return { label: date, date: '' };
}

/** What a log at this amount writes. At the amount it was last logged the
 *  macros are that entry's own, to the decimal; any other amount scales. */
export function logPayload(food, amt, exact = null) {
  const same = exact && Math.abs(exact.amount - amt) < 1e-9;
  const lastSame = !same && food.last && Math.abs(food.last.amount - amt) < 1e-9;
  return {
    name: amountName(food, amt),
    macros: same ? { ...exact.macros } : lastSame ? { ...food.last.macros } : amountMacros(food, amt),
  };
}

// one build per (days, rotation) pair: the view model is rebuilt on every app
// render, and ninety days of folding is not work to repeat for nothing
let memo = { days: null, rot: '', hour: -1, out: null };
export function relogMemo(days, rotationNames, now = new Date()) {
  const rot = (rotationNames || []).join('\u0001');
  const hour = now.getDate() * 100 + now.getHours();
  if (memo.days === days && memo.rot === rot && memo.hour === hour) return memo.out;
  const out = buildRelog({ days: days || [], rotationNames, now });
  out.regulars = regulars(out.foods, now);
  memo = { days, rot, hour, out };
  return out;
}

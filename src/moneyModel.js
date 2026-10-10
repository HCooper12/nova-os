// THE MONEY PAGE'S VIEW MODEL, by code (mockups 85 and 90; built 10 Oct 2026).
//
// Pure: the month summary the server computed (GET /api/money), the money
// records waiting on him, and nothing else in; every figure, sentence and
// mark the page draws out. The screen adds nothing up and words nothing.
// Dates come from the summary's own `today`, so a demo month and a pinned
// test read the same as his phone.
//
// Colour means one thing here (NOVA-METHOD §2b rule 8): every spending
// category owns one house hue, on its donut arc, legend pill, capsule,
// calendar coin and monogram. Over budget is SHAPE and WORDS (a hatched tab
// and "$38 over"), never red: red is Nova pushing back (his 4 Oct rule).

import { partsOf } from './moneyParts.js';

export const CATS = {
  Groceries: { key: 'gro', label: 'Groceries', hue: 'var(--nv-m-back)' },
  'Eating Out': { key: 'eat', label: 'Eating out', hue: 'var(--nv-or)' },
  Transport: { key: 'tra', label: 'Transport', hue: 'var(--nv-m-quads)' },
  Shopping: { key: 'sho', label: 'Shopping', hue: 'var(--nv-m-triceps)' },
  Subscriptions: { key: 'sub', label: 'Subscriptions', hue: 'var(--nv-m-glutes)' },
  'Health & Fitness': { key: 'hea', label: 'Health & fitness', hue: 'var(--nv-m-mobility)' },
  'Utilities & Bills': { key: 'uti', label: 'Utilities & bills', hue: 'var(--nv-m-calves)' },
  Entertainment: { key: 'ent', label: 'Entertainment', hue: 'var(--nv-m-abs)' },
  Other: { key: 'oth', label: 'Other', hue: 'color-mix(in srgb, var(--nv-ink) 55%, transparent)', ink: true },
  Income: { key: 'inc', label: 'Money in', hue: 'var(--nv-ink)', ink: true },
};
export const SPEND_ORDER = ['Groceries', 'Eating Out', 'Transport', 'Shopping', 'Subscriptions', 'Health & Fitness', 'Utilities & Bills', 'Entertainment', 'Other'];
export const catOf = (c) => CATS[c] || CATS.Other;

/* ------------------------------------------------------------- words -- */

const AUD0 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const AUD2 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "$1,391" / "$1,391.20"; never a minus (the sign is said by the caller)
export const usd = (n) => `$${AUD0.format(Math.round(Math.abs(Number(n) || 0)))}`;
export const usd2 = (n) => `$${AUD2.format(Math.abs(Number(n) || 0))}`;
// "$18" when whole, "$18.99" when not
export const usdq = (n) => (Math.abs(Math.round(n * 100)) % 100 === 0 ? usd(n) : usd2(n));
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (n) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pad = (n) => String(n).padStart(2, '0');

const parse = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d || 1)); };
const isoOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (iso, k) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + k); return isoOf(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const fmtUTC = (opts) => new Intl.DateTimeFormat('en-AU', { ...opts, timeZone: 'UTC' });
const F_MONTH_YEAR = fmtUTC({ month: 'long', year: 'numeric' });
const F_MONTH = fmtUTC({ month: 'long' });
const F_MONTH_SHORT = { format: (d) => F_MONTH.format(d).slice(0, 3) }; // "Sep", never en-AU's "Sept"
const F_WEEKDAY = fmtUTC({ weekday: 'long' });
const F_DAY_MONTH = fmtUTC({ day: 'numeric', month: 'long' });
export const monthYear = (ym) => (ym ? F_MONTH_YEAR.format(parse(`${ym}-15`)) : '');
export const monthName = (ym) => (ym ? F_MONTH.format(parse(`${ym}-15`)) : '');
const weekday = (iso) => F_WEEKDAY.format(parse(iso));
const dayMonth = (iso) => F_DAY_MONTH.format(parse(iso));
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// "Today" / "Yesterday" / "Friday 23 October"
export function dayLabel(iso, today) {
  const d = daysBetween(iso, today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${weekday(iso)} ${dayMonth(iso)}`;
}

// the first letter he would read, by grapheme (an emoji-first name, an accent)
export function initialOf(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  try {
    if (typeof Intl.Segmenter === 'function') {
      for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)) {
        if (/[\p{L}\p{N}]/u.test(segment)) return segment.toUpperCase();
      }
    }
  } catch { /* fall through */ }
  const m = s.match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : s[0];
}

// the server's merchantKey (lib/money.js), the same normalising: what makes
// "DEMO CORNER STORE" and "Demo Corner Store" one merchant
export const merchantKey = (m) => String(m || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(pty|ltd|au|com|www|pay|payment)\b/g, '').trim();

// THE MERCHANT SWITCH'S COUNT (his call 10 Oct 2026, "every last purchase
// too"): from the merchant's other lines by category (GET .../merchant, or
// the demo's own list), how many a move to `target` would change. The
// server moves exactly these: same direction, not already there, not split.
export function merchantMoveCount(info, target) {
  if (!info || !info.byCategory) return null;
  let n = 0;
  for (const [c, k] of Object.entries(info.byCategory)) if (c !== target) n += k;
  return { moves: n, split: info.split || 0 };
}

// the switch's small line, in words that are true before he saves
export function merchantSwitchWords(on, count) {
  if (!on) return 'Off: only this line changes';
  if (!count) return 'On: past and future lines from it follow';
  const keep = !count.split ? '' : count.split === 1 ? ' One split line keeps its parts.' : ` ${count.split} split lines keep their parts.`;
  if (!count.moves) return `On: no past lines to move; future ones follow.${keep}`;
  return `On: moves ${count.moves === 1 ? '1 past line' : `${count.moves.toLocaleString('en-AU')} past lines`} too, and future ones follow.${keep}`;
}

/* ---------------------------------------------------------- cadences -- */

const CAD_DAYS = { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, yearly: 365 };
const CAD_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const CAD_WORD = { weekly: 'weekly', fortnightly: 'every 2 weeks', monthly: 'monthly', quarterly: 'every 3 months', yearly: 'yearly' };
const CAD_UNIT = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month', quarterly: 'quarter', yearly: 'year' };
// the server's addCadence (lib/money.js), the same arithmetic
export function addCadence(iso, cadence, k = 1) {
  const months = CAD_MONTHS[cadence];
  if (!months) return addDays(iso, (CAD_DAYS[cadence] || 30) * k);
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + months * k;
  const ty = y + Math.floor(total / 12), tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}

/* ------------------------------------------------------------ the view -- */

// `money`: GET /api/money; `records`: inbox records (only kind money and
// money-import are read); `offline`, `loading`, `demo` flags.
export function buildMoneyView({ money, records = [], offline = false, demo = false } = {}) {
  if (!money) {
    return { state: offline ? 'offline-empty' : 'loading', offline, demo, readOnly: true };
  }
  const today = money.today || isoOf(new Date());
  const isCurrent = money.isCurrent !== false && money.month === today.slice(0, 7);
  const asOf = Number(money.asOfDay ?? (isCurrent ? Number(today.slice(8, 10)) : money.daysInMonth)) || 0;
  const days = Number(money.daysInMonth) || 30;
  const daysLeft = isCurrent ? Math.max(0, days - asOf) : 0;
  const cats = (money.byCategory || []).filter((c) => c.category !== 'Income');
  const byCat = new Map(cats.map((c) => [c.category, c]));
  const spent = Number(money.spent) || 0;
  const budgeted = cats.filter((c) => c.budget > 0);
  const totalBudget = budgeted.reduce((n, c) => n + c.budget, 0);
  const budgetedSpent = budgeted.reduce((n, c) => n + c.spent, 0);
  const txns = money.transactions || [];
  const mName = monthName(money.month);
  const prevName = monthName(money.prevMonth);
  const pending = records.filter((r) => r && r.status === 'pending');
  const events = pending.filter((r) => r.kind === 'money').map((r) => ({ id: r.id, ...(r.event || r.decision?.payload?.event || {}), title: r.event?.title || r.text }));

  const over = SPEND_ORDER.map((c) => byCat.get(c)).filter((c) => c && c.budget > 0 && c.spent > c.budget)
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  const pace = totalBudget ? totalBudget * asOf / days : null;

  // ---- the news line, by code ----
  const news = [];
  const say = (text, hue) => news.push(hue ? { text, hue } : { text });
  const overWords = () => {
    if (!over.length) return;
    if (over.length === 1) { say(catOf(over[0].category).label, catOf(over[0].category).hue); say(` is ${usd(over[0].spent - over[0].budget)} over.`); return; }
    over.slice(0, 2).forEach((c, i) => { if (i) say(over.length > 2 ? ', ' : ' and '); say(catOf(c.category).label, catOf(c.category).hue); });
    say(over.length > 2 ? ` and ${over.length - 2} more are over.` : ' are over.');
  };
  if (!txns.length) {
    say(isCurrent ? `Nothing filed for ${mName} yet.` : `Nothing was filed for ${mName}.`);
  } else if (isCurrent) {
    say(`${usd(spent)} spent ${daysLeft === 0 ? 'on the last day of the month' : `with ${countWord(daysLeft)} ${daysLeft === 1 ? 'day' : 'days'} left`}.`);
    if (pace != null) {
      const under = spent <= pace;
      say(` ${under ? 'Under' : 'Over'} pace overall${over.length ? `, ${under ? 'but' : 'and'} ` : '.'}`);
      overWords();
    } else if (money.prevSpentToDay) {
      const d = spent - money.prevSpentToDay;
      say(` ${usd(Math.abs(d))} ${d <= 0 ? 'less' : 'more'} than ${prevName} by this day.`);
    }
  } else {
    say(`${usd(spent)} spent in ${mName}.`);
    if (over.length) { say(' '); overWords(); }
  }

  // ---- the hero ----
  let at = 0;
  const denom = Math.max(totalBudget, spent) || 1;
  const arcs = SPEND_ORDER.map((c) => byCat.get(c)).filter((c) => c && c.spent > 0).map((c) => {
    const frac = c.spent / denom;
    const arc = { key: catOf(c.category).key, hue: catOf(c.category).hue, start: at, frac, label: catOf(c.category).label };
    at += frac;
    return arc;
  });
  const left = totalBudget ? totalBudget - spent : null;
  const hero = {
    spent,
    totalBudget: totalBudget || null,
    arcs,
    tickFrac: isCurrent && totalBudget ? asOf / days : null,
    label: isCurrent ? (totalBudget ? (left >= 0 ? 'Left to spend' : 'Past the budgets') : 'Spent so far') : `Spent in ${mName}`,
    big: isCurrent && totalBudget ? Math.abs(left) : spent,
    perDay: isCurrent && totalBudget && left > 0 && daysLeft ? left / daysLeft : null,
    daysLeft,
    paceDelta: isCurrent && pace != null ? pace - spent : null,
    paceAt: pace,
    noBudgets: !totalBudget,
  };
  hero.lines = [];
  if (hero.perDay != null) hero.lines.push([{ text: 'About ' }, { text: `${usd(hero.perDay)} a day`, b: true }, { text: ` for the ${plural(daysLeft, 'day')} left` }]);
  else if (isCurrent && totalBudget && left < 0) hero.lines.push([{ text: 'Against ' }, { text: usd(totalBudget), b: true }, { text: ' of budgets' }]);
  if (hero.paceDelta != null) hero.lines.push([{ text: `${hero.paceDelta >= 0 ? 'Under' : 'Over'} today’s pace by ` }, { text: usd(Math.abs(hero.paceDelta)), b: true }, { text: ', the white tick' }]);
  if (!totalBudget && txns.length) hero.lines.push([{ text: 'No budgets set. Tap a category below to give it one.' }]);
  if (!isCurrent && totalBudget) hero.lines.push([{ text: `Against ${usd(totalBudget)} of budgets` }]);
  const legend = arcs.map((a) => ({ key: a.key, label: a.label, hue: a.hue, ink: a.key === 'oth' }));

  // ---- the two tiles ----
  const incomes = txns.filter((t) => t.amount > 0);
  const moneyIn = {
    amount: Number(money.income) || 0,
    count: money.incomeCount ?? incomes.length,
    sub: incomes.length
      ? `${plural(incomes.length, 'payment')}${incomes.length === 1 ? `, ${daysBetween(incomes[0].date, today) < 7 && isCurrent ? weekday(incomes[0].date) : dayMonth(incomes[0].date)}` : ''}`
      : 'Nothing yet',
  };
  const prevTo = Number(money.prevSpentToDay ?? money.prevSpent) || 0;
  const against = prevTo > 0 ? {
    prevName,
    pct: Math.round(((spent - prevTo) / prevTo) * 100),
    diff: spent - prevTo,
    words: `${usd(Math.abs(spent - prevTo))} ${spent <= prevTo ? 'less' : 'more'}`,
    bars: { prev: prevTo, cur: spent, max: Math.max(prevTo, spent) },
    asOf,
  } : null;

  // ---- the pace card and its compare ----
  const cum = (arr, n) => { const out = []; let s = 0; for (let i = 0; i < n; i++) { s += Number(arr?.[i]) || 0; out.push(Math.round(s * 100) / 100); } return out; };
  const curCum = cum(money.daily, isCurrent ? asOf : days);
  const prevDays = Number(money.daysInPrev) || (money.prevDaily || []).length || 30;
  const prevCum = cum(money.prevDaily, prevDays);
  const prevEnd = prevCum[prevCum.length - 1] || Number(money.prevSpent) || 0;
  const paceCard = {
    title: isCurrent ? `${mName} so far` : mName,
    dayLabel: isCurrent ? `day ${asOf} of ${days}` : `${days} days`,
    days, asOf: isCurrent ? asOf : days,
    cur: curCum, prev: prevCum, prevEnd, prevName,
    budget: totalBudget || null,
    max: Math.max(totalBudget || 0, spent, prevEnd, 1),
    spent,
    axis: [`1 ${F_MONTH_SHORT.format(parse(`${money.month}-15`))}`, '15', String(days)],
    hasPrev: prevCum.some((v) => v > 0),
  };
  const moves = SPEND_ORDER.map((c) => byCat.get(c)).filter(Boolean).map((c) => ({
    category: c.category, d: Math.round(((c.spent || 0) - (c.prevToDay ?? c.prev ?? 0)) * 100) / 100,
    prev: c.prevToDay ?? c.prev ?? 0, visits: c.visits ?? null, prevVisits: c.prevVisitsToDay ?? null,
  })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const top = moves[0];
  let compareSay;
  if (!top || Math.abs(top.d) < 40 || Math.abs(top.d) < top.prev / 5) {
    compareSay = [{ text: `No one category moved much against ${prevName} ${isCurrent ? 'by this day' : 'over the month'}.` }];
  } else {
    const meta = catOf(top.category);
    compareSay = [{ text: meta.label, hue: meta.hue }, { text: ` is the change worth saying: ${usd(Math.abs(top.d))} ${top.d > 0 ? 'more' : 'less'} than ${isCurrent ? 'by this day in' : 'in'} ${prevName}` }];
    if (top.visits != null && top.prevVisits != null && top.visits !== top.prevVisits) compareSay.push({ text: ', ' }, { text: `${top.visits} visits against ${top.prevVisits}`, i: true });
    compareSay.push({ text: '.' });
  }
  const shown = moves.filter((m) => Math.abs(m.d) >= 10);
  const maxMove = Math.max(1, ...shown.map((m) => Math.abs(m.d)));
  const compare = {
    say: compareSay,
    rows: shown.map((m) => ({ key: catOf(m.category).key, label: catOf(m.category).label, hue: catOf(m.category).hue, d: m.d, w: Math.abs(m.d) / maxMove * 46 })),
    rule: `${isCurrent ? `By the ${ordinal(asOf)} of each month.` : 'Whole months.'} ${moves.length - shown.length ? `${countWord(moves.length - shown.length).replace(/^./, (c) => c.toUpperCase())} ${moves.length - shown.length === 1 ? 'category' : 'categories'} moved less than $10 and ${moves.length - shown.length === 1 ? 'is' : 'are'} left off. ` : ''}The sentence is code’s: it names the category that moved most, and only when it moved by $40 and by a fifth of itself.`,
  };

  // ---- budgets ----
  const budgetRows = budgeted.map((c) => {
    const meta = catOf(c.category);
    const r = c.spent / c.budget;
    return {
      category: c.category, key: meta.key, label: meta.label, hue: meta.hue,
      spent: c.spent, budget: c.budget, ratio: r, over: r > 1 ? c.spent - c.budget : 0,
      fill: Math.min(r, 1), overW: r > 1 ? Math.min(0.22, Math.max(0.035, r - 1)) * 80 : 0,
      history: c.history || null,
    };
  }).sort((a, b) => ((b.over > 0) - (a.over > 0)) || (b.ratio - a.ratio));
  const unbudgeted = SPEND_ORDER.map((c) => byCat.get(c)).filter((c) => c && !(c.budget > 0) && c.spent > 0);
  const budgets = {
    head: totalBudget ? `${usd(budgetedSpent)} of ${usd(totalBudget)}` : 'none set',
    rows: budgetRows,
    noBudget: unbudgeted.length ? {
      names: unbudgeted.map((c) => catOf(c.category).label),
      categories: unbudgeted.map((c) => c.category),
      total: unbudgeted.reduce((n, c) => n + c.spent, 0),
    } : null,
    // every category, for the sheet opened from "No budget yet" or an empty month
    all: SPEND_ORDER.map((c) => ({ category: c, ...catOf(c), budget: byCat.get(c)?.budget || null, history: byCat.get(c)?.history || [0, 0, byCat.get(c)?.spent || 0] })),
  };

  // ---- price watch: a rise waiting on him ----
  const subs = money.subscriptions || [];
  const riseRec = events.find((e) => e.type === 'price-rise');
  let rise = null;
  if (riseRec) {
    const sub = subs.find((s) => s.merchant === riseRec.merchant) || null;
    const hist = (sub?.history || []).slice(-6);
    const max = Math.max(riseRec.to, ...hist.map((h) => h.amount));
    const bars = (hist.length >= 2 ? hist : [{ date: riseRec.on, amount: riseRec.from }, { date: riseRec.on, amount: riseRec.to }]).map((h, i, a) => {
      const hh = Math.max(8, Math.round(65 * h.amount / max));
      const isNow = i === a.length - 1;
      const prevH = isNow && i > 0 ? Math.max(8, Math.round(65 * a[i - 1].amount / max)) : hh;
      return { h: hh, up: isNow ? Math.max(0, hh - prevH) : 0, now: isNow, label: F_MONTH_SHORT.format(parse(h.date)) };
    });
    const unit = CAD_UNIT[riseRec.cadence] || 'charge';
    const step = riseRec.to - riseRec.from;
    const perYear = riseRec.cadence === 'weekly' ? step * 52 : riseRec.cadence === 'fortnightly' ? step * 26 : riseRec.cadence === 'quarterly' ? step * 4 : riseRec.cadence === 'yearly' ? step : step * 12;
    const subCat = byCat.get(sub?.category || riseRec.category || '');
    const tipped = subCat && subCat.budget && subCat.spent > subCat.budget && subCat.spent - step <= subCat.budget;
    rise = {
      id: riseRec.id, merchant: riseRec.merchant,
      say: `${riseRec.merchant} is now ${usd2(riseRec.to)} a ${unit}.`,
      bars,
      sub: `Up ${usd2(step)} a ${unit}, ${usdq(perYear)} a year.${tipped ? ` It tipped ${catOf(subCat.category).label} ${usd(subCat.spent - subCat.budget)} over its budget.` : ''}`,
      talk: `Let's talk about this money alert: “${riseRec.title}” Should I keep it?`,
      noLabel: `Don’t keep it: put Cancel ${riseRec.merchant} on To-Do before its next charge`,
    };
  }

  // ---- coming up: the calendar and the bills, with how sure each is ----
  const dow = (parse(today).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -dow);
  const cells = [];
  const coinsAt = new Map();
  const winAt = new Map();
  const end = addDays(start, 34);
  for (const s of subs) {
    if (!s.nextExpected) continue;
    const meta = catOf(s.category || 'Subscriptions');
    const kind = s.confidence?.kind || 'guess';
    let d = s.nextExpected;
    let k = 0;
    while (d <= end && k < 8) {
      if (d >= start) {
        if (!coinsAt.has(d)) coinsAt.set(d, []);
        coinsAt.get(d).push({ hue: meta.hue, size: Math.round(9 + Math.min(9, s.amount / 22)), guess: kind === 'guess', name: s.merchant });
        if (kind === 'likely' && s.confidence.window) {
          for (let w = -s.confidence.window; w <= s.confidence.window; w++) {
            const x = addDays(d, w);
            winAt.set(x, { hue: meta.hue, edge: w === -s.confidence.window ? 'start' : w === s.confidence.window ? 'end' : null });
          }
        }
      }
      k++;
      d = addCadence(s.nextExpected, s.cadence, k);
    }
  }
  for (let i = 0; i < 35; i++) {
    const iso = addDays(start, i);
    const dd = Number(iso.slice(8, 10));
    cells.push({
      iso, day: dd === 1 ? F_MONTH_SHORT.format(parse(iso)) : String(dd),
      past: iso < today, today: iso === today, otherMonth: iso.slice(0, 7) !== today.slice(0, 7),
      coins: coinsAt.get(iso) || [], win: winAt.get(iso) || null,
    });
  }
  const billRow = (s) => {
    const meta = catOf(s.category || 'Subscriptions');
    const kind = s.confidence?.kind || 'guess';
    const dIn = daysBetween(today, s.nextExpected);
    const datePart = dIn >= 0 && dIn < 7 ? (dIn === 0 ? 'Today' : dIn === 1 ? 'Tomorrow' : weekday(s.nextExpected)) : dayMonth(s.nextExpected);
    const when = kind === 'likely' ? `About ${dIn >= 0 && dIn < 7 ? datePart.toLowerCase() : datePart}` : kind === 'guess' ? `${datePart}?` : datePart;
    const due = events.find((e) => e.type === 'bill-due' && e.merchant === s.merchant);
    return {
      key: s.key || s.merchant, name: s.merchant, initial: initialOf(s.merchant), hue: meta.hue,
      when: `${when} · ${CAD_WORD[s.cadence] || s.cadence}`, amount: s.amount,
      kind, word: s.confidence?.word || 'A guess', offsets: s.confidence?.offsets || [0, 0], said: s.confidence?.said || '',
      soon: dIn >= 0 && dIn <= 3, dueEvent: due ? due.id : null,
    };
  };
  const upcoming = [...subs].filter((s) => s.nextExpected >= today).sort((a, b) => (a.nextExpected < b.nextExpected ? -1 : 1));
  const perMonth = subs.reduce((n, s) => n + (Number(s.perMonth) || 0), 0);
  const coming = subs.length ? {
    sub: 'how sure, from each one’s history',
    perMonth: `${usd(perMonth)} a month · ${usd(perMonth * 12 / 52)} a week`,
    cells,
    label: `Recurring charges over the next five weeks: ${upcoming.slice(0, 6).map((s) => `${s.merchant} ${dayMonth(s.nextExpected)} (${(s.confidence?.word || 'a guess').toLowerCase()})`).join(', ')}`,
    bills: upcoming.slice(0, 3).map(billRow),
    all: [...subs].sort((a, b) => (a.nextExpected < b.nextExpected ? -1 : 1)).map(billRow),
    count: subs.length,
  } : null;

  // ---- latest, and every line ----
  const unusualByTxn = new Map(events.filter((e) => e.type === 'unusual').map((e) => [e.id, e]));
  const risenOn = new Map(subs.filter((s) => s.priceRise).map((s) => [`${s.merchant}|${s.priceRise.on || s.lastDate}`, s.priceRise]));
  const sorted = [...txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.addedAt || '').localeCompare(String(a.addedAt || ''))));
  const row = (t) => {
    const incoming = t.amount > 0;
    const isIncome = incoming && (t.category === 'Income' || !t.category);
    const meta = isIncome ? CATS.Income : catOf(t.category);
    const r = risenOn.get(`${t.merchant}|${t.date}`);
    const odd = unusualByTxn.get(t.id) || null;
    const from = t.source === 'import' ? 'From a bank export' : t.source === 'scan' ? 'From a receipt scan' : t.source === 'capture' ? 'Captured by you' : 'Typed by you';
    // a split line: both parts, each in its category's hue (mockup 90, Line)
    const ps = partsOf(t);
    const split = ps.length > 1 ? ps.map((p) => ({ category: p.category, label: catOf(p.category).label, hue: catOf(p.category).hue, amount: p.amount, amountLabel: usd2(p.amount) })) : null;
    return {
      id: t.id, date: t.date, name: t.merchant, initial: initialOf(t.merchant),
      category: isIncome ? 'Income' : (t.category || 'Other'),
      catLabel: split ? split.map((p) => p.label).join(' + ') : incoming && !isIncome ? `${meta.label} · refund` : meta.label,
      split,
      hue: meta.hue, ink: !!meta.ink, income: isIncome, incoming,
      amount: t.amount, amountLabel: `${incoming ? '+' : ''}${usd2(t.amount)}`,
      note: t.note || null,
      up: r ? `up ${usdq(r.to - r.from)}` : null,
      odd: odd ? { id: odd.id, ratio: odd.ratio, word: `${odd.ratio}x usual`, talk: `Let's talk about this money alert: “${odd.title}” Is it right?` } : null,
      where: dayLabel(t.date, today), from,
      source: t.source || 'manual',
      // an import line's own category from its file, when it reads differently
      // from where it lands (the import sheet draws "Dining out → Eating out")
      theirs: t.theirs && t.theirs.toLowerCase() !== meta.label.toLowerCase() ? t.theirs : null,
    };
  };
  const groupRows = (list) => {
    const groups = [];
    for (const t of list) {
      let g = groups[groups.length - 1];
      if (!g || g.date !== t.date) { g = { date: t.date, label: dayLabel(t.date, today), rows: [], out: 0, inn: 0 }; groups.push(g); }
      g.rows.push(row(t));
      if (t.amount < 0) g.out += -t.amount; else g.inn += t.amount;
    }
    for (const g of groups) g.total = g.inn ? `${usd2(g.out)} out` : usd2(g.out);
    return groups;
  };
  const LATEST_ROWS = 7;
  const latest = { groups: groupRows(sorted.slice(0, LATEST_ROWS)), count: sorted.length, more: sorted.length > LATEST_ROWS };
  const LIST_CAP = 120;
  const lines = { groups: groupRows(sorted.slice(0, LIST_CAP)), count: sorted.length, capNote: sorted.length > LIST_CAP ? `Showing ${LIST_CAP} of ${sorted.length}. Older lines are in the export.` : null, rows: sorted.map(row) };

  // ---- where lines come from ----
  const src = money.sources || { export: 0, typed: 0, scan: 0 };
  const lastImport = money.lastImportAt ? money.lastImportAt.slice(0, 10) : null;
  const sources = {
    export: src.export || 0, typed: src.typed || 0, scan: src.scan || 0,
    total: (src.export || 0) + (src.typed || 0) + (src.scan || 0),
    note: `Nova checks ${money.importsDir || 'Money/Imports'} every five minutes and asks before filing anything.${lastImport ? ` Last import ${daysBetween(lastImport, today) < 7 ? (daysBetween(lastImport, today) === 0 ? 'today' : daysBetween(lastImport, today) === 1 ? 'yesterday' : weekday(lastImport)) : dayMonth(lastImport)}.` : ''}`,
  };

  // ---- imports waiting on him, and the file Nova cannot read ----
  const importCards = pending.filter((r) => r.kind === 'money-import').map((r) => {
    const list = r.decision?.payload?.transactions || [];
    const dates = list.map((t) => t.date).sort();
    const counts = new Map();
    for (const t of list) { const c = t.amount > 0 && t.category === 'Income' ? 'Income' : (t.category || 'Other'); counts.set(c, (counts.get(c) || 0) + 1); }
    const mix = [...counts].sort((a, b) => b[1] - a[1]);
    const leftOut = Number((/(\d+) already in the ledger/.exec(r.decision?.reason || '') || [])[1] || 0);
    const file = r.decision?.payload?.file || null;
    // where each category came from: a budget app's export carries its own
    // (mapped where the names clearly match, 10 Oct 2026); a bank CSV does not
    const fromTheirs = list.filter((t) => t.categoryFrom === 'theirs').length;
    const fromRule = list.filter((t) => t.categoryFrom === 'rule').length;
    const carried = list.some((t) => t.categoryFrom);
    const guessed = list.length - fromTheirs - fromRule;
    // counts grouped as he reads them: "5,000", never "5000" (break-ui, 10 Oct)
    const g = (k) => AUD0.format(k);
    const whence = !carried ? 'Nova guessed each category from the merchant name.'
      : `Categories: ${[
        fromTheirs ? `${g(fromTheirs)} from the file’s own, where the name matches Nova’s` : null,
        fromRule ? `${g(fromRule)} by your merchant ${fromRule === 1 ? 'rule' : 'rules'}` : null,
        guessed ? `${g(guessed)} guessed by Nova from the merchant name` : null,
      ].filter(Boolean).join('; ')}.`;
    // "into September" only when every line is in September: an export that
    // spans months files each line into its own (break-ui, 10 Oct)
    const oneMonth = dates.length && dates[0].slice(0, 7) === dates[dates.length - 1].slice(0, 7);
    const IMPORT_CAP = 120;
    const shownList = [...list].map((t, i) => ({ ...t, id: t.id || `${r.id}-${i}` })).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, IMPORT_CAP);
    return {
      id: r.id, file,
      say: `${list.length === 1 ? '1 new line' : `${g(list.length)} new lines`} from ${file || 'a statement photo'}.`,
      range: dates.length ? `${Number(dates[0].slice(8))} ${dates[0].slice(0, 7) === dates[dates.length - 1].slice(0, 7) ? '' : `${monthName(dates[0].slice(0, 7))} `}to ${Number(dates[dates.length - 1].slice(8))} ${monthName(dates[dates.length - 1].slice(0, 7))}`.replace(/\s+/g, ' ') : '',
      leftOut,
      preview: mix.map(([c, n]) => ({ hue: catOf(c).hue, n })),
      mixWords: `${mix.slice(0, 3).map(([c, n]) => `${catOf(c).label} ${g(n)}`).join(', ')}${mix.length > 3 ? ` and ${g(list.length - mix.slice(0, 3).reduce((s, [, n]) => s + n, 0))} more` : ''}. ${whence}`,
      // the sheet lists the newest IMPORT_CAP; the count says the rest
      groups: groupRows(shownList),
      capNote: list.length > IMPORT_CAP ? `Showing the newest ${IMPORT_CAP} of ${g(list.length)}. Filing files all of them.` : null,
      count: list.length,
      countLabel: g(list.length),
      monthName: oneMonth ? monthName(dates[0].slice(0, 7)) : '',
      talk: `Let's talk about this import waiting in my Inbox: “${r.decision?.title || r.text}”`,
    };
  });
  const fileCards = events.filter((e) => e.type === 'unreadable-file').map((e) => ({
    id: e.id, file: e.file, say: e.title,
    talk: `Let's talk about this: “${e.title}” What should I do with it?`,
  }));

  // ---- the events, for Home and the Discuss doors ----
  const eventCards = events.filter((e) => e.type !== 'unreadable-file').map((e) => ({
    id: e.id, type: e.type, title: e.title,
    hue: e.category ? catOf(e.category).hue : 'var(--nv-vi)',
    talk: `Let's talk about this money alert: “${e.title}”${e.body ? ` ${e.body}` : ''}`,
  }));

  const readOnly = !!offline;
  return {
    state: txns.length ? 'ready' : 'empty',
    offline, demo, readOnly, isCurrent,
    month: money.month, monthLabel: monthYear(money.month), monthName: mName,
    months: (money.months?.length ? money.months : [money.month]).map((m) => ({ value: m, label: monthYear(m) })),
    news, hero, legend, moneyIn, against, pace: paceCard, compare, budgets, rise, coming,
    latest, lines, sources, importCards, fileCards, events: eventCards,
    categories: SPEND_ORDER.map((c) => ({ category: c, ...catOf(c) })).concat([{ category: 'Income', ...CATS.Income }]),
    corrupt: !!money.corrupt,
  };
}

// The Home moment's words: one line per event, the most urgent first, and
// nothing at all when nothing waits on him.
const RANK = { 'over-budget': 0, 'bill-due': 1, 'price-rise': 2, unusual: 3 };
export function moneyMoment(records = []) {
  const list = records.filter((r) => r && r.kind === 'money' && r.status === 'pending' && (r.event?.type || r.decision?.payload?.event?.type) !== 'unreadable-file')
    .map((r) => { const e = r.event || r.decision?.payload?.event || {}; return { id: r.id, type: e.type, title: e.title || r.text, body: e.body || '', category: e.category || null }; })
    .sort((a, b) => (RANK[a.type] ?? 9) - (RANK[b.type] ?? 9));
  if (!list.length) return null;
  return {
    count: list.length,
    items: list.slice(0, 2).map((e) => ({ ...e, hue: e.category ? catOf(e.category).hue : 'var(--nv-vi)' })),
    more: Math.max(0, list.length - 2),
    talk: list.length === 1
      ? `Let's talk about this money alert: “${list[0].title}”${list[0].body ? ` ${list[0].body}` : ''}`
      : `Let's talk about my money alerts: ${list.slice(0, 4).map((e) => `“${e.title}”`).join(' ')} What matters most here?`,
    ids: list.map((e) => e.id),
  };
}

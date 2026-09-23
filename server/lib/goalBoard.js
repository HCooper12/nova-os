// THE GOAL BOARD — his three daily numbers, judged by code (his ask, 23 Sep
// 2026): "Coach should be tracking my goals … more specific and measurable
// goals that it is referring to and that can be seen at a glance. This
// includes my step count, protein intake and caloric intake."
//
// What was true before this file: the calorie target and protein floor lived
// in the recipes collection's frontmatter (the Intake's numbers), the step
// goal was a constant in two places, and the Coach's prompt saw protein
// adherence only — never calories against their target, never steps at all.
// The Goals card showed a sentence.
//
// So: ONE record, computed here from the real logs, that every reader shares
// — the Goals card draws it, the Coach and Ask Nova read it as text, the
// cadence engine turns its `nudges` into the prompts he asked for. Models
// interpret it; nothing in here is a model. Missing data is a hole (`today:
// null`, state `absent`), never a zero that reads as a bad day.
//
// Targets, in precedence: what he typed on the Goals card (frontmatter
// stepsTarget / proteinTarget / kcalTarget) → the Intake's numbers on the
// recipes collection (proteinFloorG / targetKcal) → the house default for
// steps only (10,000, the same constant streaks.js counts by). Each carries
// its `source` so the card can say "default — set your own" honestly.

import { getFitnessGoals } from './fitnessGoals.js';
import { STEP_GOAL } from './streaks.js';
import { localDateISO } from './localDate.js';

// the waking day the pace is measured against: a floor met by 22:00 is met
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 22;

export const METRICS = [
  // atLeast: more is the point. near: the target is a target, over is over.
  { key: 'steps', label: 'Steps', unit: '', mode: 'atLeast' },
  { key: 'protein', label: 'Protein', unit: 'g', mode: 'atLeast' },
  { key: 'kcal', label: 'Calories', unit: 'kcal', mode: 'near' },
];

// How far through the waking day we are, 0..1 — the fraction of the target
// a steady day would have banked by now. Pure so the tests can set the clock.
export function dayFraction(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  return Math.max(0, Math.min(1, (h - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)));
}

// Resolve the three targets from what exists. `goals` is the Fitness Goals
// page, `profile` the recipes-collection numbers (either may be null).
export function resolveTargets(goals, profile) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const pick = (own, intake, fallback) => {
    if (num(own)) return { value: num(own), source: 'goals' };
    if (num(intake)) return { value: num(intake), source: 'intake' };
    if (fallback) return { value: fallback, source: 'default' };
    return { value: null, source: null };
  };
  return {
    steps: pick(goals?.stepsTarget, null, STEP_GOAL),
    protein: pick(goals?.proteinTarget, profile?.proteinFloorG, null),
    kcal: pick(goals?.kcalTarget, profile?.targetKcal, null),
  };
}

// One metric judged for one day. `value` null is a hole. Returns the state
// the RingTile speaks (good / behind / missed / absent) plus `met`, which is
// the day's verdict once the day is over and the pace verdict until then.
export function judge(metric, value, target, { fraction = 1, dayOver = true } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return { state: 'absent', met: null, pct: null, expected: null };
  if (!target) return { state: 'absent', met: null, pct: null, expected: null };
  const v = Number(value);
  const pct = Math.round((v / target) * 100);
  if (metric.mode === 'near') {
    // calories: under the line is fine while the day runs; over it is over
    const over = v > target * 1.1;
    const expected = Math.round(target * fraction);
    if (over) return { state: 'missed', met: false, pct, expected, over: Math.round(v - target) };
    if (dayOver) return { state: v >= target * 0.8 ? 'good' : 'behind', met: v >= target * 0.8, pct, expected };
    return { state: 'good', met: true, pct, expected };
  }
  const expected = Math.round(target * fraction);
  if (v >= target) return { state: 'good', met: true, pct, expected };
  if (dayOver) return { state: 'missed', met: false, pct, expected };
  // on pace is good; more than 15% behind the steady line is behind
  const onPace = v >= expected * 0.85;
  return { state: onPace ? 'good' : 'behind', met: onPace, pct, expected, short: Math.round(target - v) };
}

// The board. `healthDays` and `nutritionDays` are oldest-first arrays with a
// `date`; `todayLive` is today's live food-log totals ({p, kcal}) so an entry
// logged a minute ago counts before the archive catches up. Pure.
export function composeBoard({ targets, healthDays = [], nutritionDays = [], todayLive = null, now = new Date() } = {}) {
  const today = localDateISO(now);
  const fraction = dayFraction(now);
  const dayOver = now.getHours() >= DAY_END_HOUR;
  const byDate = (rows) => Object.fromEntries(rows.filter((r) => r?.date).map((r) => [r.date, r]));
  const health = byDate(healthDays);
  const nutrition = byDate(nutritionDays);
  const valueOn = (key, date) => {
    if (key === 'steps') return health[date]?.steps ?? null;
    if (date === today && todayLive) return key === 'protein' ? (todayLive.p ?? null) : (todayLive.kcal ?? null);
    const n = nutrition[date];
    if (!n) return null;
    return key === 'protein' ? (n.p ?? null) : (n.kcal ?? null);
  };
  const week = [];
  for (let i = 6; i >= 0; i--) week.push(shiftISO(today, -i));

  const metrics = METRICS.map((m) => {
    const t = targets?.[m.key] || { value: null, source: null };
    const days = week.map((date) => {
      const value = valueOn(m.key, date);
      const isToday = date === today;
      const j = judge(m, value, t.value, isToday ? { fraction, dayOver } : { fraction: 1, dayOver: true });
      return { date, value: value == null ? null : Math.round(Number(value)), met: j.met, state: j.state, today: isToday };
    });
    const todayRow = days[days.length - 1];
    const j = judge(m, todayRow.value, t.value, { fraction, dayOver });
    const past = days.slice(0, -1);
    const tracked = past.filter((d) => d.met != null).length;
    const met = past.filter((d) => d.met === true).length;
    // the streak counts finished days back from yesterday; today joins it
    // only once it is met
    let streak = 0;
    for (let i = past.length - 1; i >= 0; i--) { if (past[i].met === true) streak++; else if (past[i].met === false) break; else break; }
    if (todayRow.met === true && todayRow.value != null && (m.mode === 'near' ? dayOver : todayRow.value >= (t.value || Infinity))) streak++;
    return {
      key: m.key, label: m.label, unit: m.unit, mode: m.mode,
      target: t.value, targetSource: t.source,
      today: todayRow.value, pct: j.pct, state: j.state, expected: j.expected,
      short: j.short ?? null, over: j.over ?? null,
      week: days, met, tracked, streak,
    };
  });

  return { date: today, hour: now.getHours(), fraction: Math.round(fraction * 100) / 100, metrics, headline: headlineOf(metrics), nudges: nudgesOf(metrics, now) };
}

// One sentence, code's, for the card and for a spoken turn. Leads with what
// needs him, then what is going well; says nothing about a hole.
export function headlineOf(metrics) {
  const fmt = (n) => Number(n).toLocaleString('en-AU');
  const by = Object.fromEntries(metrics.map((m) => [m.key, m]));
  const parts = [];
  const p = by.protein, s = by.steps, k = by.kcal;
  if (p?.state === 'behind' && p.short) parts.push(`protein is ${fmt(p.short)} g short of the ${fmt(p.target)} g floor`);
  else if (p?.state === 'missed') parts.push(`the protein floor was missed today`);
  if (s?.state === 'behind' && s.short) parts.push(`steps sit ${fmt(s.short)} under ${fmt(s.target)}`);
  else if (s?.state === 'missed') parts.push(`the step goal was missed today`);
  if (k?.state === 'missed' && k.over) parts.push(`calories are ${fmt(k.over)} over the ${fmt(k.target)} target`);
  const good = metrics.filter((m) => m.state === 'good' && m.today != null).map((m) => m.label.toLowerCase());
  const weekly = metrics.filter((m) => m.tracked >= 3).map((m) => `${m.label.toLowerCase()} ${m.met} of ${m.tracked}`);
  let line = '';
  if (parts.length) line = `Right now ${parts.join('; ')}.`;
  else if (good.length) line = `${cap(good.join(', '))} on track today.`;
  if (weekly.length) line += `${line ? ' ' : ''}This week: ${weekly.join(', ')}.`;
  return line || null;
}

// The prompts he asked for, deterministic and time-gated — each is a plain
// sentence the cadence engine can send once a day and the Home nudge can
// show. `metric` names the ring it belongs to; `key` is the once-a-day key;
// `short` is the card's one line, `text` the full sentence Telegram sends.
export function nudgesOf(metrics, now = new Date()) {
  const h = now.getHours();
  const fmt = (n) => Number(n).toLocaleString('en-AU');
  const by = Object.fromEntries(metrics.map((m) => [m.key, m]));
  const out = [];
  const p = by.protein, s = by.steps, k = by.kcal;
  // evening protein: the shape of his misses is protein landing late
  if (p?.target && p.today != null && h >= 17 && h < DAY_END_HOUR && p.target - p.today >= 30) {
    const short = Math.round(p.target - p.today);
    out.push({ key: 'goal-protein-evening', metric: 'protein', title: `Protein · ${fmt(short)} g to go`, short: `${fmt(Math.round(p.today))} of ${fmt(p.target)} g — ${short >= 60 ? 'two' : 'one'} protein-led meal${short >= 60 ? 's' : ''} closes it`, text: `Coach — you're at ${fmt(Math.round(p.today))} g of the ${fmt(p.target)} g floor with the evening left. ${short >= 60 ? 'Two protein-led meals close it' : 'One protein-led meal closes it'}; want me to pick from what's in the fridge?`, ask: `I'm ${short} g short of my protein floor tonight — what should I eat from what I have?` });
  }
  // afternoon steps: early enough for a walk to fix it
  if (s?.target && s.today != null && h >= 14 && h < 19 && s.today < s.target * 0.45) {
    const short = Math.round(s.target - s.today);
    const mins = Math.max(10, Math.round(short / 110)); // ~110 steps a minute at a walking pace
    out.push({ key: 'goal-steps-afternoon', metric: 'steps', title: `Steps · ${fmt(short)} behind`, short: `${fmt(s.today)} of ${fmt(s.target)} — a ${mins}-minute walk covers most of it`, text: `Coach — ${fmt(s.today)} steps so far against ${fmt(s.target)}. A ${mins}-minute walk before dinner covers most of it.`, ask: `I'm ${short} steps short of my goal — where does a walk fit today?` });
  }
  // calories over: said once, by the afternoon, so dinner can still be shaped
  if (k?.target && k.today != null && h >= 12 && k.over) {
    out.push({ key: 'goal-kcal-over', metric: 'kcal', title: `Calories · ${fmt(k.over)} over`, short: `${fmt(Math.round(k.today))} against ${fmt(k.target)} — keep the rest protein-led and light`, text: `Coach — today is at ${fmt(Math.round(k.today))} kcal against a ${fmt(k.target)} target. Nothing to undo; keep the rest of the day protein-led and light.`, ask: `I'm ${k.over} kcal over target today — how should I shape the rest of the day?` });
  }
  // Monday morning: the week, in one line, so a drift is named before it is a month
  if (now.getDay() === 1 && h >= 7 && h < 12) {
    const scored = metrics.filter((m) => m.tracked >= 3);
    if (scored.length) {
      const worst = [...scored].sort((a, b) => (a.met / a.tracked) - (b.met / b.tracked))[0];
      out.push({ key: 'goal-week-review', metric: worst.key, title: 'Last week vs targets', short: scored.map((m) => `${m.label.toLowerCase()} ${m.met}/${m.tracked}`).join(' · '), text: `Coach — last week: ${scored.map((m) => `${m.label.toLowerCase()} ${m.met}/${m.tracked}`).join(', ')}. ${worst.met / worst.tracked < 0.6 ? `${cap(worst.label)} is the one to fix this week.` : 'Hold that.'}`, ask: `Review last week against my step, protein and calorie targets — what's the one thing to fix?` });
    }
  }
  return out;
}

// The loader: real logs in, the board out. Every source is optional; a
// failed read is a hole, never a throw.
export async function goalBoard(vaultPath, { now = new Date() } = {}) {
  const goals = await getFitnessGoals(vaultPath).catch(() => null);
  let profile = null;
  try { ({ profile } = await (await import('./recipes.js')).loadRecipeData(vaultPath)); } catch { /* no collection yet */ }
  const targets = resolveTargets(goals, profile);
  let healthDays = [], nutritionDays = [], todayLive = null;
  try { healthDays = await (await import('./healthData.js')).loadRecentDays(9); } catch { /* optional */ }
  try { nutritionDays = await (await import('./nutritionLog.js')).loadCalendarDays(7); } catch { /* optional */ }
  try {
    const { getToday, totalsOf } = await import('./foodLog.js');
    const day = await getToday();
    if ((day.entries || []).length) todayLive = totalsOf(day.entries);
  } catch { /* optional */ }
  return composeBoard({ targets, healthDays, nutritionDays, todayLive, now });
}

// The text the Coach and Ask Nova read. Targets with their provenance, today
// against the steady line, the week's count — and the standing instruction
// that turns numbers into coaching.
export function goalBoardText(board) {
  if (!board?.metrics?.length) return null;
  const fmt = (n) => Number(n).toLocaleString('en-AU');
  const rows = board.metrics.map((m) => {
    const t = m.target ? `${fmt(m.target)}${m.unit ? ` ${m.unit}` : ''} (${m.targetSource === 'goals' ? 'his own target' : m.targetSource === 'intake' ? 'from the Intake' : 'house default — he has not set one'})` : 'NO TARGET SET';
    const today = m.today == null ? 'nothing recorded today' : `${fmt(m.today)}${m.unit ? ` ${m.unit}` : ''} so far today${m.expected != null && m.mode === 'atLeast' ? ` (a steady day would be at ${fmt(m.expected)} by now)` : ''} — ${m.state === 'good' ? 'on track' : m.state === 'behind' ? 'BEHIND PACE' : m.state === 'missed' ? (m.mode === 'near' ? 'OVER TARGET' : 'MISSED') : 'no verdict'}`;
    const week = m.tracked ? `last 7 days: met ${m.met} of ${m.tracked} tracked${m.streak ? `, ${m.streak}-day streak` : ''}` : 'no tracked days this week';
    return `- ${m.label}: target ${t}; ${today}; ${week}.`;
  });
  return [
    `HIS DAILY TARGETS (code-computed, ${board.date} at ${String(board.hour).padStart(2, '0')}:00 local):`,
    ...rows,
    board.headline ? `Board verdict: ${board.headline}` : null,
    'Coach toward these. When one is behind pace, say so with the number and one concrete move (a food he owns, a walk, a lighter dinner); when a week shows a pattern, name it once and propose a fix. A hole means the data never arrived — say that, never treat it as zero.',
  ].filter(Boolean).join('\n');
}

export async function goalBoardContext(vaultPath, opts) {
  try { return goalBoardText(await goalBoard(vaultPath, opts)); } catch { return null; }
}

function shiftISO(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return localDateISO(new Date(y, m - 1, d + days, 12));
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

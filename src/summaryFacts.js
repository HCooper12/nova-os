// Pure sentence-and-slot builders for the summary Home (MissionSummary).
// Same discipline as missionLine.js's headline ladder: every sentence here is
// computed from the SAME fields the rings and cards next to it render, so it
// can never disagree with them (HOME-REDESIGN-PLAN.md §3, audit finding 2).
// No Date.now() anywhere in this file — every function takes `now` / `hour` /
// `today` as an argument, so the whole ladder is testable at any clock
// reading without a fake timer.
import { plainLabel } from './missionLine.js';

// Emoji belong on the calendar strip, not in a headline (missionLine.js's own
// rule) — but a shortened label also has to survive a ~90px pill, so this
// strips punctuation the same way and then keeps whole words only, never
// cutting one in half and never trailing off with an ellipsis.
export function shortLabel(label, max = 11) {
  const cleaned = plainLabel(label);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return cleaned;
  let out = words[0]; // at least one word, even if it alone runs over max
  for (let i = 1; i < words.length; i++) {
    // a standalone dash or bullet is a boundary: what follows it is the
    // detail, and "Gym — push" is a worse pill than "Gym"
    if (/^[—–\-·]$/.test(words[i])) break;
    const next = `${out} ${words[i]}`;
    if (next.length > max) break;
    out = next;
  }
  // the cut can land right after a standalone dash ("Deep work —" from
  // "Deep work — video script") — the same trailing-junk trim plainLabel
  // applies to the whole label, so a truncation never ends on one
  const trimmed = out.replace(/[\s—–-]+$/, '').trim();
  return trimmed || out;
}

// Shared by nextLine() and buildHighlight() so the two can never pick a
// different "next" event from the same todayEvents — findIndex, not a
// re-sort, because the rows already arrive in the day's chronological order
// (valsMission's markNow marks `now`/`past`/`until` on that same order).
function findTodayPositions(todayEvents) {
  const real = (Array.isArray(todayEvents) ? todayEvents : []).filter((r) => r && r.time !== '');
  const curIdx = real.findIndex((r) => r.now);
  if (curIdx !== -1) {
    const nxtIdx = real.findIndex((r) => r.until != null);
    return { current: real[curIdx], next: nxtIdx !== -1 ? real[nxtIdx] : null, afterNext: null };
  }
  const nxtIdx = real.findIndex((r) => r.until != null);
  if (nxtIdx === -1) return { current: null, next: null, afterNext: null };
  const after = real.slice(nxtIdx + 1).find((r) => r.time);
  return { current: null, next: real[nxtIdx], afterNext: after || null };
}

// Up to `count` slots for the Today strip: the live event (or, before the
// day's first event, the most recent past one) anchors the strip, the
// events still ahead follow it, and if that's still short of `count` it
// pads backwards into earlier history — oldest added last, so a tight strip
// favours what just happened over what happened hours ago.
export function stripSlots(todayEvents, { count = 6 } = {}) {
  const rows = Array.isArray(todayEvents) ? todayEvents : [];
  const real = rows.filter((r) => r && r.time !== '');
  if (!real.length) {
    const placeholder = rows.find((r) => r && r.time === '');
    return { slots: [], empty: placeholder ? placeholder.label : null };
  }
  const toSlot = (row, kind) => ({
    time: kind === 'now' ? 'Now' : row.time,
    label: shortLabel(row.label),
    kind,
    hue: row.categoryHue || null,
  });
  let anchorIdx = real.findIndex((r) => r.now);
  if (anchorIdx === -1) {
    for (let i = real.length - 1; i >= 0; i--) { if (real[i].past) { anchorIdx = i; break; } }
  }
  const out = [];
  if (anchorIdx !== -1) out.push(toSlot(real[anchorIdx], real[anchorIdx].now ? 'now' : 'past'));
  const startFuture = anchorIdx !== -1 ? anchorIdx + 1 : 0;
  for (let i = startFuture; i < real.length && out.length < count; i++) out.push(toSlot(real[i], 'next'));
  if (out.length < count && anchorIdx > 0) {
    const pad = [];
    for (let i = anchorIdx - 1; i >= 0 && out.length + pad.length < count; i--) pad.push(toSlot(real[i], 'past'));
    pad.reverse(); // collected nearest-to-anchor first; the strip reads oldest first
    out.unshift(...pad);
  }
  return { slots: out.slice(0, count), empty: null };
}

// The current block (with its end) or the next one (with its start); `then`
// names whichever event follows THAT one, for a small trailing caption.
// Labels are full plainLabel, never shortLabel — this line has room.
export function nextLine(todayEvents) {
  const { current, next, afterNext } = findTodayPositions(todayEvents);
  if (current) {
    return {
      lead: { b: plainLabel(current.label), rest: `until ${current.end}` },
      then: next ? `then ${plainLabel(next.label)}` : null,
    };
  }
  if (next) {
    return {
      lead: { b: plainLabel(next.label), rest: `at ${next.time}` },
      then: afterNext ? `then ${plainLabel(afterNext.label)}` : null,
    };
  }
  return null;
}

function parseNum(s) {
  const n = Number(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Rung 1 of buildHighlight — one sentence per focal vital, built from the
// exact ring object the Body card renders, so a value can never drift
// between the sentence and the ring beside it.
function highlightForVital(ring) {
  const value = ring.value;
  const pct = ring.pct;
  if (ring.key === 'protein') {
    const m = /(\d[\d,]*)/.exec(ring.small || '');
    const target = m ? parseNum(m[1]) : null;
    const num = parseNum(value) ?? 0;
    if (target != null) {
      const gap = target - num;
      return {
        key: 'protein', eyebrow: 'Protein',
        segments: [{ t: "You're " }, { t: `${gap} g`, b: 1 }, { t: " under today's floor." }],
        pct, tone: 'c1', axis: `${num} of ${target} g`,
        act: { label: `Find ${gap} g`, kind: 'recipes' },
      };
    }
    return {
      key: 'protein', eyebrow: 'Protein',
      segments: [{ t: 'Protein sits at ' }, { t: `${num} g`, b: 1 }, { t: ' — no floor set.' }],
      pct: null, tone: 'c1', axis: null,
      act: { label: 'Set a floor', kind: 'recipes' },
    };
  }
  if (ring.key === 'steps') {
    const m = /(\d[\d,]*)\s*TO GO/.exec(ring.hint || '');
    const short = m ? parseNum(m[1]) : null;
    // formatted with commas like every other step count he's shown
    // (ring.value itself already arrives comma-formatted from valsMission)
    const shortLabelText = short != null ? short.toLocaleString() : null;
    return {
      key: 'steps', eyebrow: 'Steps',
      segments: short != null
        ? [{ t: `${shortLabelText} steps`, b: 1 }, { t: ' still on the plan.' }]
        : [{ t: 'Steps sit at ' }, { t: `${value}`, b: 1 }, { t: ` — ${pct}% of the goal.` }],
      pct, tone: 'c2', axis: `${value} today`,
      act: { label: 'See the week', kind: 'steps' },
    };
  }
  if (ring.key === 'sleep') {
    return {
      key: 'sleep', eyebrow: 'Sleep',
      segments: [{ t: 'Sleep came in at ' }, { t: `${value}`, b: 1 }, { t: ` — ${pct}% of eight hours.` }],
      pct, tone: 'c3', axis: null, act: null,
    };
  }
  // readiness — the only rung with no numeric axis; the hint IS the axis
  return {
    key: 'readiness', eyebrow: 'Readiness',
    segments: [{ t: 'Readiness reads ' }, { t: `${value}`, b: 1 }, { t: ' — go easy today.' }],
    pct, tone: 'c3', axis: ring.hint ? String(ring.hint).toLowerCase() : null,
    act: { label: 'Open Train', kind: 'train' },
  };
}

// The one highlight sentence — a four-rung ladder, never null. Each rung
// reads facts the rest of the screen already shows (the focal ring, the plan
// priorities, today's events) rather than deriving its own, which is what
// keeps it honest.
export function buildHighlight({ ringVitals = [], focalVital = null, oneThing = null, planToday = null, todayEvents = [], hour } = {}) {
  void hour; // reserved for a future time-of-day rung; every caller passes it
  const ring = focalVital ? (ringVitals || []).find((r) => r && r.key === focalVital) : null;
  if (ring && ring.state !== 'absent') return highlightForVital(ring);

  if (oneThing) {
    const priorities = Array.isArray(planToday?.priorities) ? planToday.priorities : [];
    const settled = priorities.filter((p) => p && (p.outcome || p.seen)).length;
    const total = priorities.length;
    return {
      key: 'one', eyebrow: 'The plan',
      segments: [{ t: "Today's one thing: " }, { t: oneThing.text, b: 1 }],
      pct: total ? Math.round((settled / total) * 100) : null,
      tone: 'c5',
      axis: total ? `${settled} of ${total} settled` : null,
      act: oneThing.mark ? { label: 'Done', kind: 'done' } : null,
    };
  }

  const positions = findTodayPositions(todayEvents);
  const nl = nextLine(todayEvents);
  if (nl) {
    const segments = positions.current
      ? [{ t: '' }, { t: nl.lead.b, b: 1 }, { t: ` ${nl.lead.rest}.` }]
      : [{ t: 'Clear until ' }, { t: positions.next.time, b: 1 }, { t: `, then ${nl.lead.b}.` }];
    return { key: 'next', eyebrow: 'Today', segments, pct: null, tone: 'c3', axis: nl.then || null, act: { label: 'Calendar', kind: 'calendar' } };
  }

  const allGood = ringVitals.length > 0 && ringVitals.every((r) => r && r.state === 'good');
  return {
    key: 'clear', eyebrow: 'Today',
    segments: [{ t: allGood ? 'All four are on track.' : 'Nothing is behind right now.' }],
    pct: null, tone: 'c1', axis: null, act: null,
  };
}

// noon anchor, same trick as missionFocus.js's shiftISO — immune to DST
function isoShift(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days, 12);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
}
function last7(today) {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(isoShift(today, -i));
  return out;
}

// One goal-metric row: the streak is read only from days that actually
// reported (a gap in the push is a gap, never a miss) over the trailing
// week. It is the RUN ending today — how many of the newest readings in a
// row carry the same verdict — because that is the thing a glance wants:
// "steps, 5 days up" after two misses earlier in the week is a streak, and
// a mixed week that ended in one miss is the one honest "mixed".
function streakRow(key, label, days, today, hasReading, meets) {
  if (!today) return { key, label, dir: 'none', value: 'no data' };
  const byDate = new Map((days || []).filter((d) => d && d.date).map((d) => [d.date, d]));
  const present = last7(today).map((d) => byDate.get(d)).filter((d) => d && hasReading(d));
  if (present.length < 2) return { key, label, dir: 'none', value: 'no data' };
  const verdicts = present.map((d) => !!meets(d));
  const latest = verdicts[verdicts.length - 1];
  let run = 0;
  for (let i = verdicts.length - 1; i >= 0 && verdicts[i] === latest; i--) run += 1;
  if (run < 2) return { key, label, dir: 'flat', value: 'mixed' };
  return { key, label, dir: latest ? 'up' : 'dn', value: `${run} days` };
}

function hrvRow(healthDays, today) {
  if (!today) return { key: 'hrv', label: 'HRV', dir: 'none', value: 'no data' };
  const byDate = new Map((healthDays || []).filter((d) => d && d.date).map((d) => [d.date, d]));
  const present = last7(today).map((d) => byDate.get(d)).filter((d) => d && d.hrv != null && d.hrv !== 0);
  if (present.length < 5) return { key: 'hrv', label: 'HRV', dir: 'none', value: 'no data' }; // 3 recent + ≥2 before
  const last3 = present.slice(-3);
  const before = present.slice(0, -3);
  const mean = (arr) => arr.reduce((s, d) => s + d.hrv, 0) / arr.length;
  const priorMean = mean(before);
  if (!priorMean) return { key: 'hrv', label: 'HRV', dir: 'none', value: 'no data' };
  const pct = Math.round(((mean(last3) - priorMean) / priorMean) * 100);
  if (pct >= 5) return { key: 'hrv', label: 'HRV', dir: 'up', value: `+${pct}%` };
  if (pct <= -5) return { key: 'hrv', label: 'HRV', dir: 'dn', value: `−${Math.abs(pct)}%` };
  return { key: 'hrv', label: 'HRV', dir: 'flat', value: 'steady' };
}

// The honest form of "Nova noticed" — four rows, always, because a metric
// with no data says so instead of vanishing (IMPOSSIBLE_ZERO in
// valsMission.js: an unreported sleep/HRV night lands as 0 and must NOT
// read as a real zero here either).
export function buildTrends({ healthDays = [], nutritionWeek = null, stepGoal = 10000, sleepGoalMin = 480, today } = {}) {
  const nd = Array.isArray(nutritionWeek?.days) ? nutritionWeek.days : [];
  return [
    streakRow('steps', 'Steps', healthDays, today, (d) => d.steps != null, (d) => d.steps >= stepGoal),
    streakRow('protein', 'Protein', nd, today, (d) => d.floorMet != null, (d) => d.floorMet === true),
    streakRow('sleep', 'Sleep', healthDays, today, (d) => d.sleepAsleepMinutes != null && d.sleepAsleepMinutes !== 0, (d) => d.sleepAsleepMinutes >= sleepGoalMin),
    hrvRow(healthDays, today),
  ];
}

function plainNextSentence(todayEvents) {
  const positions = findTodayPositions(todayEvents);
  const nl = nextLine(todayEvents);
  if (!nl) return null;
  if (positions.current) return `${nl.lead.b} ${nl.lead.rest}.`;
  return `Clear until ${positions.next.time}, then ${nl.lead.b}.`;
}

function firstRecoverySentence(heroStand) {
  const full = (Array.isArray(heroStand) ? heroStand : []).map((s) => s?.t ?? '').join('');
  const sentence = full.split(/(?<=\.)\s+/).map((s) => s.trim()).find((s) => s.startsWith('Recovery'));
  return sentence || null;
}

// The Mission-headline rule, brought to the summary Home: the standfirst
// must not say what the highlight card directly beneath it already says.
// On a collision it reaches for a different true fact instead of repeating
// the same one in a second voice.
export function summaryStandfirst({ taglineTopic, tagline, highlightKey, todayEvents, heroStand } = {}) {
  const collision = (taglineTopic === highlightKey && (highlightKey === 'protein' || highlightKey === 'steps'))
    || ((taglineTopic === 'next' || taglineTopic === 'block') && highlightKey === 'next');
  if (!collision) return tagline ?? null;
  if (highlightKey !== 'next') return plainNextSentence(todayEvents);
  return firstRecoverySentence(heroStand);
}

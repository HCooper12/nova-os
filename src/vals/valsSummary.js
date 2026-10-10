import { dtf } from './fmt.js';
import { localDateISO } from '../localDate.js';
import { getPinned } from '../pinned.js';
import { inMorning } from '../dayCard.js';
import { prLift, prBasis } from '../missionFocus.js';
import { stripSlots, nextLine, buildHighlight, buildTrends, summaryStandfirst } from '../summaryFacts.js';

// The summary Home's own view model (HOME-REDESIGN-PLAN.md §3). Nothing here
// re-derives a fact valsMission (or valsPractice / valsOps / valsChrome,
// spread into the same view model in src/App.jsx) already computed — this
// only reshapes what already exists into the seven Pinned cards, the one
// highlight sentence, and the standfirst.
//
// `m` is documented as "the object valsMission returned", but three fields
// the plan calls for — practiceCard, macSessionsHeadline, goWorkouts — are
// actually built by valsPractice.js / valsOps.js / valsChrome.js and only
// exist once App.jsx spreads all four into one `v`. So `m` here must be that
// full merged view model, and whoever wires up the call site (src/App.jsx)
// needs to spread valsSummary AFTER valsChrome — see the session report.
export function valsSummary(app, ctx, m) {
  const st = app.state;
  const heroTaglineTopic = m.heroTaglineTopic;
  if (st.novaStyle !== 'summary') return { heroTaglineTopic, summaryHome: null };

  const demoMode = !!ctx.demoMode;
  const now = new Date();
  const hour = now.getHours();

  const highlightRaw = buildHighlight({
    ringVitals: m.ringVitals,
    focalVital: m.focalVital,
    oneThing: m.oneThing,
    planToday: m.planToday,
    todayEvents: m.todayEvents,
    hour,
    // the same doneCard the Training card reads (trainingCard below) — a
    // readiness rung never invites a session already filed today
    trainedToday: !!m.trainToday?.done,
  });
  const highlight = { ...highlightRaw, act: bindAct(highlightRaw.act, ctx, m) };

  const standfirst = summaryStandfirst({
    taglineTopic: heroTaglineTopic,
    tagline: m.heroTagline,
    highlightKey: highlight.key,
    todayEvents: m.todayEvents,
    heroStand: m.heroStand,
  });

  const cardData = {
    body: bodyCard(m, ctx),
    today: todayCard(m),
    plan: planCard(m, ctx),
    waiting: waitingCard(m),
    training: trainingCard(m, ctx),
    practice: m.practiceCard ? { card: m.practiceCard } : null,
    trends: trendsCard(st, ctx, m, demoMode),
  };
  // YOUR DAY, DRAWN (mockup 86): the five instruments, a morning card from
  // 05:00 to 11:00, or all day when pinned. Whether all five were already
  // seen is read by the card itself when Home mounts (src/dayCard.js).
  const pinnedList = getPinned();
  const dayPinned = !!pinnedList.find((p) => p.key === 'day' && p.on);
  const yourDay = (dayPinned || inMorning(hour)) ? {
    pinned: dayPinned,
    data: m.instruments || null,
    loading: !!m.instrumentsBusy,
    error: m.instrumentsError || null,
    // demo mode has no Mac to read the day from; a Read again there would do nothing
    refresh: demoMode ? null : m.refreshInstruments,
    foot: dayPinned ? null : 'Until 11:00, or until you have seen all five. Pin it from Edit to keep it.',
  } : null;
  cardData.day = dayPinned ? yourDay : null;
  const WIDE = new Set(['body', 'today', 'training', 'day']);
  const cards = pinnedList
    .filter((p) => p.on && cardData[p.key])
    .map((p) => ({ key: p.key, wide: WIDE.has(p.key), ...cardData[p.key] }));
  const allCards = pinnedList.map((p) => ({ ...p, present: !!cardData[p.key] }));

  return {
    heroTaglineTopic,
    summaryHome: {
      date: dtf('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now).replace(/,/g, ''),
      greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
      standfirst,
      highlight,
      cards,
      allCards,
      moments: buildMoments(m),
      yourDay,
      edit: {
        open: !!st.pinnedEditOpen,
        openEdit: () => app.openPinnedEdit?.(),
        close: () => app.closePinnedEdit?.(),
        setList: (list) => app.setPinned?.(list),
      },
      foot: 'Edit Pinned to choose what appears here. Everything else is one tap away under More, and comes back here when it has news.',
    },
  };
}

// The highlight's single quiet act, bound to the real handler its `kind`
// names. An act whose binding turns out null (nothing to open) is dropped
// entirely — a dead button reads as a bug, not a quiet day.
function bindAct(act, ctx, m) {
  if (!act) return null;
  let run = null;
  switch (act.kind) {
    case 'recipes': run = ctx.go('recipes'); break;
    case 'steps': run = m.satSteps?.onOpen || null; break;
    case 'train': run = ctx.go('workouts'); break;
    case 'done': run = m.oneThing ? () => m.oneThing.mark('done') : null; break;
    case 'calendar': run = m.todayIsLive ? m.openCalendarView : null; break;
    default: run = null;
  }
  return run ? { label: act.label, run } : null;
}

const sentenceCase = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
// The one pair of values bodyMetricsMeta ever takes — "sentence case" reads
// as "Apple Health · food log" (a product name, not a generic phrase), which
// a blind lowercase-then-capitalise pass would flatten to "Apple health".
const BODY_META = { 'DEMO DATA': 'Demo data', 'APPLE HEALTH · FOOD LOG': 'Apple Health · food log' };

// '/150G' -> '/150 g', '/8H' -> '/8 h', a bare 'G' -> ' g'.
function normalizeSmall(small) {
  const s = String(small || '');
  if (!s) return s;
  const withDigits = /^(\/\d[\d,]*)([A-Za-z]+)$/.exec(s);
  if (withDigits) return `${withDigits[1]} ${withDigits[2].toLowerCase()}`;
  if (/^[A-Za-z]+$/.test(s)) return ` ${s.toLowerCase()}`;
  return s;
}

function bodyCard(m, ctx) {
  const ring = (key) => (m.ringVitals || []).find((r) => r.key === key) || {};
  const entry = (key, open) => {
    const r = ring(key);
    return { key, label: sentenceCase(r.label), value: r.value, small: normalizeSmall(r.small), pct: r.pct, state: r.state, open };
  };
  return {
    meta: BODY_META[m.bodyMetricsMeta] || sentenceCase(m.bodyMetricsMeta),
    rings: [
      entry('protein', ctx.go('recipes')),
      entry('steps', m.satSteps?.onOpen || null),
      entry('sleep', null),
    ],
  };
}

function todayCard(m) {
  return {
    ...stripSlots(m.todayEvents),
    next: nextLine(m.todayEvents),
    live: m.todayIsLive,
    stale: m.todayStaleLabel || null,
    openCalendar: m.todayIsLive ? m.openCalendarView : null,
    schedule: m.calCmdEnabled ? { value: m.calCmd, set: m.setCalCmd, send: m.sendCalCmd, busy: m.calCmdBusy } : null,
  };
}

// 'stuck' (a promise the plan keeps listing) beats 'one' (the day's open
// priority) beats 'state' (the plan's own status) — the same priority order
// the Structured idiom already reads these in. A stuck-item receipt (the
// "let go" / "not now" toast) can ride along on whichever kind wins, since
// it is a confirmation of a separate, just-finished action.
function planCard(m, ctx) {
  if (!(m.planToday || m.stuckCard)) return null;
  const openInbox = m.planToday?.onOpenInbox || ctx.go('inbox');
  const receipt = m.stuckCard?.receipt || null;
  const stuck = m.stuckCard?.items?.[0];
  if (stuck) {
    return {
      kind: 'stuck', days: stuck.days, pct: stuck.pct, tone: stuck.tone,
      text: stuck.text, sub: stuck.meta,
      answers: { start: stuck.start, later: stuck.later, drop: stuck.drop },
      receipt, openInbox,
    };
  }
  if (m.oneThing) {
    return {
      kind: 'one', text: m.oneThing.text, sub: m.oneThing.why || '',
      marks: m.oneThing.mark ? { done: () => m.oneThing.mark('done'), skip: () => m.oneThing.mark('skipped') } : null,
      receipt, openInbox,
    };
  }
  if (m.planToday) {
    const p = m.planToday;
    const text = p.state === 'classifying' ? "Nova is drawing up today's top 3…"
      : p.state === 'error' ? `Today's plan hit an error — ${p.errorText}`
        : p.state === 'pending' ? "Today's top 3 are drafted"
          : "Today's top 3 are settled";
    return {
      kind: 'state', text, sub: sentenceCase(p.meta),
      approve: p.onApprove ? { label: p.busy ? 'Filing…' : 'Approve', run: p.onApprove } : null,
      receipt, openInbox,
    };
  }
  return null; // stuckCard existed but had neither an item nor a receipt worth a card
}

function waitingCard(m) {
  if (!m.commandDeck || !(m.commandDeck.count > 0)) return null;
  return { count: m.commandDeck.count, sub: `for your call · ${m.commandDeck.items[0]?.title || ''}`, open: m.commandDeck.onOpen };
}

// exported for the summary Train page's hero (valsTrainSummary.js), so the
// page and Home's Training card name today's session in the same words
export function trainingCard(m, ctx) {
  const meta = String(m.workoutCardK || '').replace(/^TRAIN\s*·\s*/, '').toLowerCase();
  const readinessRing = (m.ringVitals || []).find((r) => r.key === 'readiness');
  const readiness = readinessRing && readinessRing.state !== 'absent'
    ? { value: readinessRing.value, pct: readinessRing.pct, state: readinessRing.state }
    : null;
  const prs = m.prMoment?.prs || [];
  const record = m.prMoment && prs.length
    // the line names the lift; the fig carries the set and the basis (prBasis
    // already says 'heaviest yet' or 'est. 1RM'), so the record is said once
    ? { count: prs.length, line: prs[0].name, fig: `${prLift(prs[0])} · ${prBasis(prs[0])}` }
    : null;
  return { meta, title: m.workoutCardLabel, sub: m.workoutCardMeta, readiness, record, open: m.goWorkouts || ctx.go('workouts') };
}

const DEMO_TRENDS = [
  { key: 'steps', label: 'Steps', dir: 'up', value: '7 days' },
  { key: 'protein', label: 'Protein', dir: 'dn', value: '2 days' },
  { key: 'sleep', label: 'Sleep', dir: 'flat', value: 'mixed' },
  { key: 'hrv', label: 'HRV', dir: 'none', value: 'no data' },
];

function trendsCard(st, ctx, m, demoMode) {
  if (!(st.liveHealthDays || demoMode)) return null;
  const openFor = (key) => (key === 'steps' ? (m.satSteps?.onOpen || null) : key === 'protein' ? ctx.go('recipes') : null);
  if (demoMode) return { rows: DEMO_TRENDS.map((r) => ({ ...r, open: openFor(r.key) })), demo: true };
  const stepGoal = st.liveGoalBoard?.metrics?.find((x) => x.key === 'steps')?.target || 10000;
  const rows = buildTrends({
    healthDays: st.liveHealthDays || [],
    nutritionWeek: st.liveNutritionWeek || null,
    stepGoal,
    sleepGoalMin: 480,
    today: localDateISO(),
  }).map((r) => ({ ...r, open: openFor(r.key) }));
  return { rows };
}

// Above Pinned, only while genuinely news — fixed order, each read straight
// off the same field its own card / moment on the other idiom already uses.
function buildMoments(m) {
  const list = [];
  if (m.macSessionsHeadline) list.push('asking');
  // THE DAILY REVIEW (mockup 96): at the head of Home while something is
  // due (arriving over its skeleton, or read-only from the last sync while
  // the Mac is away), and once the day is done so "Draw one early" has
  // somewhere to live. Never when nothing is due: More names the next day.
  if (m.review && ['card', 'all-done', 'loading'].includes(m.review.state)) list.push('review');
  // MONEY THAT NEEDS HIM (10 Oct 2026): only while a money record waits on
  // him (an over, a bill, a rise, an odd charge); nothing when all is fine
  if (m.moneyMoment) list.push('money');
  if (m.prMoment) list.push('pr');
  if (m.runningPlan) list.push('plan');
  if (m.landedMoment) list.push('landed');
  if (m.leaderBox && m.leadFirst) list.push('lead');
  if (m.todayTechnique && !m.todayTechnique.empty && !m.todayTechnique.outcome) list.push('technique');
  if (m.wrapCard) list.push('wrap');
  return list;
}

import { dtf } from './fmt.js';
import { trainingCard } from './valsSummary.js';
import { COACH_DECLINE_REASONS } from './valsInbox.js';
import { muscleVar } from '../muscleHue.js';
import { todayPanels } from '../trainPanels.js';
import { weekSetsView, uncountedView } from '../weekSets.js';
import { weekDots, trainedDays, coachWaiting, hardSetsRing, declineReason, verdictRest, routineGlyph } from '../trainSummaryFacts.js';
import { dayDoneText } from '../doneToday.js';

// THE SUMMARY TRAIN PAGE'S VIEW MODEL — redesign round 1, variation A, his
// pick (27 Sep 2026, design/mockups/58-redesign-train.html; the audit it
// answers is design/audits/redesign-2026-09/03-train.md). Under `summary`
// Train is two places, not three tabs: the Gym page (this), and Coach as a
// door on it that opens as a sheet. Today's readiness ring and session card
// are Home's (MissionSummary's Training and Body cards); the page's hero
// reads the SAME Training card fields (valsSummary.trainingCard), so the two
// can never name today differently.
//
// Nothing here writes on its own. Every action is an existing app method
// the other idioms already call — startWorkoutSession (through its own
// guardSessionStart), inboxAction's discard-with-reason, reopenCoachSuggestion,
// updateRoutineExercises — or plain UI state. It reshapes what valsWorkouts
// already computed; it re-derives nothing valsWorkouts owns.
//
// Null (and so the classic three tabs render, untouched) when the style is
// not summary, in demo mode (whose scripted plan is the only demo Train
// has), before the routines have loaded (valsWorkouts' honest "not loaded"
// says so), and while the live session is open: the session stays exactly
// as it is today — it is round B's.

const cap = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const estMinutes = (n) => Math.round(((Number(n) || 0) * 8 + 4) / 5) * 5;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_DAY = { monday: 'Mondays', tuesday: 'Tuesdays', wednesday: 'Wednesdays', thursday: 'Thursdays', friday: 'Fridays', saturday: 'Saturdays', sunday: 'Sundays' };
const QUICK_MINUTES = ['20', '30', '45', '60', '90'];

// renderVals runs on every keystroke; the week sheet's view is only rebuilt
// when the overview's week object itself changes
let weekMemo = { week: null, view: null };
function weekViewOf(week) {
  if (weekMemo.week !== week) weekMemo = { week, view: week ? weekSetsView(week) : null };
  return weekMemo.view;
}

export function valsTrainSummary(app, ctx, v) {
  const st = app.state;
  if (st.novaStyle !== 'summary') return { trainSummary: null };
  if (st.screen !== 'workouts' || ctx.demoMode || !v.usingLiveWorkouts) return { trainSummary: null };
  if (st.workoutsView === 'session') return { trainSummary: null };

  const o = st.liveTrainOverview || null;
  const routines = st.liveWorkoutRoutines || [];
  const byId = new Map(routines.map((r) => [r.id, r]));
  const library = st.liveWorkoutExercises || [];
  const muscleOfName = new Map(library.map((e) => [String(e.name || '').toLowerCase(), e.muscleGroup]));
  const acts = v.trainToday?.actions || {};
  const now = new Date();
  const todayKey = WEEKDAYS[now.getDay()];

  // A START FROM THE PAGE LANDS IN THE SESSION. The classic render shows the
  // session under the Gym tab, and a stale trainTab ('today' from the other
  // idioms, 'coach' from the sheet) would land him elsewhere; every
  // session-entering action goes through here first.
  const enter = (fn) => (fn ? (...args) => { if (app.state.trainTab && app.state.trainTab !== 'gym') app.setState({ trainTab: 'gym' }); fn(...args); } : null);
  // …and every "ask Coach" opens the Coach door, with its history entry
  const askCoach = (q) => { app.openTrainCoach(); app.doCoach(q); };

  // ---------------------------------------------------------------- hero --
  const tc = trainingCard(v, ctx);
  const resume = v.resumeSession;
  const panels = todayPanels(o, resume);
  const todayRoutine = (o?.today && byId.get(o.today.routineId)) || ctx.todayRoutine || null;
  const lastVolume = o?.today?.lastVolume;
  const liftCount = o?.today?.exerciseCount ?? todayRoutine?.exercises?.length ?? 0;
  const chipsOf = (targets) => (targets || []).map((t) => ({ muscle: cap(t.muscle), hue: muscleVar(t.muscle), count: t.count }));
  const focus = (() => {
    const f = o?.focus;
    if (!f) return null;
    const fix = f.fix && acts.applyFocusFix ? { label: 'Make the change', run: () => acts.applyFocusFix(f.fix, f.text) } : null;
    if (f.verdict) {
      const vd = f.verdict;
      const muscle = muscleOfName.get(String(vd.lift || '').toLowerCase());
      return { lift: vd.lift, hue: muscle ? muscleVar(muscle) : 'var(--nv-cy)', rest: verdictRest(vd), why: vd.why || null, fix };
    }
    return { text: f.text, fix };
  })();
  const readiness = o ? {
    value: o.readiness?.score ?? null,
    basis: o.readiness?.basis || null,
    block: o.block && !o.block.ended ? `${cap(o.block.phase)} · week ${o.block.week} of ${o.block.lengthWeeks}` : null,
    deload: o.deload?.advise ? o.deload.reason : null,
    // HRV, sleep and resting heart rate: the ring's inputs, one tap away
    facts: [
      { k: 'HRV', v: o.recovery?.hrv != null ? `${o.recovery.hrv} ms` : null },
      { k: 'Sleep', v: o.recovery?.sleepMin != null ? `${(o.recovery.sleepMin / 60).toFixed(1)} h` : null },
      { k: 'Resting HR', v: o.recovery?.restingHr ?? null },
      { k: 'Watch today', v: o.watch?.length ? o.watch.map((w) => `${w.type} ${w.minutes}m`).join(' · ') : null },
    ].filter((f) => f.v != null),
    open: !!st.trainSumFacts,
    toggle: () => app.setState({ trainSumFacts: !st.trainSumFacts }),
    tired: acts.askTired || null,
    peak: acts.askPeak || null,
  } : null;

  const hero = (() => {
    const when = dtf('en-GB', { weekday: 'long' }).format(now);
    if (resume) {
      return {
        kind: 'resume', eyebrow: 'Session in progress', when, title: resume.routineName,
        sub: `${plural(resume.done, 'set')} logged · ${resume.ageLabel}`,
        primary: { label: 'Resume', run: enter(resume.resume) },
      };
    }
    if (panels.makeup) {
      const m = o.makeup;
      return {
        kind: 'makeup', eyebrow: 'Today is a make-up', when, title: `Finish ${m.sourceRoutineName}`,
        sub: `${m.exercises.length} left${m.sourceDate ? ` from ${m.sourceDate}` : ''} · ${m.exercises.map((e) => e.name).join(', ')}`,
        primary: acts.beginMakeup ? { label: 'Finish the session', run: enter(acts.beginMakeup) } : null,
        quiet: acts.clearMakeup ? { label: 'Not a make-up after all', run: acts.clearMakeup } : null,
        also: panels.alsoScheduled && acts.begin ? { text: `Also scheduled today · ${o.today.name}`, label: 'Begin it', run: enter(acts.begin) } : null,
        readiness,
      };
    }
    const done = v.gymHero?.done || null;
    if (done) {
      const g = v.gymHero;
      return {
        kind: 'done', eyebrow: 'Done today', when, title: done.title,
        glyph: routineGlyph(done.title, v.gymHero?.targets),
        chips: chipsOf(v.gymHero?.targets),
        sub: done.meta,
        // several sessions: each its own line, in the order done (3 Oct)
        lines: done.lines,
        // a two-a-day's next one is the day's plan, not an "anyway" (mockup 104)
        also: !g.rest && g.begin && (o?.todayPlan || []).some((p) => !p.done)
          ? { text: `Next today · ${(o.todayPlan.find((p) => !p.done) || {}).name}`, label: 'Begin it', run: enter(g.begin) }
          : !g.rest && !done.scheduledDone && g.begin ? { text: `Also scheduled today · ${g.name}`, label: 'Begin it anyway', run: enter(g.begin) } : null,
        readiness,
      };
    }
    if (todayRoutine) {
      const begin = v.gymHero?.begin || (() => app.startWorkoutSession(todayRoutine));
      return {
        kind: 'scheduled', eyebrow: "On today's card", when, title: tc.title,
        sub: v.gymHero?.planLine ? `Two today · ${v.gymHero.planLine}`
          : `${plural(liftCount, 'lift')} · about ${estMinutes(liftCount)} min${lastVolume ? ` · last time ${Number(lastVolume).toLocaleString('en-AU')} kg` : ''}`,
        chips: chipsOf(v.gymHero?.targets),
        glyph: routineGlyph(todayRoutine.name, v.gymHero?.targets),
        focus,
        readiness,
        primary: { label: 'Begin', run: enter(begin) },
        secondary: todayRoutine.exercises.length ? { label: `See the ${plural(todayRoutine.exercises.length, 'lift')}`, run: () => app.openRoutine(todayRoutine.id) } : null,
      };
    }
    // rest, active rest, nothing scheduled or nothing built yet — the card's own words
    return {
      kind: 'rest', eyebrow: "On today's card", when, title: tc.title,
      sub: routines.length ? null : 'No routines yet. Start one below.',
      focus: o?.restDay && v.gymHero?.focusText ? { text: v.gymHero.focusText } : focus,
      readiness,
    };
  })();

  // ---------------------------------------------------------------- week --
  const week = (() => {
    const schedule = {};
    const notes = [];
    for (const d of v.weekStrip || []) {
      const dayName = d.day;
      if (d.makeup) schedule[dayName] = `${d.makeup.sourceRoutineName} make-up`;
      else if (d.value && d.value !== 'active-rest') schedule[dayName] = byId.get(d.value)?.name || null;
      else schedule[dayName] = null;
      // the day's record, when it has one: everything done, not the plan's
      // half of it (3 Oct, "not only partial data")
      if (d.doneMarks?.length) notes.push(`${cap(dayName)} · ${dayDoneText(d.doneMarks)}`);
      else if (d.makeup) notes.push(d.makeup.done ? `${cap(dayName)} · made up ${d.makeup.sourceRoutineName}${d.makeup.leftOff ? `, ${d.makeup.leftOff}` : ''}` : `${cap(dayName)} · make-up, ${d.makeup.count} left of ${d.makeup.sourceRoutineName}`);
      else if (d.carryoverNote) notes.push(`${cap(dayName)} · ${d.carryoverNote.replace(/^\+\s*/, '')}`);
    }
    const trained = trainedDays(o?.week, o?.doneToday, now);
    const { dots, line } = weekDots(schedule, trained, now);
    const strip = new Map((v.weekStrip || []).map((d) => [d.day, d]));
    const STATE_WORD = { done: 'done', today: 'today', planned: 'planned', missed: 'nothing logged', rest: 'rest' };
    // each day wears the colour of what it trains (mockup 101): the lead
    // muscle of the routine the day holds, a make-up its source's
    const byName = new Map((v.routinesList || []).map((r) => [String(r.name).toLowerCase(), r]));
    const hueOfDay = (routineName) => {
      const nm = String(routineName || '').replace(/ make-up$/, '').toLowerCase();
      const r = byName.get(nm);
      const lead = r?.targetChips?.[0]?.muscle;
      return lead ? muscleVar(lead) : 'var(--nv-cy)';
    };
    // PER WORKOUT, FROM THE SERVER (mockup 104, lib/weekCount.js): a double
    // day counts two and a 15-minute walk ticks active rest. An older server
    // without it keeps the per-day count from before.
    const wc = o?.weekCount || null;
    const wcDay = new Map((wc?.days || []).map((d) => [d.day, d]));
    // SESSIONS, NOT DAYS (mockup 105, his pick 26 Oct): active rest is not a
    // job, so it enters the count only once a walk has ticked it
    const slotsAll = (wc?.days || []).flatMap((d) => d.slots);
    const counts = (x) => x.kind !== 'active-rest' || x.byWalk;
    const planned = wc ? slotsAll.filter(counts).length : dots.filter((d) => d.state !== 'rest').length;
    const doneCount = wc ? slotsAll.filter((x) => counts(x) && x.done).length : dots.filter((d) => d.state === 'done').length;
    // a row's own words: lifts and sets from the routine itself
    const byLowName = new Map(routines.map((r) => [String(r.name).toLowerCase(), r]));
    const metaOf = (name) => {
      const r = byLowName.get(String(name || '').replace(/ make-up$/, '').toLowerCase());
      if (!r?.exercises?.length) return null;
      const sets = r.exercises.reduce((n, e) => n + (Number(e.targetSets) || 0), 0);
      return `${plural(r.exercises.length, 'lift')}${sets ? ` · ${sets} sets` : ''}`;
    };
    const OPTIONAL = / optional$/i;
    const hueOfSlot = (x) => (x.kind === 'active-rest' ? 'var(--nv-good)' : hueOfDay(x.makeup ? x.sourceName : x.name));
    const walkDay = (wc?.days || []).find((d) => d.isToday && d.walk?.counted);
    if (walkDay) notes.unshift(`${cap(walkDay.day)}'s active rest is done: you ${walkDay.walk.type && /run|jog/i.test(walkDay.walk.type) ? 'ran' : /walk|hik/i.test(walkDay.walk.type || '') ? 'walked' : 'moved'}.`);
    for (const d of wc?.days || []) {
      if (d.slots.length >= 2) notes.push(`${cap(d.day)} · ${d.slots.map((x) => `${x.done ? '✓ ' : ''}${x.name}`).join(', then ')}`);
    }
    return {
      line,
      notes,
      planned,
      done: doneCount,
      dots: dots.map((d) => {
        const s = strip.get(d.day);
        const k = wcDay.get(d.day);
        const shown = s?.planNames?.join(' and ') || s?.options?.find((x) => x.value === s.value)?.label || d.routine || 'Rest';
        const state = k ? (k.state === 'partial' ? (d.isToday ? 'today' : k.isPast ? 'missed' : 'planned') : k.state) : d.state;
        const segs = k && k.slots.length >= 2 ? k.slots.map((x) => ({ key: `${x.routineId || x.name}`, hue: hueOfSlot(x), done: x.done })) : null;
        const activeRest = !!k?.slots.some((x) => x.kind === 'active-rest');
        return {
          ...d,
          state,
          hue: state === 'rest' ? null : activeRest ? 'var(--nv-good)' : k?.slots[0] ? hueOfSlot(k.slots[0]) : hueOfDay(d.routine),
          segs,
          walk: !!k?.slots.some((x) => x.byWalk),
          makeup: / make-up$/.test(d.routine || ''),
          aria: `${d.label}: ${shown}, ${k && k.plannedCount >= 2 ? `${k.doneCount} of ${k.plannedCount} done` : STATE_WORD[state] || state}${k?.slots.some((x) => x.byWalk) ? ' by a walk' : ''}${s?.doneMarks?.length ? ` (${dayDoneText(s.doneMarks)})` : ''}${d.isToday && state !== 'today' ? ', today' : ''}. Plan the day`,
          // the day sheet (mockup 104) in place of the platform select
          openPlan: s?.openPlan || null,
          // THE ROW (mockup 105): what the day holds, in words
          rows: (k?.slots?.length ? k.slots : d.routine ? [{ kind: 'routine', name: d.routine }] : []).map((x) => ({
            key: x.routineId || x.name,
            name: x.kind === 'active-rest' ? (x.byWalk ? 'Active rest · walked' : 'Active rest · a walk counts') : String(x.name).replace(OPTIONAL, ''),
            optional: OPTIONAL.test(x.name || ''),
            rest: x.kind === 'active-rest',
            done: !!x.done,
            meta: x.kind === 'active-rest' ? null : metaOf(x.makeup ? x.sourceName : x.name),
            hue: hueOfSlot(x),
          })),
        };
      }),
    };
  })();

  // --------------------------------------------------------------- coach --
  const deck = v.coachDeck;
  // a card the discard-with-reason is carrying away is already answered
  const leaving = st.inboxLeaving || {};
  const waiting = coachWaiting((deck?.cards || []).map((c) => (leaving[c.id] === 'discard' ? { ...c, state: 'leaving' } : c)));
  const coach = {
    count: waiting.count,
    headline: waiting.headline,
    open: () => app.openTrainCoach(),
  };

  // ------------------------------------------------------------ routines --
  const all = v.routinesList || [];
  const routineTiles = all.map((r, i) => {
    const full = byId.get(r.id);
    const lifts = full?.exercises?.length || 0;
    return {
      id: r.id,
      name: r.name,
      lifts,
      count: r.completedCount || 0,
      today: !!todayRoutine && todayRoutine.id === r.id,
      chips: chipsOf((r.targetChips || []).slice(0, 2)),
      glyph: routineGlyph(r.name, r.targetChips),
      open: r.onOpen,
      // the classic tile's hold menu, with its start and its Coach turned
      // into the page's own doors (the session under Gym, the Coach sheet)
      hold: ({ x, y }) => app.openContextMenu({
        x, y, title: r.name.toUpperCase(),
        items: [
          ...(full && lifts ? [{ label: 'Start session', hint: plural(lifts, 'exercise'), onSelect: enter(() => app.startWorkoutSession(full)) }] : []),
          { label: 'Open & edit', onSelect: () => app.openRoutine(r.id) },
          { label: 'Rename', onSelect: () => app.startRenameRoutine(r.id) },
          ...(i > 0 ? [{ label: 'Move earlier', onSelect: () => app.moveRoutine(r.id, -1) }] : []),
          ...(i < all.length - 1 ? [{ label: 'Move later', onSelect: () => app.moveRoutine(r.id, 1) }] : []),
          { label: 'History', hint: `${r.completedCount || 0}×`, onSelect: () => app.openWorkoutHistory(r.id) },
          { label: 'Ask Coach about it', onSelect: () => askCoach(`Review my ${r.name} routine — structure, order, anything to change?`) },
          { label: 'Archive', hint: 'keeps it, hides it', onSelect: () => app.archiveRoutine(r.id) },
        ],
      }),
    };
  });
  const rename = {
    id: st.routineRenameId || null,
    name: st.routineRenameName || '',
    set: (e) => app.setRoutineRenameName(e),
    submit: () => app.submitRenameRoutine(),
    cancel: () => app.cancelRenameRoutine(),
  };
  // the shelf: what he archived, each one a tap from coming back
  const shelf = (st.liveWorkoutArchived || []).map((a) => ({ id: a.id, name: a.name, lifts: a.lifts, restore: () => app.restoreRoutine(a.id) }));
  const create = {
    open: !!v.routineCreating,
    name: v.routineNewName || '',
    setName: v.setRoutineNewName,
    start: v.startCreateRoutine,
    submit: v.submitCreateRoutine,
    cancel: v.cancelCreateRoutine,
  };

  // --------------------------------------------------------------- quick --
  const qi = Math.max(0, QUICK_MINUTES.indexOf(String(st.quickMinutes)));
  const quick = {
    minutes: QUICK_MINUTES[qi],
    less: qi > 0 ? () => app.setState({ quickMinutes: QUICK_MINUTES[qi - 1] }) : null,
    more: qi < QUICK_MINUTES.length - 1 ? () => app.setState({ quickMinutes: QUICK_MINUTES[qi + 1] }) : null,
    note: v.quickNote || '',
    setNote: v.setQuickNote,
    busy: !!v.quickBusy,
    build: v.buildQuickSession,
    plan: v.quickPlan ? { ...v.quickPlan, start: enter(v.quickPlan.start) } : null,
  };

  // ----------------------------------------------------------- hard sets --
  const weekView = weekViewOf(o?.week || null);
  const ring = hardSetsRing(o?.volume, { shortMuscles: weekView ? (weekView.cta?.muscles || []) : null });
  const hardSets = ring ? {
    ring,
    view: weekView,
    // the weekly muscle sets sheet's model (server/lib/muscleWeek.js)
    model: o?.muscleWeek || null,
    line: weekView
      ? `of ${weekView.planned} planned this week${ring.short.length ? ` · ${ring.short.join(' & ')} short` : ''}`
      : `of ${ring.target} target this week${ring.short.length ? ` · ${ring.short.join(' & ')} short` : ''}`,
    // with no planned week there is no sheet to open; a short goal muscle
    // still gets its question to Coach, as the classic card's row did
    ask: !o?.muscleWeek && ring.short.length ? () => askCoach(`My weekly sets for ${ring.short.join(', ')} are under target for my goal — how should I add volume?`) : null,
    askCoach,
    // sets on unaudited lifts, left out of the ring: said, never hidden
    uncounted: uncountedView(o?.uncounted),
  } : null;

  // ---------------------------------------------------------------- walk --
  // TODAY'S WALK FROM APPLE HEALTH (mockup 104). Every figure is one Health
  // sent; a missing one is left out, never drawn as a zero. Absent when the
  // phone has sent nothing for today.
  const walk = (() => {
    const w = o?.walk;
    if (!w) return null;
    const mins = Number(w.minutes) || 0;
    const clock = (m) => { const t = Math.round(m * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    const tf = (iso) => (iso ? dtf('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(/\s?(am|pm)$/i, (x) => ` ${x.trim().toLowerCase()}`) : null);
    const day = dtf('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${w.date}T12:00:00`));
    const span = w.startISO && w.endISO ? `${tf(w.startISO).replace(/ (am|pm)$/, (x) => (tf(w.endISO).endsWith(x.trim()) ? '' : x))} to ${tf(w.endISO)}` : null;
    const pace = w.distanceKm > 0 ? (() => { const sec = Math.round((mins * 60) / w.distanceKm); return `${Math.floor(sec / 60)}'${String(sec % 60).padStart(2, '0')}"`; })() : null;
    const line = w.counted ? `${Math.round(mins)} minutes on your feet. Today's active rest is done.`
      : !w.qualifies ? `${Math.round(mins)} minutes. Under 15, so it does not tick the day.`
        : w.dayKind === 'training' ? `${Math.round(mins)} minutes, beside today's session, not in place of it.`
          : `${Math.round(mins)} minutes on your feet.`;
    return {
      title: `${w.type}${w.distanceKm ? ` · ${w.distanceKm} km` : ''}`,
      when: `${day}${span ? ` · ${span}` : ''}`,
      line,
      // the ring closes to the 15-minute mark: full once it counts
      ring: Math.max(0.04, Math.min(1, mins / 15)),
      counted: !!w.counted,
      stats: [
        { k: 'time', v: clock(mins) },
        pace ? { k: 'per km', v: pace } : null,
        w.kcal ? { k: 'active kcal', v: String(w.kcal) } : null,
        w.avgHr ? { k: 'avg bpm', v: String(w.avgHr) } : null,
      ].filter(Boolean),
      source: `From Apple Health${w.source ? `, recorded on your ${w.source}` : ''}`,
    };
  })();

  // ------------------------------------------------------------ momentum --
  const mo = o?.momentum;
  const momentum = mo && (mo.prs?.length || mo.plateau || mo.streak >= 2) ? {
    prs: (mo.prs || []).map((p) => ({
      key: `${p.name}:${p.kind}`,
      name: p.name,
      hue: p.muscleGroup ? muscleVar(p.muscleGroup) : 'var(--nv-good)',
      when: p.date ? dtf('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${p.date}T12:00:00`)) : null,
      value: `${p.value} kg`,
      basis: p.kind === 'weight' ? `× ${p.reps} · heaviest ever` : 'estimated one-rep max',
      was: p.previous ? `was ${Math.round(p.previous * 10) / 10} kg` : 'first on record',
    })),
    // the stalled lift in its own muscle's hue: red here is for a discard only
    plateau: mo.plateau ? {
      name: mo.plateau.name, days: mo.plateau.spanDays,
      hue: muscleOfName.get(String(mo.plateau.name || '').toLowerCase()) ? muscleVar(muscleOfName.get(String(mo.plateau.name).toLowerCase())) : 'var(--nv-ink60)',
      open: acts.askPlateau ? () => acts.askPlateau(mo.plateau.name) : null,
    } : null,
    streak: mo.streak >= 2 ? mo.streak : null,
  } : null;

  // ------------------------------------------------------------ recovery --
  const recovery = {
    discarded: v.discardedDraft || null,
    finishMissed: v.finishMissed || null,
    carryovers: (v.carryovers || []).map((c) => {
      // the date it is due and the colour of what it trains, for the week's
      // capsules (mockup 101): Move slides it from that day to the new one
      const raw = (st.liveCarryovers || []).find((x) => x.id === c.id) || {};
      const src = (v.routinesList || []).find((r) => r.name === raw.sourceRoutineName);
      const lead = src?.targetChips?.[0]?.muscle;
      return { ...c, start: enter(c.start), forDate: raw.forDate || null, hue: lead ? muscleVar(lead) : null };
    }),
  };

  // -------------------------------------------------------------- detail --
  const openRoutine = st.workoutsView === 'routine' ? byId.get(st.openRoutineId) || null : null;
  const detail = openRoutine ? (() => {
    const progressions = st.liveWorkoutProgressions || {};
    const rows = (v.routineDetailExercises || []).map((e) => {
      const raw = openRoutine.exercises.find((x) => x.exerciseId === e.exerciseId) || {};
      const prog = progressions[`${openRoutine.id}:${e.exerciseId}`] || null;
      const last = raw.lastSets?.length ? raw.lastSets : null;
      const bodyweight = e.trackingType === 'bodyweight_reps' || e.trackingType === 'bodyweight_time';
      const top = last ? Math.max(...last.map((s) => Number(s.weight) || 0)) : null;
      const reps = e.targetRepsLow === e.targetRepsHigh ? `${e.targetRepsLow}` : `${e.targetRepsLow}–${e.targetRepsHigh}`;
      return {
        id: e.exerciseId,
        name: e.name,
        muscle: e.muscleGroup || null,
        also: e.also || [],
        hue: muscleVar(e.muscleGroup),
        scheme: `${e.targetSets} × ${reps}${e.targetUnit === 'sec' ? ' s' : ''}${raw.dropSets ? ` · ${e.targetSets - raw.dropSets} top + ${raw.dropSets} drop${raw.dropSets === 1 ? '' : 's'}` : ''}`,
        last: !last ? 'not yet done' : bodyweight || !top ? `last ${last[0].reps}${e.targetUnit === 'sec' ? ' s' : ' reps'}` : `last ${top} kg`,
        lastFull: e.lastLabel,
        coach: prog ? (prog.kind === 'weight' ? `Coach +${prog.delta} kg` : prog.kind === 'reps' ? `Coach +${plural(prog.delta, 'rep')}` : prog.kind === 'quality' ? 'Coach: hold and control' : 'Coach: outgrown') : null,
        coachLines: prog ? [prog.focus, prog.evidence].filter(Boolean) : [],
        coachWhy: e.coachOpen || null,
        added: e.coachAdded ? { why: e.coachAdded.why || null, start: e.coachAdded.startWeightKg || null } : null,
        open: e.onOpen,
        more: () => app.setState({ trainSumRow: e.exerciseId, trainSumMoving: null }),
        moving: st.trainSumMoving === e.exerciseId,
        move: () => app.setState({ trainSumMoving: st.trainSumMoving === e.exerciseId ? null : e.exerciseId }),
        up: e.canMoveUp ? e.onMoveUp : null,
        down: e.canMoveDown ? e.onMoveDown : null,
        // REMOVE LEAVES UNDO. The routine's entries as they stood are kept, so
        // Undo puts the lift back where it was with its own sets and reps —
        // through the same updateRoutineExercises every row edit rides.
        remove: () => {
          const r = app.currentRoutine();
          if (!r) return;
          app.setState({ trainSumRemoved: { routineId: r.id, name: e.name, entries: app.routineEntriesFrom(r) }, trainSumRow: null, trainSumMoving: null });
          e.onRemove();
        },
        formCheck: e.formCheck,
        formCheckOpen: () => { app.setState({ trainSumRow: null }); e.formCheckOpen(); },
        unit: e.targetUnit,
        targets: { sets: e.targetSets, low: e.targetRepsLow, high: e.targetRepsHigh, drops: raw.dropSets || 0 },
      };
    });
    const sheetRow = rows.find((r) => r.id === st.trainSumRow) || null;
    const removed = st.trainSumRemoved && st.trainSumRemoved.routineId === openRoutine.id ? st.trainSumRemoved : null;
    const days = Object.entries(st.liveWorkoutSchedule || {}).filter(([, id]) => id === openRoutine.id).map(([d]) => SHORT_DAY[d]).filter(Boolean);
    return {
      id: openRoutine.id,
      name: openRoutine.name,
      sub: `${plural(openRoutine.exercises.length, 'lift')} · about ${estMinutes(openRoutine.exercises.length)} min${days.length ? ` · ${days.join(', ')}` : ''}`,
      back: v.backToRoutines,
      start: enter(v.startWorkout),
      startDisabled: !!v.startWorkoutDisabled,
      history: v.viewWorkoutHistory,
      menu: ({ x, y }) => app.openContextMenu({
        x, y, title: openRoutine.name.toUpperCase(),
        items: [
          { label: 'Ask Coach about it', onSelect: () => askCoach(`Review my ${openRoutine.name} routine — structure, order, anything to change?`) },
          { label: 'Delete routine', danger: true, onSelect: () => v.requestDeleteRoutine() },
        ],
      }),
      // delete asks once, in place; the server keeps no undo for a deleted
      // routine, so this is the one no on the page without a receipt
      deleting: v.routineDeleteConfirm ? { text: `Delete ${openRoutine.name} and take it off the week? Its history stays.`, confirm: v.confirmDeleteRoutine, cancel: v.cancelDeleteRoutine } : null,
      rows,
      sheet: sheetRow ? {
        row: sheetRow,
        close: () => app.setState({ trainSumRow: null }),
        // ONE WRITE FOR THE THREE NUMBERS. The steppers keep a draft and it is
        // saved once, as the sheet closes: three setExerciseTarget calls in a
        // row would each start from the routine as it stood before the first
        // landed, and the last would undo the other two.
        save: (t) => {
          const r = app.currentRoutine();
          if (!r) return;
          const entries = app.routineEntriesFrom(r);
          const i = entries.findIndex((x) => x.exerciseId === sheetRow.id);
          if (i < 0) return;
          const n = (x) => Math.max(1, Math.round(Number(x)) || 1);
          const next = { ...entries[i], targetSets: n(t.sets), targetRepsLow: n(t.low), targetRepsHigh: Math.max(n(t.low), n(t.high)) };
          // drop sets: the last n of the sets, always leaving one top set
          const drops = Math.max(0, Math.min(Math.round(Number(t.drops)) || 0, next.targetSets - 1));
          if (drops) next.dropSets = drops; else delete next.dropSets;
          if (next.targetSets === entries[i].targetSets && next.targetRepsLow === entries[i].targetRepsLow && next.targetRepsHigh === entries[i].targetRepsHigh && (next.dropSets || 0) === (entries[i].dropSets || 0)) return;
          entries[i] = next;
          app.updateRoutineExercises(entries);
        },
      } : null,
      removed: removed ? {
        name: removed.name,
        undo: () => {
          const r = app.currentRoutine();
          app.setState({ trainSumRemoved: null });
          if (r && r.id === removed.routineId) app.updateRoutineExercises(removed.entries);
        },
        dismiss: () => app.setState({ trainSumRemoved: null }),
      } : null,
      picker: { open: !!v.exercisePickerOpen, show: v.openExercisePicker },
      // EDIT MODE (mockup 104): src/vals/valsWorkouts.js routineEdit
      edit: v.routineEdit || null,
    };
  })() : null;

  // --------------------------------------------------------- coach sheet --
  const askingId = st.trainSumAskWhy || null;
  const cards = (deck?.cards || []).map((c) => ({
    ...c,
    // the discard-with-reason path plays the Inbox's leave beat; the card
    // folds away on the same clock
    state: leaving[c.id] === 'discard' ? 'leaving' : c.state,
    asking: askingId === c.id,
    // ✕ ASKS WHY (UI-REDESIGN-SPEC 6, the audit's finding 6). A card his own
    // edits have overtaken is cleared with that as its reason, unasked.
    no: c.stale
      ? () => app.inboxAction(c.id, 'discard', `Already changed: ${c.stale}`)
      : () => app.setState({ trainSumAskWhy: askingId === c.id ? null : c.id, trainSumWhyPick: null, trainSumWhyText: '' }),
  }));
  const askingCard = cards.find((c) => c.id === askingId) || null;
  const coachSheet = {
    open: st.trainTab === 'coach',
    // the sheet's history entry, asked for as it mounts (App.trainCoachEntry)
    entry: () => app.trainCoachEntry(),
    close: () => app.closeTrainCoach(),
    count: waiting.count,
    where: deck?.where || '',
    deck: deck && cards.length ? { ...deck, cards } : null,
    declineAsking: askingCard ? {
      id: askingCard.id,
      reasons: COACH_DECLINE_REASONS,
      picked: st.trainSumWhyPick || null,
      pick: (r) => app.setState({ trainSumWhyPick: st.trainSumWhyPick === r ? null : r }),
      text: st.trainSumWhyText || '',
      setText: (e) => app.setState({ trainSumWhyText: typeof e === 'string' ? e : e.target.value }),
      // THE REASON RIDES THE RECORD: the Inbox's own discard-with-reason
      // (App.inboxAction, which sends the reason to the server), never the
      // bare discard the classic deck's ✕ still calls
      confirm: (reasonArg) => {
        const reason = reasonArg || declineReason(st.trainSumWhyPick, st.trainSumWhyText);
        app.setState({ trainSumAskWhy: null, trainSumWhyPick: null, trainSumWhyText: '', trainSumPassed: { id: askingCard.id, headline: askingCard.headline, reason: reason || null } });
        app.inboxAction(askingCard.id, 'discard', reason);
      },
      keep: () => app.setState({ trainSumAskWhy: null, trainSumWhyPick: null, trainSumWhyText: '' }),
    } : null,
    receipt: st.trainSumPassed ? {
      headline: st.trainSumPassed.headline,
      reason: st.trainSumPassed.reason,
      undo: () => { const id = st.trainSumPassed.id; app.setState({ trainSumPassed: null }); app.reopenCoachSuggestion(id); },
    } : null,
  };

  return {
    trainSummary: {
      view: detail ? 'routine' : st.workoutsView === 'history' ? 'history' : 'page',
      hero,
      week,
      coach,
      routines: routineTiles,
      create,
      rename,
      shelf,
      allSessions: v.openAllSessions,
      quick,
      hardSets,
      walk,
      momentum,
      recovery,
      detail,
      coachSheet,
      todayKey,
    },
  };
}

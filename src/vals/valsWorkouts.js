import { weekData } from '../data.js';
import { bubble } from './shared.js';
import { dtf } from './fmt.js';

// The next N days (today → today+N) as {iso, short} for day pickers.
function nextDays(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const short = i === 1 ? 'Tomorrow' : dtf('en-GB', { weekday: 'long' }).format(d);
    out.push({ iso, short });
  }
  return out;
}

// Workouts (Train) domain: live routines/schedule/sessions/history and the
// exercise picker, plus the demo-mode mock plan + Coach chat.
// Adds to ctx: usingLiveWorkouts, liveRoutines, todayRoutine.
export function valsWorkouts(app, ctx) {
  const st = app.state;

  // the redesigned TODAY pane (TrainToday.jsx) — one overview object, and
  // actions that route into flows that already exist (begin the scheduled
  // routine; feed cards open the Coach with the question pre-asked)
  const overview = st.liveTrainOverview || null;
  const overviewRoutine = overview?.today
    ? (st.liveWorkoutRoutines || []).find((r) => r.id === overview.today.routineId) || null
    : null;
  // a PARKED session must surface instantly, everywhere — from device
  // state alone, never waiting on the snapshot ("takes longer than I'd
  // like to refresh so I can resume", 19 Aug)
  const parked = st.workoutSession && st.workoutsView !== 'session' ? {
    name: st.workoutSession.routineName,
    done: st.workoutSession.exercises.reduce((n, e2) => n + e2.sets.filter((s2) => s2.done).length, 0),
    go: () => app.setState({ trainTab: 'gym', workoutsView: 'session' }),
  } : null;
  const trainToday = {
    o: overview,
    resume: parked,
    actions: {
      // BEGIN lands you in the logger; feed cards land you in the Coach
      // with the question already asked — every card is a doorway
      begin: overviewRoutine ? () => { app.setState({ trainTab: 'gym' }); app.startWorkoutSession(overviewRoutine); } : null,
      // the plateau card now opens a VERDICT first — evidence before advice
      askPlateau: (name) => app.openVerdict('stalled', name),
      askTired: () => app.openVerdict('tired'),
      askPeak: () => app.openVerdict('peak'),
      askVolume: (muscles) => { app.setState({ trainTab: 'coach' }); app.doCoach(`My weekly sets for ${muscles} are under target for my goal — how should I add volume?`); },
      // the Coach's open program ask: take it, or say no. Either way it
      // stops asking — an answered question is answered.
      applyCoachAsk: (recordId) => app.resolveCoachAsk(recordId, true),
      dismissCoachAsk: (recordId) => app.resolveCoachAsk(recordId, false),
    },
  };
  // the three-surface structure from the mockup. A live workout DEFAULTS
  // to GYM but never locks him there — consulting the Coach mid-session is
  // the whole point of a coach ("can't switch tabs during a workout" was
  // his bug report, 19 Aug). The session lives in state; leaving the tab
  // parks it, the LIVE chip on GYM leads back.
  const trainTab = st.trainTab || (st.workoutSession ? 'gym' : (overview ? 'today' : 'gym'));
  // starter chips — the mockup's quick-replies, composed from LIVE signals
  // so they're always worth tapping (never canned filler)
  const coachChips = (() => {
    const chips = [];
    const o = overview;
    if (o?.momentum?.plateau) chips.push({ label: `WHY IS ${o.momentum.plateau.name.split(' (')[0].toUpperCase()} STALLED?`, tone: 'warn', q: `Why is my ${o.momentum.plateau.name} stalled, and what's the fix?` });
    const under = (o?.volume || []).filter((v2) => v2.goalMuscle && v2.sets < v2.target).map((v2) => v2.muscle);
    if (under.length) chips.push({ label: `ADD ${under[0].toUpperCase()} VOLUME`, tone: 'gold', q: `My ${under.join(' and ')} volume is under target for my goal — restructure my week to fix it.` });
    if (o?.deload?.advise) chips.push({ label: 'SHOULD I DELOAD TODAY?', tone: 'warn', q: 'Recovery flagged a deload — how should I adjust today, exactly?' });
    if (o?.today) chips.push({ label: `PLAN TODAY'S ${o.today.name.toUpperCase()}`, tone: null, q: `Walk me into today's ${o.today.name} — what matters most this session?` });
    chips.push({ label: 'REVIEW MY WEEK', tone: null, q: 'Review my training week — volume, effort, anything drifting.' });
    return chips.slice(0, 4).map((c) => ({ label: c.label, tone: c.tone, go: () => app.doCoach(c.q) }));
  })();
  const trainTabs = [
    { key: 'today', label: 'TODAY' },
    { key: 'gym', label: 'GYM', live: !!st.workoutSession }, // ● a session is running — the way back
    { key: 'coach', label: 'COACH' },
  ].map((t) => ({ ...t, on: trainTab === t.key, go: () => app.setState({ trainTab: t.key }) }));

  const plan = st.plan || app.basePlan;
  const week = weekData.map(d => {
    const s = d[2];
    return { day: d[0], label: d[1], style: { flex: '1', minWidth: '62px', textAlign: 'center', padding: '10px 6px', borderRadius: '10px',
      border: s === 'today' ? '1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)',
      background: s === 'today' ? 'color-mix(in srgb, var(--nv-cy) 07%, transparent)' : 'rgba(0,0,0,.18)',
      color: s === 'today' ? 'var(--nv-cy)' : s === 'skip' ? 'color-mix(in srgb, var(--nv-warn) 85%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)',
      boxShadow: s === 'today' ? '0 0 24px -8px color-mix(in srgb, var(--nv-cy) 50%, transparent)' : 'none' } };
  });

  // workouts — live (real routines/history in Wiki/Health) or mock, depending on Settings connection
  const usingLiveWorkouts = !!st.liveWorkoutRoutines;
  const liveRoutines = st.liveWorkoutRoutines || [];
  const liveSchedule = st.liveWorkoutSchedule || {};
  const liveWeekdays = st.liveWorkoutWeekdays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const WEEKDAY_SHORT = { monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN' };
  const todayWeekday = WEEKDAY_NAMES[new Date().getDay()];

  // Pushed-forward exercises change what a day actually holds — the plan
  // must say so. Map each upcoming weekday to its date and overlay any
  // carry-over landing there ("Pull + Push round-up · 3").
  const dateForWeekday = (day) => {
    const target = WEEKDAY_NAMES.indexOf(day);
    const d = new Date();
    d.setDate(d.getDate() + ((target - d.getDay()) + 7) % 7); // today or the next occurrence
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const carryoversByDate = new Map();
  for (const c of (st.liveCarryovers || [])) {
    carryoversByDate.set(c.forDate, [...(carryoversByDate.get(c.forDate) || []), c]);
  }

  const weekStrip = liveWeekdays.map((day) => {
    const routineId = liveSchedule[day] || '';
    const isToday = day === todayWeekday;
    const dayCarryovers = carryoversByDate.get(dateForWeekday(day)) || [];
    const carryoverNote = dayCarryovers.length
      ? `+ ${dayCarryovers.map((c) => `${c.sourceRoutineName} round-up · ${c.exercises.length}`).join(' & ')}`
      : null;
    return {
      day, dayLabel: WEEKDAY_SHORT[day], isToday, carryoverNote,
      style: { flex: '1', minWidth: '62px', textAlign: 'center', padding: '10px 6px', borderRadius: '10px',
        border: isToday ? '1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)',
        background: isToday ? 'color-mix(in srgb, var(--nv-cy) 07%, transparent)' : 'rgba(0,0,0,.18)',
        boxShadow: isToday ? '0 0 24px -8px color-mix(in srgb, var(--nv-cy) 50%, transparent)' : 'none' },
      labelColor: isToday ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)',
      value: routineId,
      onChange: (e) => app.assignScheduleDay(day, e.target.value || null),
      options: [
        { value: '', label: 'Rest' },
        { value: 'active-rest', label: 'Active rest' },
        ...liveRoutines.map((r) => ({ value: r.id, label: r.name })),
      ],
    };
  });

  const routinesList = liveRoutines.map((r) => ({
    id: r.id,
    name: r.name,
    exercisesPreview: r.exercises.length
      ? r.exercises.slice(0, 3).map((e) => e.name).join(', ') + (r.exercises.length > 3 ? ` +${r.exercises.length - 3} more` : '')
      : 'No exercises yet',
    completedCount: r.completedCount,
    onOpen: () => app.openRoutine(r.id),
    // spec #13: hold a routine card for its secondary actions
    onLongPress: ({ x, y }) => app.openContextMenu({
      x, y, title: r.name.toUpperCase(),
      items: [
        { label: 'Start session', hint: `${r.exercises.length} exercises`, onSelect: () => app.startWorkoutSession(r) },
        { label: 'Open & edit', onSelect: () => app.openRoutine(r.id) },
        { label: 'History', hint: `${r.completedCount}×`, onSelect: () => app.openWorkoutHistory(r.id) },
        { label: 'Ask Coach about it', onSelect: () => { app.setState({ trainTab: 'coach' }); app.doCoach(`Review my ${r.name} routine — structure, order, anything to change?`); } },
      ],
    }),
  }));

  // The mockup's GYM hero: today's card, front and centre — the day's most
  // important action must never hide behind a routine tile. Rest days say
  // so honestly (with the recovery focus when one exists) instead of
  // pretending there's a session to start.
  const gymHero = (() => {
    if (!usingLiveWorkouts || st.workoutSession) return null;
    const o = overview;
    if (!o) return null;
    if (o.restDay) {
      return { rest: true, focusText: (o.focus && o.focus.kind === 'rest') ? o.focus.text : 'Active rest — move, don’t load. The week’s work lands while you recover.' };
    }
    if (!o.today) return null;
    const r = liveRoutines.find((x) => x.id === o.today.routineId);
    const estMin = Math.round((o.today.exerciseCount * 8 + 4) / 5) * 5;
    return {
      rest: false,
      name: o.today.name,
      meta: `${o.today.exerciseCount} exercises · ~${estMin} min${o.today.lastVolume ? ` · last time ${o.today.lastVolume.toLocaleString()} kg` : ''}`,
      begin: r ? () => app.startWorkoutSession(r) : null,
    };
  })();

  const openRoutine = usingLiveWorkouts ? liveRoutines.find((r) => r.id === st.openRoutineId) || null : null;
  const isTimeTracking = (tt) => tt === 'weight_time' || tt === 'bodyweight_time';
  const isBodyweightTracking = (tt) => tt === 'bodyweight_reps' || tt === 'bodyweight_time';
  const targetUnit = (tt) => isTimeTracking(tt) ? 'sec' : 'reps';
  const formatSet = (tt, s) => {
    if (tt === 'bodyweight_reps') return `${s.reps} reps`;
    if (tt === 'bodyweight_time') return `${s.reps}s`;
    if (tt === 'weight_time') return `${s.weight}kg×${s.reps}s`;
    if (tt === 'weighted_bodyweight_reps') return `BW+${s.weight}kg×${s.reps}`;
    return `${s.weight}kg×${s.reps}`;
  };
  const setsLabel = (tt, sets) => sets && sets.length ? sets.map((s) => formatSet(tt, s)).join(', ') : 'Not yet performed';

  const progressions = st.liveWorkoutProgressions || {};
  const coachChipLabel = (c) => c ? (c.kind === 'outgrown' ? 'COACH: OUTGROWN →' : c.kind === 'weight' ? `COACH +${c.delta}KG` : `COACH +${c.delta} REP`) : null;
  // an OUTGROWN chip is a doorway, not a number: tapping it opens the Coach
  // with the prescription-change conversation already started
  const coachChipAsk = (c, name) => (c && c.kind === 'outgrown')
    ? () => { app.setState({ trainTab: 'coach' }); app.doCoach(`My ${name} has outgrown its rep target (${c.evidence}) — propose the concrete change: weighted, a harder variation from my library, or new targets. Make the case.`); }
    : null;

  const routineDetailExercises = openRoutine ? openRoutine.exercises.map((e, i, arr) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    muscleGroup: e.muscleGroup,
    trackingType: e.trackingType,
    targetUnit: targetUnit(e.trackingType),
    targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh,
    coachLabel: coachChipLabel(progressions[`${openRoutine.id}:${e.exerciseId}`]),
    coachEvidence: progressions[`${openRoutine.id}:${e.exerciseId}`]?.evidence || null,
    lastLabel: setsLabel(e.trackingType, e.lastSets),
    canMoveUp: i > 0, canMoveDown: i < arr.length - 1,
    onMoveUp: () => app.moveExerciseInRoutine(e.exerciseId, -1),
    onMoveDown: () => app.moveExerciseInRoutine(e.exerciseId, 1),
    onRemove: () => app.removeExerciseFromRoutine(e.exerciseId),
    onTargetSetsBlur: (ev) => app.setExerciseTarget(e.exerciseId, 'targetSets', ev.target.value),
    onTargetLowBlur: (ev) => app.setExerciseTarget(e.exerciseId, 'targetRepsLow', ev.target.value),
    onTargetHighBlur: (ev) => app.setExerciseTarget(e.exerciseId, 'targetRepsHigh', ev.target.value),
  })) : [];

  const pickerQuery = st.exercisePickerQuery.trim().toLowerCase();
  const pickerMuscle = st.exercisePickerMuscle;
  const pickerMode = st.exercisePickerMode || 'routine';
  const libraryExercises = st.liveWorkoutExercises || [];
  const exercisesById = new Map(libraryExercises.map((e) => [e.id, e]));
  // 'routine' mode hides what the TEMPLATE already has; 'session' mode
  // hides what is already logged THIS session — a different exclusion, so
  // he never gets offered a duplicate in either context
  const alreadyInRoutine = new Set((openRoutine?.exercises || []).map((e) => e.exerciseId));
  const alreadyInSession = new Set((st.workoutSession?.exercises || []).map((e) => e.exerciseId));
  const pickerExclude = pickerMode === 'session' ? alreadyInSession : alreadyInRoutine;
  const exercisePickerResults = libraryExercises
    .filter((e) => !pickerExclude.has(e.id))
    .filter((e) => pickerMuscle === 'Any' || e.muscleGroup === pickerMuscle)
    .filter((e) => !pickerQuery || e.name.toLowerCase().includes(pickerQuery))
    .slice(0, 60)
    .map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, onAdd: () => (pickerMode === 'session' ? app.addExerciseToSession(e.id) : app.addExerciseToRoutine(e.id)) }));
  const exercisePickerExactMatch = libraryExercises.some((e) => e.name.toLowerCase() === pickerQuery);
  const exercisePickerShowCreate = pickerQuery.length > 0 && !exercisePickerExactMatch;
  const TRACKING_TYPE_LABEL = { weight_reps: 'Weight × Reps', bodyweight_reps: 'Bodyweight × Reps', weight_time: 'Weight × Time', bodyweight_time: 'Bodyweight × Time', weighted_bodyweight_reps: 'Weighted Bodyweight × Reps' };

  const session = st.workoutSession;
  const PAIN_AREAS = {
    Chest: ['Shoulder', 'Elbow', 'Wrist'], Shoulders: ['Shoulder', 'Neck', 'Elbow'], Triceps: ['Elbow', 'Shoulder', 'Wrist'],
    Back: ['Lower back', 'Shoulder', 'Elbow'], Biceps: ['Elbow', 'Forearm', 'Shoulder'], Forearms: ['Forearm', 'Wrist', 'Elbow'],
    Quads: ['Knee', 'Hip', 'Lower back'], Hamstrings: ['Hamstring', 'Knee', 'Lower back'], Glutes: ['Hip', 'Lower back', 'Glute'],
    Calves: ['Calf', 'Ankle', 'Achilles'], Abs: ['Lower back', 'Hip'], 'Full Body': ['Lower back', 'Knee', 'Shoulder'],
  };
  const PAIN_OTHER = ['Neck', 'Upper back', 'Lower back', 'Hip', 'Knee', 'Ankle', 'Foot', 'Groin', 'Hamstring', 'Achilles'];
  const pain = st.sessionPain || null;
  const libraryById = new Map(libraryExercises.map((x) => [x.id, x]));
  const sessionExercises = session ? session.exercises.map((e, exIdx) => ({
    exerciseId: e.exerciseId, name: e.name, trackingType: e.trackingType,
    // THE LIBRARY IS THE AUTHORITY, not the copy frozen into the session when
    // it started. The weekly volume is counted server-side from the library
    // (groupOf.get(exerciseId)), so the note beside the exercise must read
    // from the same place — otherwise it would reassure him about a number
    // it isn't actually describing.
    muscleGroup: libraryById.get(e.exerciseId)?.muscleGroup || e.muscleGroup || 'Other',
    // ▶ FORM — on EVERY lift (the mockup's contract). Curated link when
    // one is filed; otherwise an honest, deterministic technique search —
    // never a dead chip, never a pretend curation.
    formUrl: libraryById.get(e.exerciseId)?.resourceUrl
      || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.name} form technique`)}`,
    formCurated: !!libraryById.get(e.exerciseId)?.resourceUrl,
    // spec #13: hold the exercise header for its secondary actions
    onLongPress: ({ x, y }) => app.openContextMenu({
      x, y, title: e.name.toUpperCase(),
      items: [
        libraryById.get(e.exerciseId)?.resourceUrl
          ? { label: '▶ Form video', hint: 'curated', onSelect: () => window.open(libraryById.get(e.exerciseId).resourceUrl, '_blank', 'noopener') }
          : { label: 'Find me a form video', hint: 'Coach curates', onSelect: () => { app.setState({ trainTab: 'coach' }); app.doCoach(`Find the best form video for ${e.name} (from a reputable coach) and propose saving it to the exercise.`); } },
        { label: e.anomaly ? 'Unflag anomaly' : 'Flag anomaly — off day', onSelect: () => app.updateSessionExerciseField(exIdx, 'anomaly', !e.anomaly) },
        { label: 'Report pain', danger: true, onSelect: () => app.setState({ sessionPain: { exIdx, area: null, side: null, when: null, detail: '' } }) },
        { label: e.skipped ? 'Un-skip today' : 'Skip today', onSelect: () => app.toggleSessionExerciseSkipped(exIdx) },
        { label: 'Ask Coach about this lift', onSelect: () => { app.setState({ trainTab: 'coach' }); app.doCoach(`Mid-session — talk me through ${e.name}: cues, common mistakes, and what matters most for my goals.`); } },
        // only an EXTRA (this-session-only) exercise can be pulled out
        // whole — a programmed one is skipped, never deleted
        ...(e.adhoc ? [{ label: 'Remove — this session only', danger: true, onSelect: () => app.removeExerciseFromSession(exIdx) }] : []),
      ],
    }),
    coachLabel: coachChipLabel(e.coach), coachEvidence: e.coach?.evidence || null,
    coachAsk: coachChipAsk(e.coach, e.name),
    weightHint: e.weightHint || null,
    // last session, verbatim — so a coach-raised prefill is a visible choice,
    // not a silent replacement of what he actually lifted
    lastLabel: e.last?.sets?.length ? `Last${e.last.date ? ` (${e.last.date})` : ''}: ${e.last.sets.map((s) => `${s.weight || 0}×${s.reps || 0}`).join(', ')}` : null,
    focusNote: e.focusNote || null,
    adhoc: !!e.adhoc, // this session only — his 21-Aug ask, a temporary extra lift
    isTime: isTimeTracking(e.trackingType), isBodyweight: isBodyweightTracking(e.trackingType),
    weightLabel: e.trackingType === 'weighted_bodyweight_reps' ? '+KG' : 'KG',
    amountLabel: isTimeTracking(e.trackingType) ? 'SEC' : 'REPS',
    targetLabel: `Target: ${e.targetSets} × ${e.targetRepsLow}-${e.targetRepsHigh} ${targetUnit(e.trackingType)}`,
    onAddSet: () => app.addSessionSet(exIdx),
    // dropped for today only — the program is untouched, tap again to undo
    skipped: !!e.skipped,
    onToggleSkip: () => app.toggleSessionExerciseSkipped(exIdx),
    // cockpit fields
    note: e.note || '',
    onNote: (ev) => app.updateSessionExerciseField(exIdx, 'note', ev.target.value),
    anomaly: !!e.anomaly,
    toggleAnomaly: () => app.updateSessionExerciseField(exIdx, 'anomaly', !e.anomaly),
    painLogged: e.pain || null,
    painOpen: pain?.exIdx === exIdx,
    openPain: () => app.setState({ sessionPain: { exIdx, area: null, side: null, when: null, detail: '' } }),
    closePain: () => app.setState({ sessionPain: null }),
    painAreas: PAIN_AREAS[e.muscleGroup] || ['Shoulder', 'Elbow', 'Knee'],
    painOther: PAIN_OTHER,
    painState: pain?.exIdx === exIdx ? pain : null,
    setPainField: (field) => (val) => app.setState({ sessionPain: { ...st.sessionPain, [field]: val } }),
    submitPain: () => app.askPainCoach(exIdx),
    sets: e.sets.map((s, setIdx) => ({
      weight: s.weight, reps: s.reps, rpe: s.rpe || '', done: s.done,
      rir: s.rir ?? '',
      onRir: (ev) => app.updateSessionSet(exIdx, setIdx, 'rir', typeof ev === 'string' ? ev : ev.target.value),
      setType: s.setType || 'working',
      cycleType: () => app.updateSessionSet(exIdx, setIdx, 'setType', (s.setType === 'warmup' ? 'working' : s.setType === 'backoff' ? 'warmup' : 'backoff')),
      // accept a plain string (LocalInput) as well as an event (anything
      // still passing one) — the set fields are local-echo inputs now
      onWeight: (ev) => app.updateSessionSet(exIdx, setIdx, 'weight', typeof ev === 'string' ? ev : ev.target.value),
      onReps: (ev) => app.updateSessionSet(exIdx, setIdx, 'reps', typeof ev === 'string' ? ev : ev.target.value),
      onRpe: (ev) => app.updateSessionSet(exIdx, setIdx, 'rpe', typeof ev === 'string' ? ev : ev.target.value),
      onToggleDone: () => app.toggleSessionSetDone(exIdx, setIdx),
      onRemove: () => app.removeSessionSet(exIdx, setIdx),
      canRemove: e.sets.length > 1,
    })),
  })) : [];

  const historySessions = (st.liveWorkoutHistory || []).map((s) => ({
    id: s.id,
    date: s.date,
    totalSets: s.exercises.reduce((n, e) => n + e.sets.length, 0),
    totalVolume: Math.round(s.exercises.reduce((v, e) => v + e.sets.reduce((sv, set) => sv + set.weight * set.reps, 0), 0)),
    exercises: s.exercises.map((e) => ({ name: e.name, setsLabel: setsLabel((exercisesById.get(e.exerciseId) || {}).trackingType || 'weight_reps', e.sets) })),
    onEdit: () => app.editHistorySession(s),
    deleteConfirm: st.sessionDeleteConfirmId === s.id,
    requestDelete: () => app.setState({ sessionDeleteConfirmId: s.id }),
    cancelDelete: () => app.setState({ sessionDeleteConfirmId: null }),
    confirmDelete: () => { app.setState({ sessionDeleteConfirmId: null }); app.deleteHistorySession(s.id); },
  }));
  const historyRoutine = liveRoutines.find((r) => r.id === st.historyRoutineId);
  const todayRoutineId = liveSchedule[todayWeekday];
  const todayActiveRest = todayRoutineId === 'active-rest';
  const todayRoutine = todayRoutineId && !todayActiveRest ? liveRoutines.find((r) => r.id === todayRoutineId) : null;

  // shared with valsMission (workout card + suggested focus)
  Object.assign(ctx, { usingLiveWorkouts, liveRoutines, todayRoutine, todayActiveRest });

  return {
    trainToday,
    coachChips,
    trainTab,
    trainTabs,
    usingLiveWorkouts,
    workoutsView: st.workoutsView,
    week,
    plan: plan.map((ex, i) => ({ idx: String(i + 1).padStart(2, '0'), name: ex.name, scheme: ex.scheme, pr: ex.pr })),
    planMeta: plan.length + ' LIFTS · ' + (st.planNote ? 'EDITED BY COACH' : '~42 MIN · AS PLANNED'),
    planNoteOn: !!st.planNote, planNote: st.planNote,
    coachMsgs: st.coachChat.map(m => Object.assign({
      text: m.text, typing: m.typing,
      tag: m.who === 'coach' ? '» COACH' : m.who === 'system' ? '» SYSTEM' : '» YOU',
      tagStyle: { font: "500 10px var(--nv-font-mono)", color: m.who === 'coach' ? 'var(--nv-cy)' : m.who === 'system' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' },
    }, bubble(m.who))),
    // "reading your history…" shows only until the first streamed words
    // arrive — once the reply is visibly being written, the line is noise
    coachBusy: st.coachBusy && !st.coachChat.some((m) => m.streaming),
    coachContinuing: !!st.coachSessionId,
    newCoachChat: () => app.newCoachChat(),
    coachInput: st.coachInput,
    setCoachInput: (e) => app.setState({ coachInput: e.target.value }),
    coachKey: (e) => { if (e.key === 'Enter') app.doCoach(); },
    sendCoach: () => app.doCoach(),
    quickMinutes: st.quickMinutes,
    setQuickMinutes: (e) => app.setState({ quickMinutes: e.target.value }),
    quickNote: st.quickNote,
    setQuickNote: (e) => app.setState({ quickNote: e.target.value }),
    quickBusy: st.quickBusy,
    buildQuickSession: () => app.buildQuickSession(),
    quickPlan: st.quickPlan ? {
      name: st.quickPlan.name,
      rationale: st.quickPlan.rationale,
      exercises: st.quickPlan.exercises.map((e) => ({
        key: e.exerciseId,
        label: `${e.name} — ${e.targetSets} × ${e.targetRepsLow}${e.weightHint ? ` · ${e.weightHint}` : ''}${e.adhoc ? ' · NEW' : ''}`,
      })),
      start: () => app.startQuickPlanSession(),
      dismiss: () => app.setState({ quickPlan: null }),
    } : null,
    goalsSet: !!st.liveWorkoutGoals,
    goalsView: st.liveWorkoutGoals ? {
      goal: st.liveWorkoutGoals.goal,
      focus: st.liveWorkoutGoals.focus,
      notes: st.liveWorkoutGoals.notes,
      meta: [st.liveWorkoutGoals.daysPerWeek ? `${st.liveWorkoutGoals.daysPerWeek} DAYS/WEEK` : null, st.liveWorkoutGoals.updated ? `UPDATED ${st.liveWorkoutGoals.updated}` : null].filter(Boolean).join(' · '),
    } : null,
    goalsEditing: st.goalsEditing,
    goalsDraft: st.goalsDraft,
    startGoalsEdit: () => app.setState({
      goalsEditing: true,
      goalsDraft: {
        goal: st.liveWorkoutGoals?.goal || '',
        focus: st.liveWorkoutGoals?.focus || '',
        daysPerWeek: st.liveWorkoutGoals?.daysPerWeek || '',
        equipment: st.liveWorkoutGoals?.equipment || '',
        limitations: st.liveWorkoutGoals?.limitations || '',
        notes: st.liveWorkoutGoals?.notes || '',
      },
    }),
    cancelGoalsEdit: () => app.setState({ goalsEditing: false }),
    setGoalsField: (field) => (e) => app.setState((s) => ({ goalsDraft: { ...s.goalsDraft, [field]: e.target.value } })),
    saveGoals: () => app.saveFitnessGoals(),

    workoutHeaderLabel: usingLiveWorkouts ? `${liveRoutines.length} ROUTINE${liveRoutines.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
    // demo fiction is demoMode-ONLY — a connected session whose workouts fetch
    // failed shows an honest unavailable state, never the scripted plan
    workoutsDemo: ctx.demoMode,
    weekStrip,
    routinesList,
    gymHero,
    sessionLive: !!st.workoutSession,
    // an accidental discard is recoverable for 7 days — the offer only
    // appears when the archived session actually holds ticked work
    discardedDraft: (!st.workoutSession && st.discardedDraft) ? {
      name: st.discardedDraft.workoutSession?.routineName || 'workout',
      sets: st.discardedDraft.tickedSets,
      when: st.discardedDraft.clearedAt ? new Date(st.discardedDraft.clearedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '',
      restore: () => app.restoreDiscardedSession(),
      dismiss: () => app.setState({ discardedDraft: null }),
    } : null,
    routineCreating: st.routineCreating,
    routineNewName: st.routineNewName,
    setRoutineNewName: (e) => app.setRoutineNewName(e),
    startCreateRoutine: () => app.startCreateRoutine(),
    submitCreateRoutine: () => app.submitCreateRoutine(),
    cancelCreateRoutine: () => app.cancelCreateRoutine(),

    openRoutineName: openRoutine ? openRoutine.name : '',
    routineDetailExercises,
    routineDeleteConfirm: st.routineDeleteConfirm,
    backToRoutines: () => app.backToRoutines(),
    startWorkout: openRoutine ? () => app.startWorkoutSession(openRoutine) : () => {},
    startWorkoutDisabled: !openRoutine || !openRoutine.exercises.length,
    viewWorkoutHistory: openRoutine ? () => app.openWorkoutHistory(openRoutine.id) : () => {},
    requestDeleteRoutine: () => app.requestDeleteRoutine(),
    cancelDeleteRoutine: () => app.cancelDeleteRoutine(),
    confirmDeleteRoutine: openRoutine ? () => app.confirmDeleteRoutine(openRoutine.id) : () => {},

    exercisePickerOpen: st.exercisePickerOpen,
    exercisePickerMode: pickerMode,
    openExercisePicker: () => app.openExercisePicker(),
    openSessionExercisePicker: () => app.openSessionExercisePicker(),
    closeExercisePicker: () => app.closeExercisePicker(),
    exercisePickerQuery: st.exercisePickerQuery,
    setExercisePickerQuery: (e) => app.setExercisePickerQuery(e),
    exercisePickerMuscle: st.exercisePickerMuscle,
    exercisePickerMuscleGroups: ['Any', ...(st.liveWorkoutMuscleGroups || [])],
    setExercisePickerMuscle: (m) => app.setExercisePickerMuscle(m),
    exercisePickerResults,
    exercisePickerShowCreate,
    exercisePickerCreateMuscle: st.exercisePickerCreateMuscle,
    setExercisePickerCreateMuscle: (m) => app.setExercisePickerCreateMuscle(m),
    exercisePickerCreateTrackingType: st.exercisePickerCreateTrackingType,
    setExercisePickerCreateTrackingType: (t) => app.setExercisePickerCreateTrackingType(t),
    exercisePickerTrackingTypeOptions: (st.liveWorkoutTrackingTypes || []).map((t) => ({ value: t, label: TRACKING_TYPE_LABEL[t] || t })),
    createExercise: () => app.createAndAddExercise(st.exercisePickerQuery.trim(), st.exercisePickerCreateMuscle, st.exercisePickerCreateTrackingType),

    sessionRoutineName: session ? session.routineName : '',
    sessionEditing: !!st.editingSessionId,
    sessionExercises,
    // finishing-early chips (P2): visible only when something is undone
    sessionHasUndone: !!session && session.exercises.some((e2) => e2.skipped || !e2.sets.every((s2) => s2.done)),
    sessionCutShort: st.sessionCutShort || null,
    setSessionCutShort: (r) => app.setState({ sessionCutShort: st.sessionCutShort === r ? null : r }),
    sessionCancelConfirm: st.sessionCancelConfirm,
    finishSession: () => app.finishWorkoutSession(),
    saveForLater: () => app.saveWorkoutForLater(),
    canSaveForLater: !st.editingSessionId, // editing a past session isn't "in progress"
    requestCancelSession: () => app.requestCancelSession(),
    cancelSessionCancel: () => app.cancelSessionCancel(),
    discardSession: () => app.discardWorkoutSession(),

    // a parked, unfinished session — surfaced on the routine list to resume.
    // Age shown honestly: a draft from two days ago says so.
    resumeSession: st.workoutSession && st.workoutsView !== 'session' && !st.editingSessionId ? (() => {
      const ageMs = st.workoutSessionSavedAt ? Date.now() - st.workoutSessionSavedAt : 0;
      const ageLabel = ageMs < 3600_000 ? 'saved, not finished'
        : ageMs < 24 * 3600_000 ? `draft from ${Math.round(ageMs / 3600_000)}h ago`
        : `draft from ${Math.round(ageMs / 86400_000)} day${Math.round(ageMs / 86400_000) === 1 ? '' : 's'} ago`;
      return {
        routineName: st.workoutSession.routineName,
        done: st.workoutSession.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
        ageLabel,
        resume: () => app.resumeWorkoutSession(),
      };
    })() : null,

    // after finishing with exercises left undone — push them to a day
    finishMissed: st.finishMissed ? {
      count: st.finishMissed.length,
      names: st.finishMissed.map((e) => e.name).join(', '),
      date: st.finishMissedDate,
      dateLabel: st.finishMissedDate ? new Date(`${st.finishMissedDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }) : '',
      dayOptions: nextDays(7).map((d) => ({ value: d.iso, label: d.short })),
      setDate: (e) => app.setFinishMissedDate(e.target.value),
      push: () => app.pushMissedToDay(),
      dismiss: () => app.dismissFinishMissed(),
    } : null,

    // carry-overs waiting to be done (missed exercises pushed forward)
    carryovers: (st.liveCarryovers || []).map((c) => {
      const days = Math.round((new Date(`${c.forDate}T12:00:00`) - new Date(new Date().toDateString())) / 86400000);
      return {
        id: c.id,
        title: `${c.sourceRoutineName} — makeup`,
        names: c.exercises.map((e) => e.name).join(', '),
        count: c.exercises.length,
        when: days < 0 ? `overdue since ${c.forDate}` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due ${dtf('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }).format(new Date(`${c.forDate}T12:00:00`))}`,
        overdue: days < 0,
        dueSoon: days <= 0,
        start: () => app.startCarryoverSession(c),
        rescheduling: st.carryoverRescheduleId === c.id,
        startReschedule: () => app.setState({ carryoverRescheduleId: c.id }),
        cancelReschedule: () => app.setState({ carryoverRescheduleId: null }),
        dayOptions: nextDays(7).map((d) => ({ value: d.iso, label: d.short })),
        reschedule: (e) => app.rescheduleCarryoverTo(c.id, e.target.value),
        remove: () => app.removeCarryoverItem(c.id),
      };
    }),

    historyRoutineName: historyRoutine ? historyRoutine.name : (st.workoutsView === 'history' && !st.historyRoutineId ? 'All sessions' : ''),
    historySessions,
    historyLoading: st.workoutsView === 'history' && st.liveWorkoutHistory === null,
    backFromWorkoutHistory: () => app.backFromWorkoutHistory(),
    openAllSessions: () => app.openWorkoutHistory(null),
  };
}

import { weekData } from '../data.js';
import { bubble } from './shared.js';

// The next N days (today → today+N) as {iso, short} for day pickers.
function nextDays(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const short = i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'long' });
    out.push({ iso, short });
  }
  return out;
}

// Workouts (Train) domain: live routines/schedule/sessions/history and the
// exercise picker, plus the demo-mode mock plan + Coach chat.
// Adds to ctx: usingLiveWorkouts, liveRoutines, todayRoutine.
export function valsWorkouts(app, ctx) {
  const st = app.state;

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

  const weekStrip = liveWeekdays.map((day) => {
    const routineId = liveSchedule[day] || '';
    const isToday = day === todayWeekday;
    return {
      day, dayLabel: WEEKDAY_SHORT[day], isToday,
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
  }));

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
  const coachChipLabel = (c) => c ? (c.kind === 'weight' ? `COACH +${c.delta}KG` : `COACH +${c.delta} REP`) : null;

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
  const libraryExercises = st.liveWorkoutExercises || [];
  const exercisesById = new Map(libraryExercises.map((e) => [e.id, e]));
  const alreadyInRoutine = new Set((openRoutine?.exercises || []).map((e) => e.exerciseId));
  const exercisePickerResults = libraryExercises
    .filter((e) => !alreadyInRoutine.has(e.id))
    .filter((e) => pickerMuscle === 'Any' || e.muscleGroup === pickerMuscle)
    .filter((e) => !pickerQuery || e.name.toLowerCase().includes(pickerQuery))
    .slice(0, 60)
    .map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, onAdd: () => app.addExerciseToRoutine(e.id) }));
  const exercisePickerExactMatch = libraryExercises.some((e) => e.name.toLowerCase() === pickerQuery);
  const exercisePickerShowCreate = pickerQuery.length > 0 && !exercisePickerExactMatch;
  const TRACKING_TYPE_LABEL = { weight_reps: 'Weight × Reps', bodyweight_reps: 'Bodyweight × Reps', weight_time: 'Weight × Time', bodyweight_time: 'Bodyweight × Time', weighted_bodyweight_reps: 'Weighted Bodyweight × Reps' };

  const session = st.workoutSession;
  const sessionExercises = session ? session.exercises.map((e, exIdx) => ({
    exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType,
    coachLabel: coachChipLabel(e.coach), coachEvidence: e.coach?.evidence || null,
    weightHint: e.weightHint || null,
    isTime: isTimeTracking(e.trackingType), isBodyweight: isBodyweightTracking(e.trackingType),
    weightLabel: e.trackingType === 'weighted_bodyweight_reps' ? '+KG' : 'KG',
    amountLabel: isTimeTracking(e.trackingType) ? 'SEC' : 'REPS',
    targetLabel: `Target: ${e.targetSets} × ${e.targetRepsLow}-${e.targetRepsHigh} ${targetUnit(e.trackingType)}`,
    onAddSet: () => app.addSessionSet(exIdx),
    sets: e.sets.map((s, setIdx) => ({
      weight: s.weight, reps: s.reps, rpe: s.rpe || '', done: s.done,
      onWeight: (ev) => app.updateSessionSet(exIdx, setIdx, 'weight', ev.target.value),
      onReps: (ev) => app.updateSessionSet(exIdx, setIdx, 'reps', ev.target.value),
      onRpe: (ev) => app.updateSessionSet(exIdx, setIdx, 'rpe', ev.target.value),
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
    coachBusy: st.coachBusy,
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
    openExercisePicker: () => app.openExercisePicker(),
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
        when: days < 0 ? `overdue since ${c.forDate}` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due ${new Date(`${c.forDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}`,
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

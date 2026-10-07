import { muscleVar } from '../muscleHue.js';
import { recordPhrase } from '../recordKit.js';
import {
  shownKg, fmtKg, fmtThousands, isTimeLift, isBodyweightLift, liftIncrement, repIncrement,
  recordCandidates, voicePreview, commitOps, padKey, restStart, getRestTimer, saveRestTimer,
  restChoiceLabel, REST_CHOICES,
} from '../sessionSummaryFacts.js';

// THE LIVE SESSION'S VIEW MODEL — Train round B, mockup 61 (28 Sep 2026),
// approved by him with the scepticism that is this file's brief: "possibly
// being too much effort to scroll and click on other aspects of the
// screen". So the set card, its two numerals, the steppers and the tick are
// all on screen at every moment of a set, and every other act is one tap.
//
// Spread LAST in App.renderVals, after valsInboxSummary: it reads the
// classic session's own rows (valsWorkouts' sessionExercises, with every
// handler already bound) and the mid-session Coach fields. Null under every
// style but `summary`, in demo mode, and whenever the live session is not
// the thing on screen, so cupertino and command render the classic
// SessionView byte for byte.
//
// NOTHING HERE WRITES ON ITS OWN. Every act is a method the classic session
// already calls — toggleSessionSetDone, updateSessionSet, addSessionSet,
// removeSessionSet, toggleSessionExerciseSkipped, updateSessionExerciseField,
// askPainCoach (through the row's submitPain), openFormCheck,
// openSessionExercisePicker, removeExerciseFromSession, doCoach,
// resolveCoachChatProposal, applyAllCoachProposals, finishWorkoutSession,
// saveWorkoutForLater, requestCancelSession → discardWorkoutSession — or plain
// UI state: which lift the rail shows, which set the card holds, the pad,
// the open sheet, the rest ring, the voice line, a receipt. The rest timer's
// Settings row writes one localStorage key (novaos.restTimer), the house
// pattern for a per-device preference (src/theme.js).

const TYPES = [['warmup', 'Warm-up'], ['working', 'Working'], ['backoff', 'Back-off']];
const CUT_SHORT = ['out of time', 'low energy', 'gym busy', 'pain'];
const cap = (s) => { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const IMMEDIATE = new Set(['weight', 'addset', 'next', 'skip', 'finish', 'later', 'where', 'undo']);

// a set's two numbers as the page writes them: "60 × 8", "12 reps", "45 s"
function setWords(tt, s) {
  if (isBodyweightLift(tt)) return isTimeLift(tt) ? `${Number(s.reps) || 0} s` : `${Number(s.reps) || 0} reps`;
  const w = tt === 'weighted_bodyweight_reps' ? `+${fmtKg(s.weight)}` : fmtKg(s.weight);
  return `${w} × ${Number(s.reps) || 0}${isTimeLift(tt) ? ' s' : ''}`;
}
function pillWords(tt, s, many) {
  if (!many) return setWords(tt, s);
  return isBodyweightLift(tt) || isTimeLift(tt) ? String(Number(s.reps) || 0) : `${fmtKg(s.weight)}×${Number(s.reps) || 0}`;
}
// "60 kg × 8, 8, 7" when every set was the same weight; otherwise each set
function lastWords(tt, sets) {
  if (!sets?.length) return null;
  if (isBodyweightLift(tt)) return sets.map((s) => `${Number(s.reps) || 0}`).join(', ') + (isTimeLift(tt) ? ' s' : ' reps');
  const ws = new Set(sets.map((s) => shownKg(s.weight)));
  if (ws.size === 1) return `${fmtKg(sets[0].weight)} kg × ${sets.map((s) => Number(s.reps) || 0).join(', ')}`;
  return sets.map((s) => `${fmtKg(s.weight)}×${Number(s.reps) || 0}`).join(', ');
}
const numOr = (x) => (x === '' || x == null ? null : Number(x));

export function valsSessionSummary(app, ctx, v) {
  const st = app.state;
  const summary = st.novaStyle === 'summary';
  const restPref = st.restTimerPref || getRestTimer();

  // SETTINGS › TRAIN: one row, under summary only (the classic session has
  // no rest timer, so the other styles have nothing for it to switch)
  const setRest = (p) => { saveRestTimer(p); app.setState({ restTimerPref: p }); };
  const restTimerSetting = summary ? {
    on: restPref.on,
    seconds: restPref.seconds,
    label: restChoiceLabel(restPref.seconds),
    choices: REST_CHOICES.map((s) => ({ value: s, label: restChoiceLabel(s), picked: restPref.on && restPref.seconds === s, pick: () => setRest({ on: true, seconds: s }) })),
    toggle: () => setRest({ ...restPref, on: !restPref.on }),
  } : null;

  const session = st.workoutSession;
  if (!summary || ctx.demoMode || !session || st.workoutsView !== 'session' || st.screen !== 'workouts') {
    return { sessionSummary: null, restTimerSetting };
  }
  const exs = session.exercises || [];
  const rows = v.sessionExercises || [];
  if (!exs.length || rows.length !== exs.length) return { sessionSummary: null, restTimerSetting };
  const editing = !!st.editingSessionId;
  const now = Date.now();
  // THE PAGE'S OWN STATE BELONGS TO ONE SESSION. The rail's lift, the card's
  // set, the pad, the sheet, the rest ring and the voice line are keyed to
  // this session's start, so a new session (or one restored from the
  // server) never opens on the last one's lift or rest.
  const sessionKey = String(session.startedAt ?? `${session.routineId}:${session.routineName}`);
  const fresh = st.sessionSumKey === sessionKey;
  const ui = (k) => (fresh ? st[k] : null);

  // ------------------------------------------------------ where he is --
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < exs.length;
  const firstOpen = exs.findIndex((e) => !e.skipped && (e.sets || []).some((s) => !s.done));
  const exIdx = valid(ui('sessionSumLift')) ? ui('sessionSumLift')
    : valid(session.voiceCursor) && !exs[session.voiceCursor].skipped ? session.voiceCursor
      : firstOpen >= 0 ? firstOpen : 0;
  const e = exs[exIdx];
  const row = rows[exIdx];
  const sets = e.sets || [];
  const sel = ui('sessionSumSel') && ui('sessionSumSel').exIdx === exIdx && sets[ui('sessionSumSel').setIdx] ? ui('sessionSumSel').setIdx : null;
  const openIdx = sets.findIndex((s) => !s.done);
  const setIdx = sel != null ? sel : openIdx >= 0 ? openIdx : null;
  const tt = e.trackingType || 'weight_reps';
  const bw = isBodyweightLift(tt);
  const time = isTimeLift(tt);
  const hue = muscleVar(row.muscleGroup);
  const inc = liftIncrement({ coach: e.coach, last: e.last, sets });
  const repInc = repIncrement(tt);
  // read at CALL time: a held stepper repeats from a closure one render old
  const liveSet = (i = setIdx) => app.state.workoutSession?.exercises?.[exIdx]?.sets?.[i] || null;
  const nextOpenAfter = (i) => {
    const j = exs.findIndex((x, k) => k > i && !x.skipped && (x.sets || []).some((s) => !s.done));
    return j >= 0 ? j : exs.findIndex((x, k) => k !== i && !x.skipped && (x.sets || []).some((s) => !s.done));
  };

  const go = (i) => { if (valid(i)) app.setState({ sessionSumLift: i, sessionSumSel: null, sessionSumPad: null }); };
  const openSheet = (name) => app.setState({ sessionSumSheet: name, sessionSumPad: null });
  const closeSheet = () => app.setState({ sessionSumSheet: null });
  const receipt = (r) => app.setState({ sessionSumReceipt: { ...r, at: Date.now() } });
  const startRest = () => restStart(app.state.restTimerPref || getRestTimer(), Date.now(), { editing: !!app.state.editingSessionId });

  // ------------------------------------------------------- the header --
  const live = exs.filter((x) => !x.skipped);
  const total = live.reduce((n, x) => n + (x.sets || []).length, 0);
  const ticked = live.reduce((n, x) => n + (x.sets || []).filter((s) => s.done).length, 0);
  const minutes = Number.isFinite(session.startedAt) ? Math.max(0, Math.floor((now - session.startedAt) / 60000)) : null;
  const volume = live.reduce((n, x) => n + (x.sets || []).filter((s) => s.done).reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0);

  // --------------------------------------------------------- the rail --
  const dots = exs.map((x, i) => ({
    key: `${x.exerciseId}-${i}`,
    name: x.name,
    state: x.skipped ? 'skipped' : i === exIdx ? 'now' : (x.sets || []).length && x.sets.every((s) => s.done) ? 'done' : 'todo',
  }));
  const rail = {
    index: exIdx, count: exs.length, dots,
    prev: exIdx > 0 ? { name: exs[exIdx - 1].name, go: () => go(exIdx - 1) } : null,
    next: exIdx < exs.length - 1 ? { name: exs[exIdx + 1].name, go: () => go(exIdx + 1) } : null,
  };

  const skipLift = () => {
    const wasSkipped = !!e.skipped;
    row.onToggleSkip();
    app.setState({ sessionSumSel: null, sessionSumPad: null, sessionSumSheet: null });
    if (!wasSkipped) receipt({ kind: 'skip', exIdx, name: e.name });
  };
  const lift = {
    key: `${e.exerciseId}-${exIdx}`,
    name: e.name, hue, muscle: row.muscleGroup,
    mobility: row.muscleGroup === 'Mobility',
    target: `${e.targetSets} × ${e.targetRepsLow === e.targetRepsHigh ? e.targetRepsLow : `${e.targetRepsLow}–${e.targetRepsHigh}`}${time ? ' s' : ''}`,
    last: lastWords(tt, e.last?.sets),
    startFrom: e.last?.sets?.length ? null : e.startFrom || null,
    focus: e.focusNote || null,
    adhoc: !!e.adhoc,
    skipped: !!e.skipped,
    anomaly: !!e.anomaly,
    open3D: row.onOpen,
    hold: row.onLongPress,
    skip: skipLift,
    putBack: row.onToggleSkip,
    note: e.note || '',
    setNote: (text) => app.updateSessionExerciseField(exIdx, 'note', text),
    painLogged: !!e.pain,
    openPain: row.openPain,
    openNote: () => openSheet('note'),
    openMore: () => openSheet('more'),
    openCoach: () => openSheet('coach'),
  };

  // ----------------------------------------------------- the set card --
  const pad = ui('sessionSumPad') && ui('sessionSumPad').exIdx === exIdx && ui('sessionSumPad').setIdx === setIdx ? ui('sessionSumPad') : null;
  const many = sets.length > 4;
  const pills = sets.map((s, i) => ({
    key: i,
    label: s.done ? pillWords(tt, s, many) : many ? String(i + 1) : `Set ${i + 1}`,
    done: !!s.done,
    now: i === setIdx,
    aria: s.done ? `Set ${i + 1}, ${setWords(tt, s)}, logged. Tap to reopen it` : `Set ${i + 1}${i === setIdx ? ', on the card' : ''}`,
    pick: () => app.setState({ sessionSumSel: { exIdx, setIdx: i }, sessionSumPad: null }),
  }));

  let set = null;
  if (setIdx != null && !e.skipped) {
    const s = sets[setIdx];
    const openPad = (field) => app.setState({ sessionSumPad: { exIdx, setIdx, field, fresh: true } });
    const stepW = (dir) => {
      const cur = liveSet();
      if (!cur) return;
      app.updateSessionSet(exIdx, setIdx, 'weight', Math.max(0, shownKg((Number(cur.weight) || 0) + dir * inc)));
    };
    const stepR = (dir) => {
      const cur = liveSet();
      if (!cur) return;
      app.updateSessionSet(exIdx, setIdx, 'reps', Math.max(0, (Number(cur.reps) || 0) + dir * repInc));
    };
    const stepRpe = (k, dir, min, max, blank) => {
      const cur = liveSet();
      if (!cur) return;
      const n = numOr(cur[k]);
      const next = n == null ? blank : Math.max(min, Math.min(max, Math.round((n + dir * 0.5) * 2) / 2));
      app.updateSessionSet(exIdx, setIdx, k, next);
    };
    // THE TICK. Logs the set (toggleSessionSetDone, its own haptic), hands
    // the card to the next open set, and — when his Settings row says so —
    // starts the rest on the tick's own spot. A reopened set unticks.
    const tick = () => {
      const cur = liveSet();
      if (!cur) return;
      if (pad && (pad.field === 'weight' || pad.field === 'reps')) {
        const raw = cur[pad.field];
        if (typeof raw === 'string') app.updateSessionSet(exIdx, setIdx, pad.field, Number(raw) || 0);
      }
      app.toggleSessionSetDone(exIdx, setIdx);
      if (cur.done) { app.setState({ sessionSumPad: null }); return; }
      app.setState({ sessionSumSel: null, sessionSumPad: null, sessionSumLift: exIdx, sessionRest: startRest() });
    };
    // "Same as last" is "same again" by tap: the set just logged on this lift
    const prevDone = [...sets.slice(0, setIdx)].reverse().find((x) => x.done)
      || [...sets].reverse().find((x, j) => x.done && sets.length - 1 - j !== setIdx);
    // Coach's number, as a chip that fills it. Gold only while it differs
    // from the card: once it is on the card it waits on nothing.
    const coach = (() => {
      const c = e.coach;
      const lastSet = e.last?.sets?.[setIdx] || e.last?.sets?.[e.last.sets.length - 1] || null;
      let field = null; let value = null; let label = null;
      if (c && c.kind === 'weight' && lastSet && !bw) { field = 'weight'; value = shownKg((Number(lastSet.weight) || 0) + Number(c.delta || 0)); label = `Coach: try ${fmtKg(value)}`; }
      else if (c && c.kind === 'reps' && lastSet) { field = 'reps'; value = (Number(lastSet.reps) || 0) + Number(c.delta || 0); label = `Coach: ${value} ${time ? 's' : 'reps'}`; }
      else if (e.coachAdded?.startWeightKg && !bw) { field = 'weight'; value = shownKg(e.coachAdded.startWeightKg); label = `Coach: start ~${fmtKg(value)}`; }
      else if (e.weightHint && !bw && /(\d+(?:\.\d+)?)/.test(String(e.weightHint))) { field = 'weight'; value = shownKg(/(\d+(?:\.\d+)?)/.exec(String(e.weightHint))[1]); label = `Coach: ~${fmtKg(value)}`; }
      else if (c && (c.kind === 'quality' || c.kind === 'outgrown')) {
        const open = row.coachAsk || (row.coachOpen ? () => row.coachOpen({ x: 200, y: 420 }) : null);
        return open ? { label: c.kind === 'quality' ? 'Coach: hold and control' : 'Coach: outgrown', waiting: true, fill: open, why: row.coachOpen } : null;
      }
      if (field == null) return null;
      const onCard = field === 'weight' ? shownKg(s.weight) === value : Number(s.reps) === value;
      return {
        label: onCard ? `Coach’s ${field === 'weight' ? fmtKg(value) : value} is on` : label,
        waiting: !onCard,
        aria: onCard ? `Coach suggested ${value}; it is on the card` : `Coach suggests ${value}${field === 'weight' ? ' kilograms' : ''}. Tap to fill it, hold for why`,
        fill: () => app.updateSessionSet(exIdx, setIdx, field, value),
        why: row.coachOpen || null,
      };
    })();
    set = {
      key: `${exIdx}-${setIdx}`,
      idx: setIdx,
      label: `Set ${setIdx + 1} of ${sets.length}`,
      done: !!s.done,
      types: TYPES.map(([k, l]) => ({ k, l, on: (s.setType || 'working') === k, pick: () => app.updateSessionSet(exIdx, setIdx, 'setType', k) })),
      weight: bw ? null : {
        text: pad?.field === 'weight' ? String(s.weight ?? '') : fmtKg(s.weight),
        unit: tt === 'weighted_bodyweight_reps' ? '+kg' : 'kg',
        editing: pad?.field === 'weight',
        open: () => openPad('weight'),
        aria: `Weight, ${fmtKg(s.weight)} kilograms. Tap for the pad`,
      },
      reps: {
        text: pad?.field === 'reps' ? String(s.reps ?? '') : String(Number(s.reps) || 0),
        unit: time ? 'sec' : 'reps',
        editing: pad?.field === 'reps',
        open: () => openPad('reps'),
        aria: `${Number(s.reps) || 0} ${time ? 'seconds' : 'reps'}. Tap for the pad`,
      },
      inc: fmtKg(inc),
      repInc,
      stepW, stepR,
      tick,
      tickAria: s.done ? `Set ${setIdx + 1} is logged. Tap to untick it` : `Done: log set ${setIdx + 1}, ${setWords(tt, s)}`,
      remove: s.done && sets.length > 1 ? () => {
        const snap = { ...s };
        app.removeSessionSet(exIdx, setIdx);
        app.setState({ sessionSumSel: null, sessionSumPad: null });
        receipt({ kind: 'remove', exIdx, name: e.name, set: snap, n: setIdx + 1 });
      } : null,
      same: prevDone ? {
        label: setWords(tt, prevDone),
        aria: `Same as last: ${setWords(tt, prevDone)}, the set just logged`,
        fill: () => { app.updateSessionSet(exIdx, setIdx, 'weight', prevDone.weight); app.updateSessionSet(exIdx, setIdx, 'reps', prevDone.reps); },
      } : null,
      coach,
      rpe: { text: numOr(s.rpe) == null ? '—' : String(numOr(s.rpe)), down: () => stepRpe('rpe', -1, 1, 10, 7), up: () => stepRpe('rpe', 1, 1, 10, 8) },
      rir: { text: numOr(s.rir) == null ? '—' : String(numOr(s.rir)), down: () => stepRpe('rir', -1, 0, 6, 1), up: () => stepRpe('rir', 1, 0, 6, 2) },
    };
  }
  const nextLift = nextOpenAfter(exIdx);
  const allDone = !e.skipped && setIdx == null ? {
    line: `${e.name} done · ${plural(sets.length, 'set')}`,
    extra: () => { row.onAddSet(); app.setState({ sessionSumSel: null }); },
    next: nextLift >= 0 ? { name: exs[nextLift].name, go: () => go(nextLift) } : null,
  } : null;
  const skipped = e.skipped ? {
    putBack: row.onToggleSkip,
    next: nextLift >= 0 ? { name: exs[nextLift].name, go: () => go(nextLift) } : null,
  } : null;

  // ------------------------------------------------------------ the pad --
  const padView = pad && set ? {
    field: pad.field,
    label: pad.field === 'weight' ? `Number pad for the weight` : `Number pad for the ${time ? 'seconds' : 'reps'}`,
    stepLabel: pad.field === 'weight' ? fmtKg(inc) : String(repInc),
    decimals: pad.field === 'weight',
    doneLabel: pad.field === 'weight' ? `Done → ${time ? 'secs' : 'reps'}` : 'Done',
    key: (k) => {
      const cur = liveSet();
      const p = app.state.sessionSumPad;
      if (!cur || !p) return;
      const step = p.field === 'weight' ? inc : repInc;
      const text = padKey(String(cur[p.field] ?? ''), k, { fresh: !!p.fresh && k !== '+' && k !== '-', step, decimals: p.field === 'weight' });
      app.updateSessionSet(exIdx, setIdx, p.field, text);
      if (p.fresh) app.setState({ sessionSumPad: { ...p, fresh: false } });
    },
    done: () => {
      const cur = liveSet();
      const p = app.state.sessionSumPad;
      if (cur && p && typeof cur[p.field] === 'string') app.updateSessionSet(exIdx, setIdx, p.field, Number(cur[p.field]) || 0);
      if (p?.field === 'weight') app.setState({ sessionSumPad: { ...p, field: 'reps', fresh: true } });
      else app.setState({ sessionSumPad: null });
    },
    close: () => {
      const cur = liveSet();
      const p = app.state.sessionSumPad;
      if (cur && p && typeof cur[p.field] === 'string') app.updateSessionSet(exIdx, setIdx, p.field, Number(cur[p.field]) || 0);
      app.setState({ sessionSumPad: null });
    },
  } : null;

  // ------------------------------------------------------ the rest ring --
  const rest = ui('sessionRest') && !editing ? {
    endsAt: ui('sessionRest').endsAt, total: ui('sessionRest').total, hue,
    skip: () => app.setState({ sessionRest: null }),
  } : null;

  // ---------------------------------------------------- the voice line --
  // His words land here while the mic is open (SessionSummary's dictation
  // hook calls hear). A set or "same again" is DRAWN and waits for "yes" or
  // a tap; the other verbs act at once, as they do on Voice, because each
  // is a UI move or leaves Undo. Only the words since the last act are
  // read, so "62.5 for 8 yes … next" is two acts, not one garbled sentence.
  const vs = ui('sessionSumVoice') || null;
  const tailOf = (x) => String(x?.text || '').slice(Math.min(x?.consumed || 0, String(x?.text || '').length)).trim();
  const previewNow = (text) => {
    const s0 = app.state.workoutSession;
    const ex0 = s0?.exercises?.[exIdx];
    return voicePreview(text, { exIdx, e: ex0, selIdx: setIdx });
  };
  const say = (note) => {
    if (app.state.voiceSpeak && note) { try { app.speakTtsSentence?.(note); } catch { /* the line still shows it */ } }
  };
  const commitSet = (p) => {
    for (const [method, ...args] of commitOps(p, app.state.workoutSession)) app[method](...args);
    const note = `Logged ${setWords(tt, { weight: p.weight, reps: p.reps })} on set ${p.setIdx + 1} of ${p.count}.`;
    app.setState((s0) => ({
      sessionSumSel: null, sessionSumPad: null, sessionSumLift: exIdx, sessionRest: startRest(),
      sessionSumVoice: { ...(s0.sessionSumVoice || {}), consumed: String(s0.sessionSumVoice?.text || '').length, note, last: { exIdx, setIdx: p.setIdx } },
    }));
  };
  const act = (p) => {
    let note = null;
    if (p.kind === 'weight') {
      const t = setIdx != null && !sets[setIdx]?.done ? setIdx : openIdx;
      if (t >= 0 && t != null) { app.updateSessionSet(exIdx, t, 'weight', p.weight); note = `${fmtKg(p.weight)} kg on the card. Say the reps when it's done.`; }
      else note = `${e.name} is all ticked. Say “add a set” first.`;
    } else if (p.kind === 'addset') { row.onAddSet(); note = `Set ${sets.length + 1} added to ${e.name}.`; }
    else if (p.kind === 'next') { const j = nextOpenAfter(exIdx); if (j >= 0) { go(j); note = `${exs[j].name}.`; } else note = 'That was the last lift. Say “finish” to log it.'; }
    else if (p.kind === 'skip') { skipLift(); note = `Skipped ${e.name}.`; }
    else if (p.kind === 'finish') { openSheet('finish'); note = 'Finish is open. Tap Finish to log it.'; }
    else if (p.kind === 'later') { v.saveForLater(); note = 'Saved for later.'; }
    else if (p.kind === 'where') {
      const s0 = sets[setIdx ?? openIdx];
      const left = exs.filter((x) => !x.skipped && (x.sets || []).some((y) => !y.done)).length;
      note = s0 ? `${e.name}, set ${(setIdx ?? openIdx) + 1} of ${sets.length}: ${setWords(tt, s0)} is the plan. ${plural(left, 'lift')} to go.` : `${e.name} is done. ${plural(left, 'lift')} to go.`;
    } else if (p.kind === 'undo') {
      const last = app.state.sessionSumVoice?.last;
      const s0 = last && app.state.workoutSession?.exercises?.[last.exIdx]?.sets?.[last.setIdx];
      if (s0?.done) { app.toggleSessionSetDone(last.exIdx, last.setIdx); note = `Unticked set ${last.setIdx + 1}.`; }
      else note = 'Nothing spoken to take back.';
    }
    say(note);
    app.setState((s0) => ({ sessionSumVoice: { ...(s0.sessionSumVoice || {}), consumed: String(s0.sessionSumVoice?.text || '').length, note, ...(p.kind === 'undo' ? { last: null } : {}) } }));
  };
  const hear = (text, { final = false } = {}) => {
    const prev = app.state.sessionSumVoice || {};
    const t = String(text || '');
    // a new turn restarts the words; what was acted on stays acted on
    const consumed = t.length < (prev.consumed || 0) || (prev.text && !t.startsWith(prev.text.slice(0, prev.consumed || 0))) ? 0 : (prev.consumed || 0);
    app.setState({ sessionSumVoice: { ...prev, text: t, consumed, final } });
    const p = previewNow(t.slice(consumed));
    if (!p) return;
    if (p.kind === 'set' && p.yes) commitSet(p);
    else if (IMMEDIATE.has(p.kind)) act(p);
  };
  const tail = tailOf(vs);
  const preview = vs ? previewNow(tail) : null;
  const voice = editing ? null : {
    example: set && !set.done ? (bw ? `${Number(sets[setIdx].reps) || 0} ${time ? 'seconds' : 'reps'}` : `${fmtKg(sets[setIdx].weight)} for ${Number(sets[setIdx].reps) || 0}`) : 'same again',
    heard: tail,
    note: vs?.note || null,
    preview: preview && preview.kind === 'set' ? {
      weight: bw ? null : fmtKg(preview.weight),
      unit: tt === 'weighted_bodyweight_reps' ? '+kg' : 'kg',
      reps: String(preview.reps),
      repUnit: time ? 'sec' : 'reps',
      type: cap(TYPES.find(([k]) => k === preview.setType)?.[1] || 'Working'),
      where: `set ${preview.setIdx + 1} of ${preview.count}`,
      rpe: preview.rpe,
      aria: `Heard ${setWords(tt, preview)}, set ${preview.setIdx + 1} of ${preview.count}. Tap to log it`,
      commit: () => commitSet(previewNow(tail)?.kind === 'set' ? previewNow(tail) : preview),
    } : null,
    // a miss is said only when his turn is over — mid-sentence is not a miss
    miss: preview && preview.kind === 'miss' && vs?.final ? preview.said : null,
    hear,
    // a new turn starts from what is already on the line, so a "yes" said
    // as its own turn (Nova's ears transcribe once, at the end) reaches the
    // set it confirms
    base: () => String(app.state.sessionSumVoice?.text || ''),
    clear: () => app.setState({ sessionSumVoice: null }),
    openVoice: v.openVoiceForSession,
  };

  // --------------------------------------------------------- receipts --
  const r = ui('sessionSumReceipt');
  const receiptView = r ? {
    key: r.at,
    title: r.kind === 'skip' ? `Skipped ${r.name}` : `Set ${r.n} removed`,
    sub: r.kind === 'skip' ? 'Today only · the program stays as it is' : `${r.name} · ${setWords(exs[r.exIdx]?.trackingType || tt, r.set)}`,
    undo: () => {
      const s0 = app.state.workoutSession;
      if (r.kind === 'skip') {
        if (s0?.exercises?.[r.exIdx]?.skipped) app.toggleSessionExerciseSkipped(r.exIdx);
      } else if (r.kind === 'remove' && s0?.exercises?.[r.exIdx]) {
        // back as the lift's last set, with every number it had
        const at = s0.exercises[r.exIdx].sets.length;
        app.addSessionSet(r.exIdx);
        for (const k of ['weight', 'reps', 'rpe', 'rir', 'setType']) if (r.set[k] !== undefined) app.updateSessionSet(r.exIdx, at, k, r.set[k]);
        if (r.set.done) app.toggleSessionSetDone(r.exIdx, at);
      }
      app.setState({ sessionSumReceipt: null });
    },
    dismiss: () => app.setState((s0) => (s0.sessionSumReceipt?.at === r.at ? { sessionSumReceipt: null } : null)),
  } : null;

  // ----------------------------------------------------------- sheets --
  const sheet = ui('sessionSumSheet') || null;
  const more = sheet === 'more' ? {
    close: closeSheet,
    sub: set ? `${set.label} · for this session` : 'For this session',
    rows: [
      { key: 'extra', icon: 'plus', name: 'Extra set', sub: `Set ${sets.length + 1}, today only · or say “add a set”`, run: () => { row.onAddSet(); closeSheet(); } },
      { key: 'off', icon: 'moon', name: 'Off day', sub: 'Leave today out of progression', toggle: true, on: !!e.anomaly, run: row.toggleAnomaly },
      { key: 'form', icon: 'play', name: 'Form', sub: row.formCurated ? 'The curated clip, Coach-approved' : 'Technique videos · none curated yet', go: true, run: () => { window.open(row.formUrl, '_blank', 'noopener'); } },
      { key: 'check', icon: 'cam', name: 'Form check', sub: 'Film a set; Coach checks the angle first', go: true, run: () => { closeSheet(); row.formCheckOpen(); } },
      { key: 'add', icon: 'addx', name: 'Add exercise', sub: `This session only · ${session.routineName} stays as it is`, go: true, run: () => { closeSheet(); v.openSessionExercisePicker(); } },
      e.adhoc
        ? { key: 'drop', icon: 'trash', name: 'Remove from this session', sub: 'An extra lift, so it can go whole', danger: true, run: () => { closeSheet(); app.removeExerciseFromSession(exIdx); app.setState({ sessionSumLift: null, sessionSumSel: null }); } }
        : { key: 'skip', icon: 'skip', name: e.skipped ? 'Put it back' : 'Skip this lift', sub: 'Today only · the program stays as it is', run: e.skipped ? () => { row.onToggleSkip(); closeSheet(); } : skipLift },
    ],
  } : null;

  const pain = row.painOpen && row.painState ? {
    name: e.name,
    areas: row.painAreas.map((a) => ({ key: a, label: cap(a), on: row.painState.area === a, pick: () => row.setPainField('area')(a) })),
    other: row.painOther.filter((o) => !row.painAreas.includes(o)).map((o) => ({ key: o, label: o, on: row.painState.area === o, pick: () => row.setPainField('area')(o) })),
    otherOpen: !!row.painState.area && !row.painAreas.includes(row.painState.area),
    sides: ['left', 'right', 'both/centre'].map((x) => ({ key: x, label: x === 'both/centre' ? 'Both or centre' : cap(x), on: row.painState.side === x, pick: () => row.setPainField('side')(x) })),
    whens: ['during the rep', 'after sets', 'constant'].map((x) => ({ key: x, label: cap(x), on: row.painState.when === x, pick: () => row.setPainField('when')(x) })),
    detail: row.painState.detail || '',
    setDetail: (t) => row.setPainField('detail')(t),
    canAsk: !!row.painState.area,
    // the answer lands in the Coach sheet, so that is where he goes
    ask: () => { row.submitPain(); openSheet('coach'); },
    close: row.closePain,
  } : null;

  const note = sheet === 'note' ? { name: e.name, value: e.note || '', set: lift.setNote, close: closeSheet } : null;

  const coachSheet = sheet === 'coach' ? {
    close: closeSheet,
    live: `${e.name}${set ? ` · ${set.label.toLowerCase()}` : ''}`,
    liveSub: `${ticked} of ${total} sets${minutes != null ? ` · ${minutes} min` : ''}`,
    hue,
    starters: ['That last set felt heavy. Drop the weight?', 'Shoulder is niggling on these. An alternative?', 'Only 20 minutes left. What do I cut?']
      .map((q) => ({ q, ask: () => app.doCoach(q) })),
  } : null;

  const form = row.formCheck ? { fc: row.formCheck, name: e.name } : null;
  const picker = v.exercisePickerOpen && v.exercisePickerMode === 'session' ? { close: v.closeExercisePicker } : null;

  // THE RECORD, named before it files: code's comparison against last time,
  // at the resolution shown (sessionSummaryFacts.recordCandidates). The
  // server still decides; the sheet says so.
  const cands = recordCandidates(exs);
  const lead = cands[0] || null;
  const openSets = total - ticked;
  const finish = sheet === 'finish' ? {
    close: closeSheet,
    title: editing ? `Edit ${session.routineName}` : `Finish ${session.routineName}`,
    sub: `${ticked} of ${plural(total, 'set')} ticked`,
    trio: [
      { k: 'sets', v: String(ticked), u: ticked === 1 ? 'set' : 'sets' },
      { k: 'kg', v: fmtThousands(volume), u: 'kg moved' },
      ...(minutes != null ? [{ k: 'min', v: String(minutes), u: minutes === 1 ? 'minute' : 'minutes' }] : []),
    ],
    record: lead ? {
      name: lead.name,
      hue: lead.muscle ? muscleVar(lead.muscle) : 'var(--nv-cy)',
      from: lead.previous,
      fromLabel: lead.kind === 'weight' ? fmtKg(lead.previous) : String(lead.previous),
      to: lead.value,
      unit: lead.kind === 'weight' ? 'kg' : isTimeLift(exs[lead.exIdx]?.trackingType) ? 's' : 'reps',
      decimals: lead.kind === 'weight',
      // the two-stage wording (recordKit.recordPhrase): before it files the
      // only true claim is "beat last time"; "New personal best" waits for
      // the server, and plays as its own moment (src/RecordMoment.jsx)
      ...(({ head, line, meta, aria }) => ({ head, line, meta, aria }))(recordPhrase('sheet', lead)),
      also: cands.length > 1 ? `and ${plural(cands.length - 1, 'more lift')} up on last time` : null,
    } : null,
    cutShort: !editing && v.sessionHasUndone ? {
      head: `${plural(openSets, 'set')} open. Stopping early? One tap tells Coach why`,
      reasons: CUT_SHORT.map((x) => ({ key: x, label: cap(x), on: v.sessionCutShort === x, pick: () => v.setSessionCutShort(x) })),
    } : null,
    later: !editing && v.canSaveForLater ? v.saveForLater : null,
    finish: v.finishSession,
    finishLabel: editing ? 'Save changes' : 'Finish',
    discard: {
      label: editing ? 'Discard changes' : 'Discard session',
      confirming: !!v.sessionCancelConfirm,
      line: editing ? 'Leave the record as it was?' : ticked ? `Discard ${plural(ticked, 'set')}?` : 'Discard this session?',
      ask: v.requestCancelSession,
      yes: v.discardSession,
      keep: v.cancelSessionCancel,
    },
  } : null;

  return {
    restTimerSetting,
    sessionSummary: {
      key: sessionKey,
      fresh,
      adopt: () => app.setState({
        sessionSumKey: sessionKey, sessionSumLift: null, sessionSumSel: null, sessionSumPad: null,
        sessionRest: null, sessionSumVoice: null, sessionSumReceipt: null, sessionSumSheet: null,
      }),
      title: session.routineName,
      editing,
      startedAt: Number.isFinite(session.startedAt) ? session.startedAt : null,
      progress: `${ticked} of ${total} sets`,
      openFinish: () => openSheet('finish'),
      finishLabel: editing ? 'Save' : 'Finish',
      rail, lift, pills, set, allDone, skipped,
      pad: padView,
      rest,
      voice,
      receipt: receiptView,
      sheet: { more, pain, note, coach: coachSheet, form, picker, finish },
    },
  };
}

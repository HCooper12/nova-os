import { AGENTS } from './shared.js';

// Mission Control domain (Command Core layout): connection status chips and
// banner, the hero (eyebrow / tagline / standfirst), the core cluster's three
// satellites, suggested focus, Nova-noticed insights + streaks, today's
// calendar with the ▸ next-block marker, the three vault cards, and the
// boot-splash lines. Consumes ctx from valsRecipes (rotation, protein*),
// valsWorkouts (todayRoutine, liveRoutines, usingLiveWorkouts) and valsNotes
// (usingLiveNotes, reviewPage).

// Stable color per Apple Calendar name (Work, Health, Family, ...) so the same
// category always reads the same hue without hand-maintaining a lookup table.
const CATEGORY_HUES = ['216,181,115', '107,229,245', '138,106,209', '201,111,111', '90,168,124', '224,143,111'];
function categoryHue(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CATEGORY_HUES[Math.abs(hash) % CATEGORY_HUES.length];
}

// The last 7 calendar days as a continuous span (oldest → newest), each mapped
// to its logged health day or left as a gap — so a night the automation missed
// is visible AND editable, not silently absent.
function buildStepsWeek(healthDays, goal) {
  const byDate = new Map((healthDays || []).map((d) => [d.date, d]));
  const p2 = (n) => String(n).padStart(2, '0');
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const day = byDate.get(iso);
    const steps = day && day.steps != null ? day.steps : null;
    const km = day && day.walkingRunningDistanceKm != null
      ? day.walkingRunningDistanceKm
      : (steps != null ? +(steps * 0.000762).toFixed(1) : null); // ~0.762 m/step fallback
    out.push({
      date: iso,
      label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      full: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
      steps,
      km,
      hasData: steps != null,
      over: steps != null && steps >= goal,
      isToday: i === 0,
    });
  }
  return out;
}

export function valsMission(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline, lastSyncLabel, go, usingLiveRecipes, rotation,
    proteinTarget, proteinCurrent, proteinRatio, proteinGap, proteinNextSlot, proteinNextSlotFilled,
    usingLiveWorkouts, liveRoutines, todayRoutine, todayActiveRest, usingLiveNotes, reviewPage } = ctx;

  // health satellites (steps, sleep) — real Apple Health data once the phone-side Shortcut is sending it
  const STEP_GOAL = 10000;
  const SLEEP_GOAL_MIN = 480; // 8h
  const usingLiveHealthData = !!st.liveHealthDays;
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const latestWithMetric = (key) => !usingLiveHealthData ? null
    : st.liveHealthDays.find((d) => d.date === todayKey && d[key] != null)
      || [...st.liveHealthDays].reverse().find((d) => d[key] != null)
      || null;

  const stepsDay = latestWithMetric('steps');
  const stepsCurrent = stepsDay ? stepsDay.steps : 0;
  const stepsRatio = Math.min(1, stepsCurrent / STEP_GOAL);

  // sleep: real asleep-minutes vs an 8h goal, and an HRV delta against the
  // trailing average of the *other* recent days — an honestly-computed
  // "recovered" signal rather than a fixed caption.
  const sleepDay = latestWithMetric('sleepAsleepMinutes');
  const sleepMinutes = sleepDay ? sleepDay.sleepAsleepMinutes : 0;
  const sleepRatio = Math.min(1, sleepMinutes / SLEEP_GOAL_MIN);
  const hrvDay = latestWithMetric('hrv');
  const hrvHistory = usingLiveHealthData ? st.liveHealthDays.filter((d) => d.hrv != null && d !== hrvDay) : [];
  const hrvBaseline = hrvHistory.length ? hrvHistory.reduce((sum, d) => sum + d.hrv, 0) / hrvHistory.length : null;
  const hrvDeltaPct = hrvDay && hrvBaseline ? Math.round(((hrvDay.hrv - hrvBaseline) / hrvBaseline) * 100) : null;
  const rhrDay = latestWithMetric('restingHeartRate');

  const pad2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const nowHM = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const hour = now.getHours();

  // ---- hero eyebrow / tagline / standfirst -------------------------------
  const heroDate = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase().replace(/,/g, '');
  const agentsLiveCount = AGENTS.filter((a) => a.on).length;

  // honest per-state systems word for the end of the eyebrow
  const systemsLabel = demoMode
    ? { text: 'DEMO DATA', color: 'var(--nv-gold)' }
    : isOffline
      ? { text: 'OFFLINE · LAST-KNOWN DATA', color: 'var(--nv-warn)' }
      : st.connectionStatus === 'connecting'
        ? { text: 'CONNECTING…', color: 'var(--nv-ink60)' }
        : { text: 'ALL SYSTEMS NOMINAL', color: 'var(--nv-ink60)' };

  const nextEvent = (st.liveCalendar || []).find((e) => e.time && e.time >= nowHM);

  // When today's scheduled workout actually is — from a matching calendar event
  // (across the whole day, not just what's still upcoming) so Nova never says
  // "tonight" for a session that's this morning. Falls back to a neutral "today"
  // when the calendar doesn't pin a time. [[nova-method]]: honest, never guess.
  const routineWord = todayRoutine ? todayRoutine.name.replace(/[^\w\s]/g, ' ').trim().split(/\s+/)[0] : '';
  const workoutEvent = todayRoutine && Array.isArray(st.liveCalendar)
    ? st.liveCalendar.find((e) => e.time && (
        (routineWord.length > 2 && new RegExp(`\\b${routineWord}\\b`, 'i').test(e.label))
        || /\b(gym|workout|training|lift|session|push|pull|legs?|upper|lower|chest|back|shoulders?|cardio)\b/i.test(e.label)
      ))
    : null;
  const partOfDayFrom = (hm) => { const h = parseInt(hm, 10); return h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : 'tonight'; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const workoutWhen = workoutEvent ? partOfDayFrom(workoutEvent.time) : null; // null = time unknown

  let heroTagline;
  if (demoMode) heroTagline = 'Cleared for deep work at 15:30.';
  else if (nextEvent) heroTagline = `Cleared for ${nextEvent.label} at ${nextEvent.time}.`;
  else if (todayRoutine) heroTagline = workoutEvent
    ? `${todayRoutine.name} ${workoutWhen} at ${workoutEvent.time}.`
    : `${todayRoutine.name} is on today's plan.`;
  else if (isOffline) heroTagline = 'Waiting for the link to come back.';
  else if (hour < 12) heroTagline = 'The morning is wide open — claim it.';
  else if (hour < 18) heroTagline = 'The afternoon is clear. Build something.';
  else heroTagline = 'The evening is yours. Land it well.';

  // standfirst — composed from whatever real data exists; segments carry
  // their own emphasis (b = bold ink, cy = accent) so the screen just maps
  const heroStand = [];
  if (demoMode) {
    heroStand.push(
      { t: 'Recovery reads ' }, { t: 'strong', b: 1 }, { t: ' — HRV ' }, { t: '93.5 ms', b: 1 },
      { t: ', resting ' }, { t: '51 bpm', b: 1 }, { t: " — but yesterday's block never fired. Tonight: " },
      { t: 'Upper Body', b: 1 }, { t: ', a ' }, { t: '54 g protein gap', b: 1 }, { t: ', ' },
      { t: '7,639 steps', cy: 1 }, { t: ' on the plan.' },
    );
  } else {
    if (hrvDay || rhrDay) {
      const tone = hrvDeltaPct == null ? 'steady' : hrvDeltaPct >= 3 ? 'strong' : hrvDeltaPct <= -5 ? 'down' : 'steady';
      heroStand.push({ t: 'Recovery reads ' }, { t: tone, b: 1 });
      if (hrvDay) heroStand.push({ t: ' — HRV ' }, { t: `${Math.round(hrvDay.hrv * 10) / 10} ms`, b: 1 });
      if (rhrDay) heroStand.push({ t: hrvDay ? ', resting ' : ' — resting ' }, { t: `${Math.round(rhrDay.restingHeartRate)} bpm`, b: 1 });
      heroStand.push({ t: '. ' });
    }
    if (todayRoutine) heroStand.push({ t: `${workoutWhen ? cap(workoutWhen) : 'Today'}: ` }, { t: todayRoutine.name, b: 1 }, { t: '. ' });
    if (usingLiveRecipes) {
      if (proteinGap > 0) heroStand.push({ t: 'Protein sits at ' }, { t: `${Math.round(proteinCurrent)}/${proteinTarget} g`, b: 1 }, { t: ' — a ' }, { t: `${proteinGap} g gap`, b: 1 }, { t: ' to close. ' });
      else heroStand.push({ t: 'Protein floor ' }, { t: 'cleared', b: 1 }, { t: ` at ${Math.round(proteinCurrent)} g. ` });
    }
    if (usingLiveHealthData && stepsDay) {
      if (stepsDay.date !== todayKey) heroStand.push({ t: 'Step data is ' }, { t: 'stale', b: 1 }, { t: ` (last push ${stepsDay.date}) — the wake-up Shortcut isn't running.` });
      else if (stepsCurrent < STEP_GOAL) heroStand.push({ t: `${(STEP_GOAL - stepsCurrent).toLocaleString()} steps`, cy: 1 }, { t: ' still on the plan.' });
      else heroStand.push({ t: 'Step goal ' }, { t: 'met', cy: 1 }, { t: '.' });
    }
    if (!heroStand.length) {
      heroStand.push({ t: isOffline
        ? 'Backend unreachable — showing what Nova last saved.'
        : 'Connected to your vault — the numbers fill in as the day unfolds.' });
    }
  }

  // ---- core cluster satellites (conic progress borders) ------------------
  const offlineHint = isOffline ? 'OFFLINE' : 'CONNECT APPLE HEALTH';
  const satSleep = demoMode
    ? { label: 'SLEEP', value: '7:12', small: '/8H', pct: 90, hint: '90% · HRV +9%' }
    : !usingLiveHealthData || !sleepDay
      ? { label: 'SLEEP', value: '—', small: '', pct: 0, hint: usingLiveHealthData ? 'NO SLEEP DATA YET' : offlineHint }
      : {
          label: 'SLEEP',
          value: `${Math.floor(sleepMinutes / 60)}:${pad2(sleepMinutes % 60)}`,
          small: '/8H',
          pct: Math.round(sleepRatio * 100),
          hint: `${Math.round(sleepRatio * 100)}%` + (hrvDeltaPct != null ? ` · HRV ${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%` : ''),
        };
  // a metric from an older day must SAY so — "2,361 steps" three days
  // running is the health push being dead, not a quiet streak
  const staleHint = (day) => {
    if (!day || day.date === todayKey) return null;
    const days = Math.round((new Date(todayKey) - new Date(day.date)) / 86400000);
    return days === 1 ? 'YESTERDAY' : `STALE · ${days}D OLD — PUSH NOT RUNNING`;
  };
  const satSteps = demoMode
    ? { label: 'STEPS', value: '2,361', small: '', pct: 24, hint: '24% · 7,639 TO GO' }
    : !usingLiveHealthData || !stepsDay
      ? { label: 'STEPS', value: '—', small: '', pct: 0, hint: usingLiveHealthData ? 'NO STEP DATA YET' : offlineHint }
      : {
          label: 'STEPS',
          value: stepsCurrent.toLocaleString(),
          small: '',
          pct: Math.round(stepsRatio * 100),
          hint: staleHint(stepsDay) || (stepsCurrent >= STEP_GOAL ? `${Math.round(stepsRatio * 100)}% · GOAL REACHED` : `${Math.round(stepsRatio * 100)}% · ${(STEP_GOAL - stepsCurrent).toLocaleString()} TO GO`),
        };
  // tap the steps satellite to open the 7-day history + manual edit
  if (!demoMode) satSteps.onOpen = () => app.setState({ stepsOverlayOpen: true });
  // protein numbers come from the rotation — real when synced, the scripted 96
  // only in demo mode, and an honest dash when configured but not synced
  const satProtein = !usingLiveRecipes && !demoMode
    ? { label: 'PROTEIN', value: '—', small: '', pct: 0, hint: 'RECONNECT TO LOAD' }
    : {
        label: 'PROTEIN',
        value: String(Math.round(proteinCurrent)),
        small: `/${proteinTarget}G`,
        pct: Math.round(proteinRatio * 100),
        hint: proteinGap > 0 ? `${Math.round(proteinRatio * 100)}% · GAP ${proteinGap}G` : 'FLOOR CLEARED',
      };

  const untilLabel = (time) => {
    const [h, m] = time.split(':').map(Number);
    const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
    if (mins <= 0) return null;
    return mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h ${pad2(mins % 60)}m`;
  };

  // suggested focus — derived from real data when connected (next calendar
  // event, else today's training, else the daily-review concept); the
  // scripted demo card survives only in demo mode
  let suggestedFocus;
  if (demoMode) {
    suggestedFocus = {
      source: 'from Commander',
      title: 'Finish the science video script — ',
      accent: 'Studio drafted the outline.',
      detail: 'Calendar is clear until 17:30 training. Commander silenced non-urgent pings.',
      primaryLabel: 'Open draft',
      onPrimary: () => app.navigate('notes', { openNoteId: 'n3' }),
      secondaryLabel: 'Later today',
      onSecondary: () => app.toastMsg('Commander moved the script block to 14:00'),
    };
  } else {
    if (nextEvent) {
      const runway = untilLabel(nextEvent.time);
      suggestedFocus = {
        source: 'from your calendar',
        title: `${nextEvent.time} — `, accent: nextEvent.label,
        detail: runway
          ? `The next ${runway.replace('in ', '')} is unscheduled — a clear runway until this block.`
          : 'This block is live right now.',
        primaryLabel: 'See today', onPrimary: null, // stays on Mission Control; Today card is beside it
      };
    } else if (todayRoutine) {
      suggestedFocus = {
        source: 'from your training plan',
        title: 'Training today — ', accent: todayRoutine.name,
        detail: `${todayRoutine.exercises.length} exercise${todayRoutine.exercises.length === 1 ? '' : 's'} queued — everything is set up in Train.`,
        primaryLabel: 'Start in Train', onPrimary: go('workouts'),
      };
    } else if (reviewPage) {
      suggestedFocus = {
        source: 'from your vault',
        title: 'Clear schedule — review a concept: ', accent: reviewPage.title,
        detail: 'A quiet day. Ten minutes with one idea compounds.',
        primaryLabel: 'Open review', onPrimary: () => app.openDailyReview(),
      };
    } else if (isOffline) {
      // no cached data to plan from — say so instead of claiming a clear day
      suggestedFocus = {
        source: 'connection lost',
        title: 'Backend unreachable — ', accent: 'Nova is flying blind.',
        detail: 'No live calendar, training, or vault data. Check the server on your Mac, then reconnect.',
        primaryLabel: 'Open Settings', onPrimary: go('settings'),
      };
    } else {
      suggestedFocus = {
        source: 'from Nova',
        title: 'All clear. ', accent: 'Nothing queued right now.',
        detail: 'Add calendar events, a routine, or vault notes and Nova plans from them.',
        primaryLabel: 'Open Notes', onPrimary: go('notes'),
      };
    }
  }

  // the hero CTA acts on the suggested focus; when the focus is "stay here"
  // (a calendar block), it acknowledges instead of navigating nowhere
  const onEngage = suggestedFocus.onPrimary
    ? suggestedFocus.onPrimary
    : () => app.toastMsg(nextEvent ? `Next block: ${nextEvent.time} — ${nextEvent.label}` : 'Nothing queued right now');

  // latest-note vault card — real newest page when connected
  const latestNote = (st.liveNotes || [])[0] || null;
  const noteCard = demoMode
    ? {
        photoLabel: 'note — protein timing', title: 'Huberman · protein timing', meta: 'podcast note · linked to 4 recipes',
        onOpen: () => app.navigate('notes', { openNoteId: 'n1' }),
      }
    : latestNote
      ? {
          photoLabel: 'note — ' + latestNote.title.toLowerCase(), title: latestNote.title,
          meta: `${(latestNote.type || 'note').toLowerCase()} · latest in your vault`,
          onOpen: () => { app.selectNote(latestNote.id); app.navigate('notes'); },
        }
      : { photoLabel: 'note — none yet', title: 'No notes yet', meta: 'your vault is empty', onOpen: go('notes') };

  // honest status chips
  const statusChip = demoMode
    ? { label: 'DEMO DATA', color: '#d8b573' }
    : isOffline
      ? { label: 'OFFLINE', color: '#c96f6f' }
      : st.connectionStatus === 'connecting'
        ? { label: 'CONNECTING…', color: 'rgba(236,229,218,.6)' }
        : { label: 'LIVE', color: '#6be5f5' };
  const missionStatusItems = demoMode
    ? ['DEMO DATA — CONNECT A BACKEND IN SETTINGS']
    : [
        st.liveNotes ? `VAULT · ${st.liveNotes.length} NOTES` : null,
        lastSyncLabel ? `SYNCED ${lastSyncLabel.toUpperCase()}` : null,
        isOffline ? 'SHOWING LAST-KNOWN DATA' : null,
      ].filter(Boolean);

  const statusBanner = isOffline
    ? { tone: 'warn', text: `Backend unreachable — showing data saved ${lastSyncLabel || 'earlier'}` }
    : demoMode && st.screen !== 'settings'
      ? { tone: 'info', text: 'Demo data — connect your backend in Settings' }
      : null;

  // shared with valsChrome (sidebar status card reuses the same truth)
  Object.assign(ctx, { statusChip, missionStatusItems, agentsLiveCount });

  // ---- today list with the ▸ next-block marker ---------------------------
  const markNow = (events) => {
    const nextIdx = events.findIndex((e) => e.time && e.time >= nowHM);
    return events.map((e, i) => ({
      ...e,
      now: i === nextIdx,
      past: !!e.time && e.time < nowHM && i !== nextIdx,
      until: i === nextIdx && e.time ? untilLabel(e.time) : null,
    }));
  };

  return {
    // connection truth
    connectionStatus: st.connectionStatus,
    statusChip,
    missionStatusItems,
    statusBanner,
    suggestedFocus,
    noteCard,
    bootInfo: {
      vaultLine: demoMode ? 'VAULT · DEMO DATA' : st.liveNotes ? `VAULT · ${st.liveNotes.length} NOTES LINKED` : 'VAULT · CONNECTING…',
      recipesLine: demoMode ? 'MODE · SHOWCASE' : st.liveRecipes ? `RECIPES · ${st.liveRecipes.length} LOADED` : 'RECIPES · CONNECTING…',
      agentsLine: demoMode ? 'AGENTS · CONCEPT PREVIEW' : st.liveJournalEntries ? `JOURNAL · ${st.liveJournalEntries.length} DAYS` : 'JOURNAL · CONNECTING…',
    },

    // hero
    heroDate,
    agentsLiveLabel: `${agentsLiveCount} AGENTS LIVE`,
    systemsLabel,
    heroTagline,
    heroStand,
    onEngage,
    satSleep,
    satSteps,
    satProtein,
    coreLabel: st.micOn ? 'NOVA · LISTENING' : 'NOVA · STANDING BY',
    coreWaveOn: st.micOn,
    openVoice: go('voice'),
    reviewMeta: reviewPage ? (reviewPage.type || 'concept').toUpperCase() : 'CONCEPT',

    // mission actions
    acceptRun: () => app.toastMsg('Zone-2 run locked for tomorrow, 7:00 am ✓'),
    openProteinNote: () => app.navigate('notes', { openNoteId: 'n1' }),
    reviewSubs: () => app.toastMsg('CFO drafted the cancellations — review in tonight’s reflection'),
    usingLiveHealthInsight: usingLiveNotes && !!st.liveHealthInsight,
    // the scripted demo insights only ever render in demo mode — a connected
    // session with no insight yet gets the honest empty text instead
    noticedShowDemo: demoMode,
    healthInsightItems: [
      st.liveHealthInsight?.morning?.hasInsight ? { key: 'morning', label: 'MORNING', text: st.liveHealthInsight.morning.insight } : null,
      st.liveHealthInsight?.evening?.hasInsight ? { key: 'evening', label: 'EVENING', text: st.liveHealthInsight.evening.insight } : null,
    ].filter(Boolean),
    healthInsightEmptyText: "Nova hasn't spotted a pattern yet — connect your Apple Health data to start getting daily insights here.",
    // streaks — pure computed momentum, no AI involved, so it's always
    // honest and free to show regardless of whether an insight generated
    streakBadges: st.liveStreaks
      ? [
          st.liveStreaks.workoutStreak >= 2 ? { key: 'workout', label: `${st.liveStreaks.workoutStreak}-DAY WORKOUT STREAK`, hue: '224,178,106' } : null,
          st.liveStreaks.stepGoalStreak >= 2 ? { key: 'steps', label: `${st.liveStreaks.stepGoalStreak}-DAY STEP GOAL STREAK`, hue: '95,232,168' } : null,
          st.liveStreaks.sleepGoalStreak >= 2 ? { key: 'sleep', label: `${st.liveStreaks.sleepGoalStreak}-DAY SLEEP GOAL STREAK`, hue: '89,230,255' } : null,
        ].filter(Boolean)
      : [],
    lunchCardK: usingLiveRecipes
      ? (rotation?.slots?.lunch ? (rotation.slots.lunch.consumed ? 'LUNCH · CONSUMED' : 'LUNCH · PLANNED') : 'LUNCH · NOT SET')
      : demoMode ? 'LUNCH · 12:30' : 'LUNCH · OFFLINE',
    lunchCardLabel: usingLiveRecipes
      ? (rotation?.slots?.lunch ? rotation.slots.lunch.name : 'Not set')
      : demoMode ? 'Burrito bowl' : 'Not synced',
    lunchCardMacros: usingLiveRecipes
      ? (rotation?.slots?.lunch
          ? `${Math.round(rotation.slots.lunch.macros.p)}P · ${Math.round(rotation.slots.lunch.macros.c)}C · ${Math.round(rotation.slots.lunch.macros.f)}F · ${Math.round(rotation.slots.lunch.macros.kcal)} kcal`
          : 'Pick a lunch in Recipes →')
      : demoMode ? '52P · 68C · 18F · 640 kcal' : 'reconnect to load your rotation',
    // meaningful + live: names the next unconsumed meal that would close the
    // protein gap — changes as meals get marked eaten through the day
    proteinGaugeHint: usingLiveRecipes
      ? (proteinCurrent >= proteinTarget
          ? `${Math.round(proteinCurrent - proteinTarget)}g clear of your ${proteinTarget}g floor`
          : proteinNextSlot
            ? (proteinNextSlotFilled
                ? `eat ${proteinNextSlotFilled.name.toLowerCase()} to close the ${proteinGap}g gap`
                : `add a recipe to ${proteinNextSlot.name.toLowerCase()} to close the ${proteinGap}g gap`)
            : `${proteinGap}g under floor — all meals already eaten`)
      : 'burrito bowl closes the gap',
    openLunch: () => {
      if (usingLiveRecipes) {
        const lunch = rotation?.slots?.lunch;
        if (lunch) { app.navigate('recipes'); app.openRecipe(lunch.id); }
        else app.navigate('recipes');
      } else {
        app.navigate('recipes', { openRecipeId: 'r1', servings: 1, recipeChat: [] });
      }
    },
    workoutCardK: usingLiveWorkouts
      ? (todayRoutine ? 'TRAIN · TODAY' : todayActiveRest ? 'TRAIN · ACTIVE REST' : 'TRAIN · REST DAY')
      : demoMode ? 'TRAIN · 17:30' : 'TRAIN · OFFLINE',
    workoutCardLabel: usingLiveWorkouts
      ? (todayRoutine ? todayRoutine.name : todayActiveRest ? 'Active rest' : (liveRoutines.length ? 'No routine scheduled' : 'Build a routine in Train'))
      : demoMode ? 'Push day · week 6' : 'Not synced',
    workoutCardMeta: usingLiveWorkouts
      ? (todayRoutine ? `${todayRoutine.exercises.length} exercise${todayRoutine.exercises.length === 1 ? '' : 's'} · tap to start` : todayActiveRest ? 'Walk or stretch — no weights today' : 'Plan your week in Train →')
      : demoMode ? '6 lifts · 42 min · bench PR watch' : 'reconnect to load your plan',
    todayIsLive: !!st.liveCalendar,
    // Three honest cases: live calendar events; connected but calendar not
    // set up (say so — never demo events); pure demo mode keeps the
    // fictional schedule (global demo banner marks it).
    todayEvents: st.liveCalendar
      ? (st.liveCalendar.length
          ? markNow(st.liveCalendar.map(e => ({ time: e.time, label: e.label, category: e.calendar, categoryHue: categoryHue(e.calendar) })))
          : [{ time: '', label: 'Nothing on the calendar today' }])
      : !demoMode
        ? [{ time: '', label: 'Calendar not connected — set iCloud credentials in server/.env' }]
        : markNow([
            { time: '09:00', label: 'Deep work — video script' },
            { time: '12:30', label: 'Lunch — burrito bowl · 52g P' },
            { time: '17:30', label: 'Gym — push day · wk 6' },
            { time: '20:00', label: 'Reflection with Commander' },
          ]),
    // Ask Nova to schedule something — drafts a confirm-first proposal, never
    // writes the calendar until it's approved in the inbox.
    calCmdEnabled: !demoMode && !isOffline,
    calCmd: st.calCmdText,
    setCalCmd: (e) => app.setCalCmd(e),
    calCmdBusy: st.calCmdBusy,
    sendCalCmd: () => app.sendCalendarCommand(),

    // steps history + manual edit (Pedometer++-style), opened from the satellite
    stepsOverlay: st.stepsOverlayOpen ? (() => {
      const week = buildStepsWeek(st.liveHealthDays, STEP_GOAL);
      const withData = week.filter((d) => d.hasData);
      const editDay = st.stepEditDate ? week.find((d) => d.date === st.stepEditDate) : null;
      return {
        close: () => app.setState({ stepsOverlayOpen: false, stepEditDate: null }),
        goal: STEP_GOAL,
        current: stepsCurrent,
        currentIsStale: !!(stepsDay && stepsDay.date !== todayKey),
        days: week.map((d) => ({ ...d, editing: d.date === st.stepEditDate, startEdit: () => app.setState({ stepEditDate: d.date, stepEditValue: d.steps != null ? String(d.steps) : '' }) })),
        total: withData.reduce((s, d) => s + d.steps, 0),
        totalKm: +withData.reduce((s, d) => s + (d.km || 0), 0).toFixed(1),
        editDate: st.stepEditDate,
        editLabel: editDay ? editDay.full : '',
        editValue: st.stepEditValue,
        setEditValue: (e) => app.setState({ stepEditValue: e.target.value }),
        saveEdit: () => app.saveStepEdit(),
        cancelEdit: () => app.setState({ stepEditDate: null }),
      };
    })() : null,
  };
}

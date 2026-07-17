// Mission Control domain: connection status chips/banner, suggested focus,
// the three gauges (sleep/protein/steps), Nova-noticed insights + streaks,
// today's calendar, the three vault cards, and the boot-splash lines.
// Consumes ctx from valsRecipes (rotation, protein*), valsWorkouts
// (todayRoutine, liveRoutines, usingLiveWorkouts) and valsNotes
// (usingLiveNotes, reviewPage).

// Stable color per Apple Calendar name (Work, Health, Family, ...) so the same
// category always reads the same hue without hand-maintaining a lookup table.
const CATEGORY_HUES = ['216,181,115', '107,229,245', '138,106,209', '201,111,111', '90,168,124', '224,143,111'];
function categoryHue(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CATEGORY_HUES[Math.abs(hash) % CATEGORY_HUES.length];
}

export function valsMission(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline, lastSyncLabel, go, usingLiveRecipes, rotation,
    proteinTarget, proteinCurrent, proteinRatio, proteinGap, proteinNextSlot, proteinNextSlotFilled,
    usingLiveWorkouts, liveRoutines, todayRoutine, usingLiveNotes, reviewPage } = ctx;

  // health gauges (steps, sleep) — real Apple Health data once the phone-side Shortcut is sending it
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

  // suggested focus — derived from real data when connected (next calendar
  // event, else today's training, else the daily-review concept); the
  // scripted demo card survives only in demo mode
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowHM = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  let suggestedFocus;
  if (demoMode) {
    suggestedFocus = {
      source: 'from Commander',
      title: 'Finish the science video script — ',
      accent: 'Studio drafted the outline.',
      primaryLabel: 'Open draft',
      onPrimary: () => app.navigate('notes', { openNoteId: 'n3' }),
      secondaryLabel: 'Later today',
      onSecondary: () => app.toastMsg('Commander moved the script block to 14:00'),
    };
  } else {
    const nextEvent = (st.liveCalendar || []).find((e) => e.time && e.time >= nowHM);
    if (nextEvent) {
      suggestedFocus = {
        source: 'from your calendar',
        title: `${nextEvent.time} — `, accent: nextEvent.label,
        primaryLabel: 'See today', onPrimary: null, // stays on Mission Control; Today card is beside it
      };
    } else if (todayRoutine) {
      suggestedFocus = {
        source: 'from your training plan',
        title: 'Training today — ', accent: todayRoutine.name,
        primaryLabel: 'Start in Train', onPrimary: go('workouts'),
      };
    } else if (reviewPage) {
      suggestedFocus = {
        source: 'from your vault',
        title: 'Clear schedule — review a concept: ', accent: reviewPage.title,
        primaryLabel: 'Open review', onPrimary: () => app.openDailyReview(),
      };
    } else {
      suggestedFocus = {
        source: 'from Nova',
        title: 'All clear. ', accent: 'Nothing queued right now.',
        primaryLabel: 'Open Notes', onPrimary: go('notes'),
      };
    }
  }

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

  // honest status chips replacing "3 AGENTS LIVE · VAULT SYNCED 2M · BACKUP 02:00"
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

    // mission actions
    setGaugeIdx: (i) => app.setGaugeIdx(i),
    acceptRun: () => app.toastMsg('Zone-2 run locked for tomorrow, 7:00 am ✓'),
    openProteinNote: () => app.navigate('notes', { openNoteId: 'n1' }),
    reviewSubs: () => app.toastMsg('CFO drafted the cancellations — review in tonight’s reflection'),
    usingLiveHealthInsight: usingLiveNotes && !!st.liveHealthInsight,
    healthInsightItems: [
      st.liveHealthInsight?.morning?.hasInsight ? { key: 'morning', label: 'MORNING', text: st.liveHealthInsight.morning.insight } : null,
      st.liveHealthInsight?.evening?.hasInsight ? { key: 'evening', label: 'EVENING', text: st.liveHealthInsight.evening.insight } : null,
    ].filter(Boolean),
    healthInsightEmptyText: "Nova hasn't spotted a pattern yet — connect your Apple Health data to start getting daily insights here.",
    // streaks — pure computed momentum, no AI involved, so it's always
    // honest and free to show regardless of whether an insight generated
    streakBadges: st.liveStreaks
      ? [
          st.liveStreaks.workoutStreak >= 2 ? { key: 'workout', label: `${st.liveStreaks.workoutStreak}-day workout streak`, hue: '216,181,115' } : null,
          st.liveStreaks.stepGoalStreak >= 2 ? { key: 'steps', label: `${st.liveStreaks.stepGoalStreak}-day step goal streak`, hue: '168,224,99' } : null,
          st.liveStreaks.sleepGoalStreak >= 2 ? { key: 'sleep', label: `${st.liveStreaks.sleepGoalStreak}-day sleep goal streak`, hue: '107,229,245' } : null,
        ].filter(Boolean)
      : [],
    lunchCardLabel: usingLiveRecipes
      ? (rotation?.slots?.lunch ? `Lunch — ${rotation.slots.lunch.name}` : 'Lunch — not set')
      : 'Lunch — burrito bowl',
    lunchCardMacros: usingLiveRecipes
      ? (rotation?.slots?.lunch
          ? `${Math.round(rotation.slots.lunch.macros.p)}P · ${Math.round(rotation.slots.lunch.macros.c)}C · ${Math.round(rotation.slots.lunch.macros.f)}F · ${Math.round(rotation.slots.lunch.macros.kcal)} kcal`
          : 'Pick a lunch in Recipes →')
      : '52P · 68C · 18F · 640 kcal',
    lunchCardPhoto: usingLiveRecipes
      ? (rotation?.slots?.lunch ? 'dish photo — ' + rotation.slots.lunch.name.toLowerCase() : 'dish photo — none selected')
      : 'dish photo — burrito bowl',
    // meaningful + live: reflects what's actually been eaten today vs. the
    // real protein floor, and names the next unconsumed meal that would
    // close the gap — not a static caption, so it changes as you mark
    // meals eaten through the day.
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
    workoutCardLabel: usingLiveWorkouts
      ? (todayRoutine ? todayRoutine.name : (liveRoutines.length ? 'No routine scheduled today' : 'Build a routine in Train'))
      : 'Push day · week 6',
    workoutCardMeta: usingLiveWorkouts
      ? (todayRoutine ? `${todayRoutine.exercises.length} exercise${todayRoutine.exercises.length === 1 ? '' : 's'} · tap to start` : 'Plan your week in Train →')
      : '6 lifts · 42 min · bench PR watch',
    workoutCardPhoto: usingLiveWorkouts
      ? (todayRoutine ? 'workout — ' + todayRoutine.name.toLowerCase() : 'workout — rest day')
      : 'workout — push day',
    todayIsLive: !!st.liveCalendar,
    // Three honest cases: live calendar events; connected but calendar not
    // set up (say so — never demo events); pure demo mode keeps the
    // fictional schedule (global demo banner marks it).
    todayEvents: st.liveCalendar
      ? (st.liveCalendar.length
          ? st.liveCalendar.map(e => ({ time: e.time, label: e.label, category: e.calendar, categoryHue: categoryHue(e.calendar) }))
          : [{ time: '', label: 'Nothing on the calendar today' }])
      : !demoMode
        ? [{ time: '', label: 'Calendar not connected — set iCloud credentials in server/.env' }]
        : [
            { time: '09:00', label: 'Deep work — video script' },
            { time: '12:30', label: 'Lunch — burrito bowl · 52g P' },
            { time: '17:30', label: 'Gym — push day · wk 6' },
            { time: '20:00', label: 'Reflection with Commander' },
          ],
    rotSleep: st.gaugeIdx === 0,
    rotProtein: st.gaugeIdx === 1,
    rotSteps: st.gaugeIdx === 2,
    sleepGaugeValue: usingLiveHealthData ? (sleepDay ? `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m` : '—') : '7h 42m',
    sleepGaugeDasharray: usingLiveHealthData ? `${Math.round((sleepDay ? sleepRatio : 0) * 163)} 163` : '140 163',
    sleepGaugeHint: usingLiveHealthData
      ? (sleepDay
          ? (hrvDeltaPct != null ? `HRV ${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}% vs 7-day avg` : `${Math.round(sleepRatio * 100)}% of 8h goal`)
          : 'connect Apple Health in Settings')
      : 'recovered · HRV +6%',
    proteinGaugeValue: Math.round(proteinCurrent),
    proteinGaugeTargetLabel: `/${proteinTarget}g`,
    proteinGaugeDasharray: `${Math.round(proteinRatio * 163)} 163`,
    stepsGaugeValue: stepsCurrent.toLocaleString(),
    stepsGaugeDasharray: `${Math.round(stepsRatio * 163)} 163`,
    stepsGaugeHint: usingLiveHealthData
      ? (stepsCurrent >= STEP_GOAL ? `${STEP_GOAL.toLocaleString()} goal reached` : `${(STEP_GOAL - stepsCurrent).toLocaleString()} to ${STEP_GOAL.toLocaleString()} goal`)
      : 'connect Apple Health in Settings',
  };
}

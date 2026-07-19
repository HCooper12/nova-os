// Nova Inbox domain: the capture composer, filing-mode trust ladder, pending
// approvals, history with undo, and the "proposed rule" nudge (Nova notices
// from real history when a mode change has earned itself and proposes it —
// you Accept or Skip; it never changes its own autonomy).
// Adds to ctx: inboxPendingCount (sidebar badge).

const ROUTE_META = {
  shopping: { label: 'SHOPPING', hue: '95,232,168' },
  journal: { label: 'JOURNAL', hue: '143,123,255' },
  todo: { label: 'TO-DO', hue: '89,230,255' },
  note: { label: 'NOTE', hue: '224,178,106' },
  food: { label: 'FOOD LOG', hue: '255,122,217' },
  expense: { label: 'EXPENSE', hue: '224,178,106' },
  'money-import': { label: 'LEDGER IMPORT', hue: '224,178,106' },
  idea: { label: 'IDEA', hue: '143,123,255' },
  'idea-outline': { label: 'OUTLINE', hue: '143,123,255' },
};

const MODE_LADDER = [
  { value: 'review-all', label: 'Review everything', hint: 'Nova drafts the filing — you approve every one' },
  { value: 'auto-high', label: 'Auto-file high confidence', hint: 'sure things file themselves; doubts wait for you' },
  { value: 'auto-all', label: 'Auto-file everything', hint: 'full autonomy — history and undo keep the receipts' },
];

function payloadPreview(decision) {
  if (!decision) return '';
  const p = decision.payload || {};
  if (decision.route === 'shopping') return (p.items || []).map((i) => i.name).join(' · ');
  if (decision.route === 'todo') return (p.items || []).map((it) => (typeof it === 'string' ? it : `${it.text}${it.category ? ` #${it.category}` : ''}`)).join(' · ');
  if (decision.route === 'food') {
    const m = p.macros || {};
    return `${p.name} — ${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal`;
  }
  if (decision.route === 'journal') return p.text || '';
  if (decision.route === 'idea') return `${p.title} — ${p.hook} (${p.format})`;
  if (decision.route === 'idea-outline') return (p.text || '').slice(0, 200);
  if (decision.route === 'expense') return `${p.merchant} ${p.amount < 0 ? '−' : '+'}$${Math.abs(p.amount).toFixed(2)}${p.category ? ` · ${p.category}` : ''}`;
  if (decision.route === 'money-import') {
    const list = p.transactions || [];
    const shown = list.slice(0, 4).map((t) => `${t.merchant} ${t.amount < 0 ? '−' : '+'}$${Math.abs(t.amount).toFixed(2)}`).join(' · ');
    return list.length > 4 ? `${shown} · +${list.length - 4} more` : shown;
  }
  return `${p.title || ''} — ${p.body || ''}`;
}

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? hm : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + hm;
}

// The generalized proposal engine — every nudge is grounded in real history,
// names its evidence, and only ever PROPOSES; you accept or skip. One
// computation covers the inbox trust ladder, the dispatch ladder, and the
// compost loop. Each proposal carries a stable key so a skip sticks until
// the underlying evidence changes.
function computeProposals(app, st, items, dispatch, compost) {
  const out = [];
  const mode = st.inboxMode;
  const captures = items.filter((r) => !r.kind); // plain captures only
  const resolved = captures.filter((r) => ['filed', 'discarded', 'undone'].includes(r.status));

  // inbox ladder: promote after a clean approval streak
  if (mode === 'auto-high') {
    const reviewed = resolved.filter((r) => r.auto === false || r.status === 'discarded');
    const recent = reviewed.slice(0, 8);
    if (recent.length >= 8 && recent.every((r) => r.status === 'filed' && r.auto === false)) {
      out.push({
        key: `inbox-auto-all@${recent[0].id}`,
        text: `You've approved Nova's last ${recent.length} review calls without changing a thing — let it file everything on its own?`,
        acceptLabel: 'Accept',
        accept: () => { app.setInboxMode('auto-all'); app.toastMsg('Rule updated — Nova now auto-files everything'); },
      });
    }
  }
  // inbox ladder: step back after an undo streak
  if (mode === 'auto-all') {
    const autoFiled = resolved.filter((r) => r.auto === true).slice(0, 10);
    const undone = autoFiled.filter((r) => r.status === 'undone').length;
    if (autoFiled.length >= 5 && undone >= 2) {
      out.push({
        key: `inbox-auto-high@${autoFiled[0].id}`,
        text: `${undone} of Nova's last ${autoFiled.length} auto-filings had to be undone — step back to reviewing the uncertain ones?`,
        acceptLabel: 'Accept',
        accept: () => { app.setInboxMode('auto-high'); app.toastMsg('Rule updated — uncertain captures wait for you again'); },
      });
    }
  }

  // dispatch ladder, per slot: promote to auto after an approval streak,
  // propose pausing after a discard streak
  for (const slot of ['morning', 'evening', 'weekly']) {
    if (dispatch?.config?.[slot]?.mode !== 'draft') continue;
    const name = slot === 'evening' ? 'evening debriefs' : slot === 'weekly' ? 'weekly reviews' : 'morning dispatches';
    const recent = items
      .filter((r) => r.kind === 'dispatch' && (r.slot || 'morning') === slot && ['filed', 'discarded', 'undone'].includes(r.status))
      .slice(0, 3);
    if (recent.length >= 3 && recent.every((r) => r.status === 'filed' && r.auto === false)) {
      out.push({
        key: `dispatch-${slot}-auto@${recent[0].id}`,
        text: `You've approved the last ${recent.length} ${name} as drafted — let them file straight into the journal?`,
        acceptLabel: 'Accept',
        accept: () => app.setDispatchConfig(slot, { mode: 'auto' }),
      });
    }
    if (recent.length >= 3 && recent.every((r) => r.status === 'discarded')) {
      out.push({
        key: `dispatch-${slot}-off@${recent[0].id}`,
        text: `The last ${recent.length} ${name} were discarded unread — pause the loop?`,
        acceptLabel: 'Pause it',
        accept: () => app.setDispatchConfig(slot, { mode: 'off' }),
      });
    }
  }

  // Coach's evening training nudges — one at most. Priority: today's
  // scheduled session went unlogged (rescue); otherwise a LAPSED streak
  // (momentum that stopped on rest-adjacent days). Nudge only — accepting
  // opens Train; a skip holds for tonight and re-arms tomorrow.
  const training = dispatch?.training;
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (now.getHours() >= 18 && training && !training.loggedToday) {
    if (training.scheduledName) {
      out.push({
        key: `rescue@${dayKey}`,
        text: `${training.scheduledName} was on today's schedule and nothing's logged yet — a shortened session still counts.`,
        acceptLabel: 'Open Train',
        accept: () => { app.navigate('workouts'); app.dismissInboxProposal(`rescue@${dayKey}`); },
      });
    } else {
      const lastDate = st.liveStreaks?.lastWorkoutDate;
      const daysSince = lastDate ? Math.round((new Date(dayKey) - new Date(lastDate)) / 86400000) : null;
      if (daysSince != null && daysSince >= 3 && daysSince <= 7) {
        out.push({
          key: `streak-lapse@${dayKey}`,
          text: `No session in ${daysSince} days (last: ${lastDate}) — momentum is easier kept than rebuilt. A Quick Session fits any window.`,
          acceptLabel: 'Open Train',
          accept: () => { app.navigate('workouts'); app.dismissInboxProposal(`streak-lapse@${dayKey}`); },
        });
      }
    }
  }

  // Calendar follow-ups — task-like events get an evening "did it happen?"
  // (Hayden: "I don't always follow my calendar exactly"). Done files a
  // journal receipt; Move to To-Do carries it forward; Skip lets it go.
  const TASK_HINTS = ['meal prep', 'prep', 'cook', 'clean', 'laundry', 'groceries', 'grocery', 'shopping', 'errand', 'organise', 'organize', 'admin', 'wash', 'tidy', 'pick up', 'drop off', 'book ', 'call ', 'pay ', 'renew', 'study', 'review notes'];
  if (now.getHours() >= 18 && Array.isArray(st.liveCalendar)) {
    const answeredToday = new Set(
      items.filter((r) => r.kind === 'followup' && r.createdAt && new Date(r.createdAt).toDateString() === now.toDateString())
        .map((r) => (r.text || '').replace(/^✓ /, '').toLowerCase()),
    );
    const openTodos = new Set((st.liveTodos?.items || []).filter((t) => !t.checked).map((t) => t.text.toLowerCase()));
    for (const ev of st.liveCalendar) {
      const label = (ev.label || '').trim();
      if (!label) continue;
      const lower = ` ${label.toLowerCase()} `;
      if (!TASK_HINTS.some((h) => lower.includes(h))) continue;
      if (answeredToday.has(label.toLowerCase()) || openTodos.has(label.toLowerCase())) continue;
      const key = `followup@${dayKey}@${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      out.push({
        key,
        text: `“${label}” was on today's calendar${ev.time ? ` at ${ev.time}` : ''} — did it actually happen?`,
        acceptLabel: 'Done ✓',
        accept: () => app.answerFollowupDone(label, ev.time || '', key),
        altLabel: 'Move to To-Do',
        alt: () => app.moveFollowupToTodo(label, key),
      });
    }
  }

  // compost: proposals sitting unactioned for over a week deserve one nudge
  const openCompost = (compost?.proposals || []).filter((p) => p.status === 'open');
  if (openCompost.length) {
    const oldest = openCompost.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    if (Date.now() - new Date(oldest.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000) {
      out.push({
        key: `compost-waiting@${oldest.id}`,
        text: `${openCompost.length} compost proposal${openCompost.length === 1 ? ' has' : 's have'} been waiting over a week — worth a minute below.`,
        acceptLabel: 'Fair',
        accept: () => app.dismissInboxProposal(`compost-waiting@${oldest.id}`),
      });
    }
  }

  return out;
}

export function valsInbox(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline } = ctx;

  const inbox = st.liveInbox;
  const items = inbox?.items || [];
  const pendingCount = inbox ? items.filter((r) => r.status === 'pending').length : 0;

  Object.assign(ctx, { inboxPendingCount: pendingCount });

  const mkItem = (r) => ({
    id: r.id,
    kind: r.kind || null,
    text: r.text,
    time: timeLabel(r.createdAt),
    source: r.kind === 'review' ? 'DAILY REVIEW' : r.kind === 'dispatch' ? 'DISPATCH' : r.kind === 'compost' ? 'COMPOST' : r.kind === 'guardian' ? 'GUARDIAN' : r.kind === 'cfo' || r.kind === 'money-import' ? 'CFO' : r.kind === 'meal-prep' ? 'MEAL PREP' : r.kind === 'coach' ? 'COACH' : r.kind === 'research' ? 'RESEARCHER' : r.kind === 'followup' ? 'CALENDAR' : r.kind === 'studio' ? 'STUDIO' : r.source === 'voice' ? 'VOICE' : 'TYPED',
    status: r.status,
    route: r.decision ? (ROUTE_META[r.decision.route] || ROUTE_META.note) : null,
    confidence: r.decision?.confidence || null,
    reason: r.decision?.reason || '',
    title: r.decision?.title || r.text.slice(0, 60),
    preview: payloadPreview(r.decision),
    destination: r.destination || null,
    auto: !!r.auto,
    error: r.error || null,
    undoSummary: r.undoSummary || null,
    busy: !!st.inboxActionBusy[r.id],
    canUndo: r.status === 'filed' && !!r.undoData,
    approve: () => app.inboxAction(r.id, 'approve'),
    discard: () => app.inboxAction(r.id, 'discard'),
    undo: () => app.inboxAction(r.id, 'undo'),
  });

  const pendingItems = items.filter((r) => r.status === 'pending').map(mkItem);
  const historyItems = items.filter((r) => r.status !== 'pending').map(mkItem);

  // proposed rules (video-2 trust ladder: Nova proposes, you ratify) — the
  // generalized engine covers inbox, dispatch, and compost nudges
  const dismissed = new Set(st.inboxProposalDismissed);
  const inboxProposals = (!demoMode && inbox ? computeProposals(app, st, items, st.liveDispatch, st.liveCompost) : [])
    .filter((p) => !dismissed.has(p.key))
    .map((p) => ({ ...p, skip: () => app.dismissInboxProposal(p.key) }));

  // loops — daily brief controls, one row per slot
  const dispatch = st.liveDispatch;
  const SLOT_META = {
    morning: { label: 'MORNING DISPATCH', noun: 'dispatch', scope: 'today', defaultHour: 7, hourOptions: [5, 6, 7, 8, 9, 10] },
    evening: { label: 'EVENING DEBRIEF', noun: 'debrief', scope: 'today', defaultHour: 21, hourOptions: [19, 20, 21, 22] },
    weekly: { label: 'WEEKLY REVIEW', noun: 'review', scope: 'this week', defaultHour: 17, hourOptions: [15, 16, 17, 18, 19, 20] },
  };
  const slotStatus = (slot) => {
    const t = dispatch?.today?.[slot];
    const { noun, scope } = SLOT_META[slot];
    if (!t) return slot === 'weekly' ? 'no review yet this week — composes Sundays' : `no ${noun} yet today`;
    if (t.status === 'pending') return `${scope}'s ${noun} is waiting for review below`;
    if (t.status === 'filed') return `${scope}'s ${noun} is filed`;
    if (t.status === 'discarded') return `${scope}'s ${noun} was discarded`;
    if (t.status === 'undone') return `${scope}'s ${noun} was undone`;
    return `${scope}'s ${noun}: ${t.status}`;
  };
  const dispatchSlots = ['morning', 'evening', 'weekly'].map((slot) => ({
    slot,
    label: SLOT_META[slot].label,
    modes: ['off', 'draft', 'auto'].map((m) => ({
      value: m,
      label: m === 'off' ? 'Off' : m === 'draft' ? 'Draft' : 'Auto',
      active: dispatch?.config?.[slot]?.mode === m,
      pick: () => app.setDispatchConfig(slot, { mode: m }),
    })),
    hour: dispatch?.config?.[slot]?.hour ?? SLOT_META[slot].defaultHour,
    hourOptions: SLOT_META[slot].hourOptions,
    setHour: (e) => app.setDispatchConfig(slot, { hour: Number(e.target.value) }),
    status: slotStatus(slot),
    run: () => app.runDispatchNow(slot),
  }));

  // loops — compost proposals
  const compost = st.liveCompost;
  const COMPOST_BADGE = {
    'stale-capture': { label: 'STALE CAPTURE', hue: '224,178,106' },
    'orphan': { label: 'ORPHAN NOTE', hue: '143,123,255' },
    'sweep-todos': { label: 'SWEEP', hue: '89,230,255' },
  };
  const compostProposals = (compost?.proposals || [])
    .filter((p) => p.status === 'open')
    .map((p) => ({
      id: p.id,
      badge: COMPOST_BADGE[p.type] || { label: p.type.toUpperCase(), hue: '232,236,246' },
      title: p.title,
      detail: p.detail,
      actionable: p.type !== 'orphan',
      busy: !!st.compostActionBusy[p.id],
      accept: () => app.compostAction(p.id, 'accept'),
      dismiss: () => app.compostAction(p.id, 'dismiss'),
      open: p.type === 'orphan' && p.data?.noteId
        ? () => { app.selectNote(p.data.noteId); app.navigate('notes'); }
        : null,
    }));

  // loops — todoist two-way sync (to-dos mirror into the Todoist Inbox)
  const todoist = st.liveTodoist;
  const tdLast = todoist?.lastResult;
  const tdBits = tdLast && !tdLast.error
    ? [tdLast.pushed && `pushed ${tdLast.pushed}`, tdLast.pulled && `pulled ${tdLast.pulled}`, tdLast.closedInTodoist && `closed ${tdLast.closedInTodoist}`, tdLast.checkedInVault && `checked off ${tdLast.checkedInVault}`].filter(Boolean)
    : [];
  const mealPrepCard = {
    busy: !!st.mealPrepBusy,
    run: () => app.runMealPrepNow(),
  };

  // The Daily Review — the flagship intelligent loop
  const review = st.liveDailyReview;
  const reviewToday = review?.today;
  const reviewCard = {
    modes: ['off', 'draft', 'auto'].map((m) => ({
      value: m, label: m === 'off' ? 'Off' : m === 'draft' ? 'Draft' : 'Auto',
      active: review?.config?.mode === m,
      pick: () => app.setDailyReviewConfig({ mode: m }),
    })),
    hour: review?.config?.hour ?? 8,
    hourOptions: [5, 6, 7, 8, 9, 10, 11],
    setHour: (e) => app.setDailyReviewConfig({ hour: Number(e.target.value) }),
    status: !review ? 'checking…'
      : !reviewToday ? (review.config?.mode === 'off' ? 'off — turn on for a daily coached read across your whole life' : 'no review yet today — composes at the set hour')
      : reviewToday.status === 'classifying' ? 'Nova is reasoning across your day…'
      : reviewToday.status === 'pending' ? "today's review is waiting for you below"
      : reviewToday.status === 'filed' ? "today's review is filed to your journal"
      : reviewToday.status === 'error' ? 'today\'s review hit an error — try RUN NOW'
      : `today's review: ${reviewToday.status}`,
    busy: !!st.reviewBusy,
    run: () => app.runDailyReviewNow(),
  };
  const todoistCard = {
    configured: !!todoist?.configured,
    busy: !!st.todoistBusy,
    status: !todoist ? 'checking…'
      : !todoist.configured ? 'Not connected. Paste your API token into server/.env as TODOIST_TOKEN (Todoist → Settings → Integrations → Developer), then restart Nova.'
      : tdLast?.error ? `Connected, but the last pass hit an error: ${tdLast.error}`
      : todoist.lastSyncAt
        ? `${todoist.linkCount} open item${todoist.linkCount === 1 ? '' : 's'} in step · last pass ${timeLabel(todoist.lastSyncAt)}${tdBits.length ? ' — ' + tdBits.join(', ') : ''}`
        : 'Connected — the first pass runs within ten minutes, or run it now.',
    sync: () => app.runTodoistSyncNow(),
  };

  // loops — Guardian (the integrity agent's latest read-only check run)
  const guardianReport = st.liveGuardian?.lastReport;
  const GUARDIAN_TONE = { ok: 'var(--nv-good)', warn: 'var(--nv-gold)', alert: 'var(--nv-warn)' };
  const guardianCard = {
    loaded: !!guardianReport,
    status: guardianReport?.status || null,
    statusColor: GUARDIAN_TONE[guardianReport?.status] || 'var(--nv-ink40)',
    checkedLabel: guardianReport ? `checked ${timeLabel(guardianReport.at)}` : 'no check run yet',
    checks: (guardianReport?.checks || []).map((c) => ({
      id: c.id, label: c.label, detail: c.detail,
      color: GUARDIAN_TONE[c.status] || 'var(--nv-ink40)',
      statusLabel: c.status.toUpperCase(),
    })),
    busy: !!st.guardianBusy,
    run: () => app.runGuardianNow(),
    report: () => app.guardianReportNow(),
    exportVault: () => app.guardianExportNow(),
    lastExportLabel: st.liveGuardian?.lastExportAt ? `last export ${timeLabel(st.liveGuardian.lastExportAt)}` : 'never exported',
  };

  return {
    isInbox: st.screen === 'inbox',
    wrapInbox: st.isMobile ? { padding: 'calc(48px + env(safe-area-inset-top)) 16px calc(60px + env(safe-area-inset-bottom))' } : { padding: '28px 40px 44px', maxWidth: '980px' },
    inboxHeaderLabel: demoMode
      ? 'CONNECT A BACKEND TO CAPTURE'
      : isOffline
        ? 'OFFLINE — SHOWING LAST-KNOWN HISTORY'
        : inbox
          ? `${items.length} CAPTURE${items.length === 1 ? '' : 'S'} · ROUTED BY NOVA`
          : 'LOADING…',
    inboxConnected: !demoMode && !isOffline,
    inboxInput: st.inboxInput,
    setInboxInput: (e) => app.setInboxInput(e),
    inboxCaptureBusy: st.inboxCaptureBusy,
    submitInboxCapture: (source) => app.captureToInbox(st.inboxInput, source),
    submitResearch: () => {
      const q = st.inboxInput.trim();
      if (!q) { app.toastMsg('Type the research question first'); return; }
      app.setState({ inboxInput: '' });
      app.startResearch(q);
    },
    inboxModes: MODE_LADDER.map((m, i) => ({
      ...m,
      step: i + 1,
      active: st.inboxMode === m.value,
      pick: () => app.setInboxMode(m.value),
    })),
    inboxProposals,
    inboxPending: pendingItems,
    inboxHistory: historyItems,
    inboxPendingCount: pendingCount,
    inboxRefresh: () => app.refreshInbox(),

    // loops
    dispatchLoaded: !!dispatch,
    dispatchSlots,
    dispatchBusy: st.dispatchBusy,
    compostLoaded: !!compost,
    compostLastRun: compost?.lastRunAt ? timeLabel(compost.lastRunAt) : 'never',
    compostProposals,
    compostBusy: st.compostBusy,
    runCompostNow: () => app.runCompostNow(),
    todoist: todoistCard,
    guardian: guardianCard,
    mealPrep: mealPrepCard,
    dailyReview: reviewCard,
  };
}

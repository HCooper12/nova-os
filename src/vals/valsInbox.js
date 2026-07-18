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
  if (decision.route === 'todo') return (p.items || []).join(' · ');
  if (decision.route === 'food') {
    const m = p.macros || {};
    return `${p.name} — ${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal`;
  }
  if (decision.route === 'journal') return p.text || '';
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

  // dispatch ladder: promote to auto after an approval streak
  const dispatches = items.filter((r) => r.kind === 'dispatch' && ['filed', 'discarded', 'undone'].includes(r.status));
  if (dispatch?.config?.mode === 'draft') {
    const recent = dispatches.slice(0, 3);
    if (recent.length >= 3 && recent.every((r) => r.status === 'filed' && r.auto === false)) {
      out.push({
        key: `dispatch-auto@${recent[0].id}`,
        text: `You've approved the last ${recent.length} morning dispatches as drafted — let them file straight into the journal?`,
        acceptLabel: 'Accept',
        accept: () => app.setDispatchConfig({ mode: 'auto' }),
      });
    }
    if (recent.length >= 3 && recent.every((r) => r.status === 'discarded')) {
      out.push({
        key: `dispatch-off@${recent[0].id}`,
        text: `The last ${recent.length} morning dispatches were discarded unread — pause the loop?`,
        acceptLabel: 'Pause it',
        accept: () => app.setDispatchConfig({ mode: 'off' }),
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
    source: r.kind === 'dispatch' ? 'DISPATCH' : r.kind === 'compost' ? 'COMPOST' : r.source === 'voice' ? 'VOICE' : 'TYPED',
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

  // loops — morning dispatch controls
  const dispatch = st.liveDispatch;
  const dispatchModes = ['off', 'draft', 'auto'].map((m) => ({
    value: m,
    label: m === 'off' ? 'Off' : m === 'draft' ? 'Draft for review' : 'Auto-file',
    active: dispatch?.config?.mode === m,
    pick: () => app.setDispatchConfig({ mode: m }),
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

  return {
    isInbox: st.screen === 'inbox',
    wrapInbox: st.isMobile ? { padding: '66px 16px 96px' } : { padding: '28px 40px 44px', maxWidth: '980px' },
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
    dispatchModes,
    dispatchHour: dispatch?.config?.hour ?? 7,
    setDispatchHour: (e) => app.setDispatchConfig({ hour: Number(e.target.value) }),
    dispatchToday: dispatch?.today
      ? (dispatch.today.status === 'pending' ? 'today’s dispatch is waiting for review below'
        : dispatch.today.status === 'filed' ? 'today’s dispatch is filed'
        : dispatch.today.status === 'discarded' ? 'today’s dispatch was discarded'
        : dispatch.today.status === 'undone' ? 'today’s dispatch was undone'
        : 'today’s dispatch: ' + dispatch.today.status)
      : 'no dispatch yet today',
    dispatchBusy: st.dispatchBusy,
    runDispatchNow: () => app.runDispatchNow(),
    compostLoaded: !!compost,
    compostLastRun: compost?.lastRunAt ? timeLabel(compost.lastRunAt) : 'never',
    compostProposals,
    compostBusy: st.compostBusy,
    runCompostNow: () => app.runCompostNow(),
  };
}

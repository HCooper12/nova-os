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

// The self-improvement nudge, grounded in history rather than vibes:
//  - on auto-high: the last 8+ pending decisions were all approved untouched
//    and nothing recent was undone → propose full autonomy
//  - on auto-all: 2+ of the last 10 auto-filings were undone → propose
//    stepping back down to auto-high
function computeProposal(mode, items) {
  const resolved = items.filter((r) => ['filed', 'discarded', 'undone'].includes(r.status));
  if (mode === 'auto-high') {
    // the records that went through human review: approved (filed, auto:false),
    // discarded, or approved-then-undone
    const reviewed = resolved.filter((r) => r.auto === false || r.status === 'discarded');
    const recent = reviewed.slice(0, 8);
    const allCleanApprovals = recent.length >= 8 && recent.every((r) => r.status === 'filed' && r.auto === false);
    if (allCleanApprovals) {
      return {
        target: 'auto-all',
        text: `You've approved Nova's last ${recent.length} review calls without changing a thing — let it file everything on its own?`,
      };
    }
    return null;
  }
  if (mode === 'auto-all') {
    const autoFiled = resolved.filter((r) => r.auto === true || (r.status === 'undone' && r.auto === true)).slice(0, 10);
    const undone = autoFiled.filter((r) => r.status === 'undone').length;
    if (autoFiled.length >= 5 && undone >= 2) {
      return {
        target: 'auto-high',
        text: `${undone} of Nova's last ${autoFiled.length} auto-filings had to be undone — step back to reviewing the uncertain ones?`,
      };
    }
    return null;
  }
  return null;
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
    text: r.text,
    time: timeLabel(r.createdAt),
    source: r.source === 'voice' ? 'VOICE' : 'TYPED',
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

  // proposed rule (video-2 trust ladder: Nova proposes, you ratify)
  const rawProposal = !demoMode && inbox ? computeProposal(st.inboxMode, items) : null;
  const proposalKey = rawProposal ? `${rawProposal.target}@${items[0]?.id || 'none'}` : '';
  const inboxProposal = rawProposal && st.inboxProposalDismissed !== proposalKey
    ? {
        ...rawProposal,
        accept: () => { app.setInboxMode(rawProposal.target); app.toastMsg('Rule updated — Nova now runs on ' + MODE_LADDER.find((m) => m.value === rawProposal.target).label.toLowerCase()); },
        skip: () => app.dismissInboxProposal(proposalKey),
      }
    : null;

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
    inboxProposal,
    inboxPending: pendingItems,
    inboxHistory: historyItems,
    inboxPendingCount: pendingCount,
    inboxRefresh: () => app.refreshInbox(),
  };
}

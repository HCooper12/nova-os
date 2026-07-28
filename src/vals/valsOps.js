// Nova Operations — the machinery made visible. Every number here came from
// /api/ops (records + heartbeats); this file only arranges. Missing data
// renders as missing: no ops slice yet → the screen says so.

const STATUS_COLOR = {
  pending: 'var(--nv-gold)',
  classifying: 'var(--nv-vi)',
  filed: 'var(--nv-good)',
  discarded: 'color-mix(in srgb, var(--nv-ink) 35%, transparent)',
  undone: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)',
  error: 'var(--nv-warn)',
};

const KIND_LABEL = {
  capture: 'CAPTURE', research: 'RESEARCH', calendar: 'CALENDAR', review: 'REVIEW',
  dispatch: 'DISPATCH', 'routine-edit': 'PROGRAM', 'rotation-variant': 'ROTATION',
  preference: 'STANDING', stash: 'STASH', 'meal-prep': 'MEAL PREP', cfo: 'CFO',
  'food-suggestion': 'FOOD', 'training-check': 'TRAINING', guardian: 'GUARDIAN', coach: 'COACH',
};

function ago(iso) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function valsOps(app, ctx) {
  const st = app.state;
  const ops = st.liveOps;
  const { demoMode } = ctx;

  const freshDot = (state) => state === 'today'
    ? { background: 'var(--nv-cy)', boxShadow: '0 0 10px var(--nv-cy)' }
    : state === 'recent'
      ? { background: 'color-mix(in srgb, var(--nv-cy) 55%, transparent)' }
      : state === 'stale'
        ? { background: 'var(--nv-warn)', boxShadow: '0 0 7px color-mix(in srgb, var(--nv-warn) 60%, transparent)' }
        : { background: 'color-mix(in srgb, var(--nv-ink) 18%, transparent)' };

  return {
    isOps: st.screen === 'ops',
    opsLive: !demoMode && !!ops,
    opsEmptyLine: demoMode
      ? 'Operations is a live-only surface — connect to the Mac to see the real machinery.'
      : 'No operations data yet — the next sync fills this in.',
    opsPending: ops?.pending ?? 0,
    opsRunning: ops?.running ?? 0,
    opsFiledToday: ops?.filedToday ?? 0,
    opsGateLine: ops
      ? (ops.pending > 0
        ? `${ops.pending} item${ops.pending === 1 ? '' : 's'} at the human gate — everything waits for your yes`
        : 'The human gate is clear — nothing awaits your review')
      : null,
    goInboxFromOps: () => app.navigate('inbox'),
    // the fleet, arranged on a ring around the core (map layout is pure CSS)
    opsAgents: (ops?.agents || []).map((a, i, arr) => {
      const angle = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
      return {
        id: a.id, label: a.label, role: a.role, state: a.state,
        stateLabel: a.stateLabel,
        last: a.lastBeat ? `${ago(a.lastBeat)} ago` : 'never run',
        dotStyle: freshDot(a.state),
        x: Math.cos(angle), y: Math.sin(angle),
      };
    }),
    opsConversational: (ops?.conversational || []).map((a) => ({
      id: a.id, label: a.label, role: a.role,
      last: a.last ? `${a.last.title || ''} · ${ago(a.last.at)} ago` : 'no activity yet',
      dotStyle: freshDot(a.state),
    })),
    // ambient wall mode — same live state, arranged as presence
    isAmbient: st.screen === 'ambient',
    exitAmbient: () => app.navigate('mission'),
    goAmbient: () => app.navigate('ambient'),
    ambientNext: (() => {
      const nowHM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      const e = (st.liveCalendar || []).find((x) => x.time && x.time >= nowHM);
      return e ? { time: e.time, label: e.label } : null;
    })(),
    ambientSteps: (() => {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const day = (st.liveHealthDays || []).find((x) => x.date === key);
      return day?.steps ?? null;
    })(),
    ambientProtein: st.liveRotation?.consumedTotals
      ? { p: Math.round(st.liveRotation.consumedTotals.p), floor: st.liveRecipeProfile?.proteinFloorG ?? null }
      : null,
    ambientPending: ops?.pending ?? null,
    // the overnight queue — real items, real statuses, run window shown
    overnightItems: (st.liveOvernight?.items || []).map((i) => ({
      id: i.id,
      question: i.question,
      status: i.status.toUpperCase(),
      statusColor: i.status === 'queued' ? 'var(--nv-gold)' : i.status === 'running' ? 'var(--nv-vi)' : i.status === 'done' ? 'var(--nv-good)' : 'var(--nv-warn)',
      running: i.status === 'running',
      when: ago(i.ranAt || i.queuedAt),
      note: i.status === 'done' ? (i.title || 'brief in your Inbox') : i.status === 'error' ? (i.error || 'failed') : null,
      remove: i.status === 'queued' ? () => app.overnightRemove(i.id) : null,
    })),
    overnightWindow: st.liveOvernight?.windowLabel || '03:30–06:30',
    overnightQueuedCount: st.liveOvernight?.queuedCount ?? 0,
    overnightInput: st.overnightInput,
    setOvernightInput: (e) => app.setState({ overnightInput: e.target.value }),
    overnightKey: (e) => { if (e.key === 'Enter') app.overnightAdd(); },
    overnightAdd: () => app.overnightAdd(),
    overnightRunNow: () => app.overnightRunNow(),
    opsStream: (ops?.stream || []).map((r) => ({
      id: r.id,
      kind: KIND_LABEL[r.kind] || (r.kind || '').toUpperCase(),
      title: r.title,
      status: r.status.toUpperCase(),
      statusColor: STATUS_COLOR[r.status] || 'var(--nv-ink)',
      when: ago(r.at),
      destination: r.destination,
      source: r.source,
    })),
  };
}

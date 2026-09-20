import { bubble } from './shared.js';

// THE LEADER SCREEN — the day's idea held large, the standing picture of
// his leading (struggles / what's working), and the sit-down conversation.
// All data is the server's receipts; absence renders as absence.

export const KIND_LABEL = { action: 'TRY TODAY', reminder: 'REMEMBER', idea: 'CONSIDER' };

// Whole days since he said it; today reads "today", never "0d".
export function chipAge(iso, now = Date.now()) {
  if (!iso) return null;
  const d = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d < 0) return null;
  return d === 0 ? 'today' : `${d}d`;
}

// HOW LONG NOVA HAS BEEN OUT OF DATE, in one sentence. Owned here and used
// by Home too (valsMission imports it), because the two surfaces showing the
// same situation in different words is how a card starts lying.
export function situationSince(sit) {
  if (!sit) return null;
  return sit.daysSinceUpdate == null ? 'You have never updated this'
    : sit.daysSinceUpdate === 0 ? 'You updated this today'
      : `You last updated this ${sit.daysSinceUpdate} day${sit.daysSinceUpdate === 1 ? '' : 's'} ago`;
}

// THE SITUATION, WHEREVER IT IS SHOWN. His report, 21 Sep: the question and
// the answer box existed ONLY on the Home card — open the Leader itself and
// the thing it is currently asking him about was not there at all. One shape,
// two surfaces, one set of words.
export function situationFace(sit) {
  if (!sit?.openCount) return null;
  const since = situationSince(sit);
  return {
    key: 'situation',
    label: 'Your situation',
    chip: `${sit.openCount} open`,
    title: sit.headline || 'Your open situation',
    line: sit.stands || `${sit.openCount} thing${sit.openCount === 1 ? '' : 's'} still open. ${since.toLowerCase()}.`,
    foot: since + (sit.stale ? ' — Nova does not know what has happened since.' : '.'),
    question: sit.question || null,
    stale: !!sit.stale,
  };
}

// The reply box, with the same state and the same action on every surface, so
// an answer typed in the Leader and one typed on Home are the same send.
export function situationReply(app) {
  const st = app.state;
  return {
    value: st.situationAnswer || '',
    set: (e) => app.setState({ situationAnswer: typeof e === 'string' ? e : e.target.value }),
    send: () => app.submitSituationAnswer(),
    busy: !!st.situationAnswerBusy,
    said: st.situationAnswerSaid || null,
    clearSaid: () => app.setState({ situationAnswerSaid: null }),
  };
}

export function valsLeader(app, _ctx) {
  const st = app.state;
  const L = st.liveLeader;
  const today = L?.today || null;
  return {
    isLeader: st.screen === 'leader',
    // What Nova is currently asking him, ON the Leader — not only on Home.
    // Shaped as a LeaderBox of one face so the screen can render the same
    // house object Home does: same card, same reply box, same dictation.
    // `openLeader` is deliberately absent — it is already open.
    leaderSituationBox: (() => {
      const face = situationFace(L?.situation);
      if (!face) return null;
      return { faces: [face], face, index: 0, count: 1, soon: null, next: null, prev: null, select: null, reply: situationReply(app) };
    })(),
    leaderToday: today ? {
      chip: KIND_LABEL[today.kind] || 'CONSIDER',
      title: today.title,
      line: today.line,
      why: today.why || null,
      refs: today.refs || [],
    } : null,
    leaderRecent: (L?.recent || []).filter((d) => !today || d.date !== today.date).slice(0, 5)
      .map((d) => ({ date: d.date, chip: KIND_LABEL[d.kind] || 'CONSIDER', title: d.title })),
    // Age rides every chip ("· 12d") — the model has always seen it, he
    // never did — and a struggle can be marked handled from the chip itself
    // (the reflect route's resolved path: rails + undo already there).
    leaderProfile: {
      struggles: (L?.profile?.struggles || []).map((s) => ({ text: s.text, age: chipAge(s.at), resolve: () => app.leaderResolve(s.text) })),
      working: (L?.profile?.working || []).map((w) => ({ text: w.text, age: chipAge(w.at), resolve: null })),
    },
    leaderResolving: st.leaderResolving || null,
    leaderResearchMeta: L
      ? `${L.researchCount || 0} researched insight${L.researchCount === 1 ? '' : 's'}${L.lastResearchAt ? ` · last run ${String(L.lastResearchAt).slice(0, 10)}` : ' · no run yet'}`
      : null,
    leaderConnected: L != null,
    leaderMsgs: st.leaderChat.map((m) => ({
      text: m.text, typing: m.typing, streaming: m.streaming, at: m.at,
      tag: m.who === 'leader' ? '» LEADER' : m.who === 'system' ? '» SYSTEM' : '» YOU',
      tagStyle: { font: 'var(--nv-micro-m)', color: m.who === 'leader' ? 'var(--nv-gold)' : m.who === 'system' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' },
      ...bubble(m.who),
    })),
    leaderBusy: st.leaderBusy && !st.leaderChat.some((m) => m.streaming),
    leaderContinuing: !!st.leaderSessionId,
    leaderInput: st.leaderInput,
    setLeaderInput: (e) => app.setState({ leaderInput: e.target.value }),
    leaderKey: (e) => { if (e.key === 'Enter') app.doLeaderChat(); },
    sendLeader: () => app.doLeaderChat(),
    newLeaderChat: () => app.newLeaderChat(),
    openLeader: () => app.navigate('leader'),
  };
}

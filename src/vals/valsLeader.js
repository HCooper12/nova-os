import { mono, bubble } from './shared.js';

// THE LEADER SCREEN — the day's idea held large, the standing picture of
// his leading (struggles / what's working), and the sit-down conversation.
// All data is the server's receipts; absence renders as absence.

const KIND_LABEL = { action: 'TRY TODAY', reminder: 'REMEMBER', idea: 'CONSIDER' };

// Whole days since he said it; today reads "today", never "0d".
export function chipAge(iso, now = Date.now()) {
  if (!iso) return null;
  const d = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d < 0) return null;
  return d === 0 ? 'today' : `${d}d`;
}

export function valsLeader(app, _ctx) {
  const st = app.state;
  const L = st.liveLeader;
  const today = L?.today || null;
  return {
    isLeader: st.screen === 'leader',
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
      tagStyle: { font: `500 10px ${mono}`, color: m.who === 'leader' ? 'var(--nv-gold)' : m.who === 'system' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' },
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

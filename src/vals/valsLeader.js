import { mono, bubble } from './shared.js';

// THE LEADER SCREEN — the day's idea held large, the standing picture of
// his leading (struggles / what's working), and the sit-down conversation.
// All data is the server's receipts; absence renders as absence.

const KIND_LABEL = { action: 'TRY TODAY', reminder: 'REMEMBER', idea: 'CONSIDER' };

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
    leaderProfile: {
      struggles: (L?.profile?.struggles || []).map((s) => s.text),
      working: (L?.profile?.working || []).map((w) => w.text),
    },
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

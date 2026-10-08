import { bubble } from './shared.js';
import { parseVisualStream } from '../visualBeats.js';
import {
  shortName, ageDays, hhmm, dateWords, sinceWords, staleLine, pictureSentence, readReply, buildThread, KIND_WORDS,
} from './leaderPage.js';

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

// THE LEADER PAGE, BLEND 1 (his pick, 9 Oct 2026; design/mockups/82-redesign-
// leader-r2.html). The record as the page reads it: the picture (every open
// thing, every win, what was set down), the day's idea, the open question,
// the newest reply and whether he has opened it, the kept conversation. The
// ORDER is not decided here: the screen runs src/leaderOrder.js over this
// and its own clock, so the rule re-runs as the minute turns.
function leaderPage(app, ctx) {
  const st = app.state;
  const L = st.liveLeader;
  const demo = !!ctx?.demoMode;
  if (!L) return { ready: false, demo };
  const now = new Date();
  const pic = L.picture || {
    // an older server: the profile is all there is (newest eight)
    open: (L.profile?.struggles || []).map((s) => ({ text: s.text, at: s.at, checkedAt: null })),
    working: (L.profile?.working || []).map((w) => ({ text: w.text, at: w.at })),
    resolved: [], resolvedCount: 0, lastToldAt: null, lastToldDays: L.situation?.daysSinceUpdate ?? null,
  };
  const todayKey = now.toDateString();
  const mk = (s) => ({
    key: s.text, text: s.text, name: shortName(s.text), at: s.at, days: ageDays(s.at, now),
    checkedToday: !!(s.checkedAt && new Date(s.checkedAt).toDateString() === todayKey),
  });
  const open = (pic.open || []).map(mk).sort((a, b) => (a.at < b.at ? -1 : 1));      // oldest first
  const working = (pic.working || []).map(mk).sort((a, b) => (a.at < b.at ? -1 : 1));
  const down = (pic.resolved || []).map((s) => ({ ...mk(s), resolvedAt: s.resolvedAt }));
  const downToday = down.filter((s) => s.resolvedAt && new Date(s.resolvedAt).toDateString() === todayKey).length;

  const t = L.today || null;
  const today = t?.title ? {
    kind: KIND_WORDS[t.kind] || 'Consider',
    at: t.createdAt ? hhmm(new Date(t.createdAt)) : null,
    title: t.title, line: t.line || '', why: t.why || '', refs: t.refs || [],
  } : null;

  const q = L.question || (L.situation?.question ? { text: L.situation.question, since: t?.createdAt || null, open: true, about: null } : null);
  const aboutItem = q?.about ? open.find((o) => o.text === q.about) || null : null;
  const question = q ? {
    text: q.text, open: !!q.open, since: q.since || null, sinceWords: sinceWords(q.since, now),
    about: aboutItem ? aboutItem.key : null, aboutName: aboutItem?.name || null, aboutDays: aboutItem?.days ?? null,
  } : null;

  const thread = Array.isArray(L.thread) ? L.thread : [];
  let reply = null;
  for (let i = thread.length - 1; i >= 0; i--) if (thread[i].who === 'leader') { reply = thread[i]; break; }
  let since = null;
  try { since = localStorage.getItem('novaos.leaderSince'); } catch { /* per-device convenience */ }
  const clean = (x) => parseVisualStream(String(x || '')).text;
  const lastMine = [...thread].reverse().find((x) => x.who === 'you');

  return {
    ready: true,
    demo,
    events: st.liveCalendar || [],
    open, working, down, downCount: pic.resolvedCount ?? down.length, downToday,
    lastToldDays: pic.lastToldDays ?? null,
    lastToldAt: pic.lastToldAt || null,
    stale: staleLine(pic.lastToldDays ?? null, pic.lastToldAt),
    sentence: pictureSentence({ open: open.length, lastToldDays: pic.lastToldDays ?? null, downToday }),
    firstAt: [...open, ...working].reduce((m, x) => (!m || x.at < m ? x.at : m), null),
    today,
    question,
    reply: reply ? { id: reply.id, at: reply.at, unread: reply.seenAt == null, consult: reply.consult || null, ...readReply(reply.text, { consult: reply.consult, clean }) } : null,
    messages: buildThread({ thread, chat: st.leaderChat, ideas: [...(L.recent || [])].reverse(), since, now }),
    clean,
    lastTalkWords: lastMine ? `last ${dateWords(new Date(lastMine.at))}` : null,
    busy: !!st.leaderBusy,
    liveConsult: st.leaderConsult || null,
    answered: st.leaderAnswered || null,
    receipts: st.leaderReceipts || [],
    answerBusy: !!st.situationAnswerBusy,
    research: {
      count: L.researchCount || 0,
      last: L.lastResearchAt ? dateWords(new Date(L.lastResearchAt)) : null,
    },
    continuing: !!st.leaderSessionId,
  };
}

export function valsLeader(app, ctx) {
  const st = app.state;
  const L = st.liveLeader;
  const today = L?.today || null;
  return {
    isLeader: st.screen === 'leader',
    leaderPage: st.screen === 'leader' ? leaderPage(app, ctx) : null,
    // the page's verbs (App.jsx holds the writes; every one rides the rails)
    leaderAct: {
      setDown: (text) => app.leaderSetDown(text),
      stillOpen: (text) => app.leaderStillOpen(text),
      undo: (rc) => app.leaderUndo(rc),
      seen: (id) => app.leaderSeen(id),
      talk: (text, quote) => app.doLeaderChat(text, quote),
      answer: (text) => app.leaderAnswer(text),
      settleAnswer: () => app.setState({ leaderAnswered: null }),
      newChat: () => app.newLeaderChat(),
      refresh: () => app.refreshLeader(),
      back: () => app.navigate('index'),
    },
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
    setLeaderInput: (e) => app.setState({ leaderInput: typeof e === 'string' ? e : e.target.value }),
    leaderKey: (e) => { if (e.key === 'Enter') app.doLeaderChat(); },
    // accepts the live text a LocalInput's Enter hands straight over
    // (doLeaderChat already falls back to state for a no-arg Button click)
    sendLeader: (text) => app.doLeaderChat(text),
    newLeaderChat: () => app.newLeaderChat(),
    openLeader: () => app.navigate('leader'),
  };
}

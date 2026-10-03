import { bubbleProse } from '../bubbleProse.js';
import { whereLabel, deviceName } from '../conversationSync.js';
import { enrichBody, enrichProgram, activeBeat } from '../glassBeats.js';
import { tabLabel } from '../tabOrder.js';
import { undoLabel } from '../chatUndo.js';
import { clock, panelsOf, settleStage, stageLine, bylineOf, gistOf, newestAt } from '../novaThreadFacts.js';

// THE NOVA THREAD'S VIEW MODEL (29 Sep 2026) — design/mockups/63-redesign-
// nova-r2.html, D · Rising, with his amendment (the name at the top toggles a
// focus mode, the core as the page's centre). src/screens/NovaThread.jsx
// draws it; Voice.jsx hands over to that screen under `summary` only.
//
// It takes the whole merged view model (it goes last in renderVals) and adds
// one key, `novaThread`, null off `summary` and off the Nova tab, so no other
// style can ever see it. Every write it offers is a method the classic Voice
// screen already calls (sendOrb, rememberFromChat via the Inbox capture rail,
// undoVoiceAct, resolveVoiceProposal, the plan report's three, openVerdict,
// undoChatRoute, newVoiceChat and its Undo, setWakeWord, runShow, the close's
// answers); building it calls none of them.

const THIS_DEVICE = deviceName(typeof navigator === 'undefined' ? '' : navigator.userAgent);
const AGENT = { coach: 'Coach', leader: 'Leader' };
// "NOVA · DEFAULT" is the Station's caps; the sheet speaks in sentences
const ENGINE_WORDS = { 'NOVA · DEFAULT': 'Nova’s own voice', ELEVENLABS: 'ElevenLabs', BROWSER: 'This phone’s voice', 'VOICE · READY': 'Ready', '—': 'Not known yet' };

export function valsNovaThread(app, ctx, v) {
  const st = app.state;
  if (st.novaStyle !== 'summary' || st.screen !== 'voice') return { novaThread: null };
  const demo = !!ctx.demoMode;
  const offline = !demo && !!ctx.isOffline;
  const chat = (demo ? st.orbChat : st.voiceChat) || [];
  // demo content never carries a working verb: the classic screen gates the
  // same fields off in demo, and so does this one (NOVA-METHOD: demoMode-only)
  const live = !demo;

  const enrich = (p) => (p.kind === 'body' ? enrichBody(p) : p.kind === 'program' ? enrichProgram(p, st.liveWorkoutRoutines) : p.kind === 'steps' ? { ...p, revealed: (p.items || []).length } : p);
  const settledOf = (m) => {
    const panels = panelsOf(m.glass).map(enrich).filter(Boolean);
    const s = settleStage(panels);
    return s ? { ...s, gists: s.others.map(gistOf), panels } : null;
  };

  const lines = chat.map((m) => {
    const who = m.who === 'you' ? 'you' : m.who === 'system' ? 'system' : 'nova';
    const text = bubbleProse(m.text);
    const settled = who === 'nova' && m.glass ? settledOf(m) : null;
    return {
      at: m.at, who, agent: AGENT[m.who] || null, text,
      typing: !!m.typing, streaming: !!m.streaming,
      time: Number.isFinite(m.at) ? clock(m.at) : null,
      where: Number.isFinite(m.at) ? whereLabel(m, { device: THIS_DEVICE }) : null,
      via: m.via || null, on: m.on || null,
      attached: m.attached || null,
      // PROVENANCE SEAM (not built here): null until a record row carries
      // `by` / `from`; the byline slot on a message renders nothing then
      byline: bylineOf(m),
      settled,
      acted: live && m.acted ? {
        title: m.acted.title, status: m.acted.status || 'done',
        undo: (m.acted.status || 'done') === 'done' && m.acted.undoable ? () => app.undoVoiceAct(m.acted.recordId, m.at) : null,
      } : null,
      proposal: live && m.proposal ? {
        title: m.proposal.title, status: m.proposal.status, replaced: !!m.proposal.replaced,
        approve: m.proposal.status === 'pending' ? () => app.resolveVoiceProposal(m.proposal.recordId, true) : null,
        dismiss: m.proposal.status === 'pending' ? () => app.resolveVoiceProposal(m.proposal.recordId, false) : null,
      } : null,
      planReport: live && m.planReport ? {
        status: m.planReport.status,
        walk: () => app.walkThroughPlan(),
        coach: () => app.takePlanToCoach(),
        keep: m.planReport.status === 'open' ? () => app.keepPlanReport(m.planReport.recordId, m.at) : null,
        openInbox: () => app.openCapture(m.planReport.recordId),
      } : null,
      research: live && m.research ? {
        status: m.research.status, question: m.research.question,
        title: m.research.title || null, body: m.research.body || null, error: m.research.error || null,
      } : null,
      panel: m.panel || null,
      notice: m.notice ? { label: m.notice.label, why: m.notice.why, undo: () => app.undoChatRoute(m.notice) } : null,
      evidence: m.evidence ? { label: m.evidence.label, open: () => app.openVerdict(m.evidence.kind, m.evidence.of) } : null,
      // THE HOLD MENU (decided 29 Sep: Remember leaves the page for a hold on
      // the line). Remember files through the Inbox capture rail, whose Undo
      // lives on the Inbox record; Play again speaks the line; Copy is local.
      remember: live && who === 'nova' && text ? () => app.rememberFromChat(m.text) : null,
      playAgain: who === 'nova' && text && !demo ? () => app.speakTtsSentence(text) : null,
    };
  });

  // THE STAGE, while he speaks: the panel up now, the others behind it, and
  // his sentence with the spoken words lit. The reply being spoken is the
  // newest line of his; its raw text is what glassSpokenTo measures.
  const glass = v.glass;
  const speaking = !!st.voiceSpeaking;
  let stage = null;
  if (glass && speaking) {
    const beats = st.glassBeats || [];
    const idx = activeBeat(beats, st.glassSpokenTo || 0);
    const lastRaw = [...chat].reverse().find((m) => m.who !== 'you' && m.who !== 'system');
    stage = {
      hero: glass.hero, rail: glass.rail, gists: glass.rail.map(gistOf),
      n: idx + 1, total: beats.length,
      key: beats[idx]?.key || glass.hero.label,
      line: lastRaw ? stageLine(lastRaw.text, st.glassSpokenTo || 0) : null,
    };
  }

  const bq = v.briefQueue;
  const nameOf = (k) => tabLabel(k);

  return {
    novaThread: {
      demo, offline,
      lines,
      newestAt: newestAt(chat),
      nameOf,
      lastReplyAt: [...chat].reverse().find((m) => m.who === 'nova' && Number.isFinite(m.at))?.at ?? null,
      busy: !!st.voiceBusy,
      speaking,
      stage,
      engine: st.coreStyle,
      // the close (the morning brief's questions): the Coach-deck card, gold
      // because it waits on his call
      close: bq ? {
        idx: bq.idx, total: bq.total, label: bq.label, question: bq.question,
        yes: () => bq.answer('yes'), no: () => bq.answer('no'), later: () => bq.answer('later'), stop: bq.stop,
      } : null,
      blocked: v.speechBlocked,
      // Nova's status and settings: what the classic Station, ⋯ and chips held
      status: {
        answers: demo ? 'Demo replies' : offline ? 'Offline' : 'From your vault, read-only',
        engine: ENGINE_WORDS[v.voiceEngineLabel] || v.voiceEngineLabel,
        engineDetail: v.voiceEngineDetail || '',
        heyNova: v.wakeWordSupported ? { on: !!v.wakeWordOn, set: (on) => v.setWakeWord(on) } : null,
        briefMe: v.briefMe,
        ambient: live && !offline ? () => app.navigate('ambient') : null,
        ritual: v.ritualInvite && v.voiceLive ? { label: v.ritualInvite.kind === 'about-you' ? 'Let Nova learn you · 5 min' : v.ritualInvite.kind === 'morning' ? 'Morning brief' : 'Evening reflection', start: () => v.startRitual(v.ritualInvite.kind) } : null,
        newChat: v.voiceContinuing ? v.newVoiceChat : null,
        undoNewChat: v.voiceChatUndo ? { label: undoLabel(v.voiceChatUndo), run: v.undoNewVoiceChat } : null,
        endBrief: bq ? bq.stop : null,
        settings: () => app.navigate('settings'),
      },
      composer: {
        value: st.orbInput || '',
        setTyped: (t) => v.setTypedInputValue(t),
        send: (t) => v.sendOrb(t),
        route: (t) => { const r = v.routePreview?.(t); return r && r.lane !== 'ask' ? { label: r.label, why: r.why } : null; },
        attach: v.attach,
        offline,
      },
      // PROVENANCE SEAM (not built here): what is working for him right now,
      // above the composer. Null until that build fills it; renders nothing.
      bench: null,
      // THE TALK DOOR. On this page the tab bar's Nova button opens THIS
      // page's microphone (audit 05 finding 3: it used to open none). The
      // screen registers its own start, and the button calls it inside the
      // tap, so iOS still sees a gesture.
      registerTalk: (fn) => { app.novaThreadTalk = fn; },
      dockTalk: () => { if (typeof app.novaThreadTalk === 'function') app.novaThreadTalk(); else app.startLiveTalk(); },
      // THE FOCUS DOOR (30 Sep): the core is hidden at rest, and a tap on the
      // name brings it up. The screen registers its own setter here so the
      // dock can bring it up too (his "or if I hold the bottom corner nova
      // icon"). Since 1 Oct the dock's hold does (App.holdNovaCore): a hold
      // from another page waits for this registration, then the core comes
      // up with the microphone open. A no-op when the thread is not mounted.
      registerFocus: (fn) => { app.novaThreadFocus = fn; if (fn) app.consumeNovaHold?.(); },
      enterFocus: () => { if (typeof app.novaThreadFocus === 'function') app.novaThreadFocus(); },
      // THE FULL-SCREEN NOVA (3 Oct 2026, src/NovaFocus.jsx): open while its
      // own history entry is current, so the back swipe returns to the thread
      focus: !!st.novaFocus,
      openFocus: () => app.openNovaFocus(),
      closeFocus: () => app.closeNovaFocus(),
      syncFocus: () => app.syncNovaFocus(),
      micOpen: !!st.voiceScreenMic,
      openCapture: v.openCaptureSheet || null,
    },
  };
}

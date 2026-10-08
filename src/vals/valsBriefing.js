import { BRIEFING_STARTERS, starterLabel } from '../briefingStarters.js';
import {
  VERB_GROUPS, endCardRows, partsOf, nextPartBeat, backPartBeat, panelOf, boardPicture, briefingPhase,
  madeLine, countsLine, countWord, titleCount,
} from '../briefingFacts.js';

// THE BRIEFING READER — the report Nova researched, read or performed.
//
// ROUND 2 (9 Oct 2026, design/mockups/83-redesign-briefing-r2.html, approved
// "Looking good"). It plays on Nova's own stage (src/NovaFocus.jsx in its
// briefing mode): a panel rises out of the core only for a sentence with
// something to show, each word fades up in place with the word being said
// underlined in jade, a part's name drops into the rail, and skip, back,
// Script and Ask sit under his thumb. At the end the parts lift out of the
// rail as boards and an end card says what every verb does. Read is B's page
// with Nova pinned in a player at its foot. The rules are src/briefingFacts.js.
//
// Playback state lives in st.briefingPlay: { id, playing, current, gen }.
// `current` is the beat index whose audio has STARTED — set by the TTS
// queue's onPlay, the only honest clock (see design/BRIEFING-PLAN.md).

export function valsBriefing(app, ctx) {
  const st = app.state;
  const doc = st.briefing;
  const play = st.briefingPlay || {};
  const isBriefing = st.screen === 'briefing';
  const ready = doc && doc.status !== 'working' && doc.status !== 'error' && doc.briefing;
  const current = play.id === doc?.id ? (play.current ?? -1) : -1;
  const playing = !!(play.id === doc?.id && play.playing);
  if (!isBriefing) return { isBriefing, briefing: null };

  const urls = st.briefingMediaUrls || {};
  const beats = ready ? doc.beats : [];
  const brief = ready ? doc.briefing : null;
  const glossary = brief?.glossary || [];
  const atEnd = beats.length > 0 && current >= beats.length - 1 && !playing;
  const started = current >= 0;

  // the parts, as the rail and the boards draw them
  const parts = ready ? partsOf(brief.sections, beats, current).map((p) => ({
    ...p,
    picture: boardPicture(p, beats, { glossary, urls }),
    play: p.first >= 0 ? () => app.playBriefing(p.first) : null,
  })) : [];
  const curBeat = started ? beats[current] : null;
  const curPart = curBeat && curBeat.section >= 0 ? parts[curBeat.section] : null;

  // THE PANEL: the current sentence's picture, clip or term, and nothing for
  // a plain sentence. It stays while he pauses on that sentence, and is gone
  // at the end (the boards carry what each part showed).
  const ask = st.briefingAsk || null;
  const panel = started && !atEnd ? panelOf(curBeat, { glossary, urls }) : null;

  // ASK ON THE STAGE: while it is open, the stage is Nova's ordinary turn
  // (listening violet, thinking cyan, the answer in jade), drawn from the
  // conversation the ask joins; the panel his answer raises is the running
  // glass every reply has (v.glass), lit only while it is spoken.
  const chat = (ctx?.demoMode ? st.orbChat : st.voiceChat) || [];
  const askLines = ask ? chat.filter((m) => Number.isFinite(m.at) && m.at >= ask.at - 1000)
    .map((m) => ({ who: m.who === 'you' ? 'you' : m.who === 'system' ? 'system' : 'nova', agent: m.who === 'coach' ? 'Coach' : m.who === 'leader' ? 'Leader' : null, text: m.text || '', streaming: !!m.streaming })) : [];

  const mode = st.briefingMode === 'read' ? 'read' : 'listen';
  const phase = ready ? briefingPhase({ mode, atEnd, asking: !!ask, panel: ask ? null : panel }) : null;

  const save = st.briefingSave && st.briefingSave.id === doc?.id ? st.briefingSave.state : null;
  const rows = ready ? endCardRows(doc.status, { saveState: save }) : [];
  const verbAct = {
    save: () => app.fileBriefing(doc.id),
    ask: () => app.askBriefing('end'),
    later: () => app.closeBriefing(),
    discard: () => app.discardBriefing(doc.id),
    coach: null,
  };
  const verbs = rows.map((r) => ({
    ...r,
    run: r.built === false || r.done ? null : verbAct[r.key] || null,
    undo: r.done?.undo ? () => app.undoFileBriefing(doc.id) : null,
  }));
  const groups = VERB_GROUPS.map((g) => ({ ...g, verbs: verbs.filter((x) => x.group === g.key) })).filter((g) => g.verbs.length);

  return {
    isBriefing,
    // the stage is up: the tab bar steps away, as it does for the full-screen Nova
    briefingStage: !!ready,
    briefing: {
      id: doc?.id || null,
      loading: !!st.briefingLoading,
      // nothing open and nothing loading: say so, never a permanent "Opening…"
      empty: !doc && !st.briefingLoading,
      openInbox: () => app.navigate('inbox'),
      // the empty screen is not a void (finding 20, 22 Sep): the real ways to
      // ask, and the briefings that already exist — read off the Inbox
      // records of kind 'briefing', never invented
      starters: BRIEFING_STARTERS.map((s) => ({
        label: starterLabel(s), hint: s.hint,
        go: () => { app.spokenInput = false; app.navigate('voice', { orbInput: s.phrase }); },
      })),
      recent: (st.liveInbox?.items || [])
        .filter((r) => r.kind === 'briefing' && ['pending', 'filed', 'classifying'].includes(r.status))
        .slice(0, 4)
        .map((r) => ({
          id: r.id,
          // the report's own title once it exists (decision.payload.title,
          // server/lib/briefing.js); until then the request, which the screen
          // clamps — a briefing still being made has no title yet, honestly
          title: r.decision?.payload?.title || r.decision?.title || String(r.text || '').replace(/^Briefing:\s*/i, '') || 'Untitled briefing',
          titled: !!(r.decision?.payload?.title || r.decision?.title),
          state: r.status === 'classifying' ? 'being made' : r.status === 'filed' ? 'saved' : 'ready',
          working: r.status === 'classifying',
          open: () => app.openBriefing(r.id),
        })),
      working: doc?.status === 'working' ? {
        stage: doc.stage, angles: doc.angles || [], done: doc.done || 0, title: doc.title,
        line: doc.stage === 'planning' ? 'Working out the angles worth researching'
          : doc.stage === 'researching' ? `Researching ${doc.angles?.length || 'several'} angles at once, ${doc.done || 0} back so far`
          : doc.stage === 'writing' ? 'Writing the report and its script'
          : doc.stage === 'illustrating' ? 'Finding and caching the pictures' : 'Working',
      } : null,
      error: doc?.status === 'error' ? doc.error : (st.briefingError || null),
      retry: doc?.id ? () => app.openBriefing(doc.id) : null,
      title: ready ? brief.title : (doc?.title || 'Briefing'),
      topic: doc?.topic || null,
      summary: ready ? brief.summary : '',
      incomplete: ready ? brief.incomplete || null : null,
      sources: ready ? brief.sources : [],
      glossary,
      termsWord: countWord(glossary.length),
      made: ready ? madeLine(doc.createdAt) : null,
      counts: ready ? countsLine({ parts: brief.sections.length, sources: brief.sources.length }) : '',
      countsTerms: ready ? countsLine({ parts: brief.sections.length, sources: brief.sources.length, terms: glossary.length }) : '',
      allWord: titleCount(parts.length),
      sections: ready ? brief.sections.map((s, i) => ({
        i, heading: s.heading,
        paras: String(s.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        // where this section starts in the beat list, for "play from here"
        firstBeat: beats.findIndex((b) => b.section === i),
        active: started && beats[current]?.section === i,
        listen: () => { const f = beats.findIndex((b) => b.section === i); if (f >= 0) app.playBriefing(f); },
      })) : [],
      mode,
      openRead: () => app.openBriefingRead(),
      closeRead: () => app.closeBriefingRead(),
      // the Script: every line, under its part
      beats: beats.map((b) => ({
        i: b.i, say: b.say, kind: b.kind, section: b.section,
        current: b.i === current, past: started && b.i < current,
        part: b.kind === 'section-open' ? { n: b.section + 1, heading: brief.sections[b.section]?.heading || '' } : (b.kind === 'summary' ? { n: 0, heading: 'In brief' } : null),
        seek: () => app.seekBriefing(b.i),
      })),
      current, playing, started, atEnd,
      total: beats.length,
      parts,
      curPart: curPart ? { n: curPart.n, heading: curPart.heading } : (curBeat?.kind === 'summary' ? { n: 0, heading: 'In brief' } : null),
      partCount: parts.length,
      panel,
      phase,
      // controls
      play: ready ? () => app.playBriefing(started && current < beats.length - 1 ? current : 0) : null,
      resume: ready && started && !playing && !atEnd ? () => app.playBriefing(current) : null,
      pause: playing ? () => app.pauseBriefing() : null,
      restart: ready ? () => app.playBriefing(0) : null,
      // from the last part, Next part goes to the end: the boards
      next: ready ? () => { const n = nextPartBeat(beats, current); if (n >= 0) app.playBriefing(n); else app.endBriefing(); } : null,
      back: ready ? () => app.playBriefing(backPartBeat(beats, current)) : null,
      // the end card, every verb with its consequence (briefingFacts)
      groups,
      status: doc?.status || null,
      filed: !!doc?.filed,
      // ask on the stage
      ask: ask ? { scope: ask.scope, at: ask.at, lines: askLines, busy: !!st.voiceBusy, speaking: !!st.voiceSpeaking, end: () => app.endBriefingAsk() } : null,
      askMid: ready ? () => app.askBriefing(atEnd || !started ? 'end' : 'mid') : null,
      voiceSpeak: !!st.voiceSpeak,
      ttsConfigured: !!st.liveTts?.configured,
      close: () => app.closeBriefing(),
      refresh: () => doc?.id && app.openBriefing(doc.id, { silent: true }),
      demo: !!ctx?.demoMode,
    },
  };
}

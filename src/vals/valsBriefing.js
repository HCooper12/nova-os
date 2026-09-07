// THE BRIEFING READER — the report Nova researched, read or performed.
//
// Two ways to consume one artefact. LISTEN: Nova speaks each beat, the glass
// shows that beat's visual, the transcript highlights the sentence being
// said and scrolls with it. READ: the document — sections, the glossary in
// plain words, the sources. Same data, two media; the view model exposes
// both and the screen switches.
//
// Playback state lives in st.briefingPlay: { id, playing, current, gen }.
// `current` is the beat index whose audio has STARTED — set by the TTS
// queue's onPlay, the only honest clock (see design/BRIEFING-PLAN.md).

export function valsBriefing(app, _ctx) {
  const st = app.state;
  const doc = st.briefing;
  const play = st.briefingPlay || {};
  const isBriefing = st.screen === 'briefing';
  const ready = doc && doc.status !== 'working' && doc.status !== 'error' && doc.briefing;
  const current = play.id === doc?.id ? (play.current ?? -1) : -1;
  const playing = !!(play.id === doc?.id && play.playing);

  // the stage: the current beat's visual, and up to four before it receding
  // into a rail — the glass grammar the Morning Show already uses
  const beats = ready ? doc.beats : [];
  const stage = current >= 0 ? beats[current]?.visual || null : null;
  const rail = current > 0
    ? beats.slice(Math.max(0, current - 4), current).map((b) => b.visual).reverse()
    : [];

  return {
    isBriefing,
    briefing: !isBriefing ? null : {
      id: doc?.id || null,
      loading: !doc || st.briefingLoading,
      working: doc?.status === 'working' ? {
        stage: doc.stage, angles: doc.angles || [], done: doc.done || 0, title: doc.title,
        line: doc.stage === 'planning' ? 'Working out the angles worth researching…'
          : doc.stage === 'researching' ? `Researching ${doc.angles?.length || 'several'} angles at once — ${doc.done || 0} back so far`
          : doc.stage === 'writing' ? 'Writing the report and its script…' : 'Working…',
      } : null,
      error: doc?.status === 'error' ? doc.error : (st.briefingError || null),
      title: ready ? doc.briefing.title : (doc?.title || 'Briefing'),
      topic: doc?.topic || null,
      summary: ready ? doc.briefing.summary : '',
      incomplete: ready ? doc.briefing.incomplete || null : null,
      sources: ready ? doc.briefing.sources : [],
      glossary: ready ? doc.briefing.glossary : [],
      sections: ready ? doc.briefing.sections.map((s, i) => ({
        i, heading: s.heading,
        paras: String(s.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        // where this section starts in the beat list, for "play from here"
        firstBeat: beats.findIndex((b) => b.section === i),
        active: current >= 0 && beats[current]?.section === i,
      })) : [],
      mode: st.briefingMode || 'listen',
      setMode: (m) => app.setState({ briefingMode: m }),
      // the transcript
      beats: beats.map((b) => ({
        i: b.i, say: b.say, kind: b.kind, section: b.section,
        current: b.i === current, past: current >= 0 && b.i < current,
        heading: b.kind === 'section-open' ? doc.briefing.sections[b.section]?.heading : (b.kind === 'summary' ? 'In brief' : null),
        seek: () => app.seekBriefing(b.i),
      })),
      current, playing,
      total: beats.length,
      progress: beats.length ? Math.round(((current + 1) / beats.length) * 100) : 0,
      stage, rail,
      // controls
      play: ready ? () => app.playBriefing(current >= 0 && current < beats.length - 1 ? current : 0) : null,
      resume: ready && current >= 0 && !playing ? () => app.playBriefing(current) : null,
      pause: playing ? () => app.pauseBriefing() : null,
      restart: ready ? () => app.playBriefing(0) : null,
      atEnd: current >= 0 && current >= beats.length - 1 && !playing,
      ttsConfigured: !!st.liveTts?.configured,
      // the rails: approve files it to Wiki/Sources so every agent can read it
      filed: !!doc?.filed,
      file: ready && !doc.filed ? () => app.fileBriefing(doc.id) : null,
      close: () => app.closeBriefing(),
      refresh: () => doc?.id && app.openBriefing(doc.id, { silent: true }),
    },
  };
}

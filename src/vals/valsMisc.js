import { getConnection } from '../api.js';
import { orbReply } from '../mockAssistants.js';
import { NOTE_TYPE_COLOR, mono } from './shared.js';

// The smaller screens: Voice (concept preview), Memory Galaxy, Shopping List,
// Claude Code, and transcript ingest. Adds to ctx: shoppingItems (nav count).
export function valsMisc(app, ctx) {
  const st = app.state;
  const { wakeWord, demoMode, isOffline } = ctx;

  // shopping list — grouped by category (matching a typical supermarket layout)
  const shoppingItems = st.liveShoppingList?.items || [];
  const shoppingCategoryOrder = st.liveShoppingList?.categories || [];
  const shoppingCategories = shoppingCategoryOrder
    .map((cat) => ({
      name: cat,
      items: shoppingItems.filter((i) => i.category === cat).map((i) => ({
        id: i.id, name: i.name, source: i.source, checked: i.checked,
        onToggle: () => app.toggleShoppingItem(i.id, !i.checked),
        checkboxStyle: {
          width: '21px', height: '21px', borderRadius: '6px', flex: 'none',
          border: i.checked ? '1px solid var(--nv-cy)' : '1px solid color-mix(in srgb, var(--nv-ink) 25%, transparent)',
          background: i.checked ? 'var(--nv-cy)' : 'transparent',
          color: 'var(--nv-on-acc)', fontSize: '13px', fontWeight: 700, lineHeight: '19px', textAlign: 'center',
        },
        nameStyle: {
          fontSize: '13.5px',
          color: i.checked ? 'color-mix(in srgb, var(--nv-ink) 35%, transparent)' : 'var(--nv-ink)',
          textDecoration: i.checked ? 'line-through' : 'none',
        },
      })),
    }))
    .filter((c) => c.items.length > 0);
  const shoppingCheckedCount = shoppingItems.filter((i) => i.checked).length;

  // galaxy — real vault graph when available
  const liveGraphOn = !!(st.liveGraph && st.liveGraph.nodes.length);
  const galaxyStatsLabel = liveGraphOn
    ? `${st.liveGraph.nodes.length} STARS · ${st.liveGraph.links.length} LINKS`
    : '385 STARS · 1,227 LINKS · DEMO';
  const galaxyLegend = liveGraphOn
    ? Object.entries(NOTE_TYPE_COLOR).filter(([t]) => t !== 'raw').map(([t, color]) => ({ label: t + 's', color }))
    : [
        { label: 'notes', color: 'var(--nv-ink)' }, { label: 'podcasts', color: 'var(--nv-vi)' }, { label: 'recipes', color: 'var(--nv-gold)' },
        { label: 'training', color: '#5aa87c' }, { label: 'agents', color: 'var(--nv-cy)' },
      ];

  // shared with valsChrome (nav count)
  Object.assign(ctx, { shoppingItems });

  return {
    // shopping list
    shoppingHeaderLabel: st.liveShoppingList ? `${shoppingItems.length} ITEM${shoppingItems.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
    shoppingCategories,
    shoppingCheckedCount,
    shoppingAddInput: st.shoppingAddInput,
    setShoppingAddInput: (e) => app.setShoppingAddInput(e),
    submitShoppingAdd: () => app.submitShoppingAdd(),
    shoppingAddBusy: st.shoppingAddBusy,
    shoppingAddError: st.shoppingAddError,
    confirmShoppingCompletion: () => app.confirmShoppingCompletion(),

    // voice — Ask Nova: live = real read-only answers from the vault (+ TTS);
    // demo keeps the scripted preview; offline says so instead of pretending
    voiceLive: !demoMode && !isOffline,
    voiceBadge: demoMode
      ? { text: 'CONCEPT PREVIEW · DEMO REPLIES', tone: '#e08f6f' }
      : isOffline
        ? { text: 'OFFLINE — RECONNECT FOR ANSWERS', tone: 'var(--nv-gold)' }
        : { text: 'LIVE · READ-ONLY ANSWERS FROM YOUR VAULT', tone: 'var(--nv-cy)' },
    voiceBusy: st.voiceBusy,
    voiceSpeaking: st.voiceSpeaking,
    // Name an engine ONLY when the server names it — a guessed label is
    // false information wearing a confident face (it happened: an old
    // bundle showed ELEVENLABS while Kokoro spoke).
    voiceEngineLabel: !st.liveTts ? '—' : !st.liveTts.configured ? 'BROWSER'
      : st.liveTts.engine === 'local' ? 'NOVA · ON-DEVICE'
        : st.liveTts.engine === 'elevenlabs' ? 'ELEVENLABS' : 'VOICE · READY',
    voiceEngineDetail: !st.liveTts ? '' : st.liveTts.configured ? '' : 'add ELEVENLABS_API_KEY or NOVA_TTS_LOCAL=1 in server/.env for a real voice',
    // the picker's caption names the ACTUAL engine, never a brand it isn't
    voicePickerLabel: st.liveTts?.engine === 'local' ? 'NOVA VOICE' : st.liveTts?.engine === 'elevenlabs' ? 'ELEVENLABS VOICE' : 'VOICE',
    voiceDefaultLabel: st.liveTts?.engine === 'local' ? 'Nova (default)' : 'Account default',
    speakOn: st.voiceSpeak,
    toggleSpeak: () => app.setVoiceSpeak(!st.voiceSpeak),
    voiceOptions: (st.liveTts?.voices || []).map((v) => ({ id: v.id, name: v.name })),
    voiceVoiceId: st.voiceVoiceId,
    setVoiceId: (e) => app.setVoiceId(e.target.value),
    // free on-device voices — shown when not using ElevenLabs
    usingBrowserVoice: !st.liveTts?.configured,
    systemVoices: (st.speechVoices || []).filter((v) => (v.lang || '').toLowerCase().startsWith('en')).map((v) => ({ uri: v.voiceURI, name: `${v.name} · ${v.lang}` })),
    speechVoiceURI: st.speechVoiceURI,
    setSpeechVoice: (e) => app.setSpeechVoice(e.target.value),
    wakeWordLabel: wakeWord,
    orbMsgs: (!demoMode ? st.voiceChat : st.orbChat).map((m, i, arr) => ({
      text: m.text, typing: m.typing, panel: m.panel || null,
      // when this was said — only for messages that carry a real stamp
      // (restored pre-stamp history shows nothing rather than a guess)
      time: m.at ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      daySep: m.at && (!arr[i - 1]?.at || new Date(arr[i - 1].at).toDateString() !== new Date(m.at).toDateString())
        ? new Date(m.at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : null,
      proposal: !demoMode && m.proposal ? {
        title: m.proposal.title, status: m.proposal.status,
        approve: m.proposal.status === 'pending' ? () => app.resolveVoiceProposal(m.proposal.recordId, true) : null,
        dismiss: m.proposal.status === 'pending' ? () => app.resolveVoiceProposal(m.proposal.recordId, false) : null,
      } : null,
      research: !demoMode && m.research ? {
        status: m.research.status, question: m.research.question,
        title: m.research.title || null, body: m.research.body || null, error: m.research.error || null,
      } : null,
      tag: m.who === 'nova' ? '» NOVA' : m.who === 'system' ? '» SYSTEM' : '» YOU',
      tagStyle: { color: m.who === 'nova' ? 'var(--nv-cy)' : m.who === 'system' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', fontWeight: 500 },
      remember: !demoMode && m.who === 'nova' ? () => app.rememberFromChat(m.text) : null,
    })),
    voiceContinuing: !demoMode && !!st.voiceSessionId,
    newVoiceChat: () => app.newVoiceChat(),
    // ritual invitations — time-windowed, once a day, tapped never pushed
    ritualInvite: (() => {
      if (demoMode || st.voiceBusy) return null;
      const h = new Date().getHours();
      const doneToday = (k) => (st.ritualDone || {})[k] === new Date().toDateString();
      // an empty profile outranks the daily rituals: every agent reasons
      // from it, and Nova's own agents keep flagging the gap. liveProfile is
      // null BOTH before the first sync and when no page exists — so gate on
      // a live connection before treating null as "truly empty".
      const p = st.liveProfile;
      const profileEmpty = st.connectionStatus === 'connected'
        && (p == null || (!p.focus && !(p.priorities || []).length && !p.bestSelf && !p.notes));
      if (profileEmpty && !doneToday('about-you')) return { kind: 'about-you', label: '◈ LET NOVA LEARN YOU · 5 MIN' };
      if (h < 10 && !doneToday('morning')) return { kind: 'morning', label: '☀ MORNING BRIEF' };
      if (h >= 19 && !doneToday('evening')) return { kind: 'evening', label: '☾ EVENING REFLECTION' };
      return null;
    })(),
    startRitual: (kind) => app.startRitual(kind),
    orbInput: st.orbInput,
    setOrbInput: (e) => app.setState({ orbInput: e.target.value }),
    setOrbInputValue: (t) => app.setState({ orbInput: t }),
    dictationError: (err) => app.toastMsg(err === 'not-allowed'
      ? 'Microphone blocked — allow it in iOS Settings → Nova'
      : `Dictation stopped (${err}) — tap the mic to retry`),
    orbKey: (e) => { if (e.key === 'Enter') app.doOrb(); },
    sendOrb: () => app.doOrb(),
    primeSpeech: () => app.primeSpeech(),
    // conversation mode — the hands-free back-and-forth loop
    convMode: st.voiceConvMode,
    convPaused: st.voiceConvPaused,
    // the no-button reply window after Nova speaks (see App.endSpeech)
    replyListen: !demoMode && !!st.voiceReplyWindow,
    consumeReplyListen: () => app.setState({ voiceReplyWindow: false }),
    voiceAutoListenTick: st.voiceAutoListenTick,
    toggleConvMode: () => app.toggleConvMode(),
    notifyEmptyListen: () => app.notifyEmptyListen(),
    resumeConv: () => app.resumeConv(),
    stopSpeaking: () => app.stopSpeaking(),
    briefMe: () => {
      // the composed show: deterministic receipts, spoken beat-by-beat with
      // panes — evening variant after 5pm (day receipts + tomorrow's shape)
      if (!demoMode && !isOffline) { app.runShow(new Date().getHours() >= 17 ? 'evening' : 'morning'); return; }
      app.setState(s => ({ orbChat: [...s.orbChat, { who: 'you', text: 'Brief me.' }] }));
      setTimeout(() => app.typeIn('orbChat', 'nova', orbReply('brief')), 450);
    },

    // galaxy
    galaxyStatsLabel,
    galaxyLegend,
    galaxyRef: app.galaxyRef,
    galaxyClick: (e) => {
      if (!app.gPos) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let hit = null;
      app.gPos.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) < 16) hit = app.gNodes[i]; });
      app.setState({ galaxySel: hit ? { label: hit.label, type: hit.type.toUpperCase(), desc: hit.desc, color: hit.color, target: hit.target } : null });
    },
    galaxySelOn: !!st.galaxySel,
    galaxySelLabel: st.galaxySel ? st.galaxySel.label : '',
    galaxySelType: st.galaxySel ? st.galaxySel.type : '',
    galaxySelDesc: st.galaxySel ? st.galaxySel.desc : '',
    galaxySelColor: st.galaxySel ? st.galaxySel.color : 'var(--nv-gold)',
    galaxyClear: () => app.setState({ galaxySel: null }),
    galaxyOpen: () => {
      const t = st.galaxySel && st.galaxySel.target;
      if (!t) return;
      if (t.startsWith('note:')) { app.selectNote(t.slice(5)); app.navigate('notes', { galaxySel: null }); }
      else if (t.startsWith('n')) app.navigate('notes', { openNoteId: t, galaxySel: null });
      else if (t.startsWith('r')) app.navigate('recipes', { openRecipeId: t, servings: 1, recipeChat: [], galaxySel: null });
      else app.navigate(t, { galaxySel: null });
    },

    // code
    codeConnected: !!getConnection(),
    // C2 — the diff panel's view model
    codeChanges: st.codeChanges,
    codeChangesOpen: !!st.codeChangesOpen,
    toggleCodeChanges: () => app.setState({ codeChangesOpen: !st.codeChangesOpen }),
    codeCommitMsg: st.codeCommitMsg || '',
    setCodeCommitMsg: (e) => app.setState({ codeCommitMsg: e.target.value }),
    codeChangeBusy: !!st.codeChangeBusy,
    commitCodeChanges: () => app.commitCodeChanges(),
    shelveCodeChanges: () => app.shelveCodeChanges(),
    unshelveCodeChanges: () => app.unshelveCodeChanges(),
    codeShelf: st.codeShelf,
    codeMsgs: st.codeChat.map(m => ({ text: m.text, tag: m.who === 'claude' ? '» BUILDER' : m.who === 'breaker' ? '» BREAKER' : m.who === 'system' ? '» SYSTEM' : '» YOU', tagStyle: { color: m.who === 'claude' ? 'var(--nv-gold)' : m.who === 'breaker' ? 'var(--nv-mg)' : m.who === 'system' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', fontWeight: 500 } })),
    sparBusy: st.sparBusy,
    startSpar: () => app.startSpar(),
    codeBusy: st.codeBusy,
    codeInput: st.codeInput,
    setCodeInput: (e) => app.setState({ codeInput: e.target.value }),
    codeKey: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); app.doCode(); } },
    sendCode: () => app.doCode(),
    codeWorkspace: st.codeWorkspace,
    setCodeWorkspace: (w) => app.setCodeWorkspace(w),
    codeModel: st.codeModel,
    setCodeModel: (e) => app.setState({ codeModel: e.target.value }),
    codeModelOptions: [
      { value: 'sonnet', label: 'Sonnet 5' },
      { value: 'opus', label: 'Opus 4.8' },
      { value: 'fable', label: 'Fable 5' },
      { value: 'haiku', label: 'Haiku 4.5' },
    ],
    codeSessionActive: !!st.codeSessionId,
    newCodeSession: () => app.newClaudeCodeSession(),

    // ingest
    ingestModalOpen: st.ingestModalOpen,
    openIngestModal: () => app.openIngestModal(),
    closeIngestModal: () => app.closeIngestModal(),
    ingestText: st.ingestText,
    setIngestText: (e) => app.setState({ ingestText: e.target.value }),
    ingestSourceUrl: st.ingestSourceUrl,
    setIngestSourceUrl: (e) => app.setState({ ingestSourceUrl: e.target.value }),
    onIngestFile: (e) => app.onIngestFile(e),
    submitIngest: () => app.submitIngest(),
    ingestStatus: st.ingestStatus,
    ingestPreview: st.ingestPreview,
    ingestError: st.ingestError,
    closeIngestReview: () => app.closeIngestReview(),
    approveIngest: () => app.approveIngest(),
    discardIngest: () => app.discardIngest(),

    // stash — categorised restock/reference links (vault: Wiki/Library/Stash.md)
    stashLoaded: st.liveStash != null,
    stashHeaderLabel: ctx.demoMode
      ? 'CONNECT A BACKEND TO STASH LINKS'
      : ctx.isOffline
        ? 'OFFLINE — SHOWING LAST-KNOWN · ADDS QUEUE TO THE OUTBOX'
        : st.liveStash
          ? `${st.liveStash.reduce((n, c) => n + c.items.length, 0)} LINK${st.liveStash.reduce((n, c) => n + c.items.length, 0) === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN`
          : 'LOADING…',
    stashCategories: (st.liveStash || []).map((c) => ({
      name: c.name,
      items: c.items.map((it) => ({
        ...it,
        confirming: st.stashRemoveConfirm === it.raw,
        askRemove: () => app.setState({ stashRemoveConfirm: it.raw }),
        cancelRemove: () => app.setState({ stashRemoveConfirm: null }),
        remove: () => app.removeStashItem(it.raw),
        host: (() => { try { return new URL(it.url).hostname.replace(/^www\./, ''); } catch { return it.url; } })(),
      })),
    })),
    stashCategoryNames: (st.liveStash || []).map((c) => c.name),
    stashConnected: !ctx.demoMode,
    stashAddCategory: st.stashAddCategory,
    stashAddName: st.stashAddName,
    stashAddUrl: st.stashAddUrl,
    stashAddNote: st.stashAddNote,
    setStashField: (f) => (e) => app.setStashField(f, e),
    stashAddBusy: st.stashAddBusy,
    stashAddError: st.stashAddError,
    submitStashAdd: () => app.addStashItem(),
  };
}

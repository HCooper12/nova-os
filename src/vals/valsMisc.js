import { getConnection } from '../api.js';
import { GALAXY_MAX_NODES, toWorld } from '../galaxyLayout.js';
import { orbReply } from '../mockAssistants.js';
import { NOTE_TYPE_COLOR, mono } from './shared.js';
import { speechRecognitionSupported } from '../useDictation.js';
import { dtf } from './fmt.js';
import { RUNNING_BUILD, applyUpdate } from '../buildCheck.js';

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
        // legacy items carry no qty — one of a thing is the honest default
        qty: Math.max(1, Number(i.qty) || 1),
        // what the recipe called for ("1kg") — the thing he needs at the shops
        amount: i.amount || null,
        onToggle: () => app.toggleShoppingItem(i.id, !i.checked),
        incQty: () => app.setShoppingQty(i.id, Math.min(99, (Number(i.qty) || 1) + 1)),
        decQty: () => app.setShoppingQty(i.id, Math.max(1, (Number(i.qty) || 1) - 1)),
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
  const NOTE_TYPE_PLURAL = { entity: 'entities', analysis: 'analyses' }; // "entitys" is not a word
  const liveGraphOn = !!(st.liveGraph && st.liveGraph.nodes.length);
  const galaxyStatsLabel = liveGraphOn
    ? (st.liveGraph.nodes.length > GALAXY_MAX_NODES
      ? `${GALAXY_MAX_NODES} OF ${st.liveGraph.nodes.length} STARS · ${st.liveGraph.links.length} LINKS` // the cap, said out loud
      : `${st.liveGraph.nodes.length} STARS · ${st.liveGraph.links.length} LINKS`)
    : '385 STARS · 1,227 LINKS · DEMO';
  // LEGEND CHIPS ARE FILTERS — tap a type to fade the others (the smallest
  // honest version of Obsidian's filter panel); tap it again to clear.
  const galaxyTypes = st.galaxyTypes; // null = everything
  const toggleType = (type) => {
    const cur = st.galaxyTypes;
    const next = !cur ? [type] : cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
    app.setState({ galaxyTypes: next.length ? next : null });
  };
  const legendItem = (type, label, color) => ({ label, color, type, active: !galaxyTypes || galaxyTypes.includes(type), toggle: () => toggleType(type) });
  const galaxyLegend = liveGraphOn
    ? Object.entries(NOTE_TYPE_COLOR).filter(([t]) => t !== 'raw').map(([t, color]) => legendItem(t, NOTE_TYPE_PLURAL[t] || t + 's', color))
    : [
        legendItem('note', 'notes', 'var(--nv-ink)'), legendItem('podcast', 'podcasts', 'var(--nv-vi)'), legendItem('recipe', 'recipes', 'var(--nv-gold)'),
        legendItem('training', 'training', '#5aa87c'), legendItem('agent', 'agents', 'var(--nv-cy)'),
      ];
  // OVERLAYS — Nova's edge over Obsidian's graph: recency from each page's
  // own date, and the Compost's live candidates. A review-due overlay is NOT
  // offered: no due data reaches the app yet, and a chip that never lights
  // would be a dashboard lie.
  const compostOpen = st.liveCompost ? (st.liveCompost.proposals || []).filter((p) => p.status === 'open').length : null;
  const toggleOverlay = (key) => app.setState({ galaxyOverlay: st.galaxyOverlay === key ? null : key });
  const galaxyOverlays = [
    { key: 'recency', label: 'RECENCY', on: st.galaxyOverlay === 'recency', disabled: false, toggle: () => toggleOverlay('recency') },
    {
      key: 'compost',
      label: compostOpen == null ? 'COMPOST · NOT LOADED' : `COMPOST · ${compostOpen}`,
      on: st.galaxyOverlay === 'compost',
      disabled: compostOpen == null,
      toggle: () => toggleOverlay('compost'),
    },
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
    // CLEAR ALL — emptying a list by ticking twenty things off one at a time
    // is bookkeeping, not shopping. Confirms first (it wipes unchecked items
    // too, which is the point) and the toast carries a real undo.
    shoppingCanClear: shoppingItems.length > 0,
    shoppingClearArmed: !!st.shoppingClearArmed,
    armShoppingClear: () => app.setState({ shoppingClearArmed: true }),
    cancelShoppingClear: () => app.setState({ shoppingClearArmed: false }),
    confirmShoppingClear: () => app.clearShoppingList(),
    shoppingClearBusy: !!st.shoppingClearBusy,
    shoppingClearedCount: (st.shoppingCleared || []).length,
    undoShoppingClear: () => app.undoShoppingClear(),
    dismissShoppingClearUndo: () => app.dismissShoppingClearUndo(),

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
      : st.liveTts.engine === 'local' ? 'NOVA · DEFAULT'
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
    // "Hey Nova" — the Settings toggle and the Voice screen's status row
    wakeWordOn: !!st.wakeWordOn,
    wakeWordSupported: speechRecognitionSupported(),
    setWakeWord: (on) => app.setWakeWord(on),
    voiceTest: st.voiceTest || null,
    runVoiceTest: () => app.runVoiceTest(),
    // the Voice screen's dictation is local to that screen — App needs to
    // know, so the wake word never competes with it for the microphone
    briefQueue: st.briefQueue ? {
      idx: st.briefQueueIdx + 1,
      total: st.briefQueue.length,
      remaining: st.briefQueueRemaining,
      recordId: st.briefQueue[st.briefQueueIdx]?.recordId || null,
      question: st.briefQueue[st.briefQueueIdx]?.question || '',
      label: st.briefQueue[st.briefQueueIdx]?.label || '',
      answer: (a) => app.answerBriefQuestion(st.briefQueue[st.briefQueueIdx]?.recordId, a),
      stop: () => app.endBriefQueue(),
    } : null,
    // "Am I running your fix?" — answered by the app, not by guesswork
    novaBuild: RUNNING_BUILD,
    updateReady: st.updateReady ? {
      deployed: st.updateReady,
      apply: () => applyUpdate(),
      dismiss: () => app.setState({ updateReady: null }),
    } : null,
    stageCard: st.stageCard || null,
    stageHistory: st.stageHistory || [],
    // count > 1 means a whole sequence (e.g. the morning brief) was blocked
    // line by line — say so, rather than naming just the last sentence.
    speechBlocked: st.speechBlocked ? {
      message: st.speechBlocked.texts.length > 1
        ? `Nova has ${st.speechBlocked.texts.length} lines ready but ${st.speechBlocked.reason}.`
        : `Nova answered but ${st.speechBlocked.reason}.`,
      replay: () => app.replayBlockedSpeech(),
    } : null,
    // THE MODEL CHOICE GATE — mirrors server/lib/modelChoice.js's phrasing
    // client-side (the voice path's question already arrived embedded in
    // the spoken reply; this is what the popup shows for every path,
    // including that one, so looking at the screen tells the same story as
    // listening to it).
    modelChoicePrompt: st.modelChoicePending ? {
      question: {
        research: 'Want Opus for this research, or is Sonnet fine?',
        watch: 'Want Opus for this video, or is Sonnet fine?',
        book: 'Want Opus on this book? Deeper research finds more of its ideas and connections — or Sonnet is fine.',
      }[st.modelChoicePending.lane] || 'Want Opus for this, or is Sonnet fine?',
      pickOpus: () => app.resolveModelChoice('opus'),
      pickSonnet: () => app.resolveModelChoice('sonnet'),
      cancel: () => app.cancelModelChoice(),
    } : null,
    // the glass has his attention: the rest of the station blurs behind it
    stageFocus: !!(st.stageFocus && st.stageCard),
    dismissStage: () => app.dismissStage(),
    focusCard: (card) => app.focusCard(card),
    reportScreenMic: (on) => { if (!!st.voiceScreenMic !== !!on) app.setState({ voiceScreenMic: !!on }); },
    orbMsgs: (!demoMode ? st.voiceChat : st.orbChat).map((m, i, arr) => ({
      text: m.text, typing: m.typing, panel: m.panel || null,
      // The announcement strip on a message where the chat STARTED A JOB
      // rather than answered. It names the lane it chose and offers the one
      // way back — because routing that is invisible until it matters still
      // has to be visible the moment it gets it wrong.
      notice: m.notice ? {
        label: m.notice.label, why: m.notice.why,
        undo: () => app.undoChatRoute(m.notice),
      } : null,
      evidence: m.evidence ? { ...m.evidence, open: () => app.openVerdict(m.evidence.kind, m.evidence.of) } : null,
      // when this was said — only for messages that carry a real stamp
      // (restored pre-stamp history shows nothing rather than a guess)
      time: m.at ? dtf('', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.at)) : null,
      daySep: m.at && (!arr[i - 1]?.at || new Date(arr[i - 1].at).toDateString() !== new Date(m.at).toDateString())
        ? dtf('', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(m.at)) : null,
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
    // takes the live value from the LocalInput composer; without one it
    // falls back to App state (the SEND button path — a click blurs first)
    sendOrb: (text) => app.doOrb(text),
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
      if (app.gSkipClick) { app.gSkipClick = false; return; } // the double-tap that reset the view
      if (app.gMoved) return; // a drag or pinch is not a tap
      const r = e.currentTarget.getBoundingClientRect();
      const { x, y } = toWorld(app.gView, e.clientX - r.left, e.clientY - r.top); // screen → world
      const reach = 16 / app.gView.s; // a finger's worth, in world units
      let hit = null;
      app.gPos.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) < reach) hit = app.gNodes[i]; });
      app.setState({ galaxySel: hit ? { label: hit.label, type: hit.type.toUpperCase(), desc: hit.desc, color: hit.color, target: hit.target } : null });
    },
    galaxyPointerDown: (e) => app.galaxyPointerDown(e),
    galaxyPointerMove: (e) => app.galaxyPointerMove(e),
    galaxyPointerUp: (e) => app.galaxyPointerUp(e),
    galaxyZoomed: !!st.galaxyZoomed,
    galaxyResetView: () => app.galaxyResetView(),
    galaxyOverlays,
    galaxyFilterOn: !!galaxyTypes,
    galaxyClearFilter: () => app.setState({ galaxyTypes: null }),
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
    // Aliases, not pinned ids: this picker is a per-message override and
    // should follow whatever is newest in each family. The labels track the
    // model board's (server/lib/modelPrefs.js) — change both together.
    // ('Opus 4.8' sat here after Opus 5 shipped; that is the drift this
    // comment exists to prevent.)
    // served from the model board (MODEL_CHOICES, via the boot snapshot) — a
    // hand copy here is what drifted; the list below stands in only until
    // the first sync lands
    codeModelOptions: (st.liveModelPrefs?.models || []).some((m) => m.alias)
      ? st.liveModelPrefs.models.filter((m) => m.alias).map(({ value, label }) => ({ value, label }))
      : [
        { value: 'sonnet', label: 'Sonnet 5' },
        { value: 'opus', label: 'Opus 5' },
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
    ingestBookTitle: st.ingestBookTitle,
    setIngestBookTitle: (e) => app.setState({ ingestBookTitle: e.target.value }),
    ingestBookAuthor: st.ingestBookAuthor,
    setIngestBookAuthor: (e) => app.setState({ ingestBookAuthor: e.target.value }),
    ingestProgress: st.ingestProgress && st.ingestProgress.total
      ? `part ${st.ingestProgress.done} of ${st.ingestProgress.total} read`
      : null,
    browserSignIn: { busy: !!st.browserSignInBusy, open: () => app.openBrowserSignIn() },
    ingestPerson: st.ingestPerson,
    setIngestPerson: (e) => app.setState({ ingestPerson: e.target.value }),
    onIngestFile: (e) => app.onIngestFile(e),
    ingestFile: st.ingestFile ? { name: st.ingestFile.name, size: `${(st.ingestFile.size / 1048576).toFixed(1)} MB` } : null,
    clearIngestFile: () => app.setState({ ingestFile: null }),
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

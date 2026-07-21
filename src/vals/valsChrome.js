import { NOVA_THEMES, NOVA_CORES } from '../theme.js';
import { AGENTS, NOTE_TYPE_COLOR } from './shared.js';

// App chrome: sidebar nav, mobile tabs, per-screen wrappers and grids, the
// command palette, settings (incl. appearance), agents (concept), and the
// toast. Consumes ctx counts from the domain builders (usingLiveRecipes,
// liveRoutines, usingLiveNotes, journalDays, shoppingItems) plus the
// connection truth valsMission shares (statusChip, missionStatusItems).
export function valsChrome(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline, go, userName, wakeWord, usingLiveRecipes, usingLiveWorkouts, liveRoutines, usingLiveNotes, journalDays, shoppingItems, statusChip, agentsLiveCount, inboxPendingCount } = ctx;

  const navStyle = (act) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: '14px', letterSpacing: '.02em',
    color: act ? 'var(--nv-acc)' : 'var(--nv-ink60)',
    background: act ? 'var(--nv-acc-bg)' : 'none',
    border: act ? '1px solid var(--nv-acc-border)' : '1px solid transparent',
    boxShadow: act ? 'var(--nv-glow-tab)' : 'none',
    textShadow: act ? 'var(--nv-tsh-tab)' : 'none' });
  const numStyle = (act) => ({ fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px', width: '20px', flex: 'none', color: act ? 'var(--nv-acc)' : 'var(--nv-ink40)' });
  const mkNav = (label, numeral, screen, count) => ({ label, numeral, count, go: go(screen), style: navStyle(st.screen === screen), numStyle: numStyle(st.screen === screen) });

  // palette
  const cmds = [
    { icon: 'I.', iconColor: 'var(--nv-gold)', label: 'Mission Control', hint: 'GO', run: go('mission') },
    { icon: 'II.', iconColor: 'var(--nv-gold)', label: 'Voice — talk to Nova', hint: 'GO', run: go('voice') },
    { icon: 'III.', iconColor: 'var(--nv-gold)', label: 'Memory Galaxy', hint: 'GO', run: go('galaxy') },
    { icon: 'IV.', iconColor: 'var(--nv-gold)', label: 'Claude Code', hint: 'GO', run: go('code') },
    { icon: 'V.', iconColor: 'var(--nv-gold)', label: 'Inbox — capture anything', hint: 'GO', run: go('inbox') },
    { icon: 'VI.', iconColor: 'var(--nv-gold)', label: 'Recipes', hint: 'GO', run: go('recipes') },
    { icon: 'VII.', iconColor: 'var(--nv-gold)', label: 'Shopping List', hint: 'GO', run: go('shopping') },
    { icon: 'VIII.', iconColor: 'var(--nv-gold)', label: 'To-Do — synced with Todoist', hint: 'GO', run: go('todos') },
    { icon: 'IX.', iconColor: 'var(--nv-gold)', label: 'Train — workouts', hint: 'GO', run: go('workouts') },
    { icon: 'X.', iconColor: 'var(--nv-gold)', label: 'Notes', hint: 'GO', run: go('notes') },
    { icon: 'XI.', iconColor: 'var(--nv-gold)', label: 'Journal', hint: 'GO', run: go('journal') },
    { icon: 'XII.', iconColor: 'var(--nv-gold)', label: 'Money — the CFO', hint: 'GO', run: go('money') },
    { icon: 'XIII.', iconColor: 'var(--nv-gold)', label: 'Settings', hint: 'GO', run: go('settings') },
    // the scripted "Nova actions" only exist in demo mode — in live mode the
    // palette offers nothing it can't really do
    ...(demoMode ? [
      { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Scale burrito bowl to 2 servings', hint: 'NOVA', run: () => { app.navigate('recipes', { openRecipeId: 'r1', servings: 2, recipeChat: [], paletteOpen: false }); app.toastMsg('Nova scaled the burrito bowl ×2 — macros updated'); } },
      { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Ask Coach to ease today’s session', hint: 'COACH', run: () => { app.navigate('workouts', { paletteOpen: false }); setTimeout(() => app.doCoach('Make it a bit shorter today'), 300); } },
      { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Run vault backup — Guardian', hint: 'GUARDIAN', run: () => { app.setState({ paletteOpen: false }); app.toastMsg('Guardian: snapshot complete — 186 notes · 0 conflicts ✓'); } },
    ] : []),
    { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Start a voice session', hint: 'VOICE', run: () => { app.navigate('voice', { micOn: true, paletteOpen: false }); } },
  ];
  const pq = st.paletteQuery.toLowerCase();
  const paletteResults = cmds.filter(c => !pq || c.label.toLowerCase().includes(pq));
  // Summon becomes a capture surface: any non-empty query can be sent
  // straight to the Inbox — Nova routes it from there.
  const rawQuery = st.paletteQuery.trim();
  if (rawQuery) {
    paletteResults.push({
      icon: '✦', iconColor: 'var(--nv-cy)',
      label: `Capture to Inbox — “${rawQuery.length > 44 ? rawQuery.slice(0, 41) + '…' : rawQuery}”`,
      hint: 'CAPTURE',
      run: () => { app.setState({ paletteOpen: false }); app.captureToInbox(rawQuery, 'text'); },
    });
    paletteResults.push({
      icon: '🔭', iconColor: 'var(--nv-vi)',
      label: `Research the web — “${rawQuery.length > 40 ? rawQuery.slice(0, 37) + '…' : rawQuery}”`,
      hint: 'RESEARCHER',
      run: () => { app.setState({ paletteOpen: false }); app.startResearch(rawQuery); },
    });
    // Recall — real vault pages matching the query (debounced fetch)
    for (const r of st.recallResults) {
      paletteResults.push({
        icon: '◈', iconColor: NOTE_TYPE_COLOR[r.type] || 'var(--nv-ink)',
        label: `${r.title}${r.snippet ? ` — ${r.snippet.slice(0, 70)}${r.snippet.length > 70 ? '…' : ''}` : ''}`,
        hint: 'RECALL',
        run: () => { app.setState({ paletteOpen: false }); app.selectNote(r.id); app.navigate('notes'); },
      });
    }
  }
  if (pq.length >= 2 && 'about you profile'.includes(pq)) {
    paletteResults.push({
      icon: '◆', iconColor: 'var(--nv-gold)', label: 'About You — your profile', hint: 'PROFILE',
      run: () => { app.navigate('settings', { paletteOpen: false }); setTimeout(() => app.startProfileEdit(), 60); },
    });
  }

  // responsive
  const mob = st.isMobile;
  // mobile page padding must clear the fixed top bar (which now grows by the
  // Dynamic Island / status-bar inset) and the bottom nav (+ home indicator)
  const mp = { padding: 'calc(48px + env(safe-area-inset-top)) 16px calc(46px + env(safe-area-inset-bottom))' };
  const col = (mt) => ({ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: mt });
  const wrapTall = mob ? mp : null;
  // Mobile bottom tabs: EVERY screen, in sidebar order, in a horizontally
  // scrollable bar — so nothing is ever hidden behind Summon and the
  // numerals read I–XIII in sequence (the earlier out-of-order look came
  // from curating a reordered subset; the full ordered list fixes both).
  // The active tab auto-scrolls into view (see MobileChrome).
  const tabs = [
    ['I.', 'Home', 'mission'], ['II.', 'Voice', 'voice'], ['III.', 'Galaxy', 'galaxy'],
    ['IV.', 'Code', 'code'], ['V.', 'Inbox', 'inbox'], ['VI.', 'Recipes', 'recipes'],
    ['VII.', 'Shop', 'shopping'], ['VIII.', 'To-Do', 'todos'], ['IX.', 'Train', 'workouts'],
    ['X.', 'Notes', 'notes'], ['XI.', 'Journal', 'journal'], ['XII.', 'Money', 'money'],
    ['XIII.', 'Settings', 'settings'],
  ].map(t => {
    const act = st.screen === t[2];
    return { num: t[0], label: t[1], go: go(t[2]), active: act,
      style: { flex: 'none', minWidth: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '5px 9px', cursor: 'pointer', borderRadius: '9px', color: act ? 'var(--nv-acc)' : 'var(--nv-ink40)', background: act ? 'var(--nv-acc-bg)' : 'none', textShadow: act ? 'var(--nv-tsh-tab)' : 'none' },
      numStyle: { font: "500 8.5px 'IBM Plex Mono',monospace", letterSpacing: '.06em', color: act ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 32%, transparent)' } };
  });

  // sidebar status card — same connection truth as the status chip, phrased
  // for the two-line card under the roster
  const syncedShort = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  const sideStatus = {
    color: statusChip.color,
    pulse: statusChip.label === 'LIVE',
    row1: statusChip.label === 'LIVE' && st.liveNotes ? `LIVE · VAULT ${st.liveNotes.length}` : statusChip.label,
    row2: demoMode
      ? 'CONNECT A BACKEND IN SETTINGS'
      : isOffline
        ? `LAST-KNOWN DATA${syncedShort ? ' · SAVED ' + syncedShort : ''}`
        : st.connectionStatus === 'connecting'
          ? 'FIRST SYNC IN FLIGHT…'
          : `SYNCED ${syncedShort || '—'} · ALL SYSTEMS NOMINAL`,
  };

  return {
    // chrome
    showBoot: !st.booted,
    isMobile: mob, showSidebar: !mob, tabs,
    wrapMission: mob ? mp : { padding: '24px 40px 64px', maxWidth: '1180px' },
    wrapVoice: wrapTall || { padding: '28px 40px 40px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapGalaxy: wrapTall || { padding: '28px 40px 40px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapRecipes: mob ? mp : { padding: '28px 40px 44px' },
    wrapShopping: mob ? mp : { padding: '28px 40px 44px' },
    wrapTodos: mob ? mp : { padding: '28px 40px 44px', maxWidth: '860px' },
    wrapMoney: mob ? mp : { padding: '28px 40px 44px', maxWidth: '1080px' },
    wrapWorkouts: mob ? mp : { padding: '28px 40px 44px' },
    wrapCode: wrapTall || { padding: '28px 40px 44px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapNotes: wrapTall || { padding: '28px 40px 44px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapJournal: mob ? mp : { padding: '28px 40px 44px' },
    gridStats: mob ? col('20px') : { display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr', gap: '14px', marginTop: '24px' },
    gridNoticed: mob ? col('12px') : { display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: '14px', marginTop: '14px' },
    gridVault: mob ? col('12px') : { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginTop: '14px' },
    gridRecipes: mob ? col('16px') : { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginTop: '18px' },
    gridWork: mob ? col('16px') : { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '14px', marginTop: '16px' },
    gridCode: mob ? col('18px') : { flex: '1', display: 'grid', gridTemplateColumns: '1fr 250px', gap: '14px', marginTop: '18px', minHeight: 0 },
    gridNotes: mob ? col('16px') : { flex: '1', display: 'grid', gridTemplateColumns: '300px 1fr', gap: '14px', marginTop: '20px', minHeight: 0 },
    noteListCard: Object.assign({ border: '1px solid var(--nv-edge)', borderRadius: 'var(--nv-radius)', background: 'var(--nv-glass)', boxShadow: 'inset 0 1px 0 var(--nv-spec)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, mob ? { maxHeight: '320px', flex: 'none' } : {}),
    galaxyBox: Object.assign({ position: 'relative', marginTop: '16px', border: '1px solid var(--nv-edge)', borderRadius: 'var(--nv-radius)', overflow: 'hidden', background: 'radial-gradient(700px 420px at 50% 45%, color-mix(in srgb, var(--nv-vi) 08%, transparent), rgba(0,0,0,.24))', boxShadow: 'inset 0 1px 0 var(--nv-spec)' }, mob ? { height: '420px' } : { flex: '1' }),
    consoleCard: Object.assign({ border: '1px solid var(--nv-edge)', borderRadius: 'var(--nv-radius)', background: 'rgba(0,0,0,.32)', boxShadow: 'inset 0 1px 0 var(--nv-spec)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, mob ? { height: '460px' } : {}),
    gridRecipeOv: mob ? { display: 'flex', flexDirection: 'column', gap: '20px', padding: '18px' } : { display: 'grid', gridTemplateColumns: '300px 1fr', gap: '26px', padding: '26px' },
    recipeOvWrap: { position: 'fixed', inset: 0, background: 'rgba(8,5,12,.72)', backdropFilter: 'blur(6px)', zIndex: 60, display: 'flex', alignItems: mob ? 'flex-start' : 'center', justifyContent: 'center', padding: mob ? '14px' : '40px', overflowY: 'auto' },
    isMission: st.screen === 'mission', isVoice: st.screen === 'voice', isGalaxy: st.screen === 'galaxy',
    isRecipes: st.screen === 'recipes', isShopping: st.screen === 'shopping', isWorkouts: st.screen === 'workouts', isCode: st.screen === 'code', isNotes: st.screen === 'notes', isJournal: st.screen === 'journal',
    dateLabel: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(/,/g, ''),
    greeting: (new Date().getHours() < 12 ? 'Good morning, ' : new Date().getHours() < 18 ? 'Good afternoon, ' : 'Good evening, ') + userName + '.',
    navMain: [
      mkNav('Mission Control', 'I.', 'mission'),
      mkNav('Voice', 'II.', 'voice'),
      mkNav('Memory Galaxy', 'III.', 'galaxy'),
      mkNav('Claude Code', 'IV.', 'code'),
      Object.assign(mkNav('Inbox', 'V.', 'inbox'), inboxPendingCount > 0 ? { count: String(inboxPendingCount), countHot: true } : {}),
    ],
    navVault: [
      // counts: live numbers when synced, mock numbers only in demo mode,
      // and an honest "—" when configured but not yet synced (offline)
      Object.assign(mkNav('Recipes', 'VI.', 'recipes'), { count: usingLiveRecipes ? String(st.liveRecipes.length) : demoMode ? String(app.recipes.length) : '—' }),
      Object.assign(mkNav('Shopping', 'VII.', 'shopping'), { count: st.liveShoppingList ? String(shoppingItems.length) : demoMode ? '0' : '—' }),
      Object.assign(mkNav('To-Do', 'VIII.', 'todos'), { count: ctx.todosOpenCount != null ? String(ctx.todosOpenCount) : demoMode ? '0' : '—' }),
      Object.assign(mkNav('Train', 'IX.', 'workouts'), { count: usingLiveWorkouts ? String(liveRoutines.length) : '—' }),
      Object.assign(mkNav('Notes', 'X.', 'notes'), { count: usingLiveNotes ? String(st.liveNotes.length) : demoMode ? String(app.notes.length) : '—' }),
      Object.assign(mkNav('Journal', 'XI.', 'journal'), { count: st.liveJournalEntries ? String(journalDays.length) : demoMode ? '0' : '—' }),
      mkNav('Money', 'XII.', 'money'),
    ],
    navSystem: [mkNav('Settings', 'XIII.', 'settings')],
    agentsGroupLabel: `AGENTS · ${agentsLiveCount} OF ${AGENTS.length} LIVE`,
    agents: AGENTS.map((a, i) => ({
      name: a.name, role: a.role, on: a.on,
      dotStyle: a.on
        ? { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', flex: 'none', background: 'var(--nv-cy)', boxShadow: '0 0 9px var(--nv-cy)', animation: `novaPulse ${2.2 + i * 0.3}s infinite var(--nv-anim)` }
        : { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', flex: 'none', background: 'rgba(232,236,246,.16)' },
    })),
    sideStatus,
    goVoice: go('voice'), goWorkouts: go('workouts'), goSettings: go('settings'),
    orbCardTitle: st.micOn ? 'Nova is listening' : 'Nova is muted',
    orbCardSub: wakeWord ? 'VOICE · WAKE WORD ON' : 'VOICE · PUSH TO TALK',
    openPalette: () => app.setState({ paletteOpen: true, paletteQuery: '' }),
    stopClick: (e) => e.stopPropagation(),

    // appearance (Settings)
    novaTheme: st.novaTheme,
    novaThemeOptions: NOVA_THEMES.map((t) => ({ ...t, active: st.novaTheme === t.value, pick: () => app.setNovaTheme(t.value) })),
    calmMode: st.calmMode,
    toggleCalm: () => app.setCalmMode(!st.calmMode),
    coreStyle: st.coreStyle,
    novaCoreOptions: NOVA_CORES.map((c) => ({ ...c, active: st.coreStyle === c.value, pick: () => app.setCoreStyle(c.value) })),

    // settings
    isSettings: st.screen === 'settings',
    profile: !demoMode && !isOffline ? {
      set: !!(st.liveProfile && (st.liveProfile.focus || (st.liveProfile.priorities || []).length || st.liveProfile.bestSelf || st.liveProfile.notes)),
      editing: st.profileEditing,
      saving: st.profileSaving,
      draft: st.profileDraft,
      view: st.liveProfile ? {
        focus: st.liveProfile.focus,
        priorities: st.liveProfile.priorities || [],
        bestSelf: st.liveProfile.bestSelf,
        notes: st.liveProfile.notes,
        updated: st.liveProfile.updated,
      } : null,
      startEdit: () => app.startProfileEdit(),
      cancelEdit: () => app.setState({ profileEditing: false }),
      setField: (field) => (e) => app.setProfileField(field, e.target.value),
      save: () => app.saveProfile(),
    } : null,
    learning: !demoMode && !isOffline ? {
      noticed: st.liveLearning?.noticed || [],
      enoughData: !!st.liveLearning?.enoughData,
      loaded: st.liveLearning != null,
    } : null,
    pushSettings: !demoMode ? {
      state: st.pushState,
      label: st.pushState === 'on' ? 'ON — DRAFTS & ALERTS REACH YOUR PHONE'
        : st.pushState === 'denied' ? 'BLOCKED — ALLOW IN iOS SETTINGS → NOVA'
        : st.pushState === 'unsupported' ? 'INSTALL TO HOME SCREEN (SAFARI → SHARE) TO ENABLE'
        : st.pushState === 'checking' ? 'CHECKING…' : 'OFF',
      enable: () => app.enablePushNotifications(),
      test: () => app.testPush(),
    } : null,
    timeMachine: !demoMode && !isOffline ? {
      loaded: st.liveBackups != null,
      files: st.liveBackups || [],
      confirming: st.restoreConfirm,
      load: () => app.loadBackups(),
      askConfirm: (rel) => app.setState({ restoreConfirm: rel }),
      cancelConfirm: () => app.setState({ restoreConfirm: null }),
      restore: (rel) => app.restoreBackupNow(rel),
    } : null,
    wrapSettings: mob ? mp : { padding: '28px 40px 44px' },
    settingsBaseUrl: st.settingsBaseUrl,
    setSettingsBaseUrl: (e) => app.setState({ settingsBaseUrl: e.target.value }),
    settingsToken: st.settingsToken,
    setSettingsToken: (e) => app.setState({ settingsToken: e.target.value }),
    settingsTestStatus: st.settingsTestStatus,
    settingsTestMessage: st.settingsTestMessage,
    testSettingsConnection: () => app.testSettingsConnection(),
    saveSettingsConnection: () => app.saveSettingsConnection(),
    disconnectSettings: () => app.disconnectSettings(),
    connectionActive: usingLiveNotes,

    // palette
    paletteOpen: st.paletteOpen,
    paletteRef: app.paletteRef,
    paletteQuery: st.paletteQuery,
    setPaletteQuery: (e) => { app.setState({ paletteQuery: e.target.value }); app.queueRecall(e.target.value); },
    paletteKeyDown: (e) => { if (e.key === 'Enter' && paletteResults[0]) paletteResults[0].run(); },
    paletteResults,
    closePalette: () => app.setState({ paletteOpen: false }),

    // toast
    toastOn: !!st.toast, toast: st.toast,
  };
}

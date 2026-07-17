// App chrome: sidebar nav, mobile tabs, per-screen wrappers and grids, the
// command palette, settings, agents (concept), and the toast. Consumes ctx
// counts from the domain builders (usingLiveRecipes, liveRoutines,
// usingLiveNotes, journalDays, shoppingItems).
export function valsChrome(app, ctx) {
  const st = app.state;
  const { demoMode, go, userName, wakeWord, usingLiveRecipes, usingLiveWorkouts, liveRoutines, usingLiveNotes, journalDays, shoppingItems } = ctx;

  const navStyle = (act) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '9px', fontSize: '13.5px', cursor: 'pointer',
    fontWeight: act ? 500 : 400, color: act ? '#ece5da' : 'rgba(236,229,218,.6)',
    background: act ? 'linear-gradient(180deg,rgba(216,181,115,.16),rgba(216,181,115,.07))' : 'none',
    border: act ? '1px solid rgba(216,181,115,.25)' : '1px solid transparent',
    boxShadow: act ? 'inset 0 1px 0 rgba(255,255,255,.08)' : 'none' });
  const numStyle = (act) => ({ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: '13px', width: '20px', color: act ? '#d8b573' : 'rgba(216,181,115,.5)' });
  const mkNav = (label, numeral, screen, count) => ({ label, numeral, count, go: go(screen), style: navStyle(st.screen === screen), numStyle: numStyle(st.screen === screen) });

  // palette
  const cmds = [
    { icon: 'I.', iconColor: '#d8b573', label: 'Mission Control', hint: 'GO', run: go('mission') },
    { icon: 'II.', iconColor: '#d8b573', label: 'Voice — talk to Nova', hint: 'GO', run: go('voice') },
    { icon: 'III.', iconColor: '#d8b573', label: 'Memory Galaxy', hint: 'GO', run: go('galaxy') },
    { icon: 'IV.', iconColor: '#d8b573', label: 'Claude Code', hint: 'GO', run: go('code') },
    { icon: 'V.', iconColor: '#d8b573', label: 'Recipes', hint: 'GO', run: go('recipes') },
    { icon: 'VI.', iconColor: '#d8b573', label: 'Workouts', hint: 'GO', run: go('workouts') },
    { icon: 'VII.', iconColor: '#d8b573', label: 'Notes', hint: 'GO', run: go('notes') },
    { icon: 'VIII.', iconColor: '#d8b573', label: 'Settings', hint: 'GO', run: go('settings') },
    // the scripted "Nova actions" only exist in demo mode — in live mode the
    // palette offers nothing it can't really do
    ...(demoMode ? [
      { icon: '✦', iconColor: '#6be5f5', label: 'Scale burrito bowl to 2 servings', hint: 'NOVA', run: () => { app.navigate('recipes', { openRecipeId: 'r1', servings: 2, recipeChat: [], paletteOpen: false }); app.toastMsg('Nova scaled the burrito bowl ×2 — macros updated'); } },
      { icon: '✦', iconColor: '#6be5f5', label: 'Ask Coach to ease today’s session', hint: 'COACH', run: () => { app.navigate('workouts', { paletteOpen: false }); setTimeout(() => app.doCoach('Make it a bit shorter today'), 300); } },
      { icon: '✦', iconColor: '#6be5f5', label: 'Run vault backup — Guardian', hint: 'GUARDIAN', run: () => { app.setState({ paletteOpen: false }); app.toastMsg('Guardian: snapshot complete — 186 notes · 0 conflicts ✓'); } },
    ] : []),
    { icon: '✦', iconColor: '#6be5f5', label: 'Start a voice session', hint: 'VOICE', run: () => { app.navigate('voice', { micOn: true, paletteOpen: false }); } },
  ];
  const pq = st.paletteQuery.toLowerCase();
  const paletteResults = cmds.filter(c => !pq || c.label.toLowerCase().includes(pq));

  // responsive
  const mob = st.isMobile;
  const mp = { padding: '66px 16px 96px' };
  const col = (mt) => ({ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: mt });
  const wrapTall = mob ? mp : null;
  const tabs = [['I.', 'Home', 'mission'], ['II.', 'Voice', 'voice'], ['III.', 'Galaxy', 'galaxy'], ['IV.', 'Code', 'code'], ['V.', 'Recipes', 'recipes'], ['VI.', 'Shop', 'shopping'], ['VII.', 'Train', 'workouts'], ['VIII.', 'Notes', 'notes']].map(t => {
    const act = st.screen === t[2];
    return { num: t[0], label: t[1], go: go(t[2]),
      style: { flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '7px 2px', cursor: 'pointer', borderRadius: '9px', color: act ? '#d8b573' : 'rgba(236,229,218,.5)', background: act ? 'rgba(216,181,115,.09)' : 'none' },
      numStyle: { fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: '15px', color: act ? '#d8b573' : 'rgba(216,181,115,.45)' } };
  });

  return {
    // chrome
    showBoot: !st.booted,
    isMobile: mob, showSidebar: !mob, tabs,
    wrapMission: mob ? mp : { padding: '28px 40px 40px' },
    wrapVoice: wrapTall || { padding: '28px 40px 40px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapGalaxy: wrapTall || { padding: '28px 40px 40px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapRecipes: mob ? mp : { padding: '28px 40px 44px' },
    wrapShopping: mob ? mp : { padding: '28px 40px 44px' },
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
    noteListCard: Object.assign({ border: '1px solid rgba(236,229,218,.09)', borderRadius: '14px', background: 'linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, mob ? { maxHeight: '320px', flex: 'none' } : {}),
    galaxyBox: Object.assign({ position: 'relative', marginTop: '16px', border: '1px solid rgba(236,229,218,.09)', borderRadius: '14px', overflow: 'hidden', background: 'radial-gradient(700px 420px at 50% 45%, rgba(138,106,209,.08), rgba(0,0,0,.24))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)' }, mob ? { height: '420px' } : { flex: '1' }),
    consoleCard: Object.assign({ border: '1px solid rgba(236,229,218,.09)', borderRadius: '14px', background: 'rgba(0,0,0,.32)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, mob ? { height: '460px' } : {}),
    gridRecipeOv: mob ? { display: 'flex', flexDirection: 'column', gap: '20px', padding: '18px' } : { display: 'grid', gridTemplateColumns: '300px 1fr', gap: '26px', padding: '26px' },
    recipeOvWrap: { position: 'fixed', inset: 0, background: 'rgba(8,5,12,.72)', backdropFilter: 'blur(6px)', zIndex: 60, display: 'flex', alignItems: mob ? 'flex-start' : 'center', justifyContent: 'center', padding: mob ? '14px' : '40px', overflowY: 'auto' },
    isMission: st.screen === 'mission', isVoice: st.screen === 'voice', isGalaxy: st.screen === 'galaxy',
    isRecipes: st.screen === 'recipes', isShopping: st.screen === 'shopping', isWorkouts: st.screen === 'workouts', isCode: st.screen === 'code', isNotes: st.screen === 'notes', isJournal: st.screen === 'journal',
    clock: st.clock,
    dateLabel: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(/,/g, ''),
    greeting: (new Date().getHours() < 12 ? 'Good morning, ' : new Date().getHours() < 18 ? 'Good afternoon, ' : 'Good evening, ') + userName + '.',
    navMain: [mkNav('Mission Control', 'I.', 'mission'), mkNav('Voice', 'II.', 'voice'), mkNav('Memory Galaxy', 'III.', 'galaxy'), mkNav('Claude Code', 'IV.', 'code')],
    navVault: [
      Object.assign(mkNav('Recipes', 'V.', 'recipes'), { count: usingLiveRecipes ? String(st.liveRecipes.length) : String(app.recipes.length) }),
      Object.assign(mkNav('Shopping List', 'VI.', 'shopping'), { count: String(shoppingItems.length) }),
      Object.assign(mkNav('Workouts', 'VII.', 'workouts'), { count: usingLiveWorkouts ? String(liveRoutines.length) : '—' }),
      Object.assign(mkNav('Notes', 'VIII.', 'notes'), { count: usingLiveNotes ? String(st.liveNotes.length) : String(app.notes.length) }),
      Object.assign(mkNav('Journal', 'IX.', 'journal'), { count: String(journalDays.length) }),
    ],
    navSystem: [mkNav('Settings', 'X.', 'settings')],
    agents: [
      { name: 'Commander', role: 'planning', dotStyle: { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', background: '#6be5f5', boxShadow: '0 0 8px rgba(107,229,245,.8)', animation: 'novaPulse 2.4s infinite' } },
      { name: 'Coach', role: 'fitness', dotStyle: { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', background: '#6be5f5', boxShadow: '0 0 8px rgba(107,229,245,.8)', animation: 'novaPulse 3.1s infinite' } },
      { name: 'CFO', role: 'money', dotStyle: { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(236,229,218,.18)' } },
      { name: 'Studio', role: 'content', dotStyle: { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(236,229,218,.18)' } },
      { name: 'Researcher', role: 'web', dotStyle: { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(236,229,218,.18)' } },
      { name: 'Guardian', role: 'backups', dotStyle: { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', background: '#6be5f5', boxShadow: '0 0 8px rgba(107,229,245,.8)', animation: 'novaPulse 2.8s infinite' } },
    ],
    goVoice: go('voice'), goWorkouts: go('workouts'), goSettings: go('settings'),
    orbCardTitle: st.micOn ? 'Nova is listening' : 'Nova is muted',
    orbCardSub: wakeWord ? 'VOICE · WAKE WORD ON' : 'VOICE · PUSH TO TALK',
    openPalette: () => app.setState({ paletteOpen: true, paletteQuery: '' }),
    stopClick: (e) => e.stopPropagation(),

    // settings
    isSettings: st.screen === 'settings',
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
    setPaletteQuery: (e) => app.setState({ paletteQuery: e.target.value }),
    paletteKeyDown: (e) => { if (e.key === 'Enter' && paletteResults[0]) paletteResults[0].run(); },
    paletteResults,
    closePalette: () => app.setState({ paletteOpen: false }),

    // toast
    toastOn: !!st.toast, toast: st.toast,
  };
}

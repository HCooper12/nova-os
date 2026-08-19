import { NOVA_THEMES, NOVA_CORES, NOVA_STYLES } from '../theme.js';
import { TAB_META, tabLabel, romanFor } from '../tabOrder.js';
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
    fontFamily: "var(--nv-font-ui)", fontWeight: 600, fontSize: '14px', letterSpacing: '.02em',
    color: act ? 'var(--nv-acc)' : 'var(--nv-ink60)',
    background: act ? 'var(--nv-acc-bg)' : 'none',
    border: act ? '1px solid var(--nv-acc-border)' : '1px solid transparent',
    boxShadow: act ? 'var(--nv-glow-tab)' : 'none',
    textShadow: act ? 'var(--nv-tsh-tab)' : 'none' });
  const numStyle = (act) => ({ fontFamily: "var(--nv-font-mono)", fontSize: '9px', width: '20px', flex: 'none', color: act ? 'var(--nv-acc)' : 'var(--nv-ink40)' });
  const mkNav = (label, numeral, screen, count) => ({ label, numeral, screen, count, go: go(screen), style: navStyle(st.screen === screen), numStyle: numStyle(st.screen === screen) });

  // palette
  const cmds = [
    { icon: 'I.', iconColor: 'var(--nv-gold)', label: 'Mission Control', hint: 'GO', run: go('mission') },
    { icon: 'II.', iconColor: 'var(--nv-gold)', label: 'Voice — talk to Nova', hint: 'GO', run: go('voice') },
    { icon: 'III.', iconColor: 'var(--nv-gold)', label: 'Memory Galaxy', hint: 'GO', run: go('galaxy') },
    { icon: 'IV.', iconColor: 'var(--nv-gold)', label: 'Claude Code', hint: 'GO', run: go('code') },
    { icon: 'V.', iconColor: 'var(--nv-gold)', label: 'Inbox — capture anything', hint: 'GO', run: go('inbox') },
    { icon: 'VI.', iconColor: 'var(--nv-gold)', label: 'Fuel', hint: 'GO', run: go('recipes') },
    { icon: 'VII.', iconColor: 'var(--nv-gold)', label: 'Shopping List', hint: 'GO', run: go('shopping') },
    { icon: 'VIII.', iconColor: 'var(--nv-gold)', label: 'To-Do — synced with Todoist', hint: 'GO', run: go('todos') },
    { icon: 'IX.', iconColor: 'var(--nv-gold)', label: 'Train — workouts', hint: 'GO', run: go('workouts') },
    { icon: 'X.', iconColor: 'var(--nv-gold)', label: 'Notes', hint: 'GO', run: go('notes') },
    { icon: 'XI.', iconColor: 'var(--nv-gold)', label: 'Journal', hint: 'GO', run: go('journal') },
    { icon: 'XII.', iconColor: 'var(--nv-gold)', label: 'Money — the CFO', hint: 'GO', run: go('money') },
    { icon: 'XIII.', iconColor: 'var(--nv-gold)', label: 'Stash — restock & reference links', hint: 'GO', run: go('stash') },
    { icon: 'XIV.', iconColor: 'var(--nv-gold)', label: 'Operations — the agent fleet, live', hint: 'GO', run: go('ops') },
    { icon: '◐', iconColor: 'var(--nv-cy)', label: 'Ambient mode — Nova on the wall (tap to exit)', hint: 'GO', run: go('ambient') },
    { icon: 'XV.', iconColor: 'var(--nv-gold)', label: 'Settings', hint: 'GO', run: go('settings') },
    // the scripted "Nova actions" only exist in demo mode — in live mode the
    // palette offers nothing it can't really do
    ...(demoMode ? [
      { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Scale burrito bowl to 2 servings', hint: 'NOVA', run: () => { app.navigate('recipes', { openRecipeId: 'r1', servings: 2, recipeChat: [], paletteOpen: false }); app.toastMsg('Nova scaled the burrito bowl ×2 — macros updated'); } },
      { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Ask Coach to ease today’s session', hint: 'COACH', run: () => { app.navigate('workouts', { paletteOpen: false }); setTimeout(() => app.doCoach('Make it a bit shorter today'), 300); } },
      { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Run vault backup — Guardian', hint: 'GUARDIAN', run: () => { app.setState({ paletteOpen: false }); app.toastMsg('Guardian: snapshot complete — 186 notes · 0 conflicts ✓'); } },
    ] : []),
    { icon: '✦', iconColor: 'var(--nv-cy)', label: 'Start a voice session', hint: 'VOICE', run: () => { app.navigate('voice', { micOn: true, paletteOpen: false }); } },
  ];
  // P8: the palette input owns its text locally — a keystroke re-renders
  // the overlay only, never the whole app. The component calls this with
  // its live query; recall results still ride App state (debounced fetch).
  const paletteResultsFor = (query) => {
  const pq = query.toLowerCase();
  const paletteResults = cmds.filter(c => !pq || c.label.toLowerCase().includes(pq));
  // Summon becomes a capture surface: any non-empty query can be sent
  // straight to the Inbox — Nova routes it from there.
  const rawQuery = query.trim();
  if (rawQuery) {
    // The button says ASK — it must actually be able to ask. A question-shaped
    // query (multiple words, or ends with ?) puts Ask FIRST so Enter asks Nova
    // instead of substring-jumping to whatever screen name it grazes.
    const askEntry = {
      icon: '✦', iconColor: 'var(--nv-cy)',
      label: `Ask Nova — “${rawQuery.length > 44 ? rawQuery.slice(0, 41) + '…' : rawQuery}”`,
      hint: 'ASK',
      run: () => { app.navigate('voice', { paletteOpen: false }); setTimeout(() => app.askNova(rawQuery), 120); },
    };
    const questionShaped = /\s/.test(rawQuery) || rawQuery.endsWith('?');
    if (questionShaped) paletteResults.unshift(askEntry);
    else paletteResults.push(askEntry);
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
  return paletteResults;
  };

  // responsive
  const mob = st.isMobile;
  // mobile page padding must clear the fixed top bar (which now grows by the
  // Dynamic Island / status-bar inset) and the bottom nav (+ home indicator)
  // bottom clearance covers the floating dock (raised capture included)
  const mp = { padding: 'calc(48px + env(safe-area-inset-top)) 16px calc(108px + env(safe-area-inset-bottom))' };
  const col = (mt) => ({ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: mt });
  const wrapTall = mob ? mp : null;
  // Mobile bottom tabs: EVERY screen, in sidebar order, in a horizontally
  // scrollable bar — so nothing is ever hidden behind Summon and the
  // numerals read I–XIII in sequence (the earlier out-of-order look came
  // from curating a reordered subset; the full ordered list fixes both).
  // The active tab auto-scrolls into view (see MobileChrome).
  const tabOrder = (st.tabOrder && st.tabOrder.length) ? st.tabOrder : TAB_META.map((t) => t[0]);
  const tabs = tabOrder.map((screen, i) => {
    const act = st.screen === screen;
    return { num: romanFor(i), label: tabLabel(screen), screen, go: go(screen), active: act,
      // the mobile UI had NO pending signal at all — the badge the app icon
      // shows must exist inside the app too
      count: screen === 'inbox' && inboxPendingCount > 0 ? inboxPendingCount : null,
      style: { flex: 'none', minWidth: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '5px 9px', cursor: 'pointer', borderRadius: '9px', color: act ? 'var(--nv-acc)' : 'var(--nv-ink40)', background: act ? 'var(--nv-acc-bg)' : 'none', textShadow: act ? 'var(--nv-tsh-tab)' : 'none' },
      numStyle: { font: "500 8.5px var(--nv-font-mono)", letterSpacing: '.06em', color: act ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 32%, transparent)' } };
  });

  // Frequent screens, from real local visit counts — the More sheet leads with
  // these so a regular destination is never a hunt. Falls back to nothing at
  // all rather than guessing before there is evidence.
  let visits = {};
  try { visits = JSON.parse(localStorage.getItem('novaos.screenVisits') || '{}'); } catch { visits = {}; }
  const dockKeys = new Set(tabOrder.slice(0, 4));
  const frequentTabs = Object.entries(visits)
    .filter(([k, n]) => n >= 3 && !dockKeys.has(k) && TAB_META.some((t) => t[0] === k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => tabs.find((t) => t.screen === k))
    .filter(Boolean);

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
    routePreview: (q) => app.routeIntentLocal(q),
    sendIntent: (q) => app.sendIntent(q),
    wrapRecipes: mob ? mp : { padding: '28px 40px 44px' },
    wrapShopping: mob ? mp : { padding: '28px 40px 44px' },
    wrapTodos: mob ? mp : { padding: '28px 40px 44px', maxWidth: '860px' },
    wrapMoney: mob ? mp : { padding: '28px 40px 44px', maxWidth: '1080px' },
    wrapWorkouts: mob ? mp : { padding: '28px 40px 44px' },
    wrapCode: wrapTall || { padding: '28px 40px 44px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapNotes: wrapTall || { padding: '28px 40px 44px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
    wrapJournal: mob ? mp : { padding: '28px 40px 44px' },
    wrapStash: mob ? mp : { padding: '28px 40px 44px', maxWidth: '900px' },
    gridStats: mob ? col('20px') : { display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr', gap: '14px', marginTop: '24px' },
    gridNoticed: mob ? col('12px') : { display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: '14px', marginTop: '14px' },
    gridVault: mob ? col('12px') : { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginTop: '14px' },
    gridRecipes: mob ? col('16px') : { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginTop: '18px' },
    gridWork: mob ? col('16px') : { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '14px', marginTop: '16px' },
    gridCode: mob ? col('18px') : { flex: '1', display: 'grid', gridTemplateColumns: '1fr 250px', gap: '14px', marginTop: '18px', minHeight: 0 },
    gridNotes: mob ? col('16px') : { flex: '1', display: 'grid', gridTemplateColumns: '300px 1fr', gap: '14px', marginTop: '20px', minHeight: 0 },
    noteListCard: Object.assign({ border: '1px solid var(--nv-edge)', borderRadius: 'var(--nv-radius)', background: 'var(--nv-glass)', boxShadow: 'inset 0 1px 0 var(--nv-spec)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, mob ? { maxHeight: '320px', flex: 'none' } : {}),
    galaxyBox: Object.assign({ position: 'relative', marginTop: '16px', border: '1px solid var(--nv-edge)', borderRadius: 'var(--nv-radius)', overflow: 'hidden', background: 'radial-gradient(700px 420px at 50% 45%, color-mix(in srgb, var(--nv-vi) 08%, transparent), rgba(0,0,0,.24))', boxShadow: 'inset 0 1px 0 var(--nv-spec)' }, mob ? { height: '420px' } : { flex: '1' }),
    consoleCard: Object.assign({ border: '1px solid var(--nv-edge)', borderRadius: 'var(--nv-radius)', background: 'var(--nv-well)', boxShadow: 'inset 0 1px 0 var(--nv-spec)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, mob ? { height: '460px' } : {}),
    gridRecipeOv: mob ? { display: 'flex', flexDirection: 'column', gap: '20px', padding: '18px' } : { display: 'grid', gridTemplateColumns: '300px 1fr', gap: '26px', padding: '26px' },
    // z 82: ABOVE the mobile top bar (70) and floating dock (72) — the close
    // button was buried under chrome and the modal felt impossible to exit
    // phone: a FULL-SCREEN sheet (the floating-card pattern put the close
    // button under the iOS status bar and left dead space below); desktop
    // keeps the centered modal
    recipeOvWrap: mob
      ? { position: 'fixed', inset: 0, background: 'var(--nv-void)', zIndex: 82, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', padding: 0 }
      : { position: 'fixed', inset: 0, background: 'rgba(8,5,12,.72)', backdropFilter: 'blur(6px)', zIndex: 82, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', overflowY: 'auto' },
    recipeOvMobile: mob,
    // shared name with the card that opened it — the morph's other half
    recipeOvVtName: st.openRecipeId ? `recipe-${st.openRecipeId}` : null,
    supportsViewTransitions: typeof document !== 'undefined' && !!document.startViewTransition,
    isMission: st.screen === 'mission', isVoice: st.screen === 'voice', isGalaxy: st.screen === 'galaxy',
    isRecipes: st.screen === 'recipes', isShopping: st.screen === 'shopping', isStash: st.screen === 'stash', isWorkouts: st.screen === 'workouts', isCode: st.screen === 'code', isNotes: st.screen === 'notes', isJournal: st.screen === 'journal',
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
      Object.assign(mkNav('Fuel', 'VI.', 'recipes'), { count: usingLiveRecipes ? String(st.liveRecipes.length) : demoMode ? String(app.recipes.length) : '—' }),
      Object.assign(mkNav('Shopping', 'VII.', 'shopping'), { count: st.liveShoppingList ? String(shoppingItems.length) : demoMode ? '0' : '—' }),
      Object.assign(mkNav('To-Do', 'VIII.', 'todos'), { count: ctx.todosOpenCount != null ? String(ctx.todosOpenCount) : demoMode ? '0' : '—' }),
      Object.assign(mkNav('Train', 'IX.', 'workouts'), { count: usingLiveWorkouts ? String(liveRoutines.length) : '—' }),
      Object.assign(mkNav('Notes', 'X.', 'notes'), { count: usingLiveNotes ? String(st.liveNotes.length) : demoMode ? String(app.notes.length) : '—' }),
      Object.assign(mkNav('Journal', 'XI.', 'journal'), { count: st.liveJournalEntries ? String(journalDays.length) : demoMode ? '0' : '—' }),
      mkNav('Money', 'XII.', 'money'),
      Object.assign(mkNav('Stash', 'XIII.', 'stash'), { count: st.liveStash ? String(st.liveStash.reduce((n, c) => n + c.items.length, 0)) : demoMode ? '0' : '—' }),
    ],
    navSystem: [
      Object.assign(mkNav('Operations', 'XIV.', 'ops'), { count: st.liveOps ? String(st.liveOps.pending) : demoMode ? '0' : '—' }),
      mkNav('Settings', 'XV.', 'settings'),
    ],
    agentsGroupLabel: `AGENTS · ${agentsLiveCount} OF ${AGENTS.length} LIVE`,
    // Honest lights: a dot PULSES only while its agent is actually working —
    // an in-flight job this client started, OR a classifying record on the
    // rails (so server-side work pulses on every device, not just the one
    // that asked). It stays LIT for five minutes after one of its receipts
    // lands, and otherwise sits dim. A light that glows constantly says
    // nothing — lights are receipts.
    agents: (() => {
      const KINDS = {
        Commander: ['dispatch', 'plan-today', 'review', 'followup'],
        Coach: ['coach', 'training-check', 'week-plan', 'weekly-debrief', 'meal-prep'],
        CFO: ['cfo', 'money'],
        Studio: ['studio', 'idea', 'idea-outline'],
        Researcher: ['research'],
        Watcher: ['video'],
        Guardian: ['guardian'],
      };
      const WORKING = {
        Commander: !!(st.calCmdBusy || st.dispatchBusy),
        Coach: !!(st.coachBusy || st.quickBusy || st.mealPrepBusy),
        CFO: !!(st.moneyBusy || st.moneyScanBusy),
        Studio: false,
        Researcher: (st.voiceChat || []).some((m) => m.research?.status === 'running'),
        // 'fetching' is the watch toolchain pulling a transcript for a
        // URL-only vault weave; the weave itself shows in its own overlay
        Watcher: st.ingestStatus === 'fetching',
        Guardian: !!st.guardianBusy,
      };
      // The rails are the truth: any record still classifying means its
      // agent is reasoning RIGHT NOW, whoever started it.
      const activeKinds = new Set(
        (st.liveInbox?.items || []).filter((r) => r.status === 'classifying').map((r) => r.kind),
      );
      const cutoff = Date.now() - 5 * 60_000;
      const recent = new Set();
      for (const r of st.liveInbox?.items || []) {
        if (!r.createdAt || new Date(r.createdAt).getTime() < cutoff) continue;
        for (const name of Object.keys(KINDS)) if (KINDS[name].includes(r.kind)) recent.add(name);
      }
      const dot = { marginLeft: '2px', width: '6px', height: '6px', borderRadius: '50%', flex: 'none' };
      return AGENTS.map((a, i) => {
        const working = WORKING[a.name] || (KINDS[a.name] || []).some((k) => activeKinds.has(k));
        // hover on a pulsing dot names the actual job — detail without pixels
        const activeRec = working
          ? (st.liveInbox?.items || []).find((r) => r.status === 'classifying' && (KINDS[a.name] || []).includes(r.kind))
          : null;
        return {
          name: a.name, role: a.role, on: a.on, working,
          hint: activeRec ? `working: ${activeRec.text?.slice(0, 120) || activeRec.kind}` : working ? 'working…' : undefined,
          dotStyle: working
            ? { ...dot, background: 'var(--nv-cy)', boxShadow: '0 0 9px var(--nv-cy)', animation: `novaPulse ${1.1 + i * 0.1}s infinite var(--nv-anim)` }
            : recent.has(a.name)
              ? { ...dot, background: 'var(--nv-cy)', boxShadow: '0 0 7px var(--nv-cy)' }
              : { ...dot, background: a.on ? 'color-mix(in srgb, var(--nv-cy) 38%, transparent)' : 'rgba(232,236,246,.16)' },
        };
      });
    })(),
    sideStatus,
    // the doorman's words when he arrives on a non-Voice screen — generated
    // server-side, shown once, tap-through to the conversation
    greetBanner: st.greetBanner ? {
      text: st.greetBanner.text,
      open: () => { app.setState({ greetBanner: null }); app.navigate('voice'); },
      dismiss: (e) => { e.stopPropagation(); app.setState({ greetBanner: null }); },
    } : null,
    // The floating core rides every screen — BOTH devices, same feature —
    // except Voice (which has the full reactor) and Ambient (deliberately
    // empty). Its ring states are receipts: thinking = a model job in
    // flight RIGHT NOW, listening = the mic is genuinely open. Idle is just
    // the core, breathing. Position clears the dock on mobile; desktop has
    // no dock, so it sits in the corner.
    floatingCore: st.screen !== 'voice' && st.screen !== 'ambient' ? {
      thinking: !!(st.voiceBusy || st.coachBusy || st.codeBusy || st.quickBusy || st.sparBusy || st.inboxCaptureBusy),
      listening: !!st.micOn,
      tap: go('voice'),
      bottom: mob ? 'calc(84px + env(safe-area-inset-bottom))' : '18px',
    } : null,
    goVoice: go('voice'), goWorkouts: go('workouts'), goSettings: go('settings'), goHome: go('mission'),
    orbCardTitle: st.micOn ? 'Nova is listening' : 'Nova is muted',
    orbCardSub: wakeWord ? 'VOICE · WAKE WORD ON' : 'VOICE · PUSH TO TALK',
    openPalette: () => app.setState({ paletteOpen: true, recallResults: [] }),
    stopClick: (e) => e.stopPropagation(),

    // appearance (Settings)
    // style is the design language (Command Core HUD vs Apple calm); it
    // composes with theme (palette) — the silhouette icons key off it too.
    // appleStyle = the Apple family (skin or layout); structured = the
    // restructured-layout tier only (grouped screens like MissionStructured).
    appleStyle: st.novaStyle === 'apple' || st.novaStyle === 'cupertino',
    structured: st.novaStyle === 'cupertino',
    novaStyleOptions: NOVA_STYLES.map((s) => ({ ...s, active: st.novaStyle === s.value, pick: () => app.setNovaStyle(s.value) })),
    novaTheme: st.novaTheme,
    novaThemeOptions: NOVA_THEMES.filter((t) => !t.appleOnly || st.novaStyle === 'apple' || st.novaStyle === 'cupertino').map((t) => ({ ...t, active: st.novaTheme === t.value, pick: () => app.setNovaTheme(t.value) })),
    calmMode: st.calmMode,
    toggleCalm: () => app.setCalmMode(!st.calmMode),
    coreStyle: st.coreStyle,
    novaCoreOptions: NOVA_CORES.map((c) => ({ ...c, active: st.coreStyle === c.value, pick: () => app.setCoreStyle(c.value) })),

    // settings
    isSettings: st.screen === 'settings',
    // offline parity: cached profile/learning always RENDER (read-only, with a
    // stale note) — hiding his own words offline read as data loss
    profile: !demoMode ? {
      set: !!(st.liveProfile && (st.liveProfile.focus || (st.liveProfile.priorities || []).length || st.liveProfile.bestSelf || st.liveProfile.notes)),
      editing: st.profileEditing,
      saving: st.profileSaving,
      draft: st.profileDraft,
      readOnly: isOffline,
      view: st.liveProfile ? {
        focus: st.liveProfile.focus,
        priorities: st.liveProfile.priorities || [],
        bestSelf: st.liveProfile.bestSelf,
        notes: st.liveProfile.notes,
        updated: st.liveProfile.updated,
      } : null,
      startEdit: () => { if (isOffline) { app.toastMsg('Offline — reconnect to edit your profile'); return; } app.startProfileEdit(); },
      cancelEdit: () => app.setState({ profileEditing: false }),
      setField: (field) => (e) => app.setProfileField(field, e.target.value),
      save: () => app.saveProfile(),
    } : null,
    learning: !demoMode ? {
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
    tabOrderItems: (tabOrder || []).map((k) => ({ key: k, label: tabLabel(k) })),
    frequentTabs,
    setTabOrder: (order) => app.setTabOrder(order),
    calendarSettings: !demoMode && !isOffline ? {
      loaded: st.liveCalendarList != null,
      error: !!st.calendarListError,
      calendars: (st.liveCalendarList || []).map((c) => ({
        name: c.name,
        url: c.url,
        hidden: c.hidden,
        toggle: () => app.toggleCalendarHidden(c.url),
      })),
      anyHidden: (st.liveCalendarList || []).some((c) => c.hidden),
      load: () => app.loadCalendarList(),
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

    // palette — the input's text lives in the component (P8); these give it
    // the results for any query plus the debounced vault-recall trigger
    paletteOpen: st.paletteOpen,
    paletteRef: app.paletteRef,
    paletteResultsFor,
    queueRecall: (q) => app.queueRecall(q),
    closePalette: () => app.setState({ paletteOpen: false }),

    // offline outbox — chip shows in the chrome whenever writes are waiting;
    // never rendered as part of any synced list or total
    outboxCount: (st.outbox || []).length,
    outboxOpen: st.outboxOpen,
    openOutbox: () => app.setState({ outboxOpen: true }),
    outboxView: st.outboxOpen ? {
      close: () => app.setState({ outboxOpen: false }),
      hasQueued: (st.outbox || []).some((i) => i.status === 'queued'),
      syncNow: () => app.drainOutbox(),
      items: (st.outbox || []).map((i) => ({
        id: i.id, kind: i.kind, label: i.label,
        failed: i.status === 'failed', error: i.error,
        when: new Date(i.queuedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        retry: () => app.retryOutboxItem(i.id),
        discard: () => app.discardOutboxItem(i.id),
      })),
    } : null,

    // nudges — deterministic pop-up suggestions, one at a time, dismissible
    // for the rest of this app session. Conditions must be TRUE NOW; a nudge
    // is an offer, never a gate.
    nudge: (() => {
      if (demoMode) return null;
      const dismissed = st.nudgeDismissed || {};
      const candidates = [];
      if (st.workoutSession && st.screen !== 'workouts') {
        const sets = st.workoutSession.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
        candidates.push({
          key: `session:${st.workoutSessionSavedAt || 'live'}`,
          icon: '🏋', title: 'Workout in progress',
          detail: `${st.workoutSession.routineName} — ${sets} set${sets === 1 ? '' : 's'} logged, waiting to be finished`,
          primaryLabel: 'Resume',
          onPrimary: () => { app.navigate('workouts'); app.resumeWorkoutSession(); },
        });
      }
      const failedOutbox = (st.outbox || []).filter((i) => i.status === 'failed').length;
      if (failedOutbox > 0) {
        candidates.push({
          key: `outbox-failed:${failedOutbox}`,
          icon: '⇪', title: 'Outbox needs your call',
          detail: `${failedOutbox} item${failedOutbox === 1 ? '' : 's'} the server rejected — retry or discard`,
          primaryLabel: 'Open Outbox',
          onPrimary: () => app.setState({ outboxOpen: true }),
        });
      }
      const first = candidates.find((c) => !dismissed[c.key]);
      return first ? { ...first, dismiss: () => app.setState((s) => ({ nudgeDismissed: { ...(s.nudgeDismissed || {}), [first.key]: true } })) } : null;
    })(),

    // toast
    toastOn: !!st.toast, toast: st.toast,
  };
}

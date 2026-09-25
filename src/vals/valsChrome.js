import { NOVA_THEMES, NOVA_CORES, NOVA_STYLES } from '../theme.js';
import { sinceFor, startedFrom } from '../jobClock.js';
import { TAB_META, tabLabel, romanFor } from '../tabOrder.js';
import { AGENTS } from './shared.js';
import { dtf } from './fmt.js';
import { glassOf } from '../glassBeats.js';
import { muscleVar } from '../muscleHue.js';

// App chrome: sidebar nav, mobile tabs, per-screen wrappers and grids, the
// command palette, settings (incl. appearance), agents (concept), and the
// toast. Consumes ctx counts from the domain builders (usingLiveRecipes,
// liveRoutines, usingLiveNotes, journalDays, shoppingItems) plus the
// connection truth valsMission shares (statusChip, missionStatusItems).

export function valsChrome(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline, go, warm, userName, wakeWord, usingLiveRecipes, usingLiveWorkouts, liveRoutines, usingLiveNotes, journalDays, shoppingItems, statusChip, agentsLiveCount, inboxPendingCount } = ctx;

  const navStyle = (act) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
    fontFamily: "var(--nv-font-ui)", fontWeight: 600, fontSize: '14px', letterSpacing: '.02em',
    color: act ? 'var(--nv-acc)' : 'var(--nv-ink60)',
    background: act ? 'var(--nv-acc-bg)' : 'none',
    border: act ? '1px solid var(--nv-acc-border)' : '1px solid transparent',
    boxShadow: act ? 'var(--nv-glow-tab)' : 'none',
    textShadow: act ? 'var(--nv-tsh-tab)' : 'none' });
  const numStyle = (act) => ({ fontFamily: "var(--nv-font-mono)", fontSize: '9px', width: '20px', flex: 'none', color: act ? 'var(--nv-acc)' : 'var(--nv-ink40)' });
  const mkNav = (label, numeral, screen, count) => ({ label, numeral, screen, count, go: go(screen), warm: warm(screen), style: navStyle(st.screen === screen), numStyle: numStyle(st.screen === screen) });
  // his saved order, applied inside each sidebar group. Anything the order
  // doesn't mention keeps its declared position at the end rather than
  // jumping to the front — a new screen must never reshuffle his list.
  const orderIndex = (screen) => {
    const i = (st.tabOrder || []).indexOf(screen);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sortByOrder = (navs) => navs
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (orderIndex(a.n.screen) - orderIndex(b.n.screen)) || (a.i - b.i))
    .map((x) => x.n);

  // palette
  // The command palette lived here until 5 Sep (Phase 4). It was a second,
  // better front door that only it could reach — a route preview, vault
  // recall, screen-jumping. The chat is the front door now, the preview
  // moved onto its composer (routePreview below), and ✦ ASK / ⌘K simply open
  // the conversation. Screen-jumping by typing is gone: the dock and sidebar
  // are the way between screens, and one navigation system is enough.

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
    return { num: romanFor(i), label: tabLabel(screen), screen, go: go(screen), warm: warm(screen), active: act,
      // the mobile UI had NO pending signal at all — the badge the app icon
      // shows must exist inside the app too.
      //
      // THE LEADER BADGES WHEN IT IS WAITING ON HIM, and only then. His
      // report, 21 Sep: no quick way to reach the Leader except the Home
      // card. It was in the More grid the whole time — but nothing ever said
      // it wanted him, so there was no reason to look. A badge on the
      // standing open count would be wallpaper within a week; a badge when
      // Nova's picture has gone STALE is the moment answering changes
      // anything, which is the same test the Home card's own warning uses.
      count: screen === 'inbox' && inboxPendingCount > 0 ? inboxPendingCount
        : screen === 'leader' && st.liveLeader?.situation?.stale && st.liveLeader.situation.openCount
          ? st.liveLeader.situation.openCount : null,
      style: { flex: 'none', minWidth: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '5px 9px', cursor: 'pointer', borderRadius: '9px', color: act ? 'var(--nv-acc)' : 'var(--nv-ink40)', background: act ? 'var(--nv-acc-bg)' : 'none', textShadow: act ? 'var(--nv-tsh-tab)' : 'none' },
      numStyle: { font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: act ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 32%, transparent)' } };
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
  const syncedShort = st.lastSyncAt ? dtf('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(st.lastSyncAt)) : null;
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
    isMobile: mob,
    // THE COMPACT TITLE (22 Sep 2026): what the bar's wordmark yields to once
    // the screen's large title has scrolled beneath it. Home's large title is
    // the greeting, so the compact form is the greeting's first two words —
    // the same clock rule MissionStructured uses, so the two can never
    // disagree about what time of day it is.
    compactTitle: (() => {
      if (st.screen !== 'mission') return tabLabel(st.screen);
      const h = new Date().getHours();
      return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    })(),
    // full-screen on the Mac: the sidebar folds away, and a tab on the left
    // edge (plus ⌘B) brings it back
    showSidebar: !mob && !st.sidebarHidden,
    // one control, one place, both states
    sidebarToggle: !mob ? { open: !st.sidebarHidden, toggle: () => app.toggleSidebar() } : null,
    tabs,
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
    wrapLibrary: mob ? mp : { padding: '28px 40px 44px' },
    wrapConsole: mob ? mp : { padding: '28px 40px 44px' },
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
    dateLabel: dtf('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date()).toUpperCase().replace(/,/g, ''),
    greeting: (new Date().getHours() < 12 ? 'Good morning, ' : new Date().getHours() < 18 ? 'Good afternoon, ' : 'Good evening, ') + userName + '.',
    // ONE saved order drives both the phone's dock and the Mac's sidebar
    // (Settings → Tab order). The three sidebar groups stay — they mean
    // something — and his order sorts the rows inside each. Numerals are
    // canonical identity (screens show "IX." in their own headers), so they
    // travel with the row rather than renumbering by position.
    navMain: sortByOrder([
      mkNav('Mission Control', 'I.', 'mission'),
      mkNav('Voice', 'II.', 'voice'),
      mkNav('Memory Galaxy', 'III.', 'galaxy'),
      mkNav('Claude Code', 'IV.', 'code'),
      Object.assign(mkNav('Inbox', 'V.', 'inbox'), inboxPendingCount > 0 ? { count: String(inboxPendingCount), countHot: true } : {}),
    ]),
    navVault: sortByOrder([
      // counts: live numbers when synced, mock numbers only in demo mode,
      // and an honest "—" when configured but not yet synced (offline)
      mkNav('Console', 'XVIII.', 'console'),
      Object.assign(mkNav('Fuel', 'VI.', 'recipes'), { count: usingLiveRecipes ? String(st.liveRecipes.length) : demoMode ? String(app.recipes.length) : '—' }),
      Object.assign(mkNav('Shopping', 'VII.', 'shopping'), { count: st.liveShoppingList ? String(shoppingItems.length) : demoMode ? '0' : '—' }),
      Object.assign(mkNav('To-Do', 'VIII.', 'todos'), { count: ctx.todosOpenCount != null ? String(ctx.todosOpenCount) : demoMode ? '0' : '—' }),
      Object.assign(mkNav('Train', 'IX.', 'workouts'), { count: usingLiveWorkouts ? String(liveRoutines.length) : '—' }),
      Object.assign(mkNav('Notes', 'X.', 'notes'), { count: usingLiveNotes ? String(st.liveNotes.length) : demoMode ? String(app.notes.length) : '—' }),
      Object.assign(mkNav('Library', 'XVI.', 'library'), { count: ctx.libraryCount != null && st.liveLibrary !== null ? String(ctx.libraryCount) : '—' }),
      // THE LEADER CARRIES ITS OPEN COUNT, like every other row that has one.
      // His report, 21 Sep: no quick way to reach the Leader except the Home
      // card. It was in this list all along — but alone among the rows with
      // real numbers behind them it showed none, so nothing ever drew the eye
      // to it, and nothing said a question was waiting. Hot when Nova's
      // picture has gone stale, which is exactly when answering matters.
      Object.assign(mkNav('Leader', 'XVII.', 'leader'),
        st.liveLeader?.situation?.openCount
          ? { count: String(st.liveLeader.situation.openCount), countHot: !!st.liveLeader.situation.stale }
          : {}),
      Object.assign(mkNav('Journal', 'XI.', 'journal'), { count: st.liveJournalEntries ? String(journalDays.length) : demoMode ? '0' : '—' }),
      mkNav('Money', 'XII.', 'money'),
      Object.assign(mkNav('Stash', 'XIII.', 'stash'), { count: st.liveStash ? String(st.liveStash.reduce((n, c) => n + c.items.length, 0)) : demoMode ? '0' : '—' }),
    ]),
    navSystem: sortByOrder([
      Object.assign(mkNav('Operations', 'XIV.', 'ops'), { count: st.liveOps ? String(st.liveOps.pending) : demoMode ? '0' : '—' }),
      mkNav('Settings', 'XV.', 'settings'),
    ]),
    // C3 — the job tray: everything in flight RIGHT NOW, derived from
    // state that already exists (classifying inbox records + the code
    // lane). Completion pings were already wired (push + Telegram fire
    // when a record flips pending); this makes the in-between VISIBLE.
    jobTray: (() => {
      // a cut label says it was cut — "a cached digest makes t" is not a sentence
      const clip = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
      const KIND_NAME = { research: 'Research', video: 'Watching', study: 'Study', distill: 'Distilling', 'brain-week': 'Brain week', briefing: 'Briefing', browse: 'Browser', form: 'Form check', intake: 'Your numbers', paper: 'Study' };
      const jobs = (st.liveInbox?.items || [])
        .filter((r) => r.status === 'classifying')
        .map((r) => ({ id: r.id, label: `${KIND_NAME[r.kind] || 'Filing'} — ${clip(r.text || '', 60)}`, kind: r.kind || 'capture',
          // SERVER-STAMPED, so the clock is right after a reload and right on
          // a second device — this job did not start when this tab noticed it
          startedAt: startedFrom(r.createdAt),
          // WHO IS ACTUALLY WORKING. A research panel runs several named
          // researchers at once (server/lib/researchPanel.js); the record
          // carries their progress, so "Nova is working" can say which angle
          // is still out instead of one opaque "Research —" row.
          note: r.panel?.merging ? 'writing the brief' : (r.panel?.label || ''),
          workers: r.panel?.workers || [] }));
      if (st.codeBusy) jobs.unshift({ id: 'code', label: 'Claude Code — session running', kind: 'code', go: () => app.navigate('code'), startedAt: sinceFor('code', true) });
      if (st.verdictBusy) jobs.unshift({ id: 'verdict', label: 'Building a verdict…', kind: 'verdict', startedAt: sinceFor('verdict', true) });
      // EVERY LONG-RUNNING THING HE STARTED, not just the ones that happen to
      // file an inbox record. A vault ingest (a book, a person, a video weave)
      // runs 15-40 minutes entirely outside the record rails, so the tray —
      // the one place that answers "is anything actually happening?" — showed
      // nothing at all while the machine was working hardest.
      const INGEST_LABEL = {
        researching: 'Researching', fetching: 'Fetching the transcript', digesting: 'Reading it in parts',
        staging: 'Preparing your vault', running: 'Drafting the pages', reading: 'Reading your copy',
        applying: 'Writing to your vault',
      };
      if (st.ingestStatus && st.ingestStatus !== 'idle') {
        if (st.ingestStatus === 'ready') {
          jobs.unshift({ id: 'ingest', kind: 'ingest', done: true,
            label: `Ready for your review — ${(st.ingestPreview?.changes || []).length} page${(st.ingestPreview?.changes || []).length === 1 ? '' : 's'}` });
        } else if (st.ingestStatus === 'error') {
          jobs.unshift({ id: 'ingest', kind: 'ingest', failed: true, label: `Ingest failed — ${clip(st.ingestError || 'no reason given', 60)}` });
        } else {
          const p = st.ingestProgress;
          jobs.unshift({ id: 'ingest', kind: 'ingest', startedAt: sinceFor('ingest', true),
            label: `${INGEST_LABEL[st.ingestStatus] || 'Working'}${p?.total ? ` — part ${p.done} of ${p.total}` : '…'}` });
        }
      }
      // Staged work the SERVER knows about, from any device and any day —
      // tappable, never forced open. This is what stops 26 pages sitting
      // invisible for a fortnight without ambushing him at every launch.
      for (const j of (st.liveIngestJobs || [])) {
        if (j.status === 'ready') {
          jobs.push({ id: `ing-${j.id}`, kind: 'ingest', done: true,
            label: `Ready for review — ${j.label} (${j.changes} page${j.changes === 1 ? '' : 's'})`,
            go: () => app.openIngestJob(j.id) });
        } else if (j.status === 'error') {
          // a job that failed eleven days ago is not "1 running" — it is a
          // dead card he has no way to clear, which is what he reported
          jobs.push({ id: `ing-${j.id}`, kind: 'ingest', failed: true,
            label: `${j.label} — ${clip(j.error || 'failed', 70)}`,
            dismiss: () => app.dismissIngestJob(j.id),
            retry: () => app.openIngestJob(j.id) });
        }
      }
      if (st.leaderBusy) jobs.unshift({ id: 'leader', kind: 'leader', label: 'The Leader is thinking…', go: () => app.navigate('leader'), startedAt: sinceFor('leader', true) });
      if (st.coachBusy) jobs.unshift({ id: 'coach', kind: 'coach', label: 'Coach is reading your history…', go: () => app.navigate('workouts'), startedAt: sinceFor('coach', true) });
      if (st.forgeBusy) jobs.unshift({ id: 'forge', kind: 'forge', label: 'The Forge is starting a build…', go: () => app.navigate('ops'), startedAt: sinceFor('forge', true) });
      // IN FLIGHT means in flight. Ready-for-review and failed cards still
      // show — they need him — but they are counted and labelled as what they
      // are, so "1 running" can never again mean "one thing died last week".
      // A flag that went false forgets its mark here, so the NEXT run of the
      // same job starts its own clock instead of inheriting the last one's.
      for (const [id, on] of [['code', st.codeBusy], ['verdict', st.verdictBusy], ['leader', st.leaderBusy],
        ['coach', st.coachBusy], ['forge', st.forgeBusy], ['ingest', st.ingestStatus && st.ingestStatus !== 'idle']]) {
        if (!on) sinceFor(id, false);
      }
      const running = jobs.filter((j) => !j.done && !j.failed).length;
      const waiting = jobs.filter((j) => j.done).length;
      const failed = jobs.filter((j) => j.failed).length;
      const countLabel = running
        ? `${running} running`
        : waiting ? `${waiting} waiting for you` : `${failed} failed`;
      return {
        jobs,
        running,
        waiting,
        failed,
        countLabel,
        open: !!st.jobTrayOpen,
        toggle: () => app.setState({ jobTrayOpen: !st.jobTrayOpen }),
        goInbox: () => { app.setState({ jobTrayOpen: false }); app.navigate('inbox'); },
      };
    })(),
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
    // REPLY IN PLACE — the sheet's view of the banner it is answering
    replyTo: st.replyTo ? {
      ...st.replyTo,
      setDraft: (t) => app.setReplyDraft(t),
      send: (t) => app.sendReply(t),
      notNow: () => app.replyNotNow(),
      close: () => app.closeReply(),
      open: () => { app.closeReply(); app.navigate('voice'); },
    } : null,
    // The floating core rides every screen — BOTH devices, same feature —
    // except Voice (which has the full reactor) and Ambient (deliberately
    // empty). Its ring states are receipts: thinking = a model job in
    // flight RIGHT NOW, listening = the mic is genuinely open. Idle is just
    // the core, breathing. Position clears the dock on mobile; desktop has
    // no dock, so it sits in the corner.
    // ONE Nova icon per device (his ask). On the phone that icon is the dock's
    // centre orb — the floating one would be a second, so it is gone there.
    // The Mac has no dock, so the floating core IS its icon.
    floatingCore: !mob && st.screen !== 'voice' && st.screen !== 'ambient' && st.screen !== 'mission' ? {
      thinking: !!(st.voiceBusy || st.coachBusy || st.codeBusy || st.quickBusy || st.sparBusy || st.inboxCaptureBusy),
      // the mic's REAL state, not the settings flag (which defaults on and
      // used to paint the core permanently violet)
      listening: !!st.liveMicOpen,
      // his ask: the orb starts the conversation natively, wherever he is —
      // no navigating to a Voice section. Long-press still opens the full
      // Voice screen for the transcript and the brief.
      tap: () => app.startLiveTalk(),
      // hold = the words (his ask). The full Voice screen is a nav away.
      onLongPress: () => app.toggleLiveText(),
      speaking: !!st.voiceSpeaking,
      coreStyle: st.coreStyle,
      bottom: mob ? 'calc(84px + env(safe-area-inset-bottom))' : '18px',
    } : null,
    // the non-blocking voice presence (replaces the modal sheet — his note:
    // it must not interrupt what he's doing)
    // never on the Voice/Ambient screens — the core and the transcript are
    // already the whole screen there
    presence: st.liveTalkOn && st.screen !== 'voice' && st.screen !== 'ambient' ? {
      input: st.liveInput || '',
      setInput: (t) => app.setState({ liveInput: t }),
      // the dictation hook hands over the turn's words (the 25 Sep race)
      send: (text) => app.sendLiveTalk(text),
      end: () => app.endLiveTalk(),
      busy: !!st.voiceBusy,
      speaking: !!st.voiceSpeaking,
      conversing: !!st.voiceConvMode,
      coreStyle: st.coreStyle,
      autoListenTick: st.voiceAutoListenTick,
      ask: st.liveAsk || '',
      reply: st.liveReply || '',
      // the words are opt-in: long-press the core
      textOpen: !!st.liveTextOpen,
      // the card for the line being spoken right now — his "dynamic pop up
      // visuals referencing whatever is being spoken", on every screen
      card: st.stageCard || null,
      // the reply window: Nova finished a sentence, so the mic opens for a
      // beat WITHOUT conversation mode being on (his ask: never press a
      // button to say I'm replying verbally)
      replyWindow: !!st.voiceReplyWindow,
      closeText: () => app.setState({ liveTextOpen: false }),
      // the dictation hook owns the truth about the mic; the orb needs it
      reportMic: (on) => { if (!!st.liveMicOpen !== !!on) app.setState({ liveMicOpen: !!on }); },
      evidence: st.liveVerdictOffer,
      openEvidence: () => app.openVerdict(st.liveVerdictOffer.kind, st.liveVerdictOffer.of),
      glass: glassOf(st, app),
      onError: (err) => app.toastMsg('Dictation: ' + err),
    } : null,
    liveTalk: st.liveTalkOn ? {
      input: st.liveInput || '',
      setInput: (t) => app.setState({ liveInput: t }),
      onInput: (e) => app.setState({ liveInput: e.target.value }),
      send: () => app.sendLiveTalk(),
      close: () => app.endLiveTalk(),
      busy: !!st.voiceBusy,
      speaking: !!st.voiceSpeaking,
      paused: !!st.voiceConvPaused,
      autoListenTick: st.voiceAutoListenTick,
      lastAsk: st.liveAsk, lastReply: st.liveReply,
      notifyEmpty: () => app.notifyEmptyListen(),
      onError: (err) => app.toastMsg('Dictation: ' + err),
      verdictOffer: st.liveVerdictOffer,
      openVerdict: () => app.openVerdict(st.liveVerdictOffer.kind, st.liveVerdictOffer.of),
      verdict: null, clearVerdict: () => app.setState({ verdict: null }),
    } : null,
    glass: glassOf(st, app),
    speakText: (t) => app.speakTtsSentence(t),
    startLiveTalk: () => app.startLiveTalk(),
    novaSpeaking: !!st.voiceSpeaking,
    micOn: !!st.micOn,
    // the dock orb's live state — the mic as it ACTUALLY is, plus the
    // long-press that reveals the words
    // "Hey Nova" — it must never hold the mic while dictation or a reply is
    // using it, or it would wake on Nova's own voice
    wakeWord: {
      on: !!st.wakeWordOn,
      // Blocked ONLY while a microphone is genuinely in use — one recogniser
      // owns the mic at a time. Notably NOT blocked while Nova is speaking:
      // that is barge-in, and being able to cut Nova off mid-sentence by
      // saying its name is the difference between a conversation and a
      // recital. (Nova's replies never contain the phrase, so it cannot
      // wake itself.) The Voice screen reports its own mic up through
      // voiceScreenMic, so the wake word now works there too.
      // BARGE-IN RIDES THIS MICROPHONE, IT NEVER OPENS ONE. Yesterday this
      // read `|| (!wakeWordOn && !voiceSpeaking)`, which started a recognition
      // session the moment Nova spoke and stopped it the moment it finished —
      // a fresh microphone session per reply. On his iPhone that is a
      // permission prompt every single time Nova opens its mouth, which is
      // exactly what he got this morning. Talking over Nova is worth a lot;
      // it is not worth that.
      //
      // So it is blocked whenever the wake word is off, full stop. With the
      // wake word ON the microphone is already held, and barge-in costs
      // nothing extra — which was always the reason it could live here.
      blocked: !!(st.liveMicOpen || st.voiceScreenMic || st.screen === 'ambient' || !st.wakeWordOn),
      wake: (rest) => app.onWakeWord(rest),
      error: (kind) => {
        app.setWakeWord(false);
        app.toastMsg(kind === 'not-allowed' || kind === 'service-not-allowed'
          ? 'Microphone blocked — "Hey Nova" is off. Allow the mic, then switch it back on in Settings.'
          : 'Wake word stopped — turn it back on in Settings.');
      },
    },
    // TALKING OVER NOVA. `saying` is everything spoken so far in this reply,
    // which is what the open microphone can have heard — the comparison that
    // separates his voice from the speaker's.
    bargeIn: {
      on: !!st.bargeInOn,
      speaking: !!st.voiceSpeaking,
      saying: app.ttsSaidWindow || '',
      fire: (heard, why) => app.onBargeIn(heard, why),
    },
    novaListening: !!st.liveMicOpen,
    // the glass, for surfaces outside the Voice screen
    stageCard: st.stageCard || null,
    // speechBlocked lives in valsMisc.js — this module spreads AFTER it in
    // renderVals(), so a second definition here would silently win and
    // shadow it (the exact bug class that broke stopSpeaking()). One
    // definition only.
    novaTalkOn: !!st.liveTalkOn,
    holdNovaText: () => app.toggleLiveText(),
    goVoice: go('voice'), goWorkouts: go('workouts'), goSettings: go('settings'), goHome: go('mission'),
    orbCardTitle: st.micOn ? 'Nova is listening' : 'Nova is muted',
    orbCardSub: wakeWord ? 'VOICE · WAKE WORD ON' : 'VOICE · PUSH TO TALK',
    openPalette: () => app.navigate('voice'), // ✦ ASK opens the conversation — it IS the front door now
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
      // THE INTAKE — the numbers under every calorie target, derived by code from his answers
      numbers: st.liveProfile?.intake || null,
      setNumbers: () => { if (isOffline) { app.toastMsg('Offline — reconnect to work out your numbers'); return; } app.navigate('voice'); app.startIntake(); },
    } : null,
    learning: !demoMode ? {
      noticed: st.liveLearning?.noticed || [],
      lanes: st.liveLearning?.lanes || [],
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
    // THE MODEL BOARD — every Nova lane that spawns Claude, the model it runs
    // on, and an on/off switch. Server-held (see lib/modelPrefs.js), so it is
    // hidden in demo mode and while offline rather than shown as editable and
    // silently dropping his taps.
    modelSettings: !demoMode && !isOffline ? (() => {
      const prefs = st.liveModelPrefs;
      const lanes = prefs?.lanes || [];
      const collapsed = st.modelPrefsCollapsed || {};
      const watch = prefs?.watch || null;
      const outdatedLabels = (watch?.outdatedLanes || [])
        .map((id) => lanes.find((l) => l.id === id)?.label)
        .filter(Boolean);
      return {
        loaded: prefs != null,
        error: !!st.modelPrefsError,
        load: () => app.loadModelPrefs(),
        models: prefs?.models || [],
        laneCount: lanes.length,
        offCount: lanes.filter((l) => !l.enabled).length,
        customisedCount: lanes.filter((l) => l.customised).length,
        busyAll: st.modelPrefsBusy === '*',
        resetAll: () => app.resetModelLane(null),
        // the fail-safe's own one-liner (server/lib/modelWatch.js): what each
        // alias resolves to right now, and when that was last checked — so a
        // stale hand-written label ('Opus 5' after 5.5 shipped) can't sit on
        // screen unnoticed again.
        watchLine: watch?.checkedAt
          ? `Newest, checked ${dtf('', { day: 'numeric', month: 'short' }).format(new Date(watch.checkedAt))}: ${['opus', 'sonnet', 'haiku', 'fable'].map((f) => watch.resolved[f]?.label).filter(Boolean).join(' · ')}`
          : null,
        watchUnconfirmed: watch?.checkedAt ? Object.entries(watch.resolved || {}).filter(([, r]) => !r.observed).map(([f]) => f) : [],
        outdatedLaneLabels: outdatedLabels,
        groups: (prefs?.groups || []).map((g) => {
          const mine = lanes.filter((l) => l.group === g.id);
          return {
            id: g.id,
            label: g.label,
            hint: g.hint,
            open: !collapsed[g.id],
            offCount: mine.filter((l) => !l.enabled).length,
            count: mine.length,
            toggleOpen: () => app.setState({ modelPrefsCollapsed: { ...collapsed, [g.id]: !collapsed[g.id] } }),
            lanes: mine.map((l) => ({
              id: l.id,
              label: l.label,
              hint: l.hint,
              // what actually stops when this is off — shown only when it IS
              // off, where it is the answer to "what did I just turn off?"
              offEffect: l.off,
              model: l.model,
              defaultModel: l.defaultModel,
              deterministic: !!l.deterministic,
              customised: l.customised,
              enabled: l.enabled,
              busy: st.modelPrefsBusy === l.id,
              setModel: (e) => app.setModelLane(l.id, { model: e.target.value }),
              toggle: () => app.setModelLane(l.id, { enabled: !l.enabled }),
              reset: l.customised || !l.enabled ? () => app.resetModelLane(l.id) : null,
            })),
          };
        }),
      };
    })() : null,
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
    queueRecall: (q) => app.queueRecall(q),

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
        when: dtf('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(i.queuedAt)),
        retry: () => app.retryOutboxItem(i.id),
        discard: () => app.discardOutboxItem(i.id),
      })),
    } : null,

    // THE ISLAND (25 Sep 2026): what is live right now, as Dynamic Island
    // activities — the workout, Nova talking, the current nudge — plus the
    // pocket check-in that lets a lock-screen notice reopen a live workout.
    // IslandFeed.jsx pushes these to the island; nothing else renders them.
    island: islandView(app, st, demoMode),

  };
}

// ─── the island's activities (25 Sep 2026) ──────────────────────────────────

// Nudges — deterministic suggestions, one at a time, dismissible for the rest
// of this app session. Conditions must be TRUE NOW; a nudge is an offer,
// never a gate. (The "workout in progress" nudge is gone: the workout now
// lives in the island itself whenever he is off the Train screen.)
function nudgeView(app, st, demoMode) {
  if (demoMode) return null;
  const dismissed = st.nudgeDismissed || {};
  const candidates = [];
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
  // THE BOARD'S PROMPTS (his ask, 23 Sep): protein still to land, steps
  // behind, calories over — composed by code on the server from his
  // targets, hour-gated there, the same words Telegram sends. Last in
  // line: a live session or a failed send outranks a suggestion.
  for (const n of (st.liveGoalBoard?.nudges || [])) {
    candidates.push({
      key: `${n.key}:${st.liveGoalBoard.date}`,
      icon: n.metric === 'steps' ? '👟' : n.metric === 'protein' ? '🥩' : '🔥', title: n.title,
      detail: n.short || n.text.replace(/^Coach — /, ''),
      primaryLabel: 'Ask Coach',
      onPrimary: () => { app.navigate('workouts', { trainTab: 'coach' }); app.doCoach(n.ask); },
    });
  }
  const first = candidates.find((c) => !dismissed[c.key]);
  return first ? {
    ...first,
    dismiss: () => app.setState((s) => ({ nudgeDismissed: { ...(s.nudgeDismissed || {}), [first.key]: true } })),
    // a nudge is a suggestion; the answer to a suggestion is a sentence
    reply: () => app.openReply({ text: `${first.title} — ${first.detail}`, title: first.title, source: 'nudge' }),
  } : null;
}

// "Protein · 105 g to go" → "105 g": the part of a nudge title short enough to
// sit beside the camera. A title with no such part gets no readout — the
// bubble's mark alone says something is waiting.
export function nudgeTrail(title) {
  const t = String(title || '');
  const at = t.indexOf(' · ');
  if (at < 0) return '';
  const tail = t.slice(at + 3).replace(/\s+to go$/i, '').trim();
  return tail.length <= 9 ? tail : '';
}

// A live session's progress, counted the same way the Train screen counts it:
// skipped exercises are not owed, so they are not in the total.
export function workoutProgress(ws) {
  const exercises = (ws?.exercises || []).filter((e) => !e.skipped);
  let done = 0;
  let total = 0;
  let next = null;
  for (const e of exercises) {
    for (const set of e.sets || []) {
      total += 1;
      if (set.done) done += 1;
      else if (!next) next = e;
    }
  }
  return { done, total, next };
}

function islandView(app, st, demoMode) {
  const out = { workout: null, speaking: null, nudge: null, pocket: null };
  const ws = st.workoutSession;
  // a past session being edited is paperwork, not a workout in progress
  if (ws && !st.editingSessionId) {
    const { done, total, next } = workoutProgress(ws);
    const resume = () => { app.navigate('workouts'); app.resumeWorkoutSession(); };
    const hue = next ? muscleVar(next.muscleGroup) : 'var(--nv-good)';
    const summary = () => {
      const mins = ws.startedAt ? Math.max(1, Math.round((Date.now() - ws.startedAt) / 60_000)) : null;
      const parts = [total ? `${done} of ${total} sets` : 'No sets yet'];
      if (next) parts.push(`next: ${next.name}`);
      else if (total) parts.push('every set done, finish to log it');
      if (mins) parts.push(`${mins} min in`);
      return parts.join(' · ');
    };
    if (st.screen !== 'workouts') {
      out.workout = {
        sig: `${done}/${total}:${next?.exerciseId || next?.name || ''}:${ws.routineName}`,
        label: `${ws.routineName}, ${done} of ${total} sets. Open the workout`,
        lead: { type: 'ring', fraction: total ? done / total : 0, color: hue },
        trail: total ? `${done}/${total}` : '',
        expanded: () => ({
          id: 'act:workout', tone: 'done', title: ws.routineName, message: summary(),
          lead: { type: 'ring', fraction: total ? done / total : 0, color: hue },
          onPress: resume, actions: [{ label: 'Resume', run: resume }], duration: 6000,
        }),
      };
    }
    // (review #6) only a workout he is DOING: a parked one (Save for later)
    // or a draft restored from days ago must not tell his lock screen
    // "in progress, tap to pick up"
    const active = st.workoutsView === 'session' && ws.startedAt && Date.now() - ws.startedAt < 6 * 3600_000;
    if (active) out.pocket = {
      // the day, not a save stamp: a stamp changes every set and would make
      // every set a new workout with its own notification
      key: `${ws.routineId || 'session'}:${ws.startedAt}`,
      title: `${ws.routineName} in progress`,
      body: `${total ? `${done} of ${total} sets` : 'Started'}${next ? ` · next: ${next.name}` : ''}. Tap to pick up where you left off.`,
      url: './#/workouts',
    };
  }
  if (st.voiceSpeaking && st.screen !== 'voice') {
    out.speaking = {
      sig: 'speaking',
      label: 'Nova is speaking. Show what she is saying',
      lead: { type: 'nova' },
      trail: { type: 'wave' },
      expanded: () => ({
        id: 'act:speaking', tone: 'nova', title: 'Nova', serif: true,
        message: app.ttsNowSaying || 'Speaking…',
        onPress: () => app.navigate('voice'),
        actions: [{ label: 'Stop', run: () => app.stopSpeaking() }], duration: 5000,
      }),
    };
  }
  const n = nudgeView(app, st, demoMode);
  if (n) {
    out.nudge = {
      // (review #5) the key stays fixed all evening while the words move as
      // he eats — the readout and the Ask Coach question must move with them
      sig: `${n.key}|${n.title}|${n.detail}`, key: n.key,
      label: `${n.title}. Show the suggestion`,
      lead: { type: 'mark', tone: 'info' },
      trail: nudgeTrail(n.title),
      trailColor: 'color-mix(in srgb, var(--nv-gold), #fff var(--nv-island-lift))',
      expanded: () => ({
        id: `nudge:${n.key}`, tone: 'info', title: n.title, message: n.detail, duration: 8000,
        actions: [
          { label: n.primaryLabel, run: n.onPrimary },
          { label: 'Reply', run: n.reply },
          { label: 'Not now', run: n.dismiss },
        ],
      }),
    };
  }
  return out;
}

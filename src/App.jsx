import { Component, createRef, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { recipes, notes, basePlan, reviews, galaxyNamed, galaxyLinks } from './data.js';
import { css } from './css.js';
import { api, getConnection, setConnection, testConnection } from './api.js';
import { pollJob } from './jobPoller.js';
import { orbReply, coachReply, recipeReply } from './mockAssistants.js';
import { loadLiveCache, saveLiveCache, clearLiveCache } from './liveStore.js';
import { loadOutbox, saveOutbox, isOfflineError, makeOutboxItem } from './outbox.js';
import { applyAppearance, getNovaTheme, getCalm, getCoreStyle, saveCoreStyle, getNovaStyle } from './theme.js';
import { getTabOrder, saveTabOrder } from './tabOrder.js';
import { NOTE_TYPE_COLOR } from './vals/shared.js';
import { valsRecipes } from './vals/valsRecipes.js';
import { valsWorkouts } from './vals/valsWorkouts.js';
import { valsNotes } from './vals/valsNotes.js';
import { valsMisc } from './vals/valsMisc.js';
import { valsInbox } from './vals/valsInbox.js';
import { valsTodos } from './vals/valsTodos.js';
import { valsMoney } from './vals/valsMoney.js';
import { valsMission } from './vals/valsMission.js';
import { valsOps } from './vals/valsOps.js';
import { valsChrome } from './vals/valsChrome.js';
import { Sidebar } from './Sidebar.jsx';
import { MissionControl } from './screens/MissionControl.jsx';
import { Inbox } from './screens/Inbox.jsx';
import { Todos } from './screens/Todos.jsx';
import { Money } from './screens/Money.jsx';
import { Voice } from './screens/Voice.jsx';
import { Galaxy } from './screens/Galaxy.jsx';
import { Recipes } from './screens/Recipes.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Stash } from './screens/Stash.jsx';
import { Ops } from './screens/Ops.jsx';
import { Ambient } from './screens/Ambient.jsx';
import { Workouts } from './screens/Workouts.jsx';
import { ClaudeCode } from './screens/ClaudeCode.jsx';
import { Notes } from './screens/Notes.jsx';
import { Journal } from './screens/Journal.jsx';
import { Settings } from './screens/Settings.jsx';
import { MobileChrome } from './MobileChrome.jsx';
import { RecipeOverlay } from './RecipeOverlay.jsx';
import { AddRecipeModal } from './AddRecipeModal.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { IngestModal } from './IngestModal.jsx';
import { IngestReview } from './IngestReview.jsx';
import { Toast } from './Toast.jsx';
import { OutboxView } from './OutboxView.jsx';
import { NudgeCard } from './NudgeCard.jsx';
import { Boot } from './Boot.jsx';

// Code-split: ZXing (barcode decoding) is a sizeable dependency that only
// the food-log barcode flow needs — no reason to ship it in everyone's
// initial bundle when most loads never touch it.
const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx').then((m) => ({ default: m.BarcodeScanner })));

// Personalization — appearance now lives in src/theme.js (Settings picks the
// theme + calm mode at runtime; tokens are CSS custom properties in index.css).
const USER_NAME = 'Hayden';
const WAKE_WORD = true;

// Hash-routed screens (#/recipes etc.) so deep links and the back button work
// on GitHub Pages without a server-side router.
const SCREENS = ['mission', 'inbox', 'voice', 'galaxy', 'code', 'recipes', 'shopping', 'todos', 'workouts', 'notes', 'journal', 'money', 'settings'];

const ACTIVE_SESSION_KEY = 'novaos.activeSession';
const QUICK_PLAN_KEY = 'novaos.quickPlan';
// A logged-but-unsaved workout is a DRAFT, not disposable state. The old 20h
// TTL silently DELETED the session on expiry — an evening workout reopened
// after ~2pm the next day was gone, ticked sets and all (it bit twice). Now:
// kept for 7 days; a fresh session (<12h) drops you straight back into it,
// an older one waits as the RESUME card on Train with its age shown.
const SESSION_KEEP_MS = 7 * 24 * 3600_000;
const SESSION_REOPEN_MS = 12 * 3600_000;

function restoreActiveSession() {
  const out = {};
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || 'null');
    if (saved?.workoutSession && Date.now() - (saved.savedAt || 0) < SESSION_KEEP_MS) {
      out.workoutSession = saved.workoutSession;
      out.editingSessionId = saved.editingSessionId || null;
      out.workoutSessionSavedAt = saved.savedAt || null;
      if (Date.now() - (saved.savedAt || 0) < SESSION_REOPEN_MS) {
        out.workoutsView = 'session'; // mid-workout — pick up right where he left off
      }
      out.restoredSession = true;
    } else if (saved) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
    const plan = JSON.parse(localStorage.getItem(QUICK_PLAN_KEY) || 'null');
    if (plan?.quickPlan && Date.now() - (plan.savedAt || 0) < SESSION_KEEP_MS) {
      out.quickPlan = plan.quickPlan;
    } else if (plan) {
      localStorage.removeItem(QUICK_PLAN_KEY);
    }
  } catch { /* corrupt storage — start clean */ }
  return out;
}
// Chat transcripts survive an iOS tab reclaim — the conversation (and the UI
// promise "CONTINUES ACROSS DAYS") used to live only in memory, so backgrounding
// the app could eat the thread AND any in-flight answer's context.
const CHATS_KEY = 'novaos.chats';
const CHAT_KEEP = 40; // messages per chat — enough thread, bounded storage
function restoreChats() {
  try {
    const d = JSON.parse(localStorage.getItem(CHATS_KEY) || 'null');
    if (!d || Date.now() - (d.savedAt || 0) > SESSION_KEEP_MS) return {};
    const out = {};
    for (const k of ['voiceChat', 'coachChat', 'codeChat']) {
      if (Array.isArray(d[k]) && d[k].length) out[k] = d[k];
    }
    return out;
  } catch { return {}; }
}

// Composer drafts (capture box, journal entry) survive a reclaim/refresh the
// same way the workout session does — typed thoughts are never disposable.
const DRAFTS_KEY = 'novaos.drafts';
function restoreDrafts() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFTS_KEY) || 'null');
    if (!d || Date.now() - (d.savedAt || 0) > SESSION_KEEP_MS) return {};
    const out = {};
    if (d.inboxInput) out.inboxInput = d.inboxInput;
    if (d.journalComposerText) out.journalComposerText = d.journalComposerText;
    return out;
  } catch { return {}; }
}

function screenFromHash() {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  return SCREENS.includes(h) ? h : 'mission';
}

// The live* state keys that survive a backend outage: saved to localStorage on
// every successful sync, hydrated back when the server can't be reached.
// Note details and photo blob URLs are deliberately excluded (blobs don't
// serialize; details re-fetch on demand).
const CACHED_LIVE_KEYS = [
  'liveNotes', 'liveCalendar', 'liveRecipes', 'liveRecipeProfile', 'liveRotation',
  'liveFoodLog', 'liveFoodHistory', 'liveShoppingList', 'liveStash', 'liveHealthInsight', 'liveHealthDays', 'liveStreaks',
  'liveWorkoutExercises', 'liveWorkoutMuscleGroups', 'liveWorkoutTrackingTypes',
  'liveWorkoutRoutines', 'liveWorkoutSchedule', 'liveWorkoutWeekdays', 'liveWorkoutProgressions', 'liveWorkoutGoals', 'liveCarryovers',
  'liveJournalEntries', 'liveGraph', 'liveInbox', 'liveDispatch', 'liveCompost', 'liveTodoist', 'liveTodos', 'liveGuardian', 'liveMoney',
  // fetched every sync anyway — excluding them just blanked flagship surfaces
  // (About You, Daily Review card, learning panel) on every phone reload
  'liveDailyReview', 'liveProfile', 'liveLearning',
  // the surfaces added this week — omitted here they went BLANK the moment the
  // Mac slept, which is exactly when the phone is all he has
  'liveOps', 'liveOvernight', 'liveSkills', 'livePulse',
];

const INBOX_MODE_KEY = 'novaos.inboxMode';
const INBOX_MODES = ['review-all', 'auto-high', 'auto-all'];

export default class App extends Component {
  constructor(props) {
    super(props);
    this.galaxyRef = createRef();
    this.paletteRef = createRef();
    this.mainRef = createRef();
    this.ivs = [];
    this.pollers = {};
    this.recipes = recipes;
    this.notes = notes;
    this.basePlan = basePlan;
    this.reviews = reviews;
  }

  state = {
    screen: screenFromHash(), booted: false,
    // demo → no backend configured; connecting → configured, first fetch pending;
    // connected → last sync succeeded; offline → configured but unreachable.
    connectionStatus: typeof window !== 'undefined' && getConnection() ? 'connecting' : 'demo',
    lastSyncAt: null,
    liveGraph: null,
    paletteOpen: false, paletteQuery: '', recallResults: [],
    micOn: true, orbInput: '',
    voiceChat: [], voiceBusy: false, voiceSpeaking: false, liveTts: null,
    voiceConvMode: false, voiceConvPaused: false, voiceAutoListenTick: 0,
    voiceSessionId: typeof localStorage === 'undefined' ? null : (localStorage.getItem('novaos.voiceSession') || null),
    speechVoices: [], speechVoiceURI: typeof localStorage === 'undefined' ? '' : (localStorage.getItem('novaos.speechVoiceURI') || ''),
    coachSessionId: typeof localStorage === 'undefined' ? null : (localStorage.getItem('novaos.coachSession') || null),
    voiceSpeak: typeof localStorage === 'undefined' ? true : localStorage.getItem('novaos.voiceSpeak') !== '0',
    voiceVoiceId: typeof localStorage === 'undefined' ? '' : (localStorage.getItem('novaos.voiceId') || ''),
    orbChat: [
      { who: 'nova', text: 'Good morning, sir. Sleep recovery is complete and push day is locked for 17:30.' },
      { who: 'you', text: 'Anything I should know before deep work?' },
      { who: 'nova', text: 'Two things: Studio finished your cold-open draft, and you are 84 g short on protein pace. The burrito bowl at 12:30 covers it.' },
    ],
    recipeFilter: 'All', openRecipeId: null, servings: 1, recipeInput: '', recipeChat: [],
    recipeAltSelected: null,
    recipeTweakInput: '', recipeTweakBusy: false, recipeTweakError: null, recipeTweakPreview: null,
    recipeEdit: null, recipeEditBusy: false, recipeEditError: null,
    coachInput: '', planNote: null,
    // the scripted opener is demo fiction — a live backend starts the real
    // coach conversation clean
    coachChat: (typeof localStorage !== 'undefined' && localStorage.getItem('novaos.connection'))
      ? []
      : [{ who: 'coach', text: "Push day is set — 6 lifts, ~42 minutes. Bench is at 82.5 kg; if bar speed holds on set two, we take the PR single. Ask me for any changes." }],
    plan: null,
    codeInput: '', codeBusy: false,
    codeChat: [],
    codeSessionId: null, codeWorkspace: 'repo', codeModel: 'sonnet',
    liveHealthInsight: null, liveHealthDays: null, liveStreaks: null,
    stepsOverlayOpen: false, stepsOverlayMode: 'steps', stepEditDate: null, stepEditValue: '', stepEditWeight: '', moneyRemoveConfirm: null,
    tabOrder: getTabOrder(),
    focusSession: (() => {
      try {
        const f = JSON.parse(localStorage.getItem('novaos.focus') || 'null');
        return f && Date.now() - f.endsAt < 2 * 3600_000 ? f : null;
      } catch { return null; }
    })(),
    liveReviewSummaries: {},
    liveFoodLog: null, liveFoodHistory: null, foodHistoryOpen: false,
    liveStash: null, stashAddCategory: '', stashAddName: '', stashAddUrl: '', stashAddNote: '', stashAddBusy: false, stashAddError: null, stashRemoveConfirm: null,
    foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodLogBusy: false, foodLogError: null,
    foodScanNote: '', foodScanPhotos: [], foodScanBusy: false, foodScanError: null, foodScanQuestion: null, foodLogFillSource: null,
    foodDescribeInput: '',
    // a low-confidence scan's clarifying question stays ANSWERABLE: the photos
    // + note that produced it are kept so an answer can re-run the same scan
    foodScanQAPhotos: [], foodScanQANote: '', foodScanAnswer: '',
    barcodeScannerOpen: false,
    noteQuery: '', noteType: 'All', openNoteId: 'n1',
    galaxySel: null, toast: null, reviewIdx: 0,
    isMobile: typeof window !== 'undefined' && window.innerWidth < 760,
    novaTheme: getNovaTheme(), calmMode: getCalm(), coreStyle: getCoreStyle(), novaStyle: getNovaStyle(),

    // nova inbox (capture → classify → file) + the loops riding its rails
    liveInbox: null, inboxInput: '', inboxCaptureBusy: false, inboxActionBusy: {},
    inboxMode: (typeof window !== 'undefined' && INBOX_MODES.includes(localStorage.getItem(INBOX_MODE_KEY))) ? localStorage.getItem(INBOX_MODE_KEY) : 'auto-high',
    inboxProposalDismissed: (() => { try { const a = JSON.parse(localStorage.getItem('novaos.proposalsDismissed') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })(),
    liveDispatch: null, liveCompost: null, liveTodoist: null, liveTodos: null, liveGuardian: null, liveDailyReview: null, liveOps: null,
    liveOvernight: null, overnightInput: '', liveSkills: null, livePulse: null,
    dispatchBusy: false, compostBusy: false, compostActionBusy: {}, todoistBusy: false, guardianBusy: false, reviewBusy: false,
    todoInput: '', todoActionBusy: false, todoEditCategoryKey: null,
    editingSessionId: null, sessionDeleteConfirmId: null,
    liveCarryovers: null, finishMissed: null, finishMissedDate: '', finishMissedRoutine: '', carryoverRescheduleId: null,
    liveWorkoutGoals: null, goalsEditing: false, goalsDraft: { goal: '', focus: '', daysPerWeek: '', equipment: '', limitations: '', notes: '' }, coachBusy: false,
    mealPrepBusy: false,
    quickMinutes: '45', quickNote: '', quickBusy: false, quickPlan: null,
    liveBackups: null, restoreConfirm: null, pushState: 'checking',
    liveProfile: null, profileEditing: false, profileDraft: { focus: '', priorities: '', bestSelf: '', notes: '' }, profileSaving: false,
    liveLearning: null,
    // offline outbox — writes queued while the backend is unreachable
    outbox: typeof localStorage !== 'undefined' ? loadOutbox() : [],
    nudgeDismissed: {},
    ritualDone: (() => { try { return JSON.parse(localStorage.getItem('novaos.ritualDone')) || {}; } catch { return {}; } })(),
    outboxOpen: false,
    // an in-progress workout must survive tab reclaim / refresh / app kill —
    // restored from device storage at boot (see restoreActiveSession)
    ...restoreActiveSession(),
    ...restoreDrafts(),
    ...restoreChats(),
    liveMoney: null, moneyBusy: false, moneyScanBusy: false, moneyScanError: null, moneyScanQuestion: null,
    moneyAddMerchant: '', moneyAddAmount: '', moneyAddIsSpend: true, moneyEditCategoryId: null,
    sparBusy: false,

    // live-data connection (Settings screen)
    settingsBaseUrl: '', settingsToken: '',
    settingsTestStatus: 'idle', settingsTestMessage: '',
    liveNotes: null, liveNoteDetails: {}, liveCalendar: null, liveCalendarList: null, calCmdText: '', calCmdBusy: false,
    calendarViewOpen: false, liveCalendarRange: null, calendarRangeError: false, calendarListError: false, liveRecipes: null,
    liveRotation: null, liveRecipeProfile: null, rotationShowExtra: false,

    // add recipe (writes back to the real vault file)
    recipeAddOpen: false, recipeAddName: '', recipeAddCategory: 'CORE DAILY MEALS', recipeAddMakes: '',
    recipeAddP: '', recipeAddC: '', recipeAddF: '', recipeAddKcal: '', recipeAddKj: '',
    recipeAddIngredients: '', recipeAddMethod: '', recipeAddBusy: false, recipeAddError: null,
    recipeAddPhotoDataUrl: null,
    liveRecipePhotoUrls: {}, recipePhotoUploadBusy: {},
    recipeScanBusy: false, recipeScanError: null,

    // shopping list
    liveShoppingList: null,
    shoppingAddInput: '', shoppingAddBusy: false, shoppingAddError: null,

    // workouts
    liveWorkoutExercises: null, liveWorkoutMuscleGroups: null, liveWorkoutTrackingTypes: null,
    liveWorkoutRoutines: null, liveWorkoutSchedule: null, liveWorkoutWeekdays: null, liveWorkoutProgressions: null,
    workoutsView: 'routines', openRoutineId: null,
    routineCreating: false, routineNewName: '',
    routineDeleteConfirm: false,
    exercisePickerOpen: false, exercisePickerQuery: '', exercisePickerMuscle: 'Any',
    exercisePickerCreateMuscle: '', exercisePickerCreateTrackingType: 'weight_reps',
    workoutSession: null, workoutSessionSavedAt: null, sessionCancelConfirm: false,
    liveWorkoutHistory: null, historyRoutineId: null,

    // daily review + journal
    reviewShuffleIdx: null,
    reviewReflectOpen: false, reviewReflectText: '', reviewReflectBusy: false, reviewReflectError: null,
    reviewReflectPromptBusy: false, reviewReflectPromptText: null,
    liveJournalEntries: null,
    journalComposerText: '', journalSaveBusy: false, journalSaveError: null,
    journalPromptBusy: false, journalPromptText: null,
    journalOpenDate: null, journalFilter: 'all',

    // transcript ingest
    ingestModalOpen: false, ingestText: '', ingestSourceUrl: '',
    ingestJobId: null, ingestStatus: 'idle', ingestPreview: null, ingestError: null,
  };

  componentDidMount() {
    if (import.meta.env.DEV) window.__novaApp = this; // dev-only introspection hook
    // Boot policy — stale-while-revalidate: a returning session with cached
    // real data boots straight onto it after a launch-screen blink, and the
    // refresh swaps live truth in behind the status chip (CONNECTING… → LIVE
    // or the offline banner). Holding the splash is only for cases where
    // dropping it early would flash the WRONG content: a first-ever connect
    // (no cache yet — wait for real data, capped so an unreachable backend
    // can't hang the splash forever) and demo mode (the scripted intro).
    const bootConn = getConnection();
    const cached = bootConn ? loadLiveCache() : null;
    const minBootTime = new Promise((resolve) => { this.bootT = setTimeout(resolve, cached ? 350 : 1700); });
    let dataReady = Promise.resolve();
    if (bootConn) {
      // Hydrate last-known-good data immediately so an unreachable backend
      // shows real (stale) content behind the offline banner, never demo data.
      const hydrate = { settingsBaseUrl: bootConn.baseUrl, settingsToken: bootConn.token };
      if (cached) {
        for (const key of CACHED_LIVE_KEYS) if (cached.slices[key] !== undefined) hydrate[key] = cached.slices[key];
        hydrate.lastSyncAt = cached.savedAt;
      }
      this.setState(hydrate);
      const fetchDone = this.refreshLiveData();
      if (!cached) {
        const fetchTimeout = new Promise((resolve) => setTimeout(resolve, 5000));
        dataReady = Promise.race([fetchDone, fetchTimeout]);
      }
    }
    Promise.all([minBootTime, dataReady]).then(() => this.setState({ booted: true }));
    if (this.state.restoredSession) {
      setTimeout(() => this.toastMsg(this.state.workoutsView === 'session'
        ? 'Restored your in-progress workout — nothing was lost'
        : 'Your unsaved workout is waiting as a draft on Train — nothing was lost'), 1200);
    } else if (getConnection()) {
      // no local draft — check the server-side mirror (survives storage
      // eviction and reinstalls; the localStorage copy alone proved lossy)
      api.getSessionDraft(getConnection()).then(({ draft }) => {
        this.serverDraftChecked = true;
        if (!draft?.workoutSession || this.state.workoutSession) return;
        this.setState({
          workoutSession: draft.workoutSession,
          editingSessionId: draft.editingSessionId || null,
          workoutSessionSavedAt: draft.savedAt || null,
        });
        this.toastMsg('Recovered your workout draft from the server — nothing was lost');
      }).catch(() => {
        // an UNREACHABLE server is not "no draft" — say so, and the
        // reconnect re-check below retries the moment the backend answers
        this.toastMsg('Couldn’t check the server for a workout draft — it retries when Nova reconnects');
      });
    }
    this.checkPushState();
    this.syncInboxMode(); // pull the system-wide autonomy mode from the server
    // an answer that was in flight when the app was reclaimed — pick the poll back up
    try {
      const pending = JSON.parse(localStorage.getItem('novaos.askJob') || 'null');
      const conn = getConnection();
      if (pending?.jobId && conn && Date.now() - (pending.askedAt || 0) < 10 * 60_000) {
        this.setState({ voiceBusy: true });
        this.attachAskPoll(conn, pending.jobId);
      } else if (pending) {
        localStorage.removeItem('novaos.askJob');
      }
    } catch { /* best-effort */ }
    // load the device's free system voices for the voice picker (they arrive
    // async on iOS, so listen for the change too)
    const loadVoices = () => { try { this.setState({ speechVoices: window.speechSynthesis.getVoices() }); } catch { /* unsupported */ } };
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    // Keep live data fresh: re-sync when the tab regains focus (the common
    // "reopen the PWA on the phone" path) and on a slow background cadence.
    this.visH = () => {
      if (document.visibilityState === 'visible') {
        // A long-lived installed PWA only checks for new versions on
        // navigation or every 24h — Hayden's Mac app sat on a stale bundle
        // for days. Ask the SW to check on every resume; when a new version
        // takes control, the controllerchange reload below applies it.
        try { navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {}); } catch { /* unsupported */ }
        if (getConnection()) {
          this.refreshLiveData();
          this.startEventStream();
        }
      } else {
        this.stopEventStream(); // save battery while backgrounded
        // a deferred update applies now — backgrounded, nothing to interrupt
        if (this.swPendingReload && !this.state.workoutSession && !this.swReloading) {
          this.swReloading = true;
          window.location.reload();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visH);
    // Apply updates the moment the new service worker takes over — but only
    // on a real handover (skip the first-ever install claim), and only once.
    // Resume is the safe moment: drafts are mirrored and boot is ~0.4s.
    try {
      if (navigator.serviceWorker) {
        this.swHadController = !!navigator.serviceWorker.controller;
        this.swCtrlH = () => {
          if (!this.swHadController) { this.swHadController = true; return; }
          if (this.swReloading) return;
          // NEVER reload over an in-flight workout (or any unsaved surface a
          // reload could race) — it refreshed Hayden mid-set. Defer to the
          // next backgrounding; the update applies invisibly then.
          if (this.state.workoutSession) { this.swPendingReload = true; return; }
          this.swReloading = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', this.swCtrlH);
      }
    } catch { /* unsupported */ }
    // Last-chance flush: an immediate reload can outrun async storage — on
    // pagehide, synchronously re-mirror the active session so the draft's
    // localStorage copy is as fresh as WebKit allows.
    this.pagehideH = () => {
      try {
        const s = this.state.workoutSession;
        if (s) localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ workoutSession: s, editingSessionId: this.state.editingSessionId, savedAt: Date.now() }));
      } catch { /* best-effort */ }
    };
    window.addEventListener('pagehide', this.pagehideH);
    this.refreshIv = setInterval(() => { if (getConnection()) this.refreshLiveData(); }, 5 * 60_000);
    this.startEventStream();
    // Zombie-stream watchdog: a half-open event stream delivers nothing and
    // throws nothing — "live" calendar updates silently stopped until the
    // 5-minute timer. The server pings every 25s, so >75s of silence while
    // visible means the stream is dead: kill it and reconnect.
    this.streamWatchIv = setInterval(() => {
      if (document.visibilityState !== 'visible' || !this.eventAbort) return;
      if (Date.now() - (this.lastStreamActivity || 0) > 75_000) {
        this.stopEventStream();
        this.startEventStream();
        this.refreshLiveData(); // catch up on whatever the dead stream missed
      }
    }, 30_000);
    // Network coming back is the outbox's moment — drain immediately rather
    // than waiting for the next sync tick.
    this.onlineH = () => { if (getConnection()) { this.drainOutbox(); this.refreshLiveData(); } };
    window.addEventListener('online', this.onlineH);
    // Back/forward navigation re-derives the screen from the hash.
    this.popH = () => this.setState({ screen: screenFromHash() });
    window.addEventListener('popstate', this.popH);
    window.addEventListener('hashchange', this.popH);
    this.keyH = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.setState(s => ({ paletteOpen: !s.paletteOpen, paletteQuery: '' })); }
      else if (e.key === 'Escape') { this.stopPoll('recipeTweak'); this.setState({ paletteOpen: false, openRecipeId: null, galaxySel: null }); }
    };
    window.addEventListener('keydown', this.keyH);
    this.resizeH = () => {
      const m = window.innerWidth < 760;
      if (m !== this.state.isMobile) {
        if (this.state.screen === 'galaxy') { this.stopGalaxy(); this.gNodes = null; }
        this.setState({ isMobile: m });
      }
    };
    window.addEventListener('resize', this.resizeH);
    this.setState({ reviewIdx: Math.floor(Math.random() * this.reviews.length) });
  }
  componentWillUnmount() {
    clearTimeout(this.bootT); clearInterval(this.refreshIv); clearInterval(this.streamWatchIv);
    Object.values(this.pollers || {}).forEach((p) => p.cancel());
    window.removeEventListener('keydown', this.keyH);
    window.removeEventListener('resize', this.resizeH);
    window.removeEventListener('popstate', this.popH);
    window.removeEventListener('hashchange', this.popH);
    window.removeEventListener('online', this.onlineH);
    window.removeEventListener('pagehide', this.pagehideH);
    document.removeEventListener('visibilitychange', this.visH);
    try { if (this.swCtrlH) navigator.serviceWorker?.removeEventListener('controllerchange', this.swCtrlH); } catch { /* unsupported */ }
    this.ivs.forEach(clearInterval);
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
  }
  // ---------- navigation (hash-routed) ----------
  // What he actually opens, counted locally. The dock holds four screens; the
  // More sheet leads with the ones he reaches for most, so the fifth-favourite
  // is one tap rather than a hunt through fifteen.
  noteScreenVisit(screen) {
    try {
      const raw = JSON.parse(localStorage.getItem('novaos.screenVisits') || '{}');
      raw[screen] = (raw[screen] || 0) + 1;
      localStorage.setItem('novaos.screenVisits', JSON.stringify(raw));
      this.screenVisits = raw;
    } catch { /* counting is a convenience, never a requirement */ }
  }
  // Shared-element transitions. Where the browser supports the View
  // Transitions API (Safari 18+, Chrome), a state change can be wrapped so
  // matching elements MORPH between states instead of one thing vanishing and
  // another appearing — a recipe card becoming its own detail view. Degrades
  // to an ordinary setState everywhere else, and is skipped entirely when the
  // system asks for reduced motion.
  withTransition(fn) {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof document === 'undefined' || !document.startViewTransition) { fn(); return; }
    try { document.startViewTransition(() => { flushSync(() => fn()); }); } catch { fn(); }
  }
  navigate(screen, extra = {}) {
    const changed = this.state.screen !== screen;
    // screens cross-fade rather than cut; anything carrying a shared
    // view-transition-name across the two screens morphs instead
    const apply = () => this.setState({ screen, ...extra }, () => {
      // one shared scroller — without a reset, Mission Control opens mid-page
      // after scrolling Recipes
      if (changed && this.mainRef?.current) this.mainRef.current.scrollTop = 0;
    });
    if (changed) { this.withTransition(apply); this.noteScreenVisit(screen); } else apply();
    if (changed && screen === 'voice') this.maybeVoiceGreet();
    const want = '#/' + screen;
    // pushState (not location.hash=) so this doesn't also fire hashchange and
    // double-set state; popstate covers the back button.
    if (window.location.hash !== want) window.history.pushState(null, '', want);
  }
  // ---------- job polling (shared) ----------
  startPoll(name, fetchJob, handlers) {
    this.stopPoll(name);
    this.pollers[name] = pollJob(fetchJob, handlers);
  }
  stopPoll(name) {
    if (this.pollers?.[name]) {
      this.pollers[name].cancel();
      delete this.pollers[name];
    }
  }
  // ---------- offline outbox (queue writes while the backend is away) ----
  // One drain function per queued kind — each replays the EXACT api call the
  // live path makes, so the server sees identical requests either way.
  outboxDrainFns() {
    return {
      capture: (conn, p) => api.inboxCapture(conn, p.text, p.mode, p.source),
      food: (conn, p) => api.addFoodLogEntry(conn, { name: p.name, macros: p.macros, source: p.source }),
      todo: (conn, p) => api.todoAdd(conn, p.text),
      shopping: (conn, p) => api.addShoppingItems(conn, p.items),
      journal: (conn, p) => api.addJournalEntry(conn, p.text),
      healthDay: (conn, p) => api.saveHealthDay(conn, p.date, p.metrics),
      session: (conn, p) => api.completeWorkoutSession(conn, p.payload)
        .then((r) => { if (p.carryoverId) api.removeCarryover(conn, p.carryoverId).catch(() => {}); return r; }),
      stash: (conn, p) => api.stashAdd(conn, p),
      rotationConsumed: (conn, p) => api.setRotationConsumed(conn, p.slot, p.consumed),
      recipe: (conn, p) => (p.macroOnly
        ? api.addQuickRecipe(conn, { name: p.name, category: p.category, makes: p.makes, macros: p.macros })
        : api.addRecipe(conn, { name: p.name, category: p.category, makes: p.makes, macros: p.macros, ingredients: p.ingredients, method: p.method })),
    };
  }
  enqueueOutbox(kind, label, payload) {
    const item = makeOutboxItem(kind, label, payload);
    this.setState((s) => {
      const outbox = [...s.outbox, item];
      saveOutbox(outbox);
      return { outbox };
    });
    this.toastMsg(`Backend unreachable — “${item.label}” saved to the Outbox, syncs when Nova reconnects`);
  }
  // Drain FIFO, single-flight. Connectivity failure stops the drain (retry on
  // the next reconnect); a server REJECTION marks that item failed-for-review
  // and moves on — never a silent drop, never an infinite retry.
  async drainOutbox() {
    if (this.outboxDraining) return;
    const conn = getConnection();
    if (!conn || !this.state.outbox.some((i) => i.status === 'queued')) return;
    this.outboxDraining = true;
    const fns = this.outboxDrainFns();
    let sent = 0;
    try {
      for (const item of [...this.state.outbox]) {
        if (item.status !== 'queued') continue;
        const fn = fns[item.kind];
        try {
          if (fn) await fn(conn, item.payload);
          this.setState((s) => {
            const outbox = s.outbox.filter((i) => i.id !== item.id);
            saveOutbox(outbox);
            return { outbox };
          });
          sent++;
        } catch (e) {
          if (isOfflineError(e)) return; // still unreachable — keep everything queued
          this.setState((s) => {
            const outbox = s.outbox.map((i) => (i.id === item.id ? { ...i, status: 'failed', error: e.message } : i));
            saveOutbox(outbox);
            return { outbox };
          });
        }
      }
    } finally {
      this.outboxDraining = false;
      if (sent) {
        this.toastMsg(`Outbox synced — ${sent} item${sent === 1 ? '' : 's'} filed ✓`);
        this.refreshLiveData();
      }
    }
  }
  discardOutboxItem(id) {
    this.setState((s) => {
      const outbox = s.outbox.filter((i) => i.id !== id);
      saveOutbox(outbox);
      return { outbox };
    });
  }
  retryOutboxItem(id) {
    this.setState((s) => {
      const outbox = s.outbox.map((i) => (i.id === id ? { ...i, status: 'queued', error: null } : i));
      saveOutbox(outbox);
      return { outbox };
    }, () => this.drainOutbox());
  }

  // ---------- rotation variants + promote (today's version vs the recipe) --
  setRotationVariant(slot, altId) {
    const conn = getConnection();
    if (!conn) return;
    api.setRotationVariant(conn, slot, altId).then((rotation) => {
      this.noteLocalWrite('rotation');
      this.setState({ liveRotation: rotation });
      this.toastMsg(altId ? "Applied as today's version — the stored recipe is untouched" : 'Back to the original for today');
    }).catch((e) => this.toastMsg('Could not set today’s version: ' + e.message));
  }
  promoteRecipeAlternate(recipeId, altId) {
    const conn = getConnection();
    if (!conn) return;
    api.promoteRecipeAlternate(conn, recipeId, altId).then(({ recipe }) => {
      this.setState((s) => ({
        liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r))),
        recipeAltSelected: null,
      }));
      this.refreshLiveData(); // rotation totals inherit the new primary macros
      this.toastMsg(`${recipe.name} updated — the old version is kept as "Original"`);
    }).catch((e) => this.toastMsg('Could not make it primary: ' + e.message));
  }

  // Rename a variant. Its id is the slug of its name, so the server migrates
  // any today-variant override with it; selection follows the new id.
  startRenameAlternate(altId, currentLabel) {
    this.setState({ recipeRenameAltId: altId, recipeRenameValue: currentLabel, recipeRenameError: null });
  }
  cancelRenameAlternate() {
    this.setState({ recipeRenameAltId: null, recipeRenameValue: '', recipeRenameError: null });
  }
  commitRenameAlternate() {
    const conn = getConnection();
    const { openRecipeId, recipeRenameAltId, recipeRenameValue } = this.state;
    const label = (recipeRenameValue || '').trim();
    if (!conn || !openRecipeId || !recipeRenameAltId || !label) return;
    api.renameAlternate(conn, openRecipeId, recipeRenameAltId, label).then(({ recipe, rotation }) => {
      const renamed = (recipe.alternates || []).find((a) => a.label === label);
      this.setState((s) => ({
        liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r))),
        liveRotation: (this.noteLocalWrite('rotation'), rotation || s.liveRotation),
        recipeAltSelected: s.recipeAltSelected === recipeRenameAltId ? (renamed?.id || null) : s.recipeAltSelected,
        recipeRenameAltId: null, recipeRenameValue: '', recipeRenameError: null,
      }));
      this.toastMsg(`Renamed to “${label}”`);
    }).catch((e) => this.setState({ recipeRenameError: e.message }));
  }

  // ---------- editing what's actually in a meal ---------------------------
  // Any recipe, any variant: his own, one Nova scanned, or a saved tweak. The
  // form starts from exactly what's on screen, so "edit" never means "retype".
  startRecipeEdit(seed) {
    this.setState({
      recipeEdit: {
        ingredients: (seed.ingredients || []).join('\n'),
        method: (seed.method || []).join('\n'),
        p: String(seed.macros?.p ?? ''), c: String(seed.macros?.c ?? ''),
        f: String(seed.macros?.f ?? ''), kcal: String(seed.macros?.kcal ?? ''),
      },
      recipeEditError: null, recipeEditBusy: false,
    });
  }
  cancelRecipeEdit() { this.setState({ recipeEdit: null, recipeEditError: null, recipeEditBusy: false }); }
  setRecipeEditField(field, value) {
    this.setState((s) => ({ recipeEdit: { ...s.recipeEdit, [field]: value }, recipeEditError: null }));
  }
  commitRecipeEdit(recipeId, altId) {
    const conn = getConnection();
    const e = this.state.recipeEdit;
    if (!conn || !recipeId || !e) return;
    const lines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const ingredients = lines(e.ingredients);
    const method = lines(e.method);
    if (!ingredients.length) return this.setState({ recipeEditError: 'A meal needs at least one ingredient.' });
    const nums = [e.p, e.c, e.f, e.kcal].map((n) => Number(n));
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
      return this.setState({ recipeEditError: 'Macros must be numbers.' });
    }
    this.setState({ recipeEditBusy: true, recipeEditError: null });
    api.editRecipe(conn, recipeId, {
      ingredients,
      // no steps is legitimate — a variant is cooked like its parent
      method: method.length ? method : undefined,
      macros: { p: nums[0], c: nums[1], f: nums[2], kcal: nums[3] },
      alt: altId || undefined,
    }).then(({ recipe }) => {
      this.setState((s) => ({
        liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r))),
        recipeEdit: null, recipeEditBusy: false, recipeEditError: null,
      }));
      this.toastMsg('Saved to the vault');
    }).catch((err) => this.setState({ recipeEditBusy: false, recipeEditError: err.message }));
  }

  // ---------- stash (categorised restock/reference links, vault-backed) ----
  setStashField(field, e) {
    this.setState({ [field]: e.target.value, stashAddError: null });
  }
  addStashItem() {
    const conn = getConnection();
    const item = {
      category: this.state.stashAddCategory.trim(),
      name: this.state.stashAddName.trim(),
      url: this.state.stashAddUrl.trim(),
      note: this.state.stashAddNote.trim() || undefined,
    };
    if (!conn || !item.category || !item.name || !item.url) {
      this.setState({ stashAddError: 'Category, name, and link are all needed.' });
      return;
    }
    this.setState({ stashAddBusy: true, stashAddError: null });
    api.stashAdd(conn, item).then((r) => {
      this.setState({ liveStash: r.categories, stashAddBusy: false, stashAddName: '', stashAddUrl: '', stashAddNote: '' });
      this.toastMsg(`${item.name} stashed ✓ — saved to Obsidian too`);
    }).catch((e) => {
      if (isOfflineError(e)) {
        this.setState({ stashAddBusy: false, stashAddName: '', stashAddUrl: '', stashAddNote: '' });
        this.enqueueOutbox('stash', item.name, item);
        return;
      }
      this.setState({ stashAddBusy: false, stashAddError: e.message });
    });
  }
  removeStashItem(raw) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ stashRemoveConfirm: null });
    api.stashRemove(conn, raw).then((r) => this.setState({ liveStash: r.categories }))
      .catch((e) => this.toastMsg('Could not remove: ' + e.message));
  }

  // ---------- appearance (theme + calm mode, persisted) ----------
  // Apply from the settled state in the setState callback — applying from
  // arguments + this.state directly goes stale when both setters run in the
  // same tick (theme switch immediately followed by a calm toggle).
  setNovaTheme(theme) {
    this.setState({ novaTheme: theme }, () => applyAppearance(this.state.novaTheme, this.state.calmMode, this.state.novaStyle));
  }
  setCalmMode(calm) {
    this.setState({ calmMode: calm }, () => applyAppearance(this.state.novaTheme, this.state.calmMode, this.state.novaStyle));
  }
  setNovaStyle(style) {
    // Daylight is an Apple-family palette — returning to Command Core falls
    // the theme back too, so the HUD never renders on a white ground.
    const next = { novaStyle: style };
    if (style === 'command' && this.state.novaTheme === 'daylight') next.novaTheme = 'command';
    this.setState(next, () => applyAppearance(this.state.novaTheme, this.state.calmMode, this.state.novaStyle));
  }
  setCoreStyle(core) {
    saveCoreStyle(core);
    this.setState({ coreStyle: core });
  }
  setTabOrder(order) {
    saveTabOrder(order);
    this.setState({ tabOrder: order });
  }

  // ---------- live data (Obsidian + Calendar) ----------
  // One sync pass over every live slice. Failures never null a slice — the
  // last-known value (in-memory or hydrated from the cache) stays visible and
  // the connection banner reports the outage; falling back to demo data would
  // silently show fiction. Runs all fetches in parallel.
  // The live wire: hold a streaming /api/events response open and re-sync
  // the moment the server announces a change (health push, filing, brief).
  // fetch + reader because EventSource can't carry the Bearer header.
  startEventStream() {
    const conn = getConnection();
    if (!conn || this.eventAbort || document.visibilityState !== 'visible') return;
    const abort = new AbortController();
    this.eventAbort = abort;
    fetch(conn.baseUrl.replace(/\/$/, '') + '/api/events', {
      headers: { Authorization: `Bearer ${conn.token}` },
      signal: abort.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) throw new Error('stream unavailable');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      this.lastStreamActivity = Date.now();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // EVERY chunk counts as liveness — the server pings every 25s, so a
        // healthy stream is never silent longer than that. A half-open TCP
        // stream (Tailscale network hops) pends forever with no error; the
        // liveness watchdog uses this timestamp to detect and kill it.
        this.lastStreamActivity = Date.now();
        if (!decoder.decode(value, { stream: true }).includes('data:')) continue;
        const now = Date.now();
        if (now - (this.lastEventRefresh || 0) > 3000) {
          this.lastEventRefresh = now;
          this.refreshLiveData();
        }
      }
      throw new Error('stream ended');
    }).catch(() => {
      if (this.eventAbort !== abort) return; // deliberately stopped
      this.eventAbort = null;
      // reconnect with backoff while visible
      clearTimeout(this.eventRetryT);
      this.eventRetryT = setTimeout(() => this.startEventStream(), 15_000);
    });
  }
  stopEventStream() {
    clearTimeout(this.eventRetryT);
    if (this.eventAbort) {
      const a = this.eventAbort;
      this.eventAbort = null;
      a.abort();
    }
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.state.screen === 'galaxy') this.startGalaxy(); else this.stopGalaxy();
    if (this.state.paletteOpen && !prevState.paletteOpen && this.paletteRef.current) this.paletteRef.current.focus();
    // entering Settings — pull the calendar list once so the toggles are ready
    if (this.state.screen === 'settings' && prevState.screen !== 'settings' && this.state.liveCalendarList == null && getConnection()) {
      this.loadCalendarList();
    }
    // mirror chat transcripts (trimmed) — a reclaim must not eat the thread
    if (prevState.voiceChat !== this.state.voiceChat || prevState.coachChat !== this.state.coachChat || prevState.codeChat !== this.state.codeChat) {
      try {
        const trim = (c) => (c || []).slice(-CHAT_KEEP);
        const payload = { voiceChat: trim(this.state.voiceChat), coachChat: trim(this.state.coachChat), codeChat: trim(this.state.codeChat), savedAt: Date.now() };
        if (payload.voiceChat.length || payload.coachChat.length || payload.codeChat.length) {
          localStorage.setItem(CHATS_KEY, JSON.stringify(payload));
        } else {
          localStorage.removeItem(CHATS_KEY);
        }
      } catch { /* storage full — chats just won't persist */ }
    }
    // mirror composer drafts — typed-but-unsubmitted text survives a refresh
    if (prevState.inboxInput !== this.state.inboxInput || prevState.journalComposerText !== this.state.journalComposerText) {
      try {
        if (this.state.inboxInput || this.state.journalComposerText) {
          localStorage.setItem(DRAFTS_KEY, JSON.stringify({ inboxInput: this.state.inboxInput, journalComposerText: this.state.journalComposerText, savedAt: Date.now() }));
        } else {
          localStorage.removeItem(DRAFTS_KEY);
        }
      } catch { /* storage full — drafts just won't persist */ }
    }
    // mirror the in-progress workout to device storage on every change —
    // this is what survives Chrome reclaiming the tab mid-treadmill
    if (prevState.workoutSession !== this.state.workoutSession || prevState.editingSessionId !== this.state.editingSessionId) {
      try {
        if (this.state.workoutSession) {
          const savedAt = Date.now();
          localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
            workoutSession: this.state.workoutSession,
            editingSessionId: this.state.editingSessionId,
            savedAt,
          }));
          if (this.state.workoutSessionSavedAt !== savedAt) this.setState({ workoutSessionSavedAt: savedAt });
          // second line of defense: mirror the draft to the SERVER (debounced) —
          // survives storage eviction, reinstalls, and reconnect cycles
          clearTimeout(this.draftUploadT);
          this.draftUploadT = setTimeout(() => {
            const conn = getConnection();
            const s = this.state.workoutSession;
            if (conn && s) api.saveSessionDraft(conn, { workoutSession: s, editingSessionId: this.state.editingSessionId }).catch(() => {});
          }, 1500);
        } else {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
          // the session ended on purpose (finish/discard) — clear the server draft too
          clearTimeout(this.draftUploadT);
          const conn = getConnection();
          if (conn) api.clearSessionDraft(conn).catch(() => {});
        }
      } catch { /* storage full/blocked — in-memory still works */ }
    }
    if (prevState.quickPlan !== this.state.quickPlan) {
      try {
        if (this.state.quickPlan) localStorage.setItem(QUICK_PLAN_KEY, JSON.stringify({ quickPlan: this.state.quickPlan, savedAt: Date.now() }));
        else localStorage.removeItem(QUICK_PLAN_KEY);
      } catch { /* best-effort */ }
    }
  }
  // Apply a bundled /api/snapshot payload — the same per-slice handling the
  // individual fetch tasks perform, fed from ONE round-trip. Returns how many
  // slices applied (the connected/offline quorum works the same way).
  // A snapshot in flight can return state read BEFORE a write that has since
  // landed; applying it blindly reverted the fresh value — the "I logged it
  // and it didn't stay" glitch. A slice written locally after the request
  // began is skipped (it still counts as synced; our copy is the newer one).
  noteLocalWrite(key) {
    this.localWrites = { ...(this.localWrites || {}), [key]: Date.now() };
  }
  applySnapshot(slices, startedAt = 0) {
    let ok = 0;
    const apply = (key, fn) => {
      if (slices[key] === undefined) return;
      if (startedAt && (this.localWrites?.[key] || 0) > startedAt) { ok++; return; }
      try { fn(slices[key]); ok++; } catch { /* slice shape surprise — skip it */ }
    };
    apply('notes', (r) => {
      this.setState({ liveNotes: r.notes });
      if (r.notes[0] && !this.state.liveNoteDetails[this.state.openNoteId]) this.selectNote(r.notes[0].id);
      this.refreshDailyReviewDetail(r.notes);
    });
    apply('journal', (r) => this.setState({ liveJournalEntries: r.entries }));
    apply('healthInsight', (r) => this.setState({ liveHealthInsight: r }));
    apply('healthData', (r) => this.setState({ liveHealthDays: r.days.length ? r.days : null }));
    apply('streaks', (r) => this.setState({ liveStreaks: r }));
    apply('calendar', (r) => this.setState({ liveCalendar: r.events }));
    apply('recipes', (r) => {
      this.setState({ liveRecipes: r.recipes.length ? r.recipes : null, liveRecipeProfile: r.profile || null });
      this.refreshRecipePhotos(r.recipes);
    });
    apply('rotation', (r) => this.setState({ liveRotation: r }));
    apply('foodLog', (r) => this.setState({ liveFoodLog: r }));
    apply('stash', (r) => this.setState({ liveStash: r.categories }));
    apply('shoppingList', (r) => this.setState({ liveShoppingList: r }));
    apply('workoutExercises', (r) => this.setState({ liveWorkoutExercises: r.exercises, liveWorkoutMuscleGroups: r.muscleGroups, liveWorkoutTrackingTypes: r.trackingTypes }));
    apply('workoutRoutines', (r) => this.setState({ liveWorkoutRoutines: r.routines, liveWorkoutSchedule: r.schedule, liveWorkoutWeekdays: r.weekdays, liveWorkoutProgressions: r.progressions || {} }));
    apply('workoutGoals', (r) => this.setState({ liveWorkoutGoals: r.goals }));
    apply('graph', (r) => { this.setState({ liveGraph: r }); this.gNodes = null; });
    apply('inbox', (r) => this.setState({ liveInbox: r }));
    apply('dispatch', (r) => this.setState({ liveDispatch: r }));
    apply('compost', (r) => this.setState({ liveCompost: r }));
    apply('todoist', (r) => this.setState({ liveTodoist: r }));
    apply('todos', (r) => this.setState({ liveTodos: r }));
    apply('guardian', (r) => this.setState({ liveGuardian: r }));
    apply('tts', (r) => this.setState({ liveTts: r }));
    apply('money', (r) => this.setState({ liveMoney: r }));
    apply('profile', (r) => this.setState({ liveProfile: r.profile }));
    apply('learning', (r) => this.setState({ liveLearning: r }));
    apply('dailyReview', (r) => this.setState({ liveDailyReview: r }));
    apply('ops', (r) => this.setState({ liveOps: r }));
    apply('overnight', (r) => this.setState({ liveOvernight: r }));
    apply('skills', (r) => this.setState({ liveSkills: r.departments }));
    apply('pulse', (r) => this.setState({ livePulse: r.topics }));
    return ok;
  }
  async refreshLiveData() {
    const conn = getConnection();
    if (!conn) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    const tasks = [
      async () => this.setState({ liveStash: (await api.stash(conn)).categories }),
      async () => {
        const notesRes = await api.notes(conn);
        this.setState({ liveNotes: notesRes.notes });
        if (notesRes.notes[0] && !this.state.liveNoteDetails[this.state.openNoteId]) this.selectNote(notesRes.notes[0].id);
        this.refreshDailyReviewDetail(notesRes.notes);
      },
      async () => {
        const { entries } = await api.journalEntries(conn, 30);
        this.setState({ liveJournalEntries: entries });
      },
      async () => this.setState({ liveHealthInsight: await api.healthInsight(conn) }),
      async () => {
        const healthRes = await api.healthData(conn, 7);
        this.setState({ liveHealthDays: healthRes.days.length ? healthRes.days : null });
      },
      async () => this.setState({ liveStreaks: await api.streaks(conn) }),
      async () => this.setState({ liveCalendar: (await api.calendarToday(conn)).events }),
      async () => {
        const recipesRes = await api.recipes(conn);
        this.setState({ liveRecipes: recipesRes.recipes.length ? recipesRes.recipes : null, liveRecipeProfile: recipesRes.profile || null });
        this.refreshRecipePhotos(recipesRes.recipes);
      },
      async () => this.setState({ liveRotation: await api.rotation(conn) }),
      async () => this.setState({ liveFoodLog: await api.foodLog(conn) }),
      async () => this.setState({ liveShoppingList: await api.shoppingList(conn) }),
      async () => {
        const exercisesRes = await api.workoutExercises(conn);
        this.setState({ liveWorkoutExercises: exercisesRes.exercises, liveWorkoutMuscleGroups: exercisesRes.muscleGroups, liveWorkoutTrackingTypes: exercisesRes.trackingTypes });
        const routinesRes = await api.workoutRoutines(conn);
        this.setState({ liveWorkoutRoutines: routinesRes.routines, liveWorkoutSchedule: routinesRes.schedule, liveWorkoutWeekdays: routinesRes.weekdays, liveWorkoutProgressions: routinesRes.progressions || {} });
        api.workoutGoals(conn).then(({ goals }) => this.setState({ liveWorkoutGoals: goals })).catch(() => {});
      },
      async () => {
        const graph = await api.graph(conn);
        this.setState({ liveGraph: graph });
        this.gNodes = null; // rebuilt from the fresh graph next time the galaxy renders
      },
      async () => this.setState({ liveInbox: await api.inbox(conn) }),
      async () => this.setState({ liveDispatch: await api.dispatchStatus(conn) }),
      async () => this.setState({ liveCompost: await api.compost(conn) }),
      async () => this.setState({ liveTodoist: await api.todoistStatus(conn) }),
      async () => this.setState({ liveTodos: await api.todos(conn) }),
      async () => this.setState({ liveGuardian: await api.guardian(conn) }),
      async () => this.setState({ liveTts: await api.ttsStatus(conn) }),
      async () => this.setState({ liveMoney: await api.money(conn) }),
      async () => this.setState({ liveProfile: (await api.profile(conn)).profile }),
      async () => this.setState({ liveLearning: await api.learning(conn) }),
      async () => this.setState({ liveDailyReview: await api.dailyReview(conn) }),
    ];
    // Watchdog: per-request timeouts (api.js) make a hung pass near-impossible,
    // but if one ever slips through, the flag self-clears so the NEXT sync can
    // run — one bad pass must never freeze the pipeline forever again.
    const watchdog = setTimeout(() => {
      if (this.refreshInFlight === inFlight) this.refreshInFlight = null;
    }, 120_000);
    const inFlight = (async () => {
      // ONE round-trip via /api/snapshot when the server supports it (the
      // ~25-requests-per-pass sync was latency + battery over Tailscale);
      // any failure falls back to the individual fetches unchanged.
      let okCount = 0;
      let total = tasks.length;
      try {
        const startedAt = Date.now();
        const { slices } = await api.snapshot(conn);
        okCount = this.applySnapshot(slices, startedAt);
      } catch {
        const results = await Promise.allSettled(tasks.map((t) => t()));
        okCount = results.filter((r) => r.status === 'fulfilled').length;
        total = results.length;
      }
      // Honest chip: LIVE requires most slices actually syncing. One lucky
      // fetch out of 24 used to keep the chip green while everything else
      // (calendar included) silently failed.
      if (okCount > total / 2) {
        const now = new Date().toISOString();
        this.setState({ connectionStatus: 'connected', lastSyncAt: now }, () => {
          const slices = {};
          for (const key of CACHED_LIVE_KEYS) slices[key] = this.state[key];
          saveLiveCache(slices);
          this.drainOutbox(); // the backend is answering — flush queued writes
          // a session draft on the server must survive even a localStorage
          // wipe + an offline boot: re-check once per page load on the first
          // successful sync (the boot check fails silently at the gym)
          if (!this.serverDraftChecked && !this.state.workoutSession) {
            this.serverDraftChecked = true;
            api.getSessionDraft(conn).then(({ draft }) => {
              if (!draft?.workoutSession || this.state.workoutSession) return;
              this.setState({
                workoutSession: draft.workoutSession,
                editingSessionId: draft.editingSessionId || null,
                workoutSessionSavedAt: draft.savedAt || null,
              });
              this.toastMsg('Found your unfinished workout on the server — resume from Train or the nudge');
            }).catch(() => { this.serverDraftChecked = false; /* retry next sync */ });
          }
        });
      } else {
        this.setState({ connectionStatus: 'offline' });
      }
    })().finally(() => { clearTimeout(watchdog); if (this.refreshInFlight === inFlight) this.refreshInFlight = null; });
    this.refreshInFlight = inFlight;
    return this.refreshInFlight;
  }
  refreshWorkoutRoutines() {
    const conn = getConnection();
    if (!conn) return Promise.resolve();
    this.loadCarryovers();
    return api.workoutRoutines(conn).then((r) => {
      this.setState({ liveWorkoutRoutines: r.routines, liveWorkoutSchedule: r.schedule, liveWorkoutWeekdays: r.weekdays, liveWorkoutProgressions: r.progressions || {} });
    }).catch(() => {});
  }
  toggleRotationSlot(slot, recipeId) {
    const conn = getConnection();
    if (!conn) return;
    const current = this.state.liveRotation?.slots?.[slot];
    const next = current && current.id === recipeId ? null : recipeId;
    api.setRotationSlot(conn, slot, next).then((rotation) => {
      this.noteLocalWrite('rotation');
      this.setState({ liveRotation: rotation });
    }).catch((e) => this.toastMsg('Rotation update failed: ' + e.message));
  }
  toggleSlotConsumed(slot, consumed) {
    const conn = getConnection();
    if (!conn) return;
    // Optimistic + queued: ticking a meal off is what he does standing in a
    // kitchen with the Mac asleep at home. The tick lands immediately, the
    // write rides the Outbox, and the protein gauge stays honest meanwhile.
    const optimistic = this.state.liveRotation && this.state.liveRotation.slots?.[slot]
      ? { ...this.state.liveRotation, slots: { ...this.state.liveRotation.slots, [slot]: { ...this.state.liveRotation.slots[slot], consumed } } }
      : null;
    api.setRotationConsumed(conn, slot, consumed).then((rotation) => {
      this.noteLocalWrite('rotation');
      this.setState({ liveRotation: rotation });
    }).catch((e) => {
      if (isOfflineError(e)) {
        this.noteLocalWrite('rotation');
        if (optimistic) this.setState({ liveRotation: optimistic });
        this.enqueueOutbox('rotationConsumed', `${consumed ? 'Ate' : 'Un-ate'} ${slot}`, { slot, consumed });
        return;
      }
      this.toastMsg('Could not update: ' + e.message);
    });
  }
  setFoodLogField(field, e) {
    this.setState({ [field]: e.target.value });
  }
  submitFoodLog() {
    const conn = getConnection();
    const name = this.state.foodLogName.trim();
    const macros = { p: Number(this.state.foodLogP) || 0, c: Number(this.state.foodLogC) || 0, f: Number(this.state.foodLogF) || 0, kcal: Number(this.state.foodLogKcal) || 0 };
    if (!conn || !name) return;
    this.setState({ foodLogBusy: true, foodLogError: null });
    api.addFoodLogEntry(conn, { name, macros, source: this.state.foodLogFillSource || 'manual' }).then((day) => {
      this.noteLocalWrite('foodLog');
      this.setState({ liveFoodLog: day, foodLogBusy: false, foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodLogFillSource: null,
        foodScanQuestion: null, foodScanQAPhotos: [], foodScanQANote: '', foodScanAnswer: '' });
      if (this.state.foodHistoryOpen) this.loadFoodHistory();
    }).catch((e) => {
      if (isOfflineError(e)) {
        this.setState({ foodLogBusy: false, foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodLogFillSource: null,
          foodScanQuestion: null, foodScanQAPhotos: [], foodScanQANote: '', foodScanAnswer: '' });
        this.enqueueOutbox('food', name, { name, macros, source: this.state.foodLogFillSource || 'manual' });
        return;
      }
      this.setState({ foodLogBusy: false, foodLogError: e.message });
    });
  }
  deleteFoodLogEntry(id) {
    const conn = getConnection();
    if (!conn) return;
    api.deleteFoodLogEntry(conn, id).then((day) => { this.noteLocalWrite('foodLog'); this.setState({ liveFoodLog: day }); }).catch((e) => this.toastMsg('Could not remove entry: ' + e.message));
  }
  setFoodScanNote(e) {
    this.setState({ foodScanNote: e.target.value });
  }
  // Stage photos for a scan without analyzing yet — several labels, or a label
  // plus a photo of the actual portion, get sent together so the estimate can
  // reconcile them. Downscaled on the way in (upload speed, no accuracy cost).
  addFoodScanPhotos(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = 5 - (this.state.foodScanPhotos || []).length;
    if (room <= 0) { this.toastMsg('Up to 5 photos per scan'); return; }
    Promise.all(files.slice(0, room).map((f) => this.downscaleImageFile(f)))
      .then((urls) => this.setState((s) => ({ foodScanPhotos: [...s.foodScanPhotos, ...urls.filter(Boolean)] })));
    if (files.length > room) this.toastMsg('Up to 5 photos per scan');
  }
  removeFoodScanPhoto(idx) {
    this.setState((s) => ({ foodScanPhotos: s.foodScanPhotos.filter((_, i) => i !== idx) }));
  }
  clearFoodScanPhotos() {
    this.setState({ foodScanPhotos: [] });
  }
  runFoodScan(photosArg, noteArg) {
    const conn = getConnection();
    const photos = photosArg || this.state.foodScanPhotos || [];
    const note = noteArg != null ? noteArg : this.state.foodScanNote.trim();
    if (!conn || !photos.length) return;
    this.setState({ foodScanBusy: true, foodScanError: null, foodScanQuestion: null, foodScanAnswer: '' });
    // 'auto' fuses however many photos there are (labels and/or the food) with the note
    api.startFoodScan(conn, 'auto', photos, note)
      .then(({ jobId }) => {
        this.startPoll('foodScan', () => api.foodScanJob(conn, jobId), {
          intervalMs: 800,
          onReady: (job) => {
            const r = job.result;
            const asks = r.confidence === 'low' && r.question;
            this.setState({
              foodScanBusy: false, foodScanError: null,
              foodScanPhotos: [], foodScanNote: '',
              foodLogFillSource: 'scan', // provenance survives to the log entry
              foodScanQuestion: asks ? r.question : null,
              // keep what produced the question so an answer can re-estimate
              // (answering is optional — the fields below are always saveable)
              foodScanQAPhotos: asks ? photos : [],
              foodScanQANote: asks ? note : '',
              foodLogName: r.name || '',
              foodLogP: r.macros?.p != null ? String(r.macros.p) : '',
              foodLogC: r.macros?.c != null ? String(r.macros.c) : '',
              foodLogF: r.macros?.f != null ? String(r.macros.f) : '',
              foodLogKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
            });
            this.toastMsg(r.confidence === 'low' ? 'Analyzed — rough estimate, check the fields below' : 'Analyzed — check the fields below before saving');
          },
          onError: (msg) => this.setState({ foodScanBusy: false, foodScanError: msg }),
        });
      })
      .catch((e) => this.setState({ foodScanBusy: false, foodScanError: e.message }));
  }
  // Describe it in words — "1 large movie popcorn from Village Cinemas". Same
  // job/preview path as a photo scan; it just fills the fields from words
  // instead of pixels, and nothing is logged until he taps Add.
  describeFoodSearch() {
    const conn = getConnection();
    const text = (this.state.foodDescribeInput || '').trim();
    if (!conn || !text) return;
    this.setState({ foodScanBusy: true, foodScanError: null, foodScanQuestion: null, foodScanAnswer: '' });
    api.describeFood(conn, text)
      .then(({ jobId }) => {
        this.startPoll('foodScan', () => api.foodScanJob(conn, jobId), {
          intervalMs: 900,
          onReady: (job) => {
            const r = job.result;
            const asks = r.confidence === 'low' && r.question;
            this.setState({
              foodScanBusy: false, foodScanError: null, foodDescribeInput: '',
              foodLogFillSource: 'described',
              foodScanQuestion: asks ? r.question : null,
              foodScanQAPhotos: [], foodScanQANote: asks ? text : '',
              foodLogName: r.name || text,
              foodLogP: r.macros?.p != null ? String(r.macros.p) : '',
              foodLogC: r.macros?.c != null ? String(r.macros.c) : '',
              foodLogF: r.macros?.f != null ? String(r.macros.f) : '',
              foodLogKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
            });
            this.toastMsg(asks ? 'Estimated — rough, check the fields below' : 'Estimated — check the fields below before adding');
          },
          onError: (msg) => this.setState({ foodScanBusy: false, foodScanError: msg }),
        });
      })
      .catch((e) => this.setState({ foodScanBusy: false, foodScanError: e.message }));
  }
  // Answer Nova's clarifying question: re-run the SAME photos with the Q&A
  // folded into the note — the scan prompt already honors notes, so accuracy
  // improves with zero server changes. May legitimately ask a follow-up.
  answerFoodScan() {
    const answer = this.state.foodScanAnswer.trim();
    const q = this.state.foodScanQuestion;
    const photos = this.state.foodScanQAPhotos || [];
    if (!answer || !q || !photos.length) return;
    const base = this.state.foodScanQANote ? `${this.state.foodScanQANote}. ` : '';
    this.runFoodScan(photos, `${base}You previously asked: "${q}" — the user's answer: "${answer}". Fold this into the estimate.`);
  }
  dismissFoodScanQuestion() {
    this.setState({ foodScanQuestion: null, foodScanQAPhotos: [], foodScanQANote: '', foodScanAnswer: '' });
  }
  // Cross-day history of off-plan foods, for the "recent foods" list + re-log.
  loadFoodHistory() {
    const conn = getConnection();
    if (!conn) return;
    api.foodHistory(conn).then(({ items }) => this.setState({ liveFoodHistory: items })).catch(() => {});
  }
  toggleFoodHistory() {
    const open = !this.state.foodHistoryOpen;
    this.setState({ foodHistoryOpen: open });
    if (open) this.loadFoodHistory();
  }
  relogFoodItem(item) {
    const conn = getConnection();
    if (!conn) return;
    api.addFoodLogEntry(conn, { name: item.name, macros: item.macros, source: 'history' })
      .then((day) => { this.noteLocalWrite('foodLog'); this.setState({ liveFoodLog: day }); this.toastMsg(`Logged ${item.name} ✓`); this.loadFoodHistory(); })
      .catch((e) => this.toastMsg('Could not log: ' + e.message));
  }
  // Pre-fill the Add Recipe modal from a scanned/logged food so it can be saved
  // to the recipe bank without re-entering anything (macro-only is allowed).
  openAddRecipeFrom({ name, macros }) {
    if (!getConnection()) { this.toastMsg('Connect a backend in Settings first'); return; }
    const num = (n) => (n != null && !Number.isNaN(Number(n)) ? String(Math.round(Number(n))) : '');
    this.setState({
      recipeAddOpen: true, recipeAddName: name || '', recipeAddCategory: 'ROTATION / SWAP MEALS', recipeAddMakes: '',
      recipeAddP: num(macros?.p), recipeAddC: num(macros?.c), recipeAddF: num(macros?.f), recipeAddKcal: num(macros?.kcal), recipeAddKj: '',
      recipeAddIngredients: '', recipeAddMethod: '', recipeAddError: null,
      recipeScanBusy: false, recipeScanError: null, recipeAddPhotoDataUrl: null,
    });
  }
  openBarcodeScanner() {
    if (!getConnection()) { this.toastMsg('Connect a backend in Settings first'); return; }
    this.setState({ barcodeScannerOpen: true, foodScanError: null });
  }
  closeBarcodeScanner() {
    this.setState({ barcodeScannerOpen: false });
  }
  onBarcodeDetected(code) {
    const conn = getConnection();
    if (!conn) { this.setState({ barcodeScannerOpen: false }); this.toastMsg('Connect a backend in Settings first'); return; }
    this.setState({ barcodeScannerOpen: false, foodScanBusy: true, foodScanError: null, foodScanQuestion: null });
    api.lookupBarcode(conn, code).then((r) => {
      this.setState({
        foodScanBusy: false,
        foodLogFillSource: 'barcode',
        foodLogName: r.name || '',
        foodLogP: r.macros?.p != null ? String(r.macros.p) : '',
        foodLogC: r.macros?.c != null ? String(r.macros.c) : '',
        foodLogF: r.macros?.f != null ? String(r.macros.f) : '',
        foodLogKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
      });
      this.toastMsg('Barcode matched — check the fields below before saving');
    }).catch((e) => this.setState({ foodScanBusy: false, foodScanError: e.message }));
  }
  openAddRecipe() {
    if (!getConnection()) { this.toastMsg('Connect a backend in Settings first'); return; }
    this.setState({
      recipeAddOpen: true, recipeAddName: '', recipeAddCategory: 'CORE DAILY MEALS', recipeAddMakes: '',
      recipeAddP: '', recipeAddC: '', recipeAddF: '', recipeAddKcal: '', recipeAddKj: '',
      recipeAddIngredients: '', recipeAddMethod: '', recipeAddError: null,
      recipeScanBusy: false, recipeScanError: null,
      recipeAddPhotoDataUrl: null,
    });
  }
  refreshRecipePhotos(recipes) {
    const conn = getConnection();
    if (!conn) return;
    for (const r of recipes) {
      if (!r.hasPhoto) continue;
      api.recipePhotoBlobUrl(conn, r.id).then((url) => {
        if (!url) return;
        this.setState((s) => {
          const prev = s.liveRecipePhotoUrls[r.id];
          if (prev) URL.revokeObjectURL(prev);
          return { liveRecipePhotoUrls: { ...s.liveRecipePhotoUrls, [r.id]: url } };
        });
      }).catch(() => {});
    }
  }
  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  // Shrink an image to the model's vision sweet spot (≤~1568px long edge) before
  // upload. Claude downscales past this server-side regardless, so there's no
  // accuracy cost — but a multi-MB Instagram screenshot becomes a few hundred KB,
  // and the slow leg (phone → Tailscale) shrinks with it. Falls back to the raw
  // file if anything about canvas encoding fails — a speedup must never cost a scan.
  downscaleImageFile(file, maxEdge = 1568) {
    if (!file || !/^image\//.test(file.type || '')) return this.readFileAsDataUrl(file);
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      const fallback = () => { URL.revokeObjectURL(url); this.readFileAsDataUrl(file).then(resolve, () => resolve('')); };
      img.onload = () => {
        const longEdge = Math.max(img.width, img.height);
        const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
        if (scale === 1) { fallback(); return; } // already small enough — send as-is
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch { fallback(); }
      };
      img.onerror = fallback;
      img.src = url;
    });
  }
  onRecipeAddPhotoFile(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    this.readFileAsDataUrl(file).then((dataUrl) => this.setState({ recipeAddPhotoDataUrl: dataUrl }));
  }
  onRecipePhotoFile(recipeId, fileList) {
    const conn = getConnection();
    const file = fileList && fileList[0];
    if (!conn || !file) return;
    this.setState((s) => ({ recipePhotoUploadBusy: { ...s.recipePhotoUploadBusy, [recipeId]: true } }));
    this.readFileAsDataUrl(file)
      .then((dataUrl) => api.addRecipePhoto(conn, recipeId, dataUrl))
      .then(() => api.recipePhotoBlobUrl(conn, recipeId))
      .then((url) => {
        this.setState((s) => {
          const prev = s.liveRecipePhotoUrls[recipeId];
          if (prev) URL.revokeObjectURL(prev);
          return {
            liveRecipePhotoUrls: { ...s.liveRecipePhotoUrls, [recipeId]: url },
            recipePhotoUploadBusy: { ...s.recipePhotoUploadBusy, [recipeId]: false },
          };
        });
        this.toastMsg('Photo saved ✓');
      })
      .catch((e) => {
        this.setState((s) => ({ recipePhotoUploadBusy: { ...s.recipePhotoUploadBusy, [recipeId]: false } }));
        this.toastMsg('Could not save photo: ' + e.message);
      });
  }
  closeAddRecipe() {
    this.stopPoll('recipeScan');
    this.setState({ recipeAddOpen: false });
  }
  setRecipeAddKj(e) {
    const kj = e.target.value;
    const kjNum = parseFloat(kj);
    // Australian labels often only list kJ — 1 kcal = 4.184 kJ.
    this.setState((s) => ({
      recipeAddKj: kj,
      recipeAddKcal: Number.isNaN(kjNum) ? s.recipeAddKcal : String(Math.round(kjNum / 4.184)),
    }));
  }
  submitAddRecipe() {
    const conn = getConnection();
    if (!conn) return;
    const st = this.state;
    const name = st.recipeAddName.trim();
    const ingredients = st.recipeAddIngredients.split('\n').map((s) => s.trim()).filter(Boolean);
    const method = st.recipeAddMethod.split('\n').map((s) => s.trim()).filter(Boolean);
    const macros = { p: parseFloat(st.recipeAddP), c: parseFloat(st.recipeAddC), f: parseFloat(st.recipeAddF), kcal: parseFloat(st.recipeAddKcal) };
    if (!name || [macros.p, macros.c, macros.f, macros.kcal].some((n) => Number.isNaN(n))) {
      this.setState({ recipeAddError: 'Fill in a name and all four macros.' });
      return;
    }
    this.setState({ recipeAddBusy: true, recipeAddError: null });
    const pendingPhoto = st.recipeAddPhotoDataUrl;
    // No ingredients/method → a macro-only "quick" recipe (e.g. a snack promoted
    // from a scan). Otherwise a full recipe. Both write to the vault collection.
    const macroOnly = !ingredients.length && !method.length;
    const save = macroOnly
      ? api.addQuickRecipe(conn, { name, category: st.recipeAddCategory, makes: st.recipeAddMakes.trim() || undefined, macros })
      : api.addRecipe(conn, { name, category: st.recipeAddCategory, makes: st.recipeAddMakes.trim() || undefined, macros, ingredients, method });
    save
      .then(({ recipe }) => (pendingPhoto ? api.addRecipePhoto(conn, recipe.id, pendingPhoto) : Promise.resolve()))
      .then(() => {
        this.setState({ recipeAddOpen: false, recipeAddBusy: false, recipeAddPhotoDataUrl: null });
        this.toastMsg(`${name} added ✓ — saved to Obsidian too`);
        this.refreshLiveData();
      })
      .catch((e) => {
        if (isOfflineError(e)) {
          this.setState({ recipeAddOpen: false, recipeAddBusy: false, recipeAddPhotoDataUrl: null });
          // the photo can't ride along (storage quota) — the recipe itself queues
          this.enqueueOutbox('recipe', name, { macroOnly, name, category: st.recipeAddCategory, makes: st.recipeAddMakes.trim() || undefined, macros, ingredients, method });
          if (pendingPhoto) this.toastMsg('Recipe queued — re-add the photo once Nova reconnects');
          return;
        }
        this.setState({ recipeAddBusy: false, recipeAddError: e.message });
      });
  }
  onRecipeScanFiles(fileList) {
    const conn = getConnection();
    if (!conn) return;
    const files = Array.from(fileList || []).slice(0, 4);
    if (!files.length) return;
    this.setState({ recipeScanBusy: true, recipeScanError: null });
    Promise.all(files.map((f) => this.downscaleImageFile(f)))
      .then((images) => api.scanRecipe(conn, images.filter(Boolean)))
      .then(({ jobId }) => {
        this.startPoll('recipeScan', () => api.scanRecipeJob(conn, jobId), {
          intervalMs: 800, // OCR-shaped scans finish fast — don't sit on the result for 2s
          onReady: (job) => {
            const r = job.result;
            this.setState({
              recipeScanBusy: false, recipeScanError: null,
              recipeAddName: r.name || '', recipeAddCategory: r.category || 'CORE DAILY MEALS',
              recipeAddMakes: r.makes || '',
              recipeAddP: r.macros?.p != null ? String(r.macros.p) : '',
              recipeAddC: r.macros?.c != null ? String(r.macros.c) : '',
              recipeAddF: r.macros?.f != null ? String(r.macros.f) : '',
              recipeAddKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
              recipeAddKj: '',
              recipeAddIngredients: (r.ingredients || []).join('\n'),
              recipeAddMethod: (r.method || []).join('\n'),
            });
            this.toastMsg('Photo analyzed — check the fields below before saving');
          },
          onError: (msg) => this.setState({ recipeScanBusy: false, recipeScanError: msg }),
        });
      })
      .catch((e) => {
        this.setState({ recipeScanBusy: false, recipeScanError: e.message });
      });
  }
  openRecipe(id, servings = 1) {
    this.withTransition(() => this.setState({
      openRecipeId: id, servings, recipeChat: [], recipeInput: '',
      recipeAltSelected: null, recipeTweakInput: '', recipeTweakBusy: false,
      recipeTweakError: null, recipeTweakPreview: null,
      recipeRemovals: [], recipeRemovalPrompt: false,
      recipeRenameAltId: null, recipeRenameValue: '', recipeRenameError: null,
    }));
  }
  closeRecipe() {
    this.stopPoll('recipeTweak');
    this.withTransition(() => this.setState({ openRecipeId: null, recipeRemovals: [], recipeRemovalPrompt: false, recipeEdit: null, recipeEditError: null }));
  }
  // The ✕-an-ingredient flow: marks collect, one save, a popup asks whether
  // it's today-only or a keepable alternative — then the existing tweak
  // pipeline recomputes macros and the existing save paths commit. The
  // model recalculates; code files; nothing changes until the choice.
  toggleIngredientRemoval(name) {
    this.setState((s) => ({
      recipeRemovals: s.recipeRemovals.includes(name)
        ? s.recipeRemovals.filter((n) => n !== name)
        : [...s.recipeRemovals, name],
    }));
  }
  confirmRemovalSave(mode, slotKey) {
    const conn = getConnection();
    const st = this.state;
    const removals = st.recipeRemovals;
    if (!conn || !st.openRecipeId || !removals.length) return;
    const request = `Remove ${removals.join(', ')}. Keep everything else identical and recompute the macros honestly.`;
    this.setState({ recipeRemovalPrompt: false, recipeTweakBusy: true, recipeTweakError: null, recipeTweakPreview: null });
    api.tweakRecipe(conn, st.openRecipeId, request)
      .then(({ jobId }) => {
        this.startPoll('recipeTweak', () => api.tweakRecipeJob(conn, jobId), {
          intervalMs: 2500,
          onReady: (job) => this.setState({ recipeTweakBusy: false, recipeTweakPreview: job.result, recipeRemovals: [] }, () => {
            this.saveRecipeTweak(mode === 'today' ? slotKey : undefined);
          }),
          onError: (msg) => this.setState({ recipeTweakBusy: false, recipeTweakError: msg }),
        });
      })
      .catch((e) => this.setState({ recipeTweakBusy: false, recipeTweakError: e.message }));
  }
  selectAlternate(altId) {
    // an open edit belongs to the variant it was started from — drop it
    this.setState({ recipeAltSelected: altId, recipeTweakPreview: null, recipeTweakError: null, recipeEdit: null, recipeEditError: null });
  }
  submitRecipeTweak(byVoice = false) {
    const conn = getConnection();
    const st = this.state;
    const request = st.recipeTweakInput.trim();
    if (!conn || !st.openRecipeId || !request) return;
    // If a preview is already on screen this is a REFINEMENT — send it along
    // so "keep the two whole eggs and suggest something else" builds on what
    // he can see rather than silently starting from the stored recipe. It also
    // stays on screen while Nova thinks, so he can see what he's refining.
    const prior = st.recipeTweakPreview || null;
    this.setState({ recipeTweakBusy: true, recipeTweakError: null });
    api.tweakRecipe(conn, st.openRecipeId, request, prior)
      .then(({ jobId }) => {
        this.startPoll('recipeTweak', () => api.tweakRecipeJob(conn, jobId), {
          intervalMs: 2500,
          onReady: (job) => {
            this.setState({ recipeTweakBusy: false, recipeTweakPreview: job.result, recipeTweakInput: '' });
            if (byVoice) this.speakTweak(job.result);
          },
          onError: (msg) => this.setState({ recipeTweakBusy: false, recipeTweakError: msg }),
        });
      })
      .catch((e) => {
        this.setState({ recipeTweakBusy: false, recipeTweakError: e.message });
      });
  }
  // Asked out loud → answered out loud. Reads only what's actually on screen,
  // so the spoken version can never claim something the preview doesn't show.
  speakTweak(result) {
    if (!result) return;
    const m = result.macros || {};
    const macros = [m.p, m.c, m.f, m.kcal].every((n) => typeof n === 'number')
      ? ` ${Math.round(m.p)} protein, ${Math.round(m.c)} carbs, ${Math.round(m.f)} fat, ${Math.round(m.kcal)} calories.`
      : '';
    this.speak(`${result.label}.${macros} Save it, or tell me what else to change.`);
  }

  saveRecipeTweak(useTodaySlot) {
    const conn = getConnection();
    const st = this.state;
    const preview = st.recipeTweakPreview;
    if (!conn || !st.openRecipeId || !preview) return;
    api.addAlternate(conn, st.openRecipeId, preview).then(({ recipe }) => {
      const newAlt = recipe.alternates[recipe.alternates.length - 1] || null;
      this.setState((s) => ({
        liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r))),
        recipeTweakPreview: null,
        recipeAltSelected: newAlt?.id || null,
      }));
      // one-tap "this is what I'm actually eating today"
      if (useTodaySlot && newAlt) {
        this.setRotationVariant(useTodaySlot, newAlt.id);
      } else {
        this.toastMsg('Saved as an alternative ✓');
      }
    }).catch((e) => {
      this.setState({ recipeTweakError: e.message });
    });
  }
  discardRecipeTweak() {
    this.setState({ recipeTweakPreview: null, recipeTweakError: null });
  }
  addToShoppingList(items, source) {
    const conn = getConnection();
    if (!conn || !items.length) return;
    this.toastMsg(`Adding ${items.length} item${items.length > 1 ? 's' : ''} to shopping list…`);
    api.addShoppingItems(conn, items.map((name) => ({ name, source })))
      .then(({ jobId }) => this.pollShoppingAdd(conn, jobId))
      .catch((e) => this.toastMsg('Could not add to shopping list: ' + e.message));
  }
  pollShoppingAdd(conn, jobId) {
    this.startPoll('shoppingAdd', () => api.addShoppingItemsJob(conn, jobId), {
      intervalMs: 2500,
      onReady: (job) => {
        this.noteLocalWrite('shoppingList');
        this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items: job.items }, shoppingAddBusy: false, shoppingAddInput: '' }));
        this.toastMsg('Added to shopping list ✓');
      },
      onError: (msg) => {
        this.setState({ shoppingAddBusy: false, shoppingAddError: msg });
        this.toastMsg('Could not add to shopping list: ' + msg);
      },
    });
  }
  setShoppingAddInput(e) {
    this.setState({ shoppingAddInput: e.target.value });
  }
  submitShoppingAdd() {
    const conn = getConnection();
    const items = this.state.shoppingAddInput.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!conn || !items.length) return;
    this.setState({ shoppingAddBusy: true, shoppingAddError: null });
    api.addShoppingItems(conn, items.map((name) => ({ name, source: null })))
      .then(({ jobId }) => this.pollShoppingAdd(conn, jobId))
      .catch((e) => {
        if (isOfflineError(e)) {
          this.setState({ shoppingAddBusy: false, shoppingAddInput: '' });
          this.enqueueOutbox('shopping', items[0] + (items.length > 1 ? ` +${items.length - 1}` : ''), { items: items.map((name) => ({ name, source: null })) });
          return;
        }
        this.setState({ shoppingAddBusy: false, shoppingAddError: e.message });
      });
  }
  toggleShoppingItem(id, checked) {
    const conn = getConnection();
    if (!conn) return;
    this.setState((s) => ({
      liveShoppingList: (this.noteLocalWrite('shoppingList'), { ...s.liveShoppingList, items: s.liveShoppingList.items.map((i) => (i.id === id ? { ...i, checked } : i)) }),
    }));
    api.toggleShoppingItem(conn, id, checked).then(({ items }) => {
      this.noteLocalWrite('shoppingList');
      this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items } }));
    }).catch((e) => this.toastMsg('Could not update item: ' + e.message));
  }
  confirmShoppingCompletion() {
    const conn = getConnection();
    if (!conn) return;
    api.confirmShoppingCompletion(conn).then(({ items }) => {
      this.noteLocalWrite('shoppingList');
      this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items } }));
      this.toastMsg('Shopping list updated ✓');
    }).catch((e) => this.toastMsg('Could not confirm completion: ' + e.message));
  }

  // ---------- workouts (Train) ----------
  currentRoutine() {
    const st = this.state;
    return (st.liveWorkoutRoutines || []).find((r) => r.id === st.openRoutineId) || null;
  }
  startCreateRoutine() {
    this.setState({ routineCreating: true, routineNewName: '' });
  }
  cancelCreateRoutine() {
    this.setState({ routineCreating: false, routineNewName: '' });
  }
  setRoutineNewName(e) {
    this.setState({ routineNewName: e.target.value });
  }
  submitCreateRoutine() {
    const conn = getConnection();
    const name = this.state.routineNewName.trim();
    if (!conn || !name) return;
    api.createWorkoutRoutine(conn, name, []).then(({ routine }) => {
      this.setState({ routineCreating: false, routineNewName: '' });
      this.refreshWorkoutRoutines().then(() => this.setState({ workoutsView: 'routine', openRoutineId: routine.id }));
    }).catch((e) => this.toastMsg('Could not create routine: ' + e.message));
  }
  openRoutine(id) {
    this.withTransition(() => this.setState({ workoutsView: 'routine', openRoutineId: id, routineDeleteConfirm: false, exercisePickerOpen: false }));
  }
  backToRoutines() {
    this.setState({ workoutsView: 'routines', openRoutineId: null, routineDeleteConfirm: false, exercisePickerOpen: false });
  }
  requestDeleteRoutine() {
    this.setState({ routineDeleteConfirm: true });
  }
  cancelDeleteRoutine() {
    this.setState({ routineDeleteConfirm: false });
  }
  confirmDeleteRoutine(id) {
    const conn = getConnection();
    if (!conn) return;
    api.deleteWorkoutRoutine(conn, id).then(() => {
      this.setState({ workoutsView: 'routines', openRoutineId: null, routineDeleteConfirm: false });
      this.refreshWorkoutRoutines();
      this.toastMsg('Routine deleted');
    }).catch((e) => this.toastMsg('Could not delete routine: ' + e.message));
  }
  updateRoutineExercises(entries) {
    const conn = getConnection();
    const routine = this.currentRoutine();
    if (!conn || !routine) return;
    api.updateWorkoutRoutine(conn, routine.id, { exercises: entries }).then(() => {
      this.refreshWorkoutRoutines();
    }).catch((e) => this.toastMsg('Could not update routine: ' + e.message));
  }
  routineEntriesFrom(routine) {
    return routine.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh }));
  }
  addExerciseToRoutine(exerciseId) {
    const routine = this.currentRoutine();
    if (!routine) return;
    const entries = [...this.routineEntriesFrom(routine), { exerciseId, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 }];
    this.updateRoutineExercises(entries);
    this.setState({ exercisePickerOpen: false, exercisePickerQuery: '' });
  }
  removeExerciseFromRoutine(exerciseId) {
    const routine = this.currentRoutine();
    if (!routine) return;
    const entries = this.routineEntriesFrom(routine).filter((e) => e.exerciseId !== exerciseId);
    this.updateRoutineExercises(entries);
  }
  moveExerciseInRoutine(exerciseId, dir) {
    const routine = this.currentRoutine();
    if (!routine) return;
    const entries = this.routineEntriesFrom(routine);
    const idx = entries.findIndex((e) => e.exerciseId === exerciseId);
    const swapWith = idx + dir;
    if (idx === -1 || swapWith < 0 || swapWith >= entries.length) return;
    [entries[idx], entries[swapWith]] = [entries[swapWith], entries[idx]];
    this.updateRoutineExercises(entries);
  }
  setExerciseTarget(exerciseId, field, value) {
    const routine = this.currentRoutine();
    if (!routine) return;
    const entries = this.routineEntriesFrom(routine);
    const idx = entries.findIndex((e) => e.exerciseId === exerciseId);
    if (idx === -1) return;
    const n = Math.max(1, Math.round(Number(value)) || 1);
    entries[idx] = { ...entries[idx], [field]: n };
    this.updateRoutineExercises(entries);
  }
  openExercisePicker() {
    this.setState({ exercisePickerOpen: true, exercisePickerQuery: '', exercisePickerMuscle: 'Any', exercisePickerCreateMuscle: '', exercisePickerCreateTrackingType: 'weight_reps' });
  }
  closeExercisePicker() {
    this.setState({ exercisePickerOpen: false });
  }
  setExercisePickerQuery(e) {
    this.setState({ exercisePickerQuery: e.target.value });
  }
  setExercisePickerMuscle(m) {
    this.setState({ exercisePickerMuscle: m });
  }
  setExercisePickerCreateMuscle(m) {
    this.setState({ exercisePickerCreateMuscle: m });
  }
  setExercisePickerCreateTrackingType(t) {
    this.setState({ exercisePickerCreateTrackingType: t });
  }
  createAndAddExercise(name, muscleGroup, trackingType) {
    const conn = getConnection();
    if (!conn || !name.trim() || !muscleGroup) return;
    api.addWorkoutExercise(conn, name.trim(), muscleGroup, trackingType).then(({ exercise }) => {
      this.setState((s) => ({ liveWorkoutExercises: [...(s.liveWorkoutExercises || []), exercise] }));
      this.addExerciseToRoutine(exercise.id);
    }).catch((e) => this.toastMsg('Could not add exercise: ' + e.message));
  }
  assignScheduleDay(day, routineId) {
    const conn = getConnection();
    if (!conn) return;
    api.setWorkoutScheduleDay(conn, day, routineId || null).then(({ schedule }) => {
      this.setState({ liveWorkoutSchedule: schedule });
    }).catch((e) => this.toastMsg('Could not update schedule: ' + e.message));
  }
  startWorkoutSession(routine) {
    const progressions = this.state.liveWorkoutProgressions || {};
    const exercises = routine.exercises.map((e) => {
      let sets = e.lastSets && e.lastSets.length
        ? e.lastSets.map((s) => ({ weight: s.weight, reps: s.reps, done: false }))
        : Array.from({ length: e.targetSets }, () => ({ weight: 0, reps: e.targetRepsLow, done: false }));
      // Coach progression: earned suggestions nudge the PREFILL only — what
      // gets logged is whatever actually happens on the floor.
      const coach = progressions[`${routine.id}:${e.exerciseId}`] || null;
      if (coach) {
        sets = sets.map((s) => coach.kind === 'weight'
          ? { ...s, weight: Math.round((Number(s.weight) + coach.delta) * 10) / 10 }
          : { ...s, reps: Number(s.reps) + coach.delta });
      }
      return { exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh, coach, sets };
    });
    this.withTransition(() => this.setState({ workoutsView: 'session', workoutSession: { routineId: routine.id, routineName: routine.name, exercises }, sessionCancelConfirm: false }));
  }
  updateSessionSet(exIdx, setIdx, field, value) {
    this.setState((s) => ({
      workoutSession: {
        ...s.workoutSession,
        exercises: s.workoutSession.exercises.map((e, i) => i !== exIdx ? e : {
          ...e, sets: e.sets.map((set, j) => j !== setIdx ? set : { ...set, [field]: value }),
        }),
      },
    }));
  }
  toggleSessionSetDone(exIdx, setIdx) {
    this.setState((s) => ({
      workoutSession: {
        ...s.workoutSession,
        exercises: s.workoutSession.exercises.map((e, i) => i !== exIdx ? e : {
          ...e, sets: e.sets.map((set, j) => j !== setIdx ? set : { ...set, done: !set.done }),
        }),
      },
    }));
  }
  addSessionSet(exIdx) {
    this.setState((s) => ({
      workoutSession: {
        ...s.workoutSession,
        exercises: s.workoutSession.exercises.map((e, i) => {
          if (i !== exIdx) return e;
          const last = e.sets[e.sets.length - 1];
          return { ...e, sets: [...e.sets, { weight: last ? last.weight : 0, reps: last ? last.reps : e.targetRepsLow, done: false }] };
        }),
      },
    }));
  }
  removeSessionSet(exIdx, setIdx) {
    this.setState((s) => ({
      workoutSession: {
        ...s.workoutSession,
        exercises: s.workoutSession.exercises.map((e, i) => i !== exIdx ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIdx) }),
      },
    }));
  }
  // Drop an exercise from THIS session only — the program is untouched, and
  // it's reversible until the session is saved. Unticked sets already leave
  // no trace in history; this just gets it off the screen mid-workout when
  // he swaps in something else or cuts it short.
  toggleSessionExerciseSkipped(exIdx) {
    this.setState((s) => ({
      workoutSession: {
        ...s.workoutSession,
        exercises: s.workoutSession.exercises.map((e, i) => (i !== exIdx ? e : { ...e, skipped: !e.skipped })),
      },
    }));
  }
  requestCancelSession() {
    this.setState({ sessionCancelConfirm: true });
  }
  cancelSessionCancel() {
    this.setState({ sessionCancelConfirm: false });
  }
  discardWorkoutSession() {
    const routineId = this.state.workoutSession?.routineId;
    // abandoning a history edit returns to history untouched
    if (this.state.editingSessionId) {
      this.setState({ workoutsView: 'history', workoutSession: null, editingSessionId: null, sessionCancelConfirm: false });
      return;
    }
    this.setState({ workoutsView: 'routine', openRoutineId: routineId, workoutSession: null, sessionCancelConfirm: false });
  }
  finishWorkoutSession() {
    const conn = getConnection();
    const session = this.state.workoutSession;
    if (!conn || !session) return;
    // Only ticked sets are history — an exercise with nothing ticked was
    // skipped and must not appear in the record at all.
    const exercises = session.exercises
      .filter((e) => !e.skipped) // dropped for today — never enters history
      .map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        sets: e.sets.filter((s) => s.done).map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, rpe: s.rpe ? Number(s.rpe) : undefined, done: true })),
      }))
      .filter((e) => e.sets.length);
    if (!exercises.length) {
      this.toastMsg('Nothing ticked yet — tick the sets you actually did, then finish');
      return;
    }
    if (this.state.editingSessionId) {
      api.updateWorkoutSession(conn, this.state.editingSessionId, { exercises }).then(() => {
        this.setState({ workoutsView: 'history', workoutSession: null, editingSessionId: null, sessionCancelConfirm: false });
        this.openWorkoutHistory(this.state.historyRoutineId);
        this.refreshWorkoutRoutines();
        this.toastMsg('Session updated ✓');
      }).catch((e) => this.toastMsg('Could not update session: ' + e.message));
      return;
    }
    // exercises with nothing ticked are "missed" — offer to push them to a day
    const missed = session.exercises
      .filter((e) => !e.sets.some((s) => s.done))
      .map((e) => ({ exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh }));
    const carryoverId = session.carryoverId || null;
    const payload = { routineId: session.routineId, routineName: session.routineName, exercises };
    api.completeWorkoutSession(conn, payload).then(() => {
      // finishing a makeup session consumes its carry-over
      if (carryoverId) api.removeCarryover(conn, carryoverId).then(() => this.loadCarryovers()).catch(() => {});
      const t = new Date(); t.setDate(t.getDate() + 1);
      const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      this.setState({
        workoutsView: 'routines', openRoutineId: null, workoutSession: null, sessionCancelConfirm: false,
        finishMissed: missed.length ? missed : null,
        finishMissedDate: tomorrow,
        finishMissedRoutine: session.routineName,
      });
      this.refreshWorkoutRoutines();
      this.toastMsg(missed.length ? `Saved ✓ — ${missed.length} exercise${missed.length === 1 ? '' : 's'} not done; push ${missed.length === 1 ? 'it' : 'them'} to a day below` : 'Workout saved ✓');
    }).catch((e) => {
      if (isOfflineError(e)) {
        // the finished session lives in the persisted outbox now — safe to
        // close the active-session UI; it files the moment Nova reconnects.
        // (The missed-exercise push-forward needs the server, so it's skipped
        // for an offline finish — the record itself loses nothing.)
        this.setState({ workoutsView: 'routines', openRoutineId: null, workoutSession: null, sessionCancelConfirm: false });
        this.enqueueOutbox('session', `${session.routineName} session`, { payload, carryoverId });
        return;
      }
      this.toastMsg('Could not save workout: ' + e.message);
    });
  }
  // Park an in-progress session without finalizing it — stays fully
  // resumable (it's already mirrored to device storage) via the RESUME card.
  saveWorkoutForLater() {
    if (!this.state.workoutSession) return;
    this.setState({ workoutsView: 'routines', openRoutineId: null, sessionCancelConfirm: false });
    this.toastMsg('Progress saved — resume it any time from the card up top');
  }
  resumeWorkoutSession() {
    if (this.state.workoutSession) this.setState({ workoutsView: 'session' });
  }
  loadCarryovers() {
    const conn = getConnection();
    if (!conn) return;
    api.workoutCarryovers(conn).then(({ carryovers }) => this.setState({ liveCarryovers: carryovers })).catch(() => {});
  }
  pushMissedToDay() {
    const conn = getConnection();
    if (!conn || !this.state.finishMissed) return;
    api.addCarryover(conn, { forDate: this.state.finishMissedDate, sourceRoutineName: this.state.finishMissedRoutine, exercises: this.state.finishMissed })
      .then(() => { const d = this.state.finishMissedDate; this.setState({ finishMissed: null }); this.loadCarryovers(); this.toastMsg(`Pushed to ${d} — it's waiting on Train`); })
      .catch((e) => this.toastMsg('Could not push: ' + e.message));
  }
  dismissFinishMissed() { this.setState({ finishMissed: null }); }
  setFinishMissedDate(date) { this.setState({ finishMissedDate: date }); }
  startCarryoverSession(carryover) {
    const routines = this.state.liveWorkoutRoutines || [];
    const lastSetsFor = (exId) => {
      for (const r of routines) { const e = r.exercises.find((x) => x.exerciseId === exId); if (e?.lastSets?.length) return e.lastSets; }
      return null;
    };
    const exercises = carryover.exercises.map((e) => {
      const last = lastSetsFor(e.exerciseId);
      const sets = last && last.length
        ? last.map((s) => ({ weight: s.weight, reps: s.reps, done: false }))
        : Array.from({ length: e.targetSets }, () => ({ weight: 0, reps: e.targetRepsLow || 0, done: false }));
      return { exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh, coach: null, sets };
    });
    this.setState({ workoutsView: 'session', editingSessionId: null, workoutSession: { routineId: 'carryover', routineName: `${carryover.sourceRoutineName} — makeup`, carryoverId: carryover.id, exercises }, sessionCancelConfirm: false });
  }
  rescheduleCarryoverTo(id, forDate) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ carryoverRescheduleId: null });
    api.rescheduleCarryover(conn, id, forDate).then(() => { this.loadCarryovers(); this.toastMsg(`Moved to ${forDate}`); })
      .catch((e) => this.toastMsg('Could not reschedule: ' + e.message));
  }
  removeCarryoverItem(id) {
    const conn = getConnection();
    if (!conn) return;
    api.removeCarryover(conn, id).then(() => { this.loadCarryovers(); this.toastMsg('Carry-over cleared'); })
      .catch((e) => this.toastMsg('Could not clear: ' + e.message));
  }
  editHistorySession(session) {
    // Load a past session into the editor: every recorded set arrives
    // ticked (it happened); untick to remove it from the record on save.
    const exercises = session.exercises.map((e) => ({
      exerciseId: e.exerciseId, name: e.name,
      muscleGroup: e.muscleGroup || '', trackingType: e.trackingType || 'weight_reps',
      targetSets: e.sets.length, targetRepsLow: 0, targetRepsHigh: 0, coach: null,
      sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps, done: true })),
    }));
    this.setState({
      workoutsView: 'session', editingSessionId: session.id,
      workoutSession: { routineId: session.routineId, routineName: session.routineName, exercises },
      sessionCancelConfirm: false,
    });
  }
  deleteHistorySession(sessionId) {
    const conn = getConnection();
    if (!conn) return;
    api.deleteWorkoutSession(conn, sessionId).then(() => {
      this.openWorkoutHistory(this.state.historyRoutineId);
      this.refreshWorkoutRoutines();
      this.toastMsg('Session deleted — exercise prefills recomputed');
    }).catch((e) => this.toastMsg('Could not delete: ' + e.message));
  }
  openWorkoutHistory(routineId) {
    const conn = getConnection();
    this.setState({ workoutsView: 'history', historyRoutineId: routineId || null, liveWorkoutHistory: null });
    if (!conn) return;
    // no routineId → ALL sessions, which is the only way impromptu ('impromptu')
    // and makeup ('carryover') sessions are visible/editable at all
    api.workoutSessions(conn, routineId ? { routineId } : undefined)
      .then(({ sessions }) => this.setState({ liveWorkoutHistory: sessions }))
      .catch(() => this.setState({ liveWorkoutHistory: [] }));
  }
  backFromWorkoutHistory() {
    this.setState({ workoutsView: this.state.historyRoutineId ? 'routine' : 'routines' });
  }
  selectNote(id) {
    // note card → reader morphs like a recipe card → its detail
    this.withTransition(() => this.setState({ openNoteId: id }));
    this.ensureNoteDetail(id);
  }
  ensureNoteDetail(id) {
    // a stored error sentinel counts as "not loaded" so re-selecting retries
    if (!id || (this.state.liveNoteDetails[id] && !this.state.liveNoteDetails[id].error)) return;
    const conn = getConnection();
    if (!conn) return;
    api.noteDetail(conn, id).then((detail) => {
      this.setState((s) => ({ liveNoteDetails: { ...s.liveNoteDetails, [id]: detail } }));
    }).catch(() => {
      // an error sentinel — the silent catch left the pane on "Loading…" forever
      this.setState((s) => ({ liveNoteDetails: { ...s.liveNoteDetails, [id]: { error: true } } }));
    });
  }
  ensureReviewSummary(pageId) {
    const conn = getConnection();
    if (!conn || !pageId || this.state.liveReviewSummaries[pageId] !== undefined) return;
    this.setState((s) => ({ liveReviewSummaries: { ...s.liveReviewSummaries, [pageId]: null } })); // null = loading
    api.startNoteSummary(conn, pageId).then((res) => {
      if (res.summary) {
        this.setState((s) => ({ liveReviewSummaries: { ...s.liveReviewSummaries, [pageId]: res.summary } }));
      } else if (res.jobId) {
        this.pollReviewSummary(pageId, res.jobId);
      }
    }).catch(() => this.setState((s) => ({ liveReviewSummaries: { ...s.liveReviewSummaries, [pageId]: '' } })));
  }
  pollReviewSummary(pageId, jobId) {
    const conn = getConnection();
    if (!conn) return;
    this.startPoll(`summary:${pageId}`, () => api.noteSummaryJob(conn, jobId), {
      intervalMs: 1200,
      onReady: (job) => this.setState((s) => ({ liveReviewSummaries: { ...s.liveReviewSummaries, [pageId]: job.result.summary } })),
      // '' = failed, the UI falls back to the page title
      onError: () => this.setState((s) => ({ liveReviewSummaries: { ...s.liveReviewSummaries, [pageId]: '' } })),
    });
  }
  // Deterministic "concept of the day" — hashes today's date into the pool of
  // concept/topic pages so it's stable across reloads within a day but
  // changes daily, without needing a dedicated backend endpoint (the pool
  // comes straight from the already-fetched notes list).
  dailyReviewPool(liveNotes) {
    // Sorted by title so the pick matches the server-side Morning Dispatch
    // pool regardless of fetch ordering.
    return (liveNotes || [])
      .filter((n) => n.type === 'concept' || n.type === 'topic')
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  dailyReviewIndex(pool) {
    if (!pool.length) return 0;
    const dateStr = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) | 0;
    return Math.abs(h) % pool.length;
  }
  refreshDailyReviewDetail(liveNotes) {
    const pool = this.dailyReviewPool(liveNotes);
    const idx = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    const page = pool[idx];
    if (page) { this.ensureNoteDetail(page.id); this.ensureReviewSummary(page.id); }
  }
  shuffleDailyReview() {
    const pool = this.dailyReviewPool(this.state.liveNotes);
    if (pool.length < 2) return;
    const current = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    let next = current;
    while (next === current) next = Math.floor(Math.random() * pool.length);
    this.setState({ reviewShuffleIdx: next, reviewReflectOpen: false, reviewReflectText: '', reviewReflectPromptText: null });
    this.ensureNoteDetail(pool[next].id);
    this.ensureReviewSummary(pool[next].id);
  }
  openDailyReview() {
    const pool = this.dailyReviewPool(this.state.liveNotes);
    const idx = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    const page = pool[idx];
    if (page) this.selectNote(page.id);
    this.navigate('notes');
  }
  toggleReviewReflect() {
    this.setState((s) => ({ reviewReflectOpen: !s.reviewReflectOpen, reviewReflectText: '', reviewReflectError: null, reviewReflectPromptText: null }));
  }
  setReviewReflectText(e) {
    this.setState({ reviewReflectText: e.target.value });
  }
  generateReviewReflectPrompt() {
    const conn = getConnection();
    const pool = this.dailyReviewPool(this.state.liveNotes);
    const idx = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    const page = pool[idx];
    if (!conn || !page) return;
    const detail = this.state.liveNoteDetails[page.id];
    this.setState({ reviewReflectPromptBusy: true });
    api.startJournalPrompt(conn, page.title, detail?.paragraphs?.[0] || '').then(({ jobId }) => {
      this.startPoll('reviewPrompt', () => api.journalPromptJob(conn, jobId), {
        onReady: (job) => this.setState({ reviewReflectPromptBusy: false, reviewReflectPromptText: job.result.prompt }),
        onError: (msg) => {
          this.setState({ reviewReflectPromptBusy: false });
          this.toastMsg('Could not generate a prompt: ' + msg);
        },
      });
    }).catch((e) => {
      this.setState({ reviewReflectPromptBusy: false });
      this.toastMsg('Could not generate a prompt: ' + e.message);
    });
  }
  saveReviewReflection() {
    const conn = getConnection();
    const text = this.state.reviewReflectText.trim();
    const pool = this.dailyReviewPool(this.state.liveNotes);
    const idx = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    const page = pool[idx];
    if (!conn || !text || !page) return;
    this.setState({ reviewReflectBusy: true });
    api.addJournalEntry(conn, text, page.title).then(() => {
      this.setState({ reviewReflectBusy: false, reviewReflectOpen: false, reviewReflectText: '', reviewReflectPromptText: null });
      this.toastMsg('Reflection saved to your journal ✓');
      this.refreshJournalEntries();
    }).catch((e) => {
      this.setState({ reviewReflectBusy: false });
      this.toastMsg('Could not save reflection: ' + e.message);
    });
  }
  refreshJournalEntries() {
    const conn = getConnection();
    if (!conn) return;
    api.journalEntries(conn, 30).then(({ entries }) => this.setState({ liveJournalEntries: entries })).catch(() => {});
  }
  setJournalComposerText(e) {
    this.setState({ journalComposerText: e.target.value });
  }
  generateJournalPrompt() {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ journalPromptBusy: true });
    api.startJournalPrompt(conn, null, null).then(({ jobId }) => {
      this.startPoll('journalPrompt', () => api.journalPromptJob(conn, jobId), {
        onReady: (job) => this.setState({ journalPromptBusy: false, journalPromptText: job.result.prompt }),
        onError: (msg) => {
          this.setState({ journalPromptBusy: false });
          this.toastMsg('Could not generate a prompt: ' + msg);
        },
      });
    }).catch((e) => {
      this.setState({ journalPromptBusy: false });
      this.toastMsg('Could not generate a prompt: ' + e.message);
    });
  }
  submitJournalEntry() {
    const conn = getConnection();
    const text = this.state.journalComposerText.trim();
    if (!conn || !text) return;
    this.setState({ journalSaveBusy: true, journalSaveError: null });
    api.addJournalEntry(conn, text).then(() => {
      this.setState({ journalSaveBusy: false, journalComposerText: '', journalPromptText: null });
      this.toastMsg('Journal entry saved ✓');
      this.refreshJournalEntries();
    }).catch((e) => {
      if (isOfflineError(e)) {
        this.setState({ journalSaveBusy: false, journalComposerText: '', journalPromptText: null });
        this.enqueueOutbox('journal', text.slice(0, 44), { text });
        return;
      }
      this.setState({ journalSaveBusy: false, journalSaveError: e.message });
    });
  }
  toggleJournalDay(date) {
    this.setState((s) => ({ journalOpenDate: s.journalOpenDate === date ? null : date }));
  }
  async testSettingsConnection() {
    this.setState({ settingsTestStatus: 'testing', settingsTestMessage: 'Testing…' });
    try {
      const { noteCount } = await testConnection(this.state.settingsBaseUrl, this.state.settingsToken);
      this.setState({ settingsTestStatus: 'ok', settingsTestMessage: `Connected — ${noteCount} notes found.` });
    } catch (e) {
      this.setState({ settingsTestStatus: 'error', settingsTestMessage: e.message || 'Connection failed.' });
    }
  }
  saveSettingsConnection() {
    const { settingsBaseUrl, settingsToken } = this.state;
    if (!settingsBaseUrl || !settingsToken) { this.toastMsg('Enter a backend URL and token first'); return; }
    setConnection({ baseUrl: settingsBaseUrl, token: settingsToken });
    // scripted demo conversations must not linger inside a now-live session
    this.setState({ connectionStatus: 'connecting', coachChat: [], voiceChat: [], recipeChat: [] });
    this.toastMsg('Saved — loading your real vault…');
    this.refreshLiveData();
  }
  disconnectSettings() {
    setConnection(null);
    clearLiveCache();
    const cleared = {};
    for (const key of CACHED_LIVE_KEYS) cleared[key] = null;
    this.setState({
      ...cleared,
      connectionStatus: 'demo', lastSyncAt: null,
      settingsBaseUrl: '', settingsToken: '', settingsTestStatus: 'idle', settingsTestMessage: '',
      liveNoteDetails: {}, liveReviewSummaries: {}, liveRecipePhotoUrls: {},
      rotationShowExtra: false, recipeAddOpen: false, openNoteId: 'n1',
      // workoutSession deliberately NOT cleared: nulling it here made the
      // mirror delete the draft — a reconnect cycle (the PWA's occasional
      // "shows demo data, re-enter the token" glitch) silently destroyed an
      // in-progress workout. A draft survives disconnects.
      workoutsView: 'routines', openRoutineId: null, liveWorkoutHistory: null,
    });
    this.gNodes = null; // rebuild the galaxy from mock data
    this.toastMsg('Disconnected — back to demo data (your workout draft is kept)');
  }

  // ---------- transcript ingest ----------
  openIngestModal() {
    if (!getConnection()) { this.toastMsg('Connect a backend in Settings first'); return; }
    this.setState({ ingestModalOpen: true, ingestText: '', ingestSourceUrl: '' });
  }
  closeIngestModal() {
    this.setState({ ingestModalOpen: false });
  }
  onIngestFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.setState({ ingestText: String(reader.result || '') });
    reader.readAsText(file);
  }
  submitIngest() {
    const conn = getConnection();
    const text = this.state.ingestText.trim();
    const sourceUrl = this.state.ingestSourceUrl.trim();
    if (!conn || !text) return;
    this.setState({ ingestModalOpen: false, ingestJobId: null, ingestStatus: 'staging', ingestPreview: null, ingestError: null });
    api.startIngest(conn, text, sourceUrl || undefined).then(({ jobId }) => {
      this.setState({ ingestJobId: jobId });
      this.startPoll('ingest', () => api.ingestJob(conn, jobId), {
        intervalMs: 3000,
        timeoutMs: 15 * 60_000, // long transcripts can legitimately take a while
        onReady: (job) => this.setState({ ingestStatus: 'ready', ingestPreview: { summary: job.summary, cost: job.cost, changes: job.changes } }),
        onError: (msg) => this.setState({ ingestStatus: 'error', ingestError: msg }),
        onProgress: (job) => this.setState({ ingestStatus: job.status }),
      });
    }).catch((e) => {
      this.setState({ ingestStatus: 'error', ingestError: e.message });
    });
  }
  closeIngestReview() {
    if (this.state.ingestStatus === 'ready') { this.discardIngest(); return; }
    this.stopPoll('ingest');
    this.setState({ ingestStatus: 'idle', ingestJobId: null, ingestPreview: null, ingestError: null });
  }
  approveIngest() {
    const conn = getConnection();
    const jobId = this.state.ingestJobId;
    if (!conn || !jobId) return;
    this.setState({ ingestStatus: 'applying' });
    api.approveIngest(conn, jobId).then(() => {
      this.setState({ ingestStatus: 'idle', ingestJobId: null, ingestPreview: null });
      this.toastMsg('Written to your vault ✓');
      this.refreshLiveData();
    }).catch((e) => {
      this.setState({ ingestStatus: 'ready' });
      this.toastMsg('Approve failed: ' + e.message);
    });
  }
  discardIngest() {
    const conn = getConnection();
    const jobId = this.state.ingestJobId;
    this.setState({ ingestStatus: 'idle', ingestJobId: null, ingestPreview: null, ingestError: null });
    if (conn && jobId) api.discardIngest(conn, jobId).catch(() => {});
    this.toastMsg('Discarded — nothing was written');
  }

  // ---------- nova inbox (capture → classify → file) ----------
  refreshInbox() {
    const conn = getConnection();
    if (!conn) return Promise.resolve();
    // approvals can file to-dos — keep the To-Do tab in step with the queue
    api.todos(conn).then((data) => this.setState({ liveTodos: data })).catch(() => {});
    return api.inbox(conn).then((data) => {
      this.setState({ liveInbox: data });
      this.updateAppBadge(data);
    }).catch(() => {});
  }
  // pending approvals on the app icon (Badging API — installed PWAs)
  updateAppBadge(inbox) {
    try {
      const count = (inbox?.items || []).filter((r) => r.status === 'pending').length;
      if (!('setAppBadge' in navigator)) return;
      if (count > 0) navigator.setAppBadge(count).catch(() => {});
      else navigator.clearAppBadge().catch(() => {});
    } catch { /* unsupported */ }
  }
  // Recall — vault search behind the palette, debounced so typing stays smooth
  queueRecall(query) {
    clearTimeout(this.recallT);
    const q = (query || '').trim();
    const conn = getConnection();
    if (!conn || q.length < 3) {
      if (this.state.recallResults.length) this.setState({ recallResults: [] });
      return;
    }
    this.recallT = setTimeout(() => {
      api.recall(conn, q).then(({ results }) => {
        if (this.state.paletteQuery.trim() === q) this.setState({ recallResults: results });
      }).catch(() => {});
    }, 250);
  }
  advanceIdeaStatus(id, current) {
    const conn = getConnection();
    if (!conn) return;
    const STATUSES = ['seed', 'outlining', 'scripting', 'shipped'];
    const next = STATUSES[(STATUSES.indexOf(current) + 1) % STATUSES.length];
    api.studioSetStatus(conn, id, next).then(() => {
      this.toastMsg(`Idea moved to ${next.toUpperCase()}`);
      this.refreshNoteDetail(id);
    }).catch((e) => this.toastMsg(e.message));
  }
  refreshNoteDetail(id) {
    const conn = getConnection();
    if (!conn) return;
    api.noteDetail(conn, id).then((detail) => {
      this.setState((s) => ({ liveNoteDetails: { ...s.liveNoteDetails, [id]: detail } }));
    }).catch(() => {});
  }
  draftIdeaOutline(id) {
    const conn = getConnection();
    if (!conn || this.state.studioOutlineBusy) return;
    this.setState({ studioOutlineBusy: true });
    api.studioOutline(conn, id).then(() => {
      this.setState({ studioOutlineBusy: false });
      this.toastMsg('Studio is drafting — the outline lands in the Inbox for review');
      this.refreshInbox();
    }).catch((e) => {
      this.setState({ studioOutlineBusy: false });
      this.toastMsg('Outline failed to start: ' + e.message);
    });
  }
  answerFollowupDone(label, time, key) {
    const conn = getConnection();
    if (!conn) return;
    this.dismissInboxProposal(key);
    api.followupDone(conn, label, time).then(() => {
      this.toastMsg(`Logged ✓ ${label} — journaled (undoable in history)`);
      this.refreshInbox();
    }).catch((e) => this.toastMsg('Could not log it: ' + e.message));
  }
  moveFollowupToTodo(label, key) {
    const conn = getConnection();
    if (!conn) return;
    this.dismissInboxProposal(key);
    api.todoAdd(conn, label).then((data) => {
      this.setState({ liveTodos: data });
      this.toastMsg(`"${label}" moved to the To-Do list`);
    }).catch((e) => this.toastMsg(e.message));
  }
  startResearch(question) {
    const conn = getConnection();
    const q = (question || '').trim();
    if (!conn || !q) return;
    api.research(conn, q).then(() => {
      this.toastMsg('Researcher dispatched — the brief lands in the Inbox for review');
      this.refreshInbox();
    }).catch((e) => this.toastMsg('Research failed to start: ' + e.message));
  }
  setDailyReviewConfig(patch) {
    const conn = getConnection();
    if (!conn) return;
    api.dailyReviewConfig(conn, patch).then(({ config }) => {
      this.setState((s) => ({ liveDailyReview: { ...(s.liveDailyReview || {}), config } }));
    }).catch((e) => this.toastMsg('Could not update: ' + e.message));
  }
  runDailyReviewNow() {
    const conn = getConnection();
    if (!conn || this.state.reviewBusy) return;
    this.setState({ reviewBusy: true });
    api.dailyReviewRun(conn, true).then((res) => {
      this.setState({ reviewBusy: false });
      if (res.skipped && res.reason === 'off') this.toastMsg('Daily Review is off — turn it on first');
      else { this.toastMsg('Nova is reasoning across your day — the review lands in the Inbox shortly'); this.refreshInbox(); setTimeout(() => { const c = getConnection(); if (c) api.dailyReview(c).then((d) => this.setState({ liveDailyReview: d })).catch(() => {}); }, 1500); }
    }).catch((e) => {
      this.setState({ reviewBusy: false });
      this.toastMsg('Daily Review failed: ' + e.message);
    });
  }
  runMealPrepNow() {
    const conn = getConnection();
    if (!conn || this.state.mealPrepBusy) return;
    this.setState({ mealPrepBusy: true });
    api.mealPrepRun(conn, true).then((res) => {
      this.setState({ mealPrepBusy: false });
      if (res.record) { this.toastMsg('Meal-prep proposal drafted — waiting in the Inbox'); this.refreshInbox(); }
      else this.toastMsg(res.reason === 'rotation empty' ? 'The rotation has no meals set — pick recipes first' : 'This week’s meal-prep proposal already exists');
    }).catch((e) => {
      this.setState({ mealPrepBusy: false });
      this.toastMsg('Meal prep failed: ' + e.message);
    });
  }
  addTodoItem() {
    const conn = getConnection();
    const text = this.state.todoInput.trim();
    if (!conn || !text || this.state.todoActionBusy) return;
    this.setState({ todoActionBusy: true });
    api.todoAdd(conn, text).then((data) => {
      this.setState({ todoActionBusy: false, todoInput: '', liveTodos: data });
    }).catch((e) => {
      this.setState({ todoActionBusy: false });
      if (isOfflineError(e)) { this.setState({ todoInput: '' }); this.enqueueOutbox('todo', text, { text }); return; }
      this.toastMsg('Could not add: ' + e.message);
    });
  }
  setTodoItemCategory(rawLine, category) {
    const conn = getConnection();
    if (!conn) return;
    api.todoSetCategory(conn, rawLine, category).then((data) => this.setState({ liveTodos: data, todoEditCategoryKey: null }))
      .catch((e) => { this.toastMsg(e.message); this.setState({ todoEditCategoryKey: null }); });
  }
  toggleTodoItem(rawLine) {
    const conn = getConnection();
    if (!conn || this.state.todoActionBusy) return;
    this.setState({ todoActionBusy: true });
    api.todoToggle(conn, rawLine).then((data) => {
      this.setState({ todoActionBusy: false, liveTodos: data });
    }).catch((e) => {
      this.setState({ todoActionBusy: false });
      this.toastMsg(e.message);
      api.todos(conn).then((data) => this.setState({ liveTodos: data })).catch(() => {});
    });
  }
  setInboxInput(value) {
    this.setState({ inboxInput: typeof value === 'string' ? value : value.target.value });
  }
  setInboxMode(mode) {
    // system-wide trust ladder: the server copy is authoritative; localStorage
    // stays as the offline fallback so the mode survives without a connection
    try { localStorage.setItem(INBOX_MODE_KEY, mode); } catch { /* best-effort */ }
    this.setState({ inboxMode: mode });
    const conn = getConnection();
    if (conn) api.setInboxConfigMode(conn, mode).catch(() => this.toastMsg('Mode saved on this device — server unreachable, will differ across devices until it syncs'));
  }
  syncInboxMode() {
    const conn = getConnection();
    if (!conn) return;
    api.getInboxConfig(conn).then(({ mode }) => {
      if (mode && mode !== this.state.inboxMode) {
        this.setState({ inboxMode: mode });
        try { localStorage.setItem(INBOX_MODE_KEY, mode); } catch { /* best-effort */ }
      }
    }).catch(() => {});
  }
  dismissInboxProposal(key) {
    const next = [...this.state.inboxProposalDismissed, key].slice(-20);
    try { localStorage.setItem('novaos.proposalsDismissed', JSON.stringify(next)); } catch { /* best-effort */ }
    this.setState({ inboxProposalDismissed: next });
  }
  // ---------- loops (dispatch · compost · sparring) ----------
  setDispatchConfig(slot, patch) {
    const conn = getConnection();
    if (!conn) return;
    api.dispatchConfig(conn, slot, patch).then(({ config }) => {
      this.setState((s) => ({ liveDispatch: { ...(s.liveDispatch || {}), config } }));
      const name = slot === 'evening' ? 'Debrief' : 'Dispatch';
      this.toastMsg(name + ' ' + (patch.mode ? 'set to ' + patch.mode : 'now runs at ' + String(patch.hour).padStart(2, '0') + ':00'));
    }).catch((e) => this.toastMsg('Could not update: ' + e.message));
  }
  runDispatchNow(slot) {
    const conn = getConnection();
    if (!conn || this.state.dispatchBusy) return;
    this.setState({ dispatchBusy: true });
    api.dispatchRun(conn, slot, true).then(({ record }) => {
      this.setState({ dispatchBusy: false });
      this.refreshInbox();
      api.dispatchStatus(conn).then((d) => this.setState({ liveDispatch: d })).catch(() => {});
      const name = slot === 'evening' ? 'Debrief' : 'Dispatch';
      this.toastMsg(record.status === 'filed' ? name + ' filed ✓ — ' + record.destination : name + ' drafted — waiting in the Inbox');
    }).catch((e) => {
      this.setState({ dispatchBusy: false });
      this.toastMsg('Brief failed: ' + e.message);
    });
  }
  runTodoistSyncNow() {
    const conn = getConnection();
    if (!conn || this.state.todoistBusy) return;
    this.setState({ todoistBusy: true });
    api.todoistSync(conn).then(({ result }) => {
      this.setState({ todoistBusy: false });
      api.todoistStatus(conn).then((t) => this.setState({ liveTodoist: t })).catch(() => {});
      if (!result.configured) this.toastMsg('Todoist is not connected yet — add TODOIST_TOKEN in server/.env');
      else if (result.error) this.toastMsg('Todoist sync hit an error: ' + result.error);
      else {
        const bits = [result.pushed && `${result.pushed} pushed`, result.pulled && `${result.pulled} pulled`, result.closedInTodoist && `${result.closedInTodoist} closed`, result.checkedInVault && `${result.checkedInVault} checked off`].filter(Boolean);
        this.toastMsg(bits.length ? `Todoist synced — ${bits.join(', ')}` : 'Todoist synced — already in step');
      }
    }).catch((e) => {
      this.setState({ todoistBusy: false });
      this.toastMsg('Todoist sync failed: ' + e.message);
    });
  }
  refreshMoney(month) {
    const conn = getConnection();
    if (!conn) return Promise.resolve();
    return api.money(conn, month).then((data) => this.setState({ liveMoney: data })).catch(() => {});
  }
  setMoneyMonth(month) {
    this.refreshMoney(month);
  }
  submitMoneyAdd() {
    const conn = getConnection();
    const merchant = this.state.moneyAddMerchant.trim();
    const raw = Number(this.state.moneyAddAmount);
    if (!conn || !merchant || !Number.isFinite(raw) || raw === 0 || this.state.moneyBusy) return;
    const amount = this.state.moneyAddIsSpend ? -Math.abs(raw) : Math.abs(raw);
    this.setState({ moneyBusy: true });
    api.moneyAdd(conn, { merchant, amount }).then(() => {
      this.setState({ moneyBusy: false, moneyAddMerchant: '', moneyAddAmount: '' });
      this.refreshMoney(this.state.liveMoney?.month);
    }).catch((e) => {
      this.setState({ moneyBusy: false });
      this.toastMsg('Could not add: ' + e.message);
    });
  }
  removeMoneyTransaction(id) {
    const conn = getConnection();
    if (!conn) return;
    // two-tap confirm — an ~11px ✕ with no confirm was a fat-finger delete
    if (this.state.moneyRemoveConfirm !== id) {
      this.setState({ moneyRemoveConfirm: id });
      this.toastMsg('Tap ✕ again to remove this transaction');
      setTimeout(() => { if (this.state.moneyRemoveConfirm === id) this.setState({ moneyRemoveConfirm: null }); }, 4000);
      return;
    }
    this.setState({ moneyRemoveConfirm: null });
    api.moneyRemove(conn, id).then(() => this.refreshMoney(this.state.liveMoney?.month))
      .catch((e) => this.toastMsg('Could not remove: ' + e.message));
  }
  setMoneyCategory(id, category) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ moneyEditCategoryId: null });
    api.moneyCategory(conn, id, category).then(() => this.refreshMoney(this.state.liveMoney?.month))
      .catch((e) => this.toastMsg('Could not recategorise: ' + e.message));
  }
  setMoneyBudget(category, amount) {
    const conn = getConnection();
    if (!conn) return;
    api.moneyBudget(conn, category, amount).then(() => this.refreshMoney(this.state.liveMoney?.month))
      .catch((e) => this.toastMsg('Budget failed: ' + e.message));
  }
  runMoneyImportNow() {
    const conn = getConnection();
    if (!conn || this.state.moneyBusy) return;
    this.setState({ moneyBusy: true });
    api.moneyImportRun(conn).then(({ records }) => {
      this.setState({ moneyBusy: false });
      this.refreshInbox();
      const pending = (records || []).filter((r) => r.status === 'pending').length;
      this.toastMsg(pending ? `${pending} import${pending === 1 ? '' : 's'} drafted — waiting in the Inbox` : 'Imports folder checked — nothing new');
    }).catch((e) => {
      this.setState({ moneyBusy: false });
      this.toastMsg('Import scan failed: ' + e.message);
    });
  }
  cfoReportNow() {
    const conn = getConnection();
    if (!conn || this.state.moneyBusy) return;
    this.setState({ moneyBusy: true });
    api.moneyReport(conn).then((res) => {
      this.setState({ moneyBusy: false });
      if (res.skipped) this.toastMsg('This month’s CFO report is already on the rails');
      else { this.toastMsg('CFO report drafted — waiting in the Inbox'); this.refreshInbox(); }
    }).catch((e) => {
      this.setState({ moneyBusy: false });
      this.toastMsg('Report failed: ' + e.message);
    });
  }
  onStatementScanFiles(fileList) {
    const conn = getConnection();
    if (!conn) return;
    const files = Array.from(fileList || []).slice(0, 3);
    if (!files.length) return;
    this.setState({ moneyScanBusy: true, moneyScanError: null, moneyScanQuestion: null });
    Promise.all(files.map((f) => this.readFileAsDataUrl(f)))
      .then((images) => api.moneyScanStatement(conn, images, ''))
      .then(({ jobId }) => {
        this.startPoll('moneyScan', () => api.moneyScanJob(conn, jobId), {
          timeoutMs: 3 * 60_000,
          onReady: (job) => {
            const r = job.result;
            if (!r.transactions.length) {
              this.setState({ moneyScanBusy: false, moneyScanError: r.question || 'No transactions found in the photo' });
              return;
            }
            // put the extracted lines on the rails as a pending money-import
            api.moneyScanFile(getConnection(), r.transactions).then(({ record, duplicates }) => {
              this.setState({ moneyScanBusy: false, moneyScanQuestion: r.confidence === 'low' && r.question ? r.question : null });
              this.refreshInbox();
              this.toastMsg(record
                ? `${record.decision.payload.transactions.length} transaction${record.decision.payload.transactions.length === 1 ? '' : 's'} drafted — review in the Inbox`
                : `All ${duplicates} already in the ledger — nothing to file`);
            }).catch((e) => this.setState({ moneyScanBusy: false, moneyScanError: e.message }));
          },
          onError: (msg) => this.setState({ moneyScanBusy: false, moneyScanError: msg }),
        });
      })
      .catch((e) => this.setState({ moneyScanBusy: false, moneyScanError: e.message }));
  }
  downloadMoneyExport(fy) {
    const conn = getConnection();
    if (!conn) return;
    fetch(`${conn.baseUrl.replace(/\/$/, '')}/api/money/export/${fy}`, { headers: { Authorization: `Bearer ${conn.token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`export failed: ${res.status}`);
        const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || `nova-money-fy${fy}.csv`;
        return res.blob().then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
          URL.revokeObjectURL(url);
        });
      })
      .catch((e) => this.toastMsg('Export failed: ' + e.message));
  }
  runGuardianNow() {
    const conn = getConnection();
    if (!conn || this.state.guardianBusy) return;
    this.setState({ guardianBusy: true });
    api.guardianRun(conn).then(({ report }) => {
      this.setState({ guardianBusy: false, liveGuardian: { lastReport: report } });
      this.toastMsg(report.status === 'ok' ? 'Guardian: all checks clean ✓' : `Guardian: ${report.status.toUpperCase()} — see the card`);
    }).catch((e) => {
      this.setState({ guardianBusy: false });
      this.toastMsg('Guardian run failed: ' + e.message);
    });
  }
  // Web Push: real notifications on the installed PWA (mirrors to the Watch)
  async enablePushNotifications() {
    const conn = getConnection();
    if (!conn) return;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        this.toastMsg('This browser can\'t do push — install Nova to the Home Screen from Safari first');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.toastMsg('Notifications were declined — enable them in iOS Settings → Nova');
        this.setState({ pushState: 'denied' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api.pushKey(conn);
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api.pushSubscribe(conn, subscription.toJSON());
      this.setState({ pushState: 'on' });
      this.toastMsg('Notifications are on — drafts and alerts reach your phone (and Watch)');
    } catch (e) {
      this.toastMsg('Push setup failed: ' + e.message);
    }
  }
  async checkPushState() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return this.setState({ pushState: 'unsupported' });
      if (Notification.permission === 'denied') return this.setState({ pushState: 'denied' });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      this.setState({ pushState: sub ? 'on' : 'off' });
    } catch {
      this.setState({ pushState: 'unsupported' });
    }
  }
  testPush() {
    const conn = getConnection();
    if (!conn) return;
    api.pushTest(conn).then(({ sent }) => {
      this.toastMsg(sent ? `Test sent to ${sent} device${sent === 1 ? '' : 's'} — check the lock screen` : 'No devices subscribed yet — tap ENABLE first');
    }).catch((e) => this.toastMsg('Test failed: ' + e.message));
  }
  startProfileEdit() {
    const p = this.state.liveProfile;
    this.setState({
      profileEditing: true,
      profileDraft: {
        focus: p?.focus || '',
        priorities: (p?.priorities || []).join('\n'),
        bestSelf: p?.bestSelf || '',
        notes: p?.notes || '',
      },
    });
  }
  setProfileField(field, value) {
    this.setState((s) => ({ profileDraft: { ...s.profileDraft, [field]: value } }));
  }
  saveProfile() {
    const conn = getConnection();
    const d = this.state.profileDraft;
    if (!conn || this.state.profileSaving) return;
    if (!d.focus.trim() && !d.priorities.trim() && !d.bestSelf.trim() && !d.notes.trim()) {
      this.toastMsg('Add something first — a focus line, a priority, anything');
      return;
    }
    this.setState({ profileSaving: true });
    api.setProfile(conn, {
      focus: d.focus,
      priorities: d.priorities.split('\n').map((x) => x.trim()).filter(Boolean),
      bestSelf: d.bestSelf,
      notes: d.notes,
    }).then(({ profile }) => {
      this.setState({ profileSaving: false, profileEditing: false, liveProfile: profile });
      this.toastMsg('Profile saved — every Nova agent reasons from this now');
    }).catch((e) => {
      this.setState({ profileSaving: false });
      this.toastMsg('Could not save: ' + e.message);
    });
  }
  loadBackups() {
    const conn = getConnection();
    if (!conn) return;
    api.guardianBackups(conn).then(({ files }) => this.setState({ liveBackups: files }))
      .catch((e) => this.toastMsg('Could not list snapshots: ' + e.message));
  }
  // The full calendar list (with hidden flags) for the Settings toggles. A 501
  // (iCloud not configured) or any error just yields an empty list, not a crash.
  loadCalendarList() {
    const conn = getConnection();
    if (!conn) return;
    api.calendars(conn)
      .then(({ calendars }) => this.setState({ liveCalendarList: calendars || [], calendarListError: false }))
      .catch(() => this.setState({ liveCalendarList: null, calendarListError: true })); // error ≠ "no calendars found"
  }
  toggleCalendarHidden(url) {
    const conn = getConnection();
    if (!conn) return;
    const next = (this.state.liveCalendarList || []).map((c) => (c.url === url ? { ...c, hidden: !c.hidden } : c));
    const hidden = next.filter((c) => c.hidden).map((c) => c.url);
    this.setState({ liveCalendarList: next }); // optimistic — reflect the tap instantly
    api.setHiddenCalendars(conn, hidden)
      .then(() => this.refreshLiveData()) // re-pull today's events without the hidden calendars
      .catch((e) => { this.toastMsg('Could not update calendars: ' + e.message); this.loadCalendarList(); });
  }
  // The ask poll, attachable from a fresh boot too — an iOS reclaim used to
  // eat the in-flight answer along with the poll.
  attachAskPoll(conn, jobId) {
    const clearJob = () => { try { localStorage.removeItem('novaos.askJob'); } catch { /* best-effort */ } };
    // STREAMING: the reply renders word-by-word from job.partial, and (on
    // the browser speech path) complete sentences are spoken AS they arrive
    // — Nova starts talking while still thinking, like a person does.
    const stream = { spokenUpTo: 0, started: false };
    const elevenPath = !!(this.state.liveTts?.configured);
    // Trailing SHOW/PROPOSE/RESEARCH lines are typed directives for the
    // server, not prose — keep them out of the render (and out of the voice)
    const stripShow = (t) => t.replace(/(^|\n)\s*(SHOW|PROPOSE|RESEARCH)\s*(\{[\s\S]*)?$/, '');
    const applyPartial = (text) => this.setState((s) => {
      const chat = [...s.voiceChat];
      const idx = chat.map((m) => !!m.streaming).lastIndexOf(true);
      if (idx === -1) chat.push({ who: 'nova', text, streaming: true });
      else chat[idx] = { ...chat[idx], text };
      return { voiceChat: chat };
    });
    const speakNewSentences = (text, flushAll) => {
      if (elevenPath || !this.state.voiceSpeak) return; // ElevenLabs speaks whole replies
      const fresh = text.slice(stream.spokenUpTo);
      if (!fresh) return;
      if (flushAll) {
        this.speakIncremental(fresh);
        stream.spokenUpTo = text.length;
        return;
      }
      const m = fresh.match(/[\s\S]*[.!?](?=\s|$)/);
      if (m) {
        this.speakIncremental(m[0]);
        stream.spokenUpTo += m[0].length;
      }
    };
    this.startPoll('ask', () => api.claudeCodeJob(conn, jobId), {
      timeoutMs: 3 * 60_000,
      intervalMs: 700,
      onProgress: (job) => {
        if (!job.partial) return;
        stream.started = true;
        const shown = stripShow(job.partial);
        if (!shown) return;
        applyPartial(shown);
        speakNewSentences(shown, false);
      },
      onReady: (job) => {
        clearJob();
        const text = job.result.text;
        // the conversation continues across turns AND app restarts
        if (job.result.sessionId) {
          localStorage.setItem('novaos.voiceSession', job.result.sessionId);
          this.setState({ voiceSessionId: job.result.sessionId });
        }
        const panel = job.result.panel || undefined;
        const proposal = job.result.proposal ? { ...job.result.proposal, status: 'pending' } : undefined;
        const research = job.result.research
          ? { ...job.result.research, status: job.result.research.queued ? 'queued' : 'running' }
          : undefined;
        this.setState((s) => {
          const chat = [...s.voiceChat];
          const idx = chat.map((m) => !!m.streaming).lastIndexOf(true);
          if (idx === -1) chat.push({ who: 'nova', text, panel, proposal, research });
          else chat[idx] = { who: 'nova', text, panel, proposal, research };
          return { voiceBusy: false, voiceChat: chat, voicePendingProposal: proposal ? { recordId: proposal.recordId, title: proposal.title } : s.voicePendingProposal };
        });
        if (research && !research.queued) this.watchVoiceResearch(conn, research.recordId);
        if (elevenPath) this.speak(text);
        else if (this.state.voiceSpeak) { speakNewSentences(text, true); if (!stream.started) this.speak(text); }
        else this.maybeAutoListen();
      },
      onError: (msg) => { clearJob(); this.setState((s) => ({ voiceBusy: false, voiceChat: [...s.voiceChat.filter((m) => !m.streaming), { who: 'system', text: 'Error: ' + msg }] })); },
    });
  }

  // ---------- focus blocks (the "Engage next block" timer) ----------
  startFocusBlock(label, minutes) {
    const endsAt = Date.now() + Math.max(5, Math.min(180, minutes)) * 60000;
    const focusSession = { label: label.slice(0, 80), startedAt: Date.now(), endsAt };
    this.setState({ focusSession });
    try { localStorage.setItem('novaos.focus', JSON.stringify(focusSession)); } catch { /* best-effort */ }
    this.toastMsg(`Focus block started — ${label} (${Math.round(minutes)} min)`);
  }
  logFocusBlock() {
    const f = this.state.focusSession;
    const conn = getConnection();
    if (!f) return;
    this.dismissFocusBlock();
    if (!conn) { this.toastMsg('Offline — the block ended but could not be journaled'); return; }
    const mins = Math.round((Math.min(Date.now(), f.endsAt) - f.startedAt) / 60000);
    api.addJournalEntry(conn, `Focus block: ${f.label} — ${mins} min.`, null, { category: 'personal', label: 'Focus block' })
      .then(() => { this.toastMsg('Focus block journaled ✓'); this.refreshLiveData(); })
      .catch((e) => this.toastMsg('Could not journal the block: ' + e.message));
  }
  dismissFocusBlock() {
    this.setState({ focusSession: null });
    try { localStorage.removeItem('novaos.focus'); } catch { /* best-effort */ }
  }

  setCalCmd(e) { this.setState({ calCmdText: e.target.value }); }
  // Ask Nova to schedule something in natural language. It only DRAFTS a
  // proposal — the event isn't written until Hayden approves it in the inbox
  // ("always ask first"). The interpret step runs the model, so it takes a beat.
  sendCalendarCommand() {
    const conn = getConnection();
    const text = (this.state.calCmdText || '').trim();
    if (!conn || !text || this.state.calCmdBusy) return;
    this.setState({ calCmdBusy: true });
    api.calendarCommand(conn, text)
      .then((r) => {
        this.setState({ calCmdBusy: false });
        if (r.proposed) {
          this.setState({ calCmdText: '' });
          this.toastMsg('Nova drafted it — approve in your inbox to add it to your calendar');
          this.refreshLiveData();
        } else {
          this.toastMsg(r.reason || "Couldn't turn that into an event");
        }
      })
      .catch((e) => { this.setState({ calCmdBusy: false }); this.toastMsg('Could not reach Nova: ' + e.message); });
  }
  openCalendarView() { this.setState({ calendarViewOpen: true, calendarRangeError: false }); this.loadCalendarRange(); }
  loadCalendarRange() {
    const conn = getConnection();
    if (!conn) return;
    // a fetch failure is an ERROR state, never an empty calendar — "[] on
    // catch" once made a network blip read as an empty fortnight
    api.calendarRange(conn, 14)
      .then(({ events }) => this.setState({ liveCalendarRange: events || [], calendarRangeError: false }))
      .catch(() => this.setState({ liveCalendarRange: null, calendarRangeError: true }));
  }
  // Manually correct a day's steps (e.g. when the phone automation missed a
  // night). Upserts through the normal health path and re-pulls the week.
  saveStepEdit() {
    const conn = getConnection();
    const date = this.state.stepEditDate;
    const steps = Math.round(Number(this.state.stepEditValue));
    const weight = parseFloat(this.state.stepEditWeight);
    const hasWeight = !Number.isNaN(weight) && weight > 0;
    const hasSteps = !Number.isNaN(steps) && steps >= 0 && this.state.stepEditValue !== '';
    if (!conn || !date || (!hasSteps && !hasWeight)) { this.toastMsg('Enter a step count or a bodyweight'); return; }
    const metrics = {};
    if (hasSteps) metrics.steps = steps;
    if (hasWeight) metrics.weightKg = weight; // manual bodyweight logging — the Shortcut fills this automatically once Body Mass is added
    api.saveHealthDay(conn, date, metrics)
      // no days override — the server's 14-day default matches the weight
      // view/trend window; a 7-day refetch here used to truncate it
      .then(() => api.healthData(conn))
      .then((r) => { this.setState({ liveHealthDays: r.days.length ? r.days : null, stepEditDate: null, stepEditValue: '', stepEditWeight: '' }); this.toastMsg(`${date} saved ✓`); })
      .catch((e) => {
        if (isOfflineError(e)) {
          this.setState({ stepEditDate: null, stepEditValue: '', stepEditWeight: '' });
          this.enqueueOutbox('healthDay', `${date} steps/weight`, { date, metrics }); // day-file upsert — replay-safe
          return;
        }
        this.toastMsg('Could not save: ' + e.message);
      });
  }
  restoreBackupNow(backupRel) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ restoreConfirm: null });
    api.guardianRestore(conn, backupRel).then(({ file }) => {
      this.toastMsg(`Restored ${file} — undo is in the Inbox history`);
      this.loadBackups();
      this.refreshInbox();
      this.refreshLiveData();
    }).catch((e) => this.toastMsg('Restore failed: ' + e.message));
  }
  guardianExportNow() {
    const conn = getConnection();
    if (!conn || this.state.guardianBusy) return;
    this.setState({ guardianBusy: true });
    api.guardianExport(conn).then(({ dest }) => {
      this.setState({ guardianBusy: false });
      api.guardian(conn).then((g) => this.setState({ liveGuardian: g })).catch(() => {});
      this.toastMsg('Exported to ' + dest);
    }).catch((e) => {
      this.setState({ guardianBusy: false });
      this.toastMsg('Export failed: ' + e.message);
    });
  }
  guardianReportNow() {
    const conn = getConnection();
    if (!conn || this.state.guardianBusy) return;
    this.setState({ guardianBusy: true });
    api.guardianReport(conn).then((res) => {
      this.setState({ guardianBusy: false });
      if (res.skipped) this.toastMsg('This month’s Guardian report is already on the rails');
      else { this.toastMsg('Guardian report drafted — waiting in the Inbox'); this.refreshInbox(); }
    }).catch((e) => {
      this.setState({ guardianBusy: false });
      this.toastMsg('Report failed: ' + e.message);
    });
  }
  runCompostNow() {
    const conn = getConnection();
    if (!conn || this.state.compostBusy) return;
    this.setState({ compostBusy: true });
    api.compostRun(conn).then((data) => {
      this.setState({ compostBusy: false, liveCompost: data });
      this.toastMsg(data.proposals.length ? `Compost pass done — ${data.proposals.length} proposal${data.proposals.length === 1 ? '' : 's'}` : 'Compost pass done — the vault is tidy');
    }).catch((e) => {
      this.setState({ compostBusy: false });
      this.toastMsg('Compost run failed: ' + e.message);
    });
  }
  compostAction(id, kind) {
    const conn = getConnection();
    if (!conn) return;
    this.setState((s) => ({ compostActionBusy: { ...s.compostActionBusy, [id]: true } }));
    const fn = kind === 'accept' ? api.compostAccept : api.compostDismiss;
    fn(conn, id).then((res) => {
      this.setState((s) => ({
        compostActionBusy: { ...s.compostActionBusy, [id]: false },
        liveCompost: s.liveCompost
          ? { ...s.liveCompost, proposals: s.liveCompost.proposals.map((p) => (p.id === id ? res.proposal : p)) }
          : s.liveCompost,
      }));
      if (kind === 'accept') { this.refreshInbox(); this.toastMsg('Done ✓ — ' + (res.record?.destination || res.proposal.title)); }
    }).catch((e) => {
      this.setState((s) => ({ compostActionBusy: { ...s.compostActionBusy, [id]: false } }));
      this.toastMsg('Could not apply: ' + e.message);
    });
  }
  startSpar() {
    const conn = getConnection();
    if (!conn) { this.toastMsg('Connect a backend in Settings first'); return; }
    if (this.state.sparBusy) return;
    const target = this.state.codeWorkspace === 'repo' ? 'Nova OS' : 'the vault';
    this.setState((s) => ({ sparBusy: true, codeChat: [...s.codeChat, { who: 'system', text: `Breaker engaged — read-only adversarial pass over ${target}…` }] }));
    const focus = [...this.state.codeChat].reverse().find((m) => m.who === 'you')?.text || '';
    api.sparStart(conn, this.state.codeWorkspace, focus).then(({ jobId }) => {
      this.startPoll('spar', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 10 * 60_000,
        onReady: (job) => this.setState((s) => ({ sparBusy: false, codeChat: [...s.codeChat, { who: 'breaker', text: job.result.text }] })),
        onError: (msg) => this.setState((s) => ({ sparBusy: false, codeChat: [...s.codeChat, { who: 'system', text: 'Breaker failed: ' + msg }] })),
      });
    }).catch((e) => {
      this.setState((s) => ({ sparBusy: false, codeChat: [...s.codeChat, { who: 'system', text: 'Breaker failed: ' + e.message }] }));
    });
  }
  captureToInbox(text, source = 'text') {
    const conn = getConnection();
    if (!conn) { this.toastMsg('Connect a backend in Settings first'); return; }
    const t = (text || '').trim();
    if (!t) return;
    this.setState({ inboxCaptureBusy: true, inboxInput: '' });
    api.inboxCapture(conn, t, this.state.inboxMode, source).then(({ id }) => {
      this.refreshInbox();
      this.startPoll('inboxCapture:' + id, () => api.inboxItem(conn, id), {
        intervalMs: 1500,
        onReady: ({ record }) => {
          this.setState({ inboxCaptureBusy: false });
          this.refreshInbox();
          if (record.status === 'filed') this.toastMsg('Filed ✓ — ' + record.destination);
          else if (record.status === 'pending') this.toastMsg('Needs your call — waiting in the Inbox');
        },
        onError: (msg) => {
          this.setState({ inboxCaptureBusy: false });
          this.refreshInbox();
          this.toastMsg('Capture failed: ' + msg);
        },
      });
    }).catch((e) => {
      this.setState({ inboxCaptureBusy: false });
      if (isOfflineError(e)) { this.enqueueOutbox('capture', t, { text: t, mode: this.state.inboxMode, source }); return; }
      this.toastMsg('Capture failed: ' + e.message);
    });
  }
  inboxAction(id, kind) {
    const conn = getConnection();
    if (!conn) return;
    const fn = kind === 'approve' ? api.inboxApprove : kind === 'discard' ? api.inboxDiscard : api.inboxUndo;
    this.setState((s) => ({ inboxActionBusy: { ...s.inboxActionBusy, [id]: true } }));
    fn(conn, id).then(({ record }) => {
      this.setState((s) => ({
        inboxActionBusy: { ...s.inboxActionBusy, [id]: false },
        liveInbox: s.liveInbox
          ? { items: s.liveInbox.items.map((r) => (r.id === id ? record : r)), pendingCount: s.liveInbox.items.map((r) => (r.id === id ? record : r)).filter((r) => r.status === 'pending').length }
          : s.liveInbox,
      }));
      if (kind === 'approve') this.toastMsg('Filed ✓ — ' + record.destination);
      else if (kind === 'discard') this.toastMsg('Discarded — nothing was written');
      else this.toastMsg('Undone ✓ — ' + (record.undoSummary || 'reverted'));
    }).catch((e) => {
      this.setState((s) => ({ inboxActionBusy: { ...s.inboxActionBusy, [id]: false } }));
      this.toastMsg(kind === 'undo' ? 'Could not undo: ' + e.message : 'Action failed: ' + e.message);
      this.refreshInbox();
    });
  }

  // ---------- galaxy ----------
  buildGalaxy(w, h) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const graph = this.state.liveGraph;
    if (graph && graph.nodes.length) {
      // Real vault graph: every page a star, wikilinks as constellation lines.
      // Capped so a huge vault stays renderable on a phone canvas.
      const MAX_NODES = 400;
      const nodes = graph.nodes.slice(0, MAX_NODES);
      this.gNodes = nodes.map((n, i) => {
        const ang = (i / nodes.length) * Math.PI * 2 + rnd(-.4, .4);
        const rad = rnd(.16, .44) * Math.min(w, h);
        const type = (n.type || 'note').toLowerCase();
        return {
          label: n.title, type, desc: `${type} · ${(n.date || '').slice(0, 10)}`, target: 'note:' + n.id,
          color: NOTE_TYPE_COLOR[type] || '#ece5da',
          bx: w / 2 + Math.cos(ang) * rad * (w / h), by: h / 2 + Math.sin(ang) * rad,
          ph: rnd(0, 6.28), sp: rnd(.3, .8), r: nodes.length > 120 ? rnd(2.5, 4) : rnd(4, 6.5),
        };
      });
      this.gLinks = graph.links.filter(([a, b]) => a < nodes.length && b < nodes.length);
    } else {
      const types = { note: '#ece5da', podcast: '#8a6ad1', recipe: '#d8b573', training: '#5aa87c', agent: '#6be5f5', idea: '#e08f6f' };
      this.gNodes = galaxyNamed.map((n, i) => {
        const ang = (i / galaxyNamed.length) * Math.PI * 2 + rnd(-.4, .4);
        const rad = rnd(.16, .4) * Math.min(w, h);
        return { label: n[0], type: n[1], desc: n[2], target: n[3], color: types[n[1]], bx: w / 2 + Math.cos(ang) * rad * (w / h), by: h / 2 + Math.sin(ang) * rad, ph: rnd(0, 6.28), sp: rnd(.3, .8), r: rnd(4, 6.5) };
      });
      this.gLinks = galaxyLinks;
    }
    this.gDust = Array.from({ length: 130 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(.4, 1.4), ph: rnd(0, 6.28), sp: rnd(.5, 1.5) }));
  }
  startGalaxy() {
    if (this.gRaf) return;
    const cv = this.galaxyRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    if (!this.gNodes) this.buildGalaxy(w, h);
    this.gPos = [];
    const loop = () => {
      // A live-data refresh nulls gNodes to force a rebuild — rebuild inside
      // the frame loop so the swap to fresh graph data is seamless.
      if (!this.gNodes) this.buildGalaxy(w, h);
      const t = performance.now() / 1000;
      ctx.clearRect(0, 0, w, h);
      this.gDust.forEach(d => { ctx.globalAlpha = .25 + .45 * Math.abs(Math.sin(t * d.sp + d.ph)); ctx.fillStyle = '#ece5da'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.29); ctx.fill(); });
      ctx.globalAlpha = 1;
      const pos = this.gNodes.map(n => ({ x: n.bx + Math.sin(t * n.sp * .5 + n.ph) * 12, y: n.by + Math.cos(t * n.sp * .4 + n.ph) * 9 }));
      this.gPos = pos;
      ctx.strokeStyle = 'rgba(236,229,218,.13)'; ctx.lineWidth = 1;
      this.gLinks.forEach(l => { ctx.beginPath(); ctx.moveTo(pos[l[0]].x, pos[l[0]].y); ctx.lineTo(pos[l[1]].x, pos[l[1]].y); ctx.stroke(); });
      // With a real vault (hundreds of stars) labels everywhere are unreadable
      // — draw them only on small graphs, plus always on the selected star.
      const showLabels = this.gNodes.length <= 80;
      this.gNodes.forEach((n, i) => {
        const p = pos[i];
        const sel = this.state.galaxySel && this.state.galaxySel.label === n.label;
        ctx.shadowColor = n.color; ctx.shadowBlur = sel ? 26 : 14;
        ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(p.x, p.y, sel ? n.r + 2 : n.r, 0, 6.29); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(p.x, p.y, n.r + 9, 0, 6.29); ctx.strokeStyle = n.color; ctx.stroke(); ctx.globalAlpha = 1;
        if (showLabels || sel) {
          ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = sel ? '#ece5da' : 'rgba(236,229,218,.6)';
          ctx.fillText(n.label, p.x + n.r + 8, p.y + 3);
        }
      });
      this.gRaf = requestAnimationFrame(loop);
    };
    this.gRaf = requestAnimationFrame(loop);
  }
  stopGalaxy() { if (this.gRaf) { cancelAnimationFrame(this.gRaf); this.gRaf = null; } }

  // ---------- helpers ----------
  toastMsg(text) {
    clearTimeout(this.toastT);
    this.setState({ toast: text });
    this.toastT = setTimeout(() => this.setState({ toast: null }), 3600);
  }
  typeIn(key, who, text, after) {
    this.setState(s => ({ [key]: [...s[key], { who, text: '', typing: true }] }));
    let i = 0;
    // ~12 chars per 80ms tick, not 3 per 22ms: each tick reconciles the whole
    // tree (P7 in the perf audit), so fewer, larger ticks read the same but
    // cost ~4× less main-thread work during a reply animation
    const iv = setInterval(() => {
      i += 12;
      this.setState(s => {
        const arr = s[key].slice();
        const m = Object.assign({}, arr[arr.length - 1]);
        m.text = text.slice(0, i); m.typing = i < text.length;
        arr[arr.length - 1] = m;
        return { [key]: arr };
      });
      if (i >= text.length) { clearInterval(iv); if (after) after(); }
    }, 80);
    this.ivs.push(iv);
  }

  // The view-model for every screen, composed from per-domain builders in
  // src/vals/. Order matters: earlier builders add shared derived values to
  // ctx (rotation, todayRoutine, reviewPage, shoppingItems, ...) that later
  // builders consume — valsMission reads from all three data domains, and
  // valsChrome builds the nav counts last.
  renderVals() {
    const st = this.state;
    const ctx = {
      st,
      userName: USER_NAME,
      wakeWord: WAKE_WORD,
      // connection truth — everything user-visible about live/demo/offline hangs off these
      demoMode: st.connectionStatus === 'demo',
      isOffline: st.connectionStatus === 'offline',
      lastSyncLabel: st.lastSyncAt
        ? new Date(st.lastSyncAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
        : null,
      go: (screen) => () => this.navigate(screen, { paletteOpen: false }),
    };
    return {
      ...valsRecipes(this, ctx),
      ...valsWorkouts(this, ctx),
      ...valsNotes(this, ctx),
      ...valsMisc(this, ctx),
      ...valsInbox(this, ctx),
      ...valsTodos(this, ctx),
      ...valsMoney(this, ctx),
      ...valsMission(this, ctx),
      ...valsOps(this, ctx),
      ...valsChrome(this, ctx),
    };
  }

  // A research job dispatched from the conversation: poll the SAME pending
  // record the Inbox shows. When the brief lands, the message grows a
  // sources panel + the normal confirm chip (approving files the note).
  // NOT approving by voice here — the brief arrives minutes later and a
  // "yes" then could belong to anything; the chip is the confirm surface.
  watchVoiceResearch(conn, recordId) {
    const patch = (fn) => this.setState((s) => ({ voiceChat: s.voiceChat.map((m) => (m.research?.recordId === recordId ? fn(m) : m)) }));
    this.startPoll(`voiceResearch:${recordId}`, () => api.inboxItem(conn, recordId), {
      intervalMs: 5000, timeoutMs: 8 * 60_000,
      onReady: ({ record }) => patch((m) => ({
        ...m,
        research: { ...m.research, status: 'done', title: record.decision.title, body: record.decision.payload.body },
        proposal: { recordId, title: `File "${record.decision.title}" into the vault`, status: 'pending' },
      })),
      onError: (msg) => patch((m) => ({ ...m, research: { ...m.research, status: 'error', error: msg } })),
    });
  }
  // The overnight queue — work handed to Nova for the 03:30 window.
  overnightAdd(question) {
    const conn = getConnection();
    const q = (question ?? this.state.overnightInput).trim();
    if (!conn || !q) return;
    api.overnightAdd(conn, q).then((r) => {
      this.setState({ liveOvernight: r, overnightInput: '' });
      this.toastMsg('Queued for tonight — the brief lands in your Inbox by morning');
    }).catch((e) => this.toastMsg(e.message));
  }
  overnightRemove(id) {
    const conn = getConnection();
    if (!conn) return;
    api.overnightRemove(conn, id).then((r) => this.setState({ liveOvernight: r })).catch((e) => this.toastMsg(e.message));
  }
  overnightRunNow() {
    const conn = getConnection();
    if (!conn) return;
    api.overnightRun(conn).then(() => {
      this.toastMsg('Running the queue now — briefs land in the Inbox as they finish');
      setTimeout(() => { const c = getConnection(); if (c) api.overnight(c).then((r) => this.setState({ liveOvernight: r })).catch(() => {}); }, 2000);
    }).catch((e) => this.toastMsg(e.message));
  }
  // Voice-confirmed actions: approving is DETERMINISTIC — the same Inbox
  // approve endpoint the rails already trust; the model never writes.
  resolveVoiceProposal(recordId, approve) {
    const conn = getConnection(); if (!conn) return;
    const mark = (status, extra) => this.setState((s) => ({
      voicePendingProposal: s.voicePendingProposal?.recordId === recordId ? null : s.voicePendingProposal,
      voiceChat: s.voiceChat.map((m) => (m.proposal?.recordId === recordId ? { ...m, proposal: { ...m.proposal, status, ...extra } } : m)),
    }));
    const call = approve ? api.inboxApprove(conn, recordId) : api.inboxDiscard(conn, recordId);
    call.then(() => {
      mark(approve ? 'done' : 'dismissed');
      const line = approve ? 'Done — it’s in. Undo lives in your Inbox.' : 'Left alone — nothing changed.';
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'nova', text: line }] }));
      if (this.state.voiceSpeak) this.speak(line);
    }).catch((e) => {
      mark('error', { error: e.message });
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'system', text: `Couldn’t ${approve ? 'approve' : 'dismiss'} that: ${e.message}. It’s still pending in your Inbox.` }] }));
    });
  }
  doOrb() {
    const q = this.state.orbInput.trim(); if (!q) return;
    this.resumeConv(); // anything sent un-pauses the conversation loop
    this.primeSpeech(); // inside the user gesture — unlocks audio on iOS
    // A short plain yes/no right after a proposal is a CONFIRMATION, not a
    // question — approve or dismiss deterministically, no model in the loop.
    const pending = this.state.voicePendingProposal;
    if (pending && getConnection() && this.state.connectionStatus !== 'offline') {
      const yes = /^(yes|yep|yeah|sure|ok|okay|do it|go ahead|confirm|approve|approved|yes please|please do|go for it|make it so|lock it in)[.!\s]*$/i.test(q);
      const no = /^(no|nope|nah|don't|dont|leave it|skip|skip it|cancel|not now|never mind|nevermind)[.!\s]*$/i.test(q);
      if (yes || no) {
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'you', text: q }], orbInput: '' }));
        this.resolveVoiceProposal(pending.recordId, yes);
        return;
      }
      // anything else moves the conversation on; the draft stays in the Inbox
      this.setState({ voicePendingProposal: null });
    }
    // a configured backend → the real Ask Nova pipeline, even while the
    // status is still 'connecting' (the ask itself proves the connection);
    // ONLY demo mode gets the scripted preview
    const conn = getConnection();
    if (conn) {
      if (this.state.connectionStatus === 'offline') {
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'you', text: q }, { who: 'system', text: 'Offline — reconnect to the Mac to ask Nova.' }], orbInput: '' }));
        return;
      }
      this.setState({ orbInput: '' });
      this.askNova(q);
      return;
    }
    this.setState(s => ({ orbChat: [...s.orbChat, { who: 'you', text: q }], orbInput: '' }));
    setTimeout(() => this.typeIn('orbChat', 'nova', orbReply(q)), 480);
  }
  // iOS gates audio behind a user gesture: playing a muted element and an
  // empty utterance during the tap unlocks both paths for the async reply.
  primeSpeech() {
    try {
      if (!this.sharedAudio) {
        this.sharedAudio = new Audio();
        this.sharedAudio.muted = true;
        this.sharedAudio.play().catch(() => {});
        this.sharedAudio.muted = false;
      }
      if (window.speechSynthesis && !this.speechPrimed) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        this.speechPrimed = true;
      }
    } catch { /* best-effort */ }
  }
  askNova(question) {
    const conn = getConnection();
    if (!conn || this.state.voiceBusy) return;
    this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'you', text: question }], voiceBusy: true }));
    this.stopSpeaking();
    this.speakAck(question); // fills the 5-8s think-gap immediately
    api.ask(conn, question, this.state.voiceSessionId || null).then(({ jobId }) => {
      // survive a reclaim mid-answer: the job id persists so boot can
      // re-attach the poll instead of losing the in-flight reply
      try { localStorage.setItem('novaos.askJob', JSON.stringify({ jobId, askedAt: Date.now() })); } catch { /* best-effort */ }
      this.attachAskPoll(conn, jobId);
    }).catch((e) => {
      this.setState((s) => ({ voiceBusy: false, voiceChat: [...s.voiceChat, { who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  // The doorman: a DETERMINISTIC greeting when he arrives at the Voice
  // screen — first arrival of the day gets the time of day, a return after
  // a real gap gets "Welcome back." Code speaks it instantly (no model, no
  // latency); the prompt's register keeps the address going from there.
  maybeVoiceGreet() {
    if (this.state.demoMode || !getConnection()) return;
    const now = Date.now();
    const today = new Date().toDateString();
    let last = {};
    try { last = JSON.parse(localStorage.getItem('novaos.voiceGreet')) || {}; } catch { /* fresh */ }
    try { localStorage.setItem('novaos.voiceGreet', JSON.stringify({ date: today, at: now })); } catch { /* best-effort */ }
    let line = null;
    if (last.date !== today) {
      const h = new Date().getHours();
      line = h < 12 ? 'Good morning, sir.' : h < 18 ? 'Good afternoon, sir.' : 'Good evening, sir.';
    } else if (last.at && now - last.at > 3 * 3600e3) {
      line = 'Welcome back, sir.';
    }
    if (!line) return;
    // the wake debrief — one deterministic line of receipts, Jarvis-fashion
    const pending = this.state.liveOps?.pending;
    if (pending > 0) line += ` ${pending === 1 ? 'One item awaits' : `${pending} items await`} your review.`;
    this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'nova', text: line }] }));
    if (this.state.voiceSpeak) { this.primeSpeech(); this.speak(line); }
  }
  // Rituals — tapped invitations, never interruptions. The transcript shows
  // a clean label; the structured instruction is composed server-side.
  startRitual(kind) {
    const conn = getConnection();
    if (!conn || this.state.voiceBusy || this.state.connectionStatus === 'offline') return;
    this.primeSpeech();
    api.askRitual(conn, kind, this.state.voiceSessionId || null).then(({ jobId, label }) => {
      const done = { ...(this.state.ritualDone || {}), [kind]: new Date().toDateString() };
      try { localStorage.setItem('novaos.ritualDone', JSON.stringify(done)); } catch { /* best-effort */ }
      try { localStorage.setItem('novaos.askJob', JSON.stringify({ jobId, askedAt: Date.now() })); } catch { /* best-effort */ }
      this.setState((s) => ({ ritualDone: done, voiceBusy: true, voiceChat: [...s.voiceChat, { who: 'you', text: label }] }));
      this.stopSpeaking();
      this.attachAskPoll(conn, jobId);
    }).catch((e) => {
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  newVoiceChat() {
    localStorage.removeItem('novaos.voiceSession');
    this.stopSpeaking();
    this.setState({ voiceSessionId: null, voiceChat: [] });
    this.toastMsg('Fresh conversation — Nova starts clean');
  }
  rememberFromChat(text) {
    const conn = getConnection();
    if (!conn) return;
    this.captureToInbox(`Remember this (from a Nova conversation): ${text.slice(0, 1200)}`, 'text');
    this.toastMsg('Sent to the Inbox — Nova will file it into the vault');
  }
  // Speak an answer aloud: ElevenLabs through the server proxy when the key
  // is configured, otherwise the browser's built-in speech engine — never
  // silent unless the SPEAK toggle is off.
  // ---- speech queue: one counter for whole-text AND incremental chunks,
  // so "finished speaking" is a single truthful event the conversation loop
  // can hang off (auto-reopen the mic when Nova stops talking).
  beginSpeech() {
    this.speechActive = (this.speechActive || 0) + 1;
    if (!this.state.voiceSpeaking) this.setState({ voiceSpeaking: true });
  }
  endSpeech() {
    this.speechActive = Math.max(0, (this.speechActive || 0) - 1);
    if (this.speechActive === 0) this.setState({ voiceSpeaking: false }, () => this.maybeAutoListen());
  }
  stopSpeaking() {
    try { window.speechSynthesis.cancel(); } catch { /* unsupported */ }
    try { this.currentAudio?.pause(); } catch { /* fine */ }
    this.speechActive = 0;
    if (this.state.voiceSpeaking) this.setState({ voiceSpeaking: false });
  }
  // browser-synth chunk — used to speak sentences AS the reply streams in
  // The instant acknowledgement. A model reply is 5-8s away; silence in that
  // gap is what makes Nova feel like a form rather than a person. So the
  // moment he stops talking, code (never a model) speaks one short line from
  // the device's own voice — chosen deterministically, varied so it never
  // sounds like a recording, and skipped entirely on the ElevenLabs path
  // (a network round-trip for filler would defeat the point) or when the
  // question is trivially short.
  ACK_LINES = ['On it, sir.', 'Let me look.', 'One moment.', 'Checking now.', 'Right away, sir.'];
  speakAck(question) {
    if (!this.state.voiceSpeak) return;
    if (this.state.liveTts?.configured) return;      // real voice: no filler round-trip
    if ((question || '').trim().length < 12) return; // short asks answer fast enough
    // rotate rather than random: no repeat twice running, no randomness to debug
    this.ackIdx = ((this.ackIdx ?? -1) + 1) % this.ACK_LINES.length;
    this.beginSpeech();
    this.speakFallback(this.ACK_LINES[this.ackIdx], () => this.endSpeech());
  }
  speakIncremental(text) {
    if (!this.state.voiceSpeak || !text.trim()) return;
    this.beginSpeech();
    this.speakFallback(text, () => this.endSpeech());
  }
  // conversation mode: when Nova finishes speaking (and nothing is running),
  // reopen the mic — the turn passes back without a tap
  maybeAutoListen() {
    if (!this.state.voiceConvMode || this.state.voiceConvPaused) return;
    if (this.state.screen !== 'voice' || this.state.voiceBusy) return;
    if ((this.speechActive || 0) > 0) return;
    this.setState((s) => ({ voiceAutoListenTick: s.voiceAutoListenTick + 1 }));
  }
  toggleConvMode() {
    this.convEmpties = 0;
    this.setState((s) => ({ voiceConvMode: !s.voiceConvMode, voiceConvPaused: false }), () => {
      if (this.state.voiceConvMode) this.maybeAutoListen();
    });
  }
  resumeConv() {
    this.convEmpties = 0;
    if (this.state.voiceConvPaused) this.setState({ voiceConvPaused: false });
  }
  // two silent listens in a row → pause the loop politely (it's an offer,
  // not surveillance); anything sent resumes it
  notifyEmptyListen() {
    this.convEmpties = (this.convEmpties || 0) + 1;
    if (this.convEmpties >= 2) {
      this.setState({ voiceConvPaused: true });
      this.toastMsg('Conversation paused — tap the mic when you’re ready');
    } else {
      this.maybeAutoListen();
    }
  }
  speak(text) {
    if (!this.state.voiceSpeak) { this.maybeAutoListen(); return; }
    const clean = text.slice(0, 2400);
    this.beginSpeech();
    const finish = () => this.endSpeech();
    const conn = getConnection();
    if (conn && this.state.liveTts?.configured) {
      api.ttsAudio(conn, clean, this.state.voiceVoiceId || undefined).then((blob) => {
        const url = URL.createObjectURL(blob);
        // reuse the gesture-unlocked element (iOS blocks fresh ones)
        const audio = this.sharedAudio || new Audio();
        this.currentAudio = audio;
        audio.src = url;
        audio.onended = () => { URL.revokeObjectURL(url); finish(); };
        audio.onerror = () => { URL.revokeObjectURL(url); finish(); };
        audio.play().catch(() => { URL.revokeObjectURL(url); this.speakFallback(clean, finish); });
      }).catch(() => this.speakFallback(clean, finish));
    } else {
      this.speakFallback(clean, finish);
    }
  }
  speakFallback(text, finish) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const chosen = this.state.speechVoiceURI && voices.find((v) => v.voiceURI === this.state.speechVoiceURI);
      u.voice = chosen || voices.find((v) => v.lang === 'en-AU') || voices.find((v) => (v.lang || '').startsWith('en')) || null;
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
    } catch {
      finish();
    }
  }
  setSpeechVoice(uri) {
    localStorage.setItem('novaos.speechVoiceURI', uri || '');
    this.setState({ speechVoiceURI: uri || '' });
    // a short preview so he hears the choice immediately
    this.stopSpeaking();
    if (this.state.voiceSpeak) setTimeout(() => this.speakFallback('This is how Nova will sound.', () => {}), 60);
  }
  stopSpeaking() {
    try { window.speechSynthesis.cancel(); } catch { /* not supported */ }
    if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null; }
    if (this.state.voiceSpeaking) this.setState({ voiceSpeaking: false });
  }
  setVoiceSpeak(on) {
    localStorage.setItem('novaos.voiceSpeak', on ? '1' : '0');
    this.setState({ voiceSpeak: on });
    if (!on) this.stopSpeaking();
  }
  setVoiceId(id) {
    localStorage.setItem('novaos.voiceId', id);
    this.setState({ voiceVoiceId: id });
  }
  doCoach(preset) {
    const q = (preset || this.state.coachInput).trim(); if (!q) return;
    const conn = getConnection();
    // live backend → the real evidence-based coach; demo keeps the script
    if (conn && this.state.connectionStatus !== 'demo') {
      if (this.state.coachBusy) return;
      this.setState((s) => ({ coachChat: [...s.coachChat, { who: 'you', text: q }], coachInput: '', coachBusy: true }));
      api.askCoach(conn, q, this.state.coachSessionId || null).then(({ jobId }) => {
        this.startPoll('coach', () => api.claudeCodeJob(conn, jobId), {
          timeoutMs: 3 * 60_000,
          onReady: (job) => {
            if (job.result.sessionId) {
              localStorage.setItem('novaos.coachSession', job.result.sessionId);
              this.setState({ coachSessionId: job.result.sessionId });
            }
            this.setState((s) => ({ coachBusy: false, coachChat: [...s.coachChat, { who: 'coach', text: job.result.text }] }));
            // a proposed program change landed on the rails as a pending record
            if (job.result.proposal) {
              this.refreshInbox();
              this.toastMsg(`${job.result.proposal.title} — approve it in your Inbox`);
            }
          },
          onError: (msg) => this.setState((s) => ({ coachBusy: false, coachChat: [...s.coachChat, { who: 'system', text: 'Error: ' + msg }] })),
        });
      }).catch((e) => {
        this.setState((s) => ({ coachBusy: false, coachChat: [...s.coachChat, { who: 'system', text: 'Error: ' + e.message }] }));
      });
      return;
    }
    this.setState(s => ({ coachChat: [...s.coachChat, { who: 'you', text: q }], coachInput: '' }));
    const r = coachReply(q);
    setTimeout(() => this.typeIn('coachChat', 'coach', r.text, () => {
      if (!r.mod) return;
      let plan = (this.state.plan || this.basePlan).slice();
      if (r.mod === 'trim') plan = plan.filter(x => x.name !== 'Cable fly');
      if (r.mod === 'hard') plan = plan.map(x => x.name.includes('bench') || x.name.includes('Bench') ? Object.assign({}, x, { scheme: '5 × 6 · 82.5 kg' }) : x);
      if (r.mod === 'swap') plan = plan.map(x => x.name === 'Seated shoulder press' ? { name: 'Landmine press', scheme: '3 × 8 · 40 kg', pr: false } : x);
      this.setState({ plan, planNote: r.note });
      // demo never claims a vault write happened — that's the honesty rule
      this.toastMsg('Coach updated the demo plan (demo mode — nothing written)');
    }), 520);
  }
  buildQuickSession() {
    const conn = getConnection();
    if (!conn || this.state.quickBusy) return;
    this.setState({ quickBusy: true, quickPlan: null });
    api.quickSession(conn, Number(this.state.quickMinutes), this.state.quickNote.trim()).then(({ jobId }) => {
      this.startPoll('quick', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 3 * 60_000,
        onReady: (job) => {
          api.quickSessionPrepare(conn, job.result.plan).then(({ session }) => {
            this.setState({ quickBusy: false, quickPlan: session });
          }).catch((e) => {
            this.setState({ quickBusy: false });
            this.toastMsg('Plan came back unusable: ' + e.message);
          });
        },
        onError: (msg) => {
          this.setState({ quickBusy: false });
          this.toastMsg('Coach could not build the session: ' + msg);
        },
      });
    }).catch((e) => {
      this.setState({ quickBusy: false });
      this.toastMsg('Quick session failed: ' + e.message);
    });
  }
  startQuickPlanSession() {
    const plan = this.state.quickPlan;
    if (!plan) return;
    this.setState({
      workoutsView: 'session',
      editingSessionId: null,
      workoutSession: { routineId: 'impromptu', routineName: plan.name, exercises: plan.exercises },
      quickPlan: null, quickNote: '',
      sessionCancelConfirm: false,
    });
  }
  newCoachChat() {
    localStorage.removeItem('novaos.coachSession');
    this.setState({ coachSessionId: null, coachChat: [] });
    this.toastMsg('Fresh coaching conversation');
  }
  saveFitnessGoals() {
    const conn = getConnection();
    const d = this.state.goalsDraft;
    if (!conn || !d.goal.trim()) { this.toastMsg('A goal is required — one sentence is enough'); return; }
    api.setWorkoutGoals(conn, { goal: d.goal, focus: d.focus, daysPerWeek: d.daysPerWeek ? Number(d.daysPerWeek) : null, equipment: d.equipment, limitations: d.limitations, notes: d.notes })
      .then(({ goals }) => {
        this.setState({ liveWorkoutGoals: goals, goalsEditing: false });
        this.toastMsg('Goals saved to the vault — the Coach reads these now');
      })
      .catch((e) => this.toastMsg('Could not save goals: ' + e.message));
  }
  doCode() {
    const conn = getConnection();
    const q = this.state.codeInput.trim();
    if (!q) return;
    if (!conn) { this.toastMsg('Connect a backend in Settings first'); return; }
    this.setState(s => ({ codeChat: [...s.codeChat, { who: 'you', text: q }], codeInput: '', codeBusy: true }));
    api.startClaudeCodeMessage(conn, q, this.state.codeSessionId, this.state.codeModel, this.state.codeWorkspace).then(({ jobId }) => {
      this.startPoll('code', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 10 * 60_000,
        onReady: (job) => this.setState(s => ({ codeBusy: false, codeSessionId: job.result.sessionId, codeChat: [...s.codeChat, { who: 'claude', text: job.result.text }] })),
        onError: (msg) => this.setState(s => ({ codeBusy: false, codeChat: [...s.codeChat, { who: 'system', text: 'Error: ' + msg }] })),
      });
    }).catch((e) => {
      this.setState(s => ({ codeBusy: false, codeChat: [...s.codeChat, { who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  setCodeWorkspace(workspace) {
    this.stopPoll('code');
    this.setState({ codeWorkspace: workspace, codeSessionId: null, codeChat: [], codeBusy: false });
  }
  newClaudeCodeSession() {
    this.stopPoll('code');
    this.setState({ codeSessionId: null, codeChat: [], codeBusy: false });
  }
  doRecipeAsk() {
    const q = this.state.recipeInput.trim(); if (!q) return;
    const r = this.recipes.find(x => x.id === this.state.openRecipeId); if (!r) return;
    this.setState(s => ({ recipeChat: [...s.recipeChat, { who: 'you', text: q }], recipeInput: '' }));
    setTimeout(() => this.typeIn('recipeChat', 'nova', recipeReply(q, r)), 480);
  }

  render() {
    const v = this.renderVals();
    return (
      <div style={css("position:relative;min-height:100vh;color:var(--nv-ink);background:radial-gradient(1200px 800px at 60% -18%, var(--nv-bg2) 0%, var(--nv-bg1) 45%, var(--nv-void) 100%)")}>
        {/* starfield — themes opt in via --nv-stars-op (Observatory keeps its sky) */}
        <div style={css("position:fixed;inset:0;pointer-events:none;opacity:var(--nv-stars-op);background-image:radial-gradient(1.5px 1.5px at 110px 90px, rgba(236,229,218,.32), transparent 100%),radial-gradient(1px 1px at 320px 40px, rgba(236,229,218,.22), transparent 100%),radial-gradient(1.5px 1.5px at 520px 150px, rgba(216,181,115,.28), transparent 100%),radial-gradient(1px 1px at 640px 70px, rgba(236,229,218,.26), transparent 100%),radial-gradient(1px 1px at 790px 210px, rgba(107,229,245,.3), transparent 100%),radial-gradient(1.5px 1.5px at 850px 50px, rgba(236,229,218,.24), transparent 100%),radial-gradient(1px 1px at 420px 260px, rgba(236,229,218,.16), transparent 100%),radial-gradient(1px 1px at 180px 330px, rgba(138,106,209,.28), transparent 100%);background-size:920px 460px")}></div>
        {/* HUD grid — Command/Ember (--nv-grid-op), masked toward the center */}
        <div style={css("position:fixed;inset:0;pointer-events:none;opacity:var(--nv-grid-op);background-image:linear-gradient(var(--nv-gridline) 1px,transparent 1px),linear-gradient(90deg,var(--nv-gridline) 1px,transparent 1px);background-size:52px 52px;-webkit-mask-image:radial-gradient(72% 62% at 50% 40%,#000 30%,transparent 100%);mask-image:radial-gradient(72% 62% at 50% 40%,#000 30%,transparent 100%)")}></div>
        {/* aurora — hue pair per theme, paused in calm mode */}
        <div style={css("position:fixed;inset:-14%;pointer-events:none;filter:blur(34px);opacity:var(--nv-aurora-op);background:radial-gradient(640px 400px at 16% 12%, var(--nv-aur1), transparent 62%),radial-gradient(600px 440px at 84% 26%, var(--nv-aur2), transparent 60%);animation:auroraDrift 26s ease-in-out infinite alternate;animation-play-state:var(--nv-anim)")}></div>

        <div style={css("position:relative;display:flex;height:100vh;max-width:1560px;margin:0 auto")}>
          {v.showSidebar && <Sidebar v={v} />}
          <main ref={this.mainRef} style={css("flex:1;overflow-y:auto;min-width:0;overscroll-behavior-y:contain;touch-action:manipulation")}>
            {v.isMission && <MissionControl v={v} />}
            {v.isInbox && <Inbox v={v} />}
            {v.isVoice && <Voice v={v} />}
            {v.isGalaxy && <Galaxy v={v} />}
            {v.isCode && <ClaudeCode v={v} />}
            {v.isRecipes && <Recipes v={v} />}
            {v.isShopping && <Shopping v={v} />}
            {v.isStash && <Stash v={v} />}
            {v.isOps && <Ops v={v} />}
            {v.isAmbient && <Ambient v={v} />}
            {v.isTodos && <Todos v={v} />}
            {v.isWorkouts && <Workouts v={v} />}
            {v.isNotes && <Notes v={v} />}
            {v.isJournal && <Journal v={v} />}
            {v.isMoney && <Money v={v} />}
            {v.isSettings && <Settings v={v} />}
          </main>
        </div>

        {v.statusBanner && (
          <div style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)',
            bottom: v.isMobile ? 'calc(76px + env(safe-area-inset-bottom))' : '18px', zIndex: 80,
            font: "500 10.5px var(--nv-font-mono2)", letterSpacing: '.06em', padding: '8px 16px',
            borderRadius: '20px', whiteSpace: 'nowrap', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis',
            color: v.statusBanner.tone === 'warn' ? '#f0b8b8' : 'rgba(236,229,218,.75)',
            background: v.statusBanner.tone === 'warn' ? 'rgba(120,40,40,.55)' : 'rgba(0,0,0,.55)',
            border: v.statusBanner.tone === 'warn' ? '1px solid rgba(201,111,111,.5)' : '1px solid rgba(216,181,115,.35)',
            backdropFilter: 'blur(8px)',
          }} role="status">{v.statusBanner.text}</div>
        )}
        {v.isMobile && <MobileChrome v={v} />}
        {v.recipeOpen && <RecipeOverlay v={v} />}
        {v.recipeAddOpen && <AddRecipeModal v={v} />}
        {v.barcodeScannerOpen && (
          <Suspense fallback={null}>
            <BarcodeScanner onDetected={v.onBarcodeDetected} onClose={v.closeBarcodeScanner} />
          </Suspense>
        )}
        {v.paletteOpen && <CommandPalette v={v} />}
        {v.ingestModalOpen && <IngestModal v={v} />}
        {v.ingestStatus !== 'idle' && <IngestReview v={v} />}
        {v.nudge && <NudgeCard v={v.nudge} />}
        {v.outboxView && <OutboxView v={v.outboxView} />}
        {v.toastOn && <Toast v={v} />}
        {v.showBoot && <Boot info={v.bootInfo} />}
      </div>
    );
  }
}

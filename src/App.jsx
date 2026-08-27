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
import { valsRecipes, CURRENT_VERSION } from './vals/valsRecipes.js';
import { valsWorkouts } from './vals/valsWorkouts.js';
import { valsNotes } from './vals/valsNotes.js';
import { valsLibrary } from './vals/valsLibrary.js';
import { valsLeader } from './vals/valsLeader.js';
import { scaleMacros, portionName, validPortion } from './portion.js';
import { valsMisc } from './vals/valsMisc.js';
import { valsInbox } from './vals/valsInbox.js';
import { valsTodos } from './vals/valsTodos.js';
import { valsMoney } from './vals/valsMoney.js';
import { valsMission } from './vals/valsMission.js';
import { valsOps } from './vals/valsOps.js';
import { valsChrome } from './vals/valsChrome.js';
import { Sidebar } from './Sidebar.jsx';
// THE DAILY FIVE — statically imported, never lazy. These are what a session
// actually opens on: Mission (the default screen), Voice (where the morning
// brief lands), Inbox, Recipes/Fuel and Train. Making any of them lazy would
// put a Suspense fallback in front of the first thing he sees.
import { MissionControl } from './screens/MissionControl.jsx';
import { Inbox } from './screens/Inbox.jsx';
import { Voice } from './screens/Voice.jsx';
import { Recipes } from './screens/Recipes.jsx';
import { Workouts } from './screens/Workouts.jsx';
import { MobileChrome } from './MobileChrome.jsx';
import { FloatingCore } from './FloatingCore.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { Toast } from './Toast.jsx';
import { ContextMenuHost } from './ContextMenu.jsx';
import { VoicePresence } from './VoicePresence.jsx';
import { Interactive } from './Interactive.jsx';
import { WakeWord } from './WakeWord.jsx';
import { NudgeCard } from './NudgeCard.jsx';
import { ModelChoicePrompt } from './ModelChoicePrompt.jsx';
import { CoachApplySheet } from './CoachApplySheet.jsx';
import { PortionSheet } from './PortionSheet.jsx';
import { Boot } from './Boot.jsx';
import { haptic } from './haptics.js';
// 0.05s of silence — a REAL source, so iOS accepts the gesture and unlocks
// the element for the reply that arrives seconds later.
const SILENT_WAV = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQ4AAAAAAAAAAAAAAAAAAAAAAA==';

import { attachSpeechElement, resumeAudioGraph, releaseAudioGraph, decodeSpeech, playSpeechBuffer, graphRunning, holdSyntheticSpeech } from './audioLevel.js';
import { watchForUpdate } from './buildCheck.js';

// Code-split: ZXing (barcode decoding) is a sizeable dependency that only
// the food-log barcode flow needs — no reason to ship it in everyone's
// initial bundle when most loads never touch it.
const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx').then((m) => ({ default: m.BarcodeScanner })));

// THE LAZY SCREENS. One 968KB chunk meant every cold start — and iOS reclaims
// a backgrounded PWA often — parsed the whole app before first paint. These
// nine are heavy and rarely the screen a session STARTS on, so they load on
// demand. `prefetchScreens()` below then pulls them in during idle, so the
// only load that ever waits is one that beat the idle callback: after that,
// navigation is as instant as it was when everything shipped up front.
// Each import resolves the NAMED export to a default — same shape the
// BarcodeScanner split above already uses.
const lazyScreen = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const SCREEN_LOADERS = {
  galaxy: () => import('./screens/Galaxy.jsx'),
  money: () => import('./screens/Money.jsx'),
  ops: () => import('./screens/Ops.jsx'),
  journal: () => import('./screens/Journal.jsx'),
  settings: () => import('./screens/Settings.jsx'),
  stash: () => import('./screens/Stash.jsx'),
  shopping: () => import('./screens/Shopping.jsx'),
  ambient: () => import('./screens/Ambient.jsx'),
  code: () => import('./screens/ClaudeCode.jsx'),
  todos: () => import('./screens/Todos.jsx'),
  notes: () => import('./screens/Notes.jsx'),
  library: () => import('./screens/Library.jsx'),
  leader: () => import('./screens/Leader.jsx'),
};
const Galaxy = lazyScreen(SCREEN_LOADERS.galaxy, 'Galaxy');
const Money = lazyScreen(SCREEN_LOADERS.money, 'Money');
const Ops = lazyScreen(SCREEN_LOADERS.ops, 'Ops');
const Journal = lazyScreen(SCREEN_LOADERS.journal, 'Journal');
const Settings = lazyScreen(SCREEN_LOADERS.settings, 'Settings');
const Stash = lazyScreen(SCREEN_LOADERS.stash, 'Stash');
const Shopping = lazyScreen(SCREEN_LOADERS.shopping, 'Shopping');
const Ambient = lazyScreen(SCREEN_LOADERS.ambient, 'Ambient');
const ClaudeCode = lazyScreen(SCREEN_LOADERS.code, 'ClaudeCode');
const Todos = lazyScreen(SCREEN_LOADERS.todos, 'Todos');
const Notes = lazyScreen(SCREEN_LOADERS.notes, 'Notes');
const Library = lazyScreen(SCREEN_LOADERS.library, 'Library');
const Leader = lazyScreen(SCREEN_LOADERS.leader, 'Leader');

// The OVERLAYS — every one is conditionally rendered (a modal, a sheet, an
// overlay), so none of them is ever part of a first paint. RecipeOverlay
// alone is 33KB of the initial bundle for a view that only exists after a
// recipe is tapped. Same lazy treatment, same idle prefetch below.
const OVERLAY_LOADERS = {
  recipeOverlay: () => import('./RecipeOverlay.jsx'),
  addRecipeModal: () => import('./AddRecipeModal.jsx'),
  ingestModal: () => import('./IngestModal.jsx'),
  ingestReview: () => import('./IngestReview.jsx'),
  outboxView: () => import('./OutboxView.jsx'),
  verdictCard: () => import('./VerdictCard.jsx'),
};
const RecipeOverlay = lazyScreen(OVERLAY_LOADERS.recipeOverlay, 'RecipeOverlay');
const AddRecipeModal = lazyScreen(OVERLAY_LOADERS.addRecipeModal, 'AddRecipeModal');
const IngestModal = lazyScreen(OVERLAY_LOADERS.ingestModal, 'IngestModal');
const IngestReview = lazyScreen(OVERLAY_LOADERS.ingestReview, 'IngestReview');
const OutboxView = lazyScreen(OVERLAY_LOADERS.outboxView, 'OutboxView');
const VerdictCard = lazyScreen(OVERLAY_LOADERS.verdictCard, 'VerdictCard');

// What a not-yet-parsed screen shows. Deliberately quiet: a chunk parse is
// tens of milliseconds after the idle prefetch, so anything busier than this
// would flash. Not a spinner — spinners read as "something is wrong".
function ScreenFallback() {
  return (
    <div style={css('display:flex;align-items:center;justify-content:center;min-height:60vh')}>
      <span style={css('width:9px;height:9px;border-radius:50%;background:var(--nv-acc);opacity:.5;animation:novaPulse 1.4s ease-in-out infinite;animation-play-state:var(--nv-anim)')}></span>
    </div>
  );
}

// Pull every lazy chunk in the background once boot has settled. The service
// worker precaches them all (globPatterns covers **/*.js), so this is about
// having them PARSED and in module cache before he taps, not about network.
// requestIdleCallback is unavailable in Safari — feature-detected, with a
// timeout fallback rather than an assumption.
let screensPrefetched = false;
function prefetchScreens() {
  if (screensPrefetched) return;
  screensPrefetched = true;
  const run = () => { for (const load of [...Object.values(SCREEN_LOADERS), ...Object.values(OVERLAY_LOADERS)]) load().catch(() => {}); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 6000 });
  else setTimeout(run, 3000);
}
// Nav intent: pointerdown on a nav row warms that screen's chunk before the
// tap even completes. Harmless when already loaded — import() is memoized.
function warmScreen(screen) {
  const load = SCREEN_LOADERS[screen];
  if (load) load().catch(() => {});
}

// Personalization — appearance now lives in src/theme.js (Settings picks the
// theme + calm mode at runtime; tokens are CSS custom properties in index.css).
const USER_NAME = 'Hayden';
const WAKE_WORD = true;

// Hash-routed screens (#/recipes etc.) so deep links and the back button work
// on GitHub Pages without a server-side router.
const SCREENS = ['mission', 'inbox', 'voice', 'galaxy', 'code', 'recipes', 'shopping', 'todos', 'workouts', 'notes', 'library', 'leader', 'journal', 'money', 'settings'];

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
  'liveNotes', 'liveLibrary', 'liveLeader', 'liveCalendar', 'liveRecipes', 'liveRecipeProfile', 'liveRotation',
  'liveFoodLog', 'liveFoodHistory', 'liveNutritionMonth', 'liveNutritionWeek', 'liveShoppingList', 'liveStash', 'liveHealthInsight', 'liveHealthDays', 'liveStreaks',
  'liveWorkoutExercises', 'liveWorkoutMuscleGroups', 'liveWorkoutTrackingTypes',
  'liveWorkoutRoutines', 'liveWorkoutSchedule', 'liveWorkoutWeekdays', 'liveWorkoutProgressions', 'liveWorkoutGoals', 'liveCarryovers', 'liveTrainOverview',
  'liveJournalEntries', 'liveGraph', 'liveInbox', 'liveDispatch', 'liveCompost', 'liveTodoist', 'liveTodos', 'liveGuardian', 'liveMoney',
  // fetched every sync anyway — excluding them just blanked flagship surfaces
  // (About You, Daily Review card, learning panel) on every phone reload
  'liveDailyReview', 'liveProfile', 'liveLearning',
  // the surfaces added this week — omitted here they went BLANK the moment the
  // Mac slept, which is exactly when the phone is all he has
  'liveOps', 'liveOvernight', 'liveSkills', 'livePulse',
  // the Stream self-labels with timestamps, so a cached copy degrades honestly
  'liveOpsStream',
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
    paletteOpen: false, recallResults: [],
    micOn: true, orbInput: '',
    voiceChat: [], voiceBusy: false, voiceSpeaking: false, liveTts: null,
    briefQueue: null, briefQueueIdx: 0, briefQueueRemaining: 0,
    updateReady: null, // a newer Nova is deployed than the one running
    voiceConvMode: false, voiceConvPaused: false, voiceAutoListenTick: 0,
    voiceSessionId: typeof localStorage === 'undefined' ? null : (localStorage.getItem('novaos.voiceSession') || null),
    speechVoices: [], speechVoiceURI: typeof localStorage === 'undefined' ? '' : (localStorage.getItem('novaos.speechVoiceURI') || ''),
    coachSessionId: typeof localStorage === 'undefined' ? null : (localStorage.getItem('novaos.coachSession') || null),
    // the Leader — leadership development: state mirror + its conversation
    liveLeader: null, leaderChat: [], leaderInput: '', leaderBusy: false,
    leaderSessionId: typeof localStorage === 'undefined' ? null : (localStorage.getItem('novaos.leaderSession') || null),
    voiceSpeak: typeof localStorage === 'undefined' ? true : localStorage.getItem('novaos.voiceSpeak') !== '0',
    // opt-in (see setWakeWord) and remembered per device
    wakeWordOn: typeof localStorage === 'undefined' ? false : localStorage.getItem('novaos.wakeWord') === '1',
    sidebarHidden: typeof localStorage === 'undefined' ? false : localStorage.getItem('novaos.sidebarHidden') === '1',
    voiceVoiceId: typeof localStorage === 'undefined' ? '' : (localStorage.getItem('novaos.voiceId') || ''),
    orbChat: [
      { who: 'nova', text: 'Good morning, sir. Sleep recovery is complete and push day is locked for 17:30.' },
      { who: 'you', text: 'Anything I should know before deep work?' },
      { who: 'nova', text: 'Two things: Studio finished your cold-open draft, and you are 84 g short on protein pace. The burrito bowl at 12:30 covers it.' },
    ],
    recipeFilter: 'All', openRecipeId: null, servings: 1, recipeInput: '', recipeChat: [],
    recipeAltSelected: null,
    recipeTweakInput: '', recipeTweakBusy: false, recipeTweakError: null, recipeTweakPreview: null, recipeTweakPhotos: [],
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
    codeChanges: null, codeChangesOpen: false, codeCommitMsg: '', codeChangeBusy: false, codeShelf: null,
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
    liveFoodLog: null, liveFoodHistory: null, liveNutritionMonth: null, foodHistoryOpen: false,
    // retro tracking: null = today; a past YYYY-MM-DD flips the log view and
    // its adds/removes to that day, while today's gauges keep liveFoodLog
    foodLogDate: null, liveFoodLogView: null,
    liveStash: null, stashAddCategory: '', stashAddName: '', stashAddUrl: '', stashAddNote: '', stashAddBusy: false, stashAddError: null, stashRemoveConfirm: null,
    foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodLogBusy: false, foodLogError: null,
    foodScanNote: '', foodScanPhotos: [], foodScanBusy: false, foodScanSlow: false, foodScanError: null, foodScanQuestion: null, foodLogFillSource: null,
    foodDescribeInput: '',
    // a low-confidence scan's clarifying question stays ANSWERABLE: the photos
    // + note that produced it are kept so an answer can re-run the same scan
    foodScanQAPhotos: [], foodScanQANote: '', foodScanAnswer: '',
    barcodeScannerOpen: false,
    noteQuery: '', noteType: 'All', openNoteId: 'n1',
    galaxySel: null, toast: null, reviewIdx: 0,
    ctxMenu: null, // the long-press / right-click menu: { x, y, title?, items }
    verdict: null, verdictBusy: false, // A1 — a question answered as a card
    jobTrayOpen: false, // C3 — in-flight work, visible
    prCelebration: null, // D2 — the star moment when a save contains PRs
    // NOVA LIVE — native conversation from the orb, on any screen
    liveTalkOn: false, liveInput: '', liveAsk: '', liveReply: '', liveVerdictOffer: null, liveVerdict: null,
    // the transcript pop-up is OPT-IN (long-press the core) — his ask: the
    // icon alone, no text box interrupting what he's doing. liveMicOpen is
    // the mic's TRUE state, reported up from the dictation hook, so the orb
    // can colour itself listening without lying (the old `micOn` is a
    // settings flag that defaults on — it said "listening" permanently).
    liveTextOpen: false, liveMicOpen: false, voiceScreenMic: false, voicePendingOffer: null,
    // set when a reply was composed but the device refused to play it —
    // silence must never also be invisible
    speechBlocked: null,
    // THE MODEL CHOICE GATE — { lane: 'research'|'watch', run(model) } while
    // a reasoning-heavy job is waiting on "Opus or Sonnet?"; null the rest
    // of the time. One at a time, same as a pending proposal.
    modelChoicePending: null,
    // THE GLASS — the card for the line Nova is speaking RIGHT NOW, and the
    // ones it has already spoken past (newest first). Set as each beat's
    // audio starts, never before: the visual must track the voice.
    stageCard: null, stageHistory: [], stageFocus: false,
    isMobile: typeof window !== 'undefined' && window.innerWidth < 760,
    novaTheme: getNovaTheme(), calmMode: getCalm(), coreStyle: getCoreStyle(), novaStyle: getNovaStyle(),

    // nova inbox (capture → classify → file) + the loops riding its rails
    liveInbox: null, inboxInput: '', inboxCaptureBusy: false, inboxActionBusy: {},
    inboxAskWhy: null, inboxWhyText: '', // decline-asks-why on Coach advice
    inboxMode: (typeof window !== 'undefined' && INBOX_MODES.includes(localStorage.getItem(INBOX_MODE_KEY))) ? localStorage.getItem(INBOX_MODE_KEY) : 'auto-high',
    inboxProposalDismissed: (() => { try { const a = JSON.parse(localStorage.getItem('novaos.proposalsDismissed') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })(),
    liveDispatch: null, liveCompost: null, liveTodoist: null, liveTodos: null, liveGuardian: null, liveDailyReview: null, liveOps: null,
    liveOvernight: null, overnightInput: '', liveSkills: null, livePulse: null, opsOpenAgentId: null, liveOpsStream: null, greetBanner: null,
    dispatchBusy: false, compostBusy: false, compostActionBusy: {}, todoistBusy: false, guardianBusy: false, reviewBusy: false,
    todoInput: '', todoEditCategoryKey: null,
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
    portionSheet: null, // { name, macros, source } — log any meal/variant, from anywhere
    coachApplyPending: null, coachApplyNote: '', coachApplyBusy: false,
    foodEditId: null, foodEditName: '', foodEditP: '', foodEditC: '', foodEditF: '', foodEditKcal: '',
    foodRecipePickerOpen: false, foodRecipePickerQuery: '', foodRecipePick: null, foodPortionFactor: 1, foodPortionCustom: '',
    liveNotes: null, liveNoteDetails: {},
    liveLibrary: null, liveLibraryDetails: {}, liveBookCoverUrls: {}, libraryFilter: 'all', libraryQuery: '', libraryOpenId: null, liveCalendar: null, liveCalendarList: null, calCmdText: '', calCmdBusy: false,
    // the model board (Settings): null until loaded, so "not loaded" and
    // "loaded and empty" can never be confused
    // groups render OPEN by default — the whole point is seeing every lane's
    // state at a glance; this map holds only the ones he has collapsed
    liveModelPrefs: null, modelPrefsError: false, modelPrefsBusy: null, modelPrefsCollapsed: {},
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
    shoppingClearArmed: false, shoppingClearBusy: false, shoppingCleared: [],

    // workouts
    liveWorkoutExercises: null, liveWorkoutMuscleGroups: null, liveWorkoutTrackingTypes: null,
    liveWorkoutRoutines: null, liveWorkoutSchedule: null, liveWorkoutWeekdays: null, liveWorkoutProgressions: null,
    workoutsView: 'routines', openRoutineId: null,
    routineCreating: false, routineNewName: '',
    routineDeleteConfirm: false,
    exercisePickerOpen: false, exercisePickerQuery: '', exercisePickerMuscle: 'Any',
    exercisePickerCreateMuscle: '', exercisePickerCreateTrackingType: 'weight_reps',
    // 'routine' (default, writes to the vault template) or 'session' (his
    // 21-Aug ask: a one-off extra lift for TODAY only, never the program)
    exercisePickerMode: 'routine',
    workoutSession: null, workoutSessionSavedAt: null, sessionCancelConfirm: false,
    liveWorkoutHistory: null, historyRoutineId: null,
    discardedDraft: null, // a discarded workout still inside its 7-day window

    // daily review + journal
    reviewShuffleIdx: null,
    reviewReflectOpen: false, reviewReflectText: '', reviewReflectBusy: false, reviewReflectError: null,
    reviewReflectPromptBusy: false, reviewReflectPromptText: null,
    liveJournalEntries: null,
    journalComposerText: '', journalSaveBusy: false, journalSaveError: null,
    journalPromptBusy: false, journalPromptText: null,
    journalOpenDate: null, journalFilter: 'all',

    // transcript ingest
    ingestModalOpen: false, ingestText: '', ingestSourceUrl: '', ingestBookTitle: '', ingestBookAuthor: '',
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
    // opening straight onto the Code screen (a reload, a deep link) must
    // still show what's uncommitted — navigate() only fires on a CHANGE
    if (this.state.screen === 'code') this.refreshCodeChanges();
    this.checkPushState();
    // Boot has settled — pull the lazy screen chunks in the background so the
    // first navigation to any of them never waits on a parse.
    prefetchScreens();
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
    // same reclaim, for a food scan/describe that was mid-flight — see
    // persistFoodScanJob for why this exists at all
    try {
      const pendingFood = JSON.parse(localStorage.getItem('novaos.foodScanJob') || 'null');
      const conn2 = getConnection();
      if (pendingFood?.jobId && conn2 && Date.now() - (pendingFood.startedAt || 0) < 10 * 60_000) {
        this.attachFoodScanPoll(conn2, pendingFood.jobId, pendingFood);
      } else if (pendingFood) {
        localStorage.removeItem('novaos.foodScanJob');
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
    // ANY FIRST TAP UNLOCKS THE VOICE — not just the one on the little bar.
    //
    // An automatic brief has no gesture behind it, so iOS refuses playback
    // outright (NotAllowed) and the brief goes silent. The recovery already
    // existed, but it depended on him NOTICING a thin "TAP TO HEAR" strip at
    // the bottom of the screen and hitting it specifically — while the
    // obvious thing to tap, and the thing the card itself tells him to tap,
    // is anywhere at all. Every tap now re-primes the audio path inside the
    // gesture (cheap and idempotent) and, if lines are sitting blocked,
    // starts them. The guard stops a tap ON the bar from playing twice.
    this.tapUnlockH = () => {
      this.primeSpeech();
      if (this.replayGuard || !this.state.speechBlocked) return;
      this.replayGuard = true;
      this.replayBlockedSpeech();
      setTimeout(() => { this.replayGuard = false; }, 900);
    };
    window.addEventListener('pointerdown', this.tapUnlockH, { passive: true });
    // Back/forward navigation re-derives the screen from the hash.
    this.popH = () => this.setState({ screen: screenFromHash() });
    window.addEventListener('popstate', this.popH);
    window.addEventListener('hashchange', this.popH);
    this.keyH = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.setState(s => ({ paletteOpen: !s.paletteOpen, recallResults: [] })); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); this.toggleSidebar(); }
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
    window.removeEventListener('pointerdown', this.tapUnlockH);
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
    try {
      const t = document.startViewTransition(() => { flushSync(() => fn()); });
      // A transition started while another is mid-flight SUPERSEDES it, and
      // the superseded one rejects `.finished`/`.updateCallbackDone` with
      // AbortError: "Transition was skipped". That is normal, expected
      // behaviour on a fast tab-hop — but unhandled it surfaces as an
      // unhandled promise rejection (3 of them in a 16-screen walk). The
      // navigation itself is unaffected (verified: the last tap still wins);
      // this only silences the noise. The try/catch above cannot do it —
      // these are async rejections, not synchronous throws.
      t?.finished?.catch(() => {});
      t?.updateCallbackDone?.catch(() => {});
    } catch { fn(); }
  }
  navigate(screen, extra = {}) {
    const changed = this.state.screen !== screen;
    // SCROLL RESTORATION. One shared scroller means leaving a screen loses
    // your place in it — a reset to 0 was the old fix, and it's why coming
    // back to a long list always dumped you at the top. Positions live on a
    // plain instance field (not state: zero re-renders) and are session-only
    // by design — a reload starts fresh, which is what iOS does after it
    // kills an app. A screen never visited restores to 0, same as before.
    //
    // Voice and Ambient opt out: Voice owns its own auto-scroll-to-bottom
    // (restoring a stale offset would fight it mid-conversation), and
    // Ambient is a single non-scrolling wall view.
    const NO_RESTORE = new Set(['voice', 'ambient']);
    if (changed && this.mainRef?.current) {
      this.scrollPositions = this.scrollPositions || {};
      this.scrollPositions[this.state.screen] = this.mainRef.current.scrollTop;
    }
    // screens cross-fade rather than cut; anything carrying a shared
    // view-transition-name across the two screens morphs instead
    const apply = () => this.setState({ screen, ...extra }, () => {
      if (!changed || !this.mainRef?.current) return;
      const saved = NO_RESTORE.has(screen) ? 0 : (this.scrollPositions?.[screen] || 0);
      this.mainRef.current.scrollTop = saved;
      // A lazy screen's content mounts a frame or two later (Suspense
      // resolving), and setting scrollTop before the content exists clamps
      // it to 0 — so re-apply once after paint. Cheap, and a no-op when the
      // first assignment already stuck.
      if (saved > 0) requestAnimationFrame(() => {
        if (this.state.screen === screen && this.mainRef?.current) this.mainRef.current.scrollTop = saved;
      });
    });
    if (changed) { this.withTransition(apply); this.noteScreenVisit(screen); } else apply();
    if (changed && screen === 'voice') this.maybeGreet('voice');
    if (changed && screen === 'code') this.refreshCodeChanges(); // the diff is the first thing he wants to see
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
      food: (conn, p) => api.addFoodLogEntry(conn, { name: p.name, macros: p.macros, source: p.source, date: p.date }),
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

  // Delete a recipe from the bank. Two-tap confirm (armed state on the
  // button), and the server clears any rotation slot pointing at it first.
  deleteRecipe(recipeId, name) {
    const conn = getConnection();
    if (!conn) return;
    api.deleteRecipe(conn, recipeId).then(() => {
      this.setState((s) => ({
        liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.filter((r) => r.id !== recipeId)),
        recipeOverlay: null, recipeAltSelected: null, recipeDeleteArmed: null,
      }));
      this.refreshLiveData();
      this.toastMsg(`${name} removed from the bank`);
    }).catch((e) => { this.setState({ recipeDeleteArmed: null }); this.toastMsg('Could not delete: ' + e.message); });
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
    if (!conn || !openRecipeId || !label) return;
    // THE CURRENT VERSION renames through its own route. It has no altId
    // because it isn't an alternate — it's the recipe's main block — and
    // that is exactly why it could never be renamed before: the rename UI
    // keys off an altId, so the version actually in use was skipped and
    // whatever he typed was lost the moment he switched away.
    if (recipeRenameAltId === CURRENT_VERSION) {
      api.renameCurrentVersion(conn, openRecipeId, label).then(({ recipe }) => {
        this.setState((s) => ({
          liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r))),
          recipeRenameAltId: null, recipeRenameValue: '', recipeRenameError: null,
        }));
        this.toastMsg(`Renamed to “${label}”`);
      }).catch((e) => this.setState({ recipeRenameError: e.message }));
      return;
    }
    if (!recipeRenameAltId) return;
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
    }).then(({ recipe, warning }) => {
      this.setState((s) => ({
        liveRecipes: (this.noteLocalWrite('recipes'), s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r))),
        recipeEdit: null, recipeEditBusy: false, recipeEditError: null,
      }));
      if (warning) this.toastMsg(warning); // ingredients moved, numbers didn't
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
    // OPTIMISTIC: the link appears under its category immediately and the
    // form clears. The server's reply carries every category, replacing the
    // list wholesale — so the temp row is superseded, never merged, and
    // duplication is impossible by construction (same shape as the food log).
    const previousStash = this.state.liveStash;
    const previousForm = { stashAddName: this.state.stashAddName, stashAddUrl: this.state.stashAddUrl, stashAddNote: this.state.stashAddNote };
    if (previousStash) {
      haptic('commit');
      const optimistic = previousStash.map((c) => (c.name === item.category
        ? { ...c, items: [...c.items, { ...item, raw: `pending-${Date.now()}`, pending: true }] }
        : c));
      this.setState({ liveStash: optimistic });
    }
    this.setState({ stashAddBusy: true, stashAddError: null, stashAddName: '', stashAddUrl: '', stashAddNote: '' });
    api.stashAdd(conn, item).then((r) => {
      this.setState({ liveStash: r.categories, stashAddBusy: false });
      this.toastMsg(`${item.name} stashed ✓ — saved to Obsidian too`);
    }).catch((e) => {
      if (previousStash) this.setState({ liveStash: previousStash });
      if (isOfflineError(e)) {
        // queued, not lost — the form stays clear
        this.setState({ stashAddBusy: false });
        this.enqueueOutbox('stash', item.name, item);
        return;
      }
      // a real rejection: hand back exactly what he typed
      this.setState({ ...previousForm, stashAddBusy: false, stashAddError: e.message });
    });
  }
  removeStashItem(raw) {
    const conn = getConnection();
    if (!conn) return;
    // optimistic removal — the row goes now, and returns if the server says no
    const previousStash = this.state.liveStash;
    if (previousStash) {
      haptic('tick');
      this.setState({ stashRemoveConfirm: null, liveStash: previousStash.map((c) => ({ ...c, items: c.items.filter((i) => i.raw !== raw) })) });
    } else {
      this.setState({ stashRemoveConfirm: null });
    }
    api.stashRemove(conn, raw).then((r) => this.setState({ liveStash: r.categories }))
      .catch((e) => {
        if (previousStash) this.setState({ liveStash: previousStash });
        this.toastMsg('Could not remove: ' + e.message);
      });
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
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk.includes('data:')) continue;
        // A chunk can carry more than one event; read every one, because each
        // carries its own slice tag and dropping one loses that tag.
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          let payload = null;
          try { payload = JSON.parse(line.slice(5)); } catch { /* not JSON — treat as untagged */ }
          if (payload?.kind === 'hello') continue; // the stream handshake, not a write
          this.queueStreamRefresh(payload);
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
    // a queued nudge must not wake a backgrounded app to sync; the pending
    // tags stay in the set and the resume path does a full sync anyway
    clearTimeout(this.streamRefreshT);
    this.streamRefreshT = null;
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
    // …and the model board, for the same reason
    if (this.state.screen === 'settings' && prevState.screen !== 'settings' && this.state.liveModelPrefs == null && getConnection()) {
      this.loadModelPrefs();
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
            if (!conn || !s) return;
            api.saveSessionDraft(conn, { workoutSession: s, editingSessionId: this.state.editingSessionId, capturedAt: this.state.workoutSessionSavedAt || Date.now() })
              // the weekly volume bars count the live session now, so once the
              // draft has landed, pull the overview again — the bars move as he
              // ticks instead of only when he finishes (his ask, mid-workout)
              .then(() => api.trainOverview(conn))
              .then((r) => this.setState({ liveTrainOverview: r }))
              .catch(() => {});
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
    apply('library', (r) => { this.setState({ liveLibrary: r.items }); this.refreshBookCovers(r.items); });
    apply('leader', (r) => this.setState({ liveLeader: r }));
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
    apply('nutritionMonth', (r) => this.setState({ liveNutritionMonth: r }));
    apply('nutritionWeek', (r) => this.setState({ liveNutritionWeek: r }));
    apply('trainOverview', (r) => this.setState({ liveTrainOverview: r }));
    apply('fuelCross', (r) => this.setState({ liveFuelCross: r }));
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
    apply('opsStream', (r) => this.setState({ liveOpsStream: r }));
    apply('overnight', (r) => this.setState({ liveOvernight: r }));
    apply('skills', (r) => this.setState({ liveSkills: r.departments }));
    apply('pulse', (r) => this.setState({ livePulse: r.topics }));
    return ok;
  }
  // A write nudge arrived. If the server told us WHICH slices it touched
  // (lib/writeSlices.js) we can pull three instead of thirty — a todo
  // checkbox, or every set of a workout, no longer costs a whole snapshot.
  //
  // Two rules keep this honest:
  //   - An untagged nudge poisons the whole batch into a full sync. Unknown
  //     means unknown; we never narrow on a guess.
  //   - Coalesced events must ACCUMULATE, never drop. The old code discarded
  //     any nudge landing within 3s of the last refresh, which was harmless
  //     when every refresh was a full one — with targeted syncs, a dropped
  //     tag is a slice that silently never updates. So the burst is queued
  //     and flushed at the end of the window instead.
  queueStreamRefresh(payload) {
    if (!this.pendingSlices) this.pendingSlices = new Set();
    const tagged = Array.isArray(payload?.slices) && payload.slices.length > 0;
    if (tagged) for (const s of payload.slices) this.pendingSlices.add(s);
    else this.pendingFullSync = true;
    if (this.streamRefreshT) return; // a flush is already scheduled — it will pick this up
    // A single write usually emits TWO events: the route's own domain
    // broadcast and the generic one from the write chokepoint. Flushing on
    // the first would sync twice for one change (measured: two identical
    // ?only=todos requests), so always wait a beat and let siblings merge.
    // 150ms is below the threshold where a screen update reads as delayed.
    const wait = Math.max(150, 3000 - (Date.now() - (this.lastEventRefresh || 0)));
    this.streamRefreshT = setTimeout(() => {
      this.streamRefreshT = null;
      this.lastEventRefresh = Date.now();
      const full = this.pendingFullSync;
      const only = [...this.pendingSlices];
      this.pendingFullSync = false;
      this.pendingSlices.clear();
      if (full || !only.length) this.refreshLiveData();
      else this.refreshSlices(only);
    }, wait);
  }

  // Targeted sync: the same snapshot endpoint, narrowed. Any failure falls
  // back to the full pass, so the worst case is the behaviour we had before.
  async refreshSlices(only) {
    const conn = getConnection();
    if (!conn) return;
    if (this.refreshInFlight) return; // a full sync is already running and covers these
    try {
      const startedAt = Date.now();
      const { slices } = await api.snapshot(conn, { only });
      this.applySnapshot(slices, startedAt);
      this.setState({ connectionStatus: 'connected', lastSyncAt: new Date().toISOString() }, () => {
        // keep the offline cache current too, or a reload would show the
        // pre-write copy of a slice that did update on screen
        const cached = {};
        for (const key of CACHED_LIVE_KEYS) cached[key] = this.state[key];
        saveLiveCache(cached);
      });
    } catch {
      this.refreshLiveData();
    }
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
      async () => { const r = await api.library(conn); this.setState({ liveLibrary: r.items }); this.refreshBookCovers(r.items); },
      async () => this.setState({ liveLeader: await api.leader(conn) }),
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
      async () => this.setState({ liveNutritionMonth: await api.nutritionMonth(conn) }),
      async () => this.setState({ liveNutritionWeek: await api.nutritionWeek(conn) }),
      async () => this.setState({ liveTrainOverview: await api.trainOverview(conn) }),
      async () => this.setState({ liveFuelCross: await api.fuelCross(conn) }),
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
        // The snapshot no longer waits on a slow slice (a cold CalDAV
        // calendar was holding EVERY sync to ~5-10s) — a slice that missed
        // its server-side budget arrives absent. The calendar is the only
        // slice that realistically misses; fetch the straggler directly,
        // unbudgeted, so today's events land seconds behind the fast sync
        // instead of a whole sync-cycle later. Cached data covers the gap.
        if (slices.calendar === undefined) {
          api.calendarToday(conn, { timeoutMs: 30_000 })
            .then((r) => this.setState({ liveCalendar: r.events }))
            .catch(() => {}); // next sync tries again; the cached copy stands
        }
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
          // the doorman meets him at whatever door he came in — the due
          // check (once a day / 3h gap) keeps this from re-greeting on the
          // routine syncs that also land here
          // FIRST OPEN OF THE DAY: the full morning brief takes precedence
          // over the doorman's hello — it IS the greeting, and a longer one.
          // Watch for a newer deploy than the bundle we are executing.
          // Started here because this is the point the app is genuinely live.
          if (!this.updateWatch) {
            this.updateWatch = watchForUpdate((deployed) => this.setState({ updateReady: deployed }));
          }
          if (!this.briefChecked) {
            this.briefChecked = true;
            this.maybeMorningBrief();
          }
          this.maybeGreet('arrive');
          // a session draft on the server must survive even a localStorage
          // wipe + an offline boot: re-check once per page load on the first
          // successful sync (the boot check fails silently at the gym)
          // a discard is undoable for 7 days — surface it on Train so an
          // accidental one (his, or a stray tap) is never terminal
          if (!this.discardedChecked) {
            this.discardedChecked = true;
            api.getDiscardedDraft(conn)
              .then(({ draft }) => { if (draft) this.setState({ discardedDraft: draft }); })
              .catch(() => { this.discardedChecked = false; });
          }
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
    haptic('tick');
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
  // Retro tracking: flip the food log to a past day. The list, adds, and
  // removes all address THAT day; today's gauges keep reading liveFoodLog.
  setFoodLogDate(date) {
    const conn = getConnection();
    this.setState({ foodLogDate: date, liveFoodLogView: null, foodLogError: null });
    if (!conn || !date) return;
    api.foodLog(conn, date)
      .then((day) => this.setState((s) => (s.foodLogDate === date ? { liveFoodLogView: day } : null)))
      .catch((e) => this.toastMsg(e.message));
  }
  // one place decides which state slice a food-log day belongs in
  applyFoodLogDay(day) {
    if (this.state.foodLogDate && day.date === this.state.foodLogDate) this.setState({ liveFoodLogView: day });
    else if (!this.state.foodLogDate) this.setState({ liveFoodLog: day });
  }
  submitFoodLog() {
    const conn = getConnection();
    const name = this.state.foodLogName.trim();
    const macros = { p: Number(this.state.foodLogP) || 0, c: Number(this.state.foodLogC) || 0, f: Number(this.state.foodLogF) || 0, kcal: Number(this.state.foodLogKcal) || 0 };
    const date = this.state.foodLogDate || undefined;
    if (!conn || !name) return;
    const source = this.state.foodLogFillSource || 'manual';
    // OPTIMISTIC: the entry appears (and the macro gauges move) in the same
    // frame, and the form clears so the next thing can be typed immediately.
    // Duplication is impossible by construction — the server's reply carries
    // the WHOLE day and applyFoodLogDay replaces it wholesale, so the temp
    // row is superseded rather than merged. A failure removes it again and
    // puts his numbers back in the form so nothing typed is lost.
    const previousDay = this.state.foodLogDate ? this.state.liveFoodLogView : this.state.liveFoodLog;
    const previousForm = {
      foodLogName: this.state.foodLogName, foodLogP: this.state.foodLogP, foodLogC: this.state.foodLogC,
      foodLogF: this.state.foodLogF, foodLogKcal: this.state.foodLogKcal, foodLogFillSource: this.state.foodLogFillSource,
    };
    const clearForm = {
      foodLogBusy: false, foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodLogFillSource: null,
      foodScanQuestion: null, foodScanQAPhotos: [], foodScanQANote: '', foodScanAnswer: '',
    };
    if (previousDay?.entries) {
      haptic('commit');
      this.noteLocalWrite('foodLog');
      this.applyFoodLogDay({ ...previousDay, entries: [...previousDay.entries, { id: `pending-${Date.now()}`, name, macros, source, pending: true }] });
    }
    this.setState({ ...clearForm, foodLogBusy: true, foodLogError: null });
    api.addFoodLogEntry(conn, { name, macros, source, date }).then((day) => {
      this.noteLocalWrite('foodLog');
      this.applyFoodLogDay(day); // whole-day replace — the temp row is gone
      this.setState({ foodLogBusy: false });
      if (this.state.foodHistoryOpen) this.loadFoodHistory();
    }).catch((e) => {
      // the optimistic row goes either way — it was never real
      if (previousDay) this.applyFoodLogDay(previousDay);
      if (isOfflineError(e)) {
        // Queue it and leave the form CLEAR: the entry is not lost, it is
        // waiting in the Outbox, and re-showing his numbers would imply it
        // still needs re-typing. `source` is the captured value, not a state
        // read — the form has already been cleared by this point.
        this.setState({ foodLogBusy: false });
        this.enqueueOutbox('food', name, { name, macros, source, date });
        return;
      }
      // a real rejection: give him his numbers back so nothing typed is lost
      this.setState({ ...previousForm, foodLogBusy: false, foodLogError: e.message });
    });
  }
  deleteFoodLogEntry(id) {
    const conn = getConnection();
    if (!conn) return;
    const date = this.state.foodLogDate || undefined;
    // optimistic removal — the row goes now, and comes back if the server says no
    const previousDay = this.state.foodLogDate ? this.state.liveFoodLogView : this.state.liveFoodLog;
    if (previousDay?.entries) {
      haptic('tick');
      this.noteLocalWrite('foodLog');
      this.applyFoodLogDay({ ...previousDay, entries: previousDay.entries.filter((en) => en.id !== id) });
    }
    api.deleteFoodLogEntry(conn, id, date)
      .then((day) => { this.noteLocalWrite('foodLog'); this.applyFoodLogDay(day); })
      .catch((e) => {
        if (previousDay) this.applyFoodLogDay(previousDay);
        this.toastMsg('Could not remove entry: ' + e.message);
      });
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
  // A food-scan/describe job used to live ONLY in memory: `this.pollers` and
  // the poll's closure. A slow one (a real web search can run well past a
  // minute) regularly outlived the tab — iOS reclaims a backgrounded PWA
  // under memory pressure, which wipes all JS state — and the answer, sitting
  // finished on the server the whole time, was never seen again. Reload,
  // still says "Analyzing…" a second ago and now shows nothing: indistin-
  // guishable from "the search doesn't work" (his exact report). Persist
  // just enough to reattach, the same mechanism novaos.askJob already proved
  // for Ask Nova.
  persistFoodScanJob(jobId, meta) {
    try { localStorage.setItem('novaos.foodScanJob', JSON.stringify({ jobId, ...meta, startedAt: Date.now() })); } catch { /* best-effort */ }
  }
  clearFoodScanJob() {
    try { localStorage.removeItem('novaos.foodScanJob'); } catch { /* best-effort */ }
  }
  // Shared by a fresh dispatch AND a reattach after reload — meta.kind picks
  // which fields the result fills. `photos`/`note` are the SCAN continuation
  // (his answer to a low-confidence question); they exist only in memory, so
  // a reattach after a real reload loses them same as it always would — this
  // fix is about not losing the ANSWER, not about surviving every follow-up.
  attachFoodScanPoll(conn, jobId, meta) {
    this.setState({ foodScanBusy: true, foodScanSlow: false });
    clearTimeout(this.foodScanSlowTimer);
    this.foodScanSlowTimer = setTimeout(() => this.setState({ foodScanSlow: true }), 5000);
    this.startPoll('foodScan', () => api.foodScanJob(conn, jobId), {
      intervalMs: meta.kind === 'describe' ? 900 : 800,
      onReady: (job) => {
        clearTimeout(this.foodScanSlowTimer);
        this.clearFoodScanJob();
        const r = job.result;
        const asks = r.confidence === 'low' && r.question;
        if (meta.kind === 'describe') {
          this.setState({
            foodScanBusy: false, foodScanError: null, foodDescribeInput: '',
            foodLogFillSource: 'described',
            foodScanQuestion: asks ? r.question : null,
            foodScanQAPhotos: [], foodScanQANote: asks ? meta.text : '',
            foodLogName: r.name || meta.text,
            foodLogP: r.macros?.p != null ? String(r.macros.p) : '',
            foodLogC: r.macros?.c != null ? String(r.macros.c) : '',
            foodLogF: r.macros?.f != null ? String(r.macros.f) : '',
            foodLogKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
          });
          this.toastMsg(asks ? 'Estimated — rough, check the fields below' : 'Estimated — check the fields below before adding');
        } else {
          this.setState({
            foodScanBusy: false, foodScanError: null,
            foodScanPhotos: [], foodScanNote: '',
            foodLogFillSource: 'scan', // provenance survives to the log entry
            foodScanQuestion: asks ? r.question : null,
            // keep what produced the question so an answer can re-estimate
            // (answering is optional — the fields below are always saveable)
            foodScanQAPhotos: asks ? (meta.photos || []) : [],
            foodScanQANote: asks ? (meta.note || '') : '',
            foodLogName: r.name || '',
            foodLogP: r.macros?.p != null ? String(r.macros.p) : '',
            foodLogC: r.macros?.c != null ? String(r.macros.c) : '',
            foodLogF: r.macros?.f != null ? String(r.macros.f) : '',
            foodLogKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
          });
          this.toastMsg(r.confidence === 'low' ? 'Analyzed — rough estimate, check the fields below' : 'Analyzed — check the fields below before saving');
        }
      },
      onError: (msg) => { clearTimeout(this.foodScanSlowTimer); this.clearFoodScanJob(); this.setState({ foodScanBusy: false, foodScanError: msg }); },
    });
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
        this.persistFoodScanJob(jobId, { kind: 'scan', note });
        this.attachFoodScanPoll(conn, jobId, { kind: 'scan', photos, note });
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
        this.persistFoodScanJob(jobId, { kind: 'describe', text });
        this.attachFoodScanPoll(conn, jobId, { kind: 'describe', text });
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
  // Log part of a recipe he already has — his ask: a bag stored as one full
  // serving, eaten a third at a time, without re-entering it as a new food.
  // LOG ANY MEAL, FROM ANYWHERE. His ask: he saved an alternative Bacon Egg
  // Fold and could not log it without promoting it to primary — a variant he
  // eats sometimes should not have to become the recipe. This takes any
  // {name, macros} (a recipe, a saved variant, a scanned meal) and opens the
  // portion chooser over it, so the same fractions/custom/past-day machinery
  // serves every surface instead of each one needing its own button wired by
  // hand.
  openPortionSheet(item) {
    if (!item?.macros) return;
    this.setState({ portionSheet: { name: item.name, macros: item.macros, source: item.source || 'recipe' }, foodPortionFactor: 1, foodPortionCustom: '' });
  }
  closePortionSheet() {
    this.setState({ portionSheet: null, foodPortionCustom: '' });
  }
  confirmPortionSheet() {
    const conn = getConnection();
    const item = this.state.portionSheet;
    if (!conn || !item) return;
    const custom = this.state.foodPortionCustom.trim();
    const factor = custom ? Number(custom) : this.state.foodPortionFactor;
    if (!validPortion(factor)) { this.toastMsg('That portion doesn’t look right — try something between a sliver and 20 servings.'); return; }
    const name = portionName(item.name, factor);
    const macros = scaleMacros(item.macros, factor);
    const date = this.state.foodLogDate || undefined;
    this.setState({ portionSheet: null, foodPortionCustom: '' });
    api.addFoodLogEntry(conn, { name, macros, source: item.source, date })
      .then((day) => {
        this.noteLocalWrite('foodLog');
        this.applyFoodLogDay(day);
        this.toastMsg(`Logged ${name}${date ? ` to ${date}` : ''} ✓`);
      })
      .catch((e) => this.toastMsg('Could not log that: ' + e.message));
  }
  openFoodRecipePicker() {
    this.setState({ foodRecipePickerOpen: true, foodRecipePickerQuery: '', foodRecipePick: null, foodPortionFactor: 1, foodPortionCustom: '' });
  }
  closeFoodRecipePicker() {
    this.setState({ foodRecipePickerOpen: false, foodRecipePick: null, foodPortionCustom: '' });
  }
  pickFoodRecipe(recipe) {
    this.setState({ foodRecipePick: recipe, foodPortionFactor: 1, foodPortionCustom: '' });
  }
  logRecipePortion() {
    const conn = getConnection();
    const pick = this.state.foodRecipePick;
    if (!conn || !pick) return;
    const custom = this.state.foodPortionCustom.trim();
    const factor = custom ? Number(custom) : this.state.foodPortionFactor;
    if (!validPortion(factor)) { this.toastMsg('That portion doesn’t look right — try something between a sliver and 20 servings.'); return; }
    const name = portionName(pick.name, factor);
    const macros = scaleMacros(pick.macros, factor);
    const date = this.state.foodLogDate || undefined;
    this.closeFoodRecipePicker();
    // optimistic, like every other food write — the day updates instantly and
    // the server's copy replaces it when it lands
    api.addFoodLogEntry(conn, { name, macros, source: 'recipe', date })
      .then((day) => {
        this.noteLocalWrite('foodLog');
        this.applyFoodLogDay(day);
        this.toastMsg(`Logged ${name}${date ? ` to ${date}` : ''} ✓`);
      })
      .catch((e) => this.toastMsg('Could not log that: ' + e.message));
  }
  // Edit an entry already logged — his ask, and it also covers "I put the
  // wrong amount in". The server has always supported this (PATCH
  // /food-log/:id, editEntryOn) and marks the entry `edited` so an amended
  // number is never mistaken for the original estimate; only the client was
  // missing. Works on any day, including past ones.
  startFoodEntryEdit(entry) {
    this.setState({
      foodEditId: entry.id,
      foodEditName: entry.name,
      foodEditP: String(entry.p), foodEditC: String(entry.c),
      foodEditF: String(entry.f), foodEditKcal: String(entry.kcal),
    });
  }
  cancelFoodEntryEdit() {
    this.setState({ foodEditId: null });
  }
  // Rescale every macro by the same factor — "I only ate half of what I
  // logged" without arithmetic. Applied to the FIELDS, so he still sees the
  // numbers before committing.
  scaleFoodEntryEdit(factor) {
    const n = (v) => Math.round((Number(v) || 0) * factor);
    this.setState((s) => ({
      foodEditP: String(n(s.foodEditP)), foodEditC: String(n(s.foodEditC)),
      foodEditF: String(n(s.foodEditF)), foodEditKcal: String(n(s.foodEditKcal)),
    }));
  }
  saveFoodEntryEdit() {
    const conn = getConnection();
    const id = this.state.foodEditId;
    if (!conn || !id) return;
    const name = this.state.foodEditName.trim();
    if (!name) { this.toastMsg('Give it a name.'); return; }
    const macros = {
      p: Math.max(0, Number(this.state.foodEditP) || 0),
      c: Math.max(0, Number(this.state.foodEditC) || 0),
      f: Math.max(0, Number(this.state.foodEditF) || 0),
      kcal: Math.max(0, Number(this.state.foodEditKcal) || 0),
    };
    const date = this.state.foodLogDate || undefined;
    this.setState({ foodEditId: null });
    api.editFoodLogEntry(conn, id, { name, macros, date })
      .then((day) => { this.noteLocalWrite('foodLog'); this.applyFoodLogDay(day); this.toastMsg('Updated ✓'); })
      .catch((e) => this.toastMsg('Could not update: ' + e.message));
  }
  relogFoodItem(item) {
    const conn = getConnection();
    if (!conn) return;
    const date = this.state.foodLogDate || undefined;
    api.addFoodLogEntry(conn, { name: item.name, macros: item.macros, source: 'history', date })
      .then((day) => { this.noteLocalWrite('foodLog'); this.applyFoodLogDay(day); this.toastMsg(`Logged ${item.name}${date ? ` to ${date}` : ''} ✓`); this.loadFoodHistory(); })
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
  // Real jackets for the shelf's books. Same shape as refreshRecipePhotos:
  // fetched through the server (which caches, so this is one network trip per
  // book ever), and a miss simply leaves the generated cover in place.
  refreshBookCovers(items) {
    const conn = getConnection();
    if (!conn) return;
    for (const it of items || []) {
      if (it.kind !== 'book' || !it.title) continue;
      if (this.state.liveBookCoverUrls[it.id] !== undefined) continue; // done, or known-missing
      if (!this.bookCoverTried) this.bookCoverTried = new Set();
      if (this.bookCoverTried.has(it.id)) continue;
      this.bookCoverTried.add(it.id);
      api.bookCoverBlobUrl(conn, it.title, it.author).then((url) => {
        // null is a REAL answer ("no jacket exists") — store it so the shelf
        // stops asking, and so the generated cover stands permanently
        this.setState((s) => ({ liveBookCoverUrls: { ...s.liveBookCoverUrls, [it.id]: url || null } }));
      }).catch(() => {});
    }
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
      recipeTweakError: null, recipeTweakPreview: null, recipeTweakPhotos: [],
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
    // his ask: a photo of a DIFFERENT ingredient (a substitute's packaging,
    // its nutrition label, the item itself) considered alongside the request
    const photos = st.recipeTweakPhotos;
    this.setState({ recipeTweakBusy: true, recipeTweakError: null });
    api.tweakRecipe(conn, st.openRecipeId, request, prior, photos)
      .then(({ jobId }) => {
        this.startPoll('recipeTweak', () => api.tweakRecipeJob(conn, jobId), {
          intervalMs: 2500,
          onReady: (job) => {
            this.setState({ recipeTweakBusy: false, recipeTweakPreview: job.result, recipeTweakInput: '', recipeTweakPhotos: [] });
            if (byVoice) this.speakTweak(job.result);
          },
          onError: (msg) => this.setState({ recipeTweakBusy: false, recipeTweakError: msg }),
        });
      })
      .catch((e) => {
        this.setState({ recipeTweakBusy: false, recipeTweakError: e.message });
      });
  }
  // Stage a photo for the NEXT tweak request without asking anything yet —
  // his ask: photograph a different ingredient (a substitute's packaging,
  // its label, the product itself) so the macro recalculation reads the
  // real numbers instead of guessing. Same downscale-on-the-way-in as the
  // Fuel scan photos (upload speed, no accuracy cost — Claude downscales
  // past this edge length server-side regardless).
  addRecipeTweakPhotos(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = 4 - (this.state.recipeTweakPhotos || []).length;
    if (room <= 0) { this.toastMsg('Up to 4 photos per tweak'); return; }
    Promise.all(files.slice(0, room).map((f) => this.downscaleImageFile(f)))
      .then((urls) => this.setState((s) => ({ recipeTweakPhotos: [...s.recipeTweakPhotos, ...urls.filter(Boolean)] })));
    if (files.length > room) this.toastMsg('Up to 4 photos per tweak');
  }
  removeRecipeTweakPhoto(idx) {
    this.setState((s) => ({ recipeTweakPhotos: s.recipeTweakPhotos.filter((_, i) => i !== idx) }));
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
    haptic('tick');
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

  // CLEAR THE WHOLE LIST. Ticking twenty things off to empty a list is
  // bookkeeping, not shopping. This wipes unchecked items too — which is the
  // point — so it confirms first, and the cleared items are held in memory so
  // UNDO restores the exact list (same ids, same checked state) rather than a
  // reconstruction of it. Nothing here is irreversible until he navigates on.
  // Quantity is part of the item, not a note on it — "7 × yoghurt" is one
  // decision he makes in the shop, so it edits in place on the row.
  setShoppingQty(id, qty) {
    const conn = getConnection();
    if (!conn) return;
    api.setShoppingQty(conn, id, qty).then(({ items }) => {
      this.noteLocalWrite('shoppingList');
      this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items } }));
    }).catch((e) => this.toastMsg('Could not change the quantity: ' + e.message));
  }
  clearShoppingList() {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ shoppingClearBusy: true });
    api.clearShoppingList(conn).then(({ items, cleared, count }) => {
      this.noteLocalWrite('shoppingList');
      this.setState((s) => ({
        liveShoppingList: { ...s.liveShoppingList, items },
        shoppingCleared: cleared || [],
        shoppingClearArmed: false,
        shoppingClearBusy: false,
      }));
      this.toastMsg(count ? `Cleared ${count} item${count === 1 ? '' : 's'} — undo at the top` : 'Nothing to clear');
    }).catch((e) => {
      this.setState({ shoppingClearBusy: false, shoppingClearArmed: false });
      this.toastMsg('Could not clear the list: ' + e.message);
    });
  }
  undoShoppingClear() {
    const conn = getConnection();
    const cleared = this.state.shoppingCleared || [];
    if (!conn || !cleared.length) return;
    api.restoreShoppingList(conn, cleared).then(({ items }) => {
      this.noteLocalWrite('shoppingList');
      this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items }, shoppingCleared: [] }));
      this.toastMsg('List restored ✓');
    }).catch((e) => this.toastMsg('Could not restore the list: ' + e.message));
  }
  dismissShoppingClearUndo() { this.setState({ shoppingCleared: [] }); }

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
    this.setState({ exercisePickerOpen: true, exercisePickerMode: 'routine', exercisePickerQuery: '', exercisePickerMuscle: 'Any', exercisePickerCreateMuscle: '', exercisePickerCreateTrackingType: 'weight_reps' });
  }
  // A TEMPORARY exercise for the session he is in right now — his 21-Aug
  // ask: an extra lift that never touches the program (no writeRoutine
  // call, nothing filed to the vault). Reuses the same picker UI; only the
  // mode and the destination of onAdd differ.
  openSessionExercisePicker() {
    this.setState({ exercisePickerOpen: true, exercisePickerMode: 'session', exercisePickerQuery: '', exercisePickerMuscle: 'Any', exercisePickerCreateMuscle: '', exercisePickerCreateTrackingType: 'weight_reps' });
  }
  addExerciseToSession(exerciseOrId) {
    const session = this.state.workoutSession;
    if (!session) return;
    // an id when he picks from the list; the object itself when it was just
    // created and the library state has not caught up yet
    const lib = typeof exerciseOrId === 'string'
      ? (this.state.liveWorkoutExercises || []).find((e) => e.id === exerciseOrId)
      : exerciseOrId;
    if (!lib?.id) { this.toastMsg('Could not add that exercise.'); return; }
    if (session.exercises.some((e) => e.exerciseId === lib.id)) {
      this.toastMsg(`${lib.name} is already in this session.`);
      this.setState({ exercisePickerOpen: false, exercisePickerQuery: '' });
      return;
    }
    // no routine, no last-session prefill — an honest fresh start, same
    // hypertrophy-default rep range the rest of the app assumes
    const targetRepsLow = 8, targetRepsHigh = 12, targetSets = 3;
    const entry = {
      exerciseId: lib.id, name: lib.name, muscleGroup: lib.muscleGroup, trackingType: lib.trackingType,
      targetSets, targetRepsLow, targetRepsHigh, coach: null, last: null, focusNote: null,
      adhoc: true, // this session only — never written to the routine
      sets: Array.from({ length: targetSets }, () => ({ weight: 0, reps: targetRepsLow, done: false })),
    };
    this.setState((s) => ({
      workoutSession: { ...s.workoutSession, exercises: [...s.workoutSession.exercises, entry] },
      exercisePickerOpen: false, exercisePickerQuery: '',
    }));
    this.toastMsg(`${lib.name} added — this session only.`);
  }
  // Only an adhoc entry can be pulled out whole — a PROGRAMMED exercise is
  // skipped (spec'd, undoable, stays visible), never deleted outright.
  removeExerciseFromSession(exIdx) {
    this.setState((s) => {
      const ex = s.workoutSession?.exercises?.[exIdx];
      if (!ex?.adhoc) return null;
      const exercises = s.workoutSession.exercises.filter((_, i) => i !== exIdx);
      return { workoutSession: { ...s.workoutSession, exercises } };
    });
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
    // WHERE it goes depends on which picker asked. This ignored the mode and
    // always routed to the routine, so creating a brand-new exercise
    // mid-session filed it in the library and then added it NOWHERE (no open
    // routine → silent early return) — or, worse, wrote it into his actual
    // program if a routine happened to be open behind the session.
    const toSession = this.state.exercisePickerMode === 'session' && this.state.workoutSession;
    api.addWorkoutExercise(conn, name.trim(), muscleGroup, trackingType).then(({ exercise }) => {
      if (!exercise?.id) throw new Error('the server did not return the new exercise');
      this.setState((s) => ({ liveWorkoutExercises: [...(s.liveWorkoutExercises || []), exercise] }));
      // pass the exercise ITSELF, never look it back up: the setState above
      // has not applied yet, so a lookup by id would find nothing
      if (toSession) this.addExerciseToSession(exercise);
      else this.addExerciseToRoutine(exercise.id);
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
      // a 'quality' prescription deliberately changes NO number — the whole
      // point is the same weight done better, so the prefill is left alone
      if (coach && coach.kind !== 'quality') {
        sets = sets.map((s) => coach.kind === 'weight'
          ? { ...s, weight: Math.round((Number(s.weight) + coach.delta) * 10) / 10 }
          : { ...s, reps: Number(s.reps) + coach.delta });
      }
      return { exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh, coach,
        // last time's truth rides along — with a coach-nudged prefill the
        // comparison is otherwise invisible mid-session
        last: e.lastSets && e.lastSets.length ? { date: e.lastDate || null, sets: e.lastSets.map((s) => ({ weight: s.weight, reps: s.reps })) } : null,
        focusNote: e.tune?.focus || null,
        sets };
    });
    this.withTransition(() => this.setState({ workoutsView: 'session', workoutSession: { routineId: routine.id, routineName: routine.name, exercises }, sessionCancelConfirm: false }));
  }
  // cockpit: exercise-level fields (note / anomaly / pain) — same immutable
  // update pattern as sets; unknown fields flow through to the save intact
  updateSessionExerciseField(exIdx, field, value) {
    this.setState((s) => ({
      workoutSession: {
        ...s.workoutSession,
        exercises: s.workoutSession.exercises.map((e, i) => (i !== exIdx ? e : { ...e, [field]: value })),
      },
    }));
  }
  // The PAIN flow's hand-off: compose the physio-grade question and put it
  // to the Coach WITH the live session attached (doCoach does that), so the
  // triage lands in the mid-session pane where he's standing.
  askPainCoach(exIdx) {
    const p = this.state.sessionPain;
    const ex = this.state.workoutSession?.exercises?.[exIdx];
    if (!p?.area || !ex) return;
    const desc = `${p.area}${p.side ? ` (${p.side})` : ''}${p.when ? `, ${p.when}` : ''}${p.detail ? ` — ${p.detail}` : ''}`;
    this.updateSessionExerciseField(exIdx, 'pain', desc);
    this.setState({ sessionPain: null });
    this.doCoach(`PAIN report, mid-session on ${ex.name}: ${desc}. Triage this like a leading physio + S&C coach: should I stop this lift today, stretch/mobilise, or substitute a same-muscle alternative (name it)? Be honest if this is see-a-professional territory. If it's worth tracking, PROPOSE logging it to my Injury Log.`);
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
  restoreDiscardedSession() {
    const conn = getConnection();
    if (!conn) return;
    api.restoreDiscardedDraft(conn).then(({ draft }) => {
      this.setState({
        workoutSession: draft.workoutSession,
        editingSessionId: draft.editingSessionId || null,
        workoutSessionSavedAt: draft.savedAt || null,
        discardedDraft: null,
        workoutsView: 'session',
        trainTab: 'gym',
      });
      this.toastMsg('Workout restored — nothing was lost');
    }).catch((e) => this.toastMsg('Could not restore: ' + e.message));
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
        // EVERY cockpit field rides the save — rir/setType/note/anomaly/pain
        // were being captured on screen and silently dropped here (found
        // 20 Aug while wiring the PR moment; the server validated them all
        // along). Data he typed must never evaporate between UI and disk.
        sets: e.sets.filter((s) => s.done).map((s) => ({
          weight: Number(s.weight) || 0, reps: Number(s.reps) || 0,
          rpe: s.rpe ? Number(s.rpe) : undefined, done: true,
          ...(s.rir !== '' && s.rir != null ? { rir: Number(s.rir) } : {}),
          ...(s.setType && s.setType !== 'working' ? { setType: s.setType } : {}),
        })),
        ...(e.note ? { note: e.note } : {}),
        ...(e.anomaly ? { anomaly: true } : {}),
        ...(e.pain ? { pain: e.pain } : {}),
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
    const payload = { routineId: session.routineId, routineName: session.routineName, exercises,
      // the finishing-early reason (cockpit chips) rides the record so the
      // Coach can notice the pattern and open the restructure conversation
      ...(this.state.sessionCutShort ? { cutShort: this.state.sessionCutShort } : {}) };
    api.completeWorkoutSession(conn, payload).then(({ prs } = {}) => {
      if (prs?.length) {
        this.setState({ prCelebration: prs });
        haptic('celebrate'); // no-op on iOS today (see haptics.js) — real on Android/desktop
        clearTimeout(this.prT);
        this.prT = setTimeout(() => this.setState({ prCelebration: null }), 4200);
      }
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
      return { exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh, coach: null,
        last: last && last.length ? { date: null, sets: last.map((s) => ({ weight: s.weight, reps: s.reps })) } : null,
        sets };
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
  // Library: open a source — the cover morphs into the detail header. The
  // detail is cached per id and single-flighted, same pattern (and same
  // reasoning) as ensureNoteDetail above.
  openLibraryItem(id) {
    this.withTransition(() => this.setState({ libraryOpenId: id, screen: 'library' }));
    this.ensureLibraryDetail(id);
  }
  closeLibraryItem() {
    this.withTransition(() => this.setState({ libraryOpenId: null }));
  }
  ensureLibraryDetail(id, force = false) {
    if (!id) return;
    const have = this.state.liveLibraryDetails[id];
    if (have && !have.error && !force) return;
    const conn = getConnection();
    if (!conn) return;
    if (!this.libraryDetailInFlight) this.libraryDetailInFlight = new Set();
    if (this.libraryDetailInFlight.has(id)) return;
    this.libraryDetailInFlight.add(id);
    if (force) this.setState((s) => { const d = { ...s.liveLibraryDetails }; delete d[id]; return { liveLibraryDetails: d }; });
    api.libraryItem(conn, id).then((detail) => {
      this.setState((s) => ({ liveLibraryDetails: { ...s.liveLibraryDetails, [id]: detail } }));
    }).catch(() => {
      this.setState((s) => ({ liveLibraryDetails: { ...s.liveLibraryDetails, [id]: { error: true } } }));
    }).finally(() => this.libraryDetailInFlight.delete(id));
  }
  ensureNoteDetail(id) {
    // a stored error sentinel counts as "not loaded" so re-selecting retries
    if (!id || (this.state.liveNoteDetails[id] && !this.state.liveNoteDetails[id].error)) return;
    const conn = getConnection();
    if (!conn) return;
    // SINGLE-FLIGHT. Now that pointerdown prefetches and the click still calls
    // this, one tap reaches here twice — and the second call arrives before
    // the first response has landed in state, so the "already loaded" guard
    // above cannot see it. Without this key, intent-prefetch would double
    // every note fetch instead of speeding it up.
    if (!this.noteDetailInFlight) this.noteDetailInFlight = new Set();
    if (this.noteDetailInFlight.has(id)) return;
    this.noteDetailInFlight.add(id);
    api.noteDetail(conn, id).then((detail) => {
      this.setState((s) => ({ liveNoteDetails: { ...s.liveNoteDetails, [id]: detail } }));
    }).catch(() => {
      // an error sentinel — the silent catch left the pane on "Loading…" forever
      this.setState((s) => ({ liveNoteDetails: { ...s.liveNoteDetails, [id]: { error: true } } }));
    }).finally(() => this.noteDetailInFlight.delete(id));
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
    // OPTIMISTIC: the composer clears the moment he commits, so the next
    // thought can start immediately. The entry list is refreshed from the
    // server rather than guessed at — journal entries are grouped by day
    // with server-assigned times, and inventing that shape client-side
    // would be a fiction the refresh would only contradict a moment later.
    const previousText = this.state.journalComposerText;
    haptic('commit');
    this.setState({ journalSaveBusy: true, journalSaveError: null, journalComposerText: '', journalPromptText: null });
    api.addJournalEntry(conn, text).then(() => {
      this.setState({ journalSaveBusy: false });
      this.toastMsg('Journal entry saved ✓');
      this.refreshJournalEntries();
    }).catch((e) => {
      if (isOfflineError(e)) {
        this.setState({ journalSaveBusy: false });
        this.enqueueOutbox('journal', text.slice(0, 44), { text });
        return;
      }
      // a real rejection must never eat what he wrote
      this.setState({ journalSaveBusy: false, journalComposerText: previousText, journalSaveError: e.message });
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
    this.setState({ ingestModalOpen: true, ingestText: '', ingestSourceUrl: '', ingestBookTitle: '', ingestBookAuthor: '' });
  }
  closeIngestModal() {
    this.setState({ ingestModalOpen: false });
  }
  onIngestFile(e) {
    const file = e.target.files?.[0];
    // Clear the input NOW: a file input keeps its value, so picking the SAME
    // file after a failure fires no change event and the retry silently does
    // nothing — which is exactly what his second Atomic Habits attempt did.
    e.target.value = '';
    if (!file) return;
    // EPUB and PDF are BINARY — FileReader.readAsText mangles every byte of
    // them, which is why picking a book here used to do nothing useful. They
    // go up as bytes and the server extracts the text (macOS PDFKit / unzip).
    if (/\.(epub|pdf)$/i.test(file.name)) {
      const conn = getConnection();
      if (!conn) { this.toastMsg('Connect a backend first'); return; }
      // PDFs almost never carry usable title/author metadata (his Atomic
      // Habits copy has neither), and the server rightly refuses to file a
      // book it cannot name. Catch that HERE — before shipping megabytes to
      // an error he then has to interpret. EPUBs carry their own metadata,
      // so they pass through and the server's fallback handles them.
      if (/\.pdf$/i.test(file.name) && (!this.state.ingestBookTitle.trim() || !this.state.ingestBookAuthor.trim())) {
        this.setState({ ingestError: null });
        this.toastMsg('Fill in the book title and author first, then pick the PDF again — a PDF rarely knows its own name.');
        return;
      }
      this.setState({ ingestStatus: 'researching', ingestError: null });
      api.uploadBookFile(conn, file, {
        title: this.state.ingestBookTitle.trim(),
        author: this.state.ingestBookAuthor.trim(),
      }).then(({ jobId, title, author, chars }) => {
        this.setState({ ingestModalOpen: false, ingestJobId: jobId, ingestStatus: 'reading', ingestPreview: null, ingestError: null });
        this.toastMsg(`Reading “${title}” by ${author} — ${Math.round(chars / 1000)}k characters`);
        this.pollIngest(jobId);
      }).catch((err) => {
        // 'error', NEVER null: null rendered the review sheet completely
        // BLANK and threw the message away — three upload failures in a row
        // showed him an empty box instead of a single word of why.
        this.setState({ ingestStatus: 'error', ingestError: err.message });
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.setState({ ingestText: String(reader.result || '') });
    reader.readAsText(file);
  }
  submitIngest() {
    const text = this.state.ingestText.trim();
    const sourceUrl = this.state.ingestSourceUrl.trim();
    const title = this.state.ingestBookTitle.trim();
    const author = this.state.ingestBookAuthor.trim();
    // A book with no pasted text is a Librarian research run — model-gated
    // like research and watch (deep research is a cost decision, his call).
    if (title && author && !text && !sourceUrl) {
      this.gateModelChoice('book', (model) => this.beginIngestJob(null, null, { title, author, model }));
      return;
    }
    if (!text && !sourceUrl) return;
    // title+author WITH text = his own copy/notes of the book — no research
    // run (nothing to gate), and the weave marks the pages provenance: read
    this.beginIngestJob(text, sourceUrl, title && author ? { title, author } : undefined);
  }
  // Watch & analyse: a video link straight into the deep vault weave — the
  // same job Add-to-vault runs, minus the modal.
  startVideoDeepIngest(url) {
    this.beginIngestJob('', url);
  }
  beginIngestJob(text, sourceUrl, book) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ ingestModalOpen: false, ingestJobId: null, ingestStatus: book ? 'researching' : 'staging', ingestPreview: null, ingestError: null });
    // A HUNG START MUST NOT LOOK LIKE A LONG RUN. The status was set before
    // this request, so if it never settled (a dropped Tailscale route, a
    // route that hung) the spinner ran forever with no job behind it and no
    // way to cancel. Half an hour of "researching" with nothing on the
    // server is what that looked like.
    const startGuard = setTimeout(() => {
      if (!this.state.ingestJobId) {
        this.setState({ ingestStatus: 'error', ingestError: 'Nova never got the job started — check the backend connection and try again. Nothing was written.' });
      }
    }, 45_000);
    api.startIngest(conn, text || undefined, sourceUrl || undefined, book || undefined)
      .then(({ jobId }) => { clearTimeout(startGuard); this.pollIngest(jobId); })
      .catch((e) => { clearTimeout(startGuard); this.setState({ ingestStatus: 'error', ingestError: e.message }); });
  }
  // One poller for every ingest, however it started — pasted text, a link, or
  // a book file he uploaded. A second copy would be a second thing to fix.
  pollIngest(jobId) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ ingestJobId: jobId });
    this.startPoll('ingest', () => api.ingestJob(conn, jobId), {
      intervalMs: 3000,
      timeoutMs: 30 * 60_000, // a 4h video's digest + weave legitimately runs past 15m
      onReady: (job) => this.setState({ ingestStatus: 'ready', ingestPreview: { summary: job.summary, cost: job.cost, changes: job.changes } }),
      onError: (msg) => this.setState({ ingestStatus: 'error', ingestError: msg }),
      onProgress: (job) => this.setState({ ingestStatus: job.status }),
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
  // Recall — vault search behind the palette, debounced so typing stays
  // smooth. The palette input owns its text locally (P8: a keystroke must
  // not rebuild the whole app), so the staleness guard is an instance
  // field, not state — late results for an abandoned query stay out.
  queueRecall(query) {
    clearTimeout(this.recallT);
    const q = (query || '').trim();
    this.recallFor = q;
    const conn = getConnection();
    if (!conn || q.length < 3) {
      if (this.state.recallResults.length) this.setState({ recallResults: [] });
      return;
    }
    this.recallT = setTimeout(() => {
      api.recall(conn, q).then(({ results }) => {
        if (this.recallFor === q) this.setState({ recallResults: results });
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
    this.gateModelChoice('research', (model) => {
      api.research(conn, q, model).then(() => {
        this.toastMsg('Researcher dispatched — the brief lands in the Inbox for review');
        this.refreshInbox();
      }).catch((e) => this.toastMsg('Research failed to start: ' + e.message));
    });
  }
  toggleInboxExpand(id) {
    this.setState((s) => ({ inboxExpanded: { ...s.inboxExpanded, [id]: !(s.inboxExpanded || {})[id] } }));
  }
  startVideoWatch(text) {
    const conn = getConnection();
    const t = (text || '').trim();
    if (!conn || !t) return;
    this.gateModelChoice('watch', (model) => {
      api.videoWatch(conn, t, model).then(() => {
        this.toastMsg("Watcher dispatched — the video's read lands in the Inbox for review");
        this.refreshInbox();
      }).catch((e) => this.toastMsg('Watch failed to start: ' + e.message));
    });
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
  // OPTIMISTIC, like toggleTodoItem below. Adding used to lock the whole
  // list behind a round-trip busy lock, so over Tailscale the typed
  // item hung in the box for 100-600ms and a second add was impossible until
  // the first returned. The row now appears in the same frame; the server's
  // list replaces it, and a rejection (a duplicate, say) reverts with the
  // reason. The category is left for the server to decide — guessing it
  // client-side would be a second copy of guessTodoCategory drifting out of
  // sync with the real one.
  addTodoItem() {
    const conn = getConnection();
    const text = this.state.todoInput.trim();
    if (!conn || !text) return;
    const previous = this.state.liveTodos;
    const tempRaw = `__pending__${Date.now()}__${text}`;
    haptic('tick');
    this.setState((s) => {
      if (!s.liveTodos?.items) return { todoInput: '' };
      this.noteLocalWrite('todos'); // a racing snapshot must not clobber this
      return {
        todoInput: '',
        liveTodos: { ...s.liveTodos, items: [...s.liveTodos.items, { raw: tempRaw, text, checked: false, category: null, pending: true }] },
      };
    });
    api.todoAdd(conn, text).then((data) => {
      this.noteLocalWrite('todos');
      this.setState({ liveTodos: data });
    }).catch((e) => {
      if (isOfflineError(e)) { this.enqueueOutbox('todo', text, { text }); return; } // the row stays; the outbox will land it
      this.setState({ liveTodos: previous, todoInput: text }); // give the words back
      this.toastMsg('Could not add: ' + e.message);
    });
  }
  setTodoItemCategory(rawLine, category) {
    const conn = getConnection();
    if (!conn) return;
    api.todoSetCategory(conn, rawLine, category).then((data) => this.setState({ liveTodos: data, todoEditCategoryKey: null }))
      .catch((e) => { this.toastMsg(e.message); this.setState({ todoEditCategoryKey: null }); });
  }
  // OPTIMISTIC (mirrors toggleSlotConsumed, the house pattern): ticking a
  // to-do used to sit behind a full round trip with the whole list locked by
  // a busy lock — 100-600ms of dead UI per tap over Tailscale, and no
  // second tick until it returned. The tick now lands in the same frame; the
  // server's answer replaces it, and a failure reverts with the reason.
  toggleTodoItem(rawLine) {
    const conn = getConnection();
    if (!conn) return;
    const previous = this.state.liveTodos;
    haptic('tick');
    this.setState((s) => {
      if (!s.liveTodos?.items) return null;
      this.noteLocalWrite('todos'); // a racing snapshot must not clobber this
      return { liveTodos: { ...s.liveTodos, items: s.liveTodos.items.map((t) => (t.raw === rawLine ? { ...t, checked: !t.checked } : t)) } };
    });
    api.todoToggle(conn, rawLine).then((data) => {
      this.noteLocalWrite('todos');
      this.setState({ liveTodos: data });
    }).catch((e) => {
      // revert to exactly what was on screen before the tap, then say why
      this.setState({ liveTodos: previous });
      this.toastMsg('Could not update that to-do: ' + e.message);
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
  // ------------------------------ model board ------------------------------
  // Which Claude model each Nova lane runs on, and whether it runs. Server-
  // held, so the phone and the Mac's schedulers can never disagree about it.
  loadModelPrefs() {
    const conn = getConnection();
    if (!conn) return;
    api.modelPrefs(conn)
      .then((prefs) => this.setState({ liveModelPrefs: prefs, modelPrefsError: false }))
      .catch(() => this.setState({ liveModelPrefs: null, modelPrefsError: true })); // a failed load is NOT "no lanes"
  }
  // One lane, one field. The server answers with the whole board, so what
  // renders after a write is always the server's truth rather than a guess.
  setModelLane(lane, patch) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ modelPrefsBusy: lane });
    api.setModelLane(conn, lane, patch)
      .then((prefs) => this.setState({ liveModelPrefs: prefs, modelPrefsBusy: null }))
      .catch((e) => {
        this.setState({ modelPrefsBusy: null });
        this.toastMsg('Could not change that lane: ' + e.message);
        this.loadModelPrefs(); // never leave the screen showing a change that didn't land
      });
  }
  resetModelLane(lane) {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ modelPrefsBusy: lane || '*' });
    api.resetModelLane(conn, lane)
      .then((prefs) => this.setState({ liveModelPrefs: prefs, modelPrefsBusy: null }))
      .catch((e) => {
        this.setState({ modelPrefsBusy: null });
        this.toastMsg('Could not reset: ' + e.message);
        this.loadModelPrefs();
      });
  }

  // The ask poll, attachable from a fresh boot too — an iOS reclaim used to
  // eat the in-flight answer along with the poll.
  attachAskPoll(conn, jobId) {
    const clearJob = () => { try { localStorage.removeItem('novaos.askJob'); } catch { /* best-effort */ } };
    // STREAMING: the reply renders word-by-word from job.partial, and (on
    // the browser speech path) complete sentences are spoken AS they arrive
    // — Nova starts talking while still thinking, like a person does.
    const stream = { spokenUpTo: 0 };
    const elevenPath = !!(this.state.liveTts?.configured);
    // Trailing SHOW/PROPOSE/RESEARCH lines are typed directives for the
    // server, not prose — keep them out of the render (and out of the voice)
    const stripShow = (t) => t.replace(/(^|\n)\s*(SHOW|PROPOSE|RESEARCH)\s*(\{[\s\S]*)?$/, '');
    const applyPartial = (text) => this.setState((s) => {
      const chat = [...s.voiceChat];
      const idx = chat.map((m) => !!m.streaming).lastIndexOf(true);
      if (idx === -1) chat.push({ at: Date.now(), who: 'nova', text, streaming: true });
      else chat[idx] = { ...chat[idx], text };
      return { voiceChat: chat };
    });
    // Both engines speak sentence-by-sentence as the reply streams: the
    // configured engine through the parallel-fetch FIFO (speakTtsSentence),
    // the browser voice inline. Waiting for the whole reply before the
    // first sound was the single biggest cost in how slow Nova FELT.
    //
    // Reveal-with-speech: on the spoken path the TEXT of each sentence
    // appears only when its audio starts — voice leads, words follow. Text
    // arriving seconds early made every reply feel like pressing play on
    // something already written.
    const spokenReveal = elevenPath && this.state.voiceSpeak;
    const reveal = (t) => { stream.revealed = (stream.revealed || '') + t; applyPartial(stream.revealed); };
    const say = (t) => {
      clearTimeout(stream.thinkTimer); // a real sentence is here — no filler needed
      if (elevenPath) this.speakTtsSentence(t, spokenReveal ? () => reveal(t) : undefined);
      else this.speakIncremental(t);
    };
    // The awkward-silence filler: a long think gets ONE quiet touch-point
    // ("Still with you, sir.") — cached server-side, so it costs ~50ms —
    // and only when nothing at all is playing or queued. Keep the lines in
    // step with THINKING_LINES in server/lib/ttsLocal.js (the warm cache).
    if (spokenReveal) {
      const THINKING_LINES = ['Still with you, sir.', 'Nearly there.', 'Just pulling that together.'];
      stream.thinkTimer = setTimeout(() => {
        if (stream.spokenUpTo > 0 || this.ttsPlaying || (this.ttsQueue || []).length) return;
        this.thinkIdx = ((this.thinkIdx ?? -1) + 1) % THINKING_LINES.length;
        this.speakTtsSentence(THINKING_LINES[this.thinkIdx]);
      }, 4000);
    }
    const speakNewSentences = (text, flushAll) => {
      if (!this.state.voiceSpeak) return;
      const fresh = text.slice(stream.spokenUpTo);
      if (!fresh) return;
      if (flushAll) {
        // Sentence-sized pieces even here: a whole brief in one /api/tts
        // call is 20-30s of synthesis — it hit the sidecar timeout and the
        // reply went silent after the ack. Small chunks start sounding in
        // ~1s and CANNOT time out. (This path carries the entire reply when
        // a job never streamed partials.)
        const pieces = fresh.match(/[^.!?]*[.!?]+[\s]*|[^.!?]+$/g) || [fresh];
        for (const p of pieces) { if (p.trim()) say(p); }
        stream.spokenUpTo = text.length;
        return;
      }
      const m = fresh.match(/[\s\S]*[.!?](?=\s|$)/);
      if (m) {
        say(m[0]);
        stream.spokenUpTo += m[0].length;
      }
    };
    this.startPoll('ask', () => api.claudeCodeJob(conn, jobId), {
      timeoutMs: 3 * 60_000,
      // conversation cadence: the first spoken sentence rides this tick, so
      // it is pure added latency on every reply. 150ms costs a few cheap
      // local requests and takes ~200ms off the wait.
      intervalMs: 150,
      onProgress: (job) => {
        if (!job.partial) return;
        const shown = stripShow(job.partial);
        if (!shown) return;
        if (!spokenReveal) applyPartial(shown); // spoken path: reveal() renders, in step with the voice
        speakNewSentences(shown, false);
      },
      onReady: (job) => {
        clearTimeout(stream.thinkTimer);
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
        const commit = () => {
          // The job id persists until the reply is ON SCREEN, not merely
          // fetched: a reload during the spoken window (SW update mid-
          // deploy, an iOS reclaim) used to eat the answer — the poll had
          // already cleared its receipt, so boot had nothing to re-attach.
          // Watched happen live 18 Aug: reply + panel vanished silently.
          clearJob();
          this.setState((s) => {
            const chat = [...s.voiceChat];
            const idx = chat.map((m) => !!m.streaming).lastIndexOf(true);
            // his ask: show the information Nova is referring to, so the
            // two of us are on the same page. A deterministic keyword match
            // offers the matching EVIDENCE card; code still computes it.
            const evidence = this.offerVerdictFor(text);
            if (idx === -1) chat.push({ at: Date.now(), who: 'nova', text, panel, proposal, research, evidence });
            else chat[idx] = { at: Date.now(), who: 'nova', text, panel, proposal, research, evidence };
            return { voiceChat: chat, voicePendingProposal: proposal ? { recordId: proposal.recordId, title: proposal.title } : s.voicePendingProposal };
          });
          // THE GLASS: any spoken answer with a shape puts its card up — his
          // ask that this works "for anything I ask Nova verbally".
          this.putCard(job.result.card);
          // Nova offered to digest what it just put on — arm the offer so a
          // plain "yes" hands it to the Watcher, no second sentence needed.
          if (job.result.played?.url) {
            this.setState({ voicePendingOffer: { kind: 'watch', url: job.result.played.url, title: job.result.played.title } });
          }
          if (research && !research.queued) this.watchVoiceResearch(conn, research.recordId);
          // THE MODEL CHOICE GATE: the reply just asked "Opus or Sonnet?" —
          // arm it so a tap on the popup OR the next spoken turn (see
          // askNova) dispatches the research/watch that's actually waiting.
          const mc = job.result.modelChoicePending;
          if (mc) {
            this.gateModelChoice(mc.kind, (model) => {
              if (mc.kind === 'research') {
                api.research(conn, mc.question, model).then(({ record }) => {
                  const line = 'On it — the brief lands in your Inbox.';
                  this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: line, research: { recordId: record.id, question: mc.question, status: 'running' } }] }));
                  if (this.state.voiceSpeak) this.speak(line);
                  this.watchVoiceResearch(conn, record.id);
                }).catch((e) => {
                  const line = `I couldn't start that research: ${e.message}`;
                  this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'system', text: line }] }));
                });
              } else if (mc.kind === 'watch') {
                api.videoWatchDirect(conn, mc.url, mc.question, model).then(() => {
                  const line = "On it — the Watcher has it. The read lands in your Inbox.";
                  this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: line }] }));
                  if (this.state.voiceSpeak) this.speak(line);
                }).catch((e) => {
                  const line = `I couldn't hand that video to the Watcher: ${e.message}`;
                  this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'system', text: line }] }));
                });
              }
            });
          }
        };
        this.setState({ voiceBusy: false }); // he can barge in the moment the answer exists
        if (spokenReveal) {
          // remaining sentences queue with reveal-on-play; the commit rides
          // the queue as a barrier, landing when the last word is spoken
          // (or instantly if he interrupts — resetTtsQueue runs finalizers)
          speakNewSentences(text, true);
          this.queueTtsFinalize(commit);
        } else {
          commit();
          // Flush whatever trails the last sentence-ender; if nothing ever
          // streamed (non-streaming job), this speaks the whole reply.
          if (this.state.voiceSpeak) speakNewSentences(text, true);
          else this.maybeAutoListen();
        }
      },
      onError: (msg) => { clearJob(); clearTimeout(stream.thinkTimer); this.setState((s) => ({ voiceBusy: false, voiceChat: [...s.voiceChat.filter((m) => !m.streaming), { at: Date.now(), who: 'system', text: 'Error: ' + msg }] })); },
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
          // one request can produce several drafts ("push X and move Y")
          const n = r.count || 1;
          this.toastMsg(
            (n > 1 ? `Nova drafted ${n} changes — approve them in your inbox` : 'Nova drafted it — approve in your inbox to add it to your calendar')
            + (r.partial ? ` (${r.partial})` : ''),
          );
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
    this.setState((s) => ({ sparBusy: true, codeChat: [...s.codeChat, { at: Date.now(), who: 'system', text: `Breaker engaged — read-only adversarial pass over ${target}…` }] }));
    const focus = [...this.state.codeChat].reverse().find((m) => m.who === 'you')?.text || '';
    api.sparStart(conn, this.state.codeWorkspace, focus).then(({ jobId }) => {
      this.startPoll('spar', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 10 * 60_000,
        onReady: (job) => this.setState((s) => ({ sparBusy: false, codeChat: [...s.codeChat, { who: 'breaker', text: job.result.text }] })),
        onError: (msg) => this.setState((s) => ({ sparBusy: false, codeChat: [...s.codeChat, { at: Date.now(), who: 'system', text: 'Breaker failed: ' + msg }] })),
      });
    }).catch((e) => {
      this.setState((s) => ({ sparBusy: false, codeChat: [...s.codeChat, { at: Date.now(), who: 'system', text: 'Breaker failed: ' + e.message }] }));
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
  inboxAction(id, kind, reason) {
    const conn = getConnection();
    if (!conn) return;
    const fn = kind === 'approve' ? api.inboxApprove : kind === 'discard' ? api.inboxDiscard : kind === 'retry' ? api.inboxRetry : api.inboxUndo;
    // OPTIMISTIC for approve/discard — the two that are "the daily action".
    // The row leaves the pending list in the same frame; the server's real
    // record (with its destination and undo data) replaces this a moment
    // later. Deliberately NOT optimistic for retry/undo: retry is a dispatch
    // whose outcome is genuinely unknown until it runs, and undo must never
    // claim to have reverted a vault write before the server says it did.
    //
    // The optimistic record carries NO undoData and NO destination — those
    // are receipts, and a receipt for something that hasn't happened is the
    // one lie this codebase must never tell. The UI reads them as absent
    // until the server's record lands.
    const previousInbox = this.state.liveInbox;
    if ((kind === 'approve' || kind === 'discard') && previousInbox?.items) {
      haptic('tick');
      this.noteLocalWrite('inbox');
      const optimisticStatus = kind === 'approve' ? 'filed' : 'discarded';
      const items = previousInbox.items.map((r) => (r.id === id ? { ...r, status: optimisticStatus, pendingLocally: true } : r));
      this.setState({ liveInbox: { items, pendingCount: items.filter((r) => r.status === 'pending').length } });
    }
    this.setState((s) => ({ inboxActionBusy: { ...s.inboxActionBusy, [id]: true } }));
    (kind === 'discard' ? api.inboxDiscard(conn, id, reason) : fn(conn, id)).then(({ record }) => {
      this.noteLocalWrite('inbox');
      this.setState((s) => ({
        inboxActionBusy: { ...s.inboxActionBusy, [id]: false },
        liveInbox: s.liveInbox
          ? { items: s.liveInbox.items.map((r) => (r.id === id ? record : r)), pendingCount: s.liveInbox.items.map((r) => (r.id === id ? record : r)).filter((r) => r.status === 'pending').length }
          : s.liveInbox,
      }));
      if (kind === 'approve') this.toastMsg('Filed ✓ — ' + record.destination);
      else if (kind === 'discard') this.toastMsg('Discarded — nothing was written');
      else if (kind === 'retry') this.toastMsg('Retrying — Nova is running this again…');
      else this.toastMsg('Undone ✓ — ' + (record.undoSummary || 'reverted'));
    }).catch((e) => {
      // Put the row back exactly where it was — an optimistic approve that
      // failed must return to pending, not sit in history looking filed.
      this.setState((s) => ({
        inboxActionBusy: { ...s.inboxActionBusy, [id]: false },
        liveInbox: previousInbox || s.liveInbox,
      }));
      this.toastMsg(kind === 'undo' ? 'Could not undo: ' + e.message : 'Action failed: ' + e.message);
      this.refreshInbox(); // and re-sync, so the truth wins over both guesses
    });
  }
  // The scheduled-lane half of the model-choice gate: Pattern Scout/Distill
  // raised a pending 'model-choice' card instead of running when their
  // weekly cron fired — this is what actually runs the week's job.
  pickModelChoice(id, model) {
    const conn = getConnection();
    if (!conn) return;
    this.setState((s) => ({ inboxActionBusy: { ...s.inboxActionBusy, [id]: true } }));
    api.inboxModelChoice(conn, id, model).then(({ record }) => {
      this.setState((s) => ({
        inboxActionBusy: { ...s.inboxActionBusy, [id]: false },
        liveInbox: s.liveInbox
          ? { items: s.liveInbox.items.map((r) => (r.id === id ? record : r)), pendingCount: s.liveInbox.items.map((r) => (r.id === id ? record : r)).filter((r) => r.status === 'pending').length }
          : s.liveInbox,
      }));
      if (record.status === 'error') this.toastMsg("Couldn't start it: " + record.error);
      else this.toastMsg(`Running on ${model === 'opus' ? 'Opus' : 'Sonnet'} — it'll land in your Inbox when it's done.`);
    }).catch((e) => {
      this.setState((s) => ({ inboxActionBusy: { ...s.inboxActionBusy, [id]: false } }));
      this.toastMsg('Could not start it: ' + e.message);
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
  // ---------- Nova Live: native conversation from the orb ----------
  // Tapping the core toggles the conversation: a second tap ends it, the way
  // pressing the side button twice dismisses Siri. Nothing but the core is
  // ever drawn for it — the words are a long-press away.
  startLiveTalk() {
    if (!getConnection()) {
      // it used to silently navigate to Voice, which reads as "the button
      // did something" when in fact Nova cannot answer at all
      this.toastMsg('Not connected to your Mac — check Settings.');
      this.navigate('settings');
      return;
    }
    if (!this.state.voiceSpeak) this.toastMsg('Spoken replies are OFF — turn them on in Settings → Voice.');
    if (this.state.liveTalkOn) { this.endLiveTalk(); return; }
    this.stopSpeaking();
    this.primeSpeech();
    this.prewarmAsk(); // the process boots while he speaks his first sentence
    this.setState({ liveTalkOn: true, voiceConvMode: true, voiceConvPaused: false, liveInput: '', liveAsk: '', liveReply: '', liveVerdictOffer: null });
  }
  // Long-press the core: the transcript pop-up. It also STARTS a conversation
  // if none is running, so holding is a complete gesture on its own.
  toggleLiveText() {
    const open = !this.state.liveTextOpen;
    this.setState({ liveTextOpen: open });
    if (open && !this.state.liveTalkOn && getConnection()) {
      this.primeSpeech();
      this.setState({ liveTalkOn: true, voiceConvMode: true, voiceConvPaused: false });
    }
  }
  // Nova speaking anywhere SHOWS the presence — his ask: "the voice icon
  // popping up on the screen when communicating verbally so I know it's
  // talking". Never on the Voice/Ambient screens, which are already the core.
  showPresenceForSpeech() {
    // The core is ALWAYS on screen now (the tab orb on the phone, the
    // floating core on the Mac) and it animates itself while Nova speaks —
    // so "show the presence" needs no panel, and must never open the text
    // box he asked to keep out of his way. Left as the single hook that
    // marks a conversation live wherever speech starts.
    if (this.state.screen === 'voice' || this.state.screen === 'ambient') return;
    if (!this.state.liveTalkOn) this.setState({ liveTalkOn: true });
  }
  endLiveTalk() {
    this.setState({ liveTalkOn: false, liveTextOpen: false, liveMicOpen: false, voiceConvMode: false, liveInput: '', liveVerdictOffer: null, liveVerdict: null });
    this.stopSpeaking();
  }
  // The reply is scanned for a verdict Nova can SHOW — his ask: the pop-up
  // information card should appear while talking, so the thing being
  // referred to is on screen. Deterministic keyword match; the card itself
  // is still computed by code, never by the model.
  offerVerdictFor(text) {
    const t = `${text}`.toLowerCase();
    if (/\btired|fatigue|exhaust|worn out|recovery\b/.test(t)) return { kind: 'tired', label: 'Why am I tired? — the evidence' };
    if (/\bstall|plateau|flat|not progress/.test(t)) return { kind: 'stalled', label: 'The stall, with its numbers' };
    if (/\bprotein|floor\b/.test(t)) return { kind: 'protein', label: 'Protein this week — the maths' };
    if (/\bpeak|sharpest|best time|schedule|focus block/.test(t)) return { kind: 'peak', label: 'Your peak window today' };
    return null;
  }
  sendLiveTalk() {
    const q = (this.state.liveInput || '').trim();
    const conn = getConnection();
    if (!q || !conn) return;
    if (this.maybeStandDown(q)) return;
    this.setState({ liveAsk: q, liveInput: '', liveReply: '', voiceBusy: true, liveVerdictOffer: null });
    api.ask(conn, q, this.state.voiceSessionId || null).then((resp) => {
      const land = (text, sessionId) => {
        this.setState({ voiceBusy: false, liveReply: text, liveVerdictOffer: this.offerVerdictFor(`${q} ${text}`), ...(sessionId ? { voiceSessionId: sessionId } : {}) });
        // keep the full transcript honest — the sheet is a window on the
        // same conversation, not a separate one
        this.setState((s2) => ({ voiceChat: [...s2.voiceChat, { at: Date.now(), who: 'you', text: q }, { at: Date.now(), who: 'nova', text }] }));
        if (this.state.voiceSpeak) this.speakTtsSentence(text, () => {}); else this.maybeAutoListen();
      };
      if (resp.text) { land(resp.text); return; }
      this.startPoll('ask', () => api.claudeCodeJob(conn, resp.jobId), {
        timeoutMs: 3 * 60_000, intervalMs: 400,
        onReady: (job) => land(job.result.text, job.result.sessionId),
        onError: (msg) => this.setState({ voiceBusy: false, liveReply: 'Error: ' + msg }),
      });
    }).catch((e) => this.setState({ voiceBusy: false, liveReply: 'Error: ' + e.message }));
  }
  // ---------- verdict cards (A1) ----------
  openVerdict(kind, of) {
    const conn = getConnection();
    if (!conn) { this.toastMsg('Connect a backend first'); return; }
    this.setState({ verdictBusy: true });
    api.verdict(conn, kind, of)
      .then(({ verdict }) => this.setState({ verdict, verdictBusy: false }))
      .catch((e) => { this.setState({ verdictBusy: false }); this.toastMsg('Could not build that verdict: ' + e.message); });
  }
  // ---------- the front door (C1) ----------
  // The preview is computed LOCALLY from the same rules the server uses, so
  // the lane chip appears as he types with no round-trip (and still works
  // offline); the dispatch itself goes to the server, which owns the lanes.
  routeIntentLocal(text) {
    const raw = String(text || '').trim();
    if (raw.length < 3) return null;
    const urls = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
    const study = /\b(analyse|analyze|study|research) (this |their |the )?(creator|channel|account|profile|competitor)\b|\bevery video\b/i.test(raw);
    const L = (lane, label, why) => ({ lane, label, why });
    if (urls.length) {
      const u = urls[0];
      const channel = /youtube\.com\/(@|c\/|channel\/|user\/)|tiktok\.com\/@[^/]+\/?$/i.test(u) && !/watch\?v=|youtu\.be\/|\/reel\/|\/shorts\//i.test(u);
      if (study || channel || urls.length > 1) return L('study', 'STUDY', 'a body of work — Nova enumerates it, then compares');
      if (/(youtube\.com|youtu\.be|vimeo|tiktok|instagram|twitch|x\.com|twitter)/i.test(u) && /watch\?v=|youtu\.be\/|\/reel\/|\/shorts\/|\/video\/|\/p\/|\/status\//i.test(u)) return L('watch', 'WATCH', 'a video — the Watcher pulls the transcript and drafts a verdict');
      return L('research', 'RESEARCH', 'a link to read — the Researcher cites what it finds');
    }
    // mirrors server/lib/intentRouter.js parseBookIntent — before research
    // and capture, or "add book X by Y" would land in the Inbox as a todo
    const bookM = /\b(?:add|ingest|research|get|read|pull in|bring in)\b[^.?!]{0,30}?\bbook\b\s+(.+?)\s+by\s+(.+?)\s*[.?!]?\s*$/i.exec(raw);
    if (bookM) {
      const strip = (s) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
      const title = strip(bookM[1]); const author = strip(bookM[2]);
      if (title && author) return { ...L('book', 'LIBRARIAN', `the Librarian researches "${title}" and weaves it into your vault`), book: { title, author } };
    }
    if (study) return L('study', 'STUDY', 'a creator/catalogue analysis');
    if (/\b(build|implement|refactor|fix the bug|write a (script|test|function)|add a (feature|test)|deploy|commit|codebase|in nova|to nova|the repo)\b/i.test(raw)) return L('code', 'CLAUDE CODE', 'a build request — runs as a Claude Code session inside Nova');
    if (/\b(research|look up|find out|dig into|sources? on)\b/i.test(raw)) return L('research', 'RESEARCH', 'research with citations');
    if (/\b(my (bench|squat|deadlift|press|pull-?ups?|lift|program|routine|volume|macros|protein)|should i (train|deload|lift|eat)|reps?|sets?|rpe|deload)\b/i.test(raw)) return L('coach', 'COACH', 'a training question — the Coach has your full history');
    if (/^(remind me|remember|note:|todo:|add|buy|log)\b/i.test(raw)) return L('capture', 'INBOX', 'a thing to file');
    return L('ask', 'ASK NOVA', 'answered from your vault');
  }
  sendIntent(text) {
    const conn = getConnection();
    if (!conn) { this.toastMsg('Connect a backend first'); return; }
    const preview = this.routeIntentLocal(text);
    this.setState({ paletteOpen: false });
    // the code lane runs through the SAME path the Code screen uses, so the
    // session lands in his chat with streaming — not an orphan job he can't see
    if (preview?.lane === 'code') {
      this.toastMsg(`${preview?.label || 'Routing'} — dispatching…`);
      this.navigate('code');
      this.setState({ codeInput: text }, () => this.doCode());
      return;
    }
    // research/watch are model-choice-gated lanes — ask before dispatching,
    // same as the Inbox composer and Ask Nova's voice directive. Bypasses
    // /api/intent for these two and calls their own routes directly, same
    // as the code lane already bypasses it above.
    // a book is a Librarian research run — gated like research/watch, and it
    // rides the ingest job UI (review → approve/undo) rather than the inbox
    if (preview?.lane === 'book' && preview.book) {
      this.gateModelChoice('book', (model) => {
        this.beginIngestJob(null, null, { ...preview.book, model });
        this.toastMsg(`Librarian — researching "${preview.book.title}"`);
      });
      return;
    }
    if (preview?.lane === 'research' || preview?.lane === 'watch') {
      this.gateModelChoice(preview.lane, (model) => {
        const dispatch = preview.lane === 'research' ? api.research(conn, text, model) : api.videoWatch(conn, text, model);
        dispatch.then(() => {
          this.toastMsg(`${preview.label} — on it`);
          this.refreshInbox?.();
        }).catch((e) => this.toastMsg('Could not route that: ' + e.message));
      });
      return;
    }
    this.toastMsg(`${preview?.label || 'Routing'} — dispatching…`);
    api.sendIntent(conn, text).then((r) => {
      if (r.forward?.screen === 'workouts') { this.navigate('workouts', { trainTab: 'coach' }); this.doCoach(r.forward.question); return; }
      if (r.forward?.screen === 'voice') { this.navigate('voice'); this.askNova(r.forward.question); return; }
      if (r.lane === 'code') { this.navigate('code'); }
      this.toastMsg(r.said || `${r.label} — on it`);
      this.refreshInbox?.();
    }).catch((e) => this.toastMsg('Could not route that: ' + e.message));
  }
  // ---------- long-press / right-click context menus (spec #13) ----------
  openContextMenu(spec) {
    const items = (spec.items || []).filter(Boolean);
    if (!items.length) return;
    this.setState({ ctxMenu: { x: spec.x ?? 0, y: spec.y ?? 0, title: spec.title || null, items } });
  }
  closeContextMenu() {
    this.setState({ ctxMenu: null });
  }
  // Streaming bubbles (shared by Coach + Code; Voice keeps its own variant
  // with speech): upsert the in-flight reply so the answer appears while
  // it's still being written — job.partial arrives from the shared poll.
  applyStreamPartial(chatKey, who, text) {
    this.setState((s) => {
      const chat = [...s[chatKey]];
      const idx = chat.map((m) => !!m.streaming).lastIndexOf(true);
      if (idx === -1) chat.push({ who, text, streaming: true });
      else chat[idx] = { ...chat[idx], text };
      return { [chatKey]: chat };
    });
  }
  finalizeStream(chatKey, msg, extra) {
    this.setState((s) => {
      const chat = [...s[chatKey]];
      const idx = chat.map((m) => !!m.streaming).lastIndexOf(true);
      if (idx === -1) chat.push(msg);
      else chat[idx] = msg;
      return { [chatKey]: chat, ...extra };
    });
  }
  typeIn(key, who, text, after) {
    // P7 closed: two setStates per message (push + typing-flag clear), not
    // one per tick — the reveal animation runs inside the TypeText leaf,
    // so a demo reply no longer reconciles the whole tree ~12×/sec.
    this.setState(s => ({ [key]: [...s[key], { who, text, typing: true }] }));
    const ms = Math.ceil(text.length / 12) * 80 + 160;
    const t = setTimeout(() => {
      this.setState(s => {
        const arr = s[key].slice();
        const last = arr[arr.length - 1];
        if (last && last.typing) arr[arr.length - 1] = { ...last, typing: false };
        return { [key]: arr };
      });
      if (after) after();
    }, ms);
    this.ivs.push(t);
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
      // Every nav path (sidebar, dock, More sheet, palette) funnels through
      // this one factory, so warming the target's chunk here covers all of
      // them at once. Called on the CLICK — by then idle prefetch has almost
      // always already loaded it and this is a no-op (import() is memoized);
      // it only earns its keep on a tap that beat the prefetch.
      go: (screen) => () => { warmScreen(screen); this.navigate(screen, { paletteOpen: false }); },
      // …and again on pointerdown, which lands ~100ms before the click. Idle
      // prefetch has usually loaded everything already, so both are normally
      // no-ops (import() is memoized) — this only earns its keep on a tap
      // that beats the prefetch, which is exactly the cold-boot tap that
      // used to stall on a chunk parse.
      warm: (screen) => () => warmScreen(screen),
    };
    return {
      ...valsRecipes(this, ctx),
      ...valsWorkouts(this, ctx),
      ...valsNotes(this, ctx),
      ...valsLibrary(this, ctx),
      ...valsLeader(this, ctx),
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
  // The map drawn — tap an agent on the Ops fleet to expand its detail
  // (skills owned + last receipts); tapping again, or another agent, moves it.
  toggleOpsAgent(id) {
    this.setState({ opsOpenAgentId: this.state.opsOpenAgentId === id ? null : id });
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
  // Studio's overnight work — the outline drafts in the 03:30 window and is
  // pending in the Inbox by morning. Queued from the idea page, by him.
  queueIdeaOutlineOvernight(id) {
    const conn = getConnection();
    if (!conn) { this.toastMsg('Connect a backend in Settings first'); return; }
    api.overnightAddOutline(conn, id).then((r) => {
      this.setState({ liveOvernight: r });
      this.toastMsg('Queued for tonight — the outline is in your Inbox by morning');
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
  // "Yes" to the offer Nova made: hand the video it just opened to the
  // Watcher, on the existing rails (transcript pulled locally, the read
  // review-gated in his Inbox).
  acceptWatchOffer(offer) {
    const conn = getConnection();
    if (!conn || !offer?.url) return;
    this.gateModelChoice('watch', (model) => {
      api.videoWatchDirect(conn, offer.url, '', model).then(() => {
        const line = 'On it — the Watcher has it. The read lands in your Inbox.';
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: line }] }));
        if (this.state.voiceSpeak) this.speak(line);
        this.refreshLiveData();
      }).catch((e) => {
        const line = `I couldn't hand that to the Watcher: ${e.message}`;
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'system', text: line }] }));
      });
    });
  }
  // Coach proposed a program change; he answered. Approving APPLIES it (a
  // re-filed exercise moves every past set with it) and leaves an undo in
  // the Inbox; declining closes it so it stops being raised.
  // COACH CHANGES THE PLAN — always via this confirm sheet (his rule: the
  // button must confirm, and give him room to type "add the new one but
  // keep the old one" before anything moves).
  openCoachApply({ recordId = null, fix = null, proposal = '' }) {
    this.setState({ coachApplyPending: { recordId, fix, proposal }, coachApplyNote: '', coachApplyBusy: false });
  }
  cancelCoachApply() {
    if (this.state.coachApplyBusy) return; // a running change can't be un-asked
    this.setState({ coachApplyPending: null, coachApplyNote: '' });
  }
  confirmCoachApply() {
    const conn = getConnection();
    const p = this.state.coachApplyPending;
    if (!conn || !p || this.state.coachApplyBusy) return;
    const note = this.state.coachApplyNote.trim();
    this.setState({ coachApplyBusy: true });
    const done = (msg) => {
      this.setState({ coachApplyPending: null, coachApplyNote: '', coachApplyBusy: false });
      if (msg) this.toastMsg(msg);
      this.refreshLiveData();
    };
    api.coachApply(conn, { recordId: p.recordId || undefined, fix: p.fix || undefined, proposal: p.proposal || undefined, note: note || undefined })
      .then((r) => {
        if (r.jobId) {
          // Coach is reading his note — poll; the plan updates when it lands
          this.toastMsg('Coach is working your note into the plan…');
          this.startPoll('coachApply', () => api.coachApplyJob(conn, r.jobId), {
            intervalMs: 1500,
            timeoutMs: 3 * 60_000,
            onReady: (job) => done(job.result?.summary || 'Done — the plan is updated. Undo lives in your Inbox.'),
            onError: (msg) => { this.setState({ coachApplyBusy: false }); this.toastMsg('Coach could not apply that: ' + msg); },
          });
          return;
        }
        done(`${r.summary} — undo lives in your Inbox.`);
      })
      .catch((e) => { this.setState({ coachApplyBusy: false }); this.toastMsg('Could not apply: ' + e.message); });
  }
  resolveCoachAsk(recordId, approve) {
    const conn = getConnection();
    if (!conn) return;
    const call = approve ? api.inboxApprove(conn, recordId) : api.inboxDiscard(conn, recordId);
    call.then(() => {
      this.toastMsg(approve ? 'Done — your weekly volume just re-counted. Undo lives in your Inbox.' : 'Noted — Coach will leave it.');
      this.refreshLiveData();
    }).catch((e) => this.toastMsg('Could not apply that: ' + e.message));
  }
  // Accept (or decline) a Coach proposal from inside the conversation. YES
  // approves the record on the rails — the SAME deterministic apply the
  // Inbox performs, with the same undo — so nothing new writes to his plan;
  // the only thing that changed is where he is allowed to say yes.
  resolveCoachChatProposal(recordId, approve) {
    const conn = getConnection();
    if (!conn || !recordId) return;
    const mark = (status, extra) => this.setState((s) => ({
      coachChat: s.coachChat.map((m) => (m.proposal?.recordId === recordId
        ? { ...m, proposal: { ...m.proposal, status, ...extra } } : m)),
    }));
    mark('working');
    const call = approve ? api.inboxApprove(conn, recordId) : api.inboxDiscard(conn, recordId);
    call.then(() => {
      mark(approve ? 'done' : 'dismissed');
      if (approve) { this.refreshLiveData(); this.refreshInbox(); }
      const line = approve
        ? "Done — it's in your program. Undo is in your Inbox."
        : 'Left it alone — your program is unchanged.';
      this.setState((s) => ({ coachChat: [...s.coachChat, { at: Date.now(), who: 'coach', text: line }] }));
    }).catch((e) => {
      mark('error', { error: e.message });
      this.setState((s) => ({ coachChat: [...s.coachChat, { at: Date.now(), who: 'system', text: `Couldn't ${approve ? 'apply' : 'dismiss'} that: ${e.message}. It's still pending in your Inbox.` }] }));
    });
  }
  // ——— THE BRIEF'S CLOSE: one question at a time ———
  // Each step speaks its own question, puts its own card on the glass, and
  // waits. Yes/no can be tapped or spoken (the existing spoken-yes gate
  // handles the words). Answering files it on the rails — the same
  // approve/discard the Inbox screen uses, same undo — and the next question
  // follows. LATER leaves it pending and moves on, which has to stay
  // frictionless or the whole ritual becomes something to dread.
  startBriefQueue(decisions, remaining = 0) {
    if (!decisions?.length) return;
    // Ask from the setState CALLBACK, and hand the list down explicitly.
    // Reading this.state.briefQueue straight after setState finds the OLD
    // value (React has not committed yet), so the first question silently
    // did nothing: no card, no words, just an answer bar for a question he
    // was never asked.
    this.setState(
      { briefQueue: decisions, briefQueueIdx: 0, briefQueueRemaining: remaining },
      () => this.askBriefQuestion(0, decisions),
    );
  }
  askBriefQuestion(idx, list) {
    const q = (list || this.state.briefQueue || [])[idx];
    if (!q) return;
    this.putCard(q.card);
    this.setState((s) => ({
      briefQueueIdx: idx,
      voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: q.question, briefAsk: { recordId: q.recordId, idx } }],
      // the spoken-yes gate already understands one pending proposal — point
      // it at whichever question is live, so "yes" works without a tap
      voicePendingProposal: { recordId: q.recordId, title: q.label },
    }));
    if (this.state.voiceSpeak) this.speakTtsSentence(q.question, () => {});
  }
  answerBriefQuestion(recordId, answer) {
    const { briefQueue, briefQueueIdx } = this.state;
    if (!briefQueue) return;
    if (answer === 'later') {
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: 'Later' }] }));
    } else {
      this.resolveVoiceProposal(recordId, answer === 'yes');
    }
    this.advanceBriefQueue(briefQueueIdx + 1);
  }
  advanceBriefQueue(next) {
    const { briefQueue, briefQueueRemaining } = this.state;
    if (!briefQueue) return;
    if (next < briefQueue.length) {
      // a beat of air between answering and the next question, so it reads as
      // a conversation rather than a form
      clearTimeout(this.briefQueueT);
      this.briefQueueT = setTimeout(() => this.askBriefQuestion(next), 700);
      return;
    }
    const left = briefQueueRemaining;
    const line = left > 0
      ? `That's the important ones, sir. ${left} more ${left === 1 ? 'is' : 'are'} waiting in your Inbox whenever you want them.`
      : "That's everything that needed you, sir. Nothing else is waiting.";
    this.setState((s) => ({
      briefQueue: null, briefQueueIdx: 0, briefQueueRemaining: 0,
      voicePendingProposal: null,
      voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: line }],
    }));
    this.clearStage();
    if (this.state.voiceSpeak) this.speakTtsSentence(line, () => {});
  }
  endBriefQueue() {
    clearTimeout(this.briefQueueT);
    this.setState({ briefQueue: null, briefQueueIdx: 0, briefQueueRemaining: 0, voicePendingProposal: null });
    this.clearStage();
  }
  resolveVoiceProposal(recordId, approve) {
    const conn = getConnection(); if (!conn) return;
    const mark = (status, extra) => this.setState((s) => ({
      voicePendingProposal: s.voicePendingProposal?.recordId === recordId ? null : s.voicePendingProposal,
      voiceChat: s.voiceChat.map((m) => (m.proposal?.recordId === recordId ? { ...m, proposal: { ...m.proposal, status, ...extra } } : m)),
    }));
    const call = approve ? api.inboxApprove(conn, recordId) : api.inboxDiscard(conn, recordId);
    call.then(() => {
      mark(approve ? 'done' : 'dismissed');
      if (approve) { this.refreshLiveData(); this.refreshCalendarCard(); }
      const line = approve ? 'Done — it’s in. Undo lives in your Inbox.' : 'Left alone — nothing changed.';
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: line }] }));
      if (this.state.voiceSpeak) this.speak(line);
    }).catch((e) => {
      mark('error', { error: e.message });
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'system', text: `Couldn’t ${approve ? 'approve' : 'dismiss'} that: ${e.message}. It’s still pending in your Inbox.` }] }));
    });
  }
  // `text`: the live value handed over by the LocalInput composer, which may
  // not have reached App state yet (see LocalInput.jsx). Called without one
  // — the SEND button, a programmatic send — it falls back to state, which
  // is correct there because a click blurs the field and flushes it first.
  doOrb(text) {
    const q = (typeof text === 'string' ? text : this.state.orbInput).trim(); if (!q) return;
    this.resumeConv(); // anything sent un-pauses the conversation loop
    this.primeSpeech(); // inside the user gesture — unlocks audio on iOS
    // A short plain yes/no right after a proposal is a CONFIRMATION, not a
    // question — approve or dismiss deterministically, no model in the loop.
    // an offer Nova just made ("shall I have the Watcher digest it?") takes
    // the yes first — it is the most recent thing said, so it is what "yes"
    // means. Anything else moves the conversation on and the offer lapses.
    const offer = this.state.voicePendingOffer;
    if (offer && getConnection() && this.state.connectionStatus !== 'offline') {
      const yes = /^(yes|yep|yeah|sure|ok|okay|do it|go ahead|please do|go on|yes please)[.!\s]*$/i.test(q);
      const no = /^(no|nope|nah|don't|dont|leave it|skip|skip it|not now|no thanks)[.!\s]*$/i.test(q);
      if (yes || no) {
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: q }], orbInput: '', voicePendingOffer: null }));
        if (yes) this.acceptWatchOffer(offer);
        else {
          const line = 'As you wish, sir.';
          this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: line }] }));
          if (this.state.voiceSpeak) this.speak(line);
        }
        return;
      }
      this.setState({ voicePendingOffer: null });
    }
    const pending = this.state.voicePendingProposal;
    if (pending && getConnection() && this.state.connectionStatus !== 'offline') {
      const yes = /^(yes|yep|yeah|sure|ok|okay|do it|go ahead|confirm|approve|approved|yes please|please do|go for it|make it so|lock it in)[.!\s]*$/i.test(q);
      const no = /^(no|nope|nah|don't|dont|leave it|skip|skip it|cancel|not now|never mind|nevermind)[.!\s]*$/i.test(q);
      const later = /^(later|not now|skip|hold it|come back to (it|that)|leave it for now)[.!\s]*$/i.test(q);
      if (yes || no || later) {
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: q }], orbInput: '' }));
        // during the brief's close, an answer also moves to the next question
        if (this.state.briefQueue) this.answerBriefQuestion(pending.recordId, later ? 'later' : yes ? 'yes' : 'no');
        else this.resolveVoiceProposal(pending.recordId, yes);
        return;
      }
      // Anything else mid-close is a QUESTION ABOUT THE DECISION, not a
      // change of subject. This used to (a) kill the whole queue, (b) drop
      // the pending decision, and (c) hand his words to Ask Nova with no
      // mention of the question Nova had asked FOUR SECONDS EARLIER — so
      // "what's the point of leaving it on my list?" was answered with
      // "what specifically? The drafts in Inbox, one of the pending
      // videos…". A conversation that cannot follow its own question is
      // the failure he named. Now: the queue PAUSES (the answer bar stays,
      // yes/no/later still files it), and the ask carries the live decision
      // as context — deterministically, code deciding what Nova must know,
      // never hoping the model guesses.
      if (this.state.briefQueue) {
        const cur = this.state.briefQueue[this.state.briefQueueIdx];
        const preamble = `[Mid-brief decision context: you just asked him — "${cur?.question || pending.title}" (pending draft: "${pending.title}"). His message below is a follow-up about THAT decision. Answer it directly from the real data, briefly. Then remind him a yes, no, or later files it — the question is still open.]`;
        this.setState({ orbInput: '' });
        this.askNova(q, preamble);
        return;
      }
      // Outside the queue the pending draft used to be DISCARDED here — so a
      // clarifying question about a proposal threw the proposal away, and
      // the answer came back blind for the same reason the queue's did. It
      // now stays live: the ask's situation block names it, and his yes/no
      // still files it after the digression. The yes-regex is strict full-
      // sentence matching, so a "yes" buried in a later remark can't trip it.
    }
    // a configured backend → the real Ask Nova pipeline, even while the
    // status is still 'connecting' (the ask itself proves the connection);
    // ONLY demo mode gets the scripted preview
    const conn = getConnection();
    if (conn) {
      if (this.state.connectionStatus === 'offline') {
        this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: q }, { at: Date.now(), who: 'system', text: 'Offline — reconnect to the Mac to ask Nova.' }], orbInput: '' }));
        return;
      }
      this.setState({ orbInput: '' });
      this.askNova(q);
      return;
    }
    this.setState(s => ({ orbChat: [...s.orbChat, { at: Date.now(), who: 'you', text: q }], orbInput: '' }));
    setTimeout(() => this.typeIn('orbChat', 'nova', orbReply(q)), 480);
  }
  // THE MIC IS OPENING — boot the answer's machinery now, while he talks.
  // Spawning the conversation's process costs ~2.2s and assembling a cold
  // conversation's context ~2.4s; both used to land after his last word.
  // Called from every path that opens the microphone.
  prewarmAsk() {
    const conn = getConnection();
    if (!conn) return;
    const now = Date.now();
    if (this.lastPrewarm && now - this.lastPrewarm < 4000) return; // one per turn, not per keystroke
    this.lastPrewarm = now;
    api.prewarmAsk(conn, this.state.voiceSessionId || null);
    // Warm the SPEAKING side too, while he is still talking. The ElevenLabs
    // path already prewarms; the browser path paid its voice-list resolve on
    // the first sentence instead. Resolving here moves that off the critical
    // path — and it is safe to call unconditionally because it only reads.
    this.resolveSpeechVoice();
  }
  // "STAND DOWN" — the spoken way out. A conversation he can't end by
  // talking isn't a conversation; it's a machine that has to be tapped.
  // Matched on the CLIENT and never sent to the model: this is about the
  // microphone, and a round-trip to be told to stop listening is absurd.
  // Deliberately narrow — it must never eat a real question that happens to
  // contain the words.
  static STAND_DOWN = /^\s*(?:ok(?:ay)?|alright|right|hey nova)?[,\s]*(?:nova[,\s]*)?(?:stand down|stop listening|that'?s all|that'?ll be all|nothing else|go to sleep|never ?mind|dismissed|thank you,? that'?s all)\s*[.!]?\s*$/i;
  maybeStandDown(text) {
    if (!App.STAND_DOWN.test(String(text || ''))) return false;
    this.stopSpeaking();
    this.setState({
      voiceConvMode: false, voiceConvPaused: true, voiceReplyWindow: false,
      liveTalkOn: false, liveTextOpen: false, liveMicOpen: false, liveInput: '', orbInput: '',
      modelChoicePending: null, // "stop" cancels a pending research/watch model choice too
    });
    this.toastMsg('Standing down, sir.');
    return true;
  }
  // Put a card on the glass as its line begins. The one it replaces slides
  // into the rail — the reference's history stack, so the numbers he has
  // already heard stay readable while the brief runs on.
  putCard(card) {
    if (!card) return;
    this.setState((s) => ({
      stageCard: card,
      // his 21-Aug note: the chat beside it is distracting — when Nova puts
      // something on the glass, everything else blurs back, exactly like the
      // reel, so one thing at a time has his attention
      stageFocus: true,
      stageHistory: s.stageCard ? [s.stageCard, ...s.stageHistory].slice(0, 6) : s.stageHistory,
    }));
  }
  clearStage() { this.setState({ stageCard: null, stageHistory: [], stageFocus: false }); }
  // Tap a spent card in the rail to bring it back to the middle. The one it
  // displaces goes into the rail, so nothing is ever lost by looking.
  focusCard(card) {
    if (!card) return;
    this.setState((s) => ({
      stageCard: card,
      stageFocus: true,
      stageHistory: [s.stageCard, ...s.stageHistory.filter((c) => c !== card)].filter(Boolean).slice(0, 6),
    }));
  }
  dismissStage() { this.setState({ stageFocus: false }); }
  // A card is a snapshot of the moment it was spoken — so anything that
  // CHANGES the calendar has to re-pull it, or the glass keeps showing times
  // Nova itself just moved (his 21-Aug bug, screenshot attached to the ask).
  refreshCalendarCard() {
    const conn = getConnection();
    if (!conn) return;
    const isCal = (c) => c && c.kind === 'list' && /ON THE CALENDAR/.test(c.label || '');
    const { stageCard, stageHistory } = this.state;
    if (!isCal(stageCard) && !(stageHistory || []).some(isCal)) return;
    api.glassToday(conn).then(({ card }) => {
      if (!card) return;
      this.setState((s) => ({
        stageCard: isCal(s.stageCard) ? card : s.stageCard,
        stageHistory: (s.stageHistory || []).map((c) => (isCal(c) ? card : c)),
      }));
    }).catch(() => { /* the stale card is better than a broken screen; the vault is still truth */ });
  }

  // THE MORNING BRIEF, on the first open of the day. His ask: Nova opens the
  // day itself — the fleet's overnight work, the shape of the day, what it
  // wants him to keep in mind, and a question to help him prepare. It opens
  // the Voice screen because that is where the conversation lives, and it
  // leaves the mic open at the end so he can just answer.
  maybeMorningBrief() {
    if (!getConnection() || this.state.demoMode) return;
    const today = new Date().toDateString();
    let last = null;
    try { last = localStorage.getItem('novaos.morningBrief'); } catch { /* private mode */ }
    if (last === today) return;
    const h = new Date().getHours();
    if (h < 4 || h >= 12) return; // a "morning" brief at 9pm is a nuisance, not a briefing
    // THE DAY IS NOT MARKED BRIEFED HERE. It used to be, and that is why he
    // opened Nova, watched it land on Voice and sit there loading, and then
    // had to press BRIEF himself: the flag was committed BEFORE the brief
    // ran, so every failure downstream (offline at the 2.2s mark, voiceBusy
    // when runShow fired, a stalled /api/show) burned the whole day silently
    // and there was no second attempt. Mark it only once it has actually
    // spoken — see markBriefedToday().
    // let the app settle and the connection prove itself before it speaks
    this.morningT = setTimeout(() => {
      if (this.state.connectionStatus === 'offline') return;
      // the brief IS the greeting today — stand the doorman down BEFORE we
      // land on Voice, or Nova says hello over the top of its own brief
      try {
        localStorage.setItem('novaos.voiceGreet', JSON.stringify({ date: today, at: Date.now() }));
      } catch { /* private mode */ }
      this.navigate('voice');
      this.prewarmAsk();
      setTimeout(() => this.runShow('morning', { auto: true }), 700);
    }, 2200);
  }
  // Committed only when the brief has real content on screen. Keeping this
  // separate from maybeMorningBrief is the whole point: "we tried" and "he
  // was briefed" are different facts and must not share a flag.
  markBriefedToday() {
    const today = new Date().toDateString();
    try { localStorage.setItem('novaos.morningBrief', today); } catch { /* private mode */ }
  }
  // iOS gates audio behind a user gesture: playing a muted element and an
  // empty utterance during the tap unlocks both paths for the async reply.
  primeSpeech() {
    try {
      resumeAudioGraph(); // inside the gesture — the one moment iOS lets a suspended graph wake
      if (!this.sharedAudio) {
        // THE UNLOCK MUST PLAY SOMETHING REAL. `new Audio()` with no src
        // rejects play() instantly on iOS (NotSupportedError), which spends
        // the gesture on nothing — the element stays locked, every later
        // play() is refused, and the catch turns that into SILENCE with the
        // text still appearing. That was Nova saying nothing on his phone.
        // A tiny silent WAV is a real source, so the unlock actually takes.
        this.sharedAudio = new Audio(SILENT_WAV);
        this.sharedAudio.playsInline = true;
        this.sharedAudio.preload = 'auto';
      }
      // THE UNLOCK MUST PLAY SILENCE — and by this point it usually would
      // not have. drainTtsQueue reassigns sharedAudio.src to each TTS blob as
      // it plays, so this element is left holding the LAST SENTENCE NOVA
      // SPOKE. Calling play() on it to "unlock audio" therefore replayed that
      // sentence, at full volume, on every gesture: tapping the core on his
      // phone repeated the same greeting word for word every single time
      // (byte-identical, because it was the same blob), and the mic could not
      // open over the top of it — "Dictation: aborted".
      //
      // Only reset when nothing is genuinely playing, or a gesture mid-reply
      // would cut Nova off in the middle of a sentence.
      if (!this.ttsPlaying && this.sharedAudio.src !== SILENT_WAV) {
        try { this.sharedAudio.pause(); } catch { /* already idle */ }
        this.sharedAudio.src = SILENT_WAV;
      }
      // Re-play the silent clip on EVERY gesture, not just the first: iOS
      // re-locks the element after an interruption (a call, a route change,
      // the screen locking), and each gesture is a free chance to reclaim it.
      const unlock = this.sharedAudio.play();
      if (unlock?.then) {
        unlock.then(() => { this.audioUnlocked = true; })
          .catch(() => { this.audioUnlocked = false; });
      } else this.audioUnlocked = true;
      if (window.speechSynthesis && !this.speechPrimed) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        this.speechPrimed = true;
      }
    } catch { /* best-effort */ }
  }
  // The Morning Show / Evening Debrief: prepared receipts played as a
  // narrated sequence — each beat's text and pane reveal AS its audio
  // starts, and the closing pending item arms the spoken-yes gate. The
  // reel's morning scene, on Nova's rails.
  runShow(variant, opts = {}) {
    const conn = getConnection();
    if (!conn) return;
    // Something else is already speaking. The automatic brief must WAIT for
    // it rather than drop itself on the floor — this silent return, paired
    // with the day already being marked briefed, is the other half of why
    // his morning brief never arrived.
    if (this.state.voiceBusy) {
      const tries = opts.tries || 0;
      if (opts.auto && tries < 6) {
        clearTimeout(this.morningRetryT);
        this.morningRetryT = setTimeout(() => this.runShow(variant, { ...opts, tries: tries + 1 }), 1500);
      }
      return;
    }
    // THE BRIEF USED TO RACE THE TTS STATUS AND LOSE ON HIS PHONE.
    // `spoken` is decided from this.state.liveTts, which is fetched in the
    // startup batch. The automatic brief fires ~2.9s after open; on the Mac
    // that fetch has landed by then, on a phone over Tailscale it often has
    // not — so liveTts was still null, `spoken` came out false, every beat
    // was dumped on screen at once with no audio, and Nova never tried to
    // speak at all. That is the exact "works on my MacBook, silent on my
    // phone" split. Wait for the answer before deciding.
    if (!this.state.liveTts) {
      const waited = opts.ttsWaited || 0;
      if (waited < (opts.auto ? 12 : 4)) {
        clearTimeout(this.morningRetryT);
        this.morningRetryT = setTimeout(() => this.runShow(variant, { ...opts, ttsWaited: waited + 1 }), 1000);
        return;
      }
      // 12s and still no answer — proceed silently rather than not at all
    }
    this.stopSpeaking();
    this.primeSpeech();
    this.setState({ voiceBusy: true });
    // A stalled request used to leave the Voice screen spinning forever with
    // no error and no way back — his exact report: "looked like it was
    // loading and didn't do anything". .catch never fires on a hang.
    clearTimeout(this.showWatchdogT);
    this.showWatchdogT = setTimeout(() => {
      if (!this.state.voiceBusy) return;
      this.setState({ voiceBusy: false });
      this.toastMsg('Brief timed out — press BRIEF to retry.');
    }, 40000);
    api.show(conn, variant).then(({ steps, pending, decisions, remaining }) => {
      clearTimeout(this.showWatchdogT);
      this.setState({ voiceBusy: false });
      if (!steps?.length) { this.toastMsg('Nothing to brief right now.'); return; }
      const spoken = this.state.voiceSpeak && this.state.liveTts?.configured;
      // A brief that cannot speak used to just... not speak. No sound, no
      // reason, nothing to tap — which is how "it didn't speak again" ends up
      // being the whole bug report. Say WHICH of the three reasons it was,
      // and offer the one tap that fixes two of them (a tap is the gesture
      // iOS wants, and by then the engine status has usually arrived).
      if (!spoken) {
        const why = !this.state.voiceSpeak
          ? 'spoken replies are switched off in Settings'
          : !this.state.liveTts
            ? "Nova hadn't heard back from your Mac about the voice engine yet"
            : 'no speech engine is configured on your Mac';
        this.noteSpeechUnavailable(steps.map((st) => st.say).filter(Boolean), why);
      }
      // THE DAY IS BRIEFED WHEN HE ACTUALLY HEARS IT — not when the steps
      // arrive. On his phone an automatic brief has NO user gesture behind
      // it (it fires on a timer after the app opens), and iOS refuses audio
      // outside a gesture: every line was blocked, yet the day was already
      // stamped briefed, so it never tried again and the automatic brief
      // simply never spoke. Marking on genuine playback means a blocked
      // morning retries on the next open instead of being written off.
      // When speech is off entirely, reading it IS the brief.
      if (opts.auto && !spoken) this.markBriefedToday();
      if (opts.auto && spoken) this.briefPendingMark = true;
      this.clearStage();
      // THE FIRST BEAT NEVER WAITS FOR AUDIO.
      //
      // Every beat used to be revealed by its own onPlay callback, i.e. when
      // its audio BEGAN. On a cold cache the first sentence took 5.9s to
      // synthesize (measured, 27 Aug), so the brief opened onto a blank
      // screen and sat there — no words, no card, nothing to look at — until
      // the voice arrived. That silence is the whole of "it didn't work and
      // the animations didn't appear": the app was working perfectly and
      // showing him nothing while it did.
      //
      // The opening beat now renders the instant the steps land, and its
      // audio catches up to it. Later beats still follow the voice, because
      // that choreography is right once talking has started — it is only the
      // opening gap that reads as broken.
      steps.forEach((st, i) => {
        const show = () => {
          this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: st.say, panel: st.panel || undefined }] }));
          this.putCard(st.card); // the glass keeps up with the voice
        };
        if (!spoken) { show(); return; }
        if (i === 0) {
          show();
          // still pass a callback: it marks the utterance reply-worthy, which
          // is what earns the no-button reply window when speaking ends
          this.speakTtsSentence(st.say, () => {});
        } else {
          this.speakTtsSentence(st.say, show);
        }
      });
      // THE CLOSE — his ask: rather than leaving him to remember a wall of
      // analysis and act on it later, walk the open decisions one at a time.
      // Queued behind the narration so the first question lands after Nova
      // has finished speaking, not over the top of it.
      if (steps.length && Array.isArray(decisions) && decisions.length) {
        const startQueue = () => this.startBriefQueue(decisions, remaining || 0);
        if (spoken) this.queueTtsFinalize(startQueue); else startQueue();
      } else if (pending) {
        // The brief is the strongest nav signal in the app: when it ends on a
        // proposal, the next tap is almost always into the Inbox to answer it.
        // Warm that chunk while Nova is still talking, so the screen he was
        // just told to visit is already parsed when he gets there.
        // (The plan called for a Brief→Train prefetch; the brief has no Train
        // beat — its beats point at the Inbox. Warming what it actually names.)
        warmScreen('inbox');
        const arm = () => this.setState({ voicePendingProposal: { recordId: pending.recordId, title: pending.title } });
        if (spoken) this.queueTtsFinalize(arm); else arm();
      }
      // his turn, hands-free — conversation mode ON so the brief ends in a
      // conversation rather than a monologue with a button at the end
      if (spoken) this.queueTtsFinalize(() => {
        this.setState((s) => ({ voiceConvMode: true, voiceConvPaused: false, voiceAutoListenTick: s.voiceAutoListenTick + 1 }));
      });
    }).catch((e) => {
      clearTimeout(this.showWatchdogT);
      this.setState({ voiceBusy: false });
      this.toastMsg('Brief failed: ' + e.message);
    });
  }
  // WHAT IS ON HIS SCREEN, AS TEXT — the model's eyes.
  //
  // "Context and flow everywhere" fails at one specific joint: he says
  // "this", "that", "the first one", and the model has never been told what
  // is in front of him. Every surface that showed him something the voice
  // couldn't answer questions about — the card on the glass, an undecided
  // proposal, a workout in progress, the screen he's standing on — is
  // assembled HERE, deterministically, and rides with every ask. The block
  // is self-describing (its instruction travels inside it), so it works in
  // sessions minted before this existed and needs no prompt-version dance.
  // Code decides what Nova must know; the model never has to guess what
  // "it" is again.
  buildAskSituation({ skipProposal = false } = {}) {
    const s = this.state;
    const bits = [];
    const card = s.stageCard;
    if (card?.label) {
      let detail = '';
      if (card.kind === 'metric') detail = ` showing ${card.value ?? ''}${card.unit || ''}${card.caption ? ` (${card.caption})` : ''}`;
      else if (card.kind === 'list' && card.items?.length) detail = `: ${card.items.slice(0, 7).map((it) => it.name + (it.note ? ` [${it.note}]` : '')).join('; ')}`;
      else if (card.kind === 'bars' && card.bars?.length) detail = `, a chart of ${card.bars.slice(0, 8).map((b) => b.name).filter(Boolean).join(', ')}`;
      bits.push(`A card titled "${card.label}" is on the glass${detail}${card.foot ? ` — footnote: ${card.foot}` : ''}`);
    }
    if (!skipProposal && s.voicePendingProposal?.title) {
      bits.push(`An undecided draft is open: "${s.voicePendingProposal.title}" — his yes/no/later files it`);
    }
    const ws = s.workoutSession;
    if (ws?.routineName) {
      const done = ws.exercises.filter((e) => e.skipped || (e.sets || []).every((x) => x.done)).length;
      const current = ws.exercises.find((e) => !e.skipped && (e.sets || []).some((x) => !x.done));
      bits.push(`A live workout is in progress: ${ws.routineName}, ${done}/${ws.exercises.length} exercises done${current ? `, currently on ${current.name}` : ''}`);
    }
    if (s.screen && s.screen !== 'voice') bits.push(`He is on the ${s.screen} screen`);
    if (!bits.length) return null;
    return `[On his screen right now — resolve "this/that/it/the first one" against it and answer from it; never read this block back: ${bits.join('. ')}.]`;
  }
  // `context`, when present, is a bracketed situational preamble a CALLER
  // decided Nova needs (the live brief decision). The screen situation is
  // added here regardless — one choke point, every ask has eyes. Both travel
  // with the request and never appear in the transcript: his words are what
  // he said, not what the plumbing wrapped around them.
  askNova(question, context) {
    const conn = getConnection();
    if (!conn || this.state.voiceBusy) return;
    if (this.maybeStandDown(question)) return;
    // Answering the model-choice gate is not a new question for Nova to
    // reason about — intercept it here, before it ever reaches Ask Nova.
    if (this.state.modelChoicePending) { this.resolveModelChoiceFromSpeech(question); return; }
    this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: question }], voiceBusy: true }));
    this.stopSpeaking();
    this.speakAck(question); // fills the 5-8s think-gap immediately
    // caller context already names the pending decision when present —
    // don't say it twice
    const situation = this.buildAskSituation({ skipProposal: !!context });
    const sent = [context, situation, question].filter(Boolean).join('\n\n');
    api.ask(conn, sent, this.state.voiceSessionId || null).then((resp) => {
      if (resp.text) {
        // Reflex answer — code replied from the live record, no job to poll.
        // Voice leads here too: the text lands when the audio starts.
        this.setState({ voiceBusy: false });
        const show = () => this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'nova', text: resp.text, evidence: this.offerVerdictFor(resp.text) }] }));
        if (this.state.voiceSpeak) this.speakTtsSentence(resp.text, show);
        else { show(); this.maybeAutoListen(); }
        return;
      }
      const { jobId } = resp;
      // survive a reclaim mid-answer: the job id persists so boot can
      // re-attach the poll instead of losing the in-flight reply
      try { localStorage.setItem('novaos.askJob', JSON.stringify({ jobId, askedAt: Date.now() })); } catch { /* best-effort */ }
      this.attachAskPoll(conn, jobId);
    }).catch((e) => {
      this.setState((s) => ({ voiceBusy: false, voiceChat: [...s.voiceChat, { at: Date.now(), who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  // The doorman: a DETERMINISTIC greeting when he arrives at the Voice
  // screen — first arrival of the day gets the time of day, a return after
  // a real gap gets "Welcome back." Code speaks it instantly (no model, no
  // latency); the prompt's register keeps the address going from there.
  maybeGreet(origin = 'arrive') {
    // WHEN a greeting is due stays deterministic (first arrival of the day,
    // or a return after 3+ quiet hours). The WORDS are generated fresh every
    // time from real receipts — Hayden's rule: nothing Nova says is
    // templated. If the model can't be reached, Nova stays quiet; a canned
    // fallback line would be exactly the thing this replaced.
    // The doorman greets at ANY door: on the Voice screen it streams into
    // the transcript; anywhere else it arrives as a HUD banner (and still
    // lands in the transcript for when he opens Voice).
    if (this.state.demoMode || !getConnection() || this.state.connectionStatus === 'offline') return;
    if (this.greetInFlight) return;
    const now = Date.now();
    const today = new Date().toDateString();
    let last = {};
    try { last = JSON.parse(localStorage.getItem('novaos.voiceGreet')) || {}; } catch { /* fresh */ }
    const gap = last.date !== today ? 'new-day'
      : (last.at && now - last.at > 3 * 3600e3) ? 'return' : null;
    if (!gap) return;
    try { localStorage.setItem('novaos.voiceGreet', JSON.stringify({ date: today, at: now })); } catch { /* best-effort */ }
    this.greetInFlight = true;
    const conn = getConnection();
    api.greet(conn, gap).then(({ jobId }) => {
      this.startPoll('greet', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 45_000,
        intervalMs: 700,
        onProgress: (job) => {
          if (job.partial && this.state.screen === 'voice') this.applyStreamPartial('voiceChat', 'nova', job.partial);
        },
        onReady: (job) => {
          this.greetInFlight = false;
          const text = job.result.text;
          this.finalizeStream('voiceChat', { at: Date.now(), who: 'nova', text });
          if (this.state.screen !== 'voice') {
            clearTimeout(this.greetT);
            this.setState({ greetBanner: { text } });
            this.greetT = setTimeout(() => this.setState({ greetBanner: null }), 30_000);
          }
          // best-effort speech: browsers may block un-gestured audio; the
          // banner and transcript carry the words either way
          if (this.state.voiceSpeak) { if (origin === 'voice') this.primeSpeech(); this.speak(text); }
        },
        onError: () => {
          this.greetInFlight = false;
          this.setState((s) => ({ voiceChat: s.voiceChat.filter((m) => !m.streaming) }));
        },
      });
    }).catch(() => { this.greetInFlight = false; /* quiet — never a scripted stand-in */ });
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
      this.setState((s) => ({ ritualDone: done, voiceBusy: true, voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: label }] }));
      this.stopSpeaking();
      this.attachAskPoll(conn, jobId);
    }).catch((e) => {
      this.setState((s) => ({ voiceChat: [...s.voiceChat, { at: Date.now(), who: 'system', text: 'Error: ' + e.message }] }));
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
    this.showPresenceForSpeech(); // the icon appears the moment Nova talks
  }
  endSpeech() {
    this.speechActive = Math.max(0, (this.speechActive || 0) - 1);
    if (this.speechActive === 0) {
      this.setState({ voiceSpeaking: false }, () => this.maybeAutoListen());
      // The reply window: Nova just finished SPEAKING to him — talking back
      // should need no button, conversation mode or not. One-shot mic for
      // ~12s on the Voice screen; a reply routes like any spoken ask, and
      // silence closes it quietly. (He spoke back to a brief and nothing
      // registered — a voice that talks AT you is not a companion.)
      if (this.replyWorthy && this.state.voiceSpeak && !this.state.voiceConvMode && !this.state.voiceBusy) {
        clearTimeout(this.replyWindowTimer);
        this.setState((s) => ({ voiceReplyWindow: true, voiceAutoListenTick: s.voiceAutoListenTick + 1 }));
        this.replyWindowTimer = setTimeout(() => this.setState({ voiceReplyWindow: false }), 12_000);
      }
      this.replyWorthy = false;
      // after a quiet 3s, hand the audio session back (his music resumes);
      // any new speech or gesture re-claims it instantly
      clearTimeout(this.audioReleaseTimer);
      this.audioReleaseTimer = setTimeout(() => {
        if ((this.speechActive || 0) === 0 && !this.ttsPlaying && !(this.ttsQueue || []).length) releaseAudioGraph();
      }, 3000);
    }
  }
  stopSpeaking() {
    try { window.speechSynthesis.cancel(); } catch { /* unsupported */ }
    try { this.currentAudio?.pause(); } catch { /* fine */ }
    this.currentAudio = null;
    try { this.currentSource?.stop(); } catch { /* already ended */ }
    this.currentSource = null;
    this.resetTtsQueue(); // in-flight sentence fetches land against a stale generation and vanish
    this.speechActive = 0;
    if (this.state.voiceSpeaking) this.setState({ voiceSpeaking: false });
    clearTimeout(this.audioReleaseTimer);
    this.audioReleaseTimer = setTimeout(() => {
      if ((this.speechActive || 0) === 0 && !this.ttsPlaying) releaseAudioGraph();
    }, 3000);
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
  // Gratitude, agreement and hellos are not work. "Perfect, thanks Nova"
  // must never be met with "On it, sir" — his note: it doesn't need to
  // analyse anything. Mirrors the server's small-talk reflex so the ack is
  // never spoken before the request has even left the device.
  static SMALL_TALK = /^(?:ok(?:ay)?|alright|right|perfect|great|nice|good|cool|lovely|brilliant|awesome|cheers|got it|understood|noted|sounds good|hi|hey|hello|morning|good morning|afternoon|evening)?[,\s]*(?:thanks|thank you|ta|cheers|much appreciated|appreciate it)?[,\s]*(?:mate|nova|jarvis|sir)?[.!]?$/i;
  speakAck(question) {
    if (!this.state.voiceSpeak) return;
    const q = (question || '').trim();
    if (App.SMALL_TALK.test(q)) return; // a thank-you gets an answer, not a receipt
    if (q.length < 12) return; // short asks answer fast enough
    // rotate rather than random: no repeat twice running, no randomness to debug
    this.ackIdx = ((this.ackIdx ?? -1) + 1) % this.ACK_LINES.length;
    const line = this.ACK_LINES[this.ackIdx];
    if (this.state.liveTts?.configured) {
      // his own voice, ~0.5s local synth — and the FIFO guarantees the ack
      // lands BEFORE the reply's first sentence, never over it
      this.speakTtsSentence(line);
      return;
    }
    this.beginSpeech();
    this.speakFallback(line, () => this.endSpeech());
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
    this.prewarmAsk(); // his turn is starting — get the process ready for it
    if ((this.state.screen !== 'voice' && !this.state.liveTalkOn) || this.state.voiceBusy) return;
    if ((this.speechActive || 0) > 0) return;
    this.setState((s) => ({ voiceAutoListenTick: s.voiceAutoListenTick + 1 }));
  }
  toggleConvMode() {
    this.convEmpties = 0;
    const turningOn = !this.state.voiceConvMode;
    if (turningOn) {
      // Like raising Siri: the tap IS the start of the conversation. Cut any
      // speech (its speechActive would gate maybeAutoListen), unlock audio
      // inside this gesture, and open the mic unconditionally — not through
      // maybeAutoListen's politeness checks.
      this.stopSpeaking();
      this.primeSpeech();
      this.prewarmAsk();
    }
    // one commit: mode + listen tick together — every extra render is a
    // beat between his tap and the mic opening
    this.setState((s) => ({
      voiceConvMode: !s.voiceConvMode,
      voiceConvPaused: false,
      voiceAutoListenTick: turningOn ? s.voiceAutoListenTick + 1 : s.voiceAutoListenTick,
    }));
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
  // ——— The streamed voice: sentence-level TTS pipelining ———
  // A whole-reply round trip means silence for the full compose time PLUS
  // the full synthesis time. Instead each finished sentence goes to /api/tts
  // the moment it exists, fetches run in parallel, and playback drains a
  // strict FIFO through the one gesture-unlocked element — Nova starts
  // talking seconds before he has finished thinking. A generation counter
  // makes a stop/new-turn flush every in-flight fetch harmless.
  resetTtsQueue() {
    // Flushing must never eat words or a reply's completion: reveal any
    // text that hadn't played yet and run any pending finalizer, THEN drop
    // the queue. An interrupted reply shows instantly instead of vanishing.
    for (const e of this.ttsQueue || []) {
      try { if (!e.revealed) e.onPlay?.(); e.finalize?.(); } catch { /* reveal is best-effort */ }
    }
    this.ttsGen = (this.ttsGen || 0) + 1;
    this.ttsQueue = [];
    this.ttsPlaying = false;
  }
  // onPlay fires when this sentence's AUDIO starts (or when it provably
  // can't) — it is how text is revealed in sync with speech instead of
  // seconds ahead of it. He named the failure exactly: text-first feels
  // like pressing play on something already written.
  speakTtsSentence(text, onPlay) {
    const clean = (text || '').trim().slice(0, 2400);
    if (!clean) return;
    const conn = getConnection();
    if (!conn || !this.state.liveTts?.configured) { onPlay?.(); this.speakIncremental(clean); return; }
    const gen = this.ttsGen || 0;
    // conversational output (replies, briefs, greetings) carries a reveal
    // callback; previews/acks/fillers don't — only the former earns a
    // no-button reply window when the speaking ends
    if (onPlay) this.replyWorthy = true;
    const entry = { done: false, buffer: null, blob: null, onPlay, revealed: false, said: clean };
    (this.ttsQueue = this.ttsQueue || []).push(entry);
    this.beginSpeech(); // matched by endSpeech when the entry plays out or drops
    api.ttsAudio(conn, clean, this.state.voiceVoiceId || undefined)
      .then(async (blob) => {
        // decode NOW, while earlier sentences play — playback then starts
        // from pre-decoded samples on the audio thread, jitter-proof
        // keep the blob EITHER WAY — the decoded buffer can only play through
        // the audio graph, and on iOS the graph is often suspended by then
        entry.blob = blob;
        try { entry.buffer = await decodeSpeech(await blob.arrayBuffer()); } catch { /* element path covers it */ }
      })
      .catch(() => { entry.failed = true; })
      .finally(() => { entry.done = true; this.drainTtsQueue(gen); });
  }
  // A completion barrier: runs when the queue reaches it — i.e. after every
  // sentence queued before it has spoken. Carries a reply's final commit
  // (panel, proposal, streaming:false) so those land WITH the voice, not
  // ahead of it.
  queueTtsFinalize(fn) {
    (this.ttsQueue = this.ttsQueue || []).push({ done: true, finalize: fn });
    this.drainTtsQueue(this.ttsGen || 0);
  }
  drainTtsQueue(gen) {
    if (gen !== (this.ttsGen || 0)) return; // flushed mid-flight — the fetch's beginSpeech was already zeroed
    if (this.ttsPlaying) return;
    const head = (this.ttsQueue || [])[0];
    if (!head || !head.done) return; // strict order: nothing plays past an unfinished head
    this.ttsQueue.shift();
    if (head.finalize) { try { head.finalize(); } catch { /* commit is best-effort */ } this.drainTtsQueue(gen); return; }
    if (head.failed || (!head.buffer && !head.blob)) {
      // can't speak it — reveal the words anyway; text must never be lost
      try { head.onPlay?.(); head.revealed = true; } catch { /* best-effort */ }
      this.endSpeech(); this.drainTtsQueue(gen); return;
    }
    this.ttsPlaying = true;
    resumeAudioGraph(); // a suspended graph plays SILENTLY — resume before every chunk
    // ...but resume() only lands near a gesture, and a reply arrives from the
    // network. If the graph is still not running, the decoded buffer CANNOT
    // be heard — fall through to the gesture-unlocked <audio> element, which
    // plays through the OS directly. (Nova went silent on his phone for
    // exactly this reason; the watchdog made it look like it had spoken.)
    if (head.buffer && graphRunning()) {
      // the crisp path: pre-decoded samples straight onto the audio thread
      const src = playSpeechBuffer(head.buffer, () => {
        if (this.currentSource === src) this.currentSource = null;
        if (gen !== (this.ttsGen || 0)) return;
        this.ttsPlaying = false; this.endSpeech();
        this.drainTtsQueue(gen);
      });
      this.currentSource = src;
      try { head.onPlay?.(); head.revealed = true; } catch { /* best-effort */ }
      return;
    }
    const url = URL.createObjectURL(head.blob);
    const audio = this.sharedAudio || new Audio();
    this.currentAudio = audio;
    const detachMeter = attachSpeechElement(audio); // the core hears every sentence
    // no meter available (unwired element on iOS) → the core rides the
    // synthetic envelope so it still visibly speaks
    const synthetic = !graphRunning();
    if (synthetic) holdSyntheticSpeech(true);
    let settled = false; // ended/error/rejected-play can ALL fire for one chunk on a src swap
    const done = () => {
      if (settled) return;
      settled = true;
      if (synthetic) holdSyntheticSpeech(false);
      URL.revokeObjectURL(url); detachMeter();
      if (gen !== (this.ttsGen || 0)) return; // a stop flushed this generation — don't touch live state
      this.ttsPlaying = false; this.endSpeech();
      this.drainTtsQueue(gen);
    };
    audio.src = url;
    audio.onended = done;
    audio.onerror = done;
    audio.play().then(() => {
      // audio is genuinely rolling — NOW the words may appear
      this.noteSpeechHeard();
      try { head.onPlay?.(); head.revealed = true; } catch { /* best-effort */ }
    }).catch((err) => {
      // The reply exists but the device refused to play it. NEVER let that
      // be silent AND invisible — that is exactly how "I heard nothing"
      // happened with no way to tell why.
      this.noteSpeechBlocked(head.said, err);
      try { head.onPlay?.(); head.revealed = true; } catch { /* best-effort */ }
      done();
    });
  }
  // VOICE SELF-TEST. "I heard nothing" has half a dozen possible causes and
  // no way to tell them apart from the couch. This walks the real path —
  // replies enabled, engine reachable, audio fetched, audio actually
  // PLAYED — and names the stage that failed, from inside his tap.
  async runVoiceTest() {
    const conn = getConnection();
    const set = (stage, ok, detail) => this.setState((s) => ({
      voiceTest: { ...(s.voiceTest || {}), running: true, stages: [...((s.voiceTest || {}).stages || []), { stage, ok, detail }] },
    }));
    this.setState({ voiceTest: { running: true, stages: [] } });
    this.primeSpeech(); // inside the gesture
    set('Spoken replies', !!this.state.voiceSpeak, this.state.voiceSpeak ? 'on' : 'OFF — turn it on above');
    set('Connected to your Mac', !!conn, conn ? 'yes' : 'no — set the backend URL in Settings');
    if (!conn) { this.setState((s) => ({ voiceTest: { ...s.voiceTest, running: false } })); return; }
    set('Speech engine', !!this.state.liveTts?.configured, this.state.liveTts?.configured ? (this.state.liveTts.engine || 'ready') : 'not configured — the browser voice will be used');
    let blob = null;
    try {
      blob = await api.ttsAudio(conn, 'Voice test. If you can hear this, sir, everything is working.', this.state.voiceVoiceId || undefined);
      set('Audio received', true, `${Math.round(blob.size / 1024)} KB`);
    } catch (e) {
      set('Audio received', false, e.message);
      this.setState((s) => ({ voiceTest: { ...s.voiceTest, running: false } }));
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = this.sharedAudio || new Audio();
    audio.src = url;
    try {
      await audio.play();
      set('Playing', true, 'you should be hearing it now');
    } catch (e) {
      set('Playing', false, `${e?.name || 'refused'} — check the silent switch, the volume, and that Nova is allowed to play sound`);
    }
    audio.onended = () => URL.revokeObjectURL(url);
    this.setState((s) => ({ voiceTest: { ...s.voiceTest, running: false } }));
  }
  // Speech genuinely reached his ears — clear any standing warning.
  noteSpeechHeard() {
    this.speechEverPlayed = true;
    this.speechBlockedTexts = [];
    // the automatic brief only counts as delivered once a line truly played
    if (this.briefPendingMark) { this.briefPendingMark = false; this.markBriefedToday(); }
    if (this.state.speechBlocked) this.setState({ speechBlocked: null });
  }
  // It didn't. Say so, and keep the words so one tap can play them: a tap is
  // a gesture, which is the very thing iOS wants before it will make sound.
  // A multi-sentence sequence (the morning brief is the extreme case — a
  // dozen lines queued back to back) blocks EVERY sentence the same way, one
  // after another; the banner used to just get overwritten by whichever line
  // failed last, so one tap only ever replayed the tail of a brief. Lines
  // are now collected on an INSTANCE FIELD (not read back from this.state)
  // for the whole speaking generation (ttsGen — the same counter
  // stopSpeaking()/resetTtsQueue() already use to know what's stale):
  // consecutive blocked sentences can land in the same React batch, where
  // this.state.speechBlocked would still read its pre-batch value for all of
  // them — reading back state to decide whether to accumulate would silently
  // drop everything but the last line, the exact bug this replaces.
  noteSpeechBlocked(said, err) {
    const reason = /NotAllowed/i.test(String(err?.name || err || ''))
      ? 'your phone blocked the audio'
      : /NotSupported/i.test(String(err?.name || err || '')) ? 'the audio format was refused' : 'the audio could not start';
    const gen = this.ttsGen || 0;
    if (this.speechBlockedGen !== gen) { this.speechBlockedTexts = []; this.speechBlockedGen = gen; }
    this.speechBlockedTexts.push(said || '');
    this.setState({ speechBlocked: { texts: this.speechBlockedTexts.slice(), reason } });
  }
  // Speech was never ATTEMPTED (engine off, replies off, status not in yet) —
  // distinct from attempted-and-refused, but it costs him the same silence,
  // so it earns the same visible bar and the same one-tap replay.
  noteSpeechUnavailable(texts, reason) {
    if (!texts?.length) return;
    this.speechBlockedTexts = texts.slice();
    this.speechBlockedGen = this.ttsGen || 0;
    this.setState({ speechBlocked: { texts: texts.slice(), reason } });
  }
  // Replay what he never heard, from inside the tap.
  replayBlockedSpeech() {
    const b = this.state.speechBlocked;
    if (!b) return;
    this.speechBlockedTexts = [];
    this.primeSpeech();
    this.setState({ speechBlocked: null });
    this.stopSpeaking();
    for (const t of b.texts) { if (t) this.speakTtsSentence(t, () => {}); }
  }
  // ——— THE MODEL CHOICE GATE ———
  // Before a reasoning-heavy job runs on its default model, ask whether this
  // ONE run should use Opus instead (his ask, 24 Aug). `run` is held until
  // answered — a tap on the popup, a spoken reply while on the Voice screen,
  // or a cancel — and never fires on its own; that IS the "hard gate".
  gateModelChoice(lane, run) {
    this.setState({ modelChoicePending: { lane, run } });
  }
  resolveModelChoice(model) {
    const p = this.state.modelChoicePending;
    if (!p) return;
    this.setState({ modelChoicePending: null });
    p.run(model);
  }
  // An explicit "no" — the request itself is abandoned, not defaulted. A
  // silent auto-run on dismiss would make the gate decorative.
  cancelModelChoice() {
    if (!this.state.modelChoicePending) return;
    this.setState({ modelChoicePending: null });
    this.toastMsg('Cancelled — nothing was dispatched.');
  }
  // A spoken reply to the gate is not a new question — parsed locally and
  // instantly (no model round-trip to tell "opus" from "sonnet" apart).
  // Genuinely ambiguous replies fall back to the safe default rather than
  // asking again: a hard gate that can never resolve would leave the
  // original request unanswered forever, which is worse than proceeding.
  resolveModelChoiceFromSpeech(question) {
    const pending = this.state.modelChoicePending;
    const t = String(question || '').toLowerCase();
    const choice = /\b(opus|deeper|stronger|the strong one|go big|more thorough|go deep|really dig in)\b/.test(t) ? 'opus'
      : /\b(sonnet|no|nah|nope|fine|default|quick|as.is|go ahead|that'?s fine|keep it|normal|standard)\b/.test(t) ? 'sonnet'
      : null;
    const model = choice || 'sonnet';
    const said = choice ? `${model === 'opus' ? 'Opus' : 'Sonnet'} it is.` : "Not sure I caught that, sir — I'll go with Sonnet.";
    this.setState((s) => ({
      voiceChat: [...s.voiceChat, { at: Date.now(), who: 'you', text: question }, { at: Date.now(), who: 'nova', text: said }],
      modelChoicePending: null,
    }));
    if (this.state.voiceSpeak) this.speak(said);
    pending.run(model);
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
        // the core hears Nova speak: a Web Audio tap on this element drives
        // the heart's swell (audioLevel) for the length of the reply
        const detachMeter = attachSpeechElement(audio);
        const synthetic = !graphRunning(); // unwired on iOS — the core still speaks
        if (synthetic) holdSyntheticSpeech(true);
        const release = () => { if (synthetic) holdSyntheticSpeech(false); URL.revokeObjectURL(url); detachMeter(); };
        audio.src = url;
        audio.onended = () => { release(); finish(); };
        audio.onerror = () => { release(); finish(); };
        audio.play().catch(() => { release(); this.speakFallback(clean, finish); });
      }).catch(() => this.speakFallback(clean, finish));
    } else {
      this.speakFallback(clean, finish);
    }
  }
  // The chosen SpeechSynthesisVoice, resolved once and kept. getVoices() plus
  // three fallback scans ran on EVERY sentence of a spoken reply, and on this
  // machine the list is ~200 voices — work repeated per sentence for an answer
  // that never changes mid-reply. Re-resolves only when his pick changes or
  // the engine's voice list does (it loads asynchronously, and on iOS it can
  // arrive empty and fill in later).
  resolveSpeechVoice() {
    let voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch { return null; }
    const key = `${this.state.speechVoiceURI || ''}|${voices.length}`;
    if (this.speechVoiceKey === key) return this.speechVoiceCached;
    const chosen = this.state.speechVoiceURI && voices.find((v) => v.voiceURI === this.state.speechVoiceURI);
    const picked = chosen || voices.find((v) => v.lang === 'en-AU') || voices.find((v) => (v.lang || '').startsWith('en')) || null;
    // don't cache a miss from an empty list — that's "not loaded yet", not "none"
    if (voices.length) { this.speechVoiceKey = key; this.speechVoiceCached = picked; }
    return picked;
  }
  speakFallback(text, finish) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.resolveSpeechVoice();
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
  setVoiceSpeak(on) {
    localStorage.setItem('novaos.voiceSpeak', on ? '1' : '0');
    this.setState({ voiceSpeak: on });
    if (!on) this.stopSpeaking();
  }
  // "Hey Nova" — opt-in, because it holds the mic open. Nothing in Nova
  // turns a microphone on without him saying so.
  setWakeWord(on) {
    localStorage.setItem('novaos.wakeWord', on ? '1' : '0');
    this.setState({ wakeWordOn: on });
    if (on) this.toastMsg('Listening for "Hey Nova".');
  }
  // Heard its name. Two jobs, in this order: CUT NOVA OFF (barge-in — the
  // whole point of being able to say its name mid-reply), then open the mic
  // exactly as a tap on the core does. Nothing here starts listening on its
  // own: the mic opens because he said the words or touched the icon.
  onWakeWord() {
    this.stopSpeaking();
    this.prewarmAsk();
    if (this.state.liveTalkOn || this.state.screen === 'voice') {
      this.setState((s) => ({ voiceConvMode: true, voiceConvPaused: false, voiceBusy: false, voiceAutoListenTick: s.voiceAutoListenTick + 1 }));
      return;
    }
    this.startLiveTalk();
  }
  // The Mac's full-screen mode: the sidebar folds away behind a themed
  // chevron (⌘B also toggles it), and the arrow to bring it back rides the
  // left edge so the way out is never hidden.
  toggleSidebar() {
    const hidden = !this.state.sidebarHidden;
    try { localStorage.setItem('novaos.sidebarHidden', hidden ? '1' : '0'); } catch { /* best-effort */ }
    this.setState({ sidebarHidden: hidden });
  }
  setVoiceId(id) {
    localStorage.setItem('novaos.voiceId', id);
    // hear the choice immediately — a short statement in the NEW voice, so
    // picking is never guesswork (and never a question he isn't answering).
    // Debounced: flicking through the list previews only where he LANDS —
    // rapid stop/queue cycles on the shared element raced and went mute.
    this.setState({ voiceVoiceId: id }, () => {
      this.stopSpeaking();
      clearTimeout(this.voicePreviewTimer);
      this.voicePreviewTimer = setTimeout(() => {
        if (this.state.voiceVoiceId !== id) return; // he moved on — preview the final pick only
        if (this.state.voiceSpeak && this.state.liveTts?.configured) this.speakTtsSentence('This is how I sound, sir.');
      }, 300);
    });
  }
  doCoach(preset) {
    const q = (preset || this.state.coachInput).trim(); if (!q) return;
    const conn = getConnection();
    // live backend → the real evidence-based coach; demo keeps the script
    if (conn && this.state.connectionStatus !== 'demo') {
      if (this.state.coachBusy) return;
      this.setState((s) => ({ coachChat: [...s.coachChat, { at: Date.now(), who: 'you', text: q }], coachInput: '', coachBusy: true }));
      // a live session travels with the question — the Coach answers for the
      // gym floor when one is in progress (never for a history edit)
      const ws = this.state.workoutSession;
      const liveSession = ws && !this.state.editingSessionId
        ? { routineName: ws.routineName, exercises: ws.exercises.map((e) => ({ name: e.name, skipped: !!e.skipped, sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe || null, done: !!s.done })) })) }
        : null;
      // a trailing PROPOSE line is a typed directive for the server, not
      // prose — keep it out of the streamed render
      const stripDirective = (t) => t.replace(/(^|\n)\s*(SHOW|PROPOSE|RESEARCH)\s*(\{[\s\S]*)?$/, '');
      api.askCoach(conn, q, this.state.coachSessionId || null, liveSession).then(({ jobId }) => {
        this.startPoll('coach', () => api.claudeCodeJob(conn, jobId), {
          timeoutMs: 3 * 60_000,
          intervalMs: 700,
          onProgress: (job) => {
            if (!job.partial) return;
            const shown = stripDirective(job.partial);
            if (shown) this.applyStreamPartial('coachChat', 'coach', shown);
          },
          onReady: (job) => {
            if (job.result.sessionId) {
              localStorage.setItem('novaos.coachSession', job.result.sessionId);
              this.setState({ coachSessionId: job.result.sessionId });
            }
            // keep the panel: a Coach answer with a figure on screen is the
            // whole point — dropping it here is how the sweep stayed incomplete
            // The proposal rides the MESSAGE, so he can accept it right here.
            // It used to land as a pending record and a toast telling him to
            // go to the Inbox — which is why asking Coach to change something
            // read as "Coach can't edit my program". It always could; there
            // was simply no way to say yes without leaving the conversation.
            this.finalizeStream('coachChat', {
              who: 'coach', text: job.result.text,
              panel: job.result.panel || undefined,
              proposal: job.result.proposal ? { ...job.result.proposal, status: 'open' } : undefined,
            }, { coachBusy: false });
            if (job.result.proposal) this.refreshInbox();
          },
          onError: (msg) => this.setState((s) => ({ coachBusy: false, coachChat: [...s.coachChat.filter((m) => !m.streaming), { at: Date.now(), who: 'system', text: 'Error: ' + msg }] })),
        });
      }).catch((e) => {
        this.setState((s) => ({ coachBusy: false, coachChat: [...s.coachChat, { at: Date.now(), who: 'system', text: 'Error: ' + e.message }] }));
      });
      return;
    }
    this.setState(s => ({ coachChat: [...s.coachChat, { at: Date.now(), who: 'you', text: q }], coachInput: '' }));
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
  // ---------- the Leader ----------
  refreshLeader() {
    const conn = getConnection();
    if (!conn) return;
    api.leader(conn).then((r) => this.setState({ liveLeader: r })).catch(() => {});
  }
  doLeaderChat(preset) {
    const q = (typeof preset === 'string' && preset.trim()) || this.state.leaderInput.trim();
    if (!q || this.state.leaderBusy) return;
    const conn = getConnection();
    if (!conn) { this.toastMsg('Connect a backend in Settings first'); return; }
    this.setState((s) => ({ leaderChat: [...s.leaderChat, { at: Date.now(), who: 'you', text: q }], leaderInput: '', leaderBusy: true }));
    // a trailing REFLECT line is a typed directive for the server, not prose
    const stripDirective = (t) => t.replace(/(^|\n)\s*REFLECT\s*(\{[\s\S]*)?$/, '');
    api.askLeader(conn, q, this.state.leaderSessionId || null).then(({ jobId }) => {
      this.startPoll('leader', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 3 * 60_000,
        intervalMs: 700,
        onProgress: (job) => {
          if (!job.partial) return;
          const shown = stripDirective(job.partial);
          if (shown) this.applyStreamPartial('leaderChat', 'leader', shown);
        },
        onReady: (job) => {
          if (job.result.sessionId) {
            localStorage.setItem('novaos.leaderSession', job.result.sessionId);
            this.setState({ leaderSessionId: job.result.sessionId });
          }
          this.finalizeStream('leaderChat', { who: 'leader', text: job.result.text }, { leaderBusy: false });
          // a reflection landed — the profile the daily idea steers by changed
          if (job.result.reflected) this.refreshLeader();
        },
        onError: (msg) => this.setState((s) => ({ leaderBusy: false, leaderChat: [...s.leaderChat.filter((m) => !m.streaming), { at: Date.now(), who: 'system', text: 'Error: ' + msg }] })),
      });
    }).catch((e) => {
      this.setState((s) => ({ leaderBusy: false, leaderChat: [...s.leaderChat, { at: Date.now(), who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  newLeaderChat() {
    localStorage.removeItem('novaos.leaderSession');
    this.setState({ leaderSessionId: null, leaderChat: [] });
    this.toastMsg('Fresh Leader conversation');
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
    this.setState(s => ({ codeChat: [...s.codeChat, { at: Date.now(), who: 'you', text: q }], codeInput: '', codeBusy: true }));
    api.startClaudeCodeMessage(conn, q, this.state.codeSessionId, this.state.codeModel, this.state.codeWorkspace).then(({ jobId }) => {
      this.startPoll('code', () => api.claudeCodeJob(conn, jobId), {
        timeoutMs: 10 * 60_000,
        intervalMs: 700,
        onProgress: (job) => { if (job.partial) this.applyStreamPartial('codeChat', 'claude', job.partial); },
        onReady: (job) => {
          this.finalizeStream('codeChat', { who: 'claude', text: job.result.text }, { codeBusy: false, codeSessionId: job.result.sessionId });
          this.refreshCodeChanges(); // the diff is the point — surface it the moment the turn lands
        },
        onError: (msg) => this.setState(s => ({ codeBusy: false, codeChat: [...s.codeChat.filter((m) => !m.streaming), { at: Date.now(), who: 'system', text: 'Error: ' + msg }] })),
      });
    }).catch((e) => {
      this.setState(s => ({ codeBusy: false, codeChat: [...s.codeChat, { at: Date.now(), who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  refreshCodeChanges() {
    const conn = getConnection();
    if (!conn) return;
    api.codeChanges(conn, this.state.codeWorkspace)
      .then((c) => this.setState({ codeChanges: c }))
      .catch(() => {});
  }
  commitCodeChanges() {
    const conn = getConnection();
    const message = this.state.codeCommitMsg.trim();
    if (!conn) return;
    this.setState({ codeChangeBusy: true });
    api.codeCommit(conn, this.state.codeWorkspace, message).then((r) => {
      this.setState({ codeChangeBusy: false, codeCommitMsg: '', codeChanges: null, codeChangesOpen: false });
      this.toastMsg(`Committed ${r.sha} — ${r.files} file${r.files === 1 ? '' : 's'}`);
      this.refreshCodeChanges();
    }).catch((e) => { this.setState({ codeChangeBusy: false }); this.toastMsg(e.message); });
  }
  shelveCodeChanges() {
    const conn = getConnection();
    if (!conn) return;
    this.setState({ codeChangeBusy: true });
    api.codeShelve(conn, this.state.codeWorkspace).then((r) => {
      this.setState({ codeChangeBusy: false, codeChanges: null, codeShelf: r });
      this.toastMsg(`Shelved ${r.files} file${r.files === 1 ? '' : 's'} — recoverable, nothing lost`);
      this.refreshCodeChanges();
    }).catch((e) => { this.setState({ codeChangeBusy: false }); this.toastMsg(e.message); });
  }
  unshelveCodeChanges() {
    const conn = getConnection();
    if (!conn) return;
    api.codeUnshelve(conn, this.state.codeWorkspace).then(() => {
      this.setState({ codeShelf: null });
      this.toastMsg('Restored the shelved changes');
      this.refreshCodeChanges();
    }).catch((e) => this.toastMsg(e.message));
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
    this.setState(s => ({ recipeChat: [...s.recipeChat, { at: Date.now(), who: 'you', text: q }], recipeInput: '' }));
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
          {/* ONE toggle, ONE position — the same tab on the left edge whether
              the sidebar is open or folded, so his hand goes there without
              thinking. Only the arrow flips. ⌘B does the same thing. */}
          {v.sidebarToggle && (
            <Interactive onClick={v.sidebarToggle.toggle}
              aria-label={v.sidebarToggle.open ? 'Hide the sidebar (⌘B)' : 'Show the sidebar (⌘B)'}
              title={`${v.sidebarToggle.open ? 'Hide' : 'Show'} the sidebar — ⌘B`}
              base={css('position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:74;cursor:pointer;width:18px;height:66px;display:flex;align-items:center;justify-content:center;border:1px solid var(--nv-edge);border-left:none;border-radius:0 9px 9px 0;background:color-mix(in srgb, var(--nv-void) 88%, black);color:color-mix(in srgb, var(--nv-cy) 65%, transparent);font:400 12px var(--nv-font-mono)')}
              hoverStyle="border-color:var(--nv-acc-border);color:var(--nv-cy)">{v.sidebarToggle.open ? '‹' : '›'}</Interactive>
          )}
          <main ref={this.mainRef} style={css("flex:1;overflow-y:auto;min-width:0;overscroll-behavior-y:contain;touch-action:manipulation")}>
            {/* ONE boundary around the screen switch. The daily five are
                static so they never reach it; the lazy nine hit it only on a
                navigation that beat the idle prefetch. ScreenFallback is a
                calm centred pulse (never a white flash), and it honours calm
                mode / reduced motion like every other animation here. */}
            <Suspense fallback={<ScreenFallback />}>
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
              {v.isLibrary && <Library v={v} />}
              {v.isLeader && <Leader v={v} />}
              {v.isJournal && <Journal v={v} />}
              {v.isMoney && <Money v={v} />}
              {v.isSettings && <Settings v={v} />}
            </Suspense>
          </main>
        </div>

        {v.presence && <VoicePresence v={v} />}
        {/* "Hey Nova" — headless, opt-in, and never while a mic is already in use */}
        {v.wakeWord?.on && (
          <WakeWord enabled blocked={v.wakeWord.blocked} onWake={v.wakeWord.wake} onError={v.wakeWord.error} />
        )}
        {this.state.prCelebration && (
          <div onClick={() => this.setState({ prCelebration: null })}
            style={css('position:fixed;inset:0;z-index:125;display:flex;align-items:center;justify-content:center;background:rgba(4,3,8,.7);backdrop-filter:blur(6px);animation:fadeIn .2s ease-out')}>
            <div style={css('text-align:center;animation:prPop .5s cubic-bezier(.2,.8,.2,1)')}>
              <div style={css('font-size:56px;line-height:1;color:var(--nv-gold);text-shadow:0 0 40px color-mix(in srgb, var(--nv-gold) 80%, transparent);animation:prStar 1.4s ease-in-out infinite')}>◆</div>
              <div style={css('margin-top:14px;font:600 11px var(--nv-font-mono);letter-spacing:.3em;color:var(--nv-gold)')}>PERSONAL RECORD</div>
              {this.state.prCelebration.map((p, i) => (
                <div key={i} style={css('margin-top:8px;font:600 20px var(--nv-font-ui);color:var(--nv-ink)')}>
                  {p.name} — {p.kind === 'weight' ? `${p.value} kg × ${p.reps}` : `e1RM ${p.value} kg`}
                  {p.previous ? <span style={css('font-size:13px;color:var(--nv-ink60)')}>{'  '}(was {p.previous})</span> : null}
                </div>
              ))}
              <div style={css('margin-top:10px;font-size:12px;color:var(--nv-ink60)')}>Earned, sir.</div>
            </div>
          </div>
        )}
        {this.state.verdict && (
          <Suspense fallback={null}>
            <VerdictCard v={this.state.verdict}
              onClose={() => this.setState({ verdict: null })}
              onSpeak={(text) => { if (this.state.liveTts?.configured) this.speakTtsSentence(text); else this.speakIncremental(text); }} />
          </Suspense>
        )}
        {/* A NEWER NOVA IS DEPLOYED THAN THE ONE RUNNING. Top of the screen,
            above everything, on every surface — because the entire point is
            that he should never again have to wonder whether he is looking at
            an old build, or force-quit the app to find out. */}
        {v.updateReady && (
          <div style={css(`position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 14px 10px;background:color-mix(in srgb, var(--nv-gold) 16%, var(--nv-void));border-bottom:1px solid color-mix(in srgb, var(--nv-gold) 45%, transparent);box-shadow:0 10px 30px rgba(0,0,0,.5)`)}>
            <span style={css('flex:1;min-width:0;font-size:12.5px;line-height:1.4;color:var(--nv-ink)')}>A newer Nova is ready — you’re running an older build.</span>
            <Interactive as="span" onClick={v.updateReady.apply}
              base={css('cursor:pointer;flex:none;font:600 9.5px var(--nv-font-mono);letter-spacing:.1em;padding:8px 14px;border-radius:8px;background:var(--nv-gold);color:#1a1322')}
              hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">UPDATE</Interactive>
            <Interactive as="span" onClick={v.updateReady.dismiss}
              base={css('cursor:pointer;flex:none;font:600 9.5px var(--nv-font-mono);letter-spacing:.1em;padding:8px 10px;border-radius:8px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)')}
              hoverStyle="color:var(--nv-ink)">LATER</Interactive>
          </div>
        )}
        <ContextMenuHost menu={this.state.ctxMenu} isMobile={v.isMobile} close={() => this.closeContextMenu()} />

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
        {v.floatingCore && <FloatingCore s={v.floatingCore} />}
        {v.greetBanner && (
          <div onClick={v.greetBanner.open} role="status"
            style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)',
              top: v.isMobile ? 'calc(58px + env(safe-area-inset-top))' : '16px', zIndex: 85,
              maxWidth: 'min(560px, 92vw)', cursor: 'pointer',
              display: 'flex', alignItems: 'baseline', gap: '10px',
              padding: '11px 16px', borderRadius: '12px',
              background: 'var(--nv-glass2)', backdropFilter: 'blur(18px)',
              border: '1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent)',
              boxShadow: '0 18px 50px -18px rgba(0,0,0,.8)',
              animation: 'fadeUp .4s ease-out',
            }}>
            <span style={{ font: '400 13px var(--nv-font-serif)', fontStyle: 'italic', lineHeight: 1.55, color: 'var(--nv-ink)' }}>{v.greetBanner.text}</span>
            <span onClick={v.greetBanner.dismiss} aria-label="Dismiss greeting"
              style={{ flex: 'none', font: '500 11px var(--nv-font-mono)', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)', padding: '2px 4px' }}>✕</span>
          </div>
        )}
        {/* fallback={null}: an overlay appearing a frame later reads as
            normal modal timing — a placeholder card would be worse than
            nothing. Idle prefetch means they're almost always already in. */}
        {v.recipeOpen && <Suspense fallback={null}><RecipeOverlay v={v} /></Suspense>}
        {v.recipeAddOpen && <Suspense fallback={null}><AddRecipeModal v={v} /></Suspense>}
        {v.barcodeScannerOpen && (
          <Suspense fallback={null}>
            <BarcodeScanner onDetected={v.onBarcodeDetected} onClose={v.closeBarcodeScanner} />
          </Suspense>
        )}
        {v.paletteOpen && <CommandPalette v={v} />}
        {v.ingestModalOpen && <Suspense fallback={null}><IngestModal v={v} /></Suspense>}
        {v.ingestStatus !== 'idle' && <Suspense fallback={null}><IngestReview v={v} /></Suspense>}
        {v.nudge && <NudgeCard v={v.nudge} />}
        {v.modelChoicePrompt && <ModelChoicePrompt v={v.modelChoicePrompt} />}
        {v.coachApply && <CoachApplySheet c={v.coachApply} />}
        {v.portionSheet && <PortionSheet p={v.portionSheet} />}
        {v.outboxView && <Suspense fallback={null}><OutboxView v={v.outboxView} /></Suspense>}
        {v.toastOn && <Toast v={v} />}
        {v.showBoot && <Boot info={v.bootInfo} />}
      </div>
    );
  }
}

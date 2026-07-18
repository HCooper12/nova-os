import { Component, createRef, lazy, Suspense } from 'react';
import { recipes, notes, basePlan, reviews, galaxyNamed, galaxyLinks } from './data.js';
import { css } from './css.js';
import { api, getConnection, setConnection, testConnection } from './api.js';
import { pollJob } from './jobPoller.js';
import { orbReply, coachReply, recipeReply } from './mockAssistants.js';
import { loadLiveCache, saveLiveCache, clearLiveCache } from './liveStore.js';
import { applyAppearance, getNovaTheme, getCalm, getCoreStyle, saveCoreStyle } from './theme.js';
import { NOTE_TYPE_COLOR } from './vals/shared.js';
import { valsRecipes } from './vals/valsRecipes.js';
import { valsWorkouts } from './vals/valsWorkouts.js';
import { valsNotes } from './vals/valsNotes.js';
import { valsMisc } from './vals/valsMisc.js';
import { valsMission } from './vals/valsMission.js';
import { valsChrome } from './vals/valsChrome.js';
import { Sidebar } from './Sidebar.jsx';
import { MissionControl } from './screens/MissionControl.jsx';
import { Voice } from './screens/Voice.jsx';
import { Galaxy } from './screens/Galaxy.jsx';
import { Recipes } from './screens/Recipes.jsx';
import { Shopping } from './screens/Shopping.jsx';
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
const SCREENS = ['mission', 'voice', 'galaxy', 'code', 'recipes', 'shopping', 'workouts', 'notes', 'journal', 'settings'];
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
  'liveFoodLog', 'liveShoppingList', 'liveHealthInsight', 'liveHealthDays', 'liveStreaks',
  'liveWorkoutExercises', 'liveWorkoutMuscleGroups', 'liveWorkoutTrackingTypes',
  'liveWorkoutRoutines', 'liveWorkoutSchedule', 'liveWorkoutWeekdays',
  'liveJournalEntries', 'liveGraph',
];

export default class App extends Component {
  constructor(props) {
    super(props);
    this.galaxyRef = createRef();
    this.paletteRef = createRef();
    this.ivs = [];
    this.pollers = {};
    this.recipes = recipes;
    this.notes = notes;
    this.basePlan = basePlan;
    this.reviews = reviews;
  }

  state = {
    screen: screenFromHash(), booted: false, clock: '--:--:--',
    // demo → no backend configured; connecting → configured, first fetch pending;
    // connected → last sync succeeded; offline → configured but unreachable.
    connectionStatus: typeof window !== 'undefined' && getConnection() ? 'connecting' : 'demo',
    lastSyncAt: null,
    liveGraph: null,
    paletteOpen: false, paletteQuery: '',
    micOn: true, orbInput: '',
    orbChat: [
      { who: 'nova', text: 'Good morning, sir. Sleep recovery is complete and push day is locked for 17:30.' },
      { who: 'you', text: 'Anything I should know before deep work?' },
      { who: 'nova', text: 'Two things: Studio finished your cold-open draft, and you are 84 g short on protein pace. The burrito bowl at 12:30 covers it.' },
    ],
    recipeFilter: 'All', openRecipeId: null, servings: 1, recipeInput: '', recipeChat: [],
    recipeAltSelected: null,
    recipeTweakInput: '', recipeTweakBusy: false, recipeTweakError: null, recipeTweakPreview: null,
    coachInput: '', planNote: null,
    coachChat: [{ who: 'coach', text: "Push day is set — 6 lifts, ~42 minutes. Bench is at 82.5 kg; if bar speed holds on set two, we take the PR single. Ask me for any changes." }],
    plan: null,
    codeInput: '', codeBusy: false,
    codeChat: [],
    codeSessionId: null, codeWorkspace: 'repo', codeModel: 'sonnet',
    liveHealthInsight: null, liveHealthDays: null, liveStreaks: null,
    liveReviewSummaries: {},
    liveFoodLog: null,
    foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodLogBusy: false, foodLogError: null,
    foodScanNote: '', foodScanBusy: false, foodScanError: null, foodScanQuestion: null,
    barcodeScannerOpen: false,
    noteQuery: '', noteType: 'All', openNoteId: 'n1',
    galaxySel: null, toast: null, reviewIdx: 0,
    isMobile: typeof window !== 'undefined' && window.innerWidth < 760,
    novaTheme: getNovaTheme(), calmMode: getCalm(), coreStyle: getCoreStyle(),

    // live-data connection (Settings screen)
    settingsBaseUrl: '', settingsToken: '',
    settingsTestStatus: 'idle', settingsTestMessage: '',
    liveNotes: null, liveNoteDetails: {}, liveCalendar: null, liveRecipes: null,
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
    liveWorkoutRoutines: null, liveWorkoutSchedule: null, liveWorkoutWeekdays: null,
    workoutsView: 'routines', openRoutineId: null,
    routineCreating: false, routineNewName: '',
    routineDeleteConfirm: false,
    exercisePickerOpen: false, exercisePickerQuery: '', exercisePickerMuscle: 'Any',
    exercisePickerCreateMuscle: '', exercisePickerCreateTrackingType: 'weight_reps',
    workoutSession: null, sessionCancelConfirm: false,
    liveWorkoutHistory: null, historyRoutineId: null,

    // daily review + journal
    reviewShuffleIdx: null,
    reviewReflectOpen: false, reviewReflectText: '', reviewReflectBusy: false, reviewReflectError: null,
    reviewReflectPromptBusy: false, reviewReflectPromptText: null,
    liveJournalEntries: null,
    journalComposerText: '', journalSaveBusy: false, journalSaveError: null,
    journalPromptBusy: false, journalPromptText: null,
    journalOpenDate: null,

    // transcript ingest
    ingestModalOpen: false, ingestText: '', ingestSourceUrl: '',
    ingestJobId: null, ingestStatus: 'idle', ingestPreview: null, ingestError: null,
  };

  componentDidMount() {
    if (import.meta.env.DEV) window.__novaApp = this; // dev-only introspection hook
    // The boot screen stays up until BOTH the minimum splash time has
    // elapsed AND (if a backend is configured) the first real-data fetch has
    // finished — otherwise it reveals demo content for a moment before the
    // real data swaps in behind it. Capped so an unreachable backend can't
    // hang the splash forever.
    const minBootTime = new Promise((resolve) => { this.bootT = setTimeout(resolve, 1700); });
    let dataReady = Promise.resolve();
    const bootConn = getConnection();
    if (bootConn) {
      // Hydrate last-known-good data immediately so an unreachable backend
      // shows real (stale) content behind the offline banner, never demo data.
      const cached = loadLiveCache();
      const hydrate = { settingsBaseUrl: bootConn.baseUrl, settingsToken: bootConn.token };
      if (cached) {
        for (const key of CACHED_LIVE_KEYS) if (cached.slices[key] !== undefined) hydrate[key] = cached.slices[key];
        hydrate.lastSyncAt = cached.savedAt;
      }
      this.setState(hydrate);
      const fetchDone = this.refreshLiveData();
      const fetchTimeout = new Promise((resolve) => setTimeout(resolve, 5000));
      dataReady = Promise.race([fetchDone, fetchTimeout]);
    }
    Promise.all([minBootTime, dataReady]).then(() => this.setState({ booted: true }));
    // Keep live data fresh: re-sync when the tab regains focus (the common
    // "reopen the PWA on the phone" path) and on a slow background cadence.
    this.visH = () => { if (document.visibilityState === 'visible' && getConnection()) this.refreshLiveData(); };
    document.addEventListener('visibilitychange', this.visH);
    this.refreshIv = setInterval(() => { if (getConnection()) this.refreshLiveData(); }, 5 * 60_000);
    // Back/forward navigation re-derives the screen from the hash.
    this.popH = () => this.setState({ screen: screenFromHash() });
    window.addEventListener('popstate', this.popH);
    window.addEventListener('hashchange', this.popH);
    this.clockIv = setInterval(() => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      this.setState({ clock: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) });
    }, 1000);
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
    clearTimeout(this.bootT); clearInterval(this.clockIv); clearInterval(this.refreshIv);
    Object.values(this.pollers || {}).forEach((p) => p.cancel());
    window.removeEventListener('keydown', this.keyH);
    window.removeEventListener('resize', this.resizeH);
    window.removeEventListener('popstate', this.popH);
    window.removeEventListener('hashchange', this.popH);
    document.removeEventListener('visibilitychange', this.visH);
    this.ivs.forEach(clearInterval);
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
  }
  // ---------- navigation (hash-routed) ----------
  navigate(screen, extra = {}) {
    this.setState({ screen, ...extra });
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
  componentDidUpdate(prevProps, prevState) {
    if (this.state.screen === 'galaxy') this.startGalaxy(); else this.stopGalaxy();
    if (this.state.paletteOpen && !prevState.paletteOpen && this.paletteRef.current) this.paletteRef.current.focus();
  }
  // ---------- appearance (theme + calm mode, persisted) ----------
  // Apply from the settled state in the setState callback — applying from
  // arguments + this.state directly goes stale when both setters run in the
  // same tick (theme switch immediately followed by a calm toggle).
  setNovaTheme(theme) {
    this.setState({ novaTheme: theme }, () => applyAppearance(this.state.novaTheme, this.state.calmMode));
  }
  setCalmMode(calm) {
    this.setState({ calmMode: calm }, () => applyAppearance(this.state.novaTheme, this.state.calmMode));
  }
  setCoreStyle(core) {
    saveCoreStyle(core);
    this.setState({ coreStyle: core });
  }

  // ---------- live data (Obsidian + Calendar) ----------
  // One sync pass over every live slice. Failures never null a slice — the
  // last-known value (in-memory or hydrated from the cache) stays visible and
  // the connection banner reports the outage; falling back to demo data would
  // silently show fiction. Runs all fetches in parallel.
  async refreshLiveData() {
    const conn = getConnection();
    if (!conn) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    const tasks = [
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
        this.setState({ liveWorkoutRoutines: routinesRes.routines, liveWorkoutSchedule: routinesRes.schedule, liveWorkoutWeekdays: routinesRes.weekdays });
      },
      async () => {
        const graph = await api.graph(conn);
        this.setState({ liveGraph: graph });
        this.gNodes = null; // rebuilt from the fresh graph next time the galaxy renders
      },
    ];
    this.refreshInFlight = (async () => {
      const results = await Promise.allSettled(tasks.map((t) => t()));
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      if (okCount > 0) {
        const now = new Date().toISOString();
        this.setState({ connectionStatus: 'connected', lastSyncAt: now }, () => {
          const slices = {};
          for (const key of CACHED_LIVE_KEYS) slices[key] = this.state[key];
          saveLiveCache(slices);
        });
      } else {
        this.setState({ connectionStatus: 'offline' });
      }
    })().finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }
  refreshWorkoutRoutines() {
    const conn = getConnection();
    if (!conn) return Promise.resolve();
    return api.workoutRoutines(conn).then((r) => {
      this.setState({ liveWorkoutRoutines: r.routines, liveWorkoutSchedule: r.schedule, liveWorkoutWeekdays: r.weekdays });
    }).catch(() => {});
  }
  toggleRotationSlot(slot, recipeId) {
    const conn = getConnection();
    if (!conn) return;
    const current = this.state.liveRotation?.slots?.[slot];
    const next = current && current.id === recipeId ? null : recipeId;
    api.setRotationSlot(conn, slot, next).then((rotation) => {
      this.setState({ liveRotation: rotation });
    }).catch((e) => this.toastMsg('Rotation update failed: ' + e.message));
  }
  toggleSlotConsumed(slot, consumed) {
    const conn = getConnection();
    if (!conn) return;
    api.setRotationConsumed(conn, slot, consumed).then((rotation) => {
      this.setState({ liveRotation: rotation });
    }).catch((e) => this.toastMsg('Could not update: ' + e.message));
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
    api.addFoodLogEntry(conn, { name, macros }).then((day) => {
      this.setState({ liveFoodLog: day, foodLogBusy: false, foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '' });
    }).catch((e) => this.setState({ foodLogBusy: false, foodLogError: e.message }));
  }
  deleteFoodLogEntry(id) {
    const conn = getConnection();
    if (!conn) return;
    api.deleteFoodLogEntry(conn, id).then((day) => this.setState({ liveFoodLog: day })).catch((e) => this.toastMsg('Could not remove entry: ' + e.message));
  }
  setFoodScanNote(e) {
    this.setState({ foodScanNote: e.target.value });
  }
  onFoodScanFiles(mode, fileList) {
    const conn = getConnection();
    if (!conn) return;
    const files = Array.from(fileList || []).slice(0, 3);
    if (!files.length) return;
    this.setState({ foodScanBusy: true, foodScanError: null, foodScanQuestion: null });
    Promise.all(files.map((f) => this.readFileAsDataUrl(f)))
      .then((images) => api.startFoodScan(conn, mode, images, this.state.foodScanNote.trim()))
      .then(({ jobId }) => {
        this.startPoll('foodScan', () => api.foodScanJob(conn, jobId), {
          onReady: (job) => {
            const r = job.result;
            this.setState({
              foodScanBusy: false, foodScanError: null,
              foodScanQuestion: r.confidence === 'low' && r.question ? r.question : null,
              foodScanNote: '',
              foodLogName: r.name || '',
              foodLogP: r.macros?.p != null ? String(r.macros.p) : '',
              foodLogC: r.macros?.c != null ? String(r.macros.c) : '',
              foodLogF: r.macros?.f != null ? String(r.macros.f) : '',
              foodLogKcal: r.macros?.kcal != null ? String(r.macros.kcal) : '',
            });
            this.toastMsg(r.confidence === 'low' ? 'Photo analyzed — rough estimate, check the fields below' : 'Photo analyzed — check the fields below before saving');
          },
          onError: (msg) => this.setState({ foodScanBusy: false, foodScanError: msg }),
        });
      })
      .catch((e) => this.setState({ foodScanBusy: false, foodScanError: e.message }));
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
    this.setState({ barcodeScannerOpen: false, foodScanBusy: true, foodScanError: null, foodScanQuestion: null });
    if (!conn) return;
    api.lookupBarcode(conn, code).then((r) => {
      this.setState({
        foodScanBusy: false,
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
    if (!name || !ingredients.length || !method.length || [macros.p, macros.c, macros.f, macros.kcal].some((n) => Number.isNaN(n))) {
      this.setState({ recipeAddError: 'Fill in a name, all four macros, at least one ingredient and one method step.' });
      return;
    }
    this.setState({ recipeAddBusy: true, recipeAddError: null });
    const pendingPhoto = st.recipeAddPhotoDataUrl;
    api.addRecipe(conn, { name, category: st.recipeAddCategory, makes: st.recipeAddMakes.trim() || undefined, macros, ingredients, method })
      .then(({ recipe }) => (pendingPhoto ? api.addRecipePhoto(conn, recipe.id, pendingPhoto) : Promise.resolve()))
      .then(() => {
        this.setState({ recipeAddOpen: false, recipeAddBusy: false, recipeAddPhotoDataUrl: null });
        this.toastMsg(`${name} added ✓ — saved to Obsidian too`);
        this.refreshLiveData();
      })
      .catch((e) => {
        this.setState({ recipeAddBusy: false, recipeAddError: e.message });
      });
  }
  onRecipeScanFiles(fileList) {
    const conn = getConnection();
    if (!conn) return;
    const files = Array.from(fileList || []).slice(0, 4);
    if (!files.length) return;
    this.setState({ recipeScanBusy: true, recipeScanError: null });
    Promise.all(files.map((f) => this.readFileAsDataUrl(f)))
      .then((images) => api.scanRecipe(conn, images))
      .then(({ jobId }) => {
        this.startPoll('recipeScan', () => api.scanRecipeJob(conn, jobId), {
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
    this.setState({
      openRecipeId: id, servings, recipeChat: [], recipeInput: '',
      recipeAltSelected: null, recipeTweakInput: '', recipeTweakBusy: false,
      recipeTweakError: null, recipeTweakPreview: null,
    });
  }
  closeRecipe() {
    this.stopPoll('recipeTweak');
    this.setState({ openRecipeId: null });
  }
  selectAlternate(altId) {
    this.setState({ recipeAltSelected: altId, recipeTweakPreview: null, recipeTweakError: null });
  }
  submitRecipeTweak() {
    const conn = getConnection();
    const st = this.state;
    const request = st.recipeTweakInput.trim();
    if (!conn || !st.openRecipeId || !request) return;
    this.setState({ recipeTweakBusy: true, recipeTweakError: null, recipeTweakPreview: null });
    api.tweakRecipe(conn, st.openRecipeId, request)
      .then(({ jobId }) => {
        this.startPoll('recipeTweak', () => api.tweakRecipeJob(conn, jobId), {
          intervalMs: 2500,
          onReady: (job) => this.setState({ recipeTweakBusy: false, recipeTweakPreview: job.result, recipeTweakInput: '' }),
          onError: (msg) => this.setState({ recipeTweakBusy: false, recipeTweakError: msg }),
        });
      })
      .catch((e) => {
        this.setState({ recipeTweakBusy: false, recipeTweakError: e.message });
      });
  }
  saveRecipeTweak() {
    const conn = getConnection();
    const st = this.state;
    const preview = st.recipeTweakPreview;
    if (!conn || !st.openRecipeId || !preview) return;
    api.addAlternate(conn, st.openRecipeId, preview).then(({ recipe }) => {
      this.setState((s) => ({
        liveRecipes: s.liveRecipes.map((r) => (r.id === recipe.id ? recipe : r)),
        recipeTweakPreview: null,
        recipeAltSelected: recipe.alternates[recipe.alternates.length - 1]?.id || null,
      }));
      this.toastMsg('Saved as an alternative ✓');
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
        this.setState({ shoppingAddBusy: false, shoppingAddError: e.message });
      });
  }
  toggleShoppingItem(id, checked) {
    const conn = getConnection();
    if (!conn) return;
    this.setState((s) => ({
      liveShoppingList: { ...s.liveShoppingList, items: s.liveShoppingList.items.map((i) => (i.id === id ? { ...i, checked } : i)) },
    }));
    api.toggleShoppingItem(conn, id, checked).then(({ items }) => {
      this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items } }));
    }).catch((e) => this.toastMsg('Could not update item: ' + e.message));
  }
  confirmShoppingCompletion() {
    const conn = getConnection();
    if (!conn) return;
    api.confirmShoppingCompletion(conn).then(({ items }) => {
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
    this.setState({ workoutsView: 'routine', openRoutineId: id, routineDeleteConfirm: false, exercisePickerOpen: false });
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
    const exercises = routine.exercises.map((e) => {
      const sets = e.lastSets && e.lastSets.length
        ? e.lastSets.map((s) => ({ weight: s.weight, reps: s.reps, done: false }))
        : Array.from({ length: e.targetSets }, () => ({ weight: 0, reps: e.targetRepsLow, done: false }));
      return { exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh, sets };
    });
    this.setState({ workoutsView: 'session', workoutSession: { routineId: routine.id, routineName: routine.name, exercises }, sessionCancelConfirm: false });
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
  requestCancelSession() {
    this.setState({ sessionCancelConfirm: true });
  }
  cancelSessionCancel() {
    this.setState({ sessionCancelConfirm: false });
  }
  discardWorkoutSession() {
    const routineId = this.state.workoutSession?.routineId;
    this.setState({ workoutsView: 'routine', openRoutineId: routineId, workoutSession: null, sessionCancelConfirm: false });
  }
  finishWorkoutSession() {
    const conn = getConnection();
    const session = this.state.workoutSession;
    if (!conn || !session) return;
    const payload = {
      routineId: session.routineId,
      routineName: session.routineName,
      exercises: session.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        sets: e.sets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })),
      })),
    };
    api.completeWorkoutSession(conn, payload).then(() => {
      this.setState({ workoutsView: 'routine', workoutSession: null, sessionCancelConfirm: false });
      this.refreshWorkoutRoutines();
      this.toastMsg('Workout saved ✓');
    }).catch((e) => this.toastMsg('Could not save workout: ' + e.message));
  }
  openWorkoutHistory(routineId) {
    const conn = getConnection();
    this.setState({ workoutsView: 'history', historyRoutineId: routineId, liveWorkoutHistory: null });
    if (!conn) return;
    api.workoutSessions(conn, { routineId }).then(({ sessions }) => this.setState({ liveWorkoutHistory: sessions })).catch(() => this.setState({ liveWorkoutHistory: [] }));
  }
  backFromWorkoutHistory() {
    this.setState({ workoutsView: 'routine' });
  }
  selectNote(id) {
    this.setState({ openNoteId: id });
    this.ensureNoteDetail(id);
  }
  ensureNoteDetail(id) {
    if (!id || this.state.liveNoteDetails[id]) return;
    const conn = getConnection();
    if (!conn) return;
    api.noteDetail(conn, id).then((detail) => {
      this.setState((s) => ({ liveNoteDetails: { ...s.liveNoteDetails, [id]: detail } }));
    }).catch(() => {});
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
    return (liveNotes || []).filter((n) => n.type === 'concept' || n.type === 'topic');
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
    this.setState({ connectionStatus: 'connecting' });
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
      workoutsView: 'routines', openRoutineId: null, workoutSession: null, liveWorkoutHistory: null,
    });
    this.gNodes = null; // rebuild the galaxy from mock data
    this.toastMsg('Disconnected — back to demo data');
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
    const iv = setInterval(() => {
      i += 3;
      this.setState(s => {
        const arr = s[key].slice();
        const m = Object.assign({}, arr[arr.length - 1]);
        m.text = text.slice(0, i); m.typing = i < text.length;
        arr[arr.length - 1] = m;
        return { [key]: arr };
      });
      if (i >= text.length) { clearInterval(iv); if (after) after(); }
    }, 22);
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
      ...valsMission(this, ctx),
      ...valsChrome(this, ctx),
    };
  }

  doOrb() {
    const q = this.state.orbInput.trim(); if (!q) return;
    this.setState(s => ({ orbChat: [...s.orbChat, { who: 'you', text: q }], orbInput: '' }));
    setTimeout(() => this.typeIn('orbChat', 'nova', orbReply(q)), 480);
  }
  doCoach(preset) {
    const q = (preset || this.state.coachInput).trim(); if (!q) return;
    this.setState(s => ({ coachChat: [...s.coachChat, { who: 'you', text: q }], coachInput: '' }));
    const r = coachReply(q);
    setTimeout(() => this.typeIn('coachChat', 'coach', r.text, () => {
      if (!r.mod) return;
      let plan = (this.state.plan || this.basePlan).slice();
      if (r.mod === 'trim') plan = plan.filter(x => x.name !== 'Cable fly');
      if (r.mod === 'hard') plan = plan.map(x => x.name.includes('bench') || x.name.includes('Bench') ? Object.assign({}, x, { scheme: '5 × 6 · 82.5 kg' }) : x);
      if (r.mod === 'swap') plan = plan.map(x => x.name === 'Seated shoulder press' ? { name: 'Landmine press', scheme: '3 × 8 · 40 kg', pr: false } : x);
      this.setState({ plan, planNote: r.note });
      this.toastMsg('Coach updated today’s session — written to vault ✓');
    }), 520);
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
          <main style={css("flex:1;overflow-y:auto;min-width:0")}>
            {v.isMission && <MissionControl v={v} />}
            {v.isVoice && <Voice v={v} />}
            {v.isGalaxy && <Galaxy v={v} />}
            {v.isCode && <ClaudeCode v={v} />}
            {v.isRecipes && <Recipes v={v} />}
            {v.isShopping && <Shopping v={v} />}
            {v.isWorkouts && <Workouts v={v} />}
            {v.isNotes && <Notes v={v} />}
            {v.isJournal && <Journal v={v} />}
            {v.isSettings && <Settings v={v} />}
          </main>
        </div>

        {v.statusBanner && (
          <div style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)',
            bottom: v.isMobile ? 'calc(76px + env(safe-area-inset-bottom))' : '18px', zIndex: 80,
            font: "500 10.5px 'JetBrains Mono',monospace", letterSpacing: '.06em', padding: '8px 16px',
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
        {v.toastOn && <Toast v={v} />}
        {v.showBoot && <Boot info={v.bootInfo} />}
      </div>
    );
  }
}

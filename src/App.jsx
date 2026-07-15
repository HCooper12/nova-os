import { Component, createRef } from 'react';
import { recipes, notes, basePlan, reviews, galaxyNamed, galaxyLinks, weekData } from './data.js';
import { css } from './css.js';
import { api, getConnection, setConnection, testConnection } from './api.js';
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

const NOTE_TYPE_COLOR = { concept: '#d8b573', entity: '#e08f6f', topic: '#8a6ad1', source: '#6be5f5', journal: '#5aa87c', analysis: '#ece5da', raw: 'rgba(236,229,218,.5)' };

// Personalization — was editor-configurable in the original design canvas.
// Tweak these three to re-brand without touching layout code.
const THEME = 'midnight'; // 'aubergine' | 'midnight' | 'graphite'
const USER_NAME = 'Hayden';
const WAKE_WORD = true;

const THEMES = {
  aubergine: { bg0: '#120d18', bg1: '#1a1322', bg2: '#2a1d38' },
  midnight: { bg0: '#070b13', bg1: '#0c1424', bg2: '#152742' },
  graphite: { bg0: '#121014', bg1: '#191619', bg2: '#252028' },
};

export default class App extends Component {
  constructor(props) {
    super(props);
    this.galaxyRef = createRef();
    this.paletteRef = createRef();
    this.ivs = [];
    this.recipes = recipes;
    this.notes = notes;
    this.basePlan = basePlan;
    this.reviews = reviews;
  }

  state = {
    screen: 'mission', booted: false, clock: '--:--:--',
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
    liveHealthInsight: null,
    noteQuery: '', noteType: 'All', openNoteId: 'n1',
    galaxySel: null, toast: null, gaugeIdx: 0, reviewIdx: 0,
    isMobile: typeof window !== 'undefined' && window.innerWidth < 760,

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
    this.bootT = setTimeout(() => this.setState({ booted: true }), 1700);
    this.clockIv = setInterval(() => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      this.setState({ clock: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) });
    }, 1000);
    this.keyH = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.setState(s => ({ paletteOpen: !s.paletteOpen, paletteQuery: '' })); }
      else if (e.key === 'Escape') { clearInterval(this.tweakPollIv); this.setState({ paletteOpen: false, openRecipeId: null, galaxySel: null }); }
    };
    window.addEventListener('keydown', this.keyH);
    this.gaugeIv = setInterval(() => this.setState(s => ({ gaugeIdx: 1 - s.gaugeIdx })), 6000);
    this.resizeH = () => {
      const m = window.innerWidth < 760;
      if (m !== this.state.isMobile) {
        if (this.state.screen === 'galaxy') { this.stopGalaxy(); this.gNodes = null; }
        this.setState({ isMobile: m });
      }
    };
    window.addEventListener('resize', this.resizeH);
    this.setState({ reviewIdx: Math.floor(Math.random() * this.reviews.length) });
    this.applyTheme();
    const conn = getConnection();
    if (conn) {
      this.setState({ settingsBaseUrl: conn.baseUrl, settingsToken: conn.token });
      this.refreshLiveData();
    }
  }
  componentWillUnmount() {
    clearTimeout(this.bootT); clearInterval(this.clockIv); clearInterval(this.gaugeIv); clearInterval(this.ingestPollIv); clearInterval(this.scanPollIv); clearInterval(this.tweakPollIv); clearInterval(this.shoppingAddPollIv); clearInterval(this.codeJobPollIv);
    window.removeEventListener('keydown', this.keyH);
    window.removeEventListener('resize', this.resizeH);
    this.ivs.forEach(clearInterval);
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
  }
  componentDidUpdate(prevProps, prevState) {
    this.applyTheme();
    if (this.state.screen === 'galaxy') this.startGalaxy(); else this.stopGalaxy();
    if (this.state.paletteOpen && !prevState.paletteOpen && this.paletteRef.current) this.paletteRef.current.focus();
  }
  applyTheme() {
    const t = THEMES[THEME] || THEMES.aubergine;
    const r = document.documentElement.style;
    r.setProperty('--bg0', t.bg0); r.setProperty('--bg1', t.bg1); r.setProperty('--bg2', t.bg2);
  }

  // ---------- live data (Obsidian + Calendar) ----------
  async refreshLiveData() {
    const conn = getConnection();
    if (!conn) return;
    try {
      const notesRes = await api.notes(conn);
      this.setState({ liveNotes: notesRes.notes });
      if (notesRes.notes[0]) this.selectNote(notesRes.notes[0].id);
      this.refreshDailyReviewDetail(notesRes.notes);
    } catch {
      this.setState({ liveNotes: null });
    }
    this.refreshJournalEntries();
    try {
      const insight = await api.healthInsight(conn);
      this.setState({ liveHealthInsight: insight });
    } catch {
      this.setState({ liveHealthInsight: null });
    }
    try {
      const calRes = await api.calendarToday(conn);
      this.setState({ liveCalendar: calRes.events });
    } catch {
      this.setState({ liveCalendar: null });
    }
    try {
      const recipesRes = await api.recipes(conn);
      this.setState({ liveRecipes: recipesRes.recipes.length ? recipesRes.recipes : null, liveRecipeProfile: recipesRes.profile || null });
      this.refreshRecipePhotos(recipesRes.recipes);
    } catch {
      this.setState({ liveRecipes: null, liveRecipeProfile: null });
    }
    try {
      const rotationRes = await api.rotation(conn);
      this.setState({ liveRotation: rotationRes });
    } catch {
      this.setState({ liveRotation: null });
    }
    try {
      const shoppingRes = await api.shoppingList(conn);
      this.setState({ liveShoppingList: shoppingRes });
    } catch {
      this.setState({ liveShoppingList: null });
    }
    try {
      const exercisesRes = await api.workoutExercises(conn);
      this.setState({ liveWorkoutExercises: exercisesRes.exercises, liveWorkoutMuscleGroups: exercisesRes.muscleGroups, liveWorkoutTrackingTypes: exercisesRes.trackingTypes });
      const routinesRes = await api.workoutRoutines(conn);
      this.setState({ liveWorkoutRoutines: routinesRes.routines, liveWorkoutSchedule: routinesRes.schedule, liveWorkoutWeekdays: routinesRes.weekdays });
    } catch {
      this.setState({ liveWorkoutExercises: null, liveWorkoutRoutines: null });
    }
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
    clearInterval(this.scanPollIv);
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
    const readAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    this.setState({ recipeScanBusy: true, recipeScanError: null });
    Promise.all(files.map(readAsDataUrl))
      .then((images) => api.scanRecipe(conn, images))
      .then(({ jobId }) => {
        this.scanPollIv = setInterval(() => this.pollRecipeScanJob(jobId), 2000);
      })
      .catch((e) => {
        this.setState({ recipeScanBusy: false, recipeScanError: e.message });
      });
  }
  pollRecipeScanJob(jobId) {
    const conn = getConnection();
    if (!conn) return;
    api.scanRecipeJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.scanPollIv);
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
      } else if (job.status === 'error') {
        clearInterval(this.scanPollIv);
        this.setState({ recipeScanBusy: false, recipeScanError: job.error });
      }
    }).catch(() => {});
  }
  openRecipe(id, servings = 1) {
    this.setState({
      openRecipeId: id, servings, recipeChat: [], recipeInput: '',
      recipeAltSelected: null, recipeTweakInput: '', recipeTweakBusy: false,
      recipeTweakError: null, recipeTweakPreview: null,
    });
  }
  closeRecipe() {
    clearInterval(this.tweakPollIv);
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
        this.tweakPollIv = setInterval(() => this.pollRecipeTweakJob(jobId), 2500);
      })
      .catch((e) => {
        this.setState({ recipeTweakBusy: false, recipeTweakError: e.message });
      });
  }
  pollRecipeTweakJob(jobId) {
    const conn = getConnection();
    if (!conn) return;
    api.tweakRecipeJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.tweakPollIv);
        this.setState({ recipeTweakBusy: false, recipeTweakPreview: job.result, recipeTweakInput: '' });
      } else if (job.status === 'error') {
        clearInterval(this.tweakPollIv);
        this.setState({ recipeTweakBusy: false, recipeTweakError: job.error });
      }
    }).catch(() => {});
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
      .then(({ jobId }) => {
        this.shoppingAddPollIv = setInterval(() => this.pollShoppingAddJob(jobId), 2500);
      })
      .catch((e) => this.toastMsg('Could not add to shopping list: ' + e.message));
  }
  pollShoppingAddJob(jobId) {
    const conn = getConnection();
    if (!conn) return;
    api.addShoppingItemsJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.shoppingAddPollIv);
        this.setState((s) => ({ liveShoppingList: { ...s.liveShoppingList, items: job.items }, shoppingAddBusy: false, shoppingAddInput: '' }));
        this.toastMsg('Added to shopping list ✓');
      } else if (job.status === 'error') {
        clearInterval(this.shoppingAddPollIv);
        this.setState({ shoppingAddBusy: false, shoppingAddError: job.error });
        this.toastMsg('Could not add to shopping list: ' + job.error);
      }
    }).catch(() => {});
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
      .then(({ jobId }) => {
        this.shoppingAddPollIv = setInterval(() => this.pollShoppingAddJob(jobId), 2500);
      })
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
    if (page) this.ensureNoteDetail(page.id);
  }
  shuffleDailyReview() {
    const pool = this.dailyReviewPool(this.state.liveNotes);
    if (pool.length < 2) return;
    const current = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    let next = current;
    while (next === current) next = Math.floor(Math.random() * pool.length);
    this.setState({ reviewShuffleIdx: next, reviewReflectOpen: false, reviewReflectText: '', reviewReflectPromptText: null });
    this.ensureNoteDetail(pool[next].id);
  }
  openDailyReview() {
    const pool = this.dailyReviewPool(this.state.liveNotes);
    const idx = this.state.reviewShuffleIdx != null ? this.state.reviewShuffleIdx : this.dailyReviewIndex(pool);
    const page = pool[idx];
    if (page) this.selectNote(page.id);
    this.setState({ screen: 'notes' });
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
      this.reviewPromptPollIv = setInterval(() => this.pollReviewReflectPrompt(jobId), 2000);
    }).catch((e) => {
      this.setState({ reviewReflectPromptBusy: false });
      this.toastMsg('Could not generate a prompt: ' + e.message);
    });
  }
  pollReviewReflectPrompt(jobId) {
    const conn = getConnection();
    if (!conn) return;
    api.journalPromptJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.reviewPromptPollIv);
        this.setState({ reviewReflectPromptBusy: false, reviewReflectPromptText: job.result.prompt });
      } else if (job.status === 'error') {
        clearInterval(this.reviewPromptPollIv);
        this.setState({ reviewReflectPromptBusy: false });
        this.toastMsg('Could not generate a prompt: ' + job.error);
      }
    }).catch(() => {});
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
      this.journalPromptPollIv = setInterval(() => this.pollJournalPrompt(jobId), 2000);
    }).catch((e) => {
      this.setState({ journalPromptBusy: false });
      this.toastMsg('Could not generate a prompt: ' + e.message);
    });
  }
  pollJournalPrompt(jobId) {
    const conn = getConnection();
    if (!conn) return;
    api.journalPromptJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.journalPromptPollIv);
        this.setState({ journalPromptBusy: false, journalPromptText: job.result.prompt });
      } else if (job.status === 'error') {
        clearInterval(this.journalPromptPollIv);
        this.setState({ journalPromptBusy: false });
        this.toastMsg('Could not generate a prompt: ' + job.error);
      }
    }).catch(() => {});
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
    this.toastMsg('Saved — loading your real vault…');
    this.refreshLiveData();
  }
  disconnectSettings() {
    setConnection(null);
    this.setState({ settingsBaseUrl: '', settingsToken: '', settingsTestStatus: 'idle', settingsTestMessage: '', liveNotes: null, liveNoteDetails: {}, liveCalendar: null, liveRecipes: null, liveRotation: null, liveRecipeProfile: null, rotationShowExtra: false, recipeAddOpen: false, liveShoppingList: null, openNoteId: 'n1', liveWorkoutExercises: null, liveWorkoutRoutines: null, liveWorkoutSchedule: null, workoutsView: 'routines', openRoutineId: null, workoutSession: null, liveWorkoutHistory: null });
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
      this.ingestPollIv = setInterval(() => this.pollIngestJob(), 3000);
    }).catch((e) => {
      this.setState({ ingestStatus: 'error', ingestError: e.message });
    });
  }
  pollIngestJob() {
    const conn = getConnection();
    const jobId = this.state.ingestJobId;
    if (!conn || !jobId) return;
    api.ingestJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.ingestPollIv);
        this.setState({ ingestStatus: 'ready', ingestPreview: { summary: job.summary, cost: job.cost, changes: job.changes } });
      } else if (job.status === 'error') {
        clearInterval(this.ingestPollIv);
        this.setState({ ingestStatus: 'error', ingestError: job.error });
      } else {
        this.setState({ ingestStatus: job.status });
      }
    }).catch(() => {});
  }
  closeIngestReview() {
    if (this.state.ingestStatus === 'ready') { this.discardIngest(); return; }
    clearInterval(this.ingestPollIv);
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
    const types = { note: '#ece5da', podcast: '#8a6ad1', recipe: '#d8b573', training: '#5aa87c', agent: '#6be5f5', idea: '#e08f6f' };
    this.gNodes = galaxyNamed.map((n, i) => {
      const ang = (i / galaxyNamed.length) * Math.PI * 2 + rnd(-.4, .4);
      const rad = rnd(.16, .4) * Math.min(w, h);
      return { label: n[0], type: n[1], desc: n[2], target: n[3], color: types[n[1]], bx: w / 2 + Math.cos(ang) * rad * (w / h), by: h / 2 + Math.sin(ang) * rad, ph: rnd(0, 6.28), sp: rnd(.3, .8), r: rnd(4, 6.5) };
    });
    this.gLinks = galaxyLinks;
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
      const t = performance.now() / 1000;
      ctx.clearRect(0, 0, w, h);
      this.gDust.forEach(d => { ctx.globalAlpha = .25 + .45 * Math.abs(Math.sin(t * d.sp + d.ph)); ctx.fillStyle = '#ece5da'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.29); ctx.fill(); });
      ctx.globalAlpha = 1;
      const pos = this.gNodes.map(n => ({ x: n.bx + Math.sin(t * n.sp * .5 + n.ph) * 12, y: n.by + Math.cos(t * n.sp * .4 + n.ph) * 9 }));
      this.gPos = pos;
      ctx.strokeStyle = 'rgba(236,229,218,.13)'; ctx.lineWidth = 1;
      this.gLinks.forEach(l => { ctx.beginPath(); ctx.moveTo(pos[l[0]].x, pos[l[0]].y); ctx.lineTo(pos[l[1]].x, pos[l[1]].y); ctx.stroke(); });
      this.gNodes.forEach((n, i) => {
        const p = pos[i];
        const sel = this.state.galaxySel && this.state.galaxySel.label === n.label;
        ctx.shadowColor = n.color; ctx.shadowBlur = sel ? 26 : 14;
        ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(p.x, p.y, sel ? n.r + 2 : n.r, 0, 6.29); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(p.x, p.y, n.r + 9, 0, 6.29); ctx.strokeStyle = n.color; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = sel ? '#ece5da' : 'rgba(236,229,218,.6)';
        ctx.fillText(n.label, p.x + n.r + 8, p.y + 3);
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

  orbReply(q) {
    const s = q.toLowerCase();
    if (/(lunch|eat|food|recipe|meal)/.test(s)) return 'From your vault: the burrito bowl — 52 g protein, 640 kcal, 25 minutes. It closes today’s protein gap. Shall I scale it to two servings?';
    if (/(gym|train|workout|push|run)/.test(s)) return 'Push day at 17:30 — six lifts, forty-two minutes. Coach flags bench for a PR attempt if bar speed holds. Zone-2 run is rescheduled to tomorrow, 7 am.';
    if (/(money|spend|budget|sub)/.test(s)) return 'CFO reports $1,284 spent this month — on plan. Two overlapping subscriptions were flagged; cancelling both recovers $23 per month.';
    if (/(brief|today|plan|morning)/.test(s)) return 'Briefing: deep work 09:00 on the video script — Studio’s cold-open is ready. Lunch 12:30, push day 17:30, reflection 20:00. Protein pace is 84 g short; the bowl covers it.';
    return 'Understood. I’ve noted that in the vault and routed it to the right agent — Commander will fold it into today’s plan.';
  }
  coachReply(q) {
    const s = q.toLowerCase();
    if (/(short|less|trim|time|quick)/.test(s)) return { text: 'Done — cutting cable fly, supersetting laterals with triceps. New estimate: 34 minutes, same chest stimulus. Written back to the vault.', mod: 'trim', note: 'Trimmed to 5 lifts · ~34 min · superset added' };
    if (/(hard|more|heavy|push|extra)/.test(s)) return { text: 'You’ve earned it — bench goes to 5 sets and we’ll chase the 87.5 kg single if velocity holds. Recovery cost is acceptable given last night’s HRV.', mod: 'hard', note: 'Bench 5 × 6 · PR single queued at 87.5 kg' };
    if (/(swap|replace|shoulder|knee|hurt|pain)/.test(s)) return { text: 'Swapped seated press for landmine press — friendlier angle, same overhead pattern. Flag any pain above 3/10 and I’ll deload the session.', mod: 'swap', note: 'Landmine press substituted · joint-friendly' };
    return { text: 'Noted. I’ll factor that into tonight’s session and adjust tomorrow’s plan — anything specific you want changed right now? Try “make it shorter” or “go harder”.', mod: null, note: null };
  }
  recipeReply(q, r) {
    const s = q.toLowerCase();
    if (/(swap|substitut|instead)/.test(s)) return 'Swap ideas for ' + r.name.toLowerCase() + ': chicken thigh → breast saves 6 g fat (−45 kcal); rice → cauliflower rice drops 38 g carbs. Both keep protein at ' + r.p + ' g. Want me to write a variant note to the vault?';
    if (/(scale|serving|two|double)/.test(s)) return 'Scaled — use the stepper on the left. Macros and every ingredient quantity update together; I’ll add the extra portion to tomorrow’s lunch slot.';
    if (/(cut|diet|lean|lower)/.test(s)) return 'Cutting version: hold protein at ' + r.p + ' g, drop rice to 50 g and skip cheese — that’s ' + Math.round(r.kcal * 0.75) + ' kcal. I’ve saved it as “' + r.name + ' · cut” in the vault.';
    return 'This one clears your leucine threshold per serving and fits today’s remaining macros. Ask me to swap ingredients, scale it, or build a cutting version.';
  }

  renderVals() {
    const st = this.state;
    const userName = USER_NAME;
    const wakeWord = WAKE_WORD;
    const go = (screen) => () => this.setState({ screen, paletteOpen: false });
    const mono = "'JetBrains Mono',monospace";
    const navStyle = (act) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '9px', fontSize: '13.5px', cursor: 'pointer',
      fontWeight: act ? 500 : 400, color: act ? '#ece5da' : 'rgba(236,229,218,.6)',
      background: act ? 'linear-gradient(180deg,rgba(216,181,115,.16),rgba(216,181,115,.07))' : 'none',
      border: act ? '1px solid rgba(216,181,115,.25)' : '1px solid transparent',
      boxShadow: act ? 'inset 0 1px 0 rgba(255,255,255,.08)' : 'none' });
    const numStyle = (act) => ({ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: '13px', width: '20px', color: act ? '#d8b573' : 'rgba(216,181,115,.5)' });
    const mkNav = (label, numeral, screen, count) => ({ label, numeral, count, go: go(screen), style: navStyle(st.screen === screen), numStyle: numStyle(st.screen === screen) });

    // recipes — live (real Wiki/Health/Meal Prep Recipe Collection.md) or mock
    const usingLiveRecipes = !!st.liveRecipes;
    const RECIPE_CATEGORY_LABEL = { 'CORE DAILY MEALS': 'Core', 'ROTATION / SWAP MEALS': 'Rotation', TREATS: 'Treats' };
    const RECIPE_HUES = ['216,181,115', '138,106,209', '107,229,245', '201,111,111', '90,168,124'];
    const chip = (act) => ({ cursor: 'pointer', font: "500 10.5px " + mono, letterSpacing: '.08em', padding: '7px 14px', borderRadius: '8px',
      border: act ? '1px solid rgba(216,181,115,.5)' : '1px solid rgba(236,229,218,.12)',
      color: act ? '#d8b573' : 'rgba(236,229,218,.55)', background: act ? 'rgba(216,181,115,.08)' : 'rgba(0,0,0,.2)' });

    const filters = usingLiveRecipes ? ['All', 'Core', 'Rotation', 'Treats'] : ['All', 'High protein', 'Quick', 'Batch'];

    // daily rotation — which real recipe fills each meal slot, and the day's macro total
    const rotation = st.liveRotation;
    const profile = st.liveRecipeProfile;
    // Deliberately avoids cyan/gold/purple/green — those are the P/C/F/kcal
    // macro colors, so a slot title in one of those would clash with the
    // macro reading right below it in the same card.
    const SLOT_DEFS = [
      { key: 'breakfast', label: 'B', name: 'Breakfast', hue: '214,142,74' },
      { key: 'lunch', label: 'L', name: 'Lunch', hue: '90,150,224' },
      { key: 'dinner', label: 'D', name: 'Dinner', hue: '95,105,190' },
      { key: 'snack', label: 'S', name: 'Snack', hue: '199,120,158' },
      { key: 'extra', label: 'E', name: 'Extra Meal', hue: '199,99,99' },
    ];
    const rotationExtraVisible = st.rotationShowExtra || !!rotation?.slots?.extra;
    const visibleSlotDefs = SLOT_DEFS.filter((s) => s.key !== 'extra' || rotationExtraVisible);
    const rotationSlots = visibleSlotDefs.map((s) => {
      const filled = rotation?.slots?.[s.key] || null;
      return {
        key: s.key,
        name: s.name,
        hue: s.hue,
        recipeName: filled ? filled.name : null,
        p: filled ? Math.round(filled.macros.p) : null,
        c: filled ? Math.round(filled.macros.c) : null,
        f: filled ? Math.round(filled.macros.f) : null,
        kcal: filled ? Math.round(filled.macros.kcal) : null,
        open: filled ? () => this.openRecipe(filled.id) : null,
        clear: filled ? () => {
          this.toggleRotationSlot(s.key, filled.id);
          if (s.key === 'extra') this.setState({ rotationShowExtra: false });
        } : null,
      };
    });
    const rotTot = rotation?.totals || { p: 0, c: 0, f: 0, kcal: 0 };

    // protein gauge — real rotation total vs the file's protein floor, once connected
    const proteinTarget = usingLiveRecipes ? (profile ? profile.proteinFloorG : 180) : 180;
    const proteinCurrent = usingLiveRecipes ? rotTot.p : 96;
    const proteinRatio = proteinTarget > 0 ? Math.min(1, proteinCurrent / proteinTarget) : 0;

    const recipeList = usingLiveRecipes
      ? st.liveRecipes
          .filter(r => st.recipeFilter === 'All' || RECIPE_CATEGORY_LABEL[r.category] === st.recipeFilter)
          .map((r, i) => {
            const tot = (r.macros.p + r.macros.c + r.macros.f) || 1;
            const hue = RECIPE_HUES[i % RECIPE_HUES.length];
            const bar = (v, col) => ({ flex: String(v / tot), borderRadius: '2px', background: col });
            return { name: r.name, tag: (RECIPE_CATEGORY_LABEL[r.category] || r.category).toUpperCase(), p: r.macros.p, c: r.macros.c, f: r.macros.f, kcal: r.macros.kcal, time: r.makes || '',
              open: () => this.openRecipe(r.id),
              photoUrl: st.liveRecipePhotoUrls[r.id] || null,
              phLabel: 'dish photo — ' + r.name.toLowerCase(),
              phStyle: { height: '104px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + hue + ',.13) 0 8px, rgba(' + hue + ',.04) 8px 16px)' },
              pBar: bar(r.macros.p, '#6be5f5'), cBar: bar(r.macros.c, '#d8b573'), fBar: bar(r.macros.f, '#8a6ad1'),
              slotToggles: SLOT_DEFS.map((s) => ({ key: s.key, label: s.label, hue: s.hue, active: rotation?.slots?.[s.key]?.id === r.id, onClick: () => this.toggleRotationSlot(s.key, r.id) })) };
          })
      : this.recipes.filter(r => st.recipeFilter === 'All' || r.filter === st.recipeFilter).map(r => {
          const tot = r.p + r.c + r.f;
          const bar = (v, col) => ({ flex: String(v / tot), borderRadius: '2px', background: col });
          return { name: r.name, tag: r.tag, p: r.p, c: r.c, f: r.f, kcal: r.kcal, time: r.time,
            open: () => this.setState({ openRecipeId: r.id, servings: 1, recipeChat: [], recipeInput: '' }),
            phLabel: 'dish photo — ' + r.name.toLowerCase(),
            phStyle: { height: '104px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + r.hue + ',.13) 0 8px, rgba(' + r.hue + ',.04) 8px 16px)' },
            pBar: bar(r.p, '#6be5f5'), cBar: bar(r.c, '#d8b573'), fBar: bar(r.f, '#8a6ad1'), slotToggles: [] };
        });

    const liveOr = usingLiveRecipes ? (st.liveRecipes.find(r => r.id === st.openRecipeId) || null) : null;
    const or = usingLiveRecipes ? null : this.recipes.find(r => r.id === st.openRecipeId);
    const sv = usingLiveRecipes ? 1 : st.servings; // no serving-scaling for live recipes — ingredients are free text, not [qty,unit] tuples

    // when viewing a live recipe, an alternate (a Nova-suggested tweak the user
    // chose to keep) can stand in for the original's macros/ingredients/method
    const activeAlt = liveOr ? (liveOr.alternates || []).find((a) => a.id === st.recipeAltSelected) || null : null;
    const effMacros = activeAlt ? activeAlt.macros : (liveOr ? liveOr.macros : null);
    const effIngredients = activeAlt ? activeAlt.ingredients.map((name) => ({ qty: '', name })) : (liveOr ? liveOr.ingredients : []);
    const effMethod = activeAlt ? activeAlt.method : (liveOr ? liveOr.method : []);

    // workouts
    const plan = st.plan || this.basePlan;
    const week = weekData.map(d => {
      const s = d[2];
      return { day: d[0], label: d[1], style: { flex: '1', minWidth: '62px', textAlign: 'center', padding: '10px 6px', borderRadius: '10px',
        border: s === 'today' ? '1px solid rgba(107,229,245,.45)' : '1px solid rgba(236,229,218,.08)',
        background: s === 'today' ? 'rgba(107,229,245,.07)' : 'rgba(0,0,0,.18)',
        color: s === 'today' ? '#6be5f5' : s === 'skip' ? 'rgba(201,111,111,.85)' : 'rgba(236,229,218,.55)',
        boxShadow: s === 'today' ? '0 0 24px -8px rgba(107,229,245,.5)' : 'none' } };
    });
    const bubble = (who) => who === 'you'
      ? { wrapStyle: { display: 'flex', justifyContent: 'flex-end' }, bubbleStyle: { maxWidth: '85%', fontSize: '12.5px', lineHeight: 1.55, padding: '9px 13px', borderRadius: '11px 11px 3px 11px', background: 'rgba(216,181,115,.14)', border: '1px solid rgba(216,181,115,.25)', color: '#ece5da' } }
      : { wrapStyle: { display: 'flex' }, bubbleStyle: { maxWidth: '90%', fontSize: '12.5px', lineHeight: 1.55, padding: '9px 13px', borderRadius: '11px 11px 11px 3px', background: 'rgba(107,229,245,.07)', border: '1px solid rgba(107,229,245,.2)', color: 'rgba(236,229,218,.92)' } };

    // workouts — live (real routines/history in Wiki/Health) or mock, depending on Settings connection
    const usingLiveWorkouts = !!st.liveWorkoutRoutines;
    const liveRoutines = st.liveWorkoutRoutines || [];
    const liveSchedule = st.liveWorkoutSchedule || {};
    const liveWeekdays = st.liveWorkoutWeekdays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const WEEKDAY_SHORT = { monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN' };
    const todayWeekday = WEEKDAY_NAMES[new Date().getDay()];

    const weekStrip = liveWeekdays.map((day) => {
      const routineId = liveSchedule[day] || '';
      const isToday = day === todayWeekday;
      return {
        day, dayLabel: WEEKDAY_SHORT[day], isToday,
        style: { flex: '1', minWidth: '62px', textAlign: 'center', padding: '10px 6px', borderRadius: '10px',
          border: isToday ? '1px solid rgba(107,229,245,.45)' : '1px solid rgba(236,229,218,.08)',
          background: isToday ? 'rgba(107,229,245,.07)' : 'rgba(0,0,0,.18)',
          boxShadow: isToday ? '0 0 24px -8px rgba(107,229,245,.5)' : 'none' },
        labelColor: isToday ? '#6be5f5' : 'rgba(236,229,218,.55)',
        value: routineId,
        onChange: (e) => this.assignScheduleDay(day, e.target.value || null),
        options: [{ value: '', label: 'Rest' }, ...liveRoutines.map((r) => ({ value: r.id, label: r.name }))],
      };
    });

    const routinesList = liveRoutines.map((r) => ({
      id: r.id,
      name: r.name,
      exercisesPreview: r.exercises.length
        ? r.exercises.slice(0, 3).map((e) => e.name).join(', ') + (r.exercises.length > 3 ? ` +${r.exercises.length - 3} more` : '')
        : 'No exercises yet',
      completedCount: r.completedCount,
      onOpen: () => this.openRoutine(r.id),
    }));

    const openRoutine = usingLiveWorkouts ? liveRoutines.find((r) => r.id === st.openRoutineId) || null : null;
    const isTimeTracking = (tt) => tt === 'weight_time' || tt === 'bodyweight_time';
    const isBodyweightTracking = (tt) => tt === 'bodyweight_reps' || tt === 'bodyweight_time';
    const targetUnit = (tt) => isTimeTracking(tt) ? 'sec' : 'reps';
    const formatSet = (tt, s) => {
      if (tt === 'bodyweight_reps') return `${s.reps} reps`;
      if (tt === 'bodyweight_time') return `${s.reps}s`;
      if (tt === 'weight_time') return `${s.weight}kg×${s.reps}s`;
      if (tt === 'weighted_bodyweight_reps') return `BW+${s.weight}kg×${s.reps}`;
      return `${s.weight}kg×${s.reps}`;
    };
    const setsLabel = (tt, sets) => sets && sets.length ? sets.map((s) => formatSet(tt, s)).join(', ') : 'Not yet performed';

    const routineDetailExercises = openRoutine ? openRoutine.exercises.map((e, i, arr) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      muscleGroup: e.muscleGroup,
      trackingType: e.trackingType,
      targetUnit: targetUnit(e.trackingType),
      targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh,
      lastLabel: setsLabel(e.trackingType, e.lastSets),
      canMoveUp: i > 0, canMoveDown: i < arr.length - 1,
      onMoveUp: () => this.moveExerciseInRoutine(e.exerciseId, -1),
      onMoveDown: () => this.moveExerciseInRoutine(e.exerciseId, 1),
      onRemove: () => this.removeExerciseFromRoutine(e.exerciseId),
      onTargetSetsBlur: (ev) => this.setExerciseTarget(e.exerciseId, 'targetSets', ev.target.value),
      onTargetLowBlur: (ev) => this.setExerciseTarget(e.exerciseId, 'targetRepsLow', ev.target.value),
      onTargetHighBlur: (ev) => this.setExerciseTarget(e.exerciseId, 'targetRepsHigh', ev.target.value),
    })) : [];

    const pickerQuery = st.exercisePickerQuery.trim().toLowerCase();
    const pickerMuscle = st.exercisePickerMuscle;
    const libraryExercises = st.liveWorkoutExercises || [];
    const exercisesById = new Map(libraryExercises.map((e) => [e.id, e]));
    const alreadyInRoutine = new Set((openRoutine?.exercises || []).map((e) => e.exerciseId));
    const exercisePickerResults = libraryExercises
      .filter((e) => !alreadyInRoutine.has(e.id))
      .filter((e) => pickerMuscle === 'Any' || e.muscleGroup === pickerMuscle)
      .filter((e) => !pickerQuery || e.name.toLowerCase().includes(pickerQuery))
      .slice(0, 60)
      .map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, onAdd: () => this.addExerciseToRoutine(e.id) }));
    const exercisePickerExactMatch = libraryExercises.some((e) => e.name.toLowerCase() === pickerQuery);
    const exercisePickerShowCreate = pickerQuery.length > 0 && !exercisePickerExactMatch;
    const TRACKING_TYPE_LABEL = { weight_reps: 'Weight × Reps', bodyweight_reps: 'Bodyweight × Reps', weight_time: 'Weight × Time', bodyweight_time: 'Bodyweight × Time', weighted_bodyweight_reps: 'Weighted Bodyweight × Reps' };

    const session = st.workoutSession;
    const sessionExercises = session ? session.exercises.map((e, exIdx) => ({
      exerciseId: e.exerciseId, name: e.name, muscleGroup: e.muscleGroup, trackingType: e.trackingType,
      isTime: isTimeTracking(e.trackingType), isBodyweight: isBodyweightTracking(e.trackingType),
      weightLabel: e.trackingType === 'weighted_bodyweight_reps' ? '+KG' : 'KG',
      amountLabel: isTimeTracking(e.trackingType) ? 'SEC' : 'REPS',
      targetLabel: `Target: ${e.targetSets} × ${e.targetRepsLow}-${e.targetRepsHigh} ${targetUnit(e.trackingType)}`,
      onAddSet: () => this.addSessionSet(exIdx),
      sets: e.sets.map((s, setIdx) => ({
        weight: s.weight, reps: s.reps, done: s.done,
        onWeight: (ev) => this.updateSessionSet(exIdx, setIdx, 'weight', ev.target.value),
        onReps: (ev) => this.updateSessionSet(exIdx, setIdx, 'reps', ev.target.value),
        onToggleDone: () => this.toggleSessionSetDone(exIdx, setIdx),
        onRemove: () => this.removeSessionSet(exIdx, setIdx),
        canRemove: e.sets.length > 1,
      })),
    })) : [];

    const historySessions = (st.liveWorkoutHistory || []).map((s) => ({
      id: s.id,
      date: s.date,
      totalSets: s.exercises.reduce((n, e) => n + e.sets.length, 0),
      totalVolume: Math.round(s.exercises.reduce((v, e) => v + e.sets.reduce((sv, set) => sv + set.weight * set.reps, 0), 0)),
      exercises: s.exercises.map((e) => ({ name: e.name, setsLabel: setsLabel((exercisesById.get(e.exerciseId) || {}).trackingType || 'weight_reps', e.sets) })),
    }));
    const historyRoutine = liveRoutines.find((r) => r.id === st.historyRoutineId);
    const todayRoutineId = liveSchedule[todayWeekday];
    const todayRoutine = todayRoutineId ? liveRoutines.find((r) => r.id === todayRoutineId) : null;

    // notes — live (real Obsidian vault via server/) or mock, depending on Settings connection
    const usingLiveNotes = !!st.liveNotes;
    const nchip = (act) => ({ cursor: 'pointer', font: "500 9px " + mono, letterSpacing: '.1em', padding: '5px 10px', borderRadius: '7px',
      border: act ? '1px solid rgba(216,181,115,.5)' : '1px solid rgba(236,229,218,.12)', color: act ? '#d8b573' : 'rgba(236,229,218,.5)' });
    const q = st.noteQuery.toLowerCase();

    const noteFilters = usingLiveNotes
      ? ['All', ...Array.from(new Set(st.liveNotes.map(n => (n.type || 'note').toUpperCase())))]
      : ['All', 'NOTE', 'PODCAST', 'IDEA'];

    const allNotesNorm = usingLiveNotes
      ? st.liveNotes.map(n => ({ id: n.id, title: n.title, typeLabel: (n.type || 'note').toUpperCase(), date: (n.date || '').slice(0, 10), color: NOTE_TYPE_COLOR[(n.type || '').toLowerCase()] || '#ece5da', searchText: n.title.toLowerCase() }))
      : this.notes.map(n => ({ id: n.id, title: n.title, typeLabel: n.type, date: n.date.split(' · ')[0], color: n.color, searchText: (n.title + ' ' + n.paras.join(' ')).toLowerCase() }));

    const noteList = allNotesNorm
      .filter(n => (st.noteType === 'All' || n.typeLabel === st.noteType || (st.noteType === 'NOTE' && n.typeLabel === 'IDENTITY')) && (!q || n.searchText.includes(q)))
      .map(n => ({ title: n.title, type: n.typeLabel, date: n.date, select: () => this.selectNote(n.id),
        typeStyle: { font: "500 8.5px " + mono, letterSpacing: '.08em', color: n.color, flex: 'none' },
        style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '9px', background: st.openNoteId === n.id ? 'rgba(216,181,115,.09)' : 'none', border: st.openNoteId === n.id ? '1px solid rgba(216,181,115,.22)' : '1px solid transparent' } }));

    const liveDetail = usingLiveNotes ? st.liveNoteDetails[st.openNoteId] : null;
    const on = usingLiveNotes ? null : (this.notes.find(n => n.id === st.openNoteId) || this.notes[0]);
    const noteByTitle = (label) => this.notes.find(n => n.title.startsWith(label.split(' ·')[0].slice(0, 12)));

    // daily review — a deterministic-by-date pick from the real Concepts/Topics
    // pages in the vault, falling back to the fictional demo cards when not connected
    const usingLiveReview = usingLiveNotes;
    const reviewPool = this.dailyReviewPool(st.liveNotes);
    const reviewIdx = st.reviewShuffleIdx != null ? st.reviewShuffleIdx : this.dailyReviewIndex(reviewPool);
    const reviewPage = reviewPool[reviewIdx] || null;
    const reviewDetail = reviewPage ? st.liveNoteDetails[reviewPage.id] : null;
    const reviewExcerpt = reviewDetail?.paragraphs?.[0] || '';

    // journal — live entries (Wiki/Journal/) grouped by day, newest first
    const journalDays = (st.liveJournalEntries || []).map((d) => ({
      date: d.date,
      open: st.journalOpenDate === d.date,
      toggle: () => this.toggleJournalDay(d.date),
      count: d.sections.length,
      preview: (d.sections[d.sections.length - 1]?.text || '').replace(/\s+/g, ' ').slice(0, 100),
      sections: d.sections.map((s) => ({ time: s.time, heading: s.heading ? s.heading.replace(/\[\[([^\]]+)\]\]/g, '$1') : null, text: s.text })),
    }));

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
      ...(usingLiveRecipes ? [] : [{ icon: '✦', iconColor: '#6be5f5', label: 'Scale burrito bowl to 2 servings', hint: 'NOVA', run: () => { this.setState({ screen: 'recipes', openRecipeId: 'r1', servings: 2, recipeChat: [], paletteOpen: false }); this.toastMsg('Nova scaled the burrito bowl ×2 — macros updated'); } }]),
      { icon: '✦', iconColor: '#6be5f5', label: 'Ask Coach to ease today’s session', hint: 'COACH', run: () => { this.setState({ screen: 'workouts', paletteOpen: false }); setTimeout(() => this.doCoach('Make it a bit shorter today'), 300); } },
      { icon: '✦', iconColor: '#6be5f5', label: 'Run vault backup — Guardian', hint: 'GUARDIAN', run: () => { this.setState({ paletteOpen: false }); this.toastMsg('Guardian: snapshot complete — 186 notes · 0 conflicts ✓'); } },
      { icon: '✦', iconColor: '#6be5f5', label: 'Start a voice session', hint: 'VOICE', run: () => { this.setState({ screen: 'voice', micOn: true, paletteOpen: false }); } },
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

    // shopping list — grouped by category (matching a typical supermarket layout)
    const shoppingItems = st.liveShoppingList?.items || [];
    const shoppingCategoryOrder = st.liveShoppingList?.categories || [];
    const shoppingCategories = shoppingCategoryOrder
      .map((cat) => ({
        name: cat,
        items: shoppingItems.filter((i) => i.category === cat).map((i) => ({
          id: i.id, name: i.name, source: i.source, checked: i.checked,
          onToggle: () => this.toggleShoppingItem(i.id, !i.checked),
          checkboxStyle: {
            width: '21px', height: '21px', borderRadius: '6px', flex: 'none',
            border: i.checked ? '1px solid #6be5f5' : '1px solid rgba(236,229,218,.25)',
            background: i.checked ? '#6be5f5' : 'transparent',
            color: '#0a2830', fontSize: '13px', fontWeight: 700, lineHeight: '19px', textAlign: 'center',
          },
          nameStyle: {
            fontSize: '13.5px',
            color: i.checked ? 'rgba(236,229,218,.35)' : '#ece5da',
            textDecoration: i.checked ? 'line-through' : 'none',
          },
        })),
      }))
      .filter((c) => c.items.length > 0);
    const shoppingCheckedCount = shoppingItems.filter((i) => i.checked).length;

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
        Object.assign(mkNav('Recipes', 'V.', 'recipes'), { count: usingLiveRecipes ? String(st.liveRecipes.length) : '42' }),
        Object.assign(mkNav('Shopping List', 'VI.', 'shopping'), { count: String(shoppingItems.length) }),
        Object.assign(mkNav('Workouts', 'VII.', 'workouts'), { count: usingLiveWorkouts ? String(liveRoutines.length) : 'wk6' }),
        Object.assign(mkNav('Notes', 'VIII.', 'notes'), { count: usingLiveNotes ? String(st.liveNotes.length) : '186' }),
        Object.assign(mkNav('Journal', 'IX.', 'journal'), { count: String(journalDays.length) }),
      ],
      navSystem: [mkNav('Settings', 'X.', 'settings')],

      // shopping list
      shoppingHeaderLabel: st.liveShoppingList ? `${shoppingItems.length} ITEM${shoppingItems.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
      shoppingCategories,
      shoppingCheckedCount,
      shoppingAddInput: st.shoppingAddInput,
      setShoppingAddInput: (e) => this.setShoppingAddInput(e),
      submitShoppingAdd: () => this.submitShoppingAdd(),
      shoppingAddBusy: st.shoppingAddBusy,
      shoppingAddError: st.shoppingAddError,
      confirmShoppingCompletion: () => this.confirmShoppingCompletion(),
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

      // mission actions
      openPalette: () => this.setState({ paletteOpen: true, paletteQuery: '' }),
      openFocusNote: () => this.setState({ screen: 'notes', openNoteId: 'n3' }),
      snoozeFocus: () => this.toastMsg('Commander moved the script block to 14:00'),
      acceptRun: () => this.toastMsg('Zone-2 run locked for tomorrow, 7:00 am ✓'),
      openProteinNote: () => this.setState({ screen: 'notes', openNoteId: 'n1' }),
      reviewSubs: () => this.toastMsg('CFO drafted the cancellations — review in tonight’s reflection'),
      usingLiveHealthInsight: usingLiveNotes && !!st.liveHealthInsight,
      healthInsightText: st.liveHealthInsight?.hasInsight
        ? st.liveHealthInsight.insight
        : "Nova hasn't spotted a pattern yet — connect your Apple Health data to start getting daily insights here.",
      lunchCardLabel: usingLiveRecipes
        ? (rotation?.slots?.lunch ? `Lunch — ${rotation.slots.lunch.name}` : 'Lunch — not set')
        : 'Lunch — burrito bowl',
      lunchCardMacros: usingLiveRecipes
        ? (rotation?.slots?.lunch
            ? `${Math.round(rotation.slots.lunch.macros.p)}P · ${Math.round(rotation.slots.lunch.macros.c)}C · ${Math.round(rotation.slots.lunch.macros.f)}F · ${Math.round(rotation.slots.lunch.macros.kcal)} kcal`
            : 'Pick a lunch in Recipes →')
        : '52P · 68C · 18F · 640 kcal',
      lunchCardPhoto: usingLiveRecipes
        ? (rotation?.slots?.lunch ? 'dish photo — ' + rotation.slots.lunch.name.toLowerCase() : 'dish photo — none selected')
        : 'dish photo — burrito bowl',
      proteinGaugeHint: usingLiveRecipes
        ? (rotation?.slots?.lunch ? `${rotation.slots.lunch.name.toLowerCase()} closes the gap` : 'add a lunch in Recipes to close the gap')
        : 'burrito bowl closes the gap',
      openLunch: () => {
        if (usingLiveRecipes) {
          const lunch = rotation?.slots?.lunch;
          if (lunch) { this.setState({ screen: 'recipes' }); this.openRecipe(lunch.id); }
          else this.setState({ screen: 'recipes' });
        } else {
          this.setState({ screen: 'recipes', openRecipeId: 'r1', servings: 1, recipeChat: [] });
        }
      },
      workoutCardLabel: usingLiveWorkouts
        ? (todayRoutine ? todayRoutine.name : (liveRoutines.length ? 'No routine scheduled today' : 'Build a routine in Train'))
        : 'Push day · week 6',
      workoutCardMeta: usingLiveWorkouts
        ? (todayRoutine ? `${todayRoutine.exercises.length} exercise${todayRoutine.exercises.length === 1 ? '' : 's'} · tap to start` : 'Plan your week in Train →')
        : '6 lifts · 42 min · bench PR watch',
      workoutCardPhoto: usingLiveWorkouts
        ? (todayRoutine ? 'workout — ' + todayRoutine.name.toLowerCase() : 'workout — rest day')
        : 'workout — push day',
      todayIsLive: !!st.liveCalendar,
      todayEvents: st.liveCalendar && st.liveCalendar.length
        ? st.liveCalendar.map(e => ({ time: e.time, label: e.label }))
        : [
            { time: '09:00', label: 'Deep work — video script' },
            { time: '12:30', label: usingLiveRecipes
                ? (rotation?.slots?.lunch ? `Lunch — ${rotation.slots.lunch.name} · ${Math.round(rotation.slots.lunch.macros.p)}g P` : 'Lunch — not set yet')
                : 'Lunch — burrito bowl · 52g P' },
            { time: '17:30', label: 'Gym — push day · wk 6' },
            { time: '20:00', label: 'Reflection with Commander' },
          ],
      rotSleep: st.gaugeIdx === 0,
      rotProtein: st.gaugeIdx === 1,
      proteinGaugeValue: Math.round(proteinCurrent),
      proteinGaugeTargetLabel: `/${proteinTarget}g`,
      proteinGaugeDasharray: `${Math.round(proteinRatio * 163)} 163`,
      reviewConcept: usingLiveReview
        ? (reviewPage ? (reviewExcerpt ? (reviewExcerpt.length > 130 ? reviewExcerpt.slice(0, 127) + '…' : reviewExcerpt) : 'Loading…') : 'Add some Concepts or Topics to your wiki to start daily review')
        : this.reviews[st.reviewIdx].c,
      reviewFrom: usingLiveReview ? (reviewPage ? reviewPage.title : '') : this.reviews[st.reviewIdx].f,
      shuffleReview: usingLiveReview ? () => this.shuffleDailyReview() : () => this.setState(s => ({ reviewIdx: (s.reviewIdx + 1 + Math.floor(Math.random() * (this.reviews.length - 1))) % this.reviews.length })),
      openReview: usingLiveReview
        ? () => this.openDailyReview()
        : () => { this.setState({ screen: 'notes', openNoteId: this.reviews[st.reviewIdx].id }); this.toastMsg('Commander queued this concept for tonight’s reflection'); },
      reviewShowReflect: usingLiveReview && !!reviewPage,
      reviewReflectOpen: st.reviewReflectOpen,
      toggleReviewReflect: () => this.toggleReviewReflect(),
      reviewReflectText: st.reviewReflectText,
      setReviewReflectText: (e) => this.setReviewReflectText(e),
      reviewReflectBusy: st.reviewReflectBusy,
      reviewReflectPromptBusy: st.reviewReflectPromptBusy,
      reviewReflectPromptText: st.reviewReflectPromptText,
      generateReviewReflectPrompt: () => this.generateReviewReflectPrompt(),
      saveReviewReflection: () => this.saveReviewReflection(),

      // voice
      micOn: st.micOn,
      micStatus: st.micOn ? 'LISTENING' : 'MUTED',
      micBar: { width: st.micOn ? '92%' : '8%', height: '100%', background: '#6be5f5', transition: 'width .4s' },
      micBtnStyle: { cursor: 'pointer', font: "500 10.5px " + mono, padding: '9px 16px', borderRadius: '8px', border: '1px solid rgba(107,229,245,.4)', color: st.micOn ? '#6be5f5' : 'rgba(236,229,218,.5)', background: st.micOn ? 'rgba(107,229,245,.08)' : 'rgba(0,0,0,.25)' },
      micBtnLabel: st.micOn ? '● MIC LIVE' : '○ MIC OFF',
      orbCaption: st.micOn ? (wakeWord ? 'LISTENING · SAY “NOVA”' : 'LISTENING') : 'STANDING BY',
      toggleMic: () => this.setState(s => ({ micOn: !s.micOn })),
      orbMsgs: st.orbChat.map(m => ({ text: m.text, typing: m.typing, tag: m.who === 'nova' ? '» NOVA' : '» YOU', tagStyle: { color: m.who === 'nova' ? '#6be5f5' : 'rgba(236,229,218,.5)', fontWeight: 500 } })),
      orbInput: st.orbInput,
      setOrbInput: (e) => this.setState({ orbInput: e.target.value }),
      orbKey: (e) => { if (e.key === 'Enter') this.doOrb(); },
      sendOrb: () => this.doOrb(),
      briefMe: () => { this.setState(s => ({ orbChat: [...s.orbChat, { who: 'you', text: 'Brief me.' }] })); setTimeout(() => this.typeIn('orbChat', 'nova', this.orbReply('brief')), 450); },

      // galaxy
      galaxyRef: this.galaxyRef,
      galaxyClick: (e) => {
        if (!this.gPos) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        let hit = null;
        this.gPos.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) < 16) hit = this.gNodes[i]; });
        this.setState({ galaxySel: hit ? { label: hit.label, type: hit.type.toUpperCase(), desc: hit.desc, color: hit.color, target: hit.target } : null });
      },
      galaxySelOn: !!st.galaxySel,
      galaxySelLabel: st.galaxySel ? st.galaxySel.label : '',
      galaxySelType: st.galaxySel ? st.galaxySel.type : '',
      galaxySelDesc: st.galaxySel ? st.galaxySel.desc : '',
      galaxySelColor: st.galaxySel ? st.galaxySel.color : '#d8b573',
      galaxyClear: () => this.setState({ galaxySel: null }),
      galaxyOpen: () => {
        const t = st.galaxySel && st.galaxySel.target;
        if (!t) return;
        if (t.startsWith('n')) this.setState({ screen: 'notes', openNoteId: t, galaxySel: null });
        else if (t.startsWith('r')) this.setState({ screen: 'recipes', openRecipeId: t, servings: 1, recipeChat: [], galaxySel: null });
        else this.setState({ screen: t, galaxySel: null });
      },

      // recipes
      recipesHeaderLabel: usingLiveRecipes ? `${st.liveRecipes.length} RECIPES · LIVE FROM OBSIDIAN` : 'SYNCED FROM OBSIDIAN /RECIPES · 2M AGO',
      recipeFilters: filters.map(f => ({ label: f, go: () => this.setState({ recipeFilter: f }), style: chip(st.recipeFilter === f) })),
      recipeList,

      // daily rotation — real meal-slot picks + aggregate macros, live only
      rotationVisible: usingLiveRecipes,
      rotationSlots,
      rotationTotals: { p: Math.round(rotTot.p), c: Math.round(rotTot.c), f: Math.round(rotTot.f), kcal: Math.round(rotTot.kcal) },
      rotationTargetKcal: profile ? profile.targetKcal : null,
      rotationProteinFloor: profile ? profile.proteinFloorG : null,
      rotationShowExtraButton: usingLiveRecipes && !rotationExtraVisible,
      showExtraMealSlot: () => this.setState({ rotationShowExtra: true }),

      // add recipe — writes back to the real vault file
      recipeAddVisible: usingLiveRecipes,
      openAddRecipe: () => this.openAddRecipe(),
      closeAddRecipe: () => this.closeAddRecipe(),
      recipeAddOpen: st.recipeAddOpen,
      recipeAddName: st.recipeAddName,
      setRecipeAddName: (e) => this.setState({ recipeAddName: e.target.value }),
      recipeAddCategoryOptions: [
        { value: 'CORE DAILY MEALS', label: 'Core' },
        { value: 'ROTATION / SWAP MEALS', label: 'Rotation' },
        { value: 'TREATS', label: 'Treats' },
      ],
      recipeAddCategory: st.recipeAddCategory,
      setRecipeAddCategory: (e) => this.setState({ recipeAddCategory: e.target.value }),
      recipeAddMakes: st.recipeAddMakes,
      setRecipeAddMakes: (e) => this.setState({ recipeAddMakes: e.target.value }),
      recipeAddP: st.recipeAddP,
      setRecipeAddP: (e) => this.setState({ recipeAddP: e.target.value }),
      recipeAddC: st.recipeAddC,
      setRecipeAddC: (e) => this.setState({ recipeAddC: e.target.value }),
      recipeAddF: st.recipeAddF,
      setRecipeAddF: (e) => this.setState({ recipeAddF: e.target.value }),
      recipeAddKcal: st.recipeAddKcal,
      setRecipeAddKcal: (e) => this.setState({ recipeAddKcal: e.target.value }),
      recipeAddKj: st.recipeAddKj,
      setRecipeAddKj: (e) => this.setRecipeAddKj(e),
      recipeAddIngredients: st.recipeAddIngredients,
      setRecipeAddIngredients: (e) => this.setState({ recipeAddIngredients: e.target.value }),
      recipeAddMethod: st.recipeAddMethod,
      setRecipeAddMethod: (e) => this.setState({ recipeAddMethod: e.target.value }),
      recipeAddBusy: st.recipeAddBusy,
      recipeAddError: st.recipeAddError,
      submitAddRecipe: () => this.submitAddRecipe(),
      recipeScanBusy: st.recipeScanBusy,
      recipeScanError: st.recipeScanError,
      onRecipeScanFiles: (e) => this.onRecipeScanFiles(e.target.files),
      recipeAddPhotoDataUrl: st.recipeAddPhotoDataUrl,
      onRecipeAddPhotoFile: (e) => this.onRecipeAddPhotoFile(e.target.files),
      clearRecipeAddPhoto: () => this.setState({ recipeAddPhotoDataUrl: null }),
      recipeOpen: usingLiveRecipes ? !!liveOr : !!or,
      closeRecipe: () => this.closeRecipe(),
      stopClick: (e) => e.stopPropagation(),
      orName: usingLiveRecipes ? (liveOr ? liveOr.name : '') : (or ? or.name : ''),
      orMeta: usingLiveRecipes
        ? (liveOr ? `${activeAlt ? 'ALTERNATE: ' + activeAlt.label + ' · ' : ''}${(RECIPE_CATEGORY_LABEL[liveOr.category] || liveOr.category).toUpperCase()}${liveOr.makes ? ' · ' + liveOr.makes : ''} · FROM OBSIDIAN /HEALTH` : '')
        : (or ? or.tag + ' · ' + or.time + ' · FROM OBSIDIAN /RECIPES' : ''),
      orPhLabel: usingLiveRecipes ? (liveOr ? 'dish photo — ' + liveOr.name.toLowerCase() : '') : (or ? 'dish photo — ' + or.name.toLowerCase() : ''),
      orPhStyle: usingLiveRecipes
        ? (liveOr ? { height: '170px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(216,181,115,.16) 0 9px, rgba(216,181,115,.05) 9px 18px)', border: '1px solid rgba(236,229,218,.08)' } : {})
        : (or ? { height: '170px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + or.hue + ',.16) 0 9px, rgba(' + or.hue + ',.05) 9px 18px)', border: '1px solid rgba(236,229,218,.08)' } : {}),
      orPhotoUrl: usingLiveRecipes && liveOr ? (st.liveRecipePhotoUrls[liveOr.id] || null) : null,
      orPhotoUploadBusy: usingLiveRecipes && liveOr ? !!st.recipePhotoUploadBusy[liveOr.id] : false,
      onRecipePhotoFile: usingLiveRecipes && liveOr ? (e) => this.onRecipePhotoFile(liveOr.id, e.target.files) : () => {},
      orP: usingLiveRecipes ? (effMacros ? Math.round(effMacros.p) : 0) : (or ? Math.round(or.p * sv) : 0),
      orC: usingLiveRecipes ? (effMacros ? Math.round(effMacros.c) : 0) : (or ? Math.round(or.c * sv) : 0),
      orF: usingLiveRecipes ? (effMacros ? Math.round(effMacros.f) : 0) : (or ? Math.round(or.f * sv) : 0),
      orKcal: usingLiveRecipes ? (effMacros ? Math.round(effMacros.kcal) : 0) : (or ? Math.round(or.kcal * sv) : 0),
      servings: sv,
      orShowServings: !usingLiveRecipes,
      incServ: () => this.setState(s => ({ servings: Math.min(6, s.servings + 1) })),
      decServ: () => this.setState(s => ({ servings: Math.max(1, s.servings - 1) })),
      orIngredients: usingLiveRecipes
        ? effIngredients.map(i => ({ qty: i.qty, name: i.name }))
        : (or ? or.ingredients.map(i => ({ qty: i[0] ? (Math.round(i[0] * sv * 10) / 10) + (i[1] ? ' ' + i[1] : '') : '—', name: i[2] })) : []),
      orSteps: usingLiveRecipes
        ? effMethod.map((s2, i) => ({ n: ['i.', 'ii.', 'iii.', 'iv.', 'v.'][i] || (i + 1) + '.', text: s2 }))
        : (or ? or.steps.map((s2, i) => ({ n: ['i.', 'ii.', 'iii.', 'iv.', 'v.'][i] || (i + 1) + '.', text: s2 })) : []),
      orDescription: usingLiveRecipes && liveOr && !activeAlt ? liveOr.description : null,
      orShowAskNova: !usingLiveRecipes,
      orNotes: usingLiveRecipes && liveOr && !activeAlt ? liveOr.notes : [],

      // alternates — Nova-suggested tweaks to a live recipe, kept as extra
      // saved views rather than overwriting the original
      orAlternates: usingLiveRecipes && liveOr ? [
        { id: null, label: 'Original', active: !st.recipeAltSelected, onClick: () => this.selectAlternate(null) },
        ...liveOr.alternates.map((a) => ({ id: a.id, label: a.label, active: st.recipeAltSelected === a.id, onClick: () => this.selectAlternate(a.id) })),
      ] : [],
      orShowAddToShoppingList: usingLiveRecipes && !!liveOr && effIngredients.length > 0,
      addRecipeToShoppingList: () => {
        if (!liveOr) return;
        const names = effIngredients.map((i) => i.name);
        const source = activeAlt ? `${liveOr.name} (${activeAlt.label})` : liveOr.name;
        this.addToShoppingList(names, source);
      },
      orShowTweak: usingLiveRecipes && !!liveOr,
      recipeTweakInput: st.recipeTweakInput,
      setRecipeTweakInput: (e) => this.setState({ recipeTweakInput: e.target.value }),
      recipeTweakKey: (e) => { if (e.key === 'Enter') this.submitRecipeTweak(); },
      submitRecipeTweak: () => this.submitRecipeTweak(),
      recipeTweakBusy: st.recipeTweakBusy,
      recipeTweakError: st.recipeTweakError,
      recipeTweakPreview: st.recipeTweakPreview,
      saveRecipeTweak: () => this.saveRecipeTweak(),
      discardRecipeTweak: () => this.discardRecipeTweak(),
      recipeMsgs: st.recipeChat.map(m => ({ text: m.text, typing: m.typing, tag: m.who === 'nova' ? '» NOVA' : '» YOU', tagStyle: { color: m.who === 'nova' ? '#6be5f5' : 'rgba(236,229,218,.5)', fontWeight: 500, fontFamily: mono, fontSize: '11px' } })),
      recipeInput: st.recipeInput,
      setRecipeInput: (e) => this.setState({ recipeInput: e.target.value }),
      recipeKey: (e) => { if (e.key === 'Enter') this.doRecipeAsk(); },
      sendRecipe: () => this.doRecipeAsk(),

      // workouts
      usingLiveWorkouts,
      workoutsView: st.workoutsView,
      week,
      plan: plan.map((ex, i) => ({ idx: String(i + 1).padStart(2, '0'), name: ex.name, scheme: ex.scheme, pr: ex.pr })),
      planMeta: plan.length + ' LIFTS · ' + (st.planNote ? 'EDITED BY COACH' : '~42 MIN · AS PLANNED'),
      planNoteOn: !!st.planNote, planNote: st.planNote,
      coachMsgs: st.coachChat.map(m => Object.assign({ text: m.text, typing: m.typing }, bubble(m.who))),
      coachInput: st.coachInput,
      setCoachInput: (e) => this.setState({ coachInput: e.target.value }),
      coachKey: (e) => { if (e.key === 'Enter') this.doCoach(); },
      sendCoach: () => this.doCoach(),

      workoutHeaderLabel: usingLiveWorkouts ? `${liveRoutines.length} ROUTINE${liveRoutines.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
      weekStrip,
      routinesList,
      routineCreating: st.routineCreating,
      routineNewName: st.routineNewName,
      setRoutineNewName: (e) => this.setRoutineNewName(e),
      startCreateRoutine: () => this.startCreateRoutine(),
      submitCreateRoutine: () => this.submitCreateRoutine(),
      cancelCreateRoutine: () => this.cancelCreateRoutine(),

      openRoutineName: openRoutine ? openRoutine.name : '',
      routineDetailExercises,
      routineDeleteConfirm: st.routineDeleteConfirm,
      backToRoutines: () => this.backToRoutines(),
      startWorkout: openRoutine ? () => this.startWorkoutSession(openRoutine) : () => {},
      startWorkoutDisabled: !openRoutine || !openRoutine.exercises.length,
      viewWorkoutHistory: openRoutine ? () => this.openWorkoutHistory(openRoutine.id) : () => {},
      requestDeleteRoutine: () => this.requestDeleteRoutine(),
      cancelDeleteRoutine: () => this.cancelDeleteRoutine(),
      confirmDeleteRoutine: openRoutine ? () => this.confirmDeleteRoutine(openRoutine.id) : () => {},

      exercisePickerOpen: st.exercisePickerOpen,
      openExercisePicker: () => this.openExercisePicker(),
      closeExercisePicker: () => this.closeExercisePicker(),
      exercisePickerQuery: st.exercisePickerQuery,
      setExercisePickerQuery: (e) => this.setExercisePickerQuery(e),
      exercisePickerMuscle: st.exercisePickerMuscle,
      exercisePickerMuscleGroups: ['Any', ...(st.liveWorkoutMuscleGroups || [])],
      setExercisePickerMuscle: (m) => this.setExercisePickerMuscle(m),
      exercisePickerResults,
      exercisePickerShowCreate,
      exercisePickerCreateMuscle: st.exercisePickerCreateMuscle,
      setExercisePickerCreateMuscle: (m) => this.setExercisePickerCreateMuscle(m),
      exercisePickerCreateTrackingType: st.exercisePickerCreateTrackingType,
      setExercisePickerCreateTrackingType: (t) => this.setExercisePickerCreateTrackingType(t),
      exercisePickerTrackingTypeOptions: (st.liveWorkoutTrackingTypes || []).map((t) => ({ value: t, label: TRACKING_TYPE_LABEL[t] || t })),
      createExercise: () => this.createAndAddExercise(st.exercisePickerQuery.trim(), st.exercisePickerCreateMuscle, st.exercisePickerCreateTrackingType),

      sessionRoutineName: session ? session.routineName : '',
      sessionExercises,
      sessionCancelConfirm: st.sessionCancelConfirm,
      finishSession: () => this.finishWorkoutSession(),
      requestCancelSession: () => this.requestCancelSession(),
      cancelSessionCancel: () => this.cancelSessionCancel(),
      discardSession: () => this.discardWorkoutSession(),

      historyRoutineName: historyRoutine ? historyRoutine.name : '',
      historySessions,
      historyLoading: st.workoutsView === 'history' && st.liveWorkoutHistory === null,
      backFromWorkoutHistory: () => this.backFromWorkoutHistory(),

      // code
      codeConnected: !!getConnection(),
      codeMsgs: st.codeChat.map(m => ({ text: m.text, tag: m.who === 'claude' ? '» CLAUDE' : m.who === 'system' ? '» SYSTEM' : '» YOU', tagStyle: { color: m.who === 'claude' ? '#d8b573' : m.who === 'system' ? '#c96f6f' : 'rgba(236,229,218,.5)', fontWeight: 500 } })),
      codeBusy: st.codeBusy,
      codeInput: st.codeInput,
      setCodeInput: (e) => this.setState({ codeInput: e.target.value }),
      codeKey: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.doCode(); } },
      sendCode: () => this.doCode(),
      codeWorkspace: st.codeWorkspace,
      setCodeWorkspace: (w) => this.setCodeWorkspace(w),
      codeModel: st.codeModel,
      setCodeModel: (e) => this.setState({ codeModel: e.target.value }),
      codeModelOptions: [
        { value: 'sonnet', label: 'Sonnet 5' },
        { value: 'opus', label: 'Opus 4.8' },
        { value: 'fable', label: 'Fable 5' },
        { value: 'haiku', label: 'Haiku 4.5' },
      ],
      codeSessionActive: !!st.codeSessionId,
      newCodeSession: () => this.newClaudeCodeSession(),

      // notes
      notesHeaderLabel: usingLiveNotes ? `${st.liveNotes.length} NOTES · LIVE FROM OBSIDIAN` : '186 NOTES · DEMO DATA',
      noteQuery: st.noteQuery,
      setNoteQuery: (e) => this.setState({ noteQuery: e.target.value }),
      noteFilters: noteFilters.map(f => ({ label: f, go: () => this.setState({ noteType: f }), style: nchip(st.noteType === f) })),
      noteList,
      openNoteTitle: usingLiveNotes ? (liveDetail?.title ?? (allNotesNorm.find(n => n.id === st.openNoteId)?.title || 'Loading…')) : on.title,
      openNoteType: (usingLiveNotes ? (liveDetail?.type || '').toUpperCase() : on.type) + ' · OBSIDIAN',
      openNoteTypeColor: usingLiveNotes ? (NOTE_TYPE_COLOR[(liveDetail?.type || '').toLowerCase()] || '#ece5da') : on.color,
      openNoteMeta: usingLiveNotes ? (liveDetail ? `${liveDetail.date.slice(0, 10).toUpperCase()} · ${liveDetail.backlinks} BACKLINKS` : '') : on.date.toUpperCase(),
      openNoteUrl: usingLiveNotes ? (liveDetail?.url || null) : null,
      openNoteParas: usingLiveNotes ? (liveDetail ? liveDetail.paragraphs.map(p => ({ text: p })) : [{ text: 'Loading…' }]) : on.paras.map(p => ({ text: p })),
      openNoteLinks: usingLiveNotes
        ? (liveDetail?.links || []).map(l => ({ label: l.label, go: () => this.selectNote(l.id) }))
        : on.links.map(l => ({ label: l, go: () => {
            const t = noteByTitle(l);
            if (t) this.setState({ openNoteId: t.id });
            else if (/bowl|oats|parfait|chili/i.test(l)) { const rr = this.recipes.find(x => l.toLowerCase().includes(x.name.split(' ')[0].toLowerCase())); if (rr) this.setState({ screen: 'recipes', openRecipeId: rr.id, servings: 1, recipeChat: [] }); }
            else if (/push|wk6/i.test(l)) this.setState({ screen: 'workouts' });
            else this.toastMsg('Linked note opens once that part of the vault is synced');
          } })),

      // journal
      journalHeaderLabel: usingLiveNotes ? `${journalDays.length} DAY${journalDays.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
      journalComposerText: st.journalComposerText,
      setJournalComposerText: (e) => this.setJournalComposerText(e),
      journalSaveBusy: st.journalSaveBusy,
      journalSaveError: st.journalSaveError,
      submitJournalEntry: () => this.submitJournalEntry(),
      journalPromptBusy: st.journalPromptBusy,
      journalPromptText: st.journalPromptText,
      generateJournalPrompt: () => this.generateJournalPrompt(),
      journalDays,

      // settings
      isSettings: st.screen === 'settings',
      wrapSettings: mob ? mp : { padding: '28px 40px 44px' },
      settingsBaseUrl: st.settingsBaseUrl,
      setSettingsBaseUrl: (e) => this.setState({ settingsBaseUrl: e.target.value }),
      settingsToken: st.settingsToken,
      setSettingsToken: (e) => this.setState({ settingsToken: e.target.value }),
      settingsTestStatus: st.settingsTestStatus,
      settingsTestMessage: st.settingsTestMessage,
      testSettingsConnection: () => this.testSettingsConnection(),
      saveSettingsConnection: () => this.saveSettingsConnection(),
      disconnectSettings: () => this.disconnectSettings(),
      connectionActive: usingLiveNotes,

      // ingest
      ingestModalOpen: st.ingestModalOpen,
      openIngestModal: () => this.openIngestModal(),
      closeIngestModal: () => this.closeIngestModal(),
      ingestText: st.ingestText,
      setIngestText: (e) => this.setState({ ingestText: e.target.value }),
      ingestSourceUrl: st.ingestSourceUrl,
      setIngestSourceUrl: (e) => this.setState({ ingestSourceUrl: e.target.value }),
      onIngestFile: (e) => this.onIngestFile(e),
      submitIngest: () => this.submitIngest(),
      ingestStatus: st.ingestStatus,
      ingestPreview: st.ingestPreview,
      ingestError: st.ingestError,
      closeIngestReview: () => this.closeIngestReview(),
      approveIngest: () => this.approveIngest(),
      discardIngest: () => this.discardIngest(),

      // palette
      paletteOpen: st.paletteOpen,
      paletteRef: this.paletteRef,
      paletteQuery: st.paletteQuery,
      setPaletteQuery: (e) => this.setState({ paletteQuery: e.target.value }),
      paletteKeyDown: (e) => { if (e.key === 'Enter' && paletteResults[0]) paletteResults[0].run(); },
      paletteResults,
      closePalette: () => this.setState({ paletteOpen: false }),

      // toast
      toastOn: !!st.toast, toast: st.toast,
    };
  }

  doOrb() {
    const q = this.state.orbInput.trim(); if (!q) return;
    this.setState(s => ({ orbChat: [...s.orbChat, { who: 'you', text: q }], orbInput: '' }));
    setTimeout(() => this.typeIn('orbChat', 'nova', this.orbReply(q)), 480);
  }
  doCoach(preset) {
    const q = (preset || this.state.coachInput).trim(); if (!q) return;
    this.setState(s => ({ coachChat: [...s.coachChat, { who: 'you', text: q }], coachInput: '' }));
    const r = this.coachReply(q);
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
      this.codeJobPollIv = setInterval(() => this.pollClaudeCodeJob(jobId), 2000);
    }).catch((e) => {
      this.setState(s => ({ codeBusy: false, codeChat: [...s.codeChat, { who: 'system', text: 'Error: ' + e.message }] }));
    });
  }
  pollClaudeCodeJob(jobId) {
    const conn = getConnection();
    if (!conn) return;
    api.claudeCodeJob(conn, jobId).then((job) => {
      if (job.status === 'ready') {
        clearInterval(this.codeJobPollIv);
        this.setState(s => ({ codeBusy: false, codeSessionId: job.result.sessionId, codeChat: [...s.codeChat, { who: 'claude', text: job.result.text }] }));
      } else if (job.status === 'error') {
        clearInterval(this.codeJobPollIv);
        this.setState(s => ({ codeBusy: false, codeChat: [...s.codeChat, { who: 'system', text: 'Error: ' + job.error }] }));
      }
    }).catch(() => {});
  }
  setCodeWorkspace(workspace) {
    clearInterval(this.codeJobPollIv);
    this.setState({ codeWorkspace: workspace, codeSessionId: null, codeChat: [], codeBusy: false });
  }
  newClaudeCodeSession() {
    clearInterval(this.codeJobPollIv);
    this.setState({ codeSessionId: null, codeChat: [], codeBusy: false });
  }
  doRecipeAsk() {
    const q = this.state.recipeInput.trim(); if (!q) return;
    const r = this.recipes.find(x => x.id === this.state.openRecipeId); if (!r) return;
    this.setState(s => ({ recipeChat: [...s.recipeChat, { who: 'you', text: q }], recipeInput: '' }));
    setTimeout(() => this.typeIn('recipeChat', 'nova', this.recipeReply(q, r)), 480);
  }

  render() {
    const v = this.renderVals();
    return (
      <div style={css("position:relative;min-height:100vh;color:#ece5da;background:radial-gradient(1400px 760px at 76% -14%, var(--bg2) 0%, var(--bg1) 44%, var(--bg0) 100%)")}>
        <div style={css("position:fixed;inset:0;pointer-events:none;background-image:radial-gradient(1.5px 1.5px at 110px 90px, rgba(236,229,218,.32), transparent 100%),radial-gradient(1px 1px at 320px 40px, rgba(236,229,218,.22), transparent 100%),radial-gradient(1.5px 1.5px at 520px 150px, rgba(216,181,115,.28), transparent 100%),radial-gradient(1px 1px at 640px 70px, rgba(236,229,218,.26), transparent 100%),radial-gradient(1px 1px at 790px 210px, rgba(107,229,245,.3), transparent 100%),radial-gradient(1.5px 1.5px at 850px 50px, rgba(236,229,218,.24), transparent 100%),radial-gradient(1px 1px at 420px 260px, rgba(236,229,218,.16), transparent 100%),radial-gradient(1px 1px at 180px 330px, rgba(138,106,209,.28), transparent 100%);background-size:920px 460px")}></div>
        <div style={css("position:fixed;inset:-22%;pointer-events:none;background:radial-gradient(900px 520px at 70% 8%, rgba(138,106,209,.13), transparent 62%),radial-gradient(720px 440px at 18% 82%, rgba(107,229,245,.06), transparent 60%),radial-gradient(820px 520px at 88% 78%, rgba(216,181,115,.05), transparent 60%);animation:auroraDrift 26s ease-in-out infinite alternate")}></div>

        <div style={css("position:relative;display:flex;height:100vh")}>
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

        {v.isMobile && <MobileChrome v={v} />}
        {v.recipeOpen && <RecipeOverlay v={v} />}
        {v.recipeAddOpen && <AddRecipeModal v={v} />}
        {v.paletteOpen && <CommandPalette v={v} />}
        {v.ingestModalOpen && <IngestModal v={v} />}
        {v.ingestStatus !== 'idle' && <IngestReview v={v} />}
        {v.toastOn && <Toast v={v} />}
        {v.showBoot && <Boot />}
      </div>
    );
  }
}

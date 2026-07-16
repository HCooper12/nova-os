const STORAGE_KEY = 'novaos.connection';

export function getConnection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const conn = JSON.parse(raw);
    return conn?.baseUrl && conn?.token ? conn : null;
  } catch {
    return null;
  }
}

export function setConnection(conn) {
  if (!conn) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
}

function baseOf(conn) {
  return conn.baseUrl.replace(/\/$/, '');
}

async function call(conn, path) {
  const res = await fetch(baseOf(conn) + path, {
    headers: { Authorization: `Bearer ${conn.token}` },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function post(conn, path, body) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

async function put(conn, path, body) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

async function del(conn, path) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${conn.token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function testConnection(baseUrl, token) {
  const base = baseUrl.replace(/\/$/, '');
  const health = await fetch(base + '/api/health');
  if (!health.ok) throw new Error('server unreachable');
  const notes = await fetch(base + '/api/notes', { headers: { Authorization: `Bearer ${token}` } });
  if (notes.status === 401) throw new Error('token rejected');
  if (!notes.ok) throw new Error(`vault read failed: ${notes.status}`);
  const data = await notes.json();
  return { noteCount: data.notes.length };
}

export const api = {
  notes: (conn) => call(conn, '/api/notes'),
  noteDetail: (conn, id) => call(conn, `/api/notes/detail?id=${encodeURIComponent(id)}`),
  startNoteSummary: (conn, id) => post(conn, '/api/notes/summary', { id }),
  noteSummaryJob: (conn, jobId) => call(conn, `/api/notes/summary/${encodeURIComponent(jobId)}`),
  activity: (conn) => call(conn, '/api/activity'),
  recipes: (conn) => call(conn, '/api/recipes'),
  addRecipe: (conn, recipe) => post(conn, '/api/recipes', recipe),
  scanRecipe: (conn, images) => post(conn, '/api/recipes/scan', { images }),
  scanRecipeJob: (conn, jobId) => call(conn, `/api/recipes/scan/${encodeURIComponent(jobId)}`),
  tweakRecipe: (conn, id, request) => post(conn, `/api/recipes/${encodeURIComponent(id)}/tweak`, { request }),
  tweakRecipeJob: (conn, jobId) => call(conn, `/api/recipes/tweak/${encodeURIComponent(jobId)}`),
  addAlternate: (conn, id, alt) => post(conn, `/api/recipes/${encodeURIComponent(id)}/alternates`, alt),
  addRecipePhoto: (conn, id, imageDataUrl) => post(conn, `/api/recipes/${encodeURIComponent(id)}/photo`, { image: imageDataUrl }),
  recipePhotoBlobUrl: async (conn, id) => {
    const res = await fetch(baseOf(conn) + `/api/recipes/${encodeURIComponent(id)}/photo`, {
      headers: { Authorization: `Bearer ${conn.token}` },
    });
    if (!res.ok) return null; // 404 (no photo yet) — not an error case
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  shoppingList: (conn) => call(conn, '/api/shopping-list'),
  addShoppingItems: (conn, items) => post(conn, '/api/shopping-list/items', { items }),
  addShoppingItemsJob: (conn, jobId) => call(conn, `/api/shopping-list/add-items/${encodeURIComponent(jobId)}`),
  toggleShoppingItem: (conn, id, checked) => post(conn, '/api/shopping-list/toggle', { id, checked }),
  confirmShoppingCompletion: (conn) => post(conn, '/api/shopping-list/confirm-completion'),
  rotation: (conn) => call(conn, '/api/rotation'),
  setRotationSlot: (conn, slot, recipeId) => post(conn, '/api/rotation', { slot, recipeId }),
  setRotationConsumed: (conn, slot, consumed) => post(conn, '/api/rotation/consume', { slot, consumed }),
  foodLog: (conn) => call(conn, '/api/food-log'),
  addFoodLogEntry: (conn, entry) => post(conn, '/api/food-log', entry),
  deleteFoodLogEntry: (conn, id) => del(conn, `/api/food-log/${encodeURIComponent(id)}`),
  startFoodScan: (conn, mode, images, note) => post(conn, '/api/food-log/scan', { mode, images, note }),
  foodScanJob: (conn, jobId) => call(conn, `/api/food-log/scan/${encodeURIComponent(jobId)}`),
  calendarToday: (conn) => call(conn, '/api/calendar/today'),
  workoutExercises: (conn) => call(conn, '/api/workouts/exercises'),
  addWorkoutExercise: (conn, name, muscleGroup, trackingType) => post(conn, '/api/workouts/exercises', { name, muscleGroup, trackingType }),
  workoutRoutines: (conn) => call(conn, '/api/workouts/routines'),
  createWorkoutRoutine: (conn, name, exercises) => post(conn, '/api/workouts/routines', { name, exercises }),
  updateWorkoutRoutine: (conn, id, patch) => put(conn, `/api/workouts/routines/${encodeURIComponent(id)}`, patch),
  deleteWorkoutRoutine: (conn, id) => del(conn, `/api/workouts/routines/${encodeURIComponent(id)}`),
  setWorkoutScheduleDay: (conn, day, routineId) => post(conn, '/api/workouts/schedule', { day, routineId }),
  workoutSessions: (conn, params) => call(conn, `/api/workouts/sessions${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  completeWorkoutSession: (conn, session) => post(conn, '/api/workouts/sessions', session),
  journalEntries: (conn, limit) => call(conn, `/api/journal/entries${limit ? '?limit=' + limit : ''}`),
  addJournalEntry: (conn, text, linkedTitle) => post(conn, '/api/journal/entries', { text, linkedTitle }),
  startJournalPrompt: (conn, seedTitle, seedExcerpt) => post(conn, '/api/journal/prompt', { seedTitle, seedExcerpt }),
  journalPromptJob: (conn, jobId) => call(conn, `/api/journal/prompt/${encodeURIComponent(jobId)}`),
  startClaudeCodeMessage: (conn, text, sessionId, model, workspace) => post(conn, '/api/claude-code/message', { text, sessionId, model, workspace }),
  claudeCodeJob: (conn, jobId) => call(conn, `/api/claude-code/message/${encodeURIComponent(jobId)}`),
  healthInsight: (conn) => call(conn, '/api/health-insight'),
  streaks: (conn) => call(conn, '/api/streaks'),
  healthData: (conn, days) => call(conn, `/api/health-data${days ? '?days=' + days : ''}`),
  startIngest: (conn, text, sourceUrl) => post(conn, '/api/ingest', { text, sourceUrl }),
  ingestJob: (conn, jobId) => call(conn, `/api/ingest/${encodeURIComponent(jobId)}`),
  approveIngest: (conn, jobId) => post(conn, `/api/ingest/${encodeURIComponent(jobId)}/approve`),
  discardIngest: (conn, jobId) => post(conn, `/api/ingest/${encodeURIComponent(jobId)}/discard`),
};

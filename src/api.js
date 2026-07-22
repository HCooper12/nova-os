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
  recall: (conn, q) => call(conn, `/api/recall?q=${encodeURIComponent(q)}`),
  learning: (conn) => call(conn, '/api/learning'),
  profile: (conn) => call(conn, '/api/profile'),
  setProfile: (conn, body) => put(conn, '/api/profile', body),
  startNoteSummary: (conn, id) => post(conn, '/api/notes/summary', { id }),
  noteSummaryJob: (conn, jobId) => call(conn, `/api/notes/summary/${encodeURIComponent(jobId)}`),
  activity: (conn) => call(conn, '/api/activity'),
  graph: (conn) => call(conn, '/api/graph'),
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
  foodHistory: (conn, days = 45) => call(conn, `/api/food-log/history?days=${days}`),
  addFoodLogEntry: (conn, entry) => post(conn, '/api/food-log', entry),
  deleteFoodLogEntry: (conn, id) => del(conn, `/api/food-log/${encodeURIComponent(id)}`),
  startFoodScan: (conn, mode, images, note) => post(conn, '/api/food-log/scan', { mode, images, note }),
  foodScanJob: (conn, jobId) => call(conn, `/api/food-log/scan/${encodeURIComponent(jobId)}`),
  lookupBarcode: (conn, code) => call(conn, `/api/food-log/barcode/${encodeURIComponent(code)}`),
  addQuickRecipe: (conn, body) => post(conn, '/api/recipes/quick', body),
  calendarToday: (conn) => call(conn, '/api/calendar/today'),
  calendars: (conn) => call(conn, '/api/calendar/calendars'),
  setHiddenCalendars: (conn, hidden) => post(conn, '/api/calendar/calendars/hidden', { hidden }),
  calendarCommand: (conn, text) => post(conn, '/api/calendar/command', { text }),
  calendarRange: (conn, days = 14) => call(conn, `/api/calendar/range?days=${days}`),
  workoutExercises: (conn) => call(conn, '/api/workouts/exercises'),
  addWorkoutExercise: (conn, name, muscleGroup, trackingType) => post(conn, '/api/workouts/exercises', { name, muscleGroup, trackingType }),
  workoutRoutines: (conn) => call(conn, '/api/workouts/routines'),
  createWorkoutRoutine: (conn, name, exercises) => post(conn, '/api/workouts/routines', { name, exercises }),
  updateWorkoutRoutine: (conn, id, patch) => put(conn, `/api/workouts/routines/${encodeURIComponent(id)}`, patch),
  deleteWorkoutRoutine: (conn, id) => del(conn, `/api/workouts/routines/${encodeURIComponent(id)}`),
  setWorkoutScheduleDay: (conn, day, routineId) => post(conn, '/api/workouts/schedule', { day, routineId }),
  workoutSessions: (conn, params) => call(conn, `/api/workouts/sessions${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  completeWorkoutSession: (conn, session) => post(conn, '/api/workouts/sessions', session),
  workoutGoals: (conn) => call(conn, '/api/workouts/goals'),
  setWorkoutGoals: (conn, body) => put(conn, '/api/workouts/goals', body),
  askCoach: (conn, question, sessionId) => post(conn, '/api/workouts/coach', { question, sessionId }),
  quickSession: (conn, minutes, note) => post(conn, '/api/workouts/quick-session', { minutes, note }),
  quickSessionPrepare: (conn, plan) => post(conn, '/api/workouts/quick-session/prepare', { plan }),
  updateWorkoutSession: (conn, id, body) => put(conn, `/api/workouts/sessions/${encodeURIComponent(id)}`, body),
  deleteWorkoutSession: (conn, id) => del(conn, `/api/workouts/sessions/${encodeURIComponent(id)}`),
  workoutCarryovers: (conn) => call(conn, '/api/workouts/carryovers'),
  addCarryover: (conn, body) => post(conn, '/api/workouts/carryovers', body),
  rescheduleCarryover: (conn, id, forDate) => post(conn, `/api/workouts/carryovers/${encodeURIComponent(id)}/reschedule`, { forDate }),
  removeCarryover: (conn, id) => del(conn, `/api/workouts/carryovers/${encodeURIComponent(id)}`),
  journalEntries: (conn, limit) => call(conn, `/api/journal/entries${limit ? '?limit=' + limit : ''}`),
  addJournalEntry: (conn, text, linkedTitle) => post(conn, '/api/journal/entries', { text, linkedTitle }),
  startJournalPrompt: (conn, seedTitle, seedExcerpt) => post(conn, '/api/journal/prompt', { seedTitle, seedExcerpt }),
  journalPromptJob: (conn, jobId) => call(conn, `/api/journal/prompt/${encodeURIComponent(jobId)}`),
  startClaudeCodeMessage: (conn, text, sessionId, model, workspace) => post(conn, '/api/claude-code/message', { text, sessionId, model, workspace }),
  claudeCodeJob: (conn, jobId) => call(conn, `/api/claude-code/message/${encodeURIComponent(jobId)}`),
  healthInsight: (conn) => call(conn, '/api/health-insight'),
  streaks: (conn) => call(conn, '/api/streaks'),
  healthData: (conn, days) => call(conn, `/api/health-data${days ? '?days=' + days : ''}`),
  saveHealthDay: (conn, date, metrics) => post(conn, '/api/health-data', { date, ...metrics }),
  startIngest: (conn, text, sourceUrl) => post(conn, '/api/ingest', { text, sourceUrl }),
  ingestJob: (conn, jobId) => call(conn, `/api/ingest/${encodeURIComponent(jobId)}`),
  approveIngest: (conn, jobId) => post(conn, `/api/ingest/${encodeURIComponent(jobId)}/approve`),
  discardIngest: (conn, jobId) => post(conn, `/api/ingest/${encodeURIComponent(jobId)}/discard`),
  inbox: (conn) => call(conn, '/api/inbox'),
  dispatchStatus: (conn) => call(conn, '/api/dispatch'),
  todoistStatus: (conn) => call(conn, '/api/todoist'),
  todoistSync: (conn) => post(conn, '/api/todoist/sync', {}),
  money: (conn, month) => call(conn, `/api/money${month ? `?month=${month}` : ''}`),
  moneyAdd: (conn, txn) => post(conn, '/api/money/transaction', txn),
  moneyRemove: (conn, id) => post(conn, `/api/money/transaction/${encodeURIComponent(id)}/remove`, {}),
  moneyCategory: (conn, id, category) => post(conn, `/api/money/transaction/${encodeURIComponent(id)}/category`, { category }),
  moneyBudget: (conn, category, amount) => post(conn, '/api/money/budget', { category, amount }),
  moneyImportRun: (conn) => post(conn, '/api/money/import/run', {}),
  moneyReport: (conn) => post(conn, '/api/money/report', {}),
  moneyScanStatement: (conn, images, note) => post(conn, '/api/money/scan-statement', { images, note }),
  moneyScanJob: (conn, jobId) => call(conn, `/api/money/scan/${encodeURIComponent(jobId)}`),
  moneyScanFile: (conn, transactions) => post(conn, '/api/money/scan-file', { transactions }),
  moneyExportUrl: (conn, fy) => `${conn.baseUrl.replace(/\/$/, '')}/api/money/export/${fy}`,
  ask: (conn, question, sessionId) => post(conn, '/api/ask', { question, sessionId }),
  research: (conn, question) => post(conn, '/api/research', { question }),
  followupDone: (conn, label, time) => post(conn, '/api/followups', { label, time }),
  studioSetStatus: (conn, id, status) => post(conn, `/api/studio/idea/${encodeURIComponent(id)}/status`, { status }),
  studioOutline: (conn, id) => post(conn, `/api/studio/idea/${encodeURIComponent(id)}/outline`, {}),
  ttsStatus: (conn) => call(conn, '/api/tts/status'),
  ttsAudio: async (conn, text, voiceId) => {
    const res = await fetch(baseOf(conn) + '/api/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const err = new Error(detail?.error || `/api/tts failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.blob();
  },
  mealPrepRun: (conn, force) => post(conn, '/api/mealprep/run', { force }),
  dailyReview: (conn) => call(conn, '/api/daily-review'),
  dailyReviewConfig: (conn, patch) => post(conn, '/api/daily-review/config', patch),
  dailyReviewRun: (conn, force) => post(conn, '/api/daily-review/run', { force }),
  guardian: (conn) => call(conn, '/api/guardian'),
  guardianRun: (conn) => post(conn, '/api/guardian/run', {}),
  guardianReport: (conn) => post(conn, '/api/guardian/report', {}),
  guardianExport: (conn) => post(conn, '/api/guardian/export', {}),
  guardianBackups: (conn) => call(conn, '/api/guardian/backups'),
  pushKey: (conn) => call(conn, '/api/push/key'),
  pushSubscribe: (conn, subscription) => post(conn, '/api/push/subscribe', { subscription }),
  pushTest: (conn) => post(conn, '/api/push/test', {}),
  guardianRestore: (conn, backup) => post(conn, '/api/guardian/restore', { backup }),
  todos: (conn) => call(conn, '/api/todos'),
  todoAdd: (conn, text, category) => post(conn, '/api/todos', { text, category }),
  todoToggle: (conn, line) => post(conn, '/api/todos/toggle', { line }),
  todoSetCategory: (conn, line, category) => post(conn, '/api/todos/category', { line, category }),
  dispatchConfig: (conn, slot, patch) => post(conn, '/api/dispatch/config', { slot, ...patch }),
  dispatchRun: (conn, slot, force) => post(conn, '/api/dispatch/run', { slot, force }),
  compost: (conn) => call(conn, '/api/compost'),
  compostRun: (conn) => post(conn, '/api/compost/run'),
  compostAccept: (conn, id) => post(conn, `/api/compost/${encodeURIComponent(id)}/accept`),
  compostDismiss: (conn, id) => post(conn, `/api/compost/${encodeURIComponent(id)}/dismiss`),
  sparStart: (conn, workspace, focus) => post(conn, '/api/claude-code/spar', { workspace, focus }),
  inboxItem: (conn, id) => call(conn, `/api/inbox/item/${encodeURIComponent(id)}`),
  inboxCapture: (conn, text, mode, source) => post(conn, '/api/inbox/capture', { text, mode, source }),
  inboxApprove: (conn, id) => post(conn, `/api/inbox/${encodeURIComponent(id)}/approve`),
  inboxDiscard: (conn, id) => post(conn, `/api/inbox/${encodeURIComponent(id)}/discard`),
  inboxUndo: (conn, id) => post(conn, `/api/inbox/${encodeURIComponent(id)}/undo`),
};

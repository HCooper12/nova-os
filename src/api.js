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

// Every request carries a timeout. Without one, a half-open TCP connection
// (routine on phone↔Tailscale network transitions) is a fetch that NEVER
// settles — and one of those used to freeze the whole sync pipeline forever
// while the chip still said LIVE. Long-poll paths pass a bigger budget.
const REQUEST_TIMEOUT_MS = 20_000;
function reqSignal(ms = REQUEST_TIMEOUT_MS) {
  try { return AbortSignal.timeout(ms); } catch { return undefined; } // older WebKit — degrade to no timeout
}

async function call(conn, path, { timeoutMs } = {}) {
  const res = await fetch(baseOf(conn) + path, {
    headers: { Authorization: `Bearer ${conn.token}` },
    signal: reqSignal(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function post(conn, path, body, { timeoutMs } = {}) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: reqSignal(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

async function put(conn, path, body, { timeoutMs } = {}) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: reqSignal(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

async function patch(conn, path, body, { timeoutMs } = {}) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: reqSignal(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

async function del(conn, path, { timeoutMs } = {}) {
  const res = await fetch(baseOf(conn) + path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${conn.token}` },
    signal: reqSignal(timeoutMs),
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
  library: (conn) => call(conn, '/api/library'),
  libraryItem: (conn, id) => call(conn, `/api/library/item?id=${encodeURIComponent(id)}`),
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
  scanRecipe: (conn, images) => post(conn, '/api/recipes/scan', { images }, { timeoutMs: 90_000 }), // photo uploads over cellular need headroom
  scanRecipeJob: (conn, jobId) => call(conn, `/api/recipes/scan/${encodeURIComponent(jobId)}`),
  editRecipe: (conn, id, body) => post(conn, `/api/recipes/${encodeURIComponent(id)}/edit`, body),
  tweakRecipe: (conn, id, request, prior, images) => post(conn, `/api/recipes/${encodeURIComponent(id)}/tweak`, { request, prior, ...(images?.length ? { images } : {}) }),
  tweakRecipeJob: (conn, jobId) => call(conn, `/api/recipes/tweak/${encodeURIComponent(jobId)}`),
  addAlternate: (conn, id, alt) => post(conn, `/api/recipes/${encodeURIComponent(id)}/alternates`, alt),
  addRecipePhoto: (conn, id, imageDataUrl) => post(conn, `/api/recipes/${encodeURIComponent(id)}/photo`, { image: imageDataUrl }, { timeoutMs: 90_000 }),
  recipePhotoBlobUrl: async (conn, id) => {
    const res = await fetch(baseOf(conn) + `/api/recipes/${encodeURIComponent(id)}/photo`, {
      headers: { Authorization: `Bearer ${conn.token}` },
    });
    if (!res.ok) return null; // 404 (no photo yet) — not an error case
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  bookCoverBlobUrl: async (conn, title, author) => {
    const q = new URLSearchParams({ title: title || '' });
    if (author) q.set('author', author);
    const res = await fetch(baseOf(conn) + `/api/library/cover?${q}`, { headers: { Authorization: `Bearer ${conn.token}` } });
    if (!res.ok) return null; // no jacket — the generated cover stands
    return URL.createObjectURL(await res.blob());
  },
  shoppingList: (conn) => call(conn, '/api/shopping-list'),
  stash: (conn) => call(conn, '/api/stash'),
  stashAdd: (conn, item) => post(conn, '/api/stash/items', item),
  stashRemove: (conn, raw) => post(conn, '/api/stash/items/remove', { raw }),
  renameCurrentVersion: (conn, recipeId, label) => post(conn, `/api/recipes/${encodeURIComponent(recipeId)}/rename-current`, { label }),
  renameAlternate: (conn, recipeId, altId, label) => post(conn, `/api/recipes/${encodeURIComponent(recipeId)}/alternates/rename`, { altId, label }),
  describeFood: (conn, text) => post(conn, '/api/food-log/describe', { text }),
  addShoppingItems: (conn, items) => post(conn, '/api/shopping-list/items', { items }),
  addShoppingItemsJob: (conn, jobId) => call(conn, `/api/shopping-list/add-items/${encodeURIComponent(jobId)}`),
  toggleShoppingItem: (conn, id, checked) => post(conn, '/api/shopping-list/toggle', { id, checked }),
  confirmShoppingCompletion: (conn) => post(conn, '/api/shopping-list/confirm-completion'),
  // A book he owns: the FILE goes up as bytes (EPUB/PDF are binary — reading
  // them as text destroys them), and the server extracts and weaves it.
  uploadBookFile: async (conn, file, { title, author } = {}) => {
    const q = new URLSearchParams({ filename: file.name });
    if (title) q.set('title', title);
    if (author) q.set('author', author);
    // baseOf(conn), NOT conn.url — conn has no `url` property. The undefined
    // interpolated into a RELATIVE path, so every book upload was POSTed to
    // the app's own origin (GitHub Pages) instead of his server: an instant
    // 404-shaped failure with nothing in the server log, on every attempt,
    // since the day this shipped.
    let res;
    try {
      res = await fetch(`${baseOf(conn)}/api/ingest/book-file?${q}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/octet-stream' },
        body: file,
      });
    } catch (err) {
      // A rejected fetch has no status and a useless message ("Failed to
      // fetch"). Say where the upload was going — a blocked request and a
      // down server read identically without it.
      throw new Error(`the upload never left the browser (${err.message}) — Nova at ${baseOf(conn)} was never reached. Check Settings → connection, then pick the file again.`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `upload failed (${res.status})`);
    return data;
  },
  setShoppingQty: (conn, id, qty) => post(conn, '/api/shopping-list/qty', { id, qty }),
  clearShoppingList: (conn) => post(conn, '/api/shopping-list/clear'),
  restoreShoppingList: (conn, items) => post(conn, '/api/shopping-list/restore', { items }),
  rotation: (conn) => call(conn, '/api/rotation'),
  setRotationSlot: (conn, slot, recipeId) => post(conn, '/api/rotation', { slot, recipeId }),
  setRotationVariant: (conn, slot, altId) => post(conn, '/api/rotation/variant', { slot, altId }),
  promoteRecipeAlternate: (conn, id, altId) => post(conn, `/api/recipes/${encodeURIComponent(id)}/promote`, { altId }),
  setRotationConsumed: (conn, slot, consumed) => post(conn, '/api/rotation/consume', { slot, consumed }),
  foodLog: (conn, date) => call(conn, `/api/food-log${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  nutritionMonth: (conn) => call(conn, '/api/nutrition-month'),
  nutritionWeek: (conn) => call(conn, '/api/nutrition-week'),
  deleteRecipe: (conn, id) => del(conn, `/api/recipes/${encodeURIComponent(id)}`),
  foodHistory: (conn, days = 45) => call(conn, `/api/food-log/history?days=${days}`),
  addFoodLogEntry: (conn, entry) => post(conn, '/api/food-log', entry),
  editFoodLogEntry: (conn, id, body) => patch(conn, `/api/food-log/${encodeURIComponent(id)}`, body),
  deleteFoodLogEntry: (conn, id, date) => del(conn, `/api/food-log/${encodeURIComponent(id)}${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  startFoodScan: (conn, mode, images, note) => post(conn, '/api/food-log/scan', { mode, images, note }, { timeoutMs: 90_000 }),
  foodScanJob: (conn, jobId) => call(conn, `/api/food-log/scan/${encodeURIComponent(jobId)}`),
  lookupBarcode: (conn, code) => call(conn, `/api/food-log/barcode/${encodeURIComponent(code)}`),
  addQuickRecipe: (conn, body) => post(conn, '/api/recipes/quick', body),
  // opts pass-through: the post-snapshot straggler fetch needs a longer
  // timeout (a genuinely cold CalDAV read can run past the 20s default)
  calendarToday: (conn, opts) => call(conn, '/api/calendar/today', opts),
  calendars: (conn) => call(conn, '/api/calendar/calendars'),
  setHiddenCalendars: (conn, hidden) => post(conn, '/api/calendar/calendars/hidden', { hidden }),
  // 60s: interpretation spawns the CLI and measured ~18s on a real request —
  // the 20s default aborted it at 19.9s and the ask silently did nothing
  calendarCommand: (conn, text) => post(conn, '/api/calendar/command', { text }, { timeoutMs: 60_000 }),
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
  askCoach: (conn, question, sessionId, liveSession) => post(conn, '/api/workouts/coach', { question, sessionId, liveSession }),
  quickSession: (conn, minutes, note) => post(conn, '/api/workouts/quick-session', { minutes, note }),
  quickSessionPrepare: (conn, plan) => post(conn, '/api/workouts/quick-session/prepare', { plan }),
  updateWorkoutSession: (conn, id, body) => put(conn, `/api/workouts/sessions/${encodeURIComponent(id)}`, body),
  deleteWorkoutSession: (conn, id) => del(conn, `/api/workouts/sessions/${encodeURIComponent(id)}`),
  // `only` narrows the sync to named slices — used by the targeted resync a
  // tagged write nudge triggers. Omit it for the full sync.
  coachApply: (conn, body) => post(conn, '/api/workouts/coach-apply', body),
  coachApplyJob: (conn, jobId) => call(conn, `/api/workouts/coach-apply/${encodeURIComponent(jobId)}`),
  snapshot: (conn, { only } = {}) => call(
    conn,
    only?.length ? `/api/snapshot?only=${encodeURIComponent(only.join(','))}` : '/api/snapshot',
    { timeoutMs: 30_000 },
  ),
  getInboxConfig: (conn) => call(conn, '/api/inbox-config'),
  setInboxConfigMode: (conn, mode) => put(conn, '/api/inbox-config', { mode }),
  // the model board — one lane per write, so a toggle never rewrites a model
  modelPrefs: (conn) => call(conn, '/api/model-prefs'),
  setModelLane: (conn, lane, patch) => put(conn, '/api/model-prefs', { lane, ...patch }),
  resetModelLane: (conn, lane) => post(conn, '/api/model-prefs/reset', lane ? { lane } : {}),
  saveSessionDraft: (conn, body) => put(conn, '/api/workouts/session-draft', body),
  getSessionDraft: (conn) => call(conn, '/api/workouts/session-draft'),
  clearSessionDraft: (conn) => del(conn, '/api/workouts/session-draft'),
  getDiscardedDraft: (conn) => call(conn, '/api/workouts/session-draft/discarded'),
  restoreDiscardedDraft: (conn) => post(conn, '/api/workouts/session-draft/restore'),
  workoutCarryovers: (conn) => call(conn, '/api/workouts/carryovers'),
  addCarryover: (conn, body) => post(conn, '/api/workouts/carryovers', body),
  rescheduleCarryover: (conn, id, forDate) => post(conn, `/api/workouts/carryovers/${encodeURIComponent(id)}/reschedule`, { forDate }),
  removeCarryover: (conn, id) => del(conn, `/api/workouts/carryovers/${encodeURIComponent(id)}`),
  journalEntries: (conn, limit) => call(conn, `/api/journal/entries${limit ? '?limit=' + limit : ''}`),
  addJournalEntry: (conn, text, linkedTitle, opts = {}) => post(conn, '/api/journal/entries', { text, linkedTitle, ...opts }),
  startJournalPrompt: (conn, seedTitle, seedExcerpt) => post(conn, '/api/journal/prompt', { seedTitle, seedExcerpt }),
  journalPromptJob: (conn, jobId) => call(conn, `/api/journal/prompt/${encodeURIComponent(jobId)}`),
  startClaudeCodeMessage: (conn, text, sessionId, model, workspace) => post(conn, '/api/claude-code/message', { text, sessionId, model, workspace }),
  claudeCodeJob: (conn, jobId) => call(conn, `/api/claude-code/message/${encodeURIComponent(jobId)}`),
  // the Leader — leadership development: daily idea, chat, reflection intake
  leader: (conn) => call(conn, '/api/leader'),
  leaderRun: (conn, kind, force) => post(conn, '/api/leader/run', { kind, force }),
  askLeader: (conn, question, sessionId) => post(conn, '/api/leader/chat', { question, sessionId }),
  healthInsight: (conn) => call(conn, '/api/health-insight'),
  streaks: (conn) => call(conn, '/api/streaks'),
  healthData: (conn, days) => call(conn, `/api/health-data${days ? '?days=' + days : ''}`),
  // manual:true marks a HUMAN edit — exempt from the past-day steps guard
  // that blocks unfiltered Shortcut re-pushes from clobbering settled days
  saveHealthDay: (conn, date, metrics) => post(conn, '/api/health-data', { date, ...metrics, manual: true }),
  startIngest: (conn, text, sourceUrl, book) => post(conn, '/api/ingest', { text, sourceUrl, ...(book ? { book } : {}) }),
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
  // fired the moment the mic opens, before a question exists — boots the
  // conversation's process (and a cold session's context) while he talks.
  // Failure is silently fine: it only ever costs him latency, never an answer.
  prewarmAsk: (conn, sessionId) => post(conn, '/api/ask/prewarm', { sessionId }).catch(() => null),
  trainOverview: (conn) => call(conn, '/api/train/overview'),
  fuelCross: (conn) => call(conn, '/api/train/fuel-cross'),
  codeChanges: (conn, workspace) => call(conn, `/api/claude-code/changes?workspace=${encodeURIComponent(workspace || 'repo')}`),
  codeCommit: (conn, workspace, message) => post(conn, '/api/claude-code/commit', { workspace, message }),
  codeShelve: (conn, workspace) => post(conn, '/api/claude-code/shelve', { workspace }),
  codeUnshelve: (conn, workspace) => post(conn, '/api/claude-code/unshelve', { workspace }),
  verdict: (conn, kind, of) => call(conn, `/api/verdict/${encodeURIComponent(kind)}${of ? `?of=${encodeURIComponent(of)}` : ''}`),
  sendIntent: (conn, text, lane) => post(conn, '/api/intent', lane ? { text, lane } : { text }),
  // 60s: the brief reads health, calendar (CalDAV), the vault and the rails.
  // At the 20s default it aborted mid-compose and the morning brief silently
  // never arrived — observed in the harness, ERR_ABORTED on /api/show.
  glassToday: (conn) => call(conn, '/api/glass/today'),
  show: (conn, variant) => post(conn, '/api/show', { variant }, { timeoutMs: 60_000 }),
  greet: (conn, gap) => post(conn, '/api/greet', { gap }),
  askRitual: (conn, kind, sessionId) => post(conn, '/api/ask/ritual', { kind, sessionId }),
  overnight: (conn) => call(conn, '/api/overnight'),
  overnightAdd: (conn, question) => post(conn, '/api/overnight', { question }),
  overnightAddOutline: (conn, ideaId) => post(conn, '/api/overnight', { kind: 'outline', ideaId }),
  overnightRemove: (conn, id) => post(conn, '/api/overnight/remove', { id }),
  overnightRun: (conn) => post(conn, '/api/overnight/run'),
  // model: the model-choice gate's answer ('opus'/'sonnet') — omitted, the
  // lane's own standing default runs, same as always.
  research: (conn, question, model) => post(conn, '/api/research', { question, model }),
  videoWatch: (conn, text, model) => post(conn, '/api/video', { text, model }),
  // the gate already has url/question split (a voice directive, a played
  // offer) — this skips the text-sniffing /api/video does for the other form
  videoWatchDirect: (conn, url, question, model) => post(conn, '/api/video', { url, question, model }),
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
  inboxDiscard: (conn, id, reason) => post(conn, `/api/inbox/${encodeURIComponent(id)}/discard`, reason ? { reason } : undefined),
  inboxRetry: (conn, id) => post(conn, `/api/inbox/${encodeURIComponent(id)}/retry`),
  // the scheduled-lane half of the model-choice gate (Pattern Scout, Distill)
  inboxModelChoice: (conn, id, model) => post(conn, `/api/inbox/${encodeURIComponent(id)}/model-choice`, { model }),
  inboxUndo: (conn, id) => post(conn, `/api/inbox/${encodeURIComponent(id)}/undo`),
};

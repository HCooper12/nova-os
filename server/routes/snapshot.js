import { Router } from 'express';

// One round-trip for the whole sync pass. The client used to fire ~25
// requests per sync (every open, every 5 min, every SSE nudge) — over
// phone↔Tailscale that's real latency and battery. Duplicating every route's
// response-building here would be the "parallel rail" anti-pattern (shapes
// had already diverged on the first attempt), so the snapshot SELF-PROXIES:
// it calls this server's own endpoints over localhost — the exact same
// handlers, byte-identical shapes, zero drift — and bundles the results.
// Local HTTP is ~ms per call; the client's single Tailscale round-trip is
// where the win lives.
// exported so writeSlices.js's tags can be checked against the real slice
// names in a test — a typo'd tag would silently refresh nothing
export const SLICES = {
  notes: '/api/notes',
  library: '/api/library',
  journal: '/api/journal/entries?limit=30',
  healthInsight: '/api/health-insight',
  healthData: '/api/health-data', // server default 14 — ?days=7 truncated the weight window
  streaks: '/api/streaks',
  calendar: '/api/calendar/today',
  recipes: '/api/recipes',
  rotation: '/api/rotation',
  foodLog: '/api/food-log',
  nutritionMonth: '/api/nutrition-month',
  nutritionWeek: '/api/nutrition-week',
  trainOverview: '/api/train/overview',
  fuelCross: '/api/train/fuel-cross',
  shoppingList: '/api/shopping-list',
  stash: '/api/stash',
  workoutExercises: '/api/workouts/exercises',
  workoutRoutines: '/api/workouts/routines',
  workoutGoals: '/api/workouts/goals',
  graph: '/api/graph',
  inbox: '/api/inbox',
  dispatch: '/api/dispatch',
  compost: '/api/compost',
  todoist: '/api/todoist',
  todos: '/api/todos',
  guardian: '/api/guardian',
  tts: '/api/tts/status',
  money: '/api/money',
  profile: '/api/profile',
  learning: '/api/learning',
  dailyReview: '/api/daily-review',
  ops: '/api/ops',
  opsStream: '/api/ops/stream',
  overnight: '/api/overnight',
  skills: '/api/skills',
  pulse: '/api/pulse',
  leader: '/api/leader',
};

// sentinel for a slice that lost its time-budget race — a unique object, so
// it can never be confused with a real payload
const BUDGET_MISS = Symbol('budget-miss');

export function snapshotRouter({ port, token }) {
  const router = Router();

  // One tiny payload for home-screen widgets (Scriptable on iOS): the day at
  // a glance, nothing else. Same honesty rules — absent data is null, never
  // a made-up zero.
  router.get('/widget', async (req, res) => {
    const out = { at: new Date().toISOString() };
    const pad = (n) => String(n).padStart(2, '0');
    const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
    try {
      const { loadRecentDays } = await import('../lib/healthData.js');
      const days = await loadRecentDays(3);
      const t = days.find((d) => d.date === today);
      const latest = [...days].reverse().find((d) => d.steps != null);
      out.steps = t?.steps ?? null;
      out.stepsDate = t?.steps != null ? today : (latest?.date ?? null);
      if (t?.steps == null && latest) out.steps = latest.steps;
    } catch { out.steps = null; }
    try {
      const { getToday } = await import('../lib/foodLog.js');
      const log = await getToday();
      const sum = (k) => Math.round((log.entries || []).reduce((s, e) => s + (e.macros?.[k] || 0), 0));
      out.protein = sum('p'); out.kcal = sum('kcal');
    } catch { out.protein = null; out.kcal = null; }
    try {
      const { listRecords } = await import('../lib/inboxStore.js');
      out.pending = (await listRecords()).filter((r) => r.status === 'pending').length;
    } catch { out.pending = null; }
    try {
      // today's leadership idea — a stored receipt, absent is null
      const { leadLineForWidget } = await import('../lib/leader.js');
      out.lead = await leadLineForWidget();
    } catch { out.lead = null; }
    try {
      // a widget must answer fast — a cold CalDAV fetch can take longer than
      // iOS will wait, so the calendar gets 5s or the slot is honestly null
      const { fetchEventsForRange } = await import('../lib/calendar.js');
      const nowHM = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
      const events = await Promise.race([
        fetchEventsForRange(1),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      const upcoming = (events || []).filter((e) => e.date === today && e.time && e.time >= nowHM);
      out.next = upcoming.length ? { time: upcoming[0].time, label: String(upcoming[0].label || '').slice(0, 40) } : null;
    } catch { out.next = null; }
    try {
      const { getPlanTodayStatus } = await import('../lib/planToday.js');
      const plan = await getPlanTodayStatus();
      out.top3 = (plan.today?.priorities || []).map((p) => String(p.do || '').slice(0, 60));
      out.planStatus = plan.today?.status || null;
    } catch { out.top3 = []; }
    res.json(out);
  });

  // Per-slice time budget. The whole snapshot used to wait for its slowest
  // slice — measured on the live log: p50 ~5s, p90 ~10s, all of it one
  // slice (a cold CalDAV calendar; every other slice answers in <75ms).
  // The calendar is now stale-while-revalidate so it's rarely slow, but the
  // budget makes the contract structural: a slice that can't answer in time
  // is reported in `errors` and simply absent — the client keeps its cached
  // copy (applySnapshot skips missing keys) and fetches the straggler
  // individually. The slow fetch itself is NOT aborted: it keeps running
  // here and warms the server cache for that follow-up.
  const SLICE_BUDGET_MS = 6000;
  router.get('/snapshot', async (req, res) => {
    const base = `http://127.0.0.1:${port}`;
    const headers = { Authorization: `Bearer ${token}` };
    const slices = {};
    const errors = {};
    // ?only=foodLog,fuelCross — a targeted resync after a tagged write nudge
    // (see lib/writeSlices.js). Unknown names are dropped rather than 400'd:
    // an older client asking for a slice this build no longer has should get
    // the slices it CAN have, not a failed sync. An `only` that names nothing
    // real falls back to the full set — never an empty response.
    const wanted = String(req.query.only || '').split(',').map((s) => s.trim()).filter((s) => s in SLICES);
    const chosen = wanted.length ? wanted.map((k) => [k, SLICES[k]]) : Object.entries(SLICES);
    await Promise.all(chosen.map(async ([key, path]) => {
      try {
        const work = (async () => {
          const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(15_000) });
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })();
        work.catch(() => {}); // it may lose the race — never an unhandled rejection
        const result = await Promise.race([
          work,
          new Promise((resolve) => setTimeout(() => resolve(BUDGET_MISS), SLICE_BUDGET_MS)),
        ]);
        if (result === BUDGET_MISS) errors[key] = 'budget';
        else slices[key] = result;
      } catch (e) {
        errors[key] = e.message;
      }
    }));
    res.json({ slices, errors });
  });

  return router;
}

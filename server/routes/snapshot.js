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
const SLICES = {
  notes: '/api/notes',
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
};

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

  router.get('/snapshot', async (req, res) => {
    const base = `http://127.0.0.1:${port}`;
    const headers = { Authorization: `Bearer ${token}` };
    const slices = {};
    const errors = {};
    await Promise.all(Object.entries(SLICES).map(async ([key, path]) => {
      try {
        const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`${r.status}`);
        slices[key] = await r.json();
      } catch (e) {
        errors[key] = e.message;
      }
    }));
    res.json({ slices, errors });
  });

  return router;
}

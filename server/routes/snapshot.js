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
  healthData: '/api/health-data?days=7',
  streaks: '/api/streaks',
  calendar: '/api/calendar/today',
  recipes: '/api/recipes',
  rotation: '/api/rotation',
  foodLog: '/api/food-log',
  shoppingList: '/api/shopping-list',
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
};

export function snapshotRouter({ port, token }) {
  const router = Router();

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

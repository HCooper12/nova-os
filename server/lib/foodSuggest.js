import { randomUUID } from 'node:crypto';
import { recurringFoods, normalizeName } from './foodHistory.js';
import { loadRecipeData } from './recipes.js';
import { createRecord, listRecords } from './inboxStore.js';
import { latestDeclines, respectNo } from './respectTheNo.js';

// "You've had crumpets with Duo Penotti a few times lately — save it to your
// recipe bank?" Recurring off-plan foods become inbox proposals the user
// approves (route 'recipe' → a macro-only recipe, undoable) or dismisses.
// Never re-proposes something already in the bank or already said yes to. A
// no stands 60 days, then asks ONCE more only if the habit has doubled since.
const MIN_COUNT = 3; // eaten at least three times...
const WINDOW_DAYS = 21; // ...within the last three weeks
const MAX_PER_RUN = 2; // don't flood the inbox in one pass
const DECLINE_COOLDOWN_DAYS = 60;

export async function runFoodSuggestions(vaultPath, { now = Date.now() } = {}) {
  let recipeKeys = new Set();
  try {
    const data = await loadRecipeData(vaultPath);
    recipeKeys = new Set((data.recipes || []).map((r) => normalizeName(r.name)));
  } catch { /* no recipe file yet — nothing to exclude */ }

  // A prior proposal that is pending, or that he said yes to, blocks a repeat
  // for good. A NO used to be for good too — dismissed in March, eaten daily
  // in August, permanently invisible. Now a no stands 60 days and then asks
  // ONCE more, only when the habit has doubled since (lib/respectTheNo.js).
  // A decline filed before the count rode the payload compares against the
  // bar that prompted the original ask.
  const records = await listRecords();
  const mine = records.filter((r) => r.kind === 'food-suggestion' && r.decision?.payload?.key);
  const NO = ['discarded', 'expired'];
  const settled = new Set(mine.filter((r) => !NO.includes(r.status)).map((r) => r.decision.payload.key));
  const declines = latestDeclines(mine, { statuses: NO, subjectOf: (r) => r.decision.payload.key, metricOf: (r) => r.decision.payload.count ?? MIN_COUNT });

  const exclude = new Set([...recipeKeys, ...settled]);
  const candidates = [];
  for (const it of await recurringFoods({ days: WINDOW_DAYS, minCount: MIN_COUNT, excludeKeys: exclude })) {
    const no = respectNo({ declined: declines.get(it.key), now, cooldownDays: DECLINE_COOLDOWN_DAYS, metric: it.count, materialChange: 1, maxReturns: 1 });
    if (!no.raise) continue;
    candidates.push({ ...it, history: no.history });
    if (candidates.length >= MAX_PER_RUN) break;
  }
  if (!candidates.length) return { proposed: 0, records: [] };

  const created = [];
  const { portionVariance } = await import('./foodHistory.js');
  for (const it of candidates) {
    const macros = { p: Math.round(it.macros.p), c: Math.round(it.macros.c), f: Math.round(it.macros.f), kcal: Math.round(it.macros.kcal) };
    // the numbers confess when the group disagreed — the payload stays the latest portion's
    const pv = portionVariance(it.kcals);
    const portionNote = pv.varied ? ` Portions varied across your logs (${pv.min}–${pv.max} kcal) — this saves the latest (${macros.kcal} kcal).` : '';
    const title = `Save “${it.name}” to your recipe bank?`;
    const record = {
      id: randomUUID().slice(0, 8),
      kind: 'food-suggestion',
      text: title,
      source: 'nova',
      mode: 'draft',
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'recipe',
        confidence: 'high',
        title,
        reason: `You've logged ${it.name} ${it.count} times in the last few weeks (${macros.p}P · ${macros.c}C · ${macros.f}F · ${macros.kcal} kcal). ${it.history ? `${it.history[0].toUpperCase()}${it.history.slice(1)}, so asking once more — want` : 'Want'} it saved so it's one tap next time?${portionNote}`,
        // the count rides the payload so a later run can tell "the same habit" from "twice the habit"
        payload: { key: it.key, name: it.name, category: 'ROTATION / SWAP MEALS', macros, count: it.count },
      },
    };
    await createRecord(record);
    created.push(record);
  }
  return { proposed: created.length, records: created };
}

// Evenings — once a day. `>= 18` with a per-day guard, NOT `=== 18`: an exact-
// hour equality on an hourly interval silently skips the whole day when a tick
// drifts past the hour or the server restarts (the same failure class as the
// missed health pushes). The per-item dedupe makes any extra run harmless.
let lastSuggestDate = null;
export function startFoodSuggestScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('food-suggest');
    try {
      const now = new Date();
      const today = now.toDateString();
      if (now.getHours() >= 18 && lastSuggestDate !== today) {
        lastSuggestDate = today;
        await runFoodSuggestions(vaultPath);
      }
    } catch (err) {
      console.error('food suggestions failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}

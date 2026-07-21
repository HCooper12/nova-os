import { randomUUID } from 'node:crypto';
import { recurringFoods, normalizeName } from './foodHistory.js';
import { loadRecipeData } from './recipes.js';
import { createRecord, listRecords } from './inboxStore.js';

// "You've had crumpets with Duo Penotti a few times lately — save it to your
// recipe bank?" Recurring off-plan foods become inbox proposals the user
// approves (route 'recipe' → a macro-only recipe, undoable) or dismisses.
// Never re-proposes something already in the bank or already proposed once.
const MIN_COUNT = 3; // eaten at least three times...
const WINDOW_DAYS = 21; // ...within the last three weeks
const MAX_PER_RUN = 2; // don't flood the inbox in one pass

export async function runFoodSuggestions(vaultPath) {
  let recipeKeys = new Set();
  try {
    const data = await loadRecipeData(vaultPath);
    recipeKeys = new Set((data.recipes || []).map((r) => normalizeName(r.name)));
  } catch { /* no recipe file yet — nothing to exclude */ }

  // Any prior proposal for the same item — pending, approved, or dismissed —
  // blocks a repeat, so a "no thanks" stays a no.
  const records = await listRecords();
  const proposed = new Set(
    records.filter((r) => r.kind === 'food-suggestion' && r.decision?.payload?.key).map((r) => r.decision.payload.key)
  );

  const exclude = new Set([...recipeKeys, ...proposed]);
  const candidates = (await recurringFoods({ days: WINDOW_DAYS, minCount: MIN_COUNT, excludeKeys: exclude })).slice(0, MAX_PER_RUN);
  if (!candidates.length) return { proposed: 0, records: [] };

  const created = [];
  for (const it of candidates) {
    const macros = { p: Math.round(it.macros.p), c: Math.round(it.macros.c), f: Math.round(it.macros.f), kcal: Math.round(it.macros.kcal) };
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
        reason: `You've logged ${it.name} ${it.count} times in the last few weeks (${macros.p}P · ${macros.c}C · ${macros.f}F · ${macros.kcal} kcal). Want it saved so it's one tap next time?`,
        payload: { key: it.key, name: it.name, category: 'ROTATION / SWAP MEALS', macros },
      },
    };
    await createRecord(record);
    created.push(record);
  }
  return { proposed: created.length, records: created };
}

// Evenings — once a day is plenty; the per-item dedup makes extra ticks harmless.
export function startFoodSuggestScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('food-suggest');
    try {
      if (new Date().getHours() === 18) await runFoodSuggestions(vaultPath);
    } catch (err) {
      console.error('food suggestions failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}

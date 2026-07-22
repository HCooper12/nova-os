import { randomUUID } from 'node:crypto';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { createRecord, listRecords } from './inboxStore.js';

// The meal-prep loop. Hayden's stated preference: the same meals week to
// week with little variance — so the Thursday proposal KEEPS the current
// rotation, verifies it still clears the protein floor, and drafts the
// shopping list those recipes need. Stability is the feature; the proposal
// only ever flags genuine problems (floor shortfall, empty slots).

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(now, weeksBack = 0) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - weeksBack * 7);
  return d;
}

// Deterministic aisle guess for recipe ingredients — coarse on purpose;
// wrong guesses are a drag-free fix on the Shopping screen.
const AISLE = [
  ['Meat & Protein', ['chicken', 'beef', 'mince', 'steak', 'pork', 'lamb', 'salmon', 'tuna', 'fish', 'prawn', 'turkey', 'bacon', 'ham', 'tofu', 'protein powder']],
  ['Dairy & Eggs', ['milk', 'cheese', 'yoghurt', 'yogurt', 'butter', 'cream', 'egg']],
  ['Produce', ['onion', 'garlic', 'tomato', 'capsicum', 'spinach', 'lettuce', 'broccoli', 'carrot', 'potato', 'sweet potato', 'avocado', 'banana', 'apple', 'berr', 'lemon', 'lime', 'cucumber', 'zucchini', 'mushroom', 'ginger', 'chilli', 'herbs', 'coriander', 'parsley', 'basil']],
  ['Frozen', ['frozen']],
  ['Bakery', ['bread', 'wrap', 'tortilla', 'roll', 'bun']],
  ['Beverages', ['juice', 'coffee', 'tea ', 'soda', 'water']],
  ['Pantry & Seasonings', ['rice', 'pasta', 'oats', 'flour', 'sugar', 'oil', 'sauce', 'paste', 'stock', 'spice', 'salt', 'pepper', 'cumin', 'paprika', 'oregano', 'honey', 'vinegar', 'soy', 'beans', 'lentil', 'chickpea', 'tin', 'can ', 'nut', 'seed']],
];

export function aisleFor(ingredient) {
  const t = (ingredient || '').toLowerCase();
  for (const [category, words] of AISLE) {
    if (words.some((w) => t.includes(w))) return category;
  }
  return 'Household & Other';
}

// Strip quantities so the list reads as shopping items, not recipe lines
// ("200g chicken breast" → "chicken breast"), and dedupe across recipes.
export function toShoppingItems(ingredientLines) {
  const seen = new Set();
  const items = [];
  for (const line of ingredientLines) {
    const name = line
      .replace(/^[\d/.,]+\s*(g|kg|ml|l|cup|cups|tbsp|tsp|x|slice|slices|clove|cloves|tin|tins|can|cans)?\.?\s*(of\s+)?/i, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name: name[0].toUpperCase() + name.slice(1), category: aisleFor(name) });
  }
  return items;
}

export async function composeMealPrep(vaultPath) {
  const { recipes, profile } = await loadRecipeData(vaultPath);
  const rotation = await loadRotation(vaultPath, recipes);
  const slots = Object.entries(rotation.slots || rotation.resolved || {}).filter(([, v]) => v);
  const slotList = slots.map(([slot, r]) => `${slot}: ${r.name}`).join(' · ');
  const recipeIds = new Set(slots.map(([, r]) => r.id));
  const chosen = recipes.filter((r) => recipeIds.has(r.id));

  const floor = profile?.proteinFloorG || null;
  const planned = Math.round(rotation.totals?.p || 0);
  const lines = [];
  if (!chosen.length) {
    lines.push('The rotation has no meals set — pick recipes on the Recipes screen and re-run.');
  } else {
    lines.push(`Keeping this week's plan (your call: same meals, little variance): ${slotList}.`);
    if (floor) {
      lines.push(planned >= floor
        ? `Protein plan: ${planned}g against the ${floor}g floor ✓`
        : `⚠ Protein plan: ${planned}g against the ${floor}g floor — ${floor - planned}g SHORT. Worth swapping one slot up.`);
    }
  }

  // What he ACTUALLY ate (the sweep: meal prep re-proposed the rotation with
  // no view of reality). Recurring off-plan foods are worth stocking for;
  // floor adherence says whether the plan is even being executed.
  try {
    const { recurringFoods } = await import('./foodHistory.js');
    const recurring = (await recurringFoods({ days: 21, minCount: 2 })).slice(0, 3);
    if (recurring.length) {
      lines.push(`Off-plan regulars (worth stocking for): ${recurring.map((r) => `${r.name} ×${r.count}`).join(' · ')}.`);
    }
  } catch { /* optional */ }
  try {
    const { loadRecentDays: loadNutrition } = await import('./nutritionLog.js');
    const week = await loadNutrition(7);
    const tracked = week.filter((d) => d.floorMet != null);
    if (tracked.length >= 3) {
      const met = tracked.filter((d) => d.floorMet).length;
      if (met < tracked.length) lines.push(`Reality check: floor met ${met}/${tracked.length} tracked days last week — the plan only works when the slots get eaten.`);
    }
  } catch { /* optional */ }
  // the week being shopped for — travel/busy days change what's worth prepping
  try {
    const { fetchEventsForRange } = await import('./calendar.js');
    const events = await fetchEventsForRange(7);
    const byDate = new Map();
    for (const e of events) byDate.set(e.date, (byDate.get(e.date) || 0) + 1);
    const heavy = [...byDate.entries()].filter(([, n]) => n >= 5).map(([d]) => d);
    if (heavy.length) lines.push(`Heavy calendar day${heavy.length === 1 ? '' : 's'} ahead (${heavy.join(', ')}) — grab-and-go portions matter there.`);
  } catch { /* optional */ }

  const items = toShoppingItems(chosen.flatMap((r) => r.ingredients || []));
  return { lines, items, slotCount: chosen.length, planned, floor };
}

async function recordExistsThisWeek() {
  const items = await listRecords();
  const since = todayISO(mondayOf(new Date()));
  return items.some((r) => r.kind === 'meal-prep' && r.createdAt && todayISO(new Date(r.createdAt)) >= since);
}

export async function runMealPrep(vaultPath, { force = false } = {}) {
  if (!force && (await recordExistsThisWeek())) return { skipped: true };
  const { lines, items, slotCount } = await composeMealPrep(vaultPath);
  if (!slotCount) return { skipped: true, reason: 'rotation empty' };

  const weekLong = mondayOf(new Date(), -1).toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
  const title = `Meal prep — week of ${weekLong}`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'meal-prep',
    text: title,
    source: 'nova',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'shopping',
      confidence: 'high',
      title,
      reason: lines.join(' '),
      payload: { items },
    },
  };
  await createRecord(record);
  return { record };
}

// Thursdays from 17:00 — early enough to shop before the week turns over.
export function startMealPrepScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('mealprep');
    try {
      const now = new Date();
      if (now.getDay() === 4 && now.getHours() >= 17) await runMealPrep(vaultPath);
    } catch (err) {
      console.error('meal prep failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}

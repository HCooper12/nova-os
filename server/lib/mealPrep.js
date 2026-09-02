import { randomUUID } from 'node:crypto';
import { splitAmount } from './shoppingList.js';
import { laneSkipped } from './modelPrefs.js';
import { mondayOf } from './cadence.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { createRecord, listRecords } from './inboxStore.js';
import { weeklyWindowOpen } from './cadence.js';

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

// Deterministic aisle guess for recipe ingredients — coarse on purpose;
// wrong guesses are a drag-free fix on the Shopping screen.
// pinned to shoppingList's SHOPPING_CATEGORIES by test — an aisle name the
// list does not know would file an ingredient under a heading it never renders
export const AISLE = [
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
// QUANTITIES, GATED BY HONESTY. His recipe lines carry a leading amount 78%
// of the time (replayed 3 Sep: 149 of 190 lines; the rest are "to taste"
// spices and section headings). The same ingredient across chosen recipes
// is summed ONLY when every occurrence carries an amount in the same unit —
// "1kg" + "500g" → "1.5kg", "10 slices" + "2 slices" → "12 slices". Mixed
// units, a missing amount on one line, or a "2 x 250g" pack form → no
// number at all, because a wrong quantity is worse than none. A single
// occurrence keeps its amount verbatim. Amounts ride the shopping list's own
// `amount` field (shoppingList.splitAmount is the contract), which the
// meal-prep list used to strip.
const SUMMABLE = /^(\d+(?:\.\d+)?)\s*(kg|g|ml|l|slices?|cloves?|cans?|tins?|rashers?|fillets?)?$/i;
const BASE_UNIT = { kg: ['g', 1000], g: ['g', 1], l: ['ml', 1000], ml: ['ml', 1] };
function parseAmount(amount) {
  const m = SUMMABLE.exec(String(amount || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || '').toLowerCase().replace(/s$/, '');
  if (!unit) return { n, unit: '', base: '' };
  const conv = BASE_UNIT[unit];
  return conv ? { n: n * conv[1], unit: conv[0], base: conv[0] } : { n, unit, base: unit };
}
function renderAmount(total, unit) {
  if (unit === 'g') return total >= 1000 ? `~${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 1)}kg` : `${Math.round(total)}g`;
  if (unit === 'ml') return total >= 1000 ? `~${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 1)}L` : `${Math.round(total)}ml`;
  if (!unit) return String(total);
  return `${total} ${unit}${total === 1 ? '' : 's'}`;
}
export function aggregateAmounts(amounts) {
  const list = (amounts || []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return String(list[0]).trim().slice(0, 24);
  const parsed = list.map(parseAmount);
  if (parsed.some((p) => !p)) return null; // one occurrence not summable → no number
  const base = parsed[0].base;
  if (parsed.some((p) => p.base !== base)) return null; // mixed units → no number
  return renderAmount(parsed.reduce((s, p) => s + p.n, 0), base).slice(0, 24);
}

// Ingredient lines arrive as the recipe parser's { qty, name } objects (or
// plain strings from older callers) — the old string-only path turned every
// object into "[object Object]", one item per list.
const lineText = (line) => (typeof line === 'string' ? line : [line?.qty, line?.name].filter(Boolean).join(' '));
export function toShoppingItems(ingredientLines) {
  const byKey = new Map();
  for (const raw of ingredientLines || []) {
    const line = lineText(raw);
    if (!line) continue;
    const { amount, name: rest } = splitAmount(line);
    const name = String(rest || '').replace(/\([^)]*\)/g, '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
    if (!name || /^—/.test(name)) continue; // section headings ("— Assembly —") are not ingredients
    const key = name.toLowerCase();
    const entry = byKey.get(key) || { name: name[0].toUpperCase() + name.slice(1), category: aisleFor(name), amounts: [], lines: 0 };
    entry.lines += 1;
    if (amount) entry.amounts.push(amount);
    byKey.set(key, entry);
  }
  return [...byKey.values()].map(({ name, category, amounts, lines }) => ({
    name, category,
    // every occurrence must have carried an amount for a total to be honest
    amount: amounts.length === lines ? aggregateAmounts(amounts) : null,
  }));
}

// ---- off-plan regulars join the list, labelled — his approval still gates ----
// `exclude` names the chosen recipes: a rotation slot he logs as eaten shows
// up in the food history too, and it is on-plan, not an off-plan regular.
export function appendRegulars(items, recurring, { exclude = [] } = {}) {
  const have = new Set(items.map((i) => i.name.toLowerCase()));
  const planned = exclude.map((n) => String(n || '').toLowerCase()).filter(Boolean);
  const out = [...items];
  for (const r of recurring || []) {
    const name = String(r.name || '').trim();
    if (!name || have.has(name.toLowerCase())) continue;
    const lower = name.toLowerCase();
    if (planned.some((p) => p === lower || p.includes(lower) || lower.includes(p))) continue; // on the plan already
    have.add(name.toLowerCase());
    out.push({ name: name[0].toUpperCase() + name.slice(1), category: aisleFor(name), amount: null, source: `off-plan regular ×${r.count}` });
  }
  return out;
}

// ---- the SHORT warning carries its own fix — one swap, computed, or nothing ----
// Candidates for a slot are the bank's other recipes (and the current one's
// alternates when they carry macros); the swap suggested is the single one
// that closes the most protein gap, and only when it clears the gap or
// closes at least half of it. Otherwise the gap is stated and that is all —
// a swap that barely moves the number is noise wearing a suggestion.
export function floorFix({ slots, recipes, gap }) {
  if (!(gap > 0)) return null;
  let best = null;
  for (const [slot, current] of Object.entries(slots || {})) {
    if (!current?.macros) continue;
    const curP = Number(current.macros.p) || 0;
    const candidates = [
      ...(recipes || []).filter((r) => r.id !== current.id && r.macros?.p != null).map((r) => ({ name: r.name, p: Number(r.macros.p) })),
      ...((recipes || []).find((r) => r.id === current.id)?.alternates || []).filter((a) => a.macros?.p != null).map((a) => ({ name: `${current.name} (${a.label})`, p: Number(a.macros.p) })),
    ];
    for (const c of candidates) {
      const gain = Math.round(c.p - curP);
      if (gain <= 0) continue;
      if (!best || gain > best.gain) best = { slot, from: current.name, to: c.name, gain };
    }
  }
  if (!best || best.gain < gap / 2) return null;
  return { ...best, clears: best.gain >= gap, line: `closest fix: ${best.slot} → ${best.to} (+${best.gain}g${best.gain >= gap ? ', clears it' : ` of the ${gap}g gap`})` };
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
        : `⚠ Protein plan: ${planned}g against the ${floor}g floor — ${floor - planned}g SHORT.${(() => { const fix = floorFix({ slots: rotation.slots, recipes, gap: floor - planned }); return fix ? ` ${fix.line[0].toUpperCase()}${fix.line.slice(1)}.` : ' No single swap in the bank closes half of that — the gap stands.'; })()}`);
    }
  }

  // What he ACTUALLY ate (the sweep: meal prep re-proposed the rotation with
  // no view of reality). Recurring off-plan foods are worth stocking for;
  // floor adherence says whether the plan is even being executed.
  let recurring = [];
  try {
    const { recurringFoods } = await import('./foodHistory.js');
    recurring = (await recurringFoods({ days: 21, minCount: 2 })).slice(0, 3);
    if (recurring.length) {
      const offPlan = recurring.filter((r) => !chosen.some((c) => { const a = c.name.toLowerCase(), b = String(r.name).toLowerCase(); return a === b || a.includes(b) || b.includes(a); }));
      if (offPlan.length) lines.push(`Off-plan regulars (added to the list, labelled — drop any you don't want): ${offPlan.map((r) => `${r.name} ×${r.count}`).join(' · ')}.`);
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

  const items = appendRegulars(toShoppingItems(chosen.flatMap((r) => r.ingredients || [])), recurring, { exclude: chosen.map((r) => r.name) });
  return { lines, items, slotCount: chosen.length, planned, floor };
}

async function recordExistsThisWeek() {
  const items = await listRecords();
  const since = todayISO(mondayOf(new Date()));
  return items.some((r) => r.kind === 'meal-prep' && r.createdAt && todayISO(new Date(r.createdAt)) >= since);
}

export async function runMealPrep(vaultPath, { force = false } = {}) {
  if (laneSkipped('meal-prep', 'the weekly prep list')) return { skipped: true, reason: 'lane switched off in Settings' };
  if (!force && (await recordExistsThisWeek())) return { skipped: true };
  const { lines, items, slotCount } = await composeMealPrep(vaultPath);
  if (!slotCount) return { skipped: true, reason: 'rotation empty' };

  const weekLong = mondayOf(new Date(), { weeksBack: -1 }).toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
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
      // Thursday 17:00 onward — and still Friday/Saturday/Sunday if the Mac
      // slept through it. runMealPrep's recordExistsThisWeek keeps it to one.
      if (weeklyWindowOpen(now, { day: 4, hour: 17 })) await runMealPrep(vaultPath);
    } catch (err) {
      console.error('meal prep failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}

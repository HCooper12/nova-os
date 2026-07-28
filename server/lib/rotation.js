import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

const ROTATION_REL_PATH = 'Wiki/Health/Daily Rotation.md';
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'extra'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', extra: 'Extra Meal' };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "consumed" is scoped to today only — a mark from a previous day is stale
// and should read as unconsumed without needing an explicit daily reset job.
function effectiveConsumed(state) {
  return state.consumedDate === today() ? (state.consumed || {}) : {};
}

// A variant override is TODAY's version of a slot's meal (an alternate of the
// recipe — "white bread, no avocado") without touching the stored recipe.
// Date-scoped exactly like consumed: yesterday's override is honestly stale.
function effectiveOverrides(state) {
  return state.overrideDate === today() ? (state.overrides || {}) : {};
}

function bodyFor(slots, recipesById) {
  const lines = SLOTS.map((s) => {
    const id = slots[s];
    const r = id ? recipesById.get(id) : null;
    return `- **${SLOT_LABELS[s]}:** ${r ? r.name : '_none selected_'}`;
  });
  return `# Daily Rotation\n\nCurrent meal selections, managed via Nova OS. Edit here or in Nova → Recipes.\n\n${lines.join('\n')}\n`;
}

function resolve(state, recipesById) {
  const resolved = {};
  const totals = { p: 0, c: 0, f: 0, kcal: 0 };
  const consumedTotals = { p: 0, c: 0, f: 0, kcal: 0 };
  const consumed = effectiveConsumed(state);
  const overrides = effectiveOverrides(state);
  for (const s of SLOTS) {
    const id = state.slots[s] || null;
    const r0 = id ? recipesById.get(id) : null;
    const alt = r0 && overrides[s] ? (r0.alternates || []).find((a) => a.id === overrides[s]) : null;
    // an override with macros stands in for the day; totals stay honest
    const r = r0 ? (alt && alt.macros ? { ...r0, macros: alt.macros } : r0) : null;
    const isConsumed = !!consumed[s];
    resolved[s] = r ? { id: r.id, name: r.name, macros: r.macros, consumed: isConsumed, variant: alt ? alt.label : null, variantId: alt ? alt.id : null } : null;
    if (r && r.macros) {
      totals.p += r.macros.p;
      totals.c += r.macros.c;
      totals.f += r.macros.f;
      totals.kcal += r.macros.kcal;
      if (isConsumed) {
        consumedTotals.p += r.macros.p;
        consumedTotals.c += r.macros.c;
        consumedTotals.f += r.macros.f;
        consumedTotals.kcal += r.macros.kcal;
      }
    }
  }
  return { slots: resolved, totals, consumedTotals };
}

// Cache + iCloud staleness handling + external-edit detection live in the
// shared helper — see vaultStateFile.js for the full story.
const stateFile = createVaultStateFile({
  relPath: ROTATION_REL_PATH,
  parse(raw) {
    const data = matter(raw).data;
    return { slots: data.slots || {}, consumed: data.consumed || {}, consumedDate: data.consumedDate || null, overrides: data.overrides || {}, overrideDate: data.overrideDate || null };
  },
  empty: () => ({ slots: {}, consumed: {}, consumedDate: null, overrides: {}, overrideDate: null }),
});

function getState(vaultPath) {
  return stateFile.load(vaultPath);
}

export async function loadRotation(vaultPath, recipes) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const state = await getState(vaultPath);
  return resolve(state, recipesById);
}

const withWriteLock = createWriteLock();

async function persist(vaultPath, recipesById, slots, consumed, consumedDate, overrides = {}, overrideDate = null) {
  const state = { slots, consumed, consumedDate, overrides, overrideDate };
  const frontmatter = { type: 'rotation', updated: today(), slots, consumed, consumedDate, overrides, overrideDate };
  const content = matter.stringify(bodyFor(slots, recipesById), frontmatter);
  await stateFile.write(vaultPath, content, state);
  return resolve(state, recipesById);
}

export async function setRotationSlot(vaultPath, recipes, slot, recipeId) {
  if (!SLOTS.includes(slot)) throw new Error('invalid slot');
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  if (recipeId && !recipesById.has(recipeId)) throw new Error('unknown recipe id');

  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    const slots = { ...state.slots };
    if (recipeId) slots[slot] = recipeId;
    else delete slots[slot];

    // swapping (or clearing) a slot's recipe invalidates any "consumed" mark
    // AND any today-variant for it — neither refers to the same food now.
    const consumed = { ...effectiveConsumed(state) };
    delete consumed[slot];
    const overrides = { ...effectiveOverrides(state) };
    delete overrides[slot];

    return persist(vaultPath, recipesById, slots, consumed, today(), overrides, today());
  });
}

// TODAY's version of a slot: point it at one of the recipe's alternates
// (altId null returns to the original). The stored recipe never changes.
export async function setSlotVariant(vaultPath, recipes, slot, altId) {
  if (!SLOTS.includes(slot)) throw new Error('invalid slot');
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    const recipeId = state.slots[slot];
    const recipe = recipeId ? recipesById.get(recipeId) : null;
    if (!recipe) throw new Error('that slot has no recipe today');
    if (altId && !(recipe.alternates || []).some((a) => a.id === altId)) {
      throw new Error(`"${recipe.name}" has no alternate "${altId}"`);
    }
    const overrides = { ...effectiveOverrides(state) };
    if (altId) overrides[slot] = altId;
    else delete overrides[slot];
    return persist(vaultPath, recipesById, state.slots, effectiveConsumed(state), state.consumedDate === today() ? today() : state.consumedDate, overrides, today());
  });
}

export async function setSlotConsumed(vaultPath, recipes, slot, consumedFlag) {
  if (!SLOTS.includes(slot)) throw new Error('invalid slot');
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    const consumed = { ...effectiveConsumed(state), [slot]: !!consumedFlag };
    return persist(vaultPath, recipesById, state.slots, consumed, today(), effectiveOverrides(state), today());
  });
}

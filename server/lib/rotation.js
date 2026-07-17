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
  for (const s of SLOTS) {
    const id = state.slots[s] || null;
    const r = id ? recipesById.get(id) : null;
    const isConsumed = !!consumed[s];
    resolved[s] = r ? { id: r.id, name: r.name, macros: r.macros, consumed: isConsumed } : null;
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
    return { slots: data.slots || {}, consumed: data.consumed || {}, consumedDate: data.consumedDate || null };
  },
  empty: () => ({ slots: {}, consumed: {}, consumedDate: null }),
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

async function persist(vaultPath, recipesById, slots, consumed, consumedDate) {
  const state = { slots, consumed, consumedDate };
  const frontmatter = { type: 'rotation', updated: today(), slots, consumed, consumedDate };
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
    // for it — it no longer refers to the same food.
    const consumed = { ...effectiveConsumed(state) };
    delete consumed[slot];

    return persist(vaultPath, recipesById, slots, consumed, today());
  });
}

export async function setSlotConsumed(vaultPath, recipes, slot, consumedFlag) {
  if (!SLOTS.includes(slot)) throw new Error('invalid slot');
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    const consumed = { ...effectiveConsumed(state), [slot]: !!consumedFlag };
    return persist(vaultPath, recipesById, state.slots, consumed, today());
  });
}

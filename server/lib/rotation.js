import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';
import { getPortions, adjustPortions } from './portions.js';

// THE DAILY ROTATION — v2 (7 Sep 2026, his Fuel brief).
//
// v1 held ONE recipe per slot and one "consumed" flag per slot. He asked for
// the shape his days actually have: several OPTIONS in a slot he can flick
// between (breakfast changes, the plan should not have to), several dishes
// in one slot each ticked on its own (four snacks loaded, three eaten),
// extra meals beyond the fixed four, and a count of cooked portions that
// falls as he ticks.
//
// The model that covers all of it without a mode switch:
//   - a slot holds a LIST of options;
//   - one option is IN FOCUS — that is the day's PLAN for the slot, what the
//     card shows big and what `totals` counts;
//   - ANY option can be ticked EATEN — `consumedTotals` counts every ticked
//     one, so a four-snack day and a one-breakfast day both add up right.
//
// SHARED-FORMAT DISCIPLINE. Nine readers depend on the resolved shape, so it
// is a strict superset of v1's: `slots[key]` is still the focused dish (with
// `consumed` = that dish eaten), `totals` / `consumedTotals` still exist.
// New: `options[key]`, `order`, `labels`, `custom`, and per-dish
// `portionsLeft`. The frontmatter migrates v1 on read and writes v2 on the
// next write; nothing is lost.

const ROTATION_REL_PATH = 'Wiki/Health/Daily Rotation.md';
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'extra'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', extra: 'Extra Meal' };
const MAX_CUSTOM = 12;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : []);

// "eaten" and the variant overrides are scoped to today only — a mark from a
// previous day is stale and reads as clear without a reset job.
const effectiveEaten = (state) => (state.eatenDate === today() ? (state.eaten || {}) : {});
const effectiveOverrides = (state) => (state.overrideDate === today() ? (state.overrides || {}) : {});

export function slotKeys(state) {
  return [...SLOTS, ...(state.custom || []).map((c) => c.key)];
}
export function slotLabel(state, key) {
  return SLOT_LABELS[key] || (state.custom || []).find((c) => c.key === key)?.label || key;
}

// v1 → v2 in memory. v1: slots {key: id}, consumed {key: bool}, overrides
// {key: altId}. v2: slots {key: [ids]}, focus {key: id}, eaten {key: [ids]},
// overrides {key: {id: altId}}, custom [{key,label}].
function normalise(data) {
  const slots = {};
  for (const [k, v] of Object.entries(data.slots || {})) {
    const ids = arr(v);
    if (ids.length) slots[k] = [...new Set(ids)];
  }
  const focus = {};
  for (const [k, ids] of Object.entries(slots)) {
    const f = data.focus?.[k];
    focus[k] = f && ids.includes(f) ? f : ids[0];
  }
  const eaten = {};
  const eatenDate = data.eatenDate || data.consumedDate || null;
  if (data.eaten) {
    for (const [k, v] of Object.entries(data.eaten)) { const ids = arr(v); if (ids.length) eaten[k] = ids; }
  } else if (data.consumed) {
    for (const [k, on] of Object.entries(data.consumed)) if (on && slots[k]?.[0]) eaten[k] = [slots[k][0]];
  }
  const overrides = {};
  for (const [k, v] of Object.entries(data.overrides || {})) {
    if (v && typeof v === 'object') overrides[k] = { ...v };
    else if (typeof v === 'string' && slots[k]?.[0]) overrides[k] = { [focus[k] || slots[k][0]]: v };
  }
  const custom = Array.isArray(data.custom)
    ? data.custom.filter((c) => c && c.key && !SLOTS.includes(c.key)).map((c) => ({ key: String(c.key), label: String(c.label || c.key).slice(0, 40) })).slice(0, MAX_CUSTOM)
    : [];
  return { version: 2, slots, focus, eaten, eatenDate, overrides, overrideDate: data.overrideDate || null, custom };
}

function bodyFor(state, recipesById) {
  const lines = slotKeys(state).map((k) => {
    const ids = state.slots[k] || [];
    if (!ids.length) return `- **${slotLabel(state, k)}:** _none selected_`;
    const eaten = new Set(effectiveEaten(state)[k] || []);
    const parts = ids.map((id) => {
      const r = recipesById.get(id);
      const name = r ? r.name : `(missing ${id})`;
      return `${id === state.focus[k] ? '★ ' : ''}${name}${eaten.has(id) ? ' ✓' : ''}`;
    });
    return `- **${slotLabel(state, k)}:** ${parts.join(' · ')}`;
  });
  return `# Daily Rotation\n\nCurrent meal selections, managed via Nova OS. Edit here or in Nova → Fuel. ★ = the option in focus (today's plan), ✓ = eaten today.\n\n${lines.join('\n')}\n`;
}

function dishFor(state, recipesById, key, id, portions) {
  const r0 = recipesById.get(id);
  if (!r0) return null;
  const altId = effectiveOverrides(state)[key]?.[id] || null;
  const alt = altId ? (r0.alternates || []).find((a) => a.id === altId) : null;
  const macros = alt && alt.macros ? alt.macros : r0.macros;
  const eaten = (effectiveEaten(state)[key] || []).includes(id);
  const left = portions && Object.prototype.hasOwnProperty.call(portions, id) ? portions[id] : null;
  return {
    id, name: r0.name, macros, eaten, consumed: eaten,
    focus: state.focus[key] === id,
    variant: alt ? alt.label : null, variantId: alt ? alt.id : null,
    // cooked portions left — null when he has never counted this dish
    portionsLeft: left, out: left === 0,
  };
}

function resolve(state, recipesById, portions) {
  const slots = {};
  const options = {};
  const totals = { p: 0, c: 0, f: 0, kcal: 0 };
  const consumedTotals = { p: 0, c: 0, f: 0, kcal: 0 };
  const add = (t, m) => { if (!m) return; t.p += m.p || 0; t.c += m.c || 0; t.f += m.f || 0; t.kcal += m.kcal || 0; };
  const labels = {};
  for (const k of slotKeys(state)) {
    labels[k] = slotLabel(state, k);
    const dishes = (state.slots[k] || []).map((id) => dishFor(state, recipesById, k, id, portions)).filter(Boolean);
    options[k] = dishes;
    const focused = dishes.find((d) => d.focus) || dishes[0] || null;
    slots[k] = focused ? { ...focused, options: dishes, optionCount: dishes.length, eatenCount: dishes.filter((d) => d.eaten).length } : null;
    if (focused) add(totals, focused.macros);
    for (const d of dishes) if (d.eaten) add(consumedTotals, d.macros);
  }
  // `portions` rides along so a counted dish that is NOT in today's rotation still shows its fridge count on its recipe
  return { version: 2, slots, options, order: slotKeys(state), labels, custom: state.custom || [], totals, consumedTotals, portions: portions || {} };
}

const stateFile = createVaultStateFile({
  relPath: ROTATION_REL_PATH,
  parse: (raw) => normalise(matter(raw).data || {}),
  empty: () => normalise({}),
});
const getState = (vaultPath) => stateFile.load(vaultPath);
const withWriteLock = createWriteLock();

export async function loadRotation(vaultPath, recipes) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const [state, portions] = await Promise.all([getState(vaultPath), getPortions(vaultPath).catch(() => ({}))]);
  return resolve(state, recipesById, portions);
}

async function persist(vaultPath, recipesById, state) {
  const clean = { ...state, version: 2 };
  const frontmatter = { type: 'rotation', updated: today(), ...clean };
  const content = matter.stringify(bodyFor(clean, recipesById), frontmatter);
  await stateFile.write(vaultPath, content, clean);
  return resolve(clean, recipesById, await getPortions(vaultPath).catch(() => ({})));
}

function requireSlot(state, slot) {
  if (!slotKeys(state).includes(slot)) throw new Error('invalid slot');
}
function requireRecipe(recipesById, recipeId) {
  if (!recipesById.has(recipeId)) throw new Error('unknown recipe id');
}

// ---- options -----------------------------------------------------------

export async function addSlotOption(vaultPath, recipes, slot, recipeId) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  requireRecipe(recipesById, recipeId);
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    requireSlot(state, slot);
    const ids = state.slots[slot] || [];
    if (!ids.includes(recipeId)) state.slots = { ...state.slots, [slot]: [...ids, recipeId] };
    if (!state.focus[slot]) state.focus = { ...state.focus, [slot]: recipeId };
    return persist(vaultPath, recipesById, state);
  });
}

export async function removeSlotOption(vaultPath, recipes, slot, recipeId) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    requireSlot(state, slot);
    const ids = (state.slots[slot] || []).filter((id) => id !== recipeId);
    const slots = { ...state.slots };
    if (ids.length) slots[slot] = ids; else delete slots[slot];
    const focus = { ...state.focus };
    if (focus[slot] === recipeId) { if (ids.length) focus[slot] = ids[0]; else delete focus[slot]; }
    const eaten = { ...effectiveEaten(state) };
    if (eaten[slot]) { eaten[slot] = eaten[slot].filter((id) => id !== recipeId); if (!eaten[slot].length) delete eaten[slot]; }
    const overrides = { ...effectiveOverrides(state) };
    if (overrides[slot]) { const o = { ...overrides[slot] }; delete o[recipeId]; if (Object.keys(o).length) overrides[slot] = o; else delete overrides[slot]; }
    return persist(vaultPath, recipesById, { ...state, slots, focus, eaten, eatenDate: today(), overrides, overrideDate: today() });
  });
}

export async function setSlotFocus(vaultPath, recipes, slot, recipeId) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    requireSlot(state, slot);
    if (!(state.slots[slot] || []).includes(recipeId)) throw new Error('that recipe is not one of the options in this slot');
    return persist(vaultPath, recipesById, { ...state, focus: { ...state.focus, [slot]: recipeId } });
  });
}

// v1 compat: SET the slot. Null clears every option; an id becomes an option
// (if it was not one) and takes focus. Nothing else in the slot is touched —
// the verb "make lunch works burger" should never wipe his other options.
export async function setRotationSlot(vaultPath, recipes, slot, recipeId) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  if (recipeId) requireRecipe(recipesById, recipeId);
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    requireSlot(state, slot);
    if (!recipeId) {
      const slots = { ...state.slots }; delete slots[slot];
      const focus = { ...state.focus }; delete focus[slot];
      const eaten = { ...effectiveEaten(state) }; delete eaten[slot];
      const overrides = { ...effectiveOverrides(state) }; delete overrides[slot];
      return persist(vaultPath, recipesById, { ...state, slots, focus, eaten, eatenDate: today(), overrides, overrideDate: today() });
    }
    const ids = state.slots[slot] || [];
    const slots = { ...state.slots, [slot]: ids.includes(recipeId) ? ids : [...ids, recipeId] };
    return persist(vaultPath, recipesById, { ...state, slots, focus: { ...state.focus, [slot]: recipeId } });
  });
}

// ---- eaten -------------------------------------------------------------

// Tick one option in a slot. Ticking takes a cooked portion off the count
// when he keeps one for that dish; unticking gives it back. A dish he has
// never counted is left alone — Nova does not invent an inventory.
export async function setOptionEaten(vaultPath, recipes, slot, recipeId, flag) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    requireSlot(state, slot);
    if (!(state.slots[slot] || []).includes(recipeId)) throw new Error('that recipe is not one of the options in this slot');
    const eaten = { ...effectiveEaten(state) };
    const was = (eaten[slot] || []).includes(recipeId);
    const list = (eaten[slot] || []).filter((id) => id !== recipeId);
    if (flag) list.push(recipeId);
    if (list.length) eaten[slot] = list; else delete eaten[slot];
    if (!!flag !== was) {
      const portions = await getPortions(vaultPath).catch(() => ({}));
      if (Object.prototype.hasOwnProperty.call(portions, recipeId)) await adjustPortions(vaultPath, recipeId, flag ? -1 : 1).catch(() => {});
    }
    return persist(vaultPath, recipesById, { ...state, eaten, eatenDate: today() });
  });
}

// v1 compat: the focused option.
export async function setSlotConsumed(vaultPath, recipes, slot, consumedFlag) {
  const state = await getState(vaultPath);
  requireSlot(state, slot);
  const id = state.focus[slot] || state.slots[slot]?.[0];
  if (!id) throw new Error(`${slot} has no recipe in today's rotation`);
  return setOptionEaten(vaultPath, recipes, slot, id, !!consumedFlag);
}

// ---- variants ----------------------------------------------------------

// TODAY's version of an option: point it at one of its recipe's alternates
// (altId null returns to the original). The stored recipe never changes.
export async function setSlotVariant(vaultPath, recipes, slot, altId, recipeId = null) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    requireSlot(state, slot);
    const id = recipeId || state.focus[slot] || state.slots[slot]?.[0];
    const recipe = id ? recipesById.get(id) : null;
    if (!recipe) throw new Error('that slot has no recipe today');
    if (altId && !(recipe.alternates || []).some((a) => a.id === altId)) throw new Error(`"${recipe.name}" has no alternate "${altId}"`);
    const overrides = { ...effectiveOverrides(state) };
    const forSlot = { ...(overrides[slot] || {}) };
    if (altId) forSlot[id] = altId; else delete forSlot[id];
    if (Object.keys(forSlot).length) overrides[slot] = forSlot; else delete overrides[slot];
    return persist(vaultPath, recipesById, { ...state, eaten: effectiveEaten(state), eatenDate: state.eatenDate === today() ? today() : state.eatenDate, overrides, overrideDate: today() });
  });
}

// ---- extra meals -------------------------------------------------------

export async function addCustomSlot(vaultPath, recipes, label) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    const custom = [...(state.custom || [])];
    if (custom.length >= MAX_CUSTOM) throw new Error(`that is enough meals for one day (${MAX_CUSTOM} extra)`);
    let n = custom.length + 2;
    let key = `extra-${n}`;
    while (slotKeys(state).includes(key)) key = `extra-${++n}`;
    const clean = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 40) || `Meal ${n}`;
    custom.push({ key, label: clean });
    return persist(vaultPath, recipesById, { ...state, custom });
  });
}

export async function removeCustomSlot(vaultPath, recipes, key) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    if (SLOTS.includes(key)) throw new Error('the standard meals stay');
    if (!(state.custom || []).some((c) => c.key === key)) throw new Error('no such meal');
    const slots = { ...state.slots }; delete slots[key];
    const focus = { ...state.focus }; delete focus[key];
    const eaten = { ...effectiveEaten(state) }; delete eaten[key];
    const overrides = { ...effectiveOverrides(state) }; delete overrides[key];
    return persist(vaultPath, recipesById, { ...state, slots, focus, eaten, eatenDate: today(), overrides, overrideDate: today(), custom: state.custom.filter((c) => c.key !== key) });
  });
}

export async function renameCustomSlot(vaultPath, recipes, key, label) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return withWriteLock(async () => {
    const state = await getState(vaultPath);
    const clean = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) throw new Error('a meal needs a name');
    if (!(state.custom || []).some((c) => c.key === key)) throw new Error('no such meal');
    return persist(vaultPath, recipesById, { ...state, custom: state.custom.map((c) => (c.key === key ? { ...c, label: clean } : c)) });
  });
}

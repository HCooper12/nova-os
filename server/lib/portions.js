import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

// COOKED PORTIONS — how many of each prepped meal are in the fridge.
//
// His ask (7 Sep 2026): "if I have cooked eight portions of the animal potato
// bowl then when I tick off that I have eaten one it will reduce that count
// from 8 to 7. If I cook eight more when I still had two, it should show
// ten." Lives in the vault like the rotation (Wiki/Health/Meal Prep
// Portions.md), because it IS his data. Nothing here is inferred: a dish has
// a count only once he has told Nova one, and the rotation shows a red
// "0 left" only for a dish he counts. Ticking a meal eaten takes one off;
// unticking gives it back (rotation.js does the wiring).

const REL_PATH = 'Wiki/Health/Meal Prep Portions.md';
const MAX_LOG = 120;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalise(data) {
  const counts = {};
  for (const [id, n] of Object.entries(data.counts || {})) {
    const v = Number(n);
    if (Number.isFinite(v) && v >= 0) counts[id] = Math.floor(v);
  }
  const log = Array.isArray(data.log) ? data.log.slice(-MAX_LOG) : [];
  const names = data.names && typeof data.names === 'object' ? { ...data.names } : {};
  return { counts, log, names };
}

function bodyFor(state) {
  const ids = Object.keys(state.counts);
  const lines = ids.length
    ? ids.map((id) => `- **${state.names[id] || id}:** ${state.counts[id]} portion${state.counts[id] === 1 ? '' : 's'} left`)
    : ['_No portions counted yet — tell Nova "I cooked 8 burrito bowls", or set a count on the recipe._'];
  return `# Meal Prep Portions\n\nWhat is cooked and waiting, managed via Nova OS. Ticking a meal eaten in the rotation takes one off.\n\n${lines.join('\n')}\n`;
}

const stateFile = createVaultStateFile({
  relPath: REL_PATH,
  parse: (raw) => normalise(matter(raw).data || {}),
  empty: () => normalise({}),
});
const withWriteLock = createWriteLock();

async function persist(vaultPath, state) {
  const frontmatter = { type: 'portions', updated: today(), counts: state.counts, names: state.names, log: state.log.slice(-MAX_LOG) };
  await stateFile.write(vaultPath, matter.stringify(bodyFor(state), frontmatter), state);
  return { ...state.counts };
}

/** { recipeId: n } for every dish he has counted. */
export async function getPortions(vaultPath) {
  return { ...(await stateFile.load(vaultPath)).counts };
}

/** Set an absolute count (cooking a fresh batch from zero, or a correction). */
export async function setPortions(vaultPath, recipeId, count, { name = null } = {}) {
  const n = Number(count);
  if (!recipeId) throw new Error('which recipe?');
  if (!Number.isInteger(n) || n < 0 || n > 500) throw new Error('portions must be a whole number from 0 to 500');
  return withWriteLock(async () => {
    const state = await stateFile.load(vaultPath);
    const prior = Object.prototype.hasOwnProperty.call(state.counts, recipeId) ? state.counts[recipeId] : null;
    state.counts = { ...state.counts, [recipeId]: n };
    if (name) state.names = { ...state.names, [recipeId]: name };
    state.log = [...state.log, { at: new Date().toISOString(), recipeId, from: prior, to: n, why: 'set' }];
    await persist(vaultPath, state);
    return { recipeId, prior, count: n };
  });
}

/** Add or remove portions. Never below zero; a dish he has never counted
 *  starts from zero only when the delta is positive (cooking creates the
 *  count; eating an uncounted dish does not invent a negative one). */
export async function adjustPortions(vaultPath, recipeId, delta, { name = null, why = 'adjust' } = {}) {
  const d = Number(delta);
  if (!recipeId) throw new Error('which recipe?');
  if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 500) throw new Error('adjust portions by a whole number');
  return withWriteLock(async () => {
    const state = await stateFile.load(vaultPath);
    const has = Object.prototype.hasOwnProperty.call(state.counts, recipeId);
    if (!has && d < 0) throw new Error('that dish has no portion count yet — tell Nova how many you cooked first');
    const prior = has ? state.counts[recipeId] : 0;
    const next = Math.max(0, prior + d);
    state.counts = { ...state.counts, [recipeId]: next };
    if (name) state.names = { ...state.names, [recipeId]: name };
    state.log = [...state.log, { at: new Date().toISOString(), recipeId, from: has ? prior : null, to: next, why }];
    await persist(vaultPath, state);
    return { recipeId, prior: has ? prior : null, count: next };
  });
}

/** Stop counting a dish (it is not "zero left", it is "not tracked"). */
export async function clearPortions(vaultPath, recipeId) {
  return withWriteLock(async () => {
    const state = await stateFile.load(vaultPath);
    if (!Object.prototype.hasOwnProperty.call(state.counts, recipeId)) return { recipeId, count: null };
    const counts = { ...state.counts }; delete counts[recipeId];
    state.counts = counts;
    state.log = [...state.log, { at: new Date().toISOString(), recipeId, from: null, to: null, why: 'clear' }];
    await persist(vaultPath, state);
    return { recipeId, count: null };
  });
}

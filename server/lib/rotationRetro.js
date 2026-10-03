import { loadRotation, PENDING_REFUSAL } from './rotation.js';
import { getPortions, adjustPortions } from './portions.js';
import { getDay, resolveLogDate, setRotationEntry } from './foodLog.js';

// A ROTATION TICK FOR A DAY THAT IS NOT TODAY (3 Oct 2026). His report: he
// went back to yesterday to log the lasagne he ate then, ticked it from the
// rotation, and it landed on TODAY — because the rotation's "eaten" state
// only ever remembers one day (rotation.js, effectiveEaten) and the tick
// never asked which day he was looking at.
//
// The food log is the record of what he ate on a day (setRotationEntry
// exists for exactly this: "Rotation meals ARE food"), so a past-day tick
// writes there, keyed by (slot, recipe) like a same-day tick, and leaves
// TODAY's rotation ticks alone: eating yesterday's lunch says nothing about
// today's. The fridge is the one shared thing: a portion he ate yesterday
// still came out of the fridge, so a counted dish loses one on a tick and
// gets it back on an untick, but only when the day's state actually flips
// (a repeated tick is not a second portion).
//
// `date` must be inside the food log's retro window (resolveLogDate throws
// on a future day or one past 30 days back). Returns { rotation, day, date }.
export async function setRotationEatenOn({ vaultPath, recipes, slot, recipeId, eaten, date }) {
  const target = resolveLogDate(date);
  if (!slot) throw new Error('which meal?');
  if (!recipeId) throw new Error('which recipe?');
  const rotation = await loadRotation(vaultPath, recipes);
  const inSlot = (rotation.options?.[slot] || []).find((d) => d.id === recipeId) || null;
  const recipe = recipes.find((r) => r.id === recipeId) || null;
  // the slot's own view of the dish first (it carries today's variant
  // macros); the recipe bank when the dish has since left the slot
  const name = inSlot?.name || recipe?.name || null;
  const macros = inSlot?.macros || recipe?.macros || null;
  if (eaten && !name) throw new Error('that recipe is not in your bank');
  if (eaten && !macros) throw new Error(PENDING_REFUSAL);

  const before = await getDay(target);
  const was = before.entries.some((e) => e.source === 'rotation' && e.slot === slot && e.recipeId === recipeId);
  const day = await setRotationEntry({ date: target, slot, name, macros, recipeId, consumed: !!eaten });
  if (was !== !!eaten) {
    const portions = await getPortions(vaultPath).catch(() => ({}));
    if (Object.prototype.hasOwnProperty.call(portions, recipeId)) {
      await adjustPortions(vaultPath, recipeId, eaten ? -1 : 1, { why: eaten ? `ate (${target})` : `un-ate (${target})` }).catch(() => {});
    }
  }
  // the fridge may have moved, so the rotation he gets back is re-read
  return { rotation: await loadRotation(vaultPath, recipes), day, date: target };
}

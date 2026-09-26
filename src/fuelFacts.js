// Fuel's pure derivations: the few facts on the Fuel page whose honesty
// depends on arithmetic or on which data is actually present. Pure so
// server/test can pin them without a browser (the Fuel audit, 27 Sep 2026,
// findings 3 and 13).

// A ticked rotation meal writes into the food log with `source: 'rotation'`
// (server/lib/foodLog.js, setRotationEntry). The whole-day sum therefore
// includes the plan; a figure labelled "off-plan" must leave those out, or
// the word describes a different number from the one beside it.
export const isRotationEntry = (e) => e?.source === 'rotation';

export function offPlanTotals(entries = []) {
  const t = (entries || []).filter((e) => !isRotationEntry(e)).reduce((a, e) => ({
    p: a.p + (Number(e.macros?.p) || 0),
    c: a.c + (Number(e.macros?.c) || 0),
    f: a.f + (Number(e.macros?.f) || 0),
    kcal: a.kcal + (Number(e.macros?.kcal) || 0),
  }), { p: 0, c: 0, f: 0, kcal: 0 });
  return { p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f), kcal: Math.round(t.kcal) };
}

// Which recipe bank the grid may show. The demo fixtures belong to demo mode
// and nowhere else: in a live session a bank that has not arrived is
// loading, unreachable, missing or empty, and says which.
//   'demo'    no backend configured: the showcase bank, labelled as such
//   'live'    his recipes
//   'loading' first sync still in flight, nothing cached yet
//   'offline' the Mac is not answering and nothing is cached
//   'empty'   the vault answered with zero recipes
//   'missing' connected, but the recipes did not come through this sync
export function recipeBankState({ demoMode, liveRecipes, connectionStatus, recipesEmpty }) {
  if (demoMode) return 'demo';
  if (Array.isArray(liveRecipes) && liveRecipes.length) return 'live';
  if (recipesEmpty) return 'empty';
  if (connectionStatus === 'offline') return 'offline';
  if (connectionStatus === 'connecting') return 'loading';
  return 'missing';
}

export const RECIPE_BANK_COPY = {
  offline: 'Your Mac is not answering, so your recipes are not here. They come back when it does.',
  empty: 'Your vault has no recipes yet. Recipes added to it in Obsidian appear here.',
  missing: 'Your recipes did not come through on the last sync. The next sync tries again.',
};

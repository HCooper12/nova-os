// IS THIS RECIPE ONE A REEL JUST BROUGHT IN? (15 Oct 2026, the approved
// motion set's image reveal). Read from his records, never guessed: the
// import lane (server/lib/recipeFromVideo.js) files each recipe as an inbox
// record with route 'recipe', and the yes that writes it into the collection
// leaves `undoData.recipeId` and `filedAt` on that record
// (server/lib/inbox.js). So a recipe was just imported from a reel when such
// a record names it, was filed within the window, and its source is a reel
// (the page's own `source.reel`, valsRecipes.sourceOf). The reveal plays on
// the first showing only: once it has played, this device remembers the id.

export const REVEAL_WINDOW_MS = 30 * 60 * 1000;
const KEY = 'novaos.recipeRevealed';
const played = new Set();

export function importedAt(inboxItems, recipeId, now = Date.now()) {
  if (!recipeId || !Array.isArray(inboxItems)) return null;
  for (const r of inboxItems) {
    if (r?.decision?.route !== 'recipe' || r.status !== 'filed') continue;
    if (r.undoData?.recipeId !== recipeId) continue;
    const at = Date.parse(r.filedAt || r.createdAt || '');
    if (Number.isFinite(at) && now - at >= 0 && now - at <= REVEAL_WINDOW_MS) return at;
  }
  return null;
}

function kept() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function wasRevealed(recipeId) {
  return played.has(recipeId) || !!kept()[recipeId];
}

export function markRevealed(recipeId, now = Date.now()) {
  played.add(recipeId);
  try {
    const all = kept();
    all[recipeId] = now;
    // only the window's worth is worth keeping
    for (const [k, t] of Object.entries(all)) if (now - t > 2 * REVEAL_WINDOW_MS) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* private window: the in-memory set still keeps it to once */ }
}

// the page's reveal, or null: a reel's recipe, with its photo, filed just
// now. Whether this showing is the first on this device is PhotoReveal's to
// decide, once, when it mounts (so the page re-rendering cannot cut it off).
export function revealFor({ inboxItems, recipeId, source, photoUrl, now = Date.now() }) {
  if (!photoUrl || !source?.reel) return null;
  return importedAt(inboxItems, recipeId, now) != null ? { chip: 'From a reel' } : null;
}

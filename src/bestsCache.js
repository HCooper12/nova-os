// Personal bests kept on the phone (offline mode, 14 Oct 2026), so the live
// session's record banner still knows the number to beat at a gym with no
// signal. Filled from every bests answer the Mac gives, and warmed for every
// lift in his routines after a sync. The Mac's answer always wins; this copy
// only stands in when there is no answer, and a lift it has never seen
// simply has no banner (never a guessed best).
const KEY = 'novaos.bests';

export function loadBests() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

// the Mac's answer over what was kept; an id it did not mention keeps its copy
export function mergeBests(kept, fresh) {
  return { ...(kept || {}), ...(fresh || {}) };
}

export function saveBests(bests) {
  try { localStorage.setItem(KEY, JSON.stringify(bests)); } catch { /* full: the Mac's answer still drives this session */ }
}

// the kept bests for just these lifts
export function pickBests(kept, ids) {
  const out = {};
  for (const id of ids || []) if (kept && kept[id] != null) out[id] = kept[id];
  return out;
}

// every lift id across his routines, for the warm-up fetch
export function routineLiftIds(routines) {
  const ids = new Set();
  for (const r of routines || []) for (const e of r.exercises || []) if (e.exerciseId) ids.add(e.exerciseId);
  return [...ids];
}

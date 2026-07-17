// Last-known-good snapshot of the live data slices, so a configured device
// whose backend is unreachable (Mac asleep, off Tailscale) shows real-but-
// stale data with an "offline" banner instead of silently reverting to the
// demo dataset. Best-effort: quota errors and private-mode restrictions are
// swallowed — the cache is an enhancement, never a requirement.
const CACHE_KEY = 'novaos.lastLive';

export function loadLiveCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.slices ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLiveCache(slices) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), slices }));
  } catch {
    /* best-effort */
  }
}

export function clearLiveCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* best-effort */
  }
}

// THE HOME SCREEN WIDGETS (his ask, 14 Oct 2026: "build all of them"). The
// widgets live in the iPhone app's extension (ios/App/NovaLiveActivity/
// NovaWidgets.swift) and fetch /api/widget/today from the Mac by themselves.
// This side only does two things, and only in the native shell:
//   - hands the extension the Mac's address and token (it cannot read this
//     page's storage), and
//   - asks iOS to redraw them right after Nova syncs, so a meal logged a
//     minute ago is on the Home Screen now, not at the next 15-minute refresh.

export const MIN_RELOAD_GAP_MS = 60_000;

function plugin() {
  try {
    const C = typeof window !== 'undefined' ? window.Capacitor : null;
    if (!C?.isNativePlatform?.()) return null;
    return C.Plugins?.NovaWidgets || null;
  } catch { return null; }
}

let configured = '';
let lastReload = 0;

export function syncWidgets(conn, { now = Date.now(), force = false } = {}) {
  const p = plugin();
  if (!p || !conn?.baseUrl || !conn?.token) return Promise.resolve({ skipped: 'no-widgets' });
  const key = `${conn.baseUrl}|${conn.token}`;
  const jobs = [];
  if (configured !== key) {
    configured = key;
    jobs.push(p.configure({ baseUrl: conn.baseUrl, token: conn.token }));
  } else if (!force && now - lastReload < MIN_RELOAD_GAP_MS) {
    return Promise.resolve({ skipped: 'recent' });
  }
  lastReload = now;
  return Promise.all(jobs)
    .then(() => p.reload())
    .then(() => ({ reloaded: true }))
    .catch((e) => { configured = ''; return { error: e?.message || String(e) }; });
}

// tests only
export function _resetWidgetBridge() { configured = ''; lastReload = 0; }

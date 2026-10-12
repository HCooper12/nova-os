// The bridge to iOS Live Activities. Only the native shell (native/README.md)
// has it: there `window.Capacitor` carries the NovaLiveActivity plugin
// (ios/App/App/NovaLiveActivityPlugin.swift). In the Home Screen PWA and in
// any browser every call here is a no-op, so the web build imports nothing
// native and never breaks outside the shell (the haptics.js pattern).

function plugin() {
  try {
    const C = typeof window !== 'undefined' ? window.Capacitor : null;
    if (!C?.isNativePlatform?.()) return null;
    return C.Plugins?.NovaLiveActivity || null;
  } catch { return null; }
}

export function liveActivitiesAvailable() {
  return !!plugin();
}

// Last thing sent per kind, so a re-render that changes nothing on the card
// costs nothing (ActivityKit throttles a chatty app).
const sent = new Map();
// What each kind SHOULD show, kept so a send iOS refused can be made again.
// iOS will not start a card while the app is in the background, and the
// native side now rejects that (it used to resolve and the card never came).
const wanted = new Map();

function send(kind) {
  const p = plugin();
  if (!p) return;
  const live = wanted.get(kind) || null;
  const sig = live ? `${live.key}#${live.sig}` : null;
  if (sent.get(kind) === sig) return;
  sent.set(kind, sig);
  const call = live
    ? p.sync({ kind, key: live.key, state: live.state })
    : p.end({ kind });
  Promise.resolve(call).catch(() => { if (sent.get(kind) === sig) sent.delete(kind); });
}

// `live` is { key, state, sig } from liveActivityModel.js, or null to end it.
export function syncLiveActivity(kind, live) {
  wanted.set(kind, live || null);
  send(kind);
}

// back in front: anything iOS refused while Nova was in the background goes again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') for (const kind of wanted.keys()) send(kind);
  });
}

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

// `live` is { key, state, sig } from liveActivityModel.js, or null to end it.
export function syncLiveActivity(kind, live) {
  const p = plugin();
  if (!p) return;
  const sig = live ? `${live.key}#${live.sig}` : null;
  if (sent.get(kind) === sig) return;
  sent.set(kind, sig);
  // the native side answers errors (activities switched off in Settings, a
  // card iOS already ended); the web app carries on either way
  const call = live
    ? p.sync({ kind, key: live.key, state: live.state })
    : p.end({ kind });
  Promise.resolve(call).catch(() => sent.delete(kind));
}

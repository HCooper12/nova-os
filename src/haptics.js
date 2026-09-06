// HAPTICS — one call site shape, honest about the platform.
//
// The truth as of Sep 2026: iOS Safari and installed PWAs do NOT support
// navigator.vibrate. On Hayden's phone these calls did nothing for a year, and
// this file never pretended otherwise. What changed on 6 Sep 2026 (his
// approval of the native wrapper): Nova can also run inside a Capacitor shell
// (native/README.md) that loads the same live URL and injects
// `window.Capacitor` — and THEN every tap here reaches the Taptic Engine
// through the Haptics plugin. Same call sites, no fake substitutes: a fake
// haptic is worse than none. The native-feel work that lands on the plain PWA
// is still the press physics and micro-transitions in Interactive.jsx.
const PATTERNS = {
  // a state flip he initiated — a set ticked, a meal marked eaten, a tab hop
  tick: 10,
  // something was filed/committed — a capture routed, a session finished
  commit: [12, 40, 12],
  // a gesture passed its commit threshold (swipe actions, sheet throws)
  threshold: 8,
  // something worth celebrating — a personal record
  celebrate: [18, 60, 18, 60, 28],
  // a refusal or a failed write — distinct from every success pattern
  warn: [30, 50, 30],
};

// The same five words, in the Taptic Engine's vocabulary. Selection ticks are
// the lightest thing iOS does; notifications are the shaped ones.
const NATIVE = {
  tick: (H) => H.impact({ style: 'LIGHT' }),
  commit: (H) => H.notification({ type: 'SUCCESS' }),
  threshold: (H) => H.selectionChanged(),
  celebrate: async (H) => { await H.notification({ type: 'SUCCESS' }); await H.impact({ style: 'HEAVY' }); },
  warn: (H) => H.notification({ type: 'WARNING' }),
};

// The Capacitor bridge, when this page is running inside the native shell.
// Read live (never cached): the shell injects it before our scripts run, and
// a plain browser never has it.
function nativeHaptics() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    return cap.Plugins?.Haptics || null;
  } catch { return null; }
}

export function haptic(kind = 'tick') {
  try {
    const H = nativeHaptics();
    if (H) {
      const fire = NATIVE[kind] || NATIVE.tick;
      Promise.resolve(fire(H)).catch(() => {});
      return;
    }
    const pattern = PATTERNS[kind] ?? PATTERNS.tick;
    navigator.vibrate?.(pattern);
  } catch { /* unsupported or blocked — never a reason to break a tap */ }
}

// Is real haptic feedback available on this device? Exported so a settings
// surface can tell the truth rather than offering a toggle that does nothing.
export function hapticsSupported() {
  if (nativeHaptics()) return true;
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

// Are we inside the native shell at all? Lets a surface say "native" honestly.
export function isNativeShell() {
  return !!nativeHaptics();
}

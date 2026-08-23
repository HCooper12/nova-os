// HAPTICS — one call site shape, honest about the platform.
//
// The truth as of Aug 2026: iOS Safari and installed PWAs do NOT support
// navigator.vibrate. On Hayden's phone — the device Nova is actually built
// for — these calls do nothing today, and this file does not pretend
// otherwise. It exists so that (a) Android/desktop-Chrome installs get the
// feedback now, and (b) the day WebKit ships the API, every tap in Nova
// gains haptics by changing this one file rather than hunting call sites.
//
// Deliberately NOT faked with sound or animation substitutes: a fake haptic
// is worse than none. The native-feel work that actually lands on iOS today
// is the press physics and micro-transitions in Interactive.jsx / index.css.
const PATTERNS = {
  // a state flip he initiated — a set ticked, a meal marked eaten
  tick: 10,
  // something was filed/committed — a capture routed, a session finished
  commit: [12, 40, 12],
  // a gesture passed its commit threshold (swipe actions, Phase B)
  threshold: 8,
  // something worth celebrating — a personal record
  celebrate: [18, 60, 18, 60, 28],
  // a refusal or a failed write — distinct from every success pattern
  warn: [30, 50, 30],
};

export function haptic(kind = 'tick') {
  try {
    const pattern = PATTERNS[kind] ?? PATTERNS.tick;
    navigator.vibrate?.(pattern);
  } catch { /* unsupported or blocked — never a reason to break a tap */ }
}

// Is real haptic feedback available on this device? Exported so a settings
// surface can tell the truth rather than offering a toggle that does nothing.
export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

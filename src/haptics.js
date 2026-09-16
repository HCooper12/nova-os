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
  // a refusal or a failed write — THREE rapid pulses. Two would be a commit
  // with a different rhythm, and "your action did not happen" has to be
  // unmistakable at the wrist, not a subtlety.
  warn: [30, 35, 30, 35, 30],
};

// How many PULSES a word is, and the gaps between them. A plain number is one
// pulse; an array alternates buzz/pause, so the pulses are the even slots and
// the gaps the odd ones. Exported for the test — the whole multi-tick path
// hangs off this being right.
export function pulsesFor(kind) {
  const p = PATTERNS[kind] ?? PATTERNS.tick;
  if (!Array.isArray(p)) return { count: 1, gaps: [] };
  return { count: Math.ceil(p.length / 2), gaps: p.filter((_, i) => i % 2 === 1) };
}

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

/* ------------------------- the iOS web path (Sep 2026) --------------------- */
//
// HIS REPORT, 15 Sep: "I have never felt any haptics while using my phone."
// That was true and expected — iOS WebKit has never shipped navigator.vibrate,
// so on his phone every call above has been a no-op for a year. What this file
// said about that was honest; what it did not do was offer the one path that
// DOES work in Safari.
//
// Safari 17.4 added `<input type="checkbox" switch>`, a real system control
// that fires the Taptic Engine when toggled. Every web-haptics library used it
// by clicking a hidden one programmatically — and iOS 26.5 closed that path.
// What still works is the version that was never a trick: put a TRANSPARENT
// switch ON TOP of the tappable, so the user's own finger lands on the control.
// iOS treats that as direct manipulation (isTrusted), and the tap is real.
//
// The honest limits, stated here because a surface has to be able to tell him:
//   - ONE flavour. 26.5 also closed programmatic re-ticking, so a multi-part
//     pattern fires only its first tick. The five words above still MEAN five
//     different things; on iOS web they all feel like one tap. Tiers need the
//     native shell.
//   - iPads have no Taptic Engine at all.
//   - It cannot be fired from code. A button Nova presses for him never buzzes,
//     and that is correct — nothing happened under his finger.

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Macintosh; touch points is what separates it
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

// Does this device need (and support) the overlay-switch path? Only when there
// is no better one: the native shell and the Vibration API both beat it.
export function needsSwitchHaptic() {
  if (nativeHaptics()) return false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') return false;
  return isIOS();
}

// What is actually available, in words a settings row can print. Nova has had
// `hapticsSupported()` since the wrapper landed and has never once shown it to
// him — which is part of why "I have never felt any haptics" went unexplained.
export function hapticCapability() {
  if (nativeHaptics()) {
    return { path: 'native', tiers: true, label: 'Native shell — the full Taptic vocabulary, all five distinct.' };
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    return { path: 'vibrate', tiers: true, label: 'Vibration API — patterned, so the five are distinct.' };
  }
  if (isIOS()) {
    // HE IS THE INSTRUMENT. A haptic leaves no trace, so nothing here can be
    // detected — but he can feel it, and on 16 Sep he did: "same pulses". So
    // the answer is stored rather than guessed, and the row states whichever
    // reading it has. Unanswered stays `null`: unknown is its own answer, and
    // the surface asks rather than assumes.
    const felt = readTierVerdict();
    return {
      path: 'switch',
      tiers: felt,
      label: felt === false
        ? 'iOS web — one real Taptic tap on anything you press. You checked: the extra pulses do not land on this phone, so all five feel the same. Distinct tiers need the native shell.'
        : felt === true
          ? 'iOS web — a real Taptic tap, and you confirmed the heavier words land as extra pulses.'
          : 'iOS web — a real Taptic tap on anything you press. The heavier words ask for extra pulses on top; recent iOS blocks those and Nova cannot detect which way yours goes. Press "tick" then "warn" and tell it below.',
    };
  }
  return { path: 'none', tiers: false, label: 'This device has no haptics Nova can reach.' };
}

// THE EXTRA PULSES — attempted, never promised.
//
// His diagnostic, 16 Sep, read **iOS 18.7**. He is on **iOS 27**. Safari
// FREEZES the OS version in its user agent, so that number is a placeholder and
// not his phone — and gating behaviour on it would have been a lie dressed as a
// feature detect. This nearly shipped as "your version supports tiers" to a
// device three major versions past the one that closed them.
//
// There is no way to observe whether a haptic fired, so there is nothing to
// feature-detect either. The honest design is therefore: ALWAYS attempt the
// extra pulses (a re-tick that iOS refuses costs nothing and does nothing), and
// never claim in the UI that they work. The only instrument that can answer it
// is his thumb, so the surface tells him how to check.
//
// Routed through a LABEL, never the input: WebKit ignores a script click on the
// control itself, which is the detail every library that tried this learned.

// The version Safari REPORTS. Frozen by WebKit, so it is a diagnostic
// breadcrumb only — never a gate. Named for what it is.
export function reportedIosVersion() {
  if (typeof navigator === 'undefined') return null;
  const m = String(navigator.userAgent || '').match(/OS (\d+)[_.](\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

export function canRetick() {
  return needsSwitchHaptic();
}

// One hidden switch for the whole app, created on first use. The per-button
// overlays give pulse ONE (his real finger); this gives the rest.
let ticker = null;
function reticker() {
  if (typeof document === 'undefined') return null;
  if (ticker && ticker.input.isConnected) return ticker;
  const wrap = document.createElement('span');
  // off-screen but REAL — a display:none control is not a control
  wrap.style.cssText = 'position:fixed;left:-9999px;bottom:0;width:1px;height:1px;overflow:hidden;pointer-events:none';
  wrap.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'nv-haptic-ticker';
  input.tabIndex = -1;
  const label = document.createElement('label');
  label.setAttribute('for', input.id);
  wrap.append(input, label);
  document.body.appendChild(wrap);
  ticker = { input, label };
  return ticker;
}

// Pulses 2..n, spaced by the word's own gaps. Pulse one already happened under
// his finger, so this never fires for a single-pulse word.
function retick(kind) {
  const { count, gaps } = pulsesFor(kind);
  if (count < 2) return;
  const t = reticker();
  if (!t) return;
  let at = 0;
  for (let i = 1; i < count; i++) {
    at += gaps[i - 1] || 40;
    setTimeout(() => { try { t.label.click(); } catch { /* the tap already landed */ } }, at);
  }
}

// His reading, stored. Not a preference — a MEASUREMENT only he can take.
const TIER_KEY = 'novaos.hapticTiers';
export function readTierVerdict() {
  try {
    const v = localStorage.getItem(TIER_KEY);
    return v === 'yes' ? true : v === 'no' ? false : null;
  } catch { return null; }
}
export function setTierVerdict(v) {
  try {
    if (v === null) localStorage.removeItem(TIER_KEY);
    else localStorage.setItem(TIER_KEY, v ? 'yes' : 'no');
  } catch { /* private mode — the row just keeps asking */ }
}

// WHAT TO TELL ME IF IT STILL DOES NOTHING. A second "I feel nothing" has to
// arrive with evidence attached, or the next fix is another guess.
export function hapticDiagnostic() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = String(nav.userAgent || '');
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  const switches = typeof document !== 'undefined'
    ? document.querySelectorAll('input[type="checkbox"][switch]').length
    : 0;
  return {
    // Safari FREEZES this — it is not the OS version. Labelled so at the call site.
    iosReported: m ? `${m[1]}.${m[2]}` : 'unknown',
    browser: /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'other',
    standalone: !!(nav.standalone || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)),
    overlayPath: needsSwitchHaptic(),
    switchesOnScreen: switches,
    vibrate: typeof nav.vibrate === 'function',
  };
}

// The props for the invisible control. Spread onto an <input> that sits inside
// a POSITIONED tappable. The `switch` attribute goes on by ref because React
// does not forward it.
export const switchHapticRef = (el) => { if (el) el.setAttribute('switch', ''); };
// NEVER `appearance: none`. That was the first attempt and it is why he felt
// nothing: stripping the appearance stops Safari rendering the element as a
// SWITCH, and the switch rendering is what carries the Taptic behaviour. The
// control has to stay a real switch and merely be invisible — opacity and a
// clip, nothing that changes what the control IS.
//
// `touchAction: manipulation` matters too: it hands the tap to the browser's
// native handling rather than letting a gesture layer intercept it.
export const SWITCH_HAPTIC_STYLE = {
  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
  margin: 0,
  opacity: 0,
  clipPath: 'inset(0 round 999px)',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  cursor: 'pointer',
};

export const HAPTIC_WORDS = Object.keys(PATTERNS);

export function haptic(kind = 'tick') {
  try {
    // A WORD THAT IS NOT IN THE VOCABULARY used to become a tick in silence.
    // haptic('light') was called in five places and had never been one of the
    // five — so four card buttons and the swipe pager were all quietly firing
    // the wrong thing. Nothing could catch it, so now something does.
    if (!PATTERNS[kind] && typeof console !== 'undefined' && import.meta.env?.DEV) {
      console.warn(`haptic(): "${kind}" is not one of ${HAPTIC_WORDS.join(', ')} — falling back to tick`);
    }
    const H = nativeHaptics();
    if (H) {
      const fire = NATIVE[kind] || NATIVE.tick;
      Promise.resolve(fire(H)).catch(() => {});
      return;
    }
    if (canRetick()) { retick(kind); return; }
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

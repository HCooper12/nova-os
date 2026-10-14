// WHERE HE IS (design/EVIE-STUDY.md §4E, his yes 15 Oct 2026).
//
// E.V. in Brand New Day is one AI with three registers: engineer at the
// desk, dispatcher on the roof, HUD in the suit. Where Peter is sets what
// she is. Nova takes the same move, and only that move: a `where` signal
// that switches the spoken-register block and the interruptions allowed.
// The lens (server/lib/lens.js) does not change.
//
// whereAmI is pure and reads ONLY what this client can really read. Every
// input below is named for its source, and a signal the app cannot read is
// not claimed:
//
//   workoutLive  — a live workout draft in state (App.state.workoutSession,
//                  the cockpit's draft that guardSessionStart protects),
//                  not a history edit. REAL on every device.
//   audioRoute   — 'carplay' | 'bluetooth-hfp' | other. NOT READABLE today:
//                  the native shell (ios/App/App/*.swift) exposes HealthKit
//                  day totals, the Live Activity and the widgets, and no
//                  AVAudioSession route. Accepted so a future plugin can feed
//                  it; until then it is always absent.
//   moving       — the device is travelling. NOT READABLE today (no
//                  CoreLocation / CoreMotion in the shell). Same as above.
//   handsFree    — this turn came in by the hands-free lane (Siri, the
//                  Action Button). The app never is that lane; the server
//                  applies this fallback for /api/ask/sync itself.
//   mac          — this device is his Mac (src/macTargets.js isMacDevice,
//                  the same fact server/routes/voice.js fromMacOf reads).
//   iphone       — an iPhone or iPad user agent.
//   standalone   — the installed PWA (src/edgeBack.js isStandalone) or the
//                  native shell (window.Capacitor.isNativePlatform()).
//
// Precedence: gym, then driving, then desk, then phone. A live workout on
// the Mac's screen is still the gym (he is between sets, the Mac is beside
// him); driving needs BOTH a car-grade route and movement, or the hands-free
// lane, which is the only driving-grade signal Nova has today.

export const PLACES = ['gym', 'driving', 'desk', 'phone', 'unknown'];
export const WHY_MAX = 60;

const CAR_ROUTES = new Set(['carplay', 'bluetooth-hfp']);

const clipWhy = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, WHY_MAX);

/** { place, why } from what the client can read. Never throws. */
export function whereAmI(inputs = {}) {
  const i = inputs && typeof inputs === 'object' ? inputs : {};
  if (i.workoutLive) return { place: 'gym', why: clipWhy('a live workout is open') };
  const route = String(i.audioRoute || '').toLowerCase();
  if (CAR_ROUTES.has(route) && i.moving === true) {
    return { place: 'driving', why: clipWhy(`${route === 'carplay' ? 'CarPlay' : 'car Bluetooth'} and moving`) };
  }
  if (i.handsFree) return { place: 'driving', why: clipWhy('hands-free lane, no route signal') };
  if (i.mac) return { place: 'desk', why: clipWhy('at the Mac') };
  if (i.iphone && i.standalone) return { place: 'phone', why: clipWhy('the iPhone app') };
  return { place: 'unknown', why: clipWhy(i.iphone ? 'an iPhone browser tab' : 'no signal') };
}

/** The bounded form that travels with an ask or a sync. */
export function boundWhere(w) {
  const place = PLACES.includes(w?.place) ? w.place : 'unknown';
  return { place, why: clipWhy(w?.why) };
}

/**
 * The inputs App.jsx can read right now. `state` is the app's state; `env`
 * lets a test stand in for the browser. Nothing here is guessed: a value the
 * app cannot read stays absent.
 */
export function readWhereInputs(state = {}, env = {}) {
  const nav = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const ua = String(nav?.userAgent || '');
  const ws = state.workoutSession;
  return {
    workoutLive: !!(ws && ws.routineName && !state.editingSessionId),
    mac: env.mac ?? (/Macintosh/.test(ua) && !((nav?.maxTouchPoints || 0) > 1)),
    iphone: /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1),
    standalone: !!env.standalone,
  };
}

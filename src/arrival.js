// THE ARRIVAL COUNT'S CLOCK (9 Oct 2026, his call: "numbers count up from
// zero on every arrival, not only on change"). CountUp's `fromZero` figures
// ask this module two things when they mount: may this arrival count at all,
// and where does this figure sit in the stagger.
//
//   - a quick return does not count again. Leaving a screen and coming back
//     to it within QUICK_BACK_MS (a back swipe, a tab there and back) shows
//     the figures still: he has just seen them arrive. Only the screen key
//     matters, so a back gesture and a tab hop are treated alike.
//   - figures that arrive together stagger by STAGGER_MS each, in the order
//     React lays them out (DOM order), and the delay is taken out of the
//     count's own length so the whole arrival stays inside ARRIVAL_MS
//   - the screen is noted before its figures lay out (App's
//     getSnapshotBeforeUpdate), so a figure always asks about the screen it
//     is on, not the one being left
//
// Pure apart from its memory: every function takes `now`, so the rules are
// tested without a browser (server/test/arrivalCount.test.js).

export const QUICK_BACK_MS = 5000;
export const ARRIVAL_MS = 650;
export const STAGGER_MS = 40;
export const STAGGER_MAX = 200;
// figures that mount within this window of each other are one arrival
export const SLOT_WINDOW_MS = 120;

export function createArrival() {
  let current = null;
  let quiet = false;
  const left = new Map();
  let slotAt = -Infinity;
  let slot = 0;

  return {
    // the screen now on show; a return inside QUICK_BACK_MS is quiet
    noteScreen(key, now) {
      if (key == null || key === current) return;
      if (current != null) left.set(current, now);
      const was = left.get(key);
      quiet = was != null && now - was < QUICK_BACK_MS;
      current = key;
    },
    allowed() { return !quiet; },
    // this figure's place in the arrival, and its timing
    timing(now) {
      if (now - slotAt > SLOT_WINDOW_MS) slot = 0;
      slotAt = now;
      const delay = Math.min(slot * STAGGER_MS, STAGGER_MAX);
      slot += 1;
      return { delay, duration: ARRIVAL_MS - delay };
    },
    screen() { return current; },
  };
}

const shared = createArrival();
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export const noteScreen = (key) => shared.noteScreen(key, clock());
export const arrivalAllowed = () => shared.allowed();
export const arrivalTiming = () => shared.timing(clock());

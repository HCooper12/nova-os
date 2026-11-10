// THE HISTORY'S HEAVY PARTS WAIT FOR A QUIET STAGE (src/LazyMount.jsx): the
// shared clock. The phone stage holds it while he is spoken to; once it has
// been quiet for QUIET_MS the waiting parts mount one every STEP_MS.
export const QUIET_MS = 2500;
export const STEP_MS = 220;
export const lazyWait = new Set();        // mount callbacks of parts still lazyWait
let held = false;
let quietT = 0;
let stepT = 0;

function drain() {
  clearTimeout(stepT);
  if (held || !lazyWait.size) return;
  // newest first: the last one added is the line nearest the stage
  const next = [...lazyWait].pop();
  lazyWait.delete(next);
  next();
  stepT = setTimeout(drain, STEP_MS);
}

/** The stage says when it is busy (speaking, arriving, dealing); history
 *  parts mount only once it has been quiet for QUIET_MS. */
export function holdLazy(on) {
  if (on === held) return;
  held = on;
  clearTimeout(quietT);
  clearTimeout(stepT);
  if (!on) quietT = setTimeout(drain, QUIET_MS);
}

/** Is the stage busy right now? */
export function lazyHeld() { return held; }
/** Start the quiet clock (a part began waiting while nothing was busy). */
export function lazyArm() { clearTimeout(quietT); quietT = setTimeout(drain, QUIET_MS); }

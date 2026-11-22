// THE PHONE KEEPS OUT OF HIS SPOKEN TURN (22 Nov 2026).
//
// His spoken turns reach the phone's code seconds late: an upload the Mac
// answered in 0.33 s took 8.3 s on the phone, and polls answered in 1 to 4 ms
// took 2.3 to 4 s to come back (design/SPEED-DISPLAY-STUDY.md, section 2).
// At the same moment the phone was refreshing everything. Nothing asked
// whether a turn was live before a sync started. Which of the two costs the
// seconds (the path, or the main thread applying a refresh) is not proven;
// src/turnNet.js measures it. This keeps the refreshes out of the way either
// way, and only ever delays them.
//
// THE PHASE comes from marks the voice code makes:
//   listen  the turn opened, the recorder is being started (useDictation)
//   wait    his speech ended and the upload began; then the ask, the polls
//   speak   the reply's first sound (App, the same stamp as firstAudioMs)
//   idle    the reply was heard, stopped, cut, failed, or the turn ended
//           without an ask
// A mark made by one turn's code can be made conditional on that turn still
// owning the phase (markIf), so a reply finishing late can never end a turn
// he has already started over the top of it.
//
// SAFE BY CONSTRUCTION. No mark at all means the phase stays idle and every
// sync runs exactly as it did before. A missed mark cannot freeze syncing:
// with no mark for 30 s the phase falls back to idle by itself. A refresh
// deferred here is owed, never dropped: it runs when the turn lets it.
//
// Pure: clock and timers are handed in. No React, no browser globals.
// server/test/turnPhase.test.js pins the table, the fall-back, the deferral
// rules per phase and the coalescing.

export const PHASES = Object.freeze(['idle', 'listen', 'wait', 'speak']);
// no mark for this long and the phase is idle again by itself
export const QUIET_MS = 30_000;
// idle this long before what was owed runs: Nova hands the turn back and the
// mic reopens about 300 ms after the last word, and a barge-in reopens it at
// once, so a flush that ran the instant the reply ended would be called off
// by the next listen and run again after it
export const SETTLE_MS = 1_000;

// THE PHASE TABLE: what may run in each phase. Bulk is the whole-app sync
// (App.refreshLiveData); slices is a targeted refresh (App.refreshSlices),
// which is also what a stream nudge for a tagged write becomes. While Nova
// speaks the targeted ones run, so the screen follows what Nova just wrote.
export const PHASE_RULES = Object.freeze({
  idle: Object.freeze({ bulk: true, slices: true }),
  listen: Object.freeze({ bulk: false, slices: false }),
  wait: Object.freeze({ bulk: false, slices: false }),
  speak: Object.freeze({ bulk: false, slices: true }),
});

export function syncAllowed(phase, kind) {
  const rules = PHASE_RULES[phase] || PHASE_RULES.idle;
  return kind === 'bulk' ? rules.bulk : rules.slices;
}

const defaultSet = (fn, ms) => setTimeout(fn, ms);
const defaultClear = (t) => clearTimeout(t);

// The tracker. mark() returns the mark's owner number; markIf(owner, phase)
// applies only while that owner is still the latest mark; touch(owner) keeps a
// live phase from the quiet fall-back without changing it (the turn clock's
// heartbeat while he talks). onChange(next, prev, why) fires on a real change;
// why is 'mark' or 'quiet'.
export function createTurnPhase({ now = () => Date.now(), setTimer = defaultSet, clearTimer = defaultClear, quietMs = QUIET_MS, onChange = null } = {}) {
  let phase = 'idle';
  let seq = 0;
  let lastAt = 0;
  let timer = null;
  const arm = (ms) => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(onQuiet, ms);
  };
  const set = (next, why) => {
    const prev = phase;
    phase = next;
    seq += 1;
    lastAt = now();
    if (next === 'idle') {
      if (timer !== null) clearTimer(timer);
      timer = null;
    } else arm(quietMs);
    if (prev !== next && onChange) {
      try { onChange(next, prev, why); } catch { /* a listener never breaks the turn */ }
    }
    return seq;
  };
  function onQuiet() {
    timer = null;
    if (phase === 'idle') return;
    const since = now() - lastAt;
    if (since < quietMs) { arm(quietMs - since); return; }   // a touch kept it alive
    set('idle', 'quiet');
  }
  return {
    phase: () => phase,
    owner: () => seq,
    mark(next) {
      if (!PHASES.includes(next)) return null;
      return set(next, 'mark');
    },
    markIf(owner, next) {
      if (!owner || owner !== seq || !PHASES.includes(next)) return null;
      return set(next, 'mark');
    },
    touch(owner) {
      if (!owner || owner !== seq || phase === 'idle') return false;
      lastAt = now();
      return true;
    },
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

// THE GATE: a refresh asks before it runs; one that may not run now is owed.
// onPhase(next) is the tracker's onChange. Entering speak runs the owed
// slices as one targeted refresh; settling into idle runs everything owed as
// ONE call: the whole-app sync if any was owed, else one targeted refresh of
// the union. run({ bulk: true } | { slices: [...] }) performs that call.
export function createSyncGate({ phase, run, setTimer = defaultSet, clearTimer = defaultClear, settleMs = SETTLE_MS } = {}) {
  let bulk = false;
  const slices = new Set();
  let deferred = 0;
  let flushT = null;
  const cancel = () => { if (flushT !== null) clearTimer(flushT); flushT = null; };
  const owe = (kind, only) => {
    deferred += 1;
    if (kind === 'slices' && Array.isArray(only) && only.length) for (const s of only) slices.add(s);
    else bulk = true;   // untagged is unknown, and unknown is everything
  };
  const call = (c) => { try { run?.(c); } catch { /* the refresh says its own errors */ } };
  return {
    // true: run it now. false: it is owed, and runs when the turn lets it.
    allow(kind, only = null) {
      if (!syncAllowed(phase(), kind)) { owe(kind, only); return false; }
      // what runs now pays what was owed of it
      if (kind === 'bulk') { bulk = false; slices.clear(); cancel(); }
      else if (Array.isArray(only)) for (const s of only) slices.delete(s);
      return true;
    },
    // a refresh that was on the wire and was called off (a turn began)
    owe,
    onPhase(next) {
      cancel();
      if (next === 'speak') {
        if (!slices.size) return;
        flushT = setTimer(() => {
          flushT = null;
          if (!syncAllowed(phase(), 'slices') || !slices.size) return;
          const only = [...slices];
          slices.clear();
          call({ slices: only });
        }, 0);
        return;
      }
      if (next !== 'idle' || (!bulk && !slices.size)) return;
      flushT = setTimer(() => {
        flushT = null;
        if (phase() !== 'idle') return;
        const c = bulk ? { bulk: true } : slices.size ? { slices: [...slices] } : null;
        bulk = false;
        slices.clear();
        if (c) call(c);
      }, settleMs);
    },
    owed: () => ({ bulk, slices: [...slices] }),
    deferred: () => deferred,
    dispose: cancel,
  };
}

// THE BRIDGE (the listenCause.js pattern): the dictation hook marks the turn
// it runs without a prop through every view model. App binds its tracker on
// mount. Unbound, every call is a no-op, which is the old behaviour.
let bound = null;
export function bindTurnPhase(tracker) {
  bound = tracker || null;
  return () => { if (bound === tracker) bound = null; };
}
export function markTurn(phase) {
  try { return bound ? bound.mark(phase) : null; } catch { return null; }
}
export function markTurnIf(owner, phase) {
  try { return bound && owner ? bound.markIf(owner, phase) : null; } catch { return null; }
}
export function touchTurn(owner) {
  try { return bound && owner ? bound.touch(owner) : false; } catch { return false; }
}

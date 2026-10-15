// WHO IS BEING ASKED, RIGHT NOW (the motion set, mockup #s8, 15 Oct 2026).
//
// A job that consults other agents already carries its roster on every poll
// (server/routes/claudeCode.js `consult`, written by lib/consult.js: one entry
// per ask, `asking` → `done` | `failed`). Nothing on the client kept it for the
// Coach, so nothing could draw it. This keeps the latest roster per poll name
// OUTSIDE React state: a roster changing every 700 ms must not re-render the
// whole app (the 120 Hz lesson), only the one diagram that subscribes.
//
// The roster is the server's, verbatim. A poll that ends (ready, error, lost,
// cancelled) clears its lane, so nothing is ever drawn for a turn that is over.

const lanes = new Map();
const subs = new Set();
const EMPTY = null;

function emit() { subs.forEach((f) => { try { f(); } catch { /* a watcher never sinks the poll */ } }); }

export function publishConsult(lane, roster) {
  const next = Array.isArray(roster) && roster.length ? roster : EMPTY;
  const prev = lanes.get(lane) ?? EMPTY;
  // the same roster polled twice is no change (compare who, and how each stands)
  const sig = (r) => (r ? r.map((a) => `${a.agent}:${a.round || 1}:${a.state}`).join('|') : '');
  if (sig(prev) === sig(next)) return;
  if (next) lanes.set(lane, next); else lanes.delete(lane);
  emit();
}

export function consultOf(lane) { return lanes.get(lane) ?? EMPTY; }

export function subscribeConsult(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Wrap a job poll's handlers so its roster is published as it moves and
// cleared when it ends. `start(handlers)` starts the poll (pollJob) and its
// result's cancel() clears the lane too.
export function watchConsult(lane, handlers, start) {
  const clear = () => publishConsult(lane, null);
  const h = {
    ...handlers,
    onProgress: (job) => { publishConsult(lane, job?.consult); handlers.onProgress?.(job); },
    onReady: (job) => { clear(); handlers.onReady?.(job); },
    onError: (...a) => { clear(); handlers.onError?.(...a); },
  };
  if (handlers.onLost) h.onLost = (...a) => { clear(); handlers.onLost(...a); };
  const poller = start(h);
  return { ...poller, cancel: () => { clear(); poller?.cancel?.(); } };
}

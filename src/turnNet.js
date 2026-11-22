// THE PHONE'S SIDE OF A SPOKEN TURN, MEASURED (22 Nov 2026).
//
// His voice responses reach the phone's code seconds late: an upload the Mac
// answered in 0.33 s took 8.3 s on the phone, 4.4 s passed between the ask
// being accepted and the first poll, and polls answered in 1 to 4 ms took 2.3
// to 4 s to come back (design/SPEED-DISPLAY-STUDY.md, section 2). Three
// mechanisms fit those numbers and nothing so far could tell them apart:
//   - a saturated path        the network time itself is long
//   - a busy main thread      the response arrived, the code ran late
//   - a dead connection       the request had to build a new one first
// So for each request of a spoken turn (the transcribe upload, the ask, every
// poll until the first reply) the phone keeps two clocks:
//   rtMs   measured in JS around the call: what the code waited
//   netMs  the Resource Timing duration of that same request: what the
//          network took. rtMs - netMs is the time the response sat waiting
//          for the main thread.
// and, when the server sends Timing-Allow-Origin, the request's connect, TLS
// and time to first byte. A 100 ms timer runs while the turn is live: how
// late it fires is the main thread being busy (stallMaxMs, stallSumMs). And
// the turn's sync story: what refreshed beside it, what was held back, and
// whether one was called off (src/turnPhase.js).
//
// Numbers only, never his words. They ride the turn's ask receipt
// (server/lib/voiceTurns.js netFields reads them; scripts/voice-latency.mjs
// prints them). Pure apart from watchResources, whose observer is handed in;
// server/test/turnNet.test.js drives it.

export const NET_KINDS = Object.freeze(['tx', 'ask', 'poll']);
export const STALL_TICK_MS = 100;
// lateness under this is a timer's own jitter, not a stall
export const STALL_MIN_MS = 50;
// the global Resource Timing buffer overflows (250 entries by default); the
// observer keeps its own small ring of the API's requests instead
export const RING_MAX = 64;
// the heaviest refresh that touched the wire during the turn
export const SYNC_STORIES = Object.freeze(['none', 'slices', 'snapshot', 'fallback']);

const r = (v) => Math.max(0, Math.round(v));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function normUrl(u) {
  try { return new URL(String(u)).href; } catch { return String(u || ''); }
}

// A resource entry reduced to what the receipt needs. Cross-origin detail is
// zero unless the server sent Timing-Allow-Origin; then it is left out, never
// read as a zero.
export function timingOf(e) {
  if (!e || !fin(e.startTime) || !fin(e.duration)) return null;
  const out = { netMs: r(e.duration) };
  if (fin(e.requestStart) && e.requestStart > 0 && fin(e.responseStart) && e.responseStart >= e.requestStart) {
    out.ttfbMs = r(e.responseStart - e.requestStart);
    const connect = fin(e.connectStart) && fin(e.connectEnd) && e.connectEnd > e.connectStart ? e.connectEnd - e.connectStart : 0;
    out.connectMs = r(connect);
    // TLS only on a connection made for this request; a reused one has none
    out.tlsMs = connect > 0 && fin(e.secureConnectionStart) && e.secureConnectionStart >= e.connectStart && e.connectEnd > e.secureConnectionStart
      ? r(e.connectEnd - e.secureConnectionStart) : 0;
  }
  return out;
}

// Is this entry that call? The same URL, started after the code asked for it
// and finished before the code saw the answer (a millisecond or two of slack
// for coarsened clocks).
const SLACK = 2;
export function matches(call, e) {
  return !!call && !!e && e.name === call.url
    && e.startTime >= call.t0 - SLACK && e.startTime <= call.t1 + SLACK
    && e.startTime + e.duration <= call.t1 + SLACK;
}

// The ring: the last RING_MAX API entries. A call and its entry can arrive in
// either order (the observer's callback is its own task), so a call that finds
// nothing waits in `pending` and the entry, when it comes, finds it.
export function createNetRing({ max = RING_MAX } = {}) {
  const ring = [];
  const pending = [];
  const bind = (call, e) => { e.claimed = true; call.timing = timingOf(e); };
  return {
    add(e) {
      if (!e || typeof e.name !== 'string') return;
      const entry = { ...e, claimed: false };
      const i = pending.findIndex((c) => matches(c, entry));
      if (i >= 0) { bind(pending[i], entry); pending.splice(i, 1); }
      ring.push(entry);
      while (ring.length > max) ring.shift();
    },
    claim(call) {
      let best = null;
      for (const e of ring) if (!e.claimed && matches(call, e) && (!best || Math.abs(e.startTime - call.t0) < Math.abs(best.startTime - call.t0))) best = e;
      if (best) { bind(call, best); return true; }
      pending.push(call);
      while (pending.length > max) pending.shift();
      return false;
    },
    size: () => ring.length,
  };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const max = (xs) => (xs.length ? Math.max(...xs) : 0);

// One turn's instrument. request(kind, { url, t0, t1 }) takes performance.now()
// stamps around a call; tick(now, hidden) is the 100 ms watchdog; sync(event)
// is 'slices' | 'snapshot' | 'fallback' | 'deferred' | 'aborted'. fields()
// returns the receipt's fields and closes the instrument.
export function createTurnNet({ ring = createNetRing() } = {}) {
  const calls = [];
  let closed = false;
  let last = null;
  let ticks = 0;
  let stallMax = 0;
  let stallSum = 0;
  let story = 'none';
  let deferred = 0;
  let aborted = false;
  return {
    request(kind, { url, t0, t1 } = {}) {
      if (closed || !NET_KINDS.includes(kind) || !fin(t0) || !fin(t1) || t1 < t0) return null;
      const call = { kind, url: normUrl(url), t0, t1, rtMs: r(t1 - t0), timing: null };
      calls.push(call);
      ring.claim(call);
      return call;
    },
    tick(now, hidden = false) {
      if (closed || !fin(now)) return;
      // a hidden page's timers are frozen or throttled by the system, not by
      // Nova: that gap says nothing about the main thread
      if (hidden) { last = null; return; }
      if (last !== null) {
        const late = now - last - STALL_TICK_MS;
        if (late >= STALL_MIN_MS) { stallSum += late; if (late > stallMax) stallMax = late; }
        ticks += 1;
      }
      last = now;
    },
    sync(event) {
      if (closed) return;
      if (event === 'deferred') { deferred += 1; return; }
      if (event === 'aborted') { aborted = true; deferred += 1; return; }
      if (SYNC_STORIES.indexOf(event) > SYNC_STORIES.indexOf(story)) story = event;
    },
    closed: () => closed,
    fields() {
      closed = true;
      const out = {};
      const one = (prefix, call) => {
        if (!call) return;
        out[`${prefix}RtMs`] = call.rtMs;
        const t = call.timing;
        if (!t) return;
        out[`${prefix}NetMs`] = t.netMs;
        if ('ttfbMs' in t) { out[`${prefix}ConnectMs`] = t.connectMs; out[`${prefix}TlsMs`] = t.tlsMs; out[`${prefix}TtfbMs`] = t.ttfbMs; }
      };
      one('tx', calls.filter((c) => c.kind === 'tx').at(-1));
      const ask = calls.filter((c) => c.kind === 'ask').at(-1);
      one('ask', ask);
      const polls = calls.filter((c) => c.kind === 'poll');
      if (ask || polls.length) {
        out.pollN = polls.length;
        if (polls.length) {
          out.pollRtMaxMs = max(polls.map((c) => c.rtMs));
          out.pollRtSumMs = sum(polls.map((c) => c.rtMs));
          const seen = polls.filter((c) => c.timing);
          out.pollNetN = seen.length;
          if (seen.length) {
            const held = seen.map((c) => Math.max(0, c.rtMs - c.timing.netMs));
            out.pollNetMaxMs = max(seen.map((c) => c.timing.netMs));
            out.pollHeldMaxMs = max(held);
            out.pollHeldSumMs = sum(held);
            const detail = seen.filter((c) => 'ttfbMs' in c.timing);
            if (detail.length) {
              out.pollConnectN = detail.filter((c) => c.timing.connectMs > 0).length;
              out.pollConnectMaxMs = max(detail.map((c) => c.timing.connectMs));
              out.pollTtfbMaxMs = max(detail.map((c) => c.timing.ttfbMs));
            }
          }
        }
      }
      if (ticks > 0) { out.stallMaxMs = r(stallMax); out.stallSumMs = r(stallSum); }
      out.sync = story;
      out.syncDeferred = deferred;
      if (aborted) out.syncAborted = true;
      return out;
    },
  };
}

// The observer, limited to the API's origin. `Observer` is the browser's
// PerformanceObserver (handed in, so a test can drive it); absent, nothing is
// watched and every netMs is simply missing.
export function watchResources({ Observer, origin, onEntry } = {}) {
  if (typeof Observer !== 'function' || typeof onEntry !== 'function') return () => {};
  let obs = null;
  try {
    obs = new Observer((list) => {
      let base = '';
      try { base = String(origin?.() || ''); } catch { base = ''; }
      if (!base) return;
      for (const e of list.getEntries()) {
        if (typeof e?.name !== 'string' || !e.name.startsWith(`${base.replace(/\/$/, '')}/`)) continue;
        onEntry({
          name: e.name, startTime: e.startTime, duration: e.duration,
          connectStart: e.connectStart, connectEnd: e.connectEnd, secureConnectionStart: e.secureConnectionStart,
          requestStart: e.requestStart, responseStart: e.responseStart,
        });
      }
    });
    obs.observe({ type: 'resource' });
  } catch { return () => {}; }
  return () => { try { obs.disconnect(); } catch { /* already gone */ } };
}

// THE BRIDGE (the listenCause.js pattern): the dictation hook reports the
// turn's upload without a prop through every view model. Unbound, a no-op.
let sink = null;
export function bindTurnNet(fn) {
  sink = typeof fn === 'function' ? fn : null;
  return () => { if (sink === fn) sink = null; };
}
export function noteTurnRequest(kind, timing) {
  try { sink?.(kind, timing); } catch { /* an instrument is never in the way of the turn */ }
}

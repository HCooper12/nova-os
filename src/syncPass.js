// THE BULK SYNC'S SNAPSHOT, AND WHAT HAPPENS WHEN IT FAILS (22 Nov 2026).
//
// On 18 Nov his phone refreshed everything twice as his spoken turn began: a
// whole /api/snapshot, and 90 ms later the per-slice fallback (38 requests
// then, more now). App.refreshLiveData allowed exactly that. A sync left in
// flight when iOS froze the app has its 120 s watchdog fire on resume, which
// frees the in-flight flag; the resume handler starts a fresh snapshot; the
// old sync's snapshot then fails (its socket died, or its own timeout came
// due), its ping succeeds on the fresh network, and it runs the fallback
// beside the newer sync, because nothing asked whether it was still the sync
// that counted (design/SPEED-DISPLAY-STUDY.md, section 2).
//
// Two rules, decided here and nowhere else:
//   - EVERY BULK SYNC HAS A GENERATION. A sync that fails after a newer one
//     has started, or that was called off, abandons silently: no fallback, no
//     offline chip, no degraded retry. The newer sync owns the screen.
//   - ONE RETRY BEFORE THE FALLBACK. A current sync whose snapshot fails asks
//     the Mac a tiny ping; a good ping earns the snapshot one more try, and
//     only a second failure runs the per-slice fallback. A failed ping is what
//     it always was: OFFLINE when nothing answered, the fallback when the Mac
//     answered with an error. A failed retry is judged by that same old rule.
//
// Pure: the requests are handed in, so node:test drives every branch
// (server/test/syncPass.test.js). No React, no browser globals.

// The next step after a failed snapshot.
//   current     this sync is still the newest and was not called off
//   attempt     1 for the first snapshot, 2 for the retry
//   unreachable the failure carried no HTTP status (outbox.js macUnreachable)
//   ping        null before the ping is asked, then true or false
// → 'abandon' | 'ping' | 'retry' | 'fallback' | 'offline'
export function failureStep({ current, attempt = 1, unreachable = false, ping = null }) {
  if (!current) return 'abandon';
  if (ping === null) {
    // the first failure always asks; the retry's failure asks only when
    // nothing answered, exactly as a failed snapshot did before this rule
    if (attempt === 1 || unreachable) return 'ping';
    return 'fallback';
  }
  if (attempt === 1) {
    if (ping) return 'retry';
    return unreachable ? 'offline' : 'fallback';
  }
  return ping ? 'fallback' : 'offline';
}

// Runs the snapshot, at most twice, and says how the pass ended:
//   { outcome: 'ok', value, tries }    apply value
//   { outcome: 'fallback', tries }     run the per-slice fallback
//   { outcome: 'offline', tries }      say OFFLINE
//   { outcome: 'abandon', tries }      do nothing at all: a newer sync owns it
// isCurrent() is asked after every await, so a newer sync starting while
// this one pinged still makes this one step aside.
export async function snapshotPass({ isCurrent, snapshot, ping, unreachable = () => false }) {
  let attempt = 1;
  for (;;) {
    let error;
    try {
      const value = await snapshot(attempt);
      return { outcome: 'ok', value, tries: attempt };
    } catch (e) {
      error = e;
    }
    let pinged = null;
    let step;
    for (;;) {
      let gone = false;
      try { gone = !!unreachable(error); } catch { gone = false; }
      step = failureStep({ current: !!isCurrent(), attempt, unreachable: gone, ping: pinged });
      if (step !== 'ping') break;
      pinged = await Promise.resolve().then(ping).then((ok) => ok !== false, () => false);
    }
    if (step !== 'retry') return { outcome: step, tries: attempt, error };
    attempt += 1;
  }
}

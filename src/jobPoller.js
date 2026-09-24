// Every AI feature follows the same shape: a POST starts a job on the server,
// then the job id is polled until it lands on ready/error. This replaces the
// nine hand-rolled setInterval loops App.jsx used to carry.
//
// 25 SEP 2026 — HIS SCREENSHOT: a detailed Coach question ended in
// "Timed out waiting for the server — the job may still be running." Three
// separate faults sat behind that one sentence, and this file had all three:
//
//   THE CLOCK RAN IN HIS POCKET. The timeout was wall-clock from the start,
//   and iOS freezes a backgrounded page's timers — so switching apps for
//   three minutes and coming back declared a timeout on the first tick
//   WITHOUT EVER ASKING THE SERVER. Now nothing is declared without a fetch,
//   and the page checks the moment it becomes visible again.
//
//   "SLOW" WAS TREATED AS "FAILED". A careful answer can take longer than the
//   budget a caller guessed. Past `timeoutMs` the job is now only SLOW: the
//   caller is told once (onSlow, so it can say "still working") and polling
//   carries on, slower, up to a hard ceiling.
//
//   A LOST JOB LOOKED LIKE A SLOW ONE. The server keeps jobs in memory; a
//   restart forgets them and answers 404. That is not "may still be
//   running" — it is definitely gone, and the honest thing is to say so at
//   once (onLost) so the question can be asked again. (That morning's cause
//   was a server reload 23s into his question; scripts/reload-server.mjs now
//   waits for running jobs.)
//
// And a network blip is retried with backoff instead of three strikes in six
// seconds — a phone on a gym's wifi drops for longer than that.

export const LOST_MESSAGE = 'Your Mac restarted while this was running, so the answer was lost. Ask again.';
export const CEILING_MESSAGE = 'This has been running for a very long time without an answer, so I stopped waiting. It may still land in the Inbox.';

// How long until the next look. A failing connection backs off (1s → 16s);
// a slow job is looked at less often than a fresh one.
export function nextDelay({ age, failures, intervalMs, timeoutMs }) {
  if (failures > 0) return Math.min(16_000, 1000 * 2 ** Math.min(failures - 1, 4));
  return age > timeoutMs ? Math.max(intervalMs, 5000) : intervalMs;
}

export function pollJob(fetchJob, {
  onReady, onError, onProgress, onSlow, onLost,
  intervalMs = 2000, timeoutMs = 5 * 60_000, ceilingMs,
  now = () => Date.now(), setT = (fn, ms) => setTimeout(fn, ms), clearT = (t) => clearTimeout(t),
  doc = typeof document !== 'undefined' ? document : null,
}) {
  const ceiling = ceilingMs ?? Math.max(30 * 60_000, timeoutMs * 2);
  let cancelled = false;
  let timer = null;
  let inFlight = false;
  let failures = 0;
  let slowSaid = false;
  const startedAt = now();

  const finish = () => {
    cancelled = true;
    clearT(timer);
    doc?.removeEventListener?.('visibilitychange', onVis);
  };
  const schedule = () => {
    clearT(timer);
    timer = setT(tick, nextDelay({ age: now() - startedAt, failures, intervalMs, timeoutMs }));
  };

  async function tick() {
    if (cancelled || inFlight) return;
    inFlight = true;
    let job;
    try {
      job = await fetchJob();
      failures = 0;
    } catch (e) {
      inFlight = false;
      if (cancelled) return;
      if (e && e.status === 404) {
        finish();
        (onLost || onError)(LOST_MESSAGE, { lost: true });
        return;
      }
      failures += 1;
      if (now() - startedAt > ceiling) {
        finish();
        onError('Lost contact with the server: ' + (e?.message || 'network error'));
        return;
      }
      schedule();
      return;
    }
    inFlight = false;
    if (cancelled) return;
    if (job.status === 'ready') { finish(); onReady(job); return; }
    if (job.status === 'error') { finish(); onError(job.error || 'The job failed.'); return; }
    onProgress?.(job);
    const age = now() - startedAt;
    if (age > ceiling) { finish(); onError(CEILING_MESSAGE); return; }
    if (age > timeoutMs && !slowSaid) { slowSaid = true; onSlow?.(job); }
    schedule();
  }

  // iOS froze the timers while he was away: look NOW, not whenever the
  // stale timer next fires
  function onVis() {
    if (cancelled || doc?.visibilityState !== 'visible') return;
    clearT(timer);
    tick();
  }
  doc?.addEventListener?.('visibilitychange', onVis);

  schedule();
  return { cancel: finish };
}

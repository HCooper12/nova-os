// Every AI feature follows the same shape: a POST starts a job on the server,
// then the job id is polled until it lands on ready/error. This replaces the
// nine hand-rolled setInterval loops App.jsx used to carry — and unlike them
// it surfaces network failures and timeouts instead of spinning forever.
export function pollJob(fetchJob, { onReady, onError, onProgress, intervalMs = 2000, timeoutMs = 5 * 60_000 }) {
  let cancelled = false;
  let timer = null;
  let consecutiveFailures = 0;
  const startedAt = Date.now();

  const schedule = () => {
    timer = setTimeout(tick, intervalMs);
  };

  const tick = async () => {
    if (cancelled) return;
    if (Date.now() - startedAt > timeoutMs) {
      onError('Timed out waiting for the server — the job may still be running.');
      return;
    }
    let job;
    try {
      job = await fetchJob();
      consecutiveFailures = 0;
    } catch (e) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        onError('Lost contact with the server: ' + (e?.message || 'network error'));
        return;
      }
      schedule();
      return;
    }
    if (cancelled) return;
    if (job.status === 'ready') onReady(job);
    else if (job.status === 'error') onError(job.error || 'The job failed.');
    else {
      onProgress?.(job);
      schedule();
    }
  };

  schedule();
  return {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
    },
  };
}

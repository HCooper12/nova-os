// THE COULDN'T-LOOK STATE — "checked and clean" vs "quietly broken", once.
//
// Seven surfaces computed a verdict from sources that can fail — the food log,
// the calendar, the session history, the volume engine — and every one caught
// the failure with a fallback (`.catch(() => [])`) that made "couldn't read
// it" render exactly like "read it, nothing there": a clear week from a CalDAV
// outage, a clean fuel bill from an unreadable food log, an early-history
// "not yet" from a volume engine that threw, a rest day from a dead vault
// read. The program audit named the rule — A DETECTOR THAT CANNOT RUN MUST
// SAY SO — and then broke it in its own plumbing.
//
// loadSources runs the named loaders together, keeps each one's fallback so
// the caller's code shape is unchanged, and returns WHICH ONES FAILED with
// the reason. The consumer then says so in its own voice — the fuel check's
// line, the week plan's calendar line, the audit's fourth state — and never
// concludes cleanliness from a source it could not read.

export async function loadSources(loaders) {
  const names = Object.keys(loaders);
  const settled = await Promise.allSettled(names.map((n) => Promise.resolve().then(() => loaders[n].load())));
  const values = {};
  const failed = [];
  names.forEach((n, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      values[n] = r.value;
    } else {
      values[n] = loaders[n].fallback;
      failed.push({ source: n, reason: String(r.reason?.message || r.reason || 'unknown error') });
    }
  });
  return { values, failed, ok: failed.length === 0 };
}

// "food log unreadable (ENOENT …), calendar unreadable (503)" — the failed
// sources named for a human, in the consumer's own labels.
export function unreadable(failed, labels = {}) {
  return (failed || [])
    .map((f) => `${labels[f.source] || f.source} unreadable${f.reason ? ` (${f.reason.slice(0, 80)})` : ''}`)
    .join(', ');
}

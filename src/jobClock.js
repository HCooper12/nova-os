// HOW LONG HAS THIS BEEN RUNNING — the half of "is anything happening?" the
// job tray never answered.
//
// The tray already lists every long-running thing (valsChrome.jobTray) and its
// own comment says why it exists: a vault ingest runs 15-40 minutes outside
// the record rails, and the tray was the one place that could say so. But a
// label reading "Researching" for four minutes is a spinner with words on it.
// His instruction, 18 Sep: the tray must be live and accurate.
//
// TWO KINDS OF START, and only one of them is trustworthy across a reload:
//
//   SERVER-STAMPED — a classifying inbox record, a staged ingest job. These
//     carry a real createdAt from the Mac, so the elapsed time is true even if
//     he reloads the PWA or opens it on a second device. Use it directly.
//   CLIENT FLAGS — codeBusy, leaderBusy, forgeBusy and friends. There is no
//     timestamp anywhere because the fact itself is client-only: the flag
//     dies on reload, so a start time that dies with it is not a loss.
//     sinceFor() remembers when the flag FIRST went true.
//
// Why a module and not App state: App is one class component whose every
// setState recomputes the entire view model (see the perf memory). Stamping a
// start time through setState would re-render the whole app; ticking a clock
// through it would re-render the whole app once a second, forever, while any
// job runs. So the marks live here and the tick lives in Elapsed.jsx, which is
// a leaf that re-renders only itself.

const marks = new Map();

// When did `id` first become active? Called from the val builders, which run
// on every render — so it must be cheap and must not lie on the second call.
// Going inactive forgets the mark, so the next run of the same job starts its
// own clock rather than inheriting the last one's.
export function sinceFor(id, active, now = Date.now()) {
  if (!active) { marks.delete(id); return null; }
  if (!marks.has(id)) marks.set(id, now);
  return marks.get(id);
}

// A server timestamp → epoch ms, or null. Everything operational in Nova is
// written UTC (he is AEST), and Date.parse of an ISO string with a Z handles
// that correctly — the trap is only ever in DISPLAYING a wall clock, and this
// displays a DIFFERENCE, which no timezone can affect.
export function startedFrom(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  // A start in the future is a clock-skew artefact between his phone and the
  // Mac, not a job that has not begun. Clamped, because "-3s" on a running
  // job reads as a bug and the honest reading is "just started".
  return t;
}

// "just now" · "42s" · "3m 12s" · "1h 04m". Seconds are dropped past an hour:
// nobody reads the seconds on a forty-minute ingest, and a two-digit minute
// keeps the column from jittering as it ticks.
export function formatElapsed(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '';
  const s = Math.floor(ms / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

// What the tray shows for one job. Null for anything finished or failed: those
// rows already say what they are ("Ready for review", the error), and a timer
// that kept counting after the work stopped would be the tray's own version of
// the "1 running" bug it was built to end — a number that means nothing.
export function elapsedLabel(job, now = Date.now()) {
  if (!job || job.done || job.failed || !job.startedAt) return '';
  return formatElapsed(Math.max(0, now - job.startedAt));
}

// test hook — the marks outlive a test file otherwise
export function _resetJobClock() { marks.clear(); }

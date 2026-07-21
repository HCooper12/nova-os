import { fetchEventsForDay } from './calendar.js';
import { broadcast, clientCount } from './events.js';

// iCloud CalDAV has no push, so to make an edit made in Apple Calendar appear in
// an already-open Nova we poll for changes and broadcast when today's events
// actually differ. Deliberately cheap: it only fetches while a client is
// listening (no open app → no polling, so it's free at rest), and the
// on-foreground refresh already handles "just opened the app" — this covers
// "left Nova open while editing the calendar somewhere else". True-instant isn't
// possible over CalDAV; this lands changes within a poll interval.
const POLL_MS = 25_000;

export function startCalendarWatch() {
  let lastHash = null;
  const tick = async () => {
    if (clientCount() === 0) return; // nobody to notify — don't hammer iCloud
    try {
      const events = await fetchEventsForDay(new Date());
      const hash = JSON.stringify(events);
      if (lastHash !== null && hash !== lastHash) broadcast('calendar');
      lastHash = hash; // first successful poll just sets the baseline, no spurious push
    } catch {
      // transient CalDAV error — retry next tick, never crash the watcher
    }
  };
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  return () => clearInterval(iv);
}

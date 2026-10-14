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

// THE NEXT EVENT, 10 MINUTES OUT (lib/alerts.js, tier now). Runs every tick
// whether or not a client is open, because the alert is for when Nova is
// NOT on screen — but reads the warm cache only (peek), so at rest it costs
// iCloud nothing; every ~5 minutes with no client it lets the cache refresh
// once (fetchEventsForDay answers from cache inside its 90 s TTL).
const SOON_REFRESH_TICKS = 12;
async function checkSoon(n) {
  const cal = await import('./calendar.js');
  let events = await cal.peekCachedEventsForDay(new Date());
  if (!events || n % SOON_REFRESH_TICKS === 0) events = await cal.fetchEventsForDay(new Date()).catch(() => events);
  if (!events?.length) return;
  const { calendarSoonCheck } = await import('./alerts.js');
  await calendarSoonCheck(events);
}

export function startCalendarWatch() {
  let lastHash = null;
  let n = 0;
  const tick = async () => {
    // beat before the early return, for the same reason briefWarm does: this
    // watcher legitimately idles whenever no client is connected, and an
    // idle scheduler must not be indistinguishable from a dead one.
    import('./heartbeat.js').then(({ beat }) => beat('calendar-watch')).catch(() => {});
    n += 1;
    checkSoon(n).catch((e) => console.log(`calendar soon-check failed: ${e.message}`));
    if (clientCount() === 0) return; // nobody to notify — don't hammer iCloud
    try {
      // fresh: the watcher's whole job is spotting edits made elsewhere, and
      // its fetch is what keeps the shared cache warm for everyone else
      const events = await fetchEventsForDay(new Date(), { fresh: true });
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

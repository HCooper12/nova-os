// NOVA READS APPLE HEALTH ITSELF (his call, 14 Oct 2026: "so that all of the
// data and information is as accurate all the time as possible"). Inside the
// native shell only: ios/App/App/NovaHealthPlugin.swift reads each day's
// numbers the way the Health app counts them, and this sends them to the Mac
// through the same POST /api/health-data the old Shortcut used (flagged
// source:'healthkit', so the server files them on the exact day). Everywhere
// else, the Home Screen PWA and a browser, it does nothing.
//
// When: on open and every time Nova comes back to the front, at most once
// every five minutes. What: today (still counting) and yesterday (so the
// evening's last steps and the Watch's late sync always land in full).

export const MIN_GAP_MS = 5 * 60_000;
// v2 (26 Oct): workouts + heart rate joined the read set, so iOS must be asked once more
// v3 (26 Oct 2026): body fat and lean mass were added, and iOS only shows the
// sheet for types it has not asked about — so the new ones need one more ask
const ASKED_KEY = 'novaos.healthAsked.v3';

function plugin() {
  try {
    const C = typeof window !== 'undefined' ? window.Capacitor : null;
    if (!C?.isNativePlatform?.()) return null;
    return C.Plugins?.NovaHealth || null;
  } catch { return null; }
}

export function healthKitAvailable() {
  return !!plugin();
}

// a calendar date in HIS time zone, never UTC (the 14 Sep AEST trap)
export function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// the days to read at `now`: today, then yesterday
export function daysToRead(now) {
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return [localDate(today), localDate(yesterday)];
}

// only numbers that are really there; an empty day sends nothing
export function usableMetrics(m) {
  const out = {};
  for (const [k, v] of Object.entries(m || {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

let lastAt = 0;
let running = null;

// `send(date, metrics)` posts one day; `onSent()` lets the app refresh what it shows
export function syncHealth({ send, onSent, now = Date.now(), force = false } = {}) {
  const p = plugin();
  if (!p || !send) return Promise.resolve({ skipped: 'no-health' });
  if (running) return running;
  if (!force && now - lastAt < MIN_GAP_MS) return Promise.resolve({ skipped: 'recent' });
  lastAt = now;
  running = (async () => {
    // iOS shows its permission sheet once; after that this resolves at once
    let asked = false;
    try { asked = localStorage.getItem(ASKED_KEY) === '1'; } catch { /* private mode */ }
    if (!asked) {
      await p.requestAccess();
      try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* private mode */ }
    }
    let sent = 0;
    for (const date of daysToRead(now)) {
      const r = await p.readDay({ date });
      const metrics = usableMetrics(r?.metrics);
      if (!Object.keys(metrics).length) continue;
      await send(date, metrics);
      sent += 1;
    }
    if (sent && onSent) onSent();
    return { sent };
  })().catch((e) => {
    lastAt = 0; // a failure (no signal, Mac asleep) tries again on the next open
    return { error: e?.message || String(e) };
  }).finally(() => { running = null; });
  return running;
}

// The offline outbox — Nova's writes survive the backend being unreachable
// (Mac asleep, off Tailscale). Actions that fail with a CONNECTIVITY-shaped
// error are queued here (localStorage, survives app kills) and drained
// automatically when the backend answers again. Server REJECTIONS (4xx —
// the server saw it and said no) are never queued: retrying a rejection is
// a loop, not resilience; they mark the item failed for the user to see.
//
// Honesty rule: queued work is never presented as synced — the OUTBOX chip
// carries the count, and day totals/lists simply don't include what hasn't
// landed. No optimistic fiction.
const KEY = 'novaos.outbox';
const CAP = 200;

export function loadOutbox() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, CAP)));
  } catch {
    /* quota/private-mode — the in-memory copy still drives this session */
  }
}

// Connectivity-shaped failures only: fetch network errors (TypeError —
// "Failed to fetch"/"Load failed") and our AbortSignal timeouts. A timeout
// is technically ambiguous (the server MAY have processed it) — for every
// queued kind a rare duplicate is visible and fixable (entries/sessions can
// be deleted; health days upsert), which beats losing the write.
export function isOfflineError(err) {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  return err.name === 'AbortError' || err.name === 'TimeoutError';
}

// The sync's first request failed: was the Mac unreachable, or did it answer
// with an error? Only an answer (an HTTP status) proves it is there. The
// fallback fetches cannot be trusted to say: several swallow their own
// failure and so "succeed" with no network, which kept the chip on LIVE in
// airplane mode (his report, 14 Oct 2026).
export function macUnreachable(err) {
  return !Number.isFinite(err?.status) && isOfflineError(err);
}

// ONE KEY PER WRITE, stamped before the first try and carried by every
// replay as the Idempotency-Key header (api.js withIdempotencyKey), so a
// write that timed out but landed is answered, not filed again, when the
// Outbox sends it a second time (server/lib/idempotency.js).
export function newIdempotencyKey(kind) {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
  return `nova-${String(kind || 'w').replace(/[^A-Za-z0-9]/g, '').slice(0, 16)}-${rand}`;
}

// a key built from data (a session's clientKey) made safe for the header
export function idemSafe(raw) {
  const k = String(raw || '').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80);
  return k.length >= 8 ? k : null;
}

// the key an item replays under; items queued before keys existed get one
// derived from their own id, stable across every replay of that item
export function keyOf(item) {
  return item?.key || `outbox-${item?.id}`;
}

// Drain FIFO. Each item replays through its kind's function; a connectivity
// failure stops the whole drain with everything after it still queued (the
// next reconnect resumes in order), a server REJECTION marks that one item
// failed for him to see and the drain goes on. Pure over its arguments so the
// order and the stop rule are tested (server/test/outboxDrain.test.js).
export async function drainItems(items, fns, { send, onSent, onFailed }) {
  let sent = 0;
  for (const item of items) {
    if (item.status !== 'queued') continue;
    const fn = fns[item.kind];
    try {
      if (fn) await send(keyOf(item), () => fn(item.payload));
      onSent(item);
      sent++;
    } catch (e) {
      if (isOfflineError(e)) return { sent, stopped: true };
      onFailed(item, e);
    }
  }
  return { sent, stopped: false };
}

export function makeOutboxItem(kind, label, payload, key = null) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    key: key || newIdempotencyKey(kind),
    kind,
    label: String(label || kind).slice(0, 60),
    payload,
    queuedAt: new Date().toISOString(),
    status: 'queued', // queued → (drained away) | failed (server rejected on flush)
    error: null,
  };
}

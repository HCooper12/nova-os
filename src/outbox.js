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

export function makeOutboxItem(kind, label, payload) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind,
    label: String(label || kind).slice(0, 60),
    payload,
    queuedAt: new Date().toISOString(),
    status: 'queued', // queued → (drained away) | failed (server rejected on flush)
    error: null,
  };
}

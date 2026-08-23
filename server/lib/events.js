// The live wire: long-lived streaming responses the app listens on, and a
// broadcast() every write path calls. This is what makes a health push from
// the phone appear in an open Nova within a second instead of at the next
// 5-minute poll. SSE line format over plain fetch (EventSource can't send
// the Authorization header, so the client reads the stream itself).

import { slicesForKind } from './writeSlices.js';

const clients = new Set();

export function subscribe(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`data: {"kind":"hello"}\n\n`);
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

// `slices` names what the write actually touched (see lib/writeSlices.js) so
// the client can pull those instead of a whole snapshot. Omitted or null means
// "unknown" and the client resyncs everything — the old behaviour, unchanged.
export function broadcast(kind, meta = null) {
  // A caller that didn't pass slices may still be nameable from its kind
  // (broadcast('todos') and friends) — otherwise this stays absent and the
  // client resyncs everything, exactly as before.
  const slices = meta?.slices || slicesForKind(kind);
  const line = `data: ${JSON.stringify({ kind, at: Date.now(), ...(meta || {}), ...(slices ? { slices } : {}) })}\n\n`;
  for (const res of clients) {
    try {
      res.write(line);
    } catch {
      clients.delete(res);
    }
  }
}

// keep intermediaries from timing the streams out
setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': ping\n\n');
    } catch {
      clients.delete(res);
    }
  }
}, 25_000).unref?.();

export function clientCount() {
  return clients.size;
}

// HIS PHONE AS THE MAC'S CAMERA (8 Nov 2026, his ask: "my phone's camera
// with a live feed to the Mac on Nova … like Apple's handoff").
//
// Both devices already talk to this server over his tailnet, so the feed
// goes through it: the phone posts a small JPEG frame a few times a second
// (POST /api/camera/frame), the Mac shows the latest (GET /api/camera/frame)
// and the model on this Mac looks at the same frame when he asks for boxes
// (lib/see.js with source 'phone'). Latency is a few hundred milliseconds,
// bandwidth about 150 kB/s. Nothing is written to disk: one frame lives in
// memory and dies after STALE_MS without a newer one. A WebRTC path (peer
// to peer, lower latency) is the later upgrade; this is the honest first
// version that needs no new plumbing on either device.

export const STALE_MS = 4000;
export const MAX_FRAME_BYTES = 600 * 1024;

const state = { buf: null, type: 'image/jpeg', at: 0, from: null, seq: 0 };

/** Keep the newest frame. `image` is a data URL (jpeg/png/webp) or base64.
 *  Returns { ok, seq, bytes } or { error }. Pure over the state. */
export function setFrame(image, { from = 'phone', now = Date.now() } = {}) {
  const s = String(image || '');
  const m = s.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  const b64 = m ? m[2] : (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 100 ? s : null);
  if (!b64) return { error: 'not an image' };
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { return { error: 'not an image' }; }
  if (!buf.length) return { error: 'an empty frame' };
  if (buf.length > MAX_FRAME_BYTES) return { error: `a frame over ${Math.round(MAX_FRAME_BYTES / 1024)} kB; send a smaller one` };
  state.buf = buf;
  state.type = m ? m[1].replace('jpg', 'jpeg') : 'image/jpeg';
  state.at = now;
  state.from = String(from || 'phone').slice(0, 40);
  state.seq += 1;
  return { ok: true, seq: state.seq, bytes: buf.length };
}

/** The latest frame, or null when none or stale. */
export function latestFrame({ now = Date.now() } = {}) {
  if (!state.buf || now - state.at > STALE_MS) return null;
  return { buf: state.buf, type: state.type, at: state.at, from: state.from, seq: state.seq };
}

/** The latest frame as a data URL for the model on this Mac, or null. */
export function latestDataUrl(opts) {
  const f = latestFrame(opts);
  return f ? `data:${f.type};base64,${f.buf.toString('base64')}` : null;
}

/** What the Mac asks every few seconds: is a phone beaming? */
export function relayState({ now = Date.now() } = {}) {
  const f = latestFrame({ now });
  return { live: !!f, at: f ? new Date(f.at).toISOString() : null, from: f ? f.from : null, seq: f ? f.seq : state.seq, ageMs: f ? now - f.at : null };
}

export function _resetForTests() { state.buf = null; state.at = 0; state.from = null; state.seq = 0; }

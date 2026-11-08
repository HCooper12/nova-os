// THE PHONE'S LIVE FEED, PEER TO PEER (8 Nov 2026, his call: "as smooth and
// as minimal delay as possible"). The frame relay (lib/cameraRelay.js) stays
// as the fallback and as what the model on this Mac looks at; the live
// picture itself goes phone → Mac over WebRTC on his tailnet, and this file
// is only the post box the two sides use to find each other: the phone
// leaves an offer, the Mac leaves an answer, each leaves ICE candidates, and
// each reads the other's. One room (his), in memory, cleared when a side
// hangs up or after ROOM_MS without a word. No TURN server: both devices are
// on the tailnet, so host candidates reach; a STUN hint is passed to the
// clients for the case they are on different networks.

export const ROOM_MS = 60_000;
export const STUN = ['stun:stun.l.google.com:19302'];

const rooms = new Map(); // key -> { offer, answer, cands: { phone: [], mac: [] }, at, seq }

function room(key = 'his', now = Date.now()) {
  let r = rooms.get(key);
  if (r && now - r.at > ROOM_MS) { rooms.delete(key); r = null; }
  if (!r) { r = { offer: null, answer: null, cands: { phone: [], mac: [] }, at: now, seq: 0, hungUp: null }; rooms.set(key, r); }
  return r;
}

/** Leave a message. `role` is 'phone' or 'mac'; `type` is 'offer', 'answer',
 *  'candidate' or 'bye'. Returns the room's seq. */
export function leave({ role, type, sdp = null, candidate = null, key = 'his', now = Date.now() }) {
  if (role !== 'phone' && role !== 'mac') return { error: 'role must be phone or mac' };
  const r = room(key, now);
  r.at = now; r.seq += 1;
  if (type === 'offer' && role === 'phone') { if (!sdp) return { error: 'an offer needs sdp' }; r.offer = { sdp, seq: r.seq }; r.answer = null; r.cands = { phone: [], mac: [] }; r.hungUp = null; }
  else if (type === 'answer' && role === 'mac') { if (!sdp) return { error: 'an answer needs sdp' }; r.answer = { sdp, seq: r.seq }; }
  else if (type === 'candidate') { if (!candidate) return { error: 'a candidate is required' }; if (r.cands[role].length < 64) r.cands[role].push({ ...candidate, seq: r.seq }); }
  else if (type === 'bye') { r.hungUp = role; r.offer = null; r.answer = null; r.cands = { phone: [], mac: [] }; }
  else return { error: `no such message: ${type} from ${role}` };
  return { ok: true, seq: r.seq };
}

/** Read the other side's messages newer than `since`. */
export function read({ role, since = 0, key = 'his', now = Date.now() }) {
  if (role !== 'phone' && role !== 'mac') return { error: 'role must be phone or mac' };
  const r = room(key, now);
  const other = role === 'phone' ? 'mac' : 'phone';
  const out = { seq: r.seq, stun: STUN, hungUp: r.hungUp && r.hungUp !== role ? r.hungUp : null };
  if (role === 'mac' && r.offer && r.offer.seq > since) out.offer = r.offer.sdp;
  if (role === 'phone' && r.answer && r.answer.seq > since) out.answer = r.answer.sdp;
  out.candidates = r.cands[other].filter((c) => c.seq > since).map(({ seq, ...c }) => c);
  return out;
}

export function _resetForTests() { rooms.clear(); }

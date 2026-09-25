// THE VOICE CHAT AND THE RECORD — pure helpers, so the rules are testable
// outside the 9,000-line App.
//
// His ask, 25 Sep 2026: "Anything that I speak with Nova about should always
// appear in this voice chat as a historical record." The voice chat was each
// device's own localStorage; the record (server/lib/conversationLog.js) is
// the one history every door writes to. Two directions:
//   up:   every settled line in the voice chat is mirrored to the record,
//         keyed by an id made from this device + the line's own time + who,
//         so a retry or an edit never duplicates;
//   down: the Voice screen merges in the record's lines it does not have
//         (another device, Siri, the Action Button), in time order.

const WHO = new Set(['you', 'nova', 'system']);

// 'iPhone' / 'iPad' / 'Mac' / 'Windows' / '' from a user agent. Named on each
// line so "which device did I say that on" is answerable.
export function deviceName(ua = '') {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return '';
}

// A per-device id, made once and kept. Never derived from anything personal.
export function deviceId(storage) {
  try {
    const have = storage?.getItem('novaos.deviceId');
    if (have && /^[a-z0-9]{6,16}$/.test(have)) return have;
    const made = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    storage?.setItem('novaos.deviceId', made);
    return made;
  } catch {
    return 'nostore0';
  }
}

export const cidOf = (m, dev) => m.cid || `${dev}-${m.at}-${m.who}`;

// Small, stable fingerprint of a line's text, so "already sent this version"
// is remembered without storing his words twice on the device.
export function textKey(text) {
  const s = String(text || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${s.length}:${h.toString(36)}`;
}

// The lines the record does not yet have in their current wording. A line
// still streaming or typing is not settled; a line with no clock or no words
// is not a line anyone said.
export function pendingTurns(chat, synced, { dev, device = '' } = {}) {
  const out = [];
  for (const m of chat || []) {
    if (!m || m.streaming || m.typing || !WHO.has(m.who)) continue;
    if (typeof m.text !== 'string' || !m.text.trim() || !Number.isFinite(m.at)) continue;
    const id = cidOf(m, dev);
    if (synced?.[id] === textKey(m.text)) continue;
    out.push({
      id, at: new Date(m.at).toISOString(), who: m.who, text: m.text,
      via: m.via || 'voice',
      ...((m.device || device) ? { device: m.device || device } : {}),
    });
  }
  return out;
}

// The record's lines merged into the local chat: anything the chat already
// holds (by id) is left exactly as it is, so a line with its panels and
// buttons is never replaced by the plain record copy.
export function mergeRecord(chat, turns, { dev } = {}) {
  const local = chat || [];
  const have = new Set(local.map((m) => cidOf(m, dev)));
  const incoming = [];
  for (const t of turns || []) {
    if (!t?.id || have.has(t.id) || !WHO.has(t.who)) continue;
    const at = Date.parse(t.at);
    if (!Number.isFinite(at)) continue;
    incoming.push({ at, who: t.who, text: t.text, via: t.via, device: t.device, cid: t.id, fromRecord: true });
  }
  if (!incoming.length) return local;
  // stable by time; a local line with no clock keeps its place at the front
  return [...local, ...incoming].map((m, i) => ({ m, i }))
    .sort((a, b) => ((a.m.at ?? -Infinity) - (b.m.at ?? -Infinity)) || (a.i - b.i))
    .map(({ m }) => m);
}

const VIA_WORDS = { siri: 'Siri', 'action-button': 'Action Button' };

// Where a line came from, for the voice chat's small time label — only when
// it is not this device's own screen, so his own thread stays quiet.
export function whereLabel(m, { device = '' } = {}) {
  if (VIA_WORDS[m?.via]) return VIA_WORDS[m.via];
  if (m?.fromRecord && m.device && m.device !== device) return `on your ${m.device}`;
  return null;
}

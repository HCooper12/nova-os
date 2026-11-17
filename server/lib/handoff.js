// HANDOFF (17 Nov 2026): what he is doing right now, so the other device can
// offer to carry it on ("continue on your phone"). One small record per
// device, in memory only, living 10 minutes: a handoff that old is no longer
// "right now", and a restart losing it costs nothing. Nothing here is a
// source of truth; it is a hint with an expiry.
export const HANDOFF_TTL_MS = 10 * 60_000;
export const KINDS = ['talk', 'fuel'];
const TITLE_MAX = 120;
const MAX_DEVICES = 20; // bounded: the door is on the public internet

let clock = () => Date.now();
export function setHandoffClock(fn) { clock = typeof fn === 'function' ? fn : () => Date.now(); }

const records = new Map(); // device -> { device, deviceName?, kind, title, at (ms) }

function prune(t) {
  for (const [k, v] of records) if (t - v.at >= HANDOFF_TTL_MS) records.delete(k);
}

export function setHandoff({ device, deviceName, kind, title } = {}) {
  if (!KINDS.includes(kind)) {
    const e = new Error(`kind must be one of ${KINDS.join(', ')}`);
    e.code = 'bad_kind';
    throw e;
  }
  const t = clock();
  prune(t);
  if (!records.has(device) && records.size >= MAX_DEVICES) {
    const oldest = [...records.values()].sort((a, b) => a.at - b.at)[0];
    records.delete(oldest.device);
  }
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : '';
  records.set(device, { device, ...(deviceName ? { deviceName: String(deviceName).slice(0, 40) } : {}), kind, title: clean, at: t });
}

/** The newest live record from any device other than `device`, else null. */
export function handoffFor(device) {
  const t = clock();
  prune(t);
  const others = [...records.values()].filter((r) => r.device !== device).sort((a, b) => b.at - a.at);
  const r = others[0];
  return r ? { ...r, at: new Date(r.at).toISOString() } : null;
}

export function _resetHandoffForTests() { records.clear(); clock = () => Date.now(); }

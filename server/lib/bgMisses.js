// The phone's list of background Health wakes that failed (NovaHealthBackground
// in NovaHealthPlugin.swift). Outside input bound for the pushlog, so only the
// two known string fields survive, and only a bounded number of them.
const MAX_MISSES = 50;

export function cleanBgMisses(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => typeof m?.at === 'string' && typeof m?.why === 'string')
    .slice(-MAX_MISSES)
    .map((m) => ({ at: m.at.slice(0, 40), why: m.why.slice(0, 40) }));
}

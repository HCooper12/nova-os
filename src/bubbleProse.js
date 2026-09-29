import { toSpokenProse } from './spokenProse.js';

// A document Nova names in a reply ([[artifact:<id>]]) must survive the
// prose cleaner — toSpokenProse reads [[…]] as a vault link and would print
// "artifact:…" in the bubble. The token passes through on its own line; the
// prose around it is cleaned as before. (28 Sep 2026, Documents)
// Moved here from valsMisc.js on 29 Sep, unchanged, so the classic Voice
// screen and the Nova thread (valsNovaThread.js) clean a bubble one way.
const ARTIFACT_SPLIT = /(\[\[artifact:[a-z0-9][a-z0-9-]{3,63}\]\])/i;
export const bubbleProse = (t) => {
  const s = String(t ?? '');
  if (!/\[\[artifact:/i.test(s)) return toSpokenProse(s);
  return s.split(ARTIFACT_SPLIT).map((p) => (ARTIFACT_SPLIT.test(p) ? `\n${p}\n` : toSpokenProse(p))).join('').replace(/\n{3,}/g, '\n\n').trim();
};

// FILLER OFF THE FRONT OF WHAT NOVA SAYS (15 Oct 2026).
//
// His words: the prebuilt responses "get old quickly and become too expected
// and premeditated". The acks are now composed from his own words
// (server/lib/acks.js); this is the other half. A model reply that opens on
// "Sure," or "Great question." or "You asked about your sleep." spends the
// first second he hears on nothing, every time, in the same words. Code
// takes it off before the voice ever gets the sentence.
//
// Pure and shared, like src/visualBeats.js: the client lints each model
// sentence before the TTS queue (App.jsx attachAskPoll), the server lints
// Siri's one spoken reply (server/routes/voice.js askSync).
//
// Two rules hold it honest:
//   - it only ever removes a LEADING opener, and only when real words follow
//     it, so a sentence is never emptied: if lint would blank it, the
//     original comes back unchanged ("Sure." on its own is an answer);
//   - "Let me look at your sleep." as the whole sentence is kept: it is only
//     filler when another clause follows it.

const ADDRESS = '(?:,?\\s+(?:sir|hayden|mate))?';
const OPENERS = [
  // Sure, / Of course. / Absolutely! / Certainly, sir,
  new RegExp(`^(?:sure|of course|absolutely|certainly|definitely|no problem)${ADDRESS}\\s*[,.!—–-]+\\s+(?=\\S)`, 'i'),
  // Great question. / Good question, sir!
  new RegExp(`^(?:great|good|excellent|fair|interesting)\\s+question${ADDRESS}\\s*[,.!—–-]+\\s+(?=\\S)`, 'i'),
  // I'd be happy to help with that. / Happy to. / I'm glad to look into it,
  /^(?:(?:i'?d|i\s+would|i'?m|i\s+am)\s+)?(?:be\s+)?(?:happy|glad|delighted)\s+to\b[^.!?,]{0,60}[.!,]\s+(?=\S)/i,
  // Let me check, … / Let me pull that up. Your … (never the whole sentence)
  /^let\s+me\b[^.!?,;:]{0,40}[,.!;:—–]\s+(?=\S)/i,
  // You asked about your sleep. / You've asked how Tuesday went.
  /^you(?:'ve|\s+have)?\s+(?:just\s+)?asked\s+(?:me\s+)?(?:about|whether|if|how|what|why|when|for)\b[^.!?]{0,120}[.!?]\s+(?=\S)/i,
];

const ONLY_ADDRESS = /^(?:sir|hayden|mate)[.!?]?$/i;

export function lintSpoken(text) {
  const original = typeof text === 'string' ? text : '';
  if (!original.trim()) return original;
  const lead = original.match(/^\s*/)[0];
  let s = original.slice(lead.length);
  for (let guard = 0; guard < 6; guard++) {
    const before = s;
    for (const re of OPENERS) s = s.replace(re, '');
    if (s === before) break;
  }
  if (s === original.slice(lead.length)) return original;
  const rest = s.trim();
  // never empty a sentence, and never leave it saying only his name
  if (!rest || ONLY_ADDRESS.test(rest) || !/[A-Za-z0-9]/.test(rest)) return original;
  return lead + rest.charAt(0).toUpperCase() + rest.slice(1);
}

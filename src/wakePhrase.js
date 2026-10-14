// WHAT COUNTS AS HIM CALLING NOVA (design/EVIE-STUDY.md §4B). Peter never
// says "Hey Evie" twice; he says "Evie, …" the way you address a person.
// "Hey Nova" is always the wake phrase. The bare name is opt-in (his call,
// 15 Oct: the same Settings toggle family as the wake word, default OFF) and
// it counts only when it is clearly an address, not a mention:
//   - sentence-initial "Nova," / "Nova:" with at least one more word, or
//   - sentence-initial "Nova" followed by one of a short list of words he
//     would open a request with ("Nova check my sleep", "Nova I'm back").
// "I asked Nova about it" and "Nova" alone are never a wake.
//
// Pure, so server/test/wakePhrase.test.js can pin it.

export const HEY_PHRASE = /\bhey,?\s*nova\b/i;

// the words that make a bare "Nova …" an address: the brief's imperatives,
// plus the standby words, so "Nova, I'm back" works with or without a comma
export const BARE_LEADS = [
  'check', 'pull', 'look', 'open', 'log', 'add', 'remind', 'take', 'run', 'how', 'what', 'tell',
  'show', 'start', 'stop', 'play', 'set', 'read',
  "i'm", 'im', 'back', 'resume', 'hang', 'hold', 'give', 'stand', 'quiet', 'carry',
];
const LEADS_RE = BARE_LEADS.map((w) => w.replace(/'/g, "['’]")).join('|');
// start of the transcript, or after a full stop / question / exclamation
const BARE_COMMA = /(?:^|[.!?]\s+)nova\s*[,:]\s*(?=\S)/i;
const BARE_LEAD = new RegExp(`(?:^|[.!?]\\s+)nova\\s+(?=(?:${LEADS_RE})\\b)`, 'i');

/**
 * Did this transcript call Nova? Returns { rest, bare } (what followed the
 * name, and whether it was the bare form) or null.
 */
export function matchWake(heard, { bare = false } = {}) {
  const text = String(heard || '');
  const hey = text.match(HEY_PHRASE);
  if (hey) return { rest: tidy(text.slice(hey.index + hey[0].length)), bare: false };
  if (!bare) return null;
  const m = text.trim().match(BARE_COMMA) || text.trim().match(BARE_LEAD);
  if (!m) return null;
  const t = text.trim();
  const rest = tidy(t.slice(m.index + m[0].length));
  if (!rest) return null; // the name alone is a mention, not an address
  return { rest, bare: true };
}

const tidy = (s) => String(s || '').replace(/^[\s,.!?:-]+/, '').trim();

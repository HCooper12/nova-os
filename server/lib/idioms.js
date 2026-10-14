// THE IDIOM TABLE (design/EVIE-STUDY.md §4B). Peter talks to E.V. the way
// people talk; Nova's verbs (lib/verbs.js) keep a strict grammar on purpose,
// so a remark never runs as a command by accident. This sits in between:
// a short, closed list of human phrasings, each rewritten into a form the
// strict grammar ALREADY accepts, before tryCommand sees it. The grammar is
// not loosened and verbs.js is not touched.
//
// Every row here was checked against parseCommand by reading it, and
// server/test/idioms.test.js proves each rewrite parses to the verb named
// beside it. Anything not in the table reaches tryCommand exactly as he
// said it (the same string, untouched).
//
// Kept deliberately narrow: an idiom that could also be ordinary talk ("I
// picked up the kids") is NOT here, because a direct verb that misses
// answers "I couldn't find…" instead of letting the model hear the remark.

const SLOT = '(breakfast|lunch|dinner|snack|pre[- ]?workout|meal (?:1|2|3|one|two|three))';
// what may follow "off": the list it came off, or nothing
const LIST_TAIL = '((?:\\s+(?:the\\s+|my\\s+)?(?:shopping(?:\\s+list)?|list|to-?dos?(?:\\s+list)?|todo list|plan))?)';

// [pattern, rewrite, the verb the rewrite reaches (for the test and the log)]
export const IDIOMS = [
  // TICKING OFF — "knock / strike / scratch / mark X off (the list)"
  [new RegExp(`^(?:knock|strike|scratch|mark)\\s+(.+?)\\s+off${LIST_TAIL}$`), (m) => `tick ${m[1]} off${m[2] || ''}`, 'tick'],
  [/^(?:knock|strike|scratch|mark)\s+off\s+(.+)$/, (m) => `tick off ${m[1]}`, 'tick'],
  [/^(?:that's|thats)\s+(.+?)\s+(?:sorted|done)\s+(off\s+(?:the\s+|my\s+)?(?:shopping(?:\s+list)?|list|to-?dos?|plan))$/, (m) => `tick ${m[1]} ${m[2]}`, 'tick'],
  // PUTTING BACK — "put X back on the list"
  [/^(?:put|stick)\s+(.+?)\s+back\s+on\s+(?:the\s+|my\s+)?(shopping list|list|to-?dos?|to-?do list)$/, (m) => `untick ${m[1]} on the ${m[2]}`, 'untick'],
  // MEALS — only a meal word follows, so "I smashed it" is never a meal
  [new RegExp(`^(?:i(?:'ve| have| just|'ve just)?\\s+)?(?:polished off|wolfed down|scoffed|smashed|demolished|knocked back|got through)\\s+(?:my\\s+|the\\s+)?${SLOT}$`), (m) => `had my ${m[1]}`, 'meal.eaten'],
  [new RegExp(`^(?:that's\\s+|thats\\s+)?(?:my\\s+)?${SLOT}\\s+(?:done|eaten|sorted|down)$`), (m) => `had my ${m[1]}`, 'meal.eaten'],
  [new RegExp(`^${SLOT}(?:'s| is)\\s+(?:done|eaten|sorted)$`), (m) => `had my ${m[1]}`, 'meal.eaten'],
  // THE FOOD LOG — "scrap / bin / ditch / get rid of X from the food log"
  [/^(?:scrap|bin|ditch|drop|get rid of|scratch)\s+(?:the\s+)?(.+?)\s+(?:from|off)\s+(?:the\s+|my\s+|today's\s+)*food\s*log$/, (m) => `remove ${m[1]} from the food log`, 'foodlog.remove'],
  // TO-DOS — "stick / pop / chuck / whack X on my to-do list"
  [/^(?:stick|pop|chuck|whack|throw|jot)\s+(.+?)\s+(?:on|onto|down on|in)\s+(?:my\s+|the\s+)?(to-?dos?|to-?do list|todo list)$/, (m) => `add ${m[1]} to my ${m[2]}`, 'todo.add'],
  // THE PLAN — "skip X today" / "I'm skipping X today" / "give X a miss today"
  [/^(?:i'm\s+|im\s+|i am\s+)?(?:skip|skipping)\s+(.+?)\s+today$/, (m) => `mark ${m[1]} as skipped`, 'plan.priority'],
  [/^(?:i'll\s+|i will\s+)?give\s+(.+?)\s+a\s+miss\s+today$/, (m) => `mark ${m[1]} as skipped`, 'plan.priority'],
  // VOLUME — "crank it up" / "bring it down a bit"
  [/^(?:crank|pump)\s+(it|the music|the volume|the sound)\s+up$/, (m) => `turn ${m[1].replace(/^the\s+/, '')} up`, 'mac.volume'],
  [/^(?:bring|knock)\s+(it|the music|the volume|the sound)\s+down(?:\s+a\s+(bit|little|touch))?$/, (m) => `turn ${m[1].replace(/^the\s+/, '')} down${m[2] ? ` a ${m[2]}` : ''}`, 'mac.volume'],
];

// The same undressing tryCommand does (verbs.js normCased): a leading wake
// word, trailing punctuation, doubled spaces. Lower-cased for matching only.
function undress(text) {
  return String(text || '')
    .replace(/[’‘]/g, "'")
    .replace(/^(hey|hi|ok|okay)?[,\s]*(nova|jarvis|evie)[,\s]*/i, '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** His words, with one known idiom said in the strict grammar; else untouched. */
export function expandIdioms(text) {
  const raw = String(text || '');
  const q = undress(raw).toLowerCase();
  if (!q || q.length > 140) return raw;
  for (const [re, to] of IDIOMS) {
    const m = q.match(re);
    if (m) return to(m);
  }
  return raw;
}

/** Which row (index) an utterance hits, or -1. For the test and the log. */
export function idiomRow(text) {
  const q = undress(text).toLowerCase();
  return IDIOMS.findIndex(([re]) => re.test(q));
}

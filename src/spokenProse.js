// TALK LIKE A PERSON.
//
// 10 Sep 2026, after a Leader conversation: "when conversing nova should
// sound and act like a normal human not reading things in parentheses and
// stuff like that." The turn on his screen opened:
//
//   ## The word "convince" is the problem
//   ...Heen's move on your [[Purpose Shift in Difficult Conversations]] page
//   *"If I shift my purpose from getting them to change..."*
//   **there's usually something about identity in it.**
//
// The Leader is a writing agent whose answers now land in a SPOKEN log. Its
// prompt is being told to write for the ear, but a prompt is a request and
// this is a guarantee: markdown is stripped in code, so a slip costs him
// nothing. Models decide, code acts.
//
// Applied in two places, both of which leave the stored transcript alone:
// each chunk on its way to the voice, and the text on its way to the screen.
// The raw text stays raw in state, because the glass measures its panels in
// character offsets into it and a rewrite here would slide them.

const RULES = [
  [/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2'],      // [[Page|what he'd say]]
  [/\[\[([^\]]+)\]\]/g, '$1'],                 // [[Page]] — a vault link, not a word
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],           // an image
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],            // [text](url)
  [/```[\s\S]*?```/g, ' '],                    // a fenced block is never speech
  [/`([^`\n]+)`/g, '$1'],
  [/\*\*\*([^*\n]+)\*\*\*/g, '$1'],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/\*([^*\n]+)\*/g, '$1'],
  [/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2'],
  [/~~([^~]+)~~/g, '$1'],
  [/^\s{0,3}#{1,6}\s+/gm, ''],                 // a heading is a sentence when spoken
  [/^\s*([-*_])\1{2,}\s*$/gm, ''],             // a horizontal rule
  [/^\s{0,3}>\s?/gm, ''],                      // a block quote
  [/^\s*[-*+]\s+/gm, ''],                      // a bullet marker
];

export function toSpokenProse(text) {
  let t = String(text ?? '');
  if (!t) return '';
  for (const [re, to] of RULES) t = t.replace(re, to);
  return t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

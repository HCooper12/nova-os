// TALKING OVER NOVA. His report, 14 Sep 2026, driving: he had to keep tapping
// to cut Nova off so he could add what it had missed. Tapping is the wrong
// gesture in a car, and it is the difference between a conversation and a
// recital — ChatGPT and Claude let you simply start talking.
//
// THE WHOLE PROBLEM IS ECHO. To hear him interrupt, the microphone has to be
// open while Nova is speaking — and on a phone the reply comes out of a
// speaker two inches from that microphone, so the listener hears Nova almost
// as clearly as it hears him. "Hey Nova" side-stepped this by requiring a
// phrase Nova never says. Barge-in cannot: he interrupts with whatever words
// he likes.
//
// So the filter is the one thing known for certain — the exact sentence Nova
// is saying at that moment. Words that came out of Nova's own mouth are echo;
// words that did not are him. It is deliberately biased toward ECHO: a missed
// barge-in costs him a tap, which is what he has today, while a false one cuts
// Nova off mid-sentence for no reason. Erring toward silence is the cheap
// mistake.

// Filler and function words carry no evidence either way — "the" appearing in
// both proves nothing — so the comparison runs on content words only.
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
  'it', 'its', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'that', 'this', 'these', 'those',
  'i', 'you', 'your', 'yours', 'my', 'me', 'we', 'he', 'she', 'they', 'them', 'his', 'her',
  'sir', 'so', 'as', 'by', 'from', 'not', 'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'would', 'can', 'could', 'should', 'just', 'then', 'than', 'there', 'here',
  'um', 'uh', 'er', 'ah', 'yeah', 'yes', 'okay', 'ok', 'right', 'well', 'like', 'about',
]);

const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
export const contentWords = (s) => tokens(s).filter((w) => !STOP.has(w) && w.length > 2);

// HOW MUCH OF WHAT WAS HEARD CAME OUT OF NOVA'S MOUTH. 1 means every content
// word is one Nova is currently saying (pure echo); 0 means none of them are.
// Nothing to judge (no content words at all) reads as echo, because a stray
// "um" during playback is the microphone hearing the room, not an interruption.
export function echoScore(heard, saying) {
  const h = contentWords(heard);
  if (!h.length) return 1;
  const said = new Set(contentWords(saying));
  if (!said.size) return 0;
  return h.filter((w) => said.has(w)).length / h.length;
}

// HOW A PERSON ACTUALLY INTERRUPTS. "Stop", "wait", "hang on" — one or two
// words, said over the top, and they carry no content words at all, so the
// evidence test above would throw them away. They are allowed through on their
// own, unless Nova is in the middle of saying them.
const INTERRUPTIONS = /^\s*(?:no[,\s]+no|no way|stop|wait|hang on|hold on|hold up|shut up|enough|pause|actually|hold the phone)\b/i;

// The bar for ordinary speech: at least this many content words that Nova is
// NOT saying. One stray word misheard out of the room is not an interruption;
// two that Nova never said is him.
const MIN_NEW_WORDS = 2;
// Above this share of echo, treat it as Nova hearing herself.
const ECHO_CEILING = 0.5;

// Should this transcript, heard while Nova is speaking, cut Nova off?
// `heard` — what the listener just transcribed. `saying` — what Nova is
// speaking right now (and the sentence before it, since recognition lags
// playback and a barge-in often lands across the join).
//
// Returns { barge, why } — `why` is for the log and for a person reading it
// later, never for the screen.
export function bargeInDecision(heard, saying) {
  const text = String(heard || '').trim();
  if (!text) return { barge: false, why: 'nothing heard' };
  const saidWords = new Set(contentWords(saying));

  if (INTERRUPTIONS.test(text)) {
    // ...unless that is what Nova is in the middle of saying
    const first = contentWords(text)[0];
    if (first && saidWords.has(first)) return { barge: false, why: `"${first}" is a word Nova is saying` };
    return { barge: true, why: 'an interruption word' };
  }

  const heardWords = contentWords(text);
  if (!heardWords.length) return { barge: false, why: 'no content words — the room, not him' };

  const score = echoScore(text, saying);
  if (score >= ECHO_CEILING) return { barge: false, why: `${Math.round(score * 100)}% of it is what Nova is saying` };

  const fresh = heardWords.filter((w) => !saidWords.has(w));
  if (fresh.length < MIN_NEW_WORDS) return { barge: false, why: `only ${fresh.length} word Nova did not say` };

  return { barge: true, why: `${fresh.length} words Nova never said` };
}

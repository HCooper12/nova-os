// WHAT HIS WORDS SAY ABOUT HIS TURN. Pure, English-only, conservative.
//
// His report, 27 Oct 2026: "as soon as I stop talking it registers as me
// finishing speaking... other times I am still mid sentence before it
// believes I'm done. There also doesn't seem to be a way for me to continue
// with my response. One response the dictation understood wrong, so I wasn't
// able to go back and correct it like a human would."
//
// A longer fixed hold is not the answer: in October 2.6 s was "a little bit
// too long" after a finished sentence. So silence alone cannot decide. This
// module reads the words: a sentence that stops on "and" or "the" is not
// finished, whatever the pause; a man who speaks again two seconds after his
// turn went is adding to it; "no, I said" is a correction. turnEnd.js holds
// the clock, useDictation.js wires both together, and every rule here is
// pinned by server/test/turnSense.test.js.

// Words a finished English sentence almost never ends on.
const DANGLING = new Set([
  'and', 'but', 'so', 'because', 'cause', 'or', 'nor', 'the', 'a', 'an', 'to', 'of', 'with',
  'like', 'um', 'uh', 'er', 'erm', 'i', 'my', 'which', 'if', 'when', 'than', 'into',
  'your', 'our', 'their', 'whether', 'while', 'although', 'though', 'unless', 'plus', "i'm", 'im',
]);
// Words that dangle only after a word that sets them up: "I think that",
// "and then". "I love that" and "see you then" are finished.
const DANGLING_AFTER = {
  that: new Set(['think', 'know', 'said', 'say', 'is', 'was', 'mean', 'feel', 'believe', 'so', 'and', 'but', 'means', 'guess', 'hope', 'thing', 'problem', 'fact', 'except']),
  then: new Set(['and', 'but', 'so', 'only', 'if']),
  at: new Set(['better', 'good', 'great', 'bad', 'look', 'looking', 'aim', 'aiming', 'work', 'working']),
  is: new Set(['thing', 'problem', 'question', 'issue', 'point', 'truth', 'priority', 'goal', 'reason', 'idea', 'most', 'part', 'plan', 'answer', 'worry', 'hope']),
};

// A phrase left hanging at the end: "I think", "I mean", "you know", "sort of".
const DANGLING_PHRASES = [
  /\bi think$/, /\bi mean$/, /\byou know$/, /\bsort of$/, /\bkind of$/, /\bi guess$/,
  /\bas well as$/, /\bsuch as$/, /\bthe thing is$/, /\bwhat i mean is$/, /\bi was going to say$/,
];

// A unit that makes a number an answer ("80 kilos", "6 hours").
const UNITS = /\b(?:kg|kgs|kilo|kilos|kilogram|kilograms|lb|lbs|pound|pounds|g|grams|cal|cals|calories|kcal|km|kms|kilometres|kilometers|miles|m|metres|meters|cm|reps?|sets?|hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|times?|percent|%|am|pm|o'?clock|steps|litres?|liters?|ml|beats|bpm|out of \w+)\b/;

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).replace(/[^a-z0-9'% ]+/g, ' ').split(' ').filter(Boolean);

// Does what he has said so far end mid-thought?
//   asked      — the question Nova had just put to him (optional)
//   wantsNumber — that question wanted a number (optional; guessed from
//                 `asked` when not given)
// True only on positive evidence. Silence with no evidence stays a finished
// turn, because the cost of a wrong "unfinished" is 2.2 s of dead air on a
// turn he had finished, which is the complaint that shortened the hold.
export function soundsUnfinished(text, { asked = '', wantsNumber } = {}) {
  const raw = norm(text);
  if (!raw) return false;
  // a trailing comma, dash, colon or ellipsis is a breath, not an end (the
  // Mac's transcriber writes "because..." for a sentence cut off mid-air)
  if (/(?:,|;|:|-|\u2026|\.\.\.)["')\]]*$/.test(raw)) return true;
  // a question or an exclamation is an end
  if (/[!?]["')\]]*$/.test(raw)) return false;
  // A FULL STOP IS WEAKER EVIDENCE: the transcriber puts one on almost every
  // clip, cut mid-sentence or not ("...and the."), so the words still decide.
  const w = words(raw);
  if (!w.length) return false;
  const tail = w.join(' ');
  const last = w[w.length - 1];
  if (DANGLING.has(last)) return true;
  if (DANGLING_AFTER[last] && (w.length === 1 || DANGLING_AFTER[last].has(w[w.length - 2]))) return true;
  if (DANGLING_PHRASES.some((re) => re.test(tail))) return true;
  const q = norm(asked);
  if (q && /\?\s*$/.test(q)) {
    // a question was asked and the answer so far is a word or two of filler
    // ("well", "so yeah") rather than an answer: let him get going
    const needsNumber = wantsNumber ?? /\b(how (?:many|much|long|often|old|far|heavy)|what (?:is|was|'s) your (?:weight|age|height)|number)\b/.test(q);
    if (needsNumber) {
      // a bare number IS an answer ("80" to "how much do you weigh?"): his call,
      // 27 Oct 2026, the dead air of waiting for a unit is the thing he dislikes
      return false;
    }
    const filler = new Set(['well', 'so', 'yeah', 'okay', 'ok', 'hmm', 'right', 'look', 'honestly', 'basically', 'actually', 'um', 'uh']);
    if (w.length < 3 && w.every((x) => filler.has(x))) return true;
  }
  return false;
}

// THE CONTINUATION WINDOW. After his turn has been sent, speech that starts
// before Nova's reply starts speaking, or inside 3 s of the send (whichever
// is later), belongs to the same turn: "...oh, and also". Speech heard while
// Nova is making a sound (the ack) cannot claim it: that is the speaker
// leaking into the mic, and claiming on it would cut Nova off for nothing.
export const CONTINUE_MS = 3000;
export function continueWindowEnd({ sentAt, replySpeakingAt = null }) {
  if (!Number.isFinite(sentAt)) return 0;
  return Math.max(sentAt + CONTINUE_MS, Number.isFinite(replySpeakingAt) ? replySpeakingAt : 0);
}
// `replySpeakingAt` null means the reply has not started speaking yet, so the
// window stays open past 3 s until it does.
export function isContinuation({ sentAt, replySpeakingAt = null, now, novaSpeaking = false }) {
  if (!Number.isFinite(sentAt) || !Number.isFinite(now) || now < sentAt) return false;
  if (novaSpeaking) return false;
  if (now - sentAt <= CONTINUE_MS) return true;
  return replySpeakingAt == null;
}
// The window is over for good: abandon the open mic.
export function continueWindowClosed({ sentAt, replySpeakingAt = null, now }) {
  if (!Number.isFinite(sentAt)) return true;
  if (now - sentAt <= CONTINUE_MS) return false;
  return replySpeakingAt != null;
}

// A SPOKEN CORRECTION: the next turn opens by saying the last was wrong.
// Anchored at the start, so "no" inside a sentence is never a correction.
const CORRECTION = /^\s*(?:no[,.!\s]+no\b|(?:no|nope)[,.!]?\s+(?:i said|i meant|i didn'?t say|that'?s (?:wrong|not)|not what i)\b|that'?s (?:wrong|not (?:right|what i said))|that is (?:wrong|not (?:right|what i said))|wrong[,.!]|i said\b|i meant\b|what i said was\b|correction\b|let me correct\b|sorry[,.]?\s+i (?:said|meant)\b|not\s+\S+(?:\s+\S+)?[,.]?\s+(?:i said|i meant|it'?s|it was|but)\b)/i;
export function isCorrection(text) {
  return CORRECTION.test(String(text || '').replace(/[’]/g, "'"));
}

// How long his latest bubble offers "Not what I said".
export const FIX_MS = 60_000;
export const fixOffered = ({ at, now }) => Number.isFinite(at) && now - at >= 0 && now - at < FIX_MS;

// THE SPEAKER IN THE MIC. A continuation recorded while Nova's ack played
// can carry the ack's own words at its head. Take Nova's line off the front
// when the transcript starts with it (punctuation and case ignored).
export function stripEcho(heard, said) {
  const h = String(heard || '').trim();
  const s = words(said);
  if (!h || !s.length) return h;
  const hw = h.split(/\s+/);
  const key = (x) => norm(x).replace(/[^a-z0-9']+/g, '');
  let i = 0;
  let j = 0;
  while (i < hw.length && j < s.length) {
    const k = key(hw[i]);
    if (!k) { i++; continue; }
    if (k !== s[j].replace(/[^a-z0-9']+/g, '')) break;
    i++; j++;
  }
  // only a real run of Nova's words counts (three or more, or all of it)
  if (j >= Math.min(3, s.length)) return hw.slice(i).join(' ').trim();
  return h;
}

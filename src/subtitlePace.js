// THE CAPTION ENGINE (3 Oct 2026) — the full-screen Nova's subtitles, word
// by word (design/mockups/68-nova-focus.html, his pick: C's stage).
//
// WORD TIMING, HONESTLY. What is known today is the SENTENCE: the speech
// queue knows when each sentence's audio starts and how long that audio is
// (src/speechClock.js, fed from App.drainTtsQueue). Which word is in the air
// at a given millisecond is NOT known: the voice engine returns audio, not
// word timings. So each sentence's words are PACED across that sentence's
// own audio span, weighted by length, with a rest after a comma. The spans
// always add up to the sentence exactly, so the last word ends when the
// audio does.
//
// THE SEAM FOR THE TRUE VERSION. When an engine hands back real word timings
// (`words: [{ t, text }]`, t in ms from the sentence's start), paceSentence
// uses them instead and says so (`real: true`); nothing drawn changes.
//
// Pure: plain functions of their arguments (server/test/novaFocus.test.js).

// a word's weight: its letters, a base so a short word still gets a beat,
// and a rest after a comma, semicolon, colon or dash (the voice pauses there)
export const WORD_BASE = 1.6;
export const COMMA_REST = 2.8;
const LETTERS = /[\p{L}\p{N}'’]/gu;
const RESTS = /[,;:—–]["”’)]*$/;

export function splitWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

export function wordWeight(word) {
  const w = String(word || '');
  const letters = (w.match(LETTERS) || []).length;
  return letters + WORD_BASE + (RESTS.test(w) ? COMMA_REST : 0);
}

// When the length of the audio is not known (the phone's own voice speaks
// through speechSynthesis, which reports no duration), the sentence is
// paced on an ESTIMATE: about sixteen characters a second, the pace of
// Nova's voice. The sentence carries `estimated: true` so nothing claims
// more than it knows.
export const CHARS_PER_SEC = 16;
export function estimateSpeechMs(text) {
  const n = String(text || '').trim().length;
  return n ? Math.max(600, Math.round((n * 1000) / CHARS_PER_SEC)) : 0;
}

// real word timings, cleaned: in order, inside the sentence, with text
function realWords(words, dur) {
  if (!Array.isArray(words) || !words.length) return null;
  const list = words
    .filter((w) => w && Number.isFinite(w.t) && String(w.text || '').trim())
    .map((w) => ({ t: Math.max(0, Math.min(dur, w.t)), text: String(w.text).trim() }))
    .sort((a, b) => a.t - b.t);
  return list.length ? list : null;
}

// ONE SENTENCE'S WORDS ON THE CLOCK. `at` is when its audio started, `dur`
// how long it lasts, both in ms on one clock. Returns the words with their
// spans [st, en): contiguous, in order, the first starting at `at` and the
// last ending at `at + dur`.
export function paceSentence({ text, at = 0, dur = 0, words = null } = {}) {
  const span = Math.max(0, Number(dur) || 0);
  const real = realWords(words, span);
  if (real) {
    return {
      real: true,
      spans: real.map((w, i) => ({ text: w.text, st: at + w.t, en: at + (i + 1 < real.length ? real[i + 1].t : span) })),
    };
  }
  const list = splitWords(text);
  const weights = list.map(wordWeight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const spans = list.map((w, i) => {
    const st = at + (span * acc) / total;
    acc += weights[i];
    // the last word ends exactly at the end of the audio, never a rounding short
    const en = i === list.length - 1 ? at + span : at + (span * acc) / total;
    return { text: w, st, en };
  });
  return { real: false, spans };
}

// which word is in the air at t: -1 before the first, spans.length once the
// last has ended
export function wordAt(spans, t) {
  const list = spans || [];
  if (!list.length || t < list[0].st) return -1;
  for (let i = 0; i < list.length; i++) if (t < list[i].en) return i;
  return list.length;
}

// the sentence being said at t: the last one whose audio has started
export function sentenceAt(sentences, t) {
  let idx = -1;
  for (let i = 0; i < (sentences || []).length; i++) if (sentences[i].at <= t) idx = i;
  return idx;
}

// HOW A WORD LOOKS AT t, as three numbers the screen draws:
//   e    0..1, it has arrived (rises in over `arrive` ms from its start)
//   lit  0..1, it is being said (1 while said, fading over `linger` after)
//   p    0..1, how far through it the voice is (the underline's sweep)
// A word after the point he cut her off (`cut`) never arrives: nothing is
// shown that she did not say.
export function wordLook(span, t, { arrive = 280, linger = 320, cut = null } = {}) {
  if (!span || t < span.st || (Number.isFinite(cut) && span.st >= cut)) return { e: 0, lit: 0, p: 0 };
  const e = Math.min(1, (t - span.st) / Math.max(1, arrive));
  const ease = 1 - Math.pow(1 - e, 3);
  const len = Math.max(1, span.en - span.st);
  if (t < span.en) return { e: ease, lit: 1, p: Math.min(1, (t - span.st) / len) };
  const after = Math.min(1, (t - span.en) / Math.max(1, linger));
  return { e: ease, lit: 1 - after, p: 1 };
}

import { estimateSpeechMs } from './subtitlePace.js';

// WHAT NOVA IS SAYING, AND WHEN (3 Oct 2026) — the full-screen Nova's
// subtitles read this. One module-level record, read IMPERATIVELY by the
// captions' own frame loop (the audioLevel.js pattern), so a sentence
// starting costs one small re-render of the captions and nothing else.
//
// The speech queue writes it at the instant a sentence's AUDIO begins
// (App.drainTtsQueue: the decoded buffer's length, or the <audio> element's
// once it plays; App.speakFallback: the phone's own voice, whose length is
// not reported, so it is estimated and says so). Voice leads, words follow:
// nothing is written here before the sound is.
//
// A reply starts a fresh list (App.attachAskPoll, beside resetGlass); a stop
// marks where he was cut off, so the words after it never appear.

const MAX = 12;
// a sentence starting this long after the last one ended is a new moment
// (a job's narration an hour later, a brief): the captions start clean
export const FRESH_GAP_MS = 20_000;
let sentences = [];
let seq = 0;
let frozen = null;
const subs = new Set();
const emit = () => { for (const fn of subs) { try { fn(sentences); } catch { /* a reader's fault is its own */ } } };

// the one clock the captions and the speech queue share
export function clockNow() {
  if (frozen != null) return frozen;
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// `stance` (4 Oct 2026): 'contest' when this sentence is Nova pushing back
// on something he proposed (src/visualBeats.js THE STANCE, bound to the
// sentence by src/glassBeats.js stanceOfSpan), else null. The subtitles draw
// it; anything else is not a stance and is dropped here.
export function noteSpokenSentence(text, durMs, { words = null, at = clockNow(), stance = null } = {}) {
  const t = String(text || '').trim();
  if (!t) return null;
  const known = Number.isFinite(durMs) && durMs > 0;
  const s = { id: ++seq, text: t, at, dur: known ? durMs : estimateSpeechMs(t), estimated: !known, words: Array.isArray(words) ? words : null, cut: null, stance: stance === 'contest' ? 'contest' : null };
  const last = sentences[sentences.length - 1];
  const stale = last && at - (last.cut ?? last.at + last.dur) > FRESH_GAP_MS;
  sentences = [...(stale ? [] : sentences), s].slice(-MAX);
  emit();
  return s;
}

// a new reply: the captions start clean
export function beginReply() {
  if (!sentences.length) return;
  sentences = [];
  emit();
}

// he stopped him: the sentence in the air ends here, and its later words
// are never shown (they were never said)
export function cutSpeech(at = clockNow()) {
  const last = sentences[sentences.length - 1];
  if (!last || last.cut != null || at >= last.at + last.dur) return;
  sentences = [...sentences.slice(0, -1), { ...last, cut: Math.max(last.at, at) }];
  emit();
}

export function spokenSentences() { return sentences; }

// THE STANCE IN THE AIR (4 Oct 2026): the newest sentence's, unless he cut
// it off. App mirrors it into state (voiceStance) for the core and the
// label, so they turn red and back on the very clock the subtitles read.
export function stanceNow(list = sentences) {
  const s = list && list[list.length - 1];
  return s && s.cut == null && s.stance === 'contest' ? 'contest' : null;
}

export function onSpeech(fn) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

// TEST AND DEV SEAM: freeze the shared clock at a moment, so a frame of the
// captions can be photographed mid-word (scripts drive it through
// window.__speechClock in dev builds only)
export function freezeClock(t) { frozen = Number.isFinite(t) ? t : null; emit(); }
export function _resetSpeechClock() { sentences = []; seq = 0; frozen = null; subs.clear(); }

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__speechClock = { noteSpokenSentence, beginReply, cutSpeech, freezeClock, clockNow, spokenSentences };
}

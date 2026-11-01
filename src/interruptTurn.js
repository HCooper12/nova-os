// HE CUT IN (his ask, 1 Nov 2026): "Both Nova and Wren need to communicate
// with me like a real human does ... and allows me to interrupt them as well
// if I start speaking again. If I interrupt them it should be either
// information that is being considered to add into the current request or it
// could be something that I am responding back to ... but this does not mean
// that it should lose anything else for what it was going to continue saying."
// And: "if what it was going to continue saying ... would contradict anything
// that I said during my interruption, it should just make that clear to me and
// say something like 'I was going to tell you that… but now I understand we
// won't be proceeding with that plan'."
//
// Until now a cut-off reply simply ended: App.stopSpeaking dropped the queue,
// and the next ask told the model nothing, so it either repeated what he had
// heard or lost what it had not said. Code knows exactly where his voice came
// in: the sentence in the air (App.ttsNowSaying) and the sentences still
// queued behind it (App.ttsQueue, each carrying `.said`), plus the rest a turn
// held for "go on" (src/turnFold.js). This module turns that into one record
// and one bracketed note for the next ask. Models decide what still stands;
// code only says what was heard and what was not.
//
// One shared format: App.stopSpeaking writes the record, App.askNova sends
// the note (in `sent`, never in `raw`: his words are what he said), the
// stage's last exchange reads `inAir` (src/novaStageFacts.js), and
// server/lib/talk.js TURN_TAKING tells every agent what the note means.
// Change them together or not at all. Pure, tested in
// server/test/interruptTurn.test.js.

import { unspokenTexts } from './speechResume.js';
import { contentWords } from './bargeIn.js';

// What the note may quote of the unsaid rest. A held Coach answer can run to
// a thousand words; the model wrote it and has it in its session, so the
// note needs enough to recognise it, not all of it.
export const UNSAID_CAP = 900;
// A cut older than this is not what his next words answer: he stopped Nova,
// went quiet, and came back to something else.
export const INTERRUPT_FRESH_MS = 5 * 60_000;

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Cut at the last sentence end inside the cap (else the last word), with "…".
export function capUnsaid(text, cap = UNSAID_CAP) {
  const t = squash(text);
  if (t.length <= cap) return t;
  const head = t.slice(0, cap);
  let end = -1;
  for (const m of head.matchAll(/[.!?](?=\s|$)/g)) end = m.index + 1;
  if (end <= 0) end = head.lastIndexOf(' ');
  if (end <= 0) end = cap;
  return `${head.slice(0, end).trim()} …`;
}

// Was a reply genuinely in the air? The ack ("Checking your sleep.") is a
// receipt, not the reply; a finalize barrier is not speech at all.
export function replyInAir({ nowSaying = null, nowAck = false, queue = [] } = {}) {
  if (squash(nowSaying) && !nowAck) return true;
  return (queue || []).some((e) => e && e.said && !e.ack && squash(e.said));
}

/**
 * The record of a cut. `nowSaying` is the sentence he heard start; `queue`
 * the TTS queue behind it (entries with `.said`; acks and finalize barriers
 * skipped); `more` the rest the turn held for "go on" and he never asked for.
 * Returns { inAir, unsaid } or null when nothing was in the air and nothing
 * was left unsaid.
 */
export function captureInterrupt({ nowSaying = null, nowAck = false, queue = [], more = '' } = {}) {
  const inAir = nowAck ? '' : squash(nowSaying);
  // unspokenTexts(null, …): the sentence in the air is NOT unsaid, he heard it start
  const queued = unspokenTexts(null, (queue || []).filter((e) => e && !e.ack && !e.finalize));
  const unsaid = capUnsaid([...queued, squash(more)].map(squash).filter(Boolean).join(' '));
  if (!inAir && !unsaid) return null;
  return { inAir: inAir || null, unsaid };
}

// THE PHONE'S OWN VOICE (1 Nov 2026). With no TTS engine, App.speakIncremental
// hands each sentence to window.speechSynthesis, which queues them itself;
// App keeps them in order in `browserSaying` ({ said, ack, started }). This
// reads that list in the engine queue's shape: the sentence whose audio has
// started is the one in the air, those behind it are the queue. None started
// yet (cut before the phone began) means nothing was in the air and all of it
// is still unsaid.
export function browserAir(spoken = []) {
  const list = (spoken || []).filter((e) => e && squash(e.said));
  const at = list.findIndex((e) => e.started);
  const head = at >= 0 ? list[at] : null;
  const rest = at >= 0 ? list.slice(at + 1) : list;
  return {
    nowSaying: head ? head.said : null,
    nowAck: !!head?.ack,
    queue: rest.map((e) => ({ said: e.said, ...(e.ack ? { ack: true } : {}) })),
  };
}

// What is in the air, whichever voice is speaking: the engine's sentence when
// it has one, else the phone's, with the phone's queue ahead of anything the
// engine still holds (a finalize barrier). Pure; App.airNow calls it.
export function airWithBrowser(engine = {}, spoken = []) {
  const e = { nowSaying: engine?.nowSaying || null, nowAck: !!engine?.nowAck, queue: engine?.queue || [] };
  if (squash(e.nowSaying)) return e;
  const b = browserAir(spoken);
  if (!squash(b.nowSaying) && !b.queue.length) return e;
  return { nowSaying: b.nowSaying, nowAck: b.nowAck, queue: [...b.queue, ...e.queue] };
}

// Quotes inside the quote would end it early for a reader; the model reads
// the same words either way.
const q = (s) => squash(s).replace(/"/g, "'");

/** The bracket the next ask carries, one paragraph; '' for no record. */
export function interruptNote(rec) {
  if (!rec || (!rec.inAir && !rec.unsaid)) return '';
  const parts = [];
  if (rec.inAir) parts.push(`He cut in while you were saying: "${q(rec.inAir)}". He heard everything before that.`);
  else parts.push('He cut in between your sentences. He heard everything you had said up to then.');
  if (rec.unsaid) parts.push(`You had not yet said: "${q(rec.unsaid)}".`);
  parts.push('Take in what he just said first. If it adds to what he asked, act on that. Then, if what you had not said still stands, finish it briefly, without repeating what he heard. If any of it is now wrong or contradicts him, say so in one plain line, like "I was going to say X; that is off now", and drop it.');
  return `[${parts.join(' ')}]`;
}

/** Is a kept cut still the one his next words answer? */
export function interruptFresh(entry, now = Date.now()) {
  return !!entry?.rec && Number.isFinite(entry.at) && now - entry.at >= 0 && now - entry.at <= INTERRUPT_FRESH_MS;
}

// Does this chat line carry the speech that was cut? The voice says a
// cleaned version of the line (markdown stripped, openers linted), so the
// test is on content words, not characters: most of the first words of what
// was in the air (or, between sentences, of what was next) are in the line.
// A greeting or a briefing in the air is not the newest reply's speech, and
// the model never wrote it, so no note is made for it.
export function lineSpeaks(lineText, rec) {
  const probe = rec?.inAir || rec?.unsaid || '';
  const want = contentWords(probe).slice(0, 8);
  if (!want.length) return !!squash(lineText) && squash(lineText).includes(squash(probe));
  const have = new Set(contentWords(lineText));
  return want.filter((w) => have.has(w)).length / want.length >= 0.6;
}

// THE LINE AS HEARD (the stage's last exchange): the line's text up to the
// end of the sentence he heard start, then "…". The rest was never said, so
// it is never shown as if it were. A sentence that cannot be found in the
// text (the voice said a cleaned version) is found by its first words; if it
// still cannot be found the text is left whole rather than cut in a guessed
// place.
export function heardUpTo(text, inAir) {
  const t = squash(text);
  const a = squash(inAir).replace(/[.!?…]+$/, '');
  if (!t || !a) return t;
  let at = t.indexOf(a);
  let len = a.length;
  if (at < 0) {
    // the first five words, then the end of that sentence in the line
    const head = a.split(' ').slice(0, 5).join(' ');
    at = head.length >= 8 ? t.indexOf(head) : -1;
    if (at < 0) return t;
    const end = t.slice(at).search(/[.!?](?=\s|$)/);
    len = end < 0 ? t.length - at : end;
  }
  // he heard that sentence START, not end: it ends in "…" even when it is the last
  return `${t.slice(0, at + len).replace(/[\s.,;:!?…]+$/, '')}…`;
}

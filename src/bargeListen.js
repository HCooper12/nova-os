// THE EAR WHILE NOVA SPEAKS, ON HIS IPHONE (1 Nov 2026). His ask: "allows me
// to interrupt them as well if I start speaking again". Talking over Nova has
// never once fired on his phone: server/data/voice/turns.json holds no
// 'barge' or 'wake' turn from an iPhone, because the listener that did it
// (src/WakeWord.jsx) runs on the browser's speech engine, and that engine
// hears nothing there. On the phone Nova hears him through his own ears
// (src/recorder.js: a recording the Mac writes down), so the ear that listens
// while Nova speaks has to be the same one.
//
// It cannot transcribe continuously: every read is an upload to the Mac. So
// it reads only when the level meter says someone spoke (vad.js), and only
// once per burst of speech, at most one every 2.5 s, never on a blind meter
// (a deaf meter cannot say anyone spoke). Whether what it read is him or
// Nova's own voice through the speaker is src/bargeIn.js's decision, the
// same filter the browser engine's barge-in uses.
//
// Pure, sample in, state out: src/useDictation.js runs it on the recorder's
// 100 ms meter samples (server/test/bargeListen.test.js).

import { contentWords } from './bargeIn.js';

// a burst shorter than this is a cough, a door, a word of the room
export const BURST_MIN_MS = 400;
// one read at most this often, whatever the meter says
export const READ_GAP_MS = 2500;
// quiet this long ends a burst ("No, you're mistaken." and then a breath)
export const BURST_GAP_MS = 600;
// a burst still going after this much speech is read while it runs: he is
// talking over Nova, and waiting for him to stop would let Nova talk on
export const BURST_LONG_MS = 2200;
// with no burst, the clip is started again this often, so a read holds
// seconds of audio, not the whole reply (recorder handle.rewind)
export const CLIP_MAX_MS = 6000;
// what the last read heard that Nova never said is kept this long, so "No,
// you're mistaken" and "do it this way" read across two bursts are one
export const CARRY_MS = 6000;
// at most this many "not him" receipts per stretch of Nova speaking: the
// turn log keeps 500 rows, and a speaker the phone cannot cancel would
// otherwise fill it with echo in twenty minutes
export const SKIP_RECEIPTS_MAX = 6;

export function openBurst() {
  return { start: null, lastLoudAt: null, speechMs: 0, read: false, ended: false };
}

/**
 * One meter sample → the next burst state. `ended` is true on exactly the
 * sample a burst closes; the sample after starts clean.
 */
export function stepBurst(state, { speaking = false, now = Date.now(), sampleMs = 100 } = {}) {
  const s = state?.ended ? openBurst() : { ...(state || openBurst()) };
  if (speaking) {
    if (s.start === null) s.start = now;
    s.speechMs += sampleMs;
    s.lastLoudAt = now;
    return s;
  }
  if (s.start !== null && now - s.lastLoudAt >= BURST_GAP_MS) s.ended = true;
  return s;
}

/**
 * Is a read due now? One per burst, a burst of at least BURST_MIN_MS of
 * speech, at its end or once it has run BURST_LONG_MS; never within
 * READ_GAP_MS of the last read, never while one is pending, never blind.
 */
export function burstDue({ speakingMs = 0, lastReadAt = null, now = Date.now(), blind = false, ended = false, readThisBurst = false, pending = false } = {}) {
  if (blind || pending || readThisBurst) return false;
  if (speakingMs < BURST_MIN_MS) return false;
  if (lastReadAt !== null && now - lastReadAt < READ_GAP_MS) return false;
  return ended || speakingMs >= BURST_LONG_MS;
}

/** Start the clip again? Only between bursts, with no read in flight. */
export function rewindDue({ clipAt = null, now = Date.now(), inBurst = false, pending = false } = {}) {
  if (clipAt === null || inBurst || pending) return false;
  return now - clipAt >= CLIP_MAX_MS;
}

// Whisper's lines for a clip with no words in it: never carried as his
const FILLER = /^\s*(?:thank you|thanks for watching|you|bye)[.!]?\s*$/i;

/** What this read judges: the kept words from the read before, then these. */
export function carryHeard({ carry = null, text = '', now = Date.now() } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!carry || !carry.text || now - carry.at > CARRY_MS) return t;
  return `${carry.text} ${t}`.trim();
}

/** Keep these words for the next read? Only when some are not Nova's. */
export function keepCarry({ heard = '', saying = '', now = Date.now() } = {}) {
  const t = String(heard || '').replace(/\s+/g, ' ').trim();
  if (!t || FILLER.test(t)) return null;
  const said = new Set(contentWords(saying));
  const fresh = contentWords(t).filter((w) => !said.has(w));
  return fresh.length ? { text: t.slice(-240), at: now } : null;
}

/** Should this decision leave a receipt? Every barge does; skips are capped. */
export function skipReceiptDue(sent = 0) {
  return sent < SKIP_RECEIPTS_MAX;
}

/**
 * Should the ear run now? Pure, the conditions in one place:
 *   on        — Talk over is on (Settings, novaos.bargeIn)
 *   speaking  — Nova is speaking (App state voiceSpeaking)
 *   engine    — the hearing this device resolved to: only 'nova' (the Mac's
 *               browser engine keeps this job in WakeWord.jsx)
 *   turnLive  — a dictation turn of this hook is open, or the Mac is still
 *               writing his last words down: never two microphones at once
 *   micBusy   — another surface's microphone is open
 *   conversing — he is in a spoken conversation he opened (keepMic): the
 *               stream is held between turns then (src/warmMic.js), so the
 *               ear reuses it instead of asking the phone for a microphone
 *               every time Nova opens his mouth (the 15 Sep lesson)
 */
export function earWanted({ on = false, speaking = false, engine = null, turnLive = false, micBusy = false, conversing = false } = {}) {
  return !!on && !!speaking && engine === 'nova' && !turnLive && !micBusy && !!conversing;
}

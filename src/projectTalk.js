// TALKING BACK ON A PROJECT PAGE (Projects phase 2, T6; his ask 1 Nov 2026:
// "Build a microphone on there now"). The project thread's microphone is the
// main thread's own machinery, reused: useDictation records and ends the turn
// (Nova's own ears on his iPhone, the Mac transcribes), listenRules decides
// what an empty turn means, the reply is spoken through App.speakTtsSentence,
// and a tap while Nova speaks is App.stopSpeaking (lossless: unspoken text is
// revealed, not eaten). What is here is only what the project page adds,
// pure, so `npm test` pins it:
//   - what to do with a turn's words (send as a project turn, or say "I did
//     not catch that" and send nothing, never a filler line);
//   - what to say about each way hearing can fail, by its real class;
//   - "Keep talking": reopen the mic once per answer, and stop on the same
//     quiet rule conversation mode uses (listenRules afterEmpty).
import { countsAsEmpty, afterEmpty } from './listenRules.js';

export const NOT_CAUGHT = 'I did not catch that.';

/** A turn's words → the project turn to send, or null (nothing heard: no model call). */
export function projectTurnFromWords(words, projectId) {
  const text = String(words ?? '').replace(/\s+/g, ' ').trim();
  if (!text || !projectId) return null;
  return { projectId, text, spoken: true };
}

/**
 * Every way hearing fails, by its class, with what the page says. The typed
 * box always stays; `typed: true` says so to the view. Never a transcript.
 * The codes are the ones useDictation hands onError (the engine's own codes,
 * the recorder's mic refusals, or the Mac's sentence from transcribe).
 */
export function hearingError(err) {
  const s = String(err ?? '').trim();
  if (s === 'not-allowed' || s === 'service-not-allowed') return { kind: 'permission', line: 'The microphone is blocked. Allow it in Settings → Nova; you can still type here.', typed: true };
  if (s === 'audio-capture') return { kind: 'no-mic', line: 'No microphone was found. Type here instead.', typed: true };
  if (/microphone did not open/i.test(s)) return { kind: 'mic-timeout', line: 'The microphone did not open. Tap to try again, or type.', typed: true };
  if (/not connected to the Mac/i.test(s)) return { kind: 'offline', line: 'Nova is not connected to the Mac, so it cannot hear you. Type here instead.', typed: true };
  if (s === 'network') return { kind: 'offline', line: 'The connection dropped while you were speaking. Type it, or tap to try again.', typed: true };
  // Nova's own ears fail in sentences: the Mac's own reason ("the Mac could
  // not hear that (502)"), shown as it is, never a guessed one
  if (s.includes(' ')) return { kind: 'transcribe', line: `The Mac could not write that down: ${s.replace(/[.\s]+$/, '')}. Nothing was sent; type it instead.`, typed: true };
  return { kind: 'engine', line: `Dictation stopped (${s || 'no reason given'}). Tap the mic to try again, or type.`, typed: true };
}

/**
 * The end of a turn. `words` is what useDictation handed onDone; `info` the
 * receipt it wrote (reason, endedBy, trigger). Returns what the page does:
 *   send   — the project turn, or null
 *   line   — what it shows instead (NOT_CAUGHT), or null
 *   keep   — for Keep talking: 'keep' (stay on), 'pause' (stop it), 'rest'
 * An empty turn the CLOCK ended counts toward pausing; one he ended with his
 * own tap, or that the screen or mic cut short, says nothing about whether
 * he wants to keep talking (listenRules countsAsEmpty).
 */
export function afterProjectTurn({ words, projectId, info = {}, empties = 0 } = {}) {
  const turn = projectTurnFromWords(words, projectId);
  if (turn) return { send: turn, line: null, keep: 'keep', empties: 0 };
  const counts = countsAsEmpty({ endedBy: info.endedBy || '', reason: info.reason || '' });
  const quietTurnEnded = info.reason === 'hidden' || info.reason === 'mic-timeout';
  const n = counts ? empties + 1 : empties;
  const next = counts ? afterEmpty({ trigger: info.trigger || 'tap', empties: n }) : 'rest';
  return { send: null, line: quietTurnEnded ? null : NOT_CAUGHT, keep: next === 'pause' ? 'pause' : 'rest', empties: n };
}

/**
 * KEEP TALKING: after an answer, should the mic reopen by itself? Exactly
 * once per answer (its id), only when the answer is finished, Nova has gone
 * quiet, no turn is open and he has not paused it.
 */
export function reopenDecision({ keepTalking = false, paused = false, answerId = null, reopenedFor = null, busy = false, speaking = false, listening = false, hearing = false } = {}) {
  if (!keepTalking || paused || !answerId) return 'none';
  if (answerId === reopenedFor) return 'none';
  if (busy || speaking || listening || hearing) return 'wait';
  return 'reopen';
}

/** His tap on the mic: while Nova speaks it stops the speech first (barge-in). */
export function micTap({ on = false, speaking = false } = {}) {
  if (on) return { stopSpeech: false, toggle: true };
  return { stopSpeech: !!speaking, toggle: true };
}

/** The mic's state, one word for the view, from the hook and the app. */
export function micState({ supported = true, offline = false, on = false, hearing = false, speaking = false, busy = false, error = null } = {}) {
  if (!supported) return 'unsupported';
  if (offline) return 'offline';
  if (on) return 'listening';
  if (hearing) return 'transcribing';
  if (speaking) return 'speaking';
  if (busy) return 'thinking';
  if (error) return 'error';
  return 'idle';
}

export const MIC_LABEL = {
  unsupported: 'This browser cannot record here. Type instead.',
  offline: 'Offline: the Mac hears you, so the mic waits until it is back.',
  listening: 'Listening',
  transcribing: 'Writing down what you said',
  speaking: 'Nova is speaking · tap to talk over',
  thinking: 'Nova is thinking',
  error: '',
  idle: 'Tap to talk',
};

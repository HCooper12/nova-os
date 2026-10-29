// ---------------------------------------------------------------------------
// THE WARM MICROPHONE (29 Oct 2026, his yes: "Sure, if I am using the mic").
//
// Every turn on Nova's own ears opened the microphone from scratch: a fresh
// getUserMedia, which on his iPhone took median 1.0 s, p90 3.2 s, max 8.7 s
// (26-28 Oct receipts), and 4 of 28 never opened at all. Inside a spoken
// conversation that cost lands on EVERY turn. So while a conversation he
// started himself is running, the stream outlives the turn and the next turn
// records on it at once. It is released the moment the conversation is over.
//
// THE AUDIO-SESSION CHOICE. A live capture keeps iOS in play-and-record.
// What that does to Nova's voice depends on the microphone in use:
//   - the phone's own mic: WebKit's play-and-record routes output to the
//     speaker (default-to-speaker), and play-and-record ignores the ring
//     switch, so Nova stays audible. This is ALREADY what happens during
//     every ack today: the continuation window records while the ack plays.
//   - a Bluetooth headset mic (AirPods, a car): capturing from it forces the
//     hands-free profile, and Nova would talk in phone-call quality for the
//     whole conversation. So with a Bluetooth mic NOTHING is held: the turn
//     releases as it always did (warmDecision 'bluetooth').
// `track.enabled = false` is NOT the answer to either: disabling a track
// silences what it delivers, the capture (and the routing) keeps running. It
// would claim a protection it does not give. Keeping only the permission warm
// saves nothing: in the shell the permission is already granted, and the
// cost measured is the session set-up getUserMedia does.
// While a stream is held the session is marked held (audioSession.micStarted)
// so claimForSpeech never flips it to 'playback' under a live capture.
//
// Unverified on his phone, by construction: the turn receipt says whether the
// stream was reused (`micReused`) and what route it ran on (`micRoute`), and
// localStorage `novaos.warmMic` = '0' turns the whole thing off on a device.
// ---------------------------------------------------------------------------
import { micStarted, micStopped } from './audioSession.js';

export const WARM_IDLE_MS = 60_000;
export const CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
// the triggers that are HIM opening the microphone (src/listenRules.js TRIGGERS)
export const USER_TRIGGERS = new Set(['tap', 'conv-start', 'wake', 'barge']);

/** Which microphone a capture track is, from its label. Pure. */
export function micRoute(label) {
  const l = String(label || '');
  if (/airpods|bluetooth|beats|buds|headset|hands-?free|carplay|\bcar\b|bose|sony|jabra/i.test(l)) return 'bluetooth';
  if (/iphone|ipad|built-?in|internal|macbook|imac|default/i.test(l)) return 'builtin';
  return 'unknown';
}

/**
 * At the end of a turn: hold the stream for the next one, or let it go.
 * Returns { keep, why }. Pure.
 *   enabled      — the device has not turned it off (novaos.warmMic)
 *   conversing   — the surface says the conversation is still going
 *   userOpened   — he opened the mic himself somewhere in this chain
 *   hidden       — the page is not on screen
 *   route        — micRoute of the track
 *   live         — the track is still delivering (not ended)
 */
export function warmDecision({ enabled = true, conversing = false, userOpened = false, hidden = false, route = 'unknown', live = true } = {}) {
  if (!enabled) return { keep: false, why: 'off' };
  if (!live) return { keep: false, why: 'ended' };
  if (hidden) return { keep: false, why: 'hidden' };
  if (!conversing) return { keep: false, why: 'not-conversing' };
  if (!userOpened) return { keep: false, why: 'not-his' };
  if (route === 'bluetooth') return { keep: false, why: 'bluetooth' };
  // a mic WebKit named in a way we do not recognise may be a headset: held,
  // it would put Nova's voice in phone-call quality for the whole
  // conversation, so only the phone's own mic is held (29 Oct 2026)
  if (route !== 'builtin') return { keep: false, why: 'unknown-route' };
  return { keep: true, why: 'conversation' };
}

const enabledOnDevice = () => {
  try { return localStorage.getItem('novaos.warmMic') !== '0'; } catch { return true; }
};
const trackOf = (stream) => stream?.getAudioTracks?.()[0] || null;
const isLive = (stream) => trackOf(stream)?.readyState === 'live';
const stopAll = (stream) => { try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* gone */ } };

// module state: one microphone, one owner (a dictation hook instance)
let warm = null;          // { stream, owner, timer, at }
let chainUser = false;    // he opened the mic himself since the last release
let lastDrop = '';
let watching = false;

function watchPage() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  // the app going to the background ends the conversation's hold at once
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') dropWarm('hidden'); });
  try { window.addEventListener('pagehide', () => dropWarm('hidden')); } catch { /* no window */ }
}

/** Is a stream held between turns (for this owner, when given)? */
export function warmHeld(owner = null) {
  return !!warm && (!owner || warm.owner === owner);
}
export const lastWarmDrop = () => lastDrop;

const STREAM_FAULTS = new Set(['dead', 'ended', 'muted', 'replaced']);
/** Let the held stream go: tracks stopped, the session handed back. */
export function dropWarm(reason = 'drop', owner = null) {
  if (!warm || (owner && warm.owner !== owner)) return false;
  const w = warm;
  warm = null;
  // a stream that died is not a conversation that ended: he still opened it
  if (!STREAM_FAULTS.has(reason)) chainUser = false;
  lastDrop = reason;
  clearTimeout(w.timer);
  stopAll(w.stream);
  micStopped();
  return true;
}

/**
 * The start of a turn: the held stream when there is one for this owner, else
 * a fresh getUserMedia. Resolves { stream, reused, warmMs }.
 */
export async function takeMic({ owner = null, trigger = 'tap', getUserMedia = null } = {}) {
  watchPage();
  if (USER_TRIGGERS.has(trigger)) chainUser = true;
  if (warm && warm.owner === owner && isLive(warm.stream)) {
    clearTimeout(warm.timer);
    warm.timer = 0;
    return { stream: warm.stream, reused: true, warmMs: Date.now() - warm.at };
  }
  // another surface's stream, or a dead one: never two microphones at once
  if (warm) dropWarm(warm.owner === owner ? 'dead' : 'other-owner');
  if (USER_TRIGGERS.has(trigger)) chainUser = true;   // another owner's drop cleared it
  const gum = getUserMedia || ((c) => navigator.mediaDevices.getUserMedia(c));
  const stream = await gum({ audio: CAPTURE });
  return { stream, reused: false, warmMs: null };
}

/**
 * The end of a turn: hold the stream for the next one (warmDecision says
 * when), or stop it. Returns the decision, for the receipt.
 */
export function giveBackMic(stream, { owner = null, conversing = false } = {}) {
  if (!stream) return { keep: false, why: 'none' };
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const d = warmDecision({
    enabled: enabledOnDevice(), conversing, userOpened: chainUser, hidden,
    route: micRoute(trackOf(stream)?.label), live: isLive(stream),
  });
  if (!d.keep) {
    if (warm && warm.stream === stream) dropWarm(d.why);
    else stopAll(stream);
    return d;
  }
  if (warm && warm.stream !== stream) dropWarm('replaced');
  if (!warm) {
    micStarted();   // the session stays play-and-record while the capture lives
    warm = { stream, owner, timer: 0, at: Date.now() };
    const tr = trackOf(stream);
    try {
      // a call, Siri or another app taking the mic: the stream is no use now
      tr?.addEventListener?.('ended', () => { if (warm?.stream === stream) dropWarm('ended'); });
      tr?.addEventListener?.('mute', () => { if (warm?.stream === stream && !warm.inUse) dropWarm('muted'); });
    } catch { /* an old engine */ }
  }
  warm.owner = owner;
  warm.at = Date.now();
  clearTimeout(warm.timer);
  warm.timer = setTimeout(() => dropWarm('idle'), WARM_IDLE_MS);
  return d;
}

/** Mark the held stream as recording a turn (a mute then is the turn's, not the hold's). */
export function markInUse(stream, inUse) {
  if (warm && warm.stream === stream) warm.inUse = !!inUse;
}

// tests only
export function _resetWarmMic() {
  if (warm) { clearTimeout(warm.timer); }
  warm = null;
  chainUser = false;
  lastDrop = '';
}

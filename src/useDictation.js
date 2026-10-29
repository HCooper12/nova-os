import { useEffect, useRef, useState } from 'react';
import { micStarted, micStopped } from './audioSession.js';
import { attachMicStream } from './audioLevel.js';
import { openTurn, sawSpeech, sawEngineEnd, sawRestart, nextAction, endReason, holdVerdict, extendHold, peekDue, holdFor, PEEK_LEAD_MS } from './turnEnd.js';
import { soundsUnfinished } from './turnSense.js';
import { getConnection } from './api.js';
import { recorderSupported, openRecording, transcribeRecording } from './recorder.js';
import { hearingChoice, resolveHearing } from './hearingEngine.js';
import { tapOnOpenMic, isEmptyCapture, openedTurn, micWait, stallOf, holdAsDraft, endedByFor, blindReadDue, blindVerdict, wordCount, BLIND_CAP_MS } from './listenRules.js';
import { takeListen, noteListenEnd, novaSpeakingNow } from './listenCause.js';
import { haptic } from './haptics.js';

// The mic tap below is desktop-only on purpose: SpeechRecognition on iOS
// owns the microphone, and a parallel getUserMedia capture risks silently
// breaking dictation itself — the feature that must never regress. On iOS
// the core still swells for Nova's own voice (the TTS tap in App.speak).
const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

// How often the turn clock asks whether he has finished. Fine enough that
// the send never feels late, coarse enough to cost nothing.
const TICK_MS = 200;

// The engine giving up is not a fault. Under a hold these arrive constantly
// — every pause longer than the browser's own patience — and surfacing them
// would put an error banner under a turn that is going perfectly well.
const SOFT_ERRORS = new Set(['no-speech', 'aborted']);

// How long to wait before trying a thrown restart once more. Long enough for
// the dying engine to have let go of the microphone, short enough that he
// does not hear a hole in the middle of his own sentence.
const RESTART_RETRY_MS = 300;

// WHY THE TURN ENDED, WRITTEN DOWN. Fire-and-forget, awaited by nobody: the
// next time he says "it cut me off" the answer is a line in
// server/data/voice/turns.json instead of a guess. It is a receipt, not
// analytics — nothing reads it but him and whoever is debugging with him.
// A failed POST is a missing line and nothing else; it must never cost him
// the send that is happening on the same beat.
export function reportTurnEnd(surface, preset, info) {
  try {
    const conn = getConnection();
    if (!conn) return;
    fetch(`${conn.baseUrl.replace(/\/$/, '')}/api/voice/turn`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...info, surface, preset, ua: typeof navigator === 'undefined' ? '' : navigator.userAgent }),
      keepalive: true,   // the screen may be closing on the same gesture
    }).catch(() => { /* a receipt is never worth an error in his face */ });
  } catch { /* no connection, no receipt */ }
}

// Real dictation via the browser's speech engine (on-device / OS-provided).
// Feature-detected: mic buttons only render where it actually works.
//
// TWO WAYS THE TURN CAN END.
//   Engine-owned (holdMs 0) — the browser decides. `continuous: false` means
//     it ends the take at the first pause it notices; `continuous: true`
//     means it runs until stopped. This is what the writing surfaces want:
//     the Inbox composer and the recipe describer end when he taps.
//   App-owned (holdMs > 0) — the engine is told to run continuously and is
//     never allowed to end his turn. turnEnd.js decides, on a pause length
//     HE chose. If the engine quits early anyway (iOS does, on its own
//     schedule), another one is opened on the spot and his words carry over,
//     so a sentence spoken across the seam arrives whole.
// The second exists because of his report: dictation cut him off mid-thought
// and sent, and there is no threshold in the Web Speech API to lengthen.
//
// One place asks whether this browser can hear at all — the dictation hook,
// the wake word, and every button that should hide itself when it cannot.
export const speechRecognitionSupported = () => typeof window !== 'undefined'
  && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// The same rail, for the moment he talks OVER Nova rather than the moment his
// turn ends — see server/lib/voiceTurns.js for why they are read together.
export function reportBargeIn(heard, why) {
  const conn = getConnection();
  if (!conn) return;
  try {
    fetch(`${conn.baseUrl}/api/voice/turn`, {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'barge-in', surface: 'barge', heard: true, ms: 0, restarts: 0, why, text: heard, ua: navigator.userAgent }),
    }).catch(() => {});
  } catch { /* a receipt must never be in the way of the conversation */ }
}

// "LISTENING, GO AHEAD" (18 Oct 2026). A tap on a mic that has heard nothing
// keeps the turn open (src/listenRules.js tapOnOpenMic); the hook calls
// `onNudge` and the surface shows this caption for a moment. Returns
// [shown, fire]: pass `fire` as onNudge.
export const NUDGE_LINE = 'Listening, go ahead';
export function useNudge(ms = 2200) {
  const [shown, setShown] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fire = () => {
    setShown(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), ms);
  };
  return [shown, fire];
}

// The audio session type at the moment the mic opened, for the receipt.
const sessionType = () => {
  try { return navigator.audioSession ? String(navigator.audioSession.type || '') : 'unsupported'; } catch { return 'unsupported'; }
};

// KEPT AFTER A FAILURE (29 Sep 2026, the Nova thread, mockup 63 D · 5). With
// `keepFailed`, a turn the Mac could not write down is not an error and a
// lost recording: the audio is handed to `onKept` ({ blob, ms, bytes, vad,
// reason, at }) and neither onError nor onDone fires, so no "heard nothing"
// is said about words that exist. `resend(take)` sends those same bytes to
// the transcriber again and, on words, ends the turn through onDone exactly
// as a first try would. Without the option every path below is unchanged.
//
// THE LISTENING RECEIPT (18 Oct 2026). Every turn also carries what opened
// the mic (`trigger`), what closed it (`endedBy`), when the recorder really
// opened (`micOpenMs`, null when it never did), and what the capture held;
// server/lib/voiceTurns.js listenFields is the other half of that contract.
// `toggle({ trigger })` names the opener; a mark App made (listenCause.js)
// wins when it is fresh. `toggle({ force: true })` ends a turn whatever the
// tap rule says (a surface closing).
// STILL TALKING? (27 Oct 2026). A held turn whose hold is up is not ended
// when his words so far sound unfinished (turnSense.js): the hold extends
// (turnEnd.js extendHold) and `extended` is true while it does, so the core
// can show he may keep going. `judge: false` opts a surface out; `getAsked`
// hands over the question Nova just put to him; `onSound(at)` fires on every
// sign of his voice (the continuation window listens to it).
// On Nova's own ears there is no live transcript, so near the end of the
// hold the clip so far is read (recorder.peek) and judged; when that read
// covers everything he said, it IS the turn's words and the end does not
// transcribe twice.
export function useDictation(getBase, onText, onDone, { continuous = true, holdMs = 0, leadMs = 0, onError, onTurnEnd, onNudge, keepFailed = false, onKept, judge = true, getAsked = null, onSound = null } = {}) {
  const recRef = useRef(null);
  const baseRef = useRef('');
  const saidRef = useRef('');      // words from earlier engines in THIS turn
  const finalsRef = useRef('');    // finalised by the engine now running
  const interimRef = useRef('');   // its unfinalised tail
  const turnRef = useRef(null);
  const wantRef = useRef(false);   // he still has the floor
  const liveRef = useRef(false);   // a turn is open — makes closing idempotent
  const clockRef = useRef(0);
  const retryRef = useRef(0);      // a pending second go at a thrown restart
  const reasonRef = useRef('engine'); // why this turn is ending, for the receipt
  const meterRef = useRef({ stream: null, detach: null });
  const recordingRef = useRef(null);  // Nova's own ears: the open recording, if any
  const metaRef = useRef(null);       // this turn's receipt facts (trigger, mic open, taps…)
  const turnSeqRef = useRef(0);       // a late getUserMedia must not join a newer turn
  const mountedRef = useRef(true);
  const extendedRef = useRef(false);  // the hold is running long on unfinished words
  const peekRef = useRef(null);       // own ears: the clip-so-far read { heardAt, status, text, ms, at }
  const blindRef = useRef(null);      // own ears, meter deaf: the reads that decide { reads, pending, lastReadAt, useText, useMs }
  const [extended, setExtended] = useState(false);
  const [on, setOn] = useState(false);
  const [hearing, setHearing] = useState(false);  // recorded, waiting on the Mac for the words
  const [blind, setBlind] = useState(false);      // the level meter hears nothing at all: tap to send
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const held = holdMs > 0;
  // WHICH EARS (src/hearingEngine.js). Read per render: a Settings change
  // applies to the next turn without a reload, and it is one localStorage read.
  const engine = resolveHearing({
    choice: hearingChoice(), ios: IOS, speech: !!SR,
    recorder: recorderSupported(), connected: !!getConnection(),
  });
  const novaEars = engine === 'nova';

  const clearExtended = () => { if (extendedRef.current) { extendedRef.current = false; setExtended(false); } };
  // The hold is up. Extend it if the words sound unfinished; true when it did.
  const tryExtend = (text) => {
    if (!judge || !held || !turnRef.current) return false;
    let asked = '';
    try { asked = String(getAsked?.() || ''); } catch { /* no question known */ }
    const unfinished = soundsUnfinished(text, { asked });
    if (holdVerdict(turnRef.current, { unfinished }) !== 'extend') return false;
    turnRef.current = extendHold(turnRef.current);
    extendedRef.current = true;
    setExtended(true);
    return true;
  };
  const heardSound = (at) => { try { onSound?.(at); } catch { /* the window is the surface's business */ } };

  const stopMeter = () => {
    try { meterRef.current.detach?.(); } catch { /* already gone */ }
    try { meterRef.current.stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* already gone */ }
    meterRef.current = { stream: null, detach: null };
  };

  // Everything heard this turn, as one string: the seed, the earlier
  // engines' words, and the running engine's finals plus its tail.
  const composed = () => [baseRef.current, saidRef.current, finalsRef.current + interimRef.current]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const emit = () => onText(composed());

  // The dying engine's words belong to the turn, not to the engine.
  const carryOver = () => {
    const tail = (finalsRef.current + interimRef.current).trim();
    if (tail) saidRef.current = `${saidRef.current} ${tail}`.replace(/\s+/g, ' ').trim();
    finalsRef.current = '';
    interimRef.current = '';
  };

  const newMeta = (trigger, now) => ({
    startAt: now, trigger, micOpenAt: null, firstSoundAt: null, hidden: false,
    audioSession: '', novaSpeaking: novaSpeakingNow(), lastTapAt: null, tapped: false,
  });
  // the receipt fields every path shares (listenFields on the server)
  const listenInfo = (reason) => {
    const m = metaRef.current;
    if (!m) return {};
    return {
      trigger: m.trigger,
      endedBy: endedByFor(reason, { tapped: m.tapped }),
      hidden: !!m.hidden,
      novaSpeaking: !!m.novaSpeaking,
    };
  };

  // Idempotent on purpose: error and end both arrive for the same failure,
  // and micStopped() decrements a counter that must stay balanced.
  const closeOut = (fireDone = true, extra = null) => {
    if (!liveRef.current) return;
    liveRef.current = false;
    wantRef.current = false;
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = 0; }
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = 0; }
    clearExtended();
    const turn = turnRef.current;
    turnRef.current = null;
    recRef.current = null;
    stopMeter();
    micStopped();
    setOn(false);
    // The receipt goes out BEFORE the send, because the send is what he
    // remembers and the receipt is what explains it. Wrapped: a listener
    // that throws must not swallow onDone and lose his words.
    const info = listenInfo(reasonRef.current);
    const startAt = metaRef.current?.startAt ?? turn?.startedAt;
    if (held && fireDone) {
      try {
        onTurnEnd?.({
          reason: reasonRef.current,
          ms: startAt ? Date.now() - startAt : 0,
          restarts: turn?.restartsTotal || 0,
          heard: !!turn && turn.lastHeardAt !== null,
          ...info,
          // the Nova-ears path closes here only when the mic itself refused:
          // say which ears, and why, on the row (18 Oct 2026)
          ...(extra || {}),
        });
      } catch { /* never at the cost of the turn */ }
    }
    noteListenEnd({ reason: reasonRef.current, endedBy: info.endedBy || 'engine', trigger: info.trigger || 'tap' });
    metaRef.current = null;
    // A TURN THE SCREEN ENDED, WITH NOTHING IN IT, is not an empty listen: he
    // locked the phone. No "heard nothing", no count toward pausing.
    if (reasonRef.current === 'hidden' && !composed()) return;
    // THE WORDS TRAVEL WITH THE END OF THE TURN. Surfaces used to read them
    // back from their own render-refreshed ref, which is one render behind
    // an onText that has only just been called (see finishNova).
    if (fireDone) onDone?.(composed());
  };

  const restart = () => {
    carryOver();
    turnRef.current = sawRestart(turnRef.current, Date.now());
    recRef.current = null;
    spin(true);
  };

  // `isRestart` matters at the very bottom: a first start that throws is a
  // microphone he never got, and a restart that throws is a sentence in
  // progress. They cannot be handled the same way.
  function spin(isRestart = false, attempt = 0) {
    let rec;
    try { rec = new SR(); } catch { closeOut(); return; }
    rec.continuous = held ? true : continuous;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    finalsRef.current = '';
    interimRef.current = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalsRef.current += t;
        else interim += t;
      }
      interimRef.current = interim;
      if (turnRef.current) turnRef.current = sawSpeech(turnRef.current, Date.now());
      clearExtended();
      heardSound(Date.now());
      emit();
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;               // already superseded
      if (!held || !wantRef.current) { closeOut(); return; }
      turnRef.current = sawEngineEnd(turnRef.current);
      const now = Date.now();
      if (nextAction(turnRef.current, now, { holdMs, leadMs }) !== 'restart') {
        const why = endReason(turnRef.current, now, { holdMs, leadMs }) || 'engine';
        // the engine quit on his pause, but the words say he is mid-thought
        if (why === 'hold' && tryExtend(composed())) { restart(); return; }
        reasonRef.current = why;
        closeOut();
        return;
      }
      restart();
    };
    // a denied mic permission used to just silently flip the button off
    rec.onerror = (e) => {
      const kind = e?.error || 'dictation failed';
      if (held && wantRef.current && SOFT_ERRORS.has(kind)) return;   // onend restarts
      onError?.(kind);
      closeOut();
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      // A RESTART THAT THROWS USED TO SUBMIT HIS RAMBLE. iOS ends a
      // recognition session on its own every ~60s, and on a network hiccup —
      // on cellular, in the car, constantly. The replacement is built inside
      // that same `onend`, and `start()` can throw because the dying engine
      // has not let go of the microphone yet. This line used to collapse
      // straight to closeOut(), which fires onDone, which SENDS the
      // half-finished thought as though he had stopped talking — his 12 Sep
      // report, "I had to keep trying to cut it off so I could explain more".
      // So a restart gets one more go 300ms later, and only then admits the
      // engine is gone — by name, in the receipt, instead of as a mystery.
      recRef.current = null;                            // a stray onend must not be believed
      if (!isRestart || attempt > 0) { reasonRef.current = 'engine'; closeOut(); return; }
      retryRef.current = setTimeout(() => {
        retryRef.current = 0;
        if (!liveRef.current || !wantRef.current) return;   // he left, or closeOut already ran
        spin(true, attempt + 1);
      }, RESTART_RETRY_MS);
    }
  }

  // His turn is over when turnEnd.js says so — never when the engine says so.
  const tick = () => {
    if (!liveRef.current || !wantRef.current || !turnRef.current) return;
    const now = Date.now();
    const act = nextAction(turnRef.current, now, { holdMs, leadMs });
    if (act === 'wait') return;
    if (act === 'restart') { restart(); return; }
    const why = endReason(turnRef.current, now, { holdMs, leadMs }) || 'engine';
    if (why === 'hold' && tryExtend(composed())) return;   // still talking: keep listening
    reasonRef.current = why;
    wantRef.current = false;               // stop() lands in onend, which closes
    const rec = recRef.current;
    if (!rec) { closeOut(); return; }
    try { rec.stop(); } catch { closeOut(); }
  };

  // ---- NOVA'S OWN EARS -------------------------------------------------
  // The same turn, the same clock, the same receipt — only the source of
  // "he is still talking" (vad.js loudness instead of engine results) and of
  // the words (the Mac, once, at the end) differ.
  // A deaf meter cannot end his turn by loudness. It was 90 s until 18 Oct
  // 2026 (a meter blind that long posted "All right. . Okay." to the Coach),
  // then 20 s; since 29 Oct the clip so far is read and the WORDS end it
  // (listenRules.blindVerdict), with BLIND_CAP_MS (20 s) only for reads that
  // keep failing, and a short transcript from either is a draft (holdAsDraft).
  const TAP_CAP_MS = 300_000;      // tap-to-end surfaces (the Inbox composer) still stop eventually

  const finishNova = async () => {
    if (!liveRef.current) return;
    const meta = metaRef.current || newMeta('tap', Date.now());
    metaRef.current = null;
    const stopAt = Date.now();
    const reason = reasonRef.current;
    const handle = recordingRef.current;
    recordingRef.current = null;
    liveRef.current = false;
    wantRef.current = false;
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = 0; }
    // the clip-so-far read, kept when it covers everything he said: no
    // speech since it was taken, and the turn ended on his pause
    const pk = peekRef.current;
    peekRef.current = null;
    const reusePeek = reason === 'hold' && pk?.status === 'done' && !!pk.text && !!turnRef.current && pk.heardAt === turnRef.current.lastHeardAt;
    // a blind turn the reads ended: their last read IS the words (no second upload)
    const br = blindRef.current;
    blindRef.current = null;
    const reuseBlind = reason === 'hold' && !!br?.useText;
    clearExtended();
    turnRef.current = null;
    micStopped();
    setOn(false);
    setBlind(false);
    setHearing(true);
    const blindMs = handle?.blindMs?.() ?? 0;
    const diagnosis = handle?.diagnosis?.() || null;
    const vad = handle?.vad();
    const wasBlind = !!handle?.blind();
    const blob = handle ? await handle.stop() : null;
    const recMs = meta.micOpenAt ? stopAt - meta.micOpenAt : null;
    const meter = wasBlind ? 'blind' : vad?.heardAny ? 'heard' : 'silent';
    const endedBy = endedByFor(reason, { tapped: meta.tapped });
    let text = '';
    let tx = null;
    let failure = null;
    let cause = null;
    let txStatus = 'none';   // nothing was recorded
    if (blob && blob.size > 0) {
      if (reason === 'hidden' && !vad?.heardAny) {
        // the screen went away and he had said nothing: nothing to write down
        cause = 'hidden';
        txStatus = 'skipped';
      } else if (isEmptyCapture({ bytes: blob.size, ms: recMs })) {
        // A CAPTURE WITH NOTHING IN IT never reaches the transcriber: a 5-byte
        // clip made Groq answer 400 and Nova say 502 (src/listenRules.js).
        cause = 'empty-capture';
        txStatus = 'skipped';
      } else {
        // Sent even when the meter heard nothing: a meter that is wrong about
        // silence must not cost him his words. A silent clip costs the Mac 200ms.
        if (reusePeek) {
          tx = { text: pk.text, ms: pk.ms, backend: 'peek', dropped: '' };
          text = pk.text;
          txStatus = 'ok';
        } else if (reuseBlind) {
          tx = { text: br.useText, ms: br.useMs ?? null, backend: 'read', dropped: '' };
          text = br.useText;
          txStatus = 'ok';
        } else {
          try {
            tx = await transcribeRecording(blob, { vad: meter });
            text = tx.text;
            txStatus = text ? 'ok' : 'empty';
          } catch (e) { failure = e; txStatus = 'error'; }
        }
      }
    } else if (blob) {
      cause = 'empty-capture';
      txStatus = 'skipped';
    } else if (reason === 'mic-timeout') {
      cause = 'mic-timeout';
    }
    if (!mountedRef.current) return;
    setHearing(false);
    if (text) {
      saidRef.current = text;
      finalsRef.current = '';
      interimRef.current = '';
      emit();
    }
    // A BLIND METER'S SHORT TRANSCRIPT IS A DRAFT. It stays in the composer
    // (emit above put it there) and is never sent: he sends it, or does not.
    const draft = holdAsDraft({ blind: wasBlind, endedBy, text, byReads: !!br?.reads?.length && (reason === 'hold' || reason === 'lead') });
    if (draft) cause = 'blind-draft';
    const kept = !!(failure && keepFailed && blob && blob.size > 0);
    if (failure && !kept) onError?.(failure.message || 'Nova could not hear that');
    // said once, plainly, instead of "heard nothing" about a mic that never opened
    if (reason === 'mic-timeout') onError?.('The microphone did not open.');
    if (held || onTurnEnd) {
      try {
        onTurnEnd?.({
          reason,
          ms: stopAt - meta.startAt,
          restarts: 0,
          heard: !!text,
          engine: 'nova',
          vad: meter,
          bytes: blob?.size || 0,
          txMs: tx?.ms ?? null,
          ...(failure ? { why: String(failure.message || '').slice(0, 120) } : {}),
          trigger: meta.trigger,
          endedBy,
          micOpenMs: meta.micOpenAt ? meta.micOpenAt - meta.startAt : null,
          ...(recMs !== null ? { recMs } : {}),
          blindMs,
          ...(br?.reads?.length ? { blindReads: br.reads.length } : {}),
          ...(meta.stallMs ? { stallMs: meta.stallMs } : {}),
          ...(diagnosis || {}),
          firstSoundMs: meta.firstSoundAt && meta.micOpenAt ? Math.max(0, meta.firstSoundAt - meta.micOpenAt) : null,
          peak: vad?.peak ?? 0,
          txStatus,
          txChars: text.length,
          ...(tx?.dropped ? { txDropped: tx.dropped } : {}),
          ...(meta.audioSession ? { audioSession: meta.audioSession } : {}),
          novaSpeaking: !!meta.novaSpeaking,
          hidden: !!meta.hidden,
          ...(cause ? { cause } : {}),
        });
      } catch { /* never at the cost of the turn */ }
    }
    noteListenEnd({ reason, endedBy, trigger: meta.trigger });
    // nothing to hand over: a draft waits in the composer; a turn the screen
    // ended or a mic that never opened is not an empty listen
    if (draft) return;
    if (!text && (reason === 'hidden' || reason === 'mic-timeout')) return;
    // HIS WORDS, HANDED OVER, NOT LOOKED UP. On 25 Sep at 14:22 his iPhone
    // recorded 39.5s, the Mac transcribed 384 characters, and nothing was
    // sent: emit() above had only just called onText, React had not rendered
    // it, and the bottom-bar surface's onDone read its ref (refreshed on
    // render) as empty. Every Nova-ears turn raced this; the browser engine
    // never did because its words arrived over many renders.
    if (kept) {
      try {
        onKept?.({
          blob, at: Date.now(), ms: stopAt - meta.startAt, bytes: blob.size,
          vad: wasBlind ? 'blind' : vad?.heardAny ? 'heard' : 'silent',
          reason: String(failure.message || 'the Mac could not write that down'),
        });
      } catch { /* the take is his; a listener that throws must not lose the turn's end */ }
      return;
    }
    onDone?.(composed());
  };

  // THE SAME SECONDS, AGAIN. Only a take this hook handed to onKept comes
  // back here; nothing is recorded anew. Resolves { ok, text } or
  // { ok: false, reason } — the caller decides what the thread says.
  const resend = async (take) => {
    if (!take?.blob || hearing || liveRef.current) return { ok: false, reason: 'busy' };
    setHearing(true);
    let text = '';
    let failure = null;
    try { const tx = await transcribeRecording(take.blob, { vad: take.vad || '' }); text = String(tx.text || '').trim(); } catch (e) { failure = e; }
    if (!mountedRef.current) return { ok: false, reason: 'gone' };
    setHearing(false);
    // No turn receipt: a retry is not a turn ending (the first try already
    // wrote one), and the receipt's reason vocabulary is closed
    // (server/lib/voiceTurns.js END_REASONS).
    if (failure) return { ok: false, reason: String(failure.message || 'the Mac could not write that down') };
    if (!text) return { ok: false, reason: 'the Mac found no words in it', empty: true };
    onDone?.(text);
    return { ok: true, text };
  };

  const tickNova = () => {
    if (!liveRef.current || !wantRef.current || !turnRef.current) return;
    const now = Date.now();
    const handle = recordingRef.current;
    // the page froze between ticks (29 Oct 2026): that time is not the mic's
    const meta = metaRef.current;
    if (meta) {
      const stall = stallOf({ lastTickAt: meta.lastTickAt ?? null, now, tickMs: TICK_MS });
      if (stall) meta.stallMs = (meta.stallMs || 0) + stall;
      meta.lastTickAt = now;
    }
    // THE LEAD STARTS WHEN THE MIC OPENS (18 Oct 2026). Until the recorder is
    // open nothing can hear him, so no clock runs against him; if it has not
    // opened in 5 s of running clock it is not going to, and the turn says so.
    if (!handle) {
      if (micWait({ startedAt: meta?.startAt ?? turnRef.current.startedAt, now, stalledMs: meta?.stallMs || 0 }) === 'timeout') {
        reasonRef.current = 'mic-timeout';
        finishNova();
      }
      return;
    }
    const age = now - turnRef.current.startedAt;   // from the open (openedTurn)
    // a meter that wakes up mid-turn (the graph resumed) takes over again
    const deaf = !!handle.blind();
    setBlind(deaf);
    if (deaf) {
      if (!held) {
        if (age >= BLIND_CAP_MS) { reasonRef.current = 'cap-idle'; finishNova(); }
        return;
      }
      // THE WORDS DECIDE (listenRules.blindVerdict): read the clip so far
      // every 2.5 s; words that stop growing end the turn on his hold
      const b = blindRef.current || (blindRef.current = { reads: [], pending: false, lastReadAt: null, useText: '', useMs: null });
      const openAt = turnRef.current.startedAt;
      if (blindReadDue({ openAt, now, lastReadAt: b.lastReadAt, pending: b.pending })) startBlindRead(handle, b);
      // more words than any read before: he is talking, as surely as a meter
      // would have said (and a meter that wakes later knows he spoke)
      const top = [...b.reads].reverse().find((r) => r.ok && wordCount(r.text) > 0);
      if (top && wordCount(top.text) > (b.words || 0)) {
        b.words = wordCount(top.text);
        turnRef.current = sawSpeech(turnRef.current, top.at);
        heardSound(top.at);
        if (metaRef.current && !metaRef.current.firstSoundAt) metaRef.current.firstSoundAt = top.at;
      }
      const v = blindVerdict({ reads: b.reads, openAt, now, holdMs: holdFor(turnRef.current, holdMs), leadMs, capMs: BLIND_CAP_MS });
      if (v.verdict === 'wait') return;
      if (v.verdict === 'hold') {
        if (tryExtend(v.text)) return;   // the words sound unfinished: his hold grows, as with a live meter
        b.useText = v.text;
        b.useMs = b.reads[b.reads.length - 1]?.ms ?? null;
      }
      reasonRef.current = v.verdict;
      finishNova();
      return;
    }
    if (!held) {
      if (age >= TAP_CAP_MS) { reasonRef.current = 'cap-absolute'; finishNova(); }
      return;
    }
    const t = turnRef.current;
    // STILL TALKING? read the clip so far shortly before the hold is up, so
    // the verdict is in hand when it is (one read per pause)
    if (judge && peekDue(t, now, { holdMs }) && peekRef.current?.heardAt !== t.lastHeardAt) startPeek(handle, t.lastHeardAt);
    const why = endReason(t, now, { holdMs, leadMs });
    if (!why) return;
    if (why === 'hold' && judge) {
      const pk = peekRef.current;
      if (pk && pk.heardAt === t.lastHeardAt) {
        // the words are on their way: wait for them, but never long
        if (pk.status === 'pending' && now - pk.at < PEEK_WAIT_MS) return;
        if (pk.status === 'done' && tryExtend(pk.text)) return;
      }
      // no read, a failed read, or a slow one: silence alone decides, as before
    }
    reasonRef.current = why;
    finishNova();
  };

  // A blind turn's read: the clip so far, sent as 'blind' so the Mac drops
  // Whisper's silence lines. A failure is a read that says nothing.
  const startBlindRead = (handle, b) => {
    const at = Date.now();
    b.pending = true;
    b.lastReadAt = at;
    Promise.resolve(handle?.peek ? handle.peek() : null).then((blob) => {
      if (!blob || blob.size < 1024) throw new Error('nothing to read yet');
      return transcribeRecording(blob, { vad: 'blind', timeoutMs: 6000 });
    }).then((tx) => {
      b.reads.push({ at, ok: true, text: String(tx.text || '').trim(), ms: tx.ms });
    }).catch(() => {
      b.reads.push({ at, ok: false, text: '' });
    }).finally(() => { b.pending = false; });
  };

  // The read itself. A failure of any kind leaves the verdict to silence.
  const PEEK_WAIT_MS = PEEK_LEAD_MS + 1200;   // at most 1.2 s past his hold
  const startPeek = (handle, heardAt) => {
    const pk = { heardAt, status: 'pending', text: '', ms: null, at: Date.now() };
    peekRef.current = pk;
    Promise.resolve(handle?.peek ? handle.peek() : null).then((blob) => {
      if (!blob || blob.size < 1024) throw new Error('nothing to read yet');
      return transcribeRecording(blob, { vad: 'heard', timeoutMs: 6000 });
    }).then((tx) => {
      pk.text = String(tx.text || '').trim();
      pk.ms = tx.ms;
      pk.status = pk.text ? 'done' : 'failed';
    }).catch(() => { pk.status = 'failed'; });
  };

  const startNova = (trigger = 'tap') => {
    baseRef.current = getBase();
    saidRef.current = '';
    finalsRef.current = '';
    interimRef.current = '';
    const now = Date.now();
    const seq = ++turnSeqRef.current;
    peekRef.current = null;
    blindRef.current = null;
    metaRef.current = newMeta(trigger, now);
    turnRef.current = baseRef.current ? sawSpeech(openTurn(now), now) : openTurn(now);
    if (baseRef.current) emit();
    reasonRef.current = 'engine';
    liveRef.current = true;
    wantRef.current = true;
    micStarted();
    setOn(true);
    setBlind(false);
    clockRef.current = setInterval(tickNova, TICK_MS);
    openRecording({
      onLevel: (vad) => {
        if (vad.speaking && turnRef.current && turnSeqRef.current === seq) {
          turnRef.current = sawSpeech(turnRef.current, Date.now());
          clearExtended();
          heardSound(Date.now());
          if (metaRef.current && !metaRef.current.firstSoundAt) metaRef.current.firstSoundAt = Date.now();
        }
      },
    }).then((handle) => {
      // he stopped before the mic opened, or the turn gave up on it
      if (!liveRef.current || turnSeqRef.current !== seq) { handle.cancel(); return; }
      recordingRef.current = handle;
      const at = Date.now();
      if (metaRef.current) { metaRef.current.micOpenAt = at; metaRef.current.audioSession = sessionType(); }
      turnRef.current = openedTurn(turnRef.current, at);
    }).catch((e) => {
      // the mic itself refused — permission, or no device. Nothing was
      // recorded, so there is nothing to send: say why and stop.
      // (a turn already over, by his tap or the mic timeout, has said its piece)
      if (turnSeqRef.current !== seq || !liveRef.current) return;
      const kind = e?.name === 'NotAllowedError' ? 'not-allowed' : e?.name === 'NotFoundError' ? 'audio-capture' : (e?.message || 'microphone failed');
      onError?.(kind);
      reasonRef.current = 'engine';
      if (liveRef.current) closeOut(true, { engine: 'nova', why: String(kind).slice(0, 120), micOpenMs: null, txStatus: 'none' });
    });
  };

  const startTurn = (trigger = 'tap') => {
    metaRef.current = newMeta(trigger, Date.now());
    baseRef.current = getBase();
    saidRef.current = '';
    finalsRef.current = '';
    interimRef.current = '';
    // A SEEDED TURN HAS ALREADY HEARD HIM. "Hey Nova, what's the weather" and a
    // barge-in both arrive with words in hand, and a fresh turn runs on the
    // LEAD — the generous silence for someone who has not started yet — so
    // Nova sat there for seven seconds after a question he had already
    // finished asking. Words already said means the clock is the HOLD, which
    // is five seconds off the front of every hands-free turn.
    const now = Date.now();
    turnRef.current = baseRef.current ? sawSpeech(openTurn(now), now) : openTurn(now);
    if (baseRef.current) emit();   // he sees his own words land, not an empty box
    reasonRef.current = 'engine';          // until the clock or the engine says otherwise
    liveRef.current = true;
    wantRef.current = true;
    micStarted();  // the browser picks the recording session while he talks
    setOn(true);
    if (held) clockRef.current = setInterval(tick, TICK_MS);
    spin();
    // best-effort audio-level tap so the core visibly hears him while he
    // talks — any failure leaves dictation completely untouched
    if (!IOS && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (!liveRef.current) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        meterRef.current = { stream, detach: attachMicStream(stream) };
      }).catch(() => { /* no meter, no harm */ });
    }
  };

  // `opts` is { trigger, force } from a caller, or a click event from an
  // onClick={dict.toggle}: only the two named fields are ever read.
  // Returns 'kept' when the tap was taken as "still listening".
  const toggle = (opts) => {
    if (hearing) return undefined;         // the words are on their way; a tap now would lose them
    const force = opts?.force === true;
    if (on && liveRef.current) {
      // A TAP ON A SILENT MIC KEEPS LISTENING (18 Oct 2026). Eight of his
      // turns in a week were a tap on a mic that had heard nothing, sent as
      // silence; seven were followed by him typing the question. A held turn
      // that has not heard him yet stays open, says so, and a second tap
      // within 2 s ends it (src/listenRules.js tapOnOpenMic).
      const meta = metaRef.current;
      const now = Date.now();
      if (!force && meta) {
        const verdict = tapOnOpenMic({
          held,
          blind: novaEars ? !!recordingRef.current?.blind() : false,
          heard: !!turnRef.current && turnRef.current.lastHeardAt !== null,
          now,
          lastTapAt: meta.lastTapAt,
        });
        if (verdict === 'keep') {
          meta.lastTapAt = now;
          try { haptic('tick'); } catch { /* a haptic is never worth the turn */ }
          try { onNudge?.(); } catch { /* the caption is the surface's business */ }
          return 'kept';
        }
      }
      if (meta) meta.tapped = true;
      reasonRef.current = 'tap';
    }
    // what opened the mic: App's fresh mark (conversation start, wake word,
    // barge-in) wins over the caller's own; a stop takes no mark
    const trigger = on ? 'tap' : takeListen(typeof opts?.trigger === 'string' ? opts.trigger : 'tap');
    if (novaEars) {
      if (on) finishNova();
      else startNova(trigger);
      return undefined;
    }
    if (on) {
      wantRef.current = false;             // a deliberate stop never restarts
      const rec = recRef.current;
      if (!rec) { closeOut(); return; }
      try { rec.stop(); } catch { closeOut(); }
      return undefined;
    }
    if (SR) startTurn(trigger);
    return undefined;
  };

  // THE SCREEN WENT AWAY (18 Oct 2026). Locked or switched away mid-turn, the
  // clock froze: an 18 s lead and a 166 s cap-idle were counted as empty
  // listens. A turn now ends on `hidden`; words already heard still go, and
  // a turn with nothing in it ends quietly (it is not an empty listen).
  const visRef = useRef(null);
  visRef.current = () => {
    if (!liveRef.current || !metaRef.current) return;
    metaRef.current.hidden = true;
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
    reasonRef.current = 'hidden';
    if (novaEars) { finishNova(); return; }
    wantRef.current = false;
    const rec = recRef.current;
    if (!rec) { closeOut(); return; }
    try { rec.stop(); } catch { closeOut(); }
  };
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVis = () => visRef.current?.();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Leaving the screen mid-turn used to leave the recogniser running; with a
  // clock behind it that would also leave an interval ticking forever.
  useEffect(() => { mountedRef.current = true; }, []);
  useEffect(() => () => {
    mountedRef.current = false;
    try { recordingRef.current?.cancel(); } catch { /* already gone */ }
    recordingRef.current = null;
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = 0; }
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = 0; }
    wantRef.current = false;
    try { recRef.current?.stop(); } catch { /* already gone */ }
    recRef.current = null;
    if (liveRef.current) { liveRef.current = false; stopMeter(); micStopped(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // END WITHOUT SENDING (27 Oct 2026): the continuation window closed with
  // nothing said in it. No words go anywhere, no "heard nothing", no receipt
  // (the turn it was waiting to add to already wrote one).
  const abandon = () => {
    if (!liveRef.current) return;
    ++turnSeqRef.current;   // a mic still opening joins nothing
    if (novaEars) {
      liveRef.current = false;
      wantRef.current = false;
      if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = 0; }
      try { recordingRef.current?.cancel(); } catch { /* already gone */ }
      recordingRef.current = null;
      turnRef.current = null;
      metaRef.current = null;
      peekRef.current = null;
      blindRef.current = null;
      clearExtended();
      micStopped();
      setOn(false);
      setBlind(false);
      return;
    }
    wantRef.current = false;
    const rec = recRef.current;
    closeOut(false);
    try { rec?.stop(); } catch { /* already stopped */ }
  };

  return { supported: !!engine, on, toggle, hearing, blind, engine, resend, extended, abandon };
}

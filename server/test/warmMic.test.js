// THE WARM MICROPHONE (29 Oct 2026, his yes: "Sure, if I am using the mic").
// Every turn opened the mic from scratch (p90 3.2 s, max 8.7 s on his
// iPhone). Inside a conversation he started, the stream now outlives the
// turn; these pin when it is kept, when it is let go, and that a Bluetooth
// mic (hands-free profile: Nova in phone-call quality) is never held.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = await import('../../src/warmMic.js');
const { listenFields } = await import('../lib/voiceTurns.js');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

function fakeStream(label = 'iPhone Microphone') {
  const track = { label, readyState: 'live', stopped: 0, listeners: {}, stop() { this.readyState = 'ended'; this.stopped += 1; }, addEventListener(k, f) { this.listeners[k] = f; } };
  return { track, getAudioTracks: () => [track], getTracks: () => [track] };
}

test('the route comes from the track label; Bluetooth is told apart', () => {
  assert.equal(W.micRoute('iPhone Microphone'), 'builtin');
  assert.equal(W.micRoute('AirPods Pro'), 'bluetooth');
  assert.equal(W.micRoute("Hayden's AirPods"), 'bluetooth');
  assert.equal(W.micRoute('Default - MacBook Pro Microphone (Built-in)'), 'builtin');
  assert.equal(W.micRoute('CarPlay'), 'bluetooth');
  assert.equal(W.micRoute(''), 'unknown');
});

test('kept only inside a conversation he opened, on screen, on the phone mic', () => {
  const ok = { enabled: true, conversing: true, userOpened: true, hidden: false, route: 'builtin', live: true };
  assert.deepEqual(W.warmDecision(ok), { keep: true, why: 'conversation' });
  // 9 Nov 2026: a headset is held too (the hands-free switch cost 2 to 4 s a turn)
  assert.deepEqual(W.warmDecision({ ...ok, route: 'unknown' }), { keep: true, why: 'unknown-route-held' });
  assert.equal(W.warmDecision({ ...ok, conversing: false }).why, 'not-conversing');
  assert.equal(W.warmDecision({ ...ok, userOpened: false }).why, 'not-his');
  assert.equal(W.warmDecision({ ...ok, hidden: true }).why, 'hidden');
  assert.deepEqual(W.warmDecision({ ...ok, route: 'bluetooth' }), { keep: true, why: 'bluetooth-held' });
  assert.equal(W.warmDecision({ ...ok, enabled: false }).why, 'off');
  assert.equal(W.warmDecision({ ...ok, live: false }).why, 'ended');
});

test('turn two records on the stream turn one kept: no second getUserMedia', async () => {
  W._resetWarmMic();
  let opens = 0;
  const gum = async () => { opens += 1; return fakeStream(); };
  const owner = {};
  const a = await W.takeMic({ owner, trigger: 'conv-start', getUserMedia: gum });
  assert.equal(a.reused, false);
  assert.equal(W.giveBackMic(a.stream, { owner, conversing: true }).keep, true);
  assert.equal(a.stream.track.stopped, 0, 'held, not stopped');
  assert.equal(W.warmHeld(owner), true);
  const b = await W.takeMic({ owner, trigger: 'auto', getUserMedia: gum });
  assert.equal(b.reused, true);
  assert.equal(b.stream, a.stream);
  assert.equal(opens, 1);
  // the conversation ends: the next end of turn lets it go
  assert.equal(W.giveBackMic(b.stream, { owner, conversing: false }).why, 'not-conversing');
  assert.equal(a.stream.track.stopped, 1);
  assert.equal(W.warmHeld(), false);
  W._resetWarmMic();
});

test('a mic Nova opened by itself is never held', async () => {
  W._resetWarmMic();
  const owner = {};
  const a = await W.takeMic({ owner, trigger: 'auto', getUserMedia: async () => fakeStream() });
  assert.equal(W.giveBackMic(a.stream, { owner, conversing: true }).why, 'not-his');
  assert.equal(a.stream.track.stopped, 1);
  W._resetWarmMic();
});

test('an AirPods mic is held between turns in a conversation (9 Nov 2026), and released when it ends', async () => {
  W._resetWarmMic();
  const owner = {};
  const a = await W.takeMic({ owner, trigger: 'tap', getUserMedia: async () => fakeStream('AirPods Pro') });
  assert.equal(W.giveBackMic(a.stream, { owner, conversing: true }).why, 'bluetooth-held');
  assert.equal(a.stream.track.stopped, 0, 'the hands-free route stays up for the next turn');
  const b = await W.takeMic({ owner, trigger: 'auto', getUserMedia: async () => { throw new Error('a second getUserMedia would pay the route switch again'); } });
  assert.equal(b.reused, true);
  assert.equal(W.giveBackMic(b.stream, { owner, conversing: false }).why, 'not-conversing');
  assert.equal(a.stream.track.stopped, 1);
  W._resetWarmMic();
});

test('drop, a dead stream, and another surface: never two microphones', async () => {
  W._resetWarmMic();
  const one = {};
  const two = {};
  const a = await W.takeMic({ owner: one, trigger: 'tap', getUserMedia: async () => fakeStream() });
  W.giveBackMic(a.stream, { owner: one, conversing: true });
  // another surface opening takes its own, and the held one is let go
  const b = await W.takeMic({ owner: two, trigger: 'tap', getUserMedia: async () => fakeStream() });
  assert.equal(b.reused, false);
  assert.equal(a.stream.track.stopped, 1);
  W.giveBackMic(b.stream, { owner: two, conversing: true });
  // a track the phone ended is not reused
  b.stream.track.readyState = 'ended';
  const c = await W.takeMic({ owner: two, trigger: 'auto', getUserMedia: async () => fakeStream() });
  assert.equal(c.reused, false);
  W.giveBackMic(c.stream, { owner: two, conversing: true });
  assert.equal(W.dropWarm('left', one), false, 'only the owner drops it');
  assert.equal(W.dropWarm('left', two), true);
  assert.equal(W.lastWarmDrop(), 'left');
  assert.equal(c.stream.track.stopped, 1);
  W._resetWarmMic();
});

test('the hook, the recorder and the surfaces are wired to it', () => {
  const hook = read('src/useDictation.js');
  assert.match(hook, /giveBackMic\(stream, \{ owner: ownerRef\.current, conversing: keepMicNow\(\) \}\)/);
  assert.match(hook, /dropWarm\('conversation-ended', ownerRef\.current\)/);
  assert.match(hook, /dropWarm\('left', ownerRef\.current\)/);
  assert.match(read('src/recorder.js'), /takeMic\(\{ owner: warm\.owner, trigger: warm\.trigger \}\)/);
  for (const f of ['src/screens/Voice.jsx', 'src/screens/NovaThread.jsx', 'src/VoicePresence.jsx']) assert.match(read(f), /keepMic: \(\) => /, f);
  assert.match(read('src/warmMic.js'), /export const WARM_IDLE_MS = 60_000;/);
});

test('the receipt says whether the stream was reused, which mic, and why it was kept or not', () => {
  const f = listenFields({ micReused: true, micRoute: 'builtin', micKept: 'conversation' });
  assert.deepEqual({ a: f.micReused, b: f.micRoute, c: f.micKept }, { a: true, b: 'builtin', c: 'conversation' });
  const bad = listenFields({ micReused: 'yes', micRoute: 'usb', micKept: 'because' });
  for (const k of ['micReused', 'micRoute', 'micKept']) assert.equal(k in bad, false, k);
});

// 1 Nov 2026, his "it is not hearing me" all day: after a long Coach answer
// the conversation's mic came back MUTED (readyState 'live', 5 bytes), the
// hold kept it, and every later turn, his taps included, recorded on it.
function mutedStream(label = 'iPhone Microphone') {
  const s = fakeStream(label);
  s.track.muted = true;
  return s;
}

test('a muted microphone is never held', () => {
  const ok = { enabled: true, conversing: true, userOpened: true, hidden: false, route: 'builtin', live: true };
  assert.deepEqual(W.warmDecision({ ...ok, muted: true }), { keep: false, why: 'muted' });
  assert.equal(listenFields({ micKept: 'muted', micReopened: true }).micKept, 'muted');
  assert.equal(listenFields({ micReopened: true }).micReopened, true);
});

test('the replay of 1 Nov: a muted first mic is reopened, never kept, never reused', async () => {
  W._resetWarmMic();
  const owner = {};
  const opened = [];
  // first getUserMedia hands back a muted track that never comes back; the reopen is fine
  const gum = async () => { const s = opened.length === 0 ? mutedStream() : fakeStream(); opened.push(s); return s; };
  const t0 = Date.now();
  const a = await W.takeMic({ owner, trigger: 'conv-start', getUserMedia: gum });
  assert.ok(Date.now() - t0 >= W.UNMUTE_WAIT_MS - 50, 'gave the muted track a moment first');
  assert.equal(opened.length, 2, 'reopened once');
  assert.equal(opened[0].track.stopped, 1, 'the muted one was let go');
  assert.equal(a.stream, opened[1]);
  assert.equal(a.reopened, true);
  W._resetWarmMic();
});

test('a held stream that goes muted is not reused: his tap gets a fresh mic', async () => {
  W._resetWarmMic();
  const owner = {};
  let opens = 0;
  const gum = async () => { opens += 1; return fakeStream(); };
  const a = await W.takeMic({ owner, trigger: 'tap', getUserMedia: gum });
  assert.equal(W.giveBackMic(a.stream, { owner, conversing: true }).keep, true);
  a.stream.track.muted = true;   // iOS mutes it while held, no event delivered
  const b = await W.takeMic({ owner, trigger: 'tap', getUserMedia: gum });
  assert.equal(b.reused, false);
  assert.notEqual(b.stream, a.stream);
  assert.equal(a.stream.track.stopped, 1);
  assert.equal(opens, 2);
  // and a stream muted at the end of a turn is let go, not held
  b.stream.track.muted = true;
  assert.equal(W.giveBackMic(b.stream, { owner, conversing: true }).why, 'muted');
  assert.equal(b.stream.track.stopped, 1);
  W._resetWarmMic();
});

test('a muted fresh track that comes back within the wait is used as is', async () => {
  W._resetWarmMic();
  let opens = 0;
  const gum = async () => {
    opens += 1;
    const s = mutedStream();
    setTimeout(() => { s.track.muted = false; s.track.listeners.unmute?.(); }, 50);
    return s;
  };
  const a = await W.takeMic({ owner: {}, trigger: 'tap', getUserMedia: gum });
  assert.equal(opens, 1);
  assert.equal(a.reopened, undefined);
  W._resetWarmMic();
});

test('an empty capture is said plainly and drops the held mic', () => {
  const src = read('src/useDictation.js');
  assert.match(src, /cause === 'empty-capture'\) \{\s*\n\s*dropWarm\('empty'/);
  assert.match(src, /muted microphone, so nothing was recorded/);
});

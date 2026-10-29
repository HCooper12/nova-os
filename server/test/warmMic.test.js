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
  // an unrecognised mic may be a headset: never held
  assert.deepEqual(W.warmDecision({ ...ok, route: 'unknown' }), { keep: false, why: 'unknown-route' });
  assert.equal(W.warmDecision({ ...ok, conversing: false }).why, 'not-conversing');
  assert.equal(W.warmDecision({ ...ok, userOpened: false }).why, 'not-his');
  assert.equal(W.warmDecision({ ...ok, hidden: true }).why, 'hidden');
  assert.equal(W.warmDecision({ ...ok, route: 'bluetooth' }).why, 'bluetooth');
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

test('an AirPods mic is released every turn, as before', async () => {
  W._resetWarmMic();
  const owner = {};
  const a = await W.takeMic({ owner, trigger: 'tap', getUserMedia: async () => fakeStream('AirPods Pro') });
  assert.equal(W.giveBackMic(a.stream, { owner, conversing: true }).why, 'bluetooth');
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

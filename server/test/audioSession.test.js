// THE RING SWITCH. 18 Sep 2026, his report: "I can only hear nova if my phone
// isn't on silent (volume being up doesn't work) or if I have my earphones
// in."
//
// The 2 Sep gym fix asked iOS for a MIXING session type ('transient') so a tap
// stopped killing his music. On iOS the mixable categories are the ambient
// family, and the ambient family is exactly what the hardware ring switch
// silences — volume buttons cannot override it. Only 'playback' survives the
// switch, and 'playback' does not mix.
//
// Pinned here: the two types stay what they are, the DEFAULT is the audible
// one, his choice survives a reload, and the microphone still wins while it is
// open. The last one matters most — restoring the wrong type after dictation
// would take his voice away again without touching anything named for it.
import test from 'node:test';
import assert from 'node:assert/strict';

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

// a browser, as far as this module needs one
function stubDom(stored) {
  const store = new Map(stored ? Object.entries(stored) : []);
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const session = { type: 'auto' };
  // node ships a real globalThis.navigator and it is getter-only, so a plain
  // assignment throws — this is the only way to stand a fake one up
  setNavigator({ audioSession: session });
  global.document = { documentElement: { dataset: {} } };
  return { session, store };
}

async function freshModule() {
  // the module reads localStorage at load, so each case needs its own copy
  return import(`../../src/audioSession.js?t=${Math.random()}`);
}

test('the two types are the two iOS actually distinguishes', async () => {
  stubDom();
  const m = await freshModule();
  // 'playback' is the only category that plays through the ring switch;
  // 'transient' is the mixable one that the switch silences. If either of
  // these strings drifts, the setting stops meaning what its label says.
  assert.equal(m.SPEAK, 'playback');
  assert.equal(m.DUCK, 'transient');
});

test('the DEFAULT is the one he can hear', async () => {
  const { session } = stubDom();            // nothing stored — a fresh phone
  const m = await freshModule();
  assert.equal(m.ducksOtherAudio(), false);
  m.claimForSpeech();
  assert.equal(session.type, 'playback',
    'a fresh install asks for a session the ring switch can silence');
});

test('his choice survives a reload', async () => {
  const { session } = stubDom({ 'novaos.audioDucks': '1' });
  const m = await freshModule();
  assert.equal(m.ducksOtherAudio(), true);
  m.claimForSpeech();
  assert.equal(session.type, 'transient');
});

test('flipping the setting takes effect now, not on the next reload', async () => {
  const { session, store } = stubDom();
  const m = await freshModule();
  m.claimForSpeech();
  assert.equal(session.type, 'playback');
  m.setDuckingPreference(true);
  assert.equal(session.type, 'transient', 'the switch he just flipped did not apply');
  assert.equal(store.get('novaos.audioDucks'), '1');
  m.setDuckingPreference(false);
  assert.equal(session.type, 'playback');
  assert.equal(store.get('novaos.audioDucks'), '0');
});

test('THE MICROPHONE WINS while it is open, and gives the type back after', async () => {
  const { session } = stubDom();
  const m = await freshModule();
  m.claimForSpeech();
  assert.equal(session.type, 'playback');
  m.micStarted();
  assert.equal(session.type, 'auto', 'dictation is not getting a recording session');
  // a prime landing mid-turn must not steal the session from the microphone
  m.claimForSpeech();
  assert.equal(session.type, 'auto', 'speech claimed the session while the mic was open');
  m.micStopped();
  assert.equal(session.type, 'playback', 'the chosen type was not restored after the mic let go');
});

test('nested mic holds stay balanced — the wake word AND dictation', async () => {
  const { session } = stubDom();
  const m = await freshModule();
  m.micStarted();          // the wake word
  m.micStarted();          // dictation, on top of it
  m.micStopped();
  assert.equal(session.type, 'auto', 'the wake word still holds the mic and lost the session');
  m.micStopped();
  assert.equal(session.type, 'playback');
  // and a stray extra release must not drive the counter negative
  m.micStopped();
  m.micStarted();
  assert.equal(session.type, 'auto');
});

test('a browser with no audioSession API is left alone, never thrown at', async () => {
  stubDom();
  setNavigator({});                        // Chrome, Firefox, an old Safari
  const m = await freshModule();
  m.claimForSpeech();
  m.micStarted();
  m.micStopped();
  m.setDuckingPreference(true);
  assert.equal(global.document.documentElement.dataset.novaAudio, 'unsupported');
});

test('a setting changed mid-turn waits for the microphone', async () => {
  const { session } = stubDom();
  const m = await freshModule();
  m.micStarted();
  m.setDuckingPreference(true);
  assert.equal(session.type, 'auto', 'a Settings tap stole the session from an open microphone');
  m.micStopped();
  assert.equal(session.type, 'transient', 'the new choice was not honoured once the mic let go');
});

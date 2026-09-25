// NOVA'S SOUND EFFECTS (src/sfx.js). What is pinned: they are ON unless he
// turned them off, they stay SILENT rather than fight Nova's voice or the
// microphone, every sound lands on the audio clock at the moment the picture
// shows it (harmony), and a tap mid-spin drops the ticks still ahead.
import test from 'node:test';
import assert from 'node:assert/strict';

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function fakeAudio() {
  const made = [];
  const param = () => ({ value: 0, events: [], setValueAtTime(v, t) { this.events.push(['set', v, t]); }, exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); } });
  const node = (kind) => {
    const n = { kind, started: null, stopped: null, connect(x) { return x; }, disconnect() {}, start(t) { this.started = t; }, stop(t) { this.stopped = t; } };
    made.push(n);
    return n;
  };
  class FakeAC {
    constructor() { this.currentTime = 10; this.sampleRate = 48000; this.state = 'suspended'; this.destination = {}; FakeAC.instances.push(this); }
    createGain() { const n = node('gain'); n.gain = param(); return n; }
    createBufferSource() { return node('noise'); }
    createBiquadFilter() { const n = node('filter'); n.frequency = param(); n.Q = param(); return n; }
    createOscillator() { const n = node('osc'); n.frequency = param(); return n; }
    createBuffer(ch, len, rate) { const d = new Float32Array(len); return { sampleRate: rate, getChannelData: () => d }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  FakeAC.instances = [];
  return { FakeAC, made };
}

function stubBrowser({ sfx, audio = true } = {}) {
  const store = new Map(sfx == null ? [] : [['novaos.sfx', sfx]]);
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const session = { type: 'auto' };
  setGlobal('navigator', { audioSession: session });
  global.document = { documentElement: { dataset: {} } };
  const fa = fakeAudio();
  global.window = audio ? { AudioContext: fa.FakeAC } : {};
  return { session, store, ...fa };
}

async function fresh() {
  const as = await import('../../src/audioSession.js');
  as._resetAudioSession();
  const m = await import('../../src/sfx.js');
  m._resetSfx();
  return { sfx: m, as };
}

test('effects are on unless he switched them off', async () => {
  stubBrowser();
  const { sfx } = await fresh();
  assert.equal(sfx.sfxEnabled(), true, 'his call, 25 Sep: on by default');
  sfx.setSfxEnabled(false);
  assert.equal(sfx.sfxEnabled(), false);
  assert.equal(sfx.primeSfx(), false, 'switched off means silent');
});

test('the tap asks iOS for the AMBIENT session — alongside his music, never pausing it', async () => {
  const { session } = stubBrowser();
  const { sfx, as } = await fresh();
  as.claimForSpeech();
  assert.equal(session.type, 'playback', 'Nova spoke earlier: the session is his speech choice');
  assert.equal(sfx.primeSfx(), true);
  assert.equal(session.type, 'ambient', 'a tick under playback would have stopped his podcast');
  as.claimForSpeech();
  assert.equal(session.type, 'playback', 'the next thing Nova says gets his chosen type back');
});

test('Nova mid-sentence, or the microphone open, keeps the reel silent', async () => {
  const { session } = stubBrowser();
  const { sfx, as } = await fresh();
  assert.equal(sfx.primeSfx({ busy: true }), false, 'never talk over Nova');
  as.micStarted();
  assert.equal(sfx.primeSfx(), false, 'never fight a recording for the session');
  assert.equal(session.type, 'auto', 'and the recording session was left alone');
  as.micStopped();
});

test('no Web Audio at all is silent, never broken', async () => {
  stubBrowser({ audio: false });
  const { sfx } = await fresh();
  assert.equal(sfx.primeSfx(), false);
  const r = sfx.reelSound({ ticks: [10, 40], landAt: 300 });
  assert.equal(r.audible, false);
  r.hurry(50); r.stop(); // no throw
});

test('primed once, heard once: a remount without a tap stays silent', async () => {
  stubBrowser();
  const { sfx } = await fresh();
  assert.equal(sfx.primeSfx(), true);
  assert.equal(sfx.reelSound({ ticks: [10], landAt: 100 }).audible, true);
  assert.equal(sfx.reelSound({ ticks: [10], landAt: 100 }).audible, false, 'the arm is spent');
});

test('every tick is on the audio clock at its moment, and the chime at the catch', async () => {
  const { made } = stubBrowser();
  const { sfx } = await fresh();
  sfx.primeSfx();
  sfx.reelSound({ ticks: [28, 87, 150], landAt: 900, lead: 30, chime: 'technique' });
  const t0 = 10.03;
  const noise = made.filter((n) => n.kind === 'noise').map((n) => +n.started.toFixed(4));
  assert.deepEqual(noise, [t0 + 0.028, t0 + 0.087, t0 + 0.15].map((x) => +x.toFixed(4)), 'one click per row, exactly when it crosses');
  const bells = made.filter((n) => n.kind === 'osc' && n.frequency.value >= 880 && n.started >= t0 + 0.9 - 1e-9);
  assert.equal(bells.length, 6, 'two notes, three partials each');
  assert.ok(Math.abs(Math.min(...bells.map((n) => n.started)) - (t0 + 0.9)) < 1e-9, 'the chime starts on the catch');
});

test('a tap mid-spin drops the ticks still ahead and moves the chime to the new landing', async () => {
  const { made, FakeAC } = stubBrowser();
  const { sfx } = await fresh();
  sfx.primeSfx();
  const r = sfx.reelSound({ ticks: [20, 60, 400, 800], landAt: 1200 });
  const ac = FakeAC.instances[0];
  ac.currentTime = 10.1;                       // 100ms in
  r.hurry(150);
  const noise = made.filter((n) => n.kind === 'noise');
  assert.ok(Math.abs(noise[0].stopped - 10.06) < 1e-9, 'a tick already played rings out as scheduled (10.02 + 40ms)');
  assert.equal(noise[2].stopped, 10.1, 'a tick still ahead is dropped');
  assert.equal(noise[3].stopped, 10.1);
  // two notes 75ms apart, three partials each, now starting at 10.1 + 150ms
  const at = (t) => made.filter((n) => n.kind === 'osc' && Math.abs(n.started - t) < 1e-9).length;
  assert.equal(at(10.25), 3, 'the chime moved to the new landing');
  assert.equal(at(10.325), 3, 'its second note follows it');
  const old = made.filter((n) => n.kind === 'osc' && Math.abs(n.started - 11.2) < 1e-9);
  assert.ok(old.length && old.every((n) => n.stopped === 10.1), 'the chime at the old landing never plays');
});

test('the review chime is the smaller sound', async () => {
  const { sfx } = await fresh();
  assert.ok(sfx.CHIMES.review.peak < sfx.CHIMES.technique.peak);
  assert.equal(sfx.CHIMES.review.notes.length, 1);
});

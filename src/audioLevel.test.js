// warmAudioGraph: the graph is built while the app is idle, once, on a desktop
// browser only, and never claims the audio session by itself (the
// listening-start pause, 11 Nov 2026).
//
//   node --test src/audioLevel.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

let made = 0; let resumed = 0;
class FakeContext {
  constructor() { made += 1; this.state = 'suspended'; }
  createAnalyser() { return { fftSize: 0 }; }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  resume() { resumed += 1; return Promise.resolve(); }
}
globalThis.window = { AudioContext: FakeContext };
const as = (userAgent, maxTouchPoints = 0) => Object.defineProperty(globalThis, 'navigator', { value: { userAgent, maxTouchPoints }, configurable: true });
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141 Safari/537.36';
globalThis.requestAnimationFrame = () => 1;
const { warmAudioGraph, attachMicStream } = await import('./audioLevel.js');

test('an iPhone, and an iPad calling itself a Mac, are never warmed', () => {
  as('Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15');
  warmAudioGraph();
  as(MAC, 5);
  warmAudioGraph();
  assert.equal(made, 0, 'touching audio on iOS can pause his music');
});

test('warming builds the graph once and does not resume it', () => {
  as(MAC);
  warmAudioGraph();
  warmAudioGraph();
  assert.equal(made, 1);
  assert.equal(resumed, 0, 'only the tap may claim the audio session');
});

test('the mic stream that follows reuses the warmed graph', () => {
  const detach = attachMicStream({});
  assert.equal(made, 1, 'no second context is opened mid-listen');
  assert.equal(resumed, 1);
  detach();
});

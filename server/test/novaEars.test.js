// NOVA'S OWN EARS, the pure parts: which ears a device listens with, the
// loudness meter that stands in for the speech engine's "he is still talking",
// and the receipt that says which ears heard a turn.
//
// The receipts are why this exists: on his iPhone the browser's speech engine
// heard 1 turn in 21. The two rules pinned here: a meter that hears nothing at
// all is BLIND (it must never end his turn), and a choice that cannot work on
// this device falls to one that can instead of leaving a dead mic button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openVad, vadStep, vadBlind, vadThreshold, frameRms, VAD } from '../../src/vad.js';
import { resolveHearing } from '../../src/hearingEngine.js';
import { pickRecordingType } from '../../src/recorder.js';
import { turnRecord } from '../lib/voiceTurns.js';

const run = (levels, s = openVad()) => levels.reduce((st, r) => vadStep(st, r), s);

test('a quiet room is not speech; a voice standing clear of it is, after two samples', () => {
  const room = run(Array(10).fill(0.003));
  assert.equal(room.speaking, false);
  assert.equal(room.heardAny, false);
  const one = vadStep(room, 0.08);
  assert.equal(one.speaking, false, 'one loud sample is a cough, not a sentence');
  const two = vadStep(one, 0.07);
  assert.equal(two.speaking, true);
  assert.equal(two.heardAny, true);
  assert.equal(vadStep(two, 0.003).speaking, false, 'the moment he stops, speaking drops');
});

test('a loud room raises the bar: engine noise alone never reads as him', () => {
  const car = run(Array(20).fill(0.03));
  assert.ok(vadThreshold(car.floor) > 0.03);
  assert.equal(run([0.035, 0.034, 0.036], car).speaking, false);
  assert.equal(run([0.12, 0.11], car).speaking, true);
});

test('the floor does not climb onto his voice while he talks', () => {
  const talking = run([0.003, 0.003, ...Array(30).fill(0.09)]);
  assert.ok(talking.floor < 0.01, `floor ${talking.floor} crept up during speech`);
  assert.equal(talking.speaking, true);
});

test('exact zero, sample after sample, is a blind meter, never silence', () => {
  const dead = run(Array(VAD.blindAfter).fill(0));
  assert.equal(vadBlind(dead), true);
  assert.equal(vadBlind(run(Array(VAD.blindAfter - 1).fill(0))), false);
  assert.equal(vadBlind(run([...Array(10).fill(0), 0.002])), false, 'one real sample proves the mic is live');
  assert.equal(vadBlind(run([NaN, undefined, -1, ...Array(VAD.blindAfter - 3).fill(0)])), true, 'junk readings count as nothing');
});

test('frame RMS is the root mean square, and an empty frame is zero', () => {
  assert.equal(frameRms(new Float32Array([0.5, -0.5, 0.5, -0.5])), 0.5);
  assert.equal(frameRms(new Float32Array(0)), 0);
  assert.equal(frameRms(null), 0);
});

test("the iPhone listens with Nova's ears by default, everything else with the browser's", () => {
  const phone = { ios: true, speech: true, recorder: true, connected: true };
  const mac = { ios: false, speech: true, recorder: true, connected: true };
  assert.equal(resolveHearing({ ...phone, choice: 'auto' }), 'nova');
  assert.equal(resolveHearing({ ...mac, choice: 'auto' }), 'browser');
  assert.equal(resolveHearing({ ...phone, choice: 'browser' }), 'browser', 'his explicit choice wins');
  assert.equal(resolveHearing({ ...mac, choice: 'nova' }), 'nova');
});

test('a choice that cannot work here falls to one that can, and no ears at all is null', () => {
  assert.equal(resolveHearing({ choice: 'nova', ios: true, speech: true, recorder: true, connected: false }), 'browser', 'no Mac to transcribe: the engine is all there is');
  assert.equal(resolveHearing({ choice: 'auto', ios: true, speech: true, recorder: false, connected: true }), 'browser');
  assert.equal(resolveHearing({ choice: 'browser', speech: false, recorder: true, connected: true }), 'nova');
  assert.equal(resolveHearing({ choice: 'auto', speech: false, recorder: false, connected: true }), null);
  assert.equal(resolveHearing(), null);
});

test('the recorder picks Opus where it exists and AAC on Safari', () => {
  assert.equal(pickRecordingType((t) => t.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(pickRecordingType((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickRecordingType(() => false), '');
  assert.equal(pickRecordingType(() => { throw new Error('old Safari'); }), '');
});

test("a turn heard by Nova's ears says so on its receipt; a browser turn is unchanged", () => {
  const nova = turnRecord({ reason: 'hold', ms: 5200, heard: true, engine: 'nova', vad: 'heard', bytes: 48211.6, txMs: 612 }, 'iPhone');
  assert.equal(nova.engine, 'nova');
  assert.equal(nova.vad, 'heard');
  assert.equal(nova.bytes, 48212);
  assert.equal(nova.txMs, 612);
  const junk = turnRecord({ reason: 'hold', engine: 'nova', vad: 'banana', bytes: -4 });
  assert.equal(junk.vad, 'unknown');
  assert.equal(junk.bytes, 0);
  const browser = turnRecord({ reason: 'lead', heard: false, engine: 'whatever', vad: 'heard' });
  assert.equal('engine' in browser, false);
  assert.equal('vad' in browser, false);
});

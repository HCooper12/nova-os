// THE MIC CHECK'S VERDICT — the sentence he acts on, so it is pinned here.
//
// The receipts proved WHAT is broken (iPhone: 10 turns, heard on 0; Mac: 6
// turns, heard on 6) and could not say WHY. This verdict is what turns the
// next fifteen seconds on his phone into a cause. Two rules it must never
// break: it never names a cause the evidence does not reach, and it never
// tells him his phone is fine when the transcript never arrived.
import test from 'node:test';
import assert from 'node:assert/strict';
import { micVerdict, LEVEL_FLOOR } from '../../src/micCheck.js';

// a run where everything worked, which individual tests then break one field of
const ok = (over = {}) => ({
  srSupported: true, permission: 'granted', peakLevel: 0.31,
  continuousResults: 7, singleResults: 4, ...over,
});

test('no engine is reported as no engine, and nothing else', () => {
  const v = micVerdict(ok({ srSupported: false }));
  assert.match(v.cause, /no speech recognition/i);
  assert.equal(v.settled, true);
});

test('a blocked microphone names the setting that unblocks it', () => {
  const v = micVerdict(ok({ permission: 'denied' }));
  assert.match(v.cause, /blocked/i);
  assert.match(v.fix, /allow/i);
  assert.equal(v.settled, true);
});

test('permission granted but silence is NOT reported as "you were quiet"', () => {
  // The exact lie this whole build exists to stop. A mic that is allowed and
  // delivering nothing is a fault, and must read as one.
  const v = micVerdict(ok({ peakLevel: 0 }));
  assert.match(v.cause, /silence|no sound/i);
  assert.doesNotMatch(v.cause, /not speaking|weren.t speaking|say something/i);
  assert.equal(v.settled, true);
});

test('the level floor is a floor, not a loudness bar', () => {
  // just under, and just over — a whisper must not read as a dead microphone
  assert.match(micVerdict(ok({ peakLevel: LEVEL_FLOOR - 0.001 })).cause, /silence|no sound/i);
  assert.doesNotMatch(micVerdict(ok({ peakLevel: LEVEL_FLOOR + 0.001 })).cause, /silence/i);
});

test('THE DECISIVE ONE: continuous dead, single-shot alive, names Nova as the fault', () => {
  // src/turnEnd.js runs every conversational surface with continuous: true,
  // and the memory that records that decision flags iOS as never observed.
  // If this is what comes back, the cause is Nova's flag and not his phone.
  const v = micVerdict(ok({ continuousResults: 0, singleResults: 5 }));
  assert.match(v.cause, /continuous/i);
  assert.match(v.fix, /fault in Nova/i);
  assert.equal(v.settled, true);
});

test('both modes dead points at the OS dictation switch, not at him', () => {
  const v = micVerdict(ok({ continuousResults: 0, singleResults: 0 }));
  assert.match(v.cause, /hears you/i);
  assert.match(v.cause, /no transcription/i);
  assert.equal(v.settled, true);
});

test('both modes alive refuses to blame the phone', () => {
  const v = micVerdict(ok());
  assert.match(v.cause, /works/i);
  // it works, so the fault is upstream — and the verdict must not pretend
  // that is a finished answer
  assert.equal(v.settled, false);
});

test('an unfinished run concludes nothing', () => {
  for (const over of [{ continuousResults: null }, { singleResults: null }]) {
    const v = micVerdict(ok(over));
    assert.match(v.cause, /did not finish|nothing to conclude/i);
    assert.equal(v.settled, false);
  }
});

test('every verdict gives him something to DO', () => {
  const runs = [
    ok(), ok({ srSupported: false }), ok({ permission: 'denied' }),
    ok({ permission: 'NotFoundError' }), ok({ peakLevel: 0 }),
    ok({ continuousResults: 0, singleResults: 5 }),
    ok({ continuousResults: 0, singleResults: 0 }),
    ok({ continuousResults: 5, singleResults: 0 }),
    ok({ continuousResults: null }),
  ];
  for (const r of runs) {
    const v = micVerdict(r);
    assert.ok(v.cause && v.cause.length > 20, `thin cause: ${JSON.stringify(v)}`);
    assert.ok(v.fix && v.fix.length > 20, `no action to take: ${JSON.stringify(v)}`);
    assert.equal(typeof v.settled, 'boolean');
  }
});

// ---- the wiring, which is the part that rots silently ----

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const read = (...p) => readFile(path.join(SRC, ...p), 'utf8');

test('the engine hearing nothing is recorded separately from the transcript being empty', async () => {
  const app = await read('App.jsx');
  const voice = await read('screens', 'Voice.jsx');
  assert.match(app, /noteTurnHeard\(heard\)\s*\{/, 'App no longer records whether the engine delivered anything');
  assert.match(voice, /noteTurnHeard\?\.\(info\.heard\)/,
    'the Voice screen no longer tells App whether this turn was heard');
});

test('two turns with NO result event never tell him he was not ready', async () => {
  const app = await read('App.jsx');
  // the paused-conversation branch, as it actually stands
  const m = app.match(/this\.toastMsg\(\(this\.deafTurns[\s\S]{0,400}?\);/);
  assert.ok(m, 'the deaf-turn branch is gone from notifyEmptyListen');
  const branch = m[0];
  const deafLine = branch.split('?')[1].split(':')[0];
  assert.match(deafLine, /microphone/i, 'the deaf message no longer names the microphone');
  assert.doesNotMatch(deafLine, /when you.{0,3}re ready|weren.{0,3}t speaking|not speaking/i,
    'Nova is describing his behaviour again on turns where it received nothing');
  // and it must point at the one thing that can tell the two apart
  assert.match(deafLine, /hear you|mic check/i, 'the deaf message does not hand him the check');
});

test('the mic check is reachable from Settings and runs off the view model', async () => {
  const settings = await read('screens', 'Settings.jsx');
  const vals = await read('vals', 'valsMisc.js');
  assert.match(settings, /Can Nova hear you\?/, 'the mic check has no surface');
  assert.match(settings, /v\.runMicCheck/, 'the Mic check button is not wired');
  assert.match(vals, /runMicCheck: \(\) => app\.runMicCheck\(\)/, 'valsMisc no longer exposes runMicCheck');
});

test('the level meter is released before any recogniser opens', async () => {
  // A parallel getUserMedia capture is the thing most likely to starve
  // SpeechRecognition on iOS — useDictation refuses to run its meter there
  // for exactly this reason. If the check held the stream through stages 4
  // and 5 it would be measuring its own interference.
  const mc = await read('micCheck.js');
  const stopAt = mc.indexOf('getTracks().forEach((t) => t.stop())');
  const firstListen = mc.indexOf('await listenOnce(');
  assert.ok(stopAt > 0, 'the check never stops the stream it opened');
  assert.ok(firstListen > stopAt, 'a recogniser opens while the level meter still holds the microphone');
});

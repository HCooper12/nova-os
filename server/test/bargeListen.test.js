// THE EAR WHILE NOVA SPEAKS, ON HIS IPHONE (1 Nov 2026). Talking over Nova
// has never fired on his phone (no 'barge' turn from an iPhone in
// server/data/voice/turns.json): the listener ran on the browser engine,
// which hears nothing there. src/bargeListen.js schedules Nova's own ears
// instead; src/useDictation.js runs it. These pin the schedule (one read per
// burst, never blind, never often) and the wiring (only on Nova's ears, in a
// conversation, while Nova speaks and no turn is live; a barge goes to App).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-bargelisten-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  openBurst, stepBurst, burstDue, rewindDue, carryHeard, keepCarry, skipReceiptDue, earWanted,
  BURST_MIN_MS, READ_GAP_MS, BURST_GAP_MS, BURST_LONG_MS, CLIP_MAX_MS, SKIP_RECEIPTS_MAX,
} from '../../src/bargeListen.js';
import { bargeInDecision } from '../../src/bargeIn.js';
import { talkOver } from '../../src/settingsModel.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// drive the burst state with a meter trace: true = a loud 100 ms sample
function run(trace, t0 = 0) {
  let s = openBurst();
  const out = [];
  trace.forEach((loud, i) => { s = stepBurst(s, { speaking: loud, now: t0 + i * 100 }); out.push(s); });
  return out;
}
// the reads a trace would take, through burstDue, as the hook does
function reads(trace, { blind = false } = {}) {
  let s = openBurst();
  let lastReadAt = null;
  const at = [];
  trace.forEach((loud, i) => {
    const now = i * 100;
    s = stepBurst(s, { speaking: loud, now });
    if (burstDue({ speakingMs: s.speechMs, lastReadAt, now, blind, ended: s.ended, readThisBurst: s.read })) {
      at.push(now);
      lastReadAt = now;
      s = { ...s, read: true };
    }
  });
  return at;
}
const loud = (n) => Array(n).fill(true);
const quiet = (n) => Array(n).fill(false);

test('the schedule\'s numbers', () => {
  assert.equal(BURST_MIN_MS, 400);
  assert.equal(READ_GAP_MS, 2500);
  assert.ok(BURST_GAP_MS >= 400 && BURST_GAP_MS <= 1000);
  assert.ok(BURST_LONG_MS > BURST_MIN_MS && BURST_LONG_MS <= 3000);
});

test('a burst of speech is read once, when it ends', () => {
  const r = reads([...loud(8), ...quiet(10)]);
  assert.equal(r.length, 1, `${r}`);
  assert.ok(r[0] >= 800 + BURST_GAP_MS - 100, 'after the pause that ends it');
});

test('under 400 ms of speech is never read: a cough, a door', () => {
  assert.deepEqual(reads([...loud(3), ...quiet(10), ...loud(2), ...quiet(10)]), []);
});

test('a long burst is read while it runs, and only once', () => {
  const r = reads([...loud(60), ...quiet(10)]);
  assert.equal(r.length, 1, `${r}`);
  assert.ok(r[0] < 6000, 'read while he is still talking over Nova');
});

test('reads are at least 2.5 s apart, whatever the bursts', () => {
  const trace = [];
  for (let i = 0; i < 8; i++) trace.push(...loud(5), ...quiet(7));   // a burst every 1.2 s
  const r = reads(trace);
  assert.ok(r.length >= 2);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] - r[i - 1] >= READ_GAP_MS, `${r}`);
});

test('a blind meter never reads, and a read in flight blocks the next', () => {
  assert.deepEqual(reads([...loud(8), ...quiet(10)], { blind: true }), []);
  assert.equal(burstDue({ speakingMs: 900, ended: true, now: 10_000, pending: true }), false);
  assert.equal(burstDue({ speakingMs: 900, ended: true, now: 10_000 }), true);
});

test('a burst ends on a pause, and the next sample starts clean', () => {
  const s = run([...loud(5), ...quiet(Math.ceil(BURST_GAP_MS / 100) + 1), true]);
  const endIdx = s.findIndex((x) => x.ended);
  assert.ok(endIdx > 0);
  assert.equal(s[endIdx].speechMs, 500);
  assert.equal(s[s.length - 1].speechMs, 100, 'a new burst');
  assert.equal(s[s.length - 1].read, false);
});

test('the clip starts again between bursts, never mid-burst or mid-read', () => {
  assert.equal(rewindDue({ clipAt: 0, now: CLIP_MAX_MS }), true);
  assert.equal(rewindDue({ clipAt: 0, now: CLIP_MAX_MS - 1 }), false);
  assert.equal(rewindDue({ clipAt: 0, now: CLIP_MAX_MS, inBurst: true }), false);
  assert.equal(rewindDue({ clipAt: 0, now: CLIP_MAX_MS, pending: true }), false);
  assert.equal(rewindDue({ clipAt: null, now: 99_999 }), false);
});

test('"No, you\'re mistaken" then "do it this way" across two bursts is one interruption', () => {
  const saying = 'I built the timer to start when you rack the bar, and it saves each weight.';
  const first = bargeInDecision('No, you are mistaken.', saying);
  assert.equal(first.barge, true, 'a correction phrase is an interruption on its own');
  // a single fresh word is carried, then joins the next read
  const kept = keepCarry({ heard: 'Mistaken.', saying, now: 1000 });
  assert.ok(kept);
  const heard = carryHeard({ carry: kept, text: 'Do it differently.', now: 3000 });
  assert.equal(heard, 'Mistaken. Do it differently.');
  assert.equal(bargeInDecision(heard, saying).barge, true);
  // stale carry is dropped; echo and Whisper's silence lines are never carried
  assert.equal(carryHeard({ carry: kept, text: 'x', now: 1000 + 60_000 }), 'x');
  assert.equal(keepCarry({ heard: 'saves each weight', saying }), null);
  assert.equal(keepCarry({ heard: 'Thank you.', saying: '' }), null);
});

test('"not him" receipts are capped per stretch of speech; barges are not', () => {
  assert.equal(skipReceiptDue(0), true);
  assert.equal(skipReceiptDue(SKIP_RECEIPTS_MAX - 1), true);
  assert.equal(skipReceiptDue(SKIP_RECEIPTS_MAX), false);
});

test('the ear runs only on Nova\'s ears, in his conversation, while Nova speaks and no microphone is live', () => {
  const ok = { on: true, speaking: true, engine: 'nova', turnLive: false, micBusy: false, conversing: true };
  assert.equal(earWanted(ok), true);
  assert.equal(earWanted({ ...ok, on: false }), false, 'Talk over off');
  assert.equal(earWanted({ ...ok, speaking: false }), false, 'Nova stopped: the ear stops');
  assert.equal(earWanted({ ...ok, engine: 'browser' }), false, 'the Mac\'s engine keeps this job in WakeWord.jsx');
  assert.equal(earWanted({ ...ok, engine: null }), false);
  assert.equal(earWanted({ ...ok, turnLive: true }), false, 'never beside a live turn');
  assert.equal(earWanted({ ...ok, micBusy: true }), false, 'never beside another surface\'s mic');
  assert.equal(earWanted({ ...ok, conversing: false }), false, 'never a fresh microphone each time Nova speaks');
});

// ---- the wiring, read from the source ----
const dict = read('src/useDictation.js');
const ear = dict.slice(dict.indexOf('function startEar()'), dict.indexOf('// Leaving the screen mid-turn'));

test('the hook decides with earWanted on its own state, and the effect stops the ear when it is no longer wanted', () => {
  assert.match(dict, /const earOn = earWanted\(\{\n\s*on: !!bargeListen\?\.on, speaking: !!bargeListen\?\.speaking, engine,\n\s*turnLive: on \|\| hearing, micBusy: !!bargeListen\?\.micBusy, conversing: keepMicNow\(\),\n\s*\}\);/);
  assert.match(dict, /useEffect\(\(\) => \{\n\s*if \(!earOn\) return undefined;\n\s*return startEar\(\);/, 'the effect cleanup is the stop');
});

test('the ear records on the warm owner\'s stream, not as him, and gives it back', () => {
  assert.match(ear, /trigger: 'barge-listen'/);
  assert.match(ear, /release: \(stream\) => \{ giveBackMic\(stream, \{ owner, conversing: keepMicNow\(\) \}\); \}/);
  assert.match(ear, /ear\.handle\?\.cancel\(\)/, 'stop cancels the handle, whose release gives the stream back');
  assert.ok(!/getUserMedia/.test(ear), 'never a second microphone of its own');
  assert.match(dict, /if \(earOwner && earOwner !== owner\) return undefined;/, 'one ear across surfaces');
  // a turn that opens stops the ear on the same tick (a tap on the core while Nova talks)
  assert.match(dict, /const startNova = \(trigger = 'tap'\) => \{\n\s*stopEar\(\);/);
  assert.match(dict, /const startTurn = \(trigger = 'tap'\) => \{\n\s*stopEar\(\);/);
  const warm = read('src/warmMic.js');
  assert.ok(!/'barge-listen'/.test(warm.match(/USER_TRIGGERS = new Set\(\[[^\]]*\]\)/)[0]), 'not a trigger that is him');
});

test('each read is one peek, transcribed as heard, judged by bargeInDecision; a barge stops the ear first and goes to App', () => {
  assert.match(ear, /handle\.peek\(\)/);
  assert.match(ear, /transcribeRecording\(blob, \{ vad: 'heard', timeoutMs: 6000 \}\)/);
  assert.match(ear, /const d = bargeInDecision\(heard, said\);/);
  const barge = ear.slice(ear.indexOf('if (d.barge) {'));
  assert.ok(barge.indexOf('stop();') < barge.indexOf('fire?.('), 'the mic is let go before the turn opens');
  assert.match(barge, /blRef\.current\?\.fire\?\.\(heard, d\.why, info\)/);
  assert.match(ear, /const info = \{ engine: 'nova', echo: echoScore\(heard, said\)/);
  assert.match(ear, /reportBargeSkip\(heard, d\.why, info\)/, 'a read that is not him leaves a receipt');
  assert.match(ear, /burstDue\(\{ speakingMs: b\.speechMs, lastReadAt: ear\.lastReadAt, now, blind: vadBlind\(vad\)/);
});

test('the three surfaces hand the hook App\'s barge-in model; App fires onBargeIn with the ear\'s facts', () => {
  for (const f of ['src/screens/NovaThread.jsx', 'src/screens/Voice.jsx', 'src/VoicePresence.jsx']) {
    assert.match(read(f), /bargeListen: v\.bargeIn,/, f);
  }
  const chrome = read('src/vals/valsChrome.js');
  assert.match(chrome, /sayingNow: \(\) => app\.bargeSayingNow\(\)/);
  assert.match(chrome, /fire: \(heard, why, info\) => app\.onBargeIn\(heard, why, info\)/);
  assert.match(chrome, /st\.bargeListening/, 'the wake word stands aside while the ear listens');
  const app = read('src/App.jsx');
  assert.match(app, /onBargeIn\(heard, why, info = null\) \{\n\s*if \(!this\.state\.bargeInOn\) return;/);
  assert.match(app, /reportBargeIn\(heard, why, info\)/);
  // reportBargeIn carries the facts; skips have their own reason
  assert.match(dict, /export function reportBargeIn\(heard, why, extra = null\) \{\n\s*postBargeRow\('barge-in'/);
  assert.match(dict, /export function reportBargeSkip\(heard, why, extra = null\) \{\n\s*postBargeRow\('barge-skip'/);
});

test('the recorder can start the clip again on the same microphone', () => {
  const rec = read('src/recorder.js');
  assert.match(rec, /rewind\(\) \{/);
  const rw = rec.slice(rec.indexOf('rewind() {'), rec.indexOf('cancel() {'));
  assert.match(rw, /chunks\.length = 0;/);
  assert.match(rw, /rec = makeRec\(\);/);
  assert.ok(!/getTracks|release\(\)/.test(rw), 'the stream is never let go by a rewind');
});

test('Settings: on Nova\'s own ears Talk over needs neither the wake word nor the browser engine', () => {
  const own = talkOver({ supported: false, wakeOn: false, bargeOn: true, ownEars: true });
  assert.deepEqual([own.checked, own.disabled], [true, false]);
  assert.ok(!/Hey Nova/.test(own.sub), own.sub);
  assert.match(read('src/vals/valsSettings.js'), /ownEars: v\.hearingNow === 'nova'/);
  // elsewhere, unchanged: the wake word holds the microphone
  assert.equal(talkOver({ supported: true, wakeOn: false, bargeOn: true }).disabled, true);
});

// THE LISTENING FIXES (18 Oct 2026). The audit of 48 iPhone turns on Nova's
// own ears found no words lost in transcription and many lost before it: a
// tap on a silent mic sent silence, the lead clock ran before the mic had
// opened, near-empty clips went to Groq and came back as a 502, a blind meter
// posted junk after 90 s, and an auto-opened mic was opened twice. These pin
// the rules (src/listenRules.js), the receipt that records them
// (server/lib/voiceTurns.js), and the server's empty-capture short-circuit.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-listen-'));
process.env.NOVA_DATA_DIR = dataDir;
// no transcription key, ever: a clip that is not short-circuited must fail
// here in words, never reach Groq on his real key
process.env.NOVA_WHISPER_ENV = path.join(dataDir, 'no-such.env');

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

const R = await import('../../src/listenRules.js');
const { turnRecord, listenFields, listeningTable, END_REASONS } = await import('../lib/voiceTurns.js');
const { openTurn, sawSpeech, endReason } = await import('../../src/turnEnd.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('a tap on a silent mic keeps listening; a second within 2 s ends it', () => {
  assert.equal(R.tapOnOpenMic({ held: true, now: 1000, lastTapAt: null }), 'keep');
  assert.equal(R.tapOnOpenMic({ held: true, now: 2500, lastTapAt: 1000 }), 'end', 'his way out');
  assert.equal(R.tapOnOpenMic({ held: true, now: 3100, lastTapAt: 1000 }), 'keep', 'a tap after the window is a new first tap');
  assert.equal(R.tapOnOpenMic({ held: true, heard: true, now: 1000 }), 'end', 'he spoke: the tap is send now');
  assert.equal(R.tapOnOpenMic({ held: true, blind: true, now: 1000 }), 'end', 'a deaf meter: the tap is the only way to send');
  assert.equal(R.tapOnOpenMic({ held: false, now: 1000 }), 'end', 'a writing surface ends on a tap');
});

test('an empty capture never reaches the transcriber', () => {
  assert.equal(R.isEmptyCapture({ bytes: 5, ms: 200 }), true, 'the 5-byte ack-gap clip');
  assert.equal(R.isEmptyCapture({ bytes: 0 }), true);
  assert.equal(R.isEmptyCapture({ bytes: 1016, ms: 4400 }), true, 'under 1.5 KB');
  assert.equal(R.isEmptyCapture({ bytes: 1304, ms: 7700 }), true);
  assert.equal(R.isEmptyCapture({ bytes: 3000, ms: 7700 }), true, 'under 0.5 KB/s is a muted track');
  assert.equal(R.isEmptyCapture({ bytes: 14_000, ms: 7000 }), false, 'real silence (~2 KB/s) still goes: the meter may be wrong');
  assert.equal(R.isEmptyCapture({ bytes: 60_000, ms: 4000 }), false, 'speech');
  assert.equal(R.isEmptyCapture({ bytes: 1600, ms: 500 }), false, 'a short clip is judged on size alone');
});

test('the lead runs from the moment the mic opened, not from the tap', () => {
  const opts = { holdMs: 2000, leadMs: 7000 };
  const t0 = openTurn(0);
  // getUserMedia took 4 s: judged from the tap, the lead would end at 7 s,
  // three seconds after the mic opened
  assert.equal(endReason(t0, 7000, opts), 'lead');
  const opened = R.openedTurn(t0, 4000);
  assert.equal(endReason(opened, 7000, opts), null, 'three seconds into an open mic is not the end');
  assert.equal(endReason(opened, 11_000, opts), 'lead', 'seven seconds into it is');
  // a seeded turn keeps its hold, from no earlier than the open
  const seeded = sawSpeech(openTurn(0), 0);
  const so = R.openedTurn(seeded, 1500);
  assert.equal(so.lastHeardAt, 1500);
  assert.equal(endReason(so, 3000, opts), null);
  assert.equal(endReason(so, 3500, opts), 'hold');
  assert.equal(R.micWait({ startedAt: 0, now: 4999 }), 'wait');
  assert.equal(R.micWait({ startedAt: 0, now: 5000 }), 'timeout');
  assert.equal(R.micWait({ startedAt: 0, now: 9000, opened: true }), 'open');
});

test('a blind-cap transcript under four words is a draft, never a question', () => {
  assert.equal(R.holdAsDraft({ blind: true, endedBy: 'cap', text: 'All right. . Okay.' }), true);
  assert.equal(R.holdAsDraft({ blind: true, endedBy: 'cap', text: 'how did I sleep last night' }), false);
  assert.equal(R.holdAsDraft({ blind: true, endedBy: 'tap', text: 'Okay.' }), false, 'he tapped to send it');
  assert.equal(R.holdAsDraft({ blind: false, endedBy: 'cap', text: 'Okay.' }), false);
  assert.equal(R.holdAsDraft({ blind: true, endedBy: 'cap', text: '' }), false);
});

test('a turn he ended, the screen ended, or a mic that never opened does not count as empty', () => {
  assert.equal(R.countsAsEmpty({ endedBy: 'tap' }), false);
  assert.equal(R.countsAsEmpty({ endedBy: 'hidden', reason: 'hidden' }), false);
  assert.equal(R.countsAsEmpty({ endedBy: 'mic', reason: 'mic-timeout' }), false);
  assert.equal(R.countsAsEmpty({ endedBy: 'clock', reason: 'lead' }), true);
  assert.equal(R.endedByFor('hold'), 'clock');
  assert.equal(R.endedByFor('lead'), 'clock');
  assert.equal(R.endedByFor('cap-idle'), 'cap');
  assert.equal(R.endedByFor('lead', { tapped: true }), 'tap');
  assert.equal(R.endedByFor('mic-timeout'), 'mic');
  assert.equal(R.endedByFor('hidden'), 'hidden');
  assert.equal(R.endedByFor('engine'), 'engine');
});

test('a mic Nova opened by itself is opened once, not twice', () => {
  assert.equal(R.afterEmpty({ trigger: 'auto', empties: 1 }), 'pause');
  assert.equal(R.afterEmpty({ trigger: 'reply-window', empties: 1 }), 'rest', 'the one-shot window closes; pausing would shut the next one');
  assert.equal(R.afterEmpty({ trigger: 'tap', empties: 1 }), 'reopen', 'a turn he started keeps the old two');
  assert.equal(R.afterEmpty({ trigger: 'conv-start', empties: 2 }), 'pause');
});

test('every reason the hook can write is one the receipt can read', () => {
  for (const r of ['tap', 'hidden', 'mic-timeout']) assert.ok(END_REASONS.has(r), r);
  for (const t of R.TRIGGERS) assert.equal(turnRecord({ trigger: t }).trigger, t);
  for (const e of R.ENDED_BY) assert.equal(turnRecord({ endedBy: e }).endedBy, e);
  // the hook's own reasons, found in its source, are all readable
  const src = read('src/useDictation.js');
  for (const m of src.matchAll(/reasonRef\.current = '([a-z-]+)'/g)) assert.ok(END_REASONS.has(m[1]), `${m[1]} would be logged as unknown`);
});

test('the listening fields are bounded: closed sets, finite numbers, null only where it is a fact', () => {
  const f = listenFields({
    trigger: 'auto', endedBy: 'clock', micOpenMs: 420, recMs: 7100, blindMs: 0, firstSoundMs: null,
    peak: 0.123456, txStatus: 'empty', txChars: 0, txDropped: 'Thank you. '.repeat(20),
    audioSession: 'play-and-record', novaSpeaking: false, hidden: true, cause: 'empty-capture',
  });
  assert.equal(f.trigger, 'auto');
  assert.equal(f.micOpenMs, 420);
  assert.equal(f.firstSoundMs, null);
  assert.equal(f.peak, 0.1235);
  assert.ok(f.txDropped.length <= 60);
  assert.equal(f.hidden, true);
  assert.equal(f.cause, 'empty-capture');
  assert.deepEqual(listenFields({ micOpenMs: null }), { micOpenMs: null }, 'null: the mic never opened');
  const junk = listenFields({
    trigger: 'telepathy', endedBy: 'boredom', micOpenMs: -4, recMs: 9e12, blindMs: 'x', firstSoundMs: NaN,
    peak: -1, txStatus: 'great', txChars: 1.5, txDropped: 7, audioSession: 'loud', novaSpeaking: 'yes', hidden: 1, cause: 'aliens',
  });
  assert.deepEqual(junk, {}, 'nothing unrecognised is stored as a guess');
  assert.equal(listenFields({ peak: 7 }).peak, 1);
  // they ride the row
  const row = turnRecord({ reason: 'tap', surface: 'voice', engine: 'nova', vad: 'silent', bytes: 5, trigger: 'tap', endedBy: 'tap', micOpenMs: null, txStatus: 'skipped', cause: 'empty-capture' });
  assert.equal(row.reason, 'tap');
  assert.equal(row.micOpenMs, null);
  assert.equal(row.txStatus, 'skipped');
});

test('the listening table: heard rate and endings per trigger, and a health count that leaves out Nova-opened mics', () => {
  const rows = [
    { surface: 'voice', trigger: 'auto', heard: false, endedBy: 'clock', micOpenMs: 300 },
    { surface: 'voice', trigger: 'auto', heard: false, endedBy: 'clock', micOpenMs: 500 },
    { surface: 'presence', trigger: 'tap', heard: true, endedBy: 'clock', micOpenMs: 200 },
    { surface: 'presence', trigger: 'tap', heard: false, endedBy: 'tap', micOpenMs: 250 },
    { surface: 'presence', trigger: 'tap', heard: false, endedBy: 'mic', micOpenMs: null },
    { surface: 'ask', heard: true },
    { surface: 'barge', heard: true },
  ];
  const t = listeningTable(rows);
  assert.equal(t.turns, 5, 'asks and barge-ins are not listens');
  assert.equal(t.deaf, 1, 'only the tap-opened mic that never opened: auto rows and the tap-ended turn are left out');
  const auto = t.groups.find((g) => g.trigger === 'auto');
  assert.equal(auto.n, 2);
  assert.equal(auto.heard, 0);
  assert.equal(auto.micOpenMedianMs, 300);
  const tap = t.groups.find((g) => g.trigger === 'tap');
  assert.deepEqual(tap.endedBy, { clock: 1, tap: 1, mic: 1 });
  assert.equal(tap.neverOpened, 1);
  assert.equal(listeningTable([]).turns, 0);
});

test('the server answers an empty capture 200 with no words, and never calls the transcriber', async () => {
  const { voiceRouter } = await import('../routes/voice.js');
  const app = express();
  app.use('/api/voice/transcribe', express.raw({ type: () => true, limit: '25mb' }));
  app.use('/api', voiceRouter(dataDir));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/voice/transcribe`;
    const post = (body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Type': 'audio/mp4' }, body });
    const five = await post(Buffer.from('abcde'));
    assert.equal(five.status, 200, 'a 5-byte clip is not a 502');
    assert.deepEqual(await five.json(), { text: '', empty: true, backend: 'none', ms: 0, bytes: 5 });
    const zero = await post(Buffer.alloc(0));
    assert.equal(zero.status, 200);
    assert.equal((await zero.json()).empty, true);
    const nearly = await post(Buffer.alloc(1400, 1));
    assert.equal((await nearly.json()).empty, true, 'under 1.5 KB');
    // a real-sized clip goes on to the transcriber (none is configured here,
    // so it fails in words, which proves it was not short-circuited)
    const real = await post(Buffer.alloc(4000, 1));
    assert.notEqual((await real.json()).empty, true);
  } finally {
    server.close();
  }
});

test('the hook wires the rules where they belong', () => {
  const src = read('src/useDictation.js');
  const tick = src.slice(src.indexOf('const tickNova = () =>'), src.indexOf('const startNova ='));
  assert.match(tick, /if \(!handle\) \{[\s\S]*?micWait\([\s\S]*?'mic-timeout'[\s\S]*?return;\n    \}/, 'no clock runs before the mic opens');
  assert.match(src, /turnRef\.current = openedTurn\(turnRef\.current, at\);/, 'the lead restarts at the open');
  assert.match(src, /isEmptyCapture\(\{ bytes: blob\.size, ms: recMs \}\)/, 'an empty capture is never uploaded');
  assert.match(src, /const BLIND_CAP_MS = 20_000;/);
  assert.match(src, /tapOnOpenMic\(\{/);
  assert.match(src, /addEventListener\('visibilitychange'/);
  // the recorder keeps asking a sleeping graph to wake
  assert.match(read('src/recorder.js'), /if \(level && !level\.running\(\)\) \{ try \{ level\.resume\(\); \}/);
  // App's ack-gap gate
  const app = read('src/App.jsx');
  const mal = app.slice(app.indexOf('  maybeAutoListen() {'), app.indexOf('  beginAnswer(turn) {'));
  assert.match(mal, /if \(this\.answerPendingNow\(\)\) return;/);
});

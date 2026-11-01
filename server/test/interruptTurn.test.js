// HE CUT IN (1 Nov 2026, his words: "if I interrupt them ... this does not
// mean that it should lose anything else for what it was going to continue
// saying"). src/interruptTurn.js is the shared format: App.stopSpeaking keeps
// the record, App.askNova sends the note, the stage's last exchange shows
// only what he heard, and TURN_TAKING tells the model what the note means.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// before any server import: a test without its own data dir writes into his live server/data
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-interrupt-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureInterrupt, interruptNote, interruptFresh, replyInAir, lineSpeaks, heardUpTo, capUnsaid, browserAir, airWithBrowser, UNSAID_CAP, INTERRUPT_FRESH_MS } from '../../src/interruptTurn.js';
import { lastExchange } from '../../src/novaStageFacts.js';

const { listenFields, turnRecord, END_REASONS } = await import('../lib/voiceTurns.js');
const { TURN_TAKING } = await import('../lib/talk.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const S3 = 'The new rest timer starts the moment you rack the bar.';
const S4 = 'It also skips the warm-up sets.';
const S5 = 'And it saves your last weight per lift.';
const HELD = 'The detail: rest is 90 seconds on compounds and 60 on isolation work.';
// the TTS queue as App keeps it: what plays next, an ack that never played,
// and the reply's commit barrier
const QUEUE = [{ said: S4 }, { said: 'Checking your lifts.', ack: true }, { said: S5 }, { done: true, finalize: () => {} }];

test('a cut keeps the sentence in the air and everything unsaid behind it, held rest last', () => {
  const rec = captureInterrupt({ nowSaying: S3, queue: QUEUE, more: HELD });
  assert.equal(rec.inAir, S3, 'what he heard start');
  assert.equal(rec.unsaid, `${S4} ${S5} ${HELD}`, 'the queue in order, then the held rest; the ack and the barrier skipped');
  assert.ok(!rec.unsaid.includes(S3), 'the sentence in the air is not unsaid: he heard it start');
  assert.ok(!rec.unsaid.includes('Checking your lifts'), 'an ack is a receipt, not the reply');
});

test('nothing in the air and nothing unsaid is no record; an ack alone is not a reply', () => {
  assert.equal(captureInterrupt({ nowSaying: null, queue: [] }), null);
  assert.equal(captureInterrupt({ nowSaying: '  ', queue: [{ done: true, finalize: () => {} }] }), null);
  assert.equal(captureInterrupt({ nowSaying: 'Checking your sleep.', nowAck: true, queue: [] }), null);
  assert.equal(replyInAir({ nowSaying: 'Checking your sleep.', nowAck: true, queue: [] }), false, 'the ack is not the reply');
  assert.equal(replyInAir({ nowSaying: S3, queue: [] }), true);
  assert.equal(replyInAir({ nowSaying: null, queue: [{ said: S4 }] }), true, 'between sentences, with more to come');
  assert.equal(replyInAir({ nowSaying: null, queue: [{ said: 'Checking.', ack: true }, { done: true, finalize: () => {} }] }), false);
  // between sentences: no sentence in the air, the rest still owed
  assert.deepEqual(captureInterrupt({ nowSaying: null, queue: [{ said: S4 }] }), { inAir: null, unsaid: S4 });
});

test('the note says exactly what he heard, what he did not, and what to do, in one bracket', () => {
  const rec = captureInterrupt({ nowSaying: S3, queue: QUEUE, more: HELD });
  const note = interruptNote(rec);
  assert.equal(note, `[He cut in while you were saying: "${S3}". He heard everything before that. You had not yet said: "${S4} ${S5} ${HELD}". Take in what he just said first. If it adds to what he asked, act on that. Then, if what you had not said still stands, finish it briefly, without repeating what he heard. If any of it is now wrong or contradicts him, say so in one plain line, like "I was going to say X; that is off now", and drop it.]`);
  assert.ok(!note.includes('\n'), 'one paragraph');
  // the three parts
  assert.match(note, /^\[He cut in while you were saying: "/);
  assert.match(note, /You had not yet said: "/);
  assert.match(note, /that is off now", and drop it\.\]$/);
  // nothing unsaid: no "You had not yet said"
  const last = interruptNote(captureInterrupt({ nowSaying: S3, queue: [] }));
  assert.ok(!last.includes('You had not yet said'), last);
  assert.match(last, /He heard everything before that\. Take in what he just said first\./);
  assert.equal(interruptNote(null), '');
});

test('the unsaid rest is capped at 900 characters on a sentence end, with an ellipsis', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} carries a little detail.`).join(' ');
  const rec = captureInterrupt({ nowSaying: S3, queue: [], more: long });
  assert.ok(rec.unsaid.length <= UNSAID_CAP + 2, `${rec.unsaid.length}`);
  assert.match(rec.unsaid, /detail\. …$/, 'ends on a whole sentence');
  assert.equal(UNSAID_CAP, 900);
  assert.equal(capUnsaid('short.'), 'short.');
  // no sentence end inside the cap: the last word, then the ellipsis
  assert.match(capUnsaid('word '.repeat(400)), /word …$/);
});

test('a kept cut answers his next words only while fresh', () => {
  const rec = { inAir: S3, unsaid: '' };
  assert.equal(interruptFresh({ at: 1000, rec }, 1000 + 60_000), true);
  assert.equal(interruptFresh({ at: 1000, rec }, 1000 + INTERRUPT_FRESH_MS + 1), false);
  assert.equal(interruptFresh(null, 5), false);
});

test('the cut belongs to a reply line only when that line carries the speech', () => {
  const rec = captureInterrupt({ nowSaying: S3, queue: [{ said: S4 }] });
  assert.equal(lineSpeaks(`Done. **${S3}** ${S4}`, rec), true, 'markdown in the line, plain in the voice');
  assert.equal(lineSpeaks('Good morning, sir. Your sleep was short.', rec), false, 'a greeting in the air is not this reply');
});

test('the stage shows an interrupted line only as far as he heard it', () => {
  const text = `${'Built the timer.'} ${S3} ${S4} ${S5}`;
  assert.equal(heardUpTo(text, S3), 'Built the timer. The new rest timer starts the moment you rack the bar…');
  const lines = [
    { who: 'you', text: 'What did you build?' },
    { who: 'nova', agent: null, text, interrupted: { inAir: S3 } },
  ];
  const ex = lastExchange(lines);
  assert.equal(ex.nova.text, 'Built the timer. The new rest timer starts the moment you rack the bar…');
  assert.ok(!ex.nova.text.includes(S4), 'the unsaid is never shown as said');
  // an uninterrupted line is whole, as before
  assert.equal(lastExchange([{ who: 'you', text: 'Hi' }, { who: 'nova', text }]).nova.text, text);
  // a sentence the voice cleaned is found by its first words
  assert.equal(heardUpTo('First. The new rest timer starts **the** moment. Then more.', 'The new rest timer starts the moment.'), 'First. The new rest timer starts **the** moment…');
  // not found at all: whole, never cut in a guessed place
  assert.equal(heardUpTo('Something else entirely.', S3), 'Something else entirely.');
});

test('the thread line carries where his voice came in to the stage', () => {
  const src = read('src/vals/valsNovaThread.js');
  assert.match(src, /interrupted: who === 'nova' && m\.interrupted\?\.inAir \? \{ inAir: m\.interrupted\.inAir \} : null/);
});

test('the receipt keeps `interrupted` and the barge rows keep echo; barge-skip is a known reason', () => {
  assert.equal(listenFields({ interrupted: true }).interrupted, true);
  assert.equal(listenFields({ interrupted: 'yes' }).interrupted, undefined, 'only a real true');
  assert.equal(listenFields({ echo: 0.333333 }).echo, 0.33);
  assert.equal(listenFields({ echo: 4 }).echo, undefined, 'bounded 0..1');
  assert.ok(END_REASONS.has('barge-skip'));
  const row = turnRecord({ reason: 'barge-skip', surface: 'barge', heard: true, why: '80% of it is what Nova is saying', text: 'the protein floor', engine: 'nova', vad: 'heard', bytes: 4096, txMs: 300, echo: 0.8 });
  assert.equal(row.reason, 'barge-skip');
  assert.equal(row.engine, 'nova');
  assert.equal(row.echo, 0.8);
});

test('TURN_TAKING tells every agent what the note means', () => {
  assert.match(TURN_TAKING, /- IF HE CUTS IN, take in what he said first\. Code tells you what he heard and what you had not said\. Finish what still stands, briefly; what is now wrong you retract in one plain line; never repeat what he heard\./);
  assert.ok(!/follow him\. Never restart what he stopped/.test(TURN_TAKING), 'the old line is gone');
});

// ---- the wiring, read from the source (App.jsx is a class over a browser) ----
const app = read('src/App.jsx');
const body = (name) => {
  const at = app.indexOf(`\n  ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  const next = app.indexOf('\n  }\n', at);
  return app.slice(at, next);
};

test('stopSpeaking keeps the cut BEFORE the queue is dropped, and only when it is a cut', () => {
  const b = body('stopSpeaking');
  const cap = b.indexOf('this.captureCut()');
  const reset = b.indexOf('this.resetTtsQueue()');
  assert.ok(cap > 0 && reset > 0 && cap < reset, 'captured before resetTtsQueue');
  assert.match(b, /opts\?\.interrupt === false \? null/);
  assert.match(b, /if \(cut\) this\.keepInterrupt\(cut\)/);
  // captureCut: only a reply genuinely in the air, and only that reply's speech
  const c = body('captureCut');
  assert.match(c, /if \(!replyInAir\(air\)\) return null;/);
  assert.match(c, /lineSpeaks\(line\.text, base\)/);
  assert.match(c, /line\.more && !line\.moreSaid \? line\.more : ''/);
  // the benign stops say so
  for (const fn of ['newVoiceChat', 'claimContinuation', 'dropAnswerInFlight', 'revealHeld', 'setVoiceSpeak', 'maybeStandDown']) {
    assert.match(body(fn), /stopSpeaking\(\{ interrupt: false \}\)/, `${fn} is not a cut`);
  }
});

test('askNova joins the note into `sent`, never `raw`, sends it once, and stamps the receipt', () => {
  const b = body('askNova');
  assert.match(b, /const cut = interruptFresh\(this\.lastInterrupt\) \? this\.lastInterrupt\.rec : null;\n\s*this\.lastInterrupt = null;/);
  assert.match(b, /const sent = \[context, situation, cutNote \|\| heldNote, question\]/);
  assert.match(b, /const heldNote = !cutNote && last\?\.more/, 'the held line is not added twice');
  assert.match(b, /raw: question/, 'raw stays his bare words');
  assert.ok(!/raw: [^,]*cutNote/.test(b));
  assert.match(b, /if \(cutNote\) turn\.interrupted = true;/);
  // the receipts carry it (the poll's postTurn and the reflex's)
  assert.equal((app.match(/\.\.\.\(turn\.interrupted \? \{ interrupted: true \} : \{\}\)/g) || []).length, 2);
  // a reply cut while it streamed: the rest is held silent, its late words
  // join the kept cut, and the committed line keeps the stamp
  assert.match(app, /if \(this\.cutJob && this\.cutJob === jobId\) \{ onPlay\(\); return; \}/);
  assert.match(app, /\.\.\.\(cutAt \? \{ interrupted: cutAt \} : \{\}\)/);
  // a continuation re-asks with the first ask's cut
  assert.match(body('sendContinuation'), /if \(ls\.cut\) this\.lastInterrupt = \{ at: Date\.now\(\), rec: ls\.cut \};/);
});

// ---- the phone's own voice (1 Nov 2026) ----
// With no TTS engine, App.speakIncremental hands each sentence straight to
// window.speechSynthesis and keeps it in `browserSaying`; nothing enters
// ttsQueue, so before this a cut there left no record.
const PHONE = [
  { said: S3, ack: false, started: true },
  { said: S4, ack: false, started: false },
  { said: S5, ack: false, started: false },
];

test('the browser path reads as the engine queue does: the sentence in the air, the rest queued', () => {
  const air = browserAir(PHONE);
  assert.deepEqual(air, { nowSaying: S3, nowAck: false, queue: [{ said: S4 }, { said: S5 }] });
  assert.equal(replyInAir(air), true);
  const rec = captureInterrupt(air);
  assert.deepEqual(rec, { inAir: S3, unsaid: `${S4} ${S5}` });
  assert.match(interruptNote(rec), /He cut in while you were saying: "The new rest timer starts/);
  // the held rest joins it exactly as on the engine path
  assert.deepEqual(captureInterrupt({ ...air, more: HELD }), { inAir: S3, unsaid: `${S4} ${S5} ${HELD}` });
});

test('the browser path: an ack in the air is not the reply; nothing started means nothing heard', () => {
  const ack = browserAir([{ said: 'Checking your lifts.', ack: true, started: true }, { said: S4, started: false }]);
  assert.equal(ack.nowAck, true);
  assert.deepEqual(captureInterrupt(ack), { inAir: null, unsaid: S4 });
  const unstarted = browserAir([{ said: S4, started: false }, { said: S5, started: false }]);
  assert.equal(unstarted.nowSaying, null);
  assert.deepEqual(captureInterrupt(unstarted), { inAir: null, unsaid: `${S4} ${S5}` });
  assert.equal(captureInterrupt(browserAir([])), null);
  assert.equal(replyInAir(browserAir([])), false);
});

test('airWithBrowser: the engine wins while it speaks, else the phone, ahead of a barrier', () => {
  const engine = { nowSaying: S3, nowAck: false, queue: [{ said: S4 }] };
  assert.equal(airWithBrowser(engine, PHONE).nowSaying, S3);
  assert.deepEqual(airWithBrowser(engine, PHONE).queue, [{ said: S4 }]);
  const barrier = { done: true, finalize: () => {} };
  const quiet = { nowSaying: null, nowAck: false, queue: [barrier] };
  const both = airWithBrowser(quiet, PHONE);
  assert.equal(both.nowSaying, S3);
  assert.deepEqual(both.queue.slice(0, 2), [{ said: S4 }, { said: S5 }]);
  assert.equal(both.queue[2], barrier);
  assert.deepEqual(captureInterrupt(both), { inAir: S3, unsaid: `${S4} ${S5}` });
  // nothing on either voice: the engine's (empty) shape, unchanged
  assert.equal(replyInAir(airWithBrowser({ nowSaying: null, queue: [] }, [])), false);
});

test('the wiring: speakIncremental keeps the phone\'s sentences; captureCut and askNova read airNow', () => {
  const si = body('speakIncremental');
  assert.match(si, /const entry = \{ said: text\.trim\(\), ack: !!ack, started: false \};/);
  assert.match(si, /\(this\.browserSaying = this\.browserSaying \|\| \[\]\)\.push\(entry\)/);
  assert.match(si, /onStart: \(\) => \{ entry\.started = true; \}/);
  assert.match(si, /this\.browserSaying = \(this\.browserSaying \|\| \[\]\)\.filter\(\(e\) => e !== entry\)/, 'gone when it ends');
  assert.match(body('speakFallback'), /if \(onStart\) \{ const clock = u\.onstart; u\.onstart = \(\) => \{ try \{ onStart\(\); \}/);
  assert.match(body('airNow'), /airWithBrowser\(\{ nowSaying: this\.ttsNowSaying, nowAck: !!this\.ttsNowAck, queue: this\.ttsQueue \|\| \[\] \}, this\.browserSaying \|\| \[\]\)/);
  assert.match(body('captureCut'), /const air = this\.airNow\(\);/);
  assert.match(body('askNova'), /if \(replyInAir\(this\.airNow\(\)\)\) this\.stopSpeaking\(\);/);
  // the ack reaches the phone marked as one; a stop clears the list after the cut is read
  assert.match(body('speakTtsSentence'), /this\.speakIncremental\(clean, \{ stance, ack \}\)/);
  const st = body('stopSpeaking');
  assert.ok(st.indexOf('this.captureCut()') < st.indexOf('this.browserSaying = [];'));
});

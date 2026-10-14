// STANDBY (15 Oct 2026, server/lib/standby.js; design/EVIE-STUDY.md §4B).
// "Hey, Evie, take five." / "Standing by." These pin: the idiom table is
// strict (the whole utterance or nothing), expiry is by the clock, the queue
// is bounded, the gate lets urgent through and holds the rest, and the lines
// he hears are exactly the code-written ones.
//
// NOVA_DATA_DIR is set BEFORE import: a test without its own data dir writes
// into his live server/data (the 30-fake-greetings lesson).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-standby-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../lib/standby.js');

// local constructor, so "quiet until 3" reads the same in any runner's zone
const AT = new Date(2026, 9, 15, 13, 0, 0);
const plus = (min) => new Date(AT.getTime() + min * 60_000);

test.after(() => rm(dataDir, { recursive: true, force: true }));

test('parse: the idioms that stand Nova by, and for how long', () => {
  const table = [
    ['take five', 30],
    ['Hey Nova, take five.', 30],
    ['Nova, take 5', 30],
    ['take ten', 10],
    ['take ten minutes', 10],
    ['take 15', 15],
    ['take five minutes', 5],
    ['hang on', 5],
    ['Hold on a sec', 5],
    ['give me a minute', 5],
    ['give me a moment please', 5],
    ['one sec', 5],
    ['give me two minutes', 2],
    ['back in a bit', 30],
    ["I'll be back in 20 minutes", 20],
    ['quiet for a bit', 30],
    ['go quiet', 30],
    ['stand by', 30],
    ['Standby.', 30],
    ['quiet for an hour', 60],
    ['quiet for half an hour', 30],
    ['stand by for 45 minutes', 45],
    ['quiet for 2 hours', 120],
    ['quiet', 30],
  ];
  for (const [said, minutes] of table) {
    assert.deepEqual(S.parseStandby(said, AT), { on: true, minutes }, said);
  }
});

test('parse: "quiet until 3" reads the clock', () => {
  const r = S.parseStandby('quiet until 3', AT);
  assert.equal(r.on, true);
  assert.equal(r.minutes, 120);
  assert.equal(new Date(r.until).getHours(), 15);
  assert.equal(S.parseStandby('stand by till 3:30', AT).minutes, 150);
  // a time that would be most of a day away is not a standby
  assert.equal(S.parseStandby('quiet until 12:30', AT), null);
});

test('parse: the words that end it', () => {
  for (const said of ["I'm back", 'back', 'Resume.', 'carry on', 'as you were', "Nova, I'm here", 'im back', 'I am back']) {
    assert.deepEqual(S.parseStandby(said, AT), { on: false }, said);
  }
});

test('parse: strict: anything more than the idiom is not standby', () => {
  for (const said of [
    'take five photos', 'take five minutes to explain my sleep', 'hang on to the receipt',
    'hold on, what was my bench last week', 'give me a minute by minute breakdown', 'back in a bit with the shopping list',
    'quiet the music', 'stand by me', 'I am back from the gym, log my workout', 'take a look at my sleep',
    'what does standby mean', 'resume my workout', 'carry on with the brief', '', 'back squat',
  ]) {
    assert.equal(S.parseStandby(said, AT), null, said);
  }
});

test('state: on, then off by the clock alone (no timer)', async () => {
  const { state, text } = await S.setStandby(30, AT);
  assert.equal(state.on, true);
  assert.equal(state.remainingMin, 30);
  assert.equal(text, 'Standing by.');
  assert.equal(S.standbyState(plus(29)).on, true);
  assert.equal(S.standbyState(plus(29)).remainingMin, 1);
  assert.equal(S.standbyState(plus(30)).on, false);
  assert.equal(S.standbyState(plus(31)).until, null);
});

test('gate: urgent passes; the rest is held, one line each', async () => {
  await S.setStandby(30, AT);
  assert.equal(S.shouldSpeakNow({ now: plus(1) }), false);
  assert.equal(S.shouldSpeakNow({ urgent: true, now: plus(1) }), true);
  assert.equal(await S.gateProactive({ kind: 'push', text: 'Plan Today — ready', now: plus(1) }), false);
  assert.equal(await S.gateProactive({ kind: 'push', text: 'Workout in progress', urgent: true, now: plus(2) }), true);
  assert.equal(S.standbyState(plus(3)).waiting, 1);
  // after expiry nothing is held
  assert.equal(await S.gateProactive({ kind: 'push', text: 'later', now: plus(45) }), true);
});

test('queue: bounded at 50, oldest dropped', async () => {
  await S.clearStandby(AT);
  await S.setStandby(60, plus(100));
  for (let i = 0; i < 55; i++) await S.queueWhileStandby({ kind: 'push', text: `line ${i}`, at: plus(101) });
  const q = await S.drainStandby();
  assert.equal(q.length, 50);
  assert.equal(q[0].text, 'line 5');
  assert.equal((await S.drainStandby()).length, 0);
});

test('lines: on rotates after the first of the day; off counts what landed', async () => {
  assert.equal(S.standbyOnLine({ firstToday: true, rot: 0, until: plus(30), minutes: 30 }), 'Standing by.');
  assert.equal(S.standbyOnLine({ firstToday: false, rot: 1, until: new Date(2026, 9, 15, 15, 40), minutes: 30 }), 'Quiet until 3:40.');
  assert.equal(S.standbyOnLine({ firstToday: false, rot: 2, until: plus(30), minutes: 30 }), 'Standing by for 30 minutes.');
  assert.equal(S.standbyOnLine({ firstToday: false, rot: 2, until: plus(60), minutes: 60 }), 'Standing by for an hour.');
  assert.equal(S.standbyOffLine(0), 'Back.');
  assert.equal(S.standbyOffLine(1), 'Back. One thing landed while you were out.');
  assert.equal(S.standbyOffLine(2), 'Back. Two things landed while you were out.');
  assert.equal(S.untilLabel(new Date(2026, 9, 15, 15, 40)), 'until 3:40 pm');
});

test('answer: the whole turn: on, a held push, back with the count', async () => {
  await S.clearStandby(AT);
  const day2 = new Date(2026, 9, 16, 9, 0); // a new day: the first line again
  const on = await S.answerStandby('Hey Nova, take five.', day2);
  assert.equal(on.text, 'Standing by.');
  assert.equal(on.standby.on, true);
  const again = await S.answerStandby('take ten', new Date(day2.getTime() + 60_000));
  assert.match(again.text, /^(Quiet until \d{1,2}:\d{2}\.|Standing by for 10 minutes\.)$/);
  await S.gateProactive({ kind: 'telegram', text: 'Lead — try today', now: new Date(day2.getTime() + 2 * 60_000) });
  await S.gateProactive({ kind: 'push', text: 'Daily Review — ready', now: new Date(day2.getTime() + 3 * 60_000) });
  const off = await S.answerStandby("I'm back", new Date(day2.getTime() + 4 * 60_000));
  assert.equal(off.text, 'Back. Two things landed while you were out.');
  assert.equal(off.standby.on, false);
  assert.equal(off.standby.landed.length, 2);
  // nothing to end now: "carry on" is just conversation again
  assert.equal(await S.answerStandby('carry on', new Date(day2.getTime() + 5 * 60_000)), null);
});

test('answer: an expired standby ends silently; "back" afterwards still just says Back', async () => {
  const d = new Date(2026, 9, 17, 9, 0);
  await S.answerStandby('hang on', d);
  assert.equal(S.standbyState(new Date(d.getTime() + 6 * 60_000)).on, false);
  const off = await S.answerStandby('back', new Date(d.getTime() + 10 * 60_000));
  assert.equal(off.text, 'Back.');
});

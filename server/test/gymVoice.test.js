// The gym by voice: pure parsing and state transitions over the cockpit's
// draft. Numbers parsed, never guessed; the cursor follows his words; a
// finish is never applied without a yes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInSession, parseStart, applyInSession, matchRoutine } from '../../src/gymVoice.js';

const session = () => ({
  routineName: 'Push', exercises: [
    { name: 'Barbell bench press', sets: [{ weight: 80, reps: 6, done: false }, { weight: 80, reps: 6, done: false }] },
    { name: 'Incline DB press', sets: [{ weight: 28, reps: 10, done: false }] },
    { name: 'Cable fly', skipped: true, sets: [{ weight: 15, reps: 12, done: false }] },
  ],
});

test('parse: sets, reps only, weight only, same, next, skip, finish, later, where, undo; questions fall through', () => {
  assert.deepEqual(parseInSession('80 for 8'), { kind: 'set', weight: 80, reps: 8, rpe: null });
  assert.deepEqual(parseInSession('82.5 kg x 6 at rpe 8'), { kind: 'set', weight: 82.5, reps: 6, rpe: 8 });
  assert.deepEqual(parseInSession('Nova, 30 kilos for 10'), { kind: 'set', weight: 30, reps: 10, rpe: null });
  assert.deepEqual(parseInSession('12 reps'), { kind: 'set', weight: null, reps: 12, rpe: null });
  assert.deepEqual(parseInSession('drop to 70'), { kind: 'weight', weight: 70 });
  assert.equal(parseInSession('same again').kind, 'same');
  assert.equal(parseInSession('next exercise').kind, 'next');
  assert.equal(parseInSession('skip it').kind, 'skip');
  assert.equal(parseInSession("that's it").kind, 'finish');
  assert.equal(parseInSession('finish the session').kind, 'finish');
  assert.equal(parseInSession('save it for later').kind, 'later');
  assert.equal(parseInSession("what's next").kind, 'where');
  assert.equal(parseInSession('undo that').kind, 'undo');
  assert.equal(parseInSession('why is my bench stalled'), null);
  assert.equal(parseInSession('should I deload'), null);
  assert.equal(parseInSession('tick off the eggs'), null);
});

test('start: names resolve strictly; "today" is a flag', () => {
  assert.deepEqual(parseStart('start push day'), { kind: 'start', name: 'push day' });
  assert.deepEqual(parseStart("let's do upper body"), { kind: 'start', name: 'upper body' });
  assert.deepEqual(parseStart("start today's session"), { kind: 'start', today: true });
  assert.deepEqual(parseStart('start the timer'), { kind: 'start', name: 'timer' }); // parses; resolution decides, and a miss falls through to the model
  const routines = [{ id: 'a', name: 'Push' }, { id: 'b', name: 'Pull' }, { id: 'c', name: 'Pull — makeup' }, { id: 'd', name: 'Upper Body' }];
  assert.equal(matchRoutine(routines, 'push day').hit.id, 'a');
  assert.equal(matchRoutine(routines, 'upper body').hit.id, 'd');
  assert.equal(matchRoutine(routines, 'pull').hit.id, 'b'); // exact beats prefix
  assert.match(matchRoutine(routines, 'the timer').why, /no routine called/);
});

test('apply: a set fills the next unticked set of the current exercise and moves on; the cockpit state is never guessed', () => {
  let s = session();
  let r = applyInSession({ kind: 'set', weight: 82.5, reps: 6, rpe: 8 }, s);
  assert.match(r.said, /82.5kg for 6 at 8 — Barbell bench press, set 1 of 2/);
  assert.deepEqual(r.session.exercises[0].sets[0], { weight: 82.5, reps: 6, rpe: 8, done: true });
  assert.equal(r.session.exercises[0].sets[1].done, false);
  r = applyInSession({ kind: 'same' }, r.session);
  assert.match(r.said, /set 2 of 2/);
  assert.match(r.said, /That's Barbell bench press done — next is Incline DB press/);
  assert.equal(r.session.exercises[0].sets[1].weight, 82.5);
  // a third set when both are ticked ADDS one
  r = applyInSession({ kind: 'set', weight: 80, reps: 8, rpe: null }, r.session);
  assert.equal(r.session.exercises[0].sets.length, 3);
  assert.match(r.said, /set 3 of 3/);
  // next moves the cursor past the current exercise, skipping the skipped one
  r = applyInSession({ kind: 'next' }, r.session);
  assert.match(r.said, /Incline DB press — 28kg for 10 is the plan/);
  r = applyInSession({ kind: 'set', weight: null, reps: 11, rpe: null }, r.session);
  assert.deepEqual(r.session.exercises[1].sets[0], { weight: 28, reps: 11, done: true });
  // nothing left: where/next/set say so honestly
  assert.match(applyInSession({ kind: 'next' }, r.session).said, /last one — say finish/);
  // undo takes back the last spoken set only
  const u = applyInSession({ kind: 'undo' }, r.session);
  assert.equal(u.session.exercises[1].sets[0].done, false);
  assert.match(applyInSession({ kind: 'undo' }, u.session).said, /Nothing spoken to take back/);
});

test('apply: skip, weight-only, where, finish and later never write — they say', () => {
  let s = session();
  let r = applyInSession({ kind: 'weight', weight: 75 }, s);
  assert.equal(r.session.exercises[0].sets[0].weight, 75);
  assert.equal(r.session.exercises[0].sets[0].done, false);
  r = applyInSession({ kind: 'where' }, r.session);
  assert.match(r.said, /Barbell bench press, set 1 of 2 — 75kg for 6 is the plan. 2 exercises to go/);
  r = applyInSession({ kind: 'skip' }, r.session);
  assert.equal(r.session.exercises[0].skipped, true);
  assert.match(r.said, /Skipped Barbell bench press. Next is Incline DB press/);
  const f = applyInSession({ kind: 'finish' }, r.session);
  assert.equal(f.finish, true);
  assert.deepEqual(f.session, r.session);
  assert.equal(applyInSession({ kind: 'later' }, r.session).later, true);
});

// settings by voice — the same client-side shape as the gym
import { parseSettings } from '../../src/settingsVoice.js';

test('settings: a real setting AND a real value, or nothing', () => {
  assert.deepEqual(parseSettings('light mode'), { kind: 'theme', value: 'daylight', needsAppleStyle: true, said: 'Daylight — the white study.' });
  assert.equal(parseSettings('dark mode').value, 'command');
  assert.equal(parseSettings('use the ember theme').value, 'ember');
  assert.equal(parseSettings('switch to observatory theme').value, 'observatory');
  assert.equal(parseSettings('apple layout').kind, 'style');
  assert.equal(parseSettings('apple layout').value, 'cupertino');
  assert.equal(parseSettings('command core style').value, 'command');
  assert.deepEqual(parseSettings('calm mode on').value, true);
  assert.deepEqual(parseSettings('turn calm mode off').value, false);
  assert.equal(parseSettings('stop talking').kind, 'speak');
  assert.equal(parseSettings('stop talking').value, false);
  assert.equal(parseSettings('speak your answers').value, true);
  assert.equal(parseSettings('voice off').value, false);
  assert.equal(parseSettings('hey nova on').kind, 'wake');
  assert.equal(parseSettings('wake word off').value, false);
  // conversations, not commands
  assert.equal(parseSettings('make it calmer'), null);
  assert.equal(parseSettings('what themes are there'), null);
  assert.equal(parseSettings('I like the dark one'), null);
  assert.equal(parseSettings('use the unicorn theme'), null);
});

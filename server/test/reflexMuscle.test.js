// THE 21-SECOND QUESTION. Measured 16 Sep against the live endpoint: five of
// his commonest asks answered in 2-66ms and "when did I last train legs" took
// 21,610ms, because the word "legs" had to be interpreted. It never needed a
// model — his library carries a muscleGroup on every exercise and every session
// carries the ids. This is the lever behind his ask for a conversation without
// awkward waiting: filler exists to cover the gap, so close the gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tryReflex } from '../lib/reflex.js';

const LIB = {
  exercises: [
    { id: 'back-squat', name: 'Back Squat', muscleGroup: 'Quads' },
    { id: 'rdl', name: 'Romanian Deadlift', muscleGroup: 'Hamstrings' },
    { id: 'bench', name: 'Barbell Bench Press', muscleGroup: 'Chest' },
    { id: 'row', name: 'Barbell Row', muscleGroup: 'Back' },
    { id: 'curl', name: 'Cable Bicep Curl', muscleGroup: 'Biceps' },
  ],
};
const sess = (date, routineName, ids) => ({ date, routineName, exercises: ids.map((id) => ({ exerciseId: id, name: LIB.exercises.find((e) => e.id === id).name })) });
// newest first, the order loadSessions returns
const SESSIONS = [
  sess('2026-09-15', 'Push', ['bench']),
  sess('2026-09-13', 'Pull', ['row', 'curl']),
  sess('2026-09-02', 'Lower', ['back-squat', 'rdl']),
];
const deps = (sessions = SESSIONS) => ({
  sessionsDeep: async () => sessions,
  exerciseLibrary: async () => LIB,
  sessions: async () => sessions,
});
const NOW = new Date('2026-09-16T09:00:00');
const ask = (q, d = deps()) => tryReflex(q, { ...d, now: NOW });

test('"when did I last train legs" is answered from the library, not a model', async () => {
  const r = await ask('when did I last train legs');
  assert.equal(r.matched, 'muscle-last');
  assert.match(r.text, /Lower/, 'the session that actually had the leg work');
  assert.match(r.text, /Back Squat/, 'and names the lifts that qualified it');
});

test('one word can mean several groups — legs is four of them', async () => {
  // the Lower session is quads AND hamstrings; either should find it
  for (const q of ['when did I last train legs', 'when did I last train quads', 'how long since I trained hamstrings']) {
    assert.equal((await ask(q)).matched, 'muscle-last', q);
  }
});

test('his own split names work, because they are how he talks', async () => {
  assert.match((await ask('when was my last push')).text, /Push/);
  assert.match((await ask('when did I last train pull')).text, /Pull/);
});

test('only the lifts that MATCH the group are named', async () => {
  const r = await ask('when did I last train biceps');
  assert.match(r.text, /Cable Bicep Curl/);
  assert.doesNotMatch(r.text, /Barbell Row/, 'the row is back work — naming it would be wrong');
});

test('a group he has never trained is a real answer, not a miss', async () => {
  const r = await ask('when did I last train calves');
  assert.equal(r.matched, 'muscle-none');
  assert.match(r.text, /have not trained calves in your last 3 sessions/);
});

test('with no library there is nothing to translate, so it falls through', async () => {
  // answering from a guess would be worse than waiting for the model
  const r = await ask('when did I last train legs', { sessionsDeep: async () => SESSIONS, exerciseLibrary: async () => null });
  assert.equal(r, null);
});

test('it does not swallow the plain training question', async () => {
  assert.equal((await ask('what did I train yesterday')).matched, 'trained');
});

test('it does not fire on things that merely mention a body part', async () => {
  for (const q of ['my back hurts', 'how are my legs feeling', 'what is a good chest exercise']) {
    const r = await ask(q);
    assert.notEqual(r?.matched, 'muscle-last', q);
    assert.notEqual(r?.matched, 'muscle-none', q);
  }
});

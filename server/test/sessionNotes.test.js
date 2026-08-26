// Reading his own words. Biased toward silence on purpose: a signal may only
// ever SUPPRESS a load increase, so a false positive costs one cautious week
// and a false negative tells a man whose form is already going to add weight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signalsIn, readExerciseNote, notesForExercise, recurringSignal, recentNotes, notesContextLines } from '../lib/sessionNotes.js';

test('his real notes read the way he meant them', () => {
  assert.deepEqual(signalsIn('Form not as good with the left side. Body momentum moving a bit'), ['form-breakdown']);
  assert.deepEqual(signalsIn('Left side was worse form. Somewhat struggling to move 9.1kg without a slight nudge of body movement momentum'), ['form-breakdown']);
  assert.deepEqual(signalsIn('Done after overhead tricep extension, so more fatigued than usual'), ['fatigue']);
  assert.deepEqual(signalsIn('Exercise done first'), [], 'a neutral note is not a signal');
});

test('a GOOD form report is never read as a problem', () => {
  for (const n of ['Form was good throughout', 'Clean reps, strict form', 'No momentum at all', 'Form felt better today']) {
    assert.deepEqual(signalsIn(n), [], n);
  }
});

test('pain is always a signal, from the note or the structured field', () => {
  assert.ok(signalsIn('slight pinch in the shoulder').includes('pain'));
  const read = readExerciseNote({ pain: 'left elbow', note: '' });
  assert.deepEqual(read.signals, ['pain']);
  assert.equal(read.note, null);
});

test('nothing written means nothing returned — never an empty shell', () => {
  assert.equal(readExerciseNote({}), null);
  assert.equal(readExerciseNote({ note: '   ' }), null);
  assert.equal(readExerciseNote(null), null);
  assert.deepEqual(signalsIn(''), []);
  assert.deepEqual(signalsIn(null), []);
});

const sess = (date, note) => ({ date, exercises: [{ exerciseId: 'lat', name: 'Cable Lateral Raise', sets: [{ weight: 9.1, reps: 5 }], ...(note ? { note } : {}) }] });

test('one bad day is not a pattern; twice is', () => {
  const once = [sess('2026-08-24', 'body momentum creeping in'), sess('2026-08-20')];
  assert.equal(recurringSignal(once, 'lat', 'form-breakdown'), null, 'a single note must not raise a finding');

  const twice = [sess('2026-08-24', 'body momentum creeping in'), sess('2026-08-20', 'form was worse on the left')];
  const hits = recurringSignal(twice, 'lat', 'form-breakdown');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].date, '2026-08-24', 'newest first');
});

test('pain earns a finding on the FIRST report', () => {
  const s = [{ date: '2026-08-24', exercises: [{ exerciseId: 'x', name: 'X', pain: 'left elbow' }] }];
  assert.ok(recurringSignal(s, 'x', 'pain', { min: 1 }));
});

test('notes for one lift come back newest first, capped', () => {
  const many = Array.from({ length: 9 }, (_, i) => sess(`2026-08-${20 - i}`, `note ${i}`));
  const got = notesForExercise(many, 'lat', { limit: 3 });
  assert.equal(got.length, 3);
  assert.equal(got[0].note, 'note 0');
});

test('the digest keeps whole sentences and flags a cut-short session', () => {
  const s = [{ date: '2026-08-24', routineName: 'Pull', cutShort: 'gym closed', exercises: [{ exerciseId: 'a', name: 'A', note: 'momentum crept in' }] }];
  const notes = recentNotes(s);
  assert.equal(notes.length, 2);
  assert.match(notes[0].note, /CUT SHORT/);
  assert.equal(notes[1].note, 'momentum crept in', 'his words, not a summary of them');
});

test('context lines name the signal and quote him verbatim', () => {
  const lines = notesContextLines([{ date: '2026-08-24', name: 'Lateral Raise', note: 'body momentum', signals: ['form-breakdown'] }]);
  assert.match(lines[0], /\[form-breakdown\]/);
  assert.match(lines[0], /"body momentum"/);
});

// Session C of the 22 Sep 2026 aesthetic review — the muscle palette on the
// screens that NAME muscles. muscleHue.test.js pins the map to the library;
// this pins the readers: a muscle rendered in a literal accent (Gym painted
// four of them cyan) is the fault, and the goals card's priority chips come
// from his own words only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { musclesNamed, MUSCLE_TOKEN } from '../../src/muscleHue.js';

const src = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

test('musclesNamed reads only the groups his text actually names, in order, once', () => {
  assert.deepEqual(musclesNamed('Priority: triceps, biceps and shoulders. Keep chest up.'), ['Triceps', 'Biceps', 'Shoulders', 'Chest']);
  assert.deepEqual(musclesNamed('arms and legs'), [], 'nothing is inferred from a limb');
  assert.deepEqual(musclesNamed('biceps biceps BICEPS'), ['Biceps']);
  assert.deepEqual(musclesNamed('full body twice, then back'), ['Full Body', 'Back']);
  assert.deepEqual(musclesNamed(''), []);
  assert.deepEqual(musclesNamed(null), []);
  for (const g of musclesNamed(Object.keys(MUSCLE_TOKEN).join(', '))) assert.ok(MUSCLE_TOKEN[g], `${g} is a declared group`);
});

test('Train paints a muscle from the one map, never a literal accent', () => {
  const screen = src('screens/Workouts.jsx');
  assert.match(screen, /import \{ muscleVar \} from '\.\.\/muscleHue\.js'/, 'Workouts.jsx reads the muscle map');
  // a Tag whose content is a muscle must not carry a fixed tone
  assert.doesNotMatch(screen, /<Tag[^>]*tone="cyan"[^>]*>\{[^}]*\.muscle\b/, 'a muscle chip in cyan is finding 4');
  assert.doesNotMatch(screen, /targetsLine/, 'the joined cyan targets string is gone; chips carry their own hue');
  assert.match(screen, /function MuscleTag\(/);
});

test('the coach chips are sentence case in the vals — Command uppercases, Apple does not', () => {
  const vals = src('vals/valsWorkouts.js');
  const block = vals.slice(vals.indexOf('const coachChips'), vals.indexOf('const trainTabs'));
  assert.ok(block.length > 100, 'found the coachChips block');
  assert.doesNotMatch(block, /toUpperCase\(\)/, 'no label is upper-cased by hand');
  assert.doesNotMatch(block, /REVIEW MY WEEK|SHOULD I DELOAD/, 'no ALL-CAPS literal label');
  assert.match(block, /'Review my week'/);
});

test('the goals view carries the instrument, not an ALL-CAPS meta string', () => {
  const vals = src('vals/valsWorkouts.js');
  const block = vals.slice(vals.indexOf('goalsView: st.liveWorkoutGoals ?'), vals.indexOf('goalsEditing:'));
  assert.match(block, /priority: musclesNamed\(st\.liveWorkoutGoals\.focus\)/);
  assert.match(block, /days: /);
  assert.doesNotMatch(block, /DAYS\/WEEK|UPDATED \$/);
});

// Which movement each lift animates as.
//
// The rule that matters most here is the one about NOT animating. A wrong
// animation is a lie about form, and form is exactly what he would copy off
// the card — so an isometric hold and an unclassifiable lift both resolve to
// null and render a still diagram. "Shows nothing" is a correct answer;
// "shows a plausible wrong thing" is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternFor, PATTERNS, PATTERN_IDS } from '../../src/exerciseMotion.js';
import { EXERCISE_ATLAS } from '../lib/data/exerciseAtlas.js';

test('isometric holds never animate', () => {
  for (const name of ['Plank', 'Side Plank', 'Dead Hang', "Farmer's Carry", 'Plate Pinch']) {
    assert.equal(patternFor(name, ['abs']), null, `${name} is a hold and must stand still`);
  }
});

test('the name decides the movement, not the muscle', () => {
  // same primary muscle, opposite movements — this is why the resolver reads
  // the name first and the anatomy only as a fallback
  assert.equal(patternFor('Tricep Pushdown', ['triceps']), 'pushdown');
  assert.equal(patternFor('Overhead Tricep Extension', ['triceps']), 'overhead-extension');
  assert.equal(patternFor('Skull Crushers', ['triceps']), 'overhead-extension');
});

test('the common shapes resolve', () => {
  const cases = [
    ['Barbell Curl', 'curl'], ['Hammer Curl', 'curl'],
    ['Barbell Row', 'row'], ['Seated Cable Row', 'row'],
    ['Lat Pulldown', 'pulldown'], ['Pull-Up', 'pulldown'], ['Chin-Up', 'pulldown'],
    ['Barbell Bench Press', 'press-horizontal'], ['Push-Up', 'press-horizontal'],
    ['Barbell Overhead Press', 'press-overhead'], ['Arnold Press', 'press-overhead'],
    ['Lateral Raise', 'raise-lateral'], ['Front Raise', 'raise-front'],
    ['Back Squat', 'squat'], ['Leg Press', 'squat'], ['Walking Lunge', 'squat'],
    ['Romanian Deadlift', 'hinge'], ['Hip Thrust', 'hinge'], ['Kettlebell Swing', 'hinge'],
    ['Standing Calf Raise', 'calf-raise'], ['Dumbbell Shrug', 'shrug'],
    ['Cable Crossover', 'fly'], ['Rear Delt Fly', 'fly'],
    ['Seated Leg Curl', 'leg-curl'], ['Leg Extension', 'leg-extension'],
  ];
  for (const [name, want] of cases) assert.equal(patternFor(name, []), want, name);
});

test('a leg curl is not read as a bicep curl', () => {
  // "curl" appears in both; the leg rule is ordered first for exactly this
  assert.equal(patternFor('Lying Leg Curl', ['hamstrings']), 'leg-curl');
  assert.equal(patternFor('Hamstring Lying Leg Curls', ['hamstrings']), 'leg-curl');
});

test('every pattern a lift can resolve to is actually defined', () => {
  for (const [id, a] of Object.entries(EXERCISE_ATLAS)) {
    const pattern = patternFor(id.replace(/-/g, ' '), a.primary);
    if (pattern === null) continue;
    assert.ok(PATTERN_IDS.includes(pattern), `${id} resolves to "${pattern}", which has no definition`);
  }
});

test('every pattern moves at least one limb group', () => {
  for (const [id, p] of Object.entries(PATTERNS)) {
    const groups = ['torso', 'armL', 'armR', 'legL', 'legR'].filter((g) => p[g]);
    assert.ok(groups.length > 0, `${id} animates nothing`);
    assert.ok(p.label, `${id} has no label`);
  }
});

test('most of his library gets a movement, and the rest fail honestly', () => {
  const names = Object.keys(EXERCISE_ATLAS).map((id) => id.replace(/-/g, ' '));
  const resolved = names.filter((n) => patternFor(n, []) !== null).length;
  // not a coverage target for its own sake — a floor that would catch the
  // rules being broken wholesale by an edit
  assert.ok(resolved / names.length > 0.8, `only ${resolved}/${names.length} lifts resolve to a movement`);
});

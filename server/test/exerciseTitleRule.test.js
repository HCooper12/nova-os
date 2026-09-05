// A long video with no chapters is still the demonstration when it is ABOUT
// this one lift. The first timecode pass called 31 videos "no way in"; 29 of
// them were "How to PROPERLY Deadlift"-shaped — six minutes of one exercise.
// Only a compilation genuinely hides the lift somewhere inside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { titleIsAboutThisLift } from '../lib/exerciseVideos.js';

test('a single-exercise tutorial names the lift', () => {
  assert.equal(titleIsAboutThisLift('How to PROPERLY Deadlift for Growth (5 Easy Steps)', 'Deadlift'), true);
  assert.equal(titleIsAboutThisLift('How To: Incline Barbell Bench Press | 3 GOLDEN RULES', 'Incline Barbell Bench Press'), true);
  assert.equal(titleIsAboutThisLift('STOP F*cking Up Cable Flys (PROPER FORM!)', 'Cable Crossover'), true, 'shares "cable" — and it is a crossover tutorial, so word overlap is the right call');
});

test('a compilation is not a demonstration of one lift', () => {
  assert.equal(titleIsAboutThisLift('5 Best Chest Exercises (Chest Dip included)', 'Chest Dip'), false);
  assert.equal(titleIsAboutThisLift('Full Push Workout — bench, dips, flyes', 'Chest Dip'), false);
  assert.equal(titleIsAboutThisLift('Top 10 Back Exercises', 'Barbell Row'), false);
  assert.equal(titleIsAboutThisLift('Every Deadlift Variation Ranked', 'Deadlift'), false);
});

test('the two real hold-outs are correctly refused', () => {
  // the search returned the wrong exercise, and a rant respectively
  assert.equal(titleIsAboutThisLift('HOW TO DO THE GOOD MORNING EXERCISE', 'Glute-Ham Raise'), false);
  assert.equal(titleIsAboutThisLift('Stop Doing THIS Triceps Exercise (DO THIS INSTEAD)', 'Carter Extension'), false);
});

test('empty inputs never match', () => {
  assert.equal(titleIsAboutThisLift('', 'Deadlift'), false);
  assert.equal(titleIsAboutThisLift('Deadlift', ''), false);
});

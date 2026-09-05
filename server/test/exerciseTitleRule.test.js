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
  // one shared word ("cable") and no movement noun ("crossover") is not a
  // match any more — the bandsaw taught us what one shared word is worth.
  // This particular video IS a crossover tutorial, and the link it earned in
  // the batch stays; the rule cannot know synonyms and should not guess.
  assert.equal(titleIsAboutThisLift('STOP F*cking Up Cable Flys (PROPER FORM!)', 'Cable Crossover'), false);
});

test('a compilation is not a demonstration of one lift', () => {
  assert.equal(titleIsAboutThisLift('5 Best Chest Exercises (Chest Dip included)', 'Chest Dip'), false);
  assert.equal(titleIsAboutThisLift('Full Push Workout — bench, dips, flyes', 'Chest Dip'), false);
  assert.equal(titleIsAboutThisLift('Top 10 Back Exercises', 'Barbell Row'), false);
  assert.equal(titleIsAboutThisLift('Every Deadlift Variation Ranked', 'Deadlift'), false);
});

test('THE BANDSAW: a brand in the exercise name must not match a video about the brand', () => {
  // the daily job's first real run linked this to the Carter Extension
  assert.equal(titleIsAboutThisLift('Master Your Bandsaw: The Ultimate 6 - Step Setup Guide with Alex Snodgrass', 'Carter Extension'), false);
  // and the movement noun alone is enough, brand or no brand
  assert.equal(titleIsAboutThisLift('Cable Overhead Triceps Extension — proper form', 'Carter Extension'), true);
});

test('the movement noun is stem-tolerant', () => {
  // "Raises" covers "Raise"; this is the Barbell Logic video the job found
  assert.equal(titleIsAboutThisLift('Best Hamstring Exercise? How To Perform Glute Ham Raises', 'Glute-Ham Raise'), true);
  assert.equal(titleIsAboutThisLift('How to do Lateral Raises', 'Lateral Raise'), true);
  assert.equal(titleIsAboutThisLift('Bicep Curls for Beginners', 'Barbell Curl'), true);
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

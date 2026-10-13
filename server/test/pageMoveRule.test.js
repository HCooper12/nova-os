import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageMove } from '../../src/pageMoveRule.js';

const fuel = (fuelView = null) => ({ screen: 'recipes', fuelView });
const train = (workoutsView, extra = {}) => ({ screen: 'workouts', workoutsView, ...extra });

test("Fuel's Recipes pushes in and pops back", () => {
  assert.equal(pageMove(fuel(), fuel('recipes')), 'push');
  assert.equal(pageMove(fuel('recipes'), fuel()), 'pop');
});

test("Train's pages: a routine and its history push; back pops; another routine is a push", () => {
  assert.equal(pageMove(train('routines'), train('routine', { openRoutineId: 'a' })), 'push');
  assert.equal(pageMove(train('routine', { openRoutineId: 'a' }), train('history', { historyRoutineId: 'a' })), 'push');
  assert.equal(pageMove(train('history', { historyRoutineId: 'a' }), train('routine', { openRoutineId: 'a' })), 'pop');
  assert.equal(pageMove(train('routine', { openRoutineId: 'a' }), train('routines')), 'pop');
  assert.equal(pageMove(train('routine', { openRoutineId: 'a' }), train('routine', { openRoutineId: 'b' })), 'push');
});

test('the session grows in from any page and shrinks back to whatever it lands on', () => {
  assert.equal(pageMove(train('routines'), train('session')), 'grow');
  assert.equal(pageMove(train('routine', { openRoutineId: 'a' }), train('session')), 'grow');
  assert.equal(pageMove(train('session'), train('routines')), 'shrink');
  assert.equal(pageMove(train('session'), train('history')), 'shrink');
});

test('a screen change, or no change, is no page move', () => {
  assert.equal(pageMove(fuel('recipes'), train('routines')), null);
  assert.equal(pageMove(train('routines'), train('routines')), null);
  assert.equal(pageMove({ screen: 'mission' }, { screen: 'mission' }), null);
});

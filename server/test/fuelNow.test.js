import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuelNow, workoutEventFor, clockOf } from '../../src/fuelNow.js';

const dish = (name, p, kcal, extra = {}) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), name, p, kcal, portionsLeft: null, out: false, ...extra });
const slots = (over = {}) => [
  { key: 'preworkout', label: 'Pre-workout', focus: null, alt: null, eaten: false, ...(over.preworkout || {}) },
  { key: 'breakfast', label: 'Meal 1', focus: dish('Smoothie', 40, 445, { portionsLeft: 1 }), alt: dish('Oats', 48, 471), eaten: false, ...(over.breakfast || {}) },
  { key: 'lunch', label: 'Meal 2', focus: dish('Potato Bowl', 88, 950), alt: null, eaten: false, ...(over.lunch || {}) },
  { key: 'dinner', label: 'Meal 3', focus: dish('Caesar Pasta', 46, 494, { portionsLeft: 4 }), alt: dish('Works Burger', 52, 540), eaten: false, ...(over.dinner || {}) },
];

test('morning: the next meal, and its last portion in the fridge', () => {
  const r = fuelNow({ nowMin: 7 * 60 + 30, slots: slots(), p: 0, proteinTarget: 150 });
  assert.equal(r.key, 'next');
  assert.equal(r.line, "Meal 1 is Smoothie, and it's your last one in the fridge.");
  assert.deepEqual(r.actions.map((a) => a.kind), ['tick', 'swap', 'open']);
});

test('before training with an empty pre-workout slot', () => {
  const r = fuelNow({ nowMin: 16 * 60 + 10, slots: slots({ breakfast: { eaten: true }, lunch: { eaten: true } }), p: 128, proteinTarget: 150,
    workout: { name: 'Push', time: '17:30', done: false } });
  assert.equal(r.key, 'pre');
  assert.equal(r.line, 'Push is at 5:30 pm and the pre-workout slot is empty.');
});

test('no pre-workout prompt once training is done or past', () => {
  const s = slots({ breakfast: { eaten: true }, lunch: { eaten: true } });
  assert.notEqual(fuelNow({ nowMin: 16 * 60, slots: s, p: 128, proteinTarget: 150, workout: { name: 'Push', time: '17:30', done: true } }).key, 'pre');
  assert.notEqual(fuelNow({ nowMin: 19 * 60, slots: s, p: 128, proteinTarget: 150, workout: { name: 'Push', time: '17:30', done: false } }).key, 'pre');
});

test('evening: protein to go, and the next meal covers it', () => {
  const r = fuelNow({ nowMin: 19 * 60 + 20, slots: slots({ breakfast: { eaten: true }, lunch: { eaten: true } }), p: 132, proteinTarget: 150 });
  assert.equal(r.key, 'covers');
  assert.equal(r.line, '18 g of protein to go, and Meal 3 covers it.');
  assert.equal(r.why, 'Caesar Pasta, 46 g, lands you on 178 g. 4 portions left.');
  assert.deepEqual(r.proj, { now: 132, add: 46, target: 150 });
});

test('a dish that is out says so and offers the swap', () => {
  const r = fuelNow({ nowMin: 19 * 60, slots: slots({ breakfast: { eaten: true }, lunch: { eaten: true }, dinner: { focus: dish('Caesar Pasta', 46, 494, { portionsLeft: 0, out: true }) } }), p: 130, proteinTarget: 150 });
  assert.equal(r.key, 'out');
  assert.deepEqual(r.actions.map((a) => a.kind), ['swap']);
});

test('day done: tomorrow needs cooking when a dish ran out; otherwise silence', () => {
  const all = { breakfast: { eaten: true, focus: dish('Smoothie', 40, 445, { portionsLeft: 0, out: true }) }, lunch: { eaten: true }, dinner: { eaten: true } };
  const r = fuelNow({ nowMin: 21 * 60 + 40, slots: slots(all), p: 178, proteinTarget: 150 });
  assert.equal(r.key, 'restock');
  assert.equal(r.line, "Day done. Tomorrow's Meal 1 needs cooking.");
  const quiet = fuelNow({ nowMin: 21 * 60, slots: slots({ breakfast: { eaten: true }, lunch: { eaten: true }, dinner: { eaten: true } }), p: 178, proteinTarget: 150 });
  assert.equal(quiet, null);
});

test('no rotation at all: no card', () => {
  assert.equal(fuelNow({ nowMin: 600, slots: [], p: 0, proteinTarget: 150 }), null);
});

test('the workout time comes from the calendar, by the same rule as Home', () => {
  const ev = [{ time: '05:30', label: 'Morning routine' }, { time: '17:30', label: 'Gym' }];
  assert.equal(workoutEventFor('Push', ev).time, '17:30');
  assert.equal(workoutEventFor('Push', [{ time: '09:00', label: 'Psychology' }]), null);
  assert.equal(clockOf('17:30'), '5:30 pm');
  assert.equal(clockOf('07:00'), '7 am');
});

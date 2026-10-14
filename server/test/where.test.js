// WHERE HE IS (src/where.js; design/EVIE-STUDY.md §4E). Pins: each place
// comes only from a signal the client can really read, the precedence is
// gym → driving → desk → phone, driving never comes from a route alone, the
// why is bounded, and the bounded form is the closed set.
import test from 'node:test';
import assert from 'node:assert/strict';

const { whereAmI, boundWhere, readWhereInputs, PLACES, WHY_MAX } = await import('../../src/where.js');

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 };
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 };
const IPAD = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 };

test('the closed set', () => {
  assert.deepEqual(PLACES, ['gym', 'driving', 'desk', 'phone', 'unknown']);
});

test('gym: a live workout', () => {
  assert.equal(whereAmI({ workoutLive: true }).place, 'gym');
});

test('gym outranks the desk: a workout open on the Mac is still the gym', () => {
  assert.equal(whereAmI({ workoutLive: true, mac: true }).place, 'gym');
});

test('gym outranks driving signals', () => {
  assert.equal(whereAmI({ workoutLive: true, audioRoute: 'carplay', moving: true }).place, 'gym');
});

test('driving: CarPlay and moving', () => {
  const w = whereAmI({ audioRoute: 'carplay', moving: true, iphone: true, standalone: true });
  assert.equal(w.place, 'driving');
  assert.match(w.why, /CarPlay/);
});

test('driving: car Bluetooth hands-free and moving', () => {
  assert.equal(whereAmI({ audioRoute: 'bluetooth-hfp', moving: true }).place, 'driving');
});

test('NOT driving: a car route while parked, or moving with AirPods', () => {
  assert.equal(whereAmI({ audioRoute: 'carplay', moving: false, iphone: true, standalone: true }).place, 'phone');
  assert.equal(whereAmI({ audioRoute: 'carplay', iphone: true, standalone: true }).place, 'phone');
  assert.equal(whereAmI({ audioRoute: 'airpods', moving: true, iphone: true, standalone: true }).place, 'phone');
});

test('driving fallback: the hands-free lane, and it says so', () => {
  const w = whereAmI({ handsFree: true, iphone: true });
  assert.equal(w.place, 'driving');
  assert.match(w.why, /hands-free/);
  assert.match(w.why, /no route signal/);
});

test('desk: the Mac', () => {
  assert.equal(whereAmI({ mac: true }).place, 'desk');
});

test('phone: the installed iPhone app', () => {
  assert.equal(whereAmI({ iphone: true, standalone: true }).place, 'phone');
});

test('unknown: an iPhone browser tab, or nothing at all', () => {
  assert.deepEqual(whereAmI({ iphone: true }), { place: 'unknown', why: 'an iPhone browser tab' });
  assert.equal(whereAmI({}).place, 'unknown');
  assert.equal(whereAmI().place, 'unknown');
  assert.equal(whereAmI(null).place, 'unknown');
});

test('why is always ≤ 60 characters', () => {
  for (const i of [{ workoutLive: true }, { audioRoute: 'carplay', moving: true }, { handsFree: true }, { mac: true }, { iphone: true, standalone: true }, {}]) {
    assert.ok(whereAmI(i).why.length <= WHY_MAX, JSON.stringify(i));
  }
});

test('boundWhere: a place outside the set is unknown; why is clipped and flattened', () => {
  assert.deepEqual(boundWhere({ place: 'roof', why: 'x' }), { place: 'unknown', why: 'x' });
  assert.equal(boundWhere({ place: 'gym', why: 'a\n'.repeat(100) }).why.length, WHY_MAX);
  assert.deepEqual(boundWhere(null), { place: 'unknown', why: '' });
});

test('readWhereInputs: a live draft is the gym; a history edit is not', () => {
  const ws = { routineName: 'Push', exercises: [] };
  assert.equal(readWhereInputs({ workoutSession: ws }, { navigator: IPHONE }).workoutLive, true);
  assert.equal(readWhereInputs({ workoutSession: ws, editingSessionId: 's1' }, { navigator: IPHONE }).workoutLive, false);
  assert.equal(readWhereInputs({ workoutSession: null }, { navigator: IPHONE }).workoutLive, false);
});

test('readWhereInputs: the Mac, the iPhone and an iPad (Mac UA with touch) told apart', () => {
  assert.equal(readWhereInputs({}, { navigator: MAC }).mac, true);
  assert.equal(readWhereInputs({}, { navigator: IPHONE }).mac, false);
  assert.equal(readWhereInputs({}, { navigator: IPHONE }).iphone, true);
  assert.equal(readWhereInputs({}, { navigator: IPAD }).mac, false);
  assert.equal(readWhereInputs({}, { navigator: IPAD }).iphone, true);
});

test('readWhereInputs never claims what the shell cannot tell it: no route, no motion, no hands-free', () => {
  const i = readWhereInputs({ workoutSession: null }, { navigator: IPHONE, standalone: true });
  assert.equal('audioRoute' in i, false);
  assert.equal('moving' in i, false);
  assert.equal('handsFree' in i, false);
  assert.equal(whereAmI(i).place, 'phone');
});

// THE QUESTIONS THAT STILL COST TWENTY SECONDS. Measured live 16 Sep, after the
// muscle-group reflex landed: "what's on tomorrow" 42,043ms · "how many workouts
// this week" 32,985ms · "how long since I trained" 11,862ms · "how many
// techniques do I have left" 11,257ms — and that last one came back ELEVEN when
// the catalogue held six. A model guessing about Nova's own state.
//
// All four are lookups. After: 39ms · 2ms · 2ms · 8ms, and right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tryReflex } from '../lib/reflex.js';

const NOW = new Date('2026-09-16T09:00:00'); // a Wednesday
const base = {
  // the control questions below land in NEIGHBOURING lanes, which need their own
  calendarToday: async () => [{ label: 'Standup', time: '11:00' }],
  calendarTomorrow: async () => [
    { label: 'Workout', time: '07:30' }, { label: 'Walk Tank', time: '09:45' }, { label: 'Standup', time: '11:00' },
    { label: 'Work', time: '13:00' }, { label: 'Dinner', time: '19:00' }, { label: 'Read', time: null },
  ],
  sessions: async () => [
    { date: '2026-09-15', routineName: 'Push', exercises: [] },
    { date: '2026-09-09', routineName: 'Pull', exercises: [] },
  ],
  repertoire: async () => ({
    all: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: `T${i}` })),
    state: { techniques: { t0: { lastSurfacedOn: '2026-09-15' }, t1: { lastSurfacedOn: '2026-09-16' } } },
    today: { technique: { id: 't1', name: 'Presupposition (Milton Model)' }, position: 2 },
  }),
};
const ask = (q, extra = {}) => tryReflex(q, { ...base, ...extra, now: NOW });

test("tomorrow is answered from the warm cache, and a cold one falls through", async () => {
  const r = await ask("what's on tomorrow");
  assert.equal(r.matched, 'calendar-tomorrow');
  assert.match(r.text, /6 on tomorrow/);
  assert.match(r.text, /Workout at 07:30/);
  assert.match(r.text, /1 with no time/, 'an untimed event is counted, not dropped');
  // cold cache → the model, which can wait on iCloud honestly
  assert.equal(await ask("what's on tomorrow", { calendarTomorrow: async () => null }), null);
});

test('an empty tomorrow is an answer, not a miss', async () => {
  const r = await ask("what's on tomorrow", { calendarTomorrow: async () => [] });
  assert.match(r.text, /Nothing on the calendar tomorrow/);
});

test('sessions this week counts from MONDAY, not the last seven days', async () => {
  // 9 Sep was the previous Wednesday — inside seven days, outside this week
  const r = await ask('how many workouts this week');
  assert.equal(r.matched, 'week-count');
  assert.match(r.text, /^1 this week/, 'the 9th belongs to last week');
  assert.match(r.text, /Push/);
});

test('a week with nothing logged says so', async () => {
  const r = await ask('how many workouts this week', { sessions: async () => [] });
  assert.match(r.text, /Nothing logged this week yet/);
});

test('how long since he trained is measured in whole days', async () => {
  const r = await ask('how long since I trained');
  assert.equal(r.matched, 'since-trained');
  assert.match(r.text, /^Yesterday, sir — Push/);
});

test("Nova cannot be wrong about its OWN curriculum", async () => {
  // the model said "eleven techniques" when there were six. A lookup cannot.
  const r = await ask('how many techniques do I have left');
  assert.equal(r.matched, 'repertoire');
  assert.match(r.text, /2 of 6/);
  assert.match(r.text, /4 still to come/, 'two taught, four untaught — counted, not guessed');
  assert.match(r.text, /Presupposition/);
});

test('an empty repertoire says so rather than counting nothing', async () => {
  const r = await ask('how many techniques do I have left', { repertoire: async () => ({ all: [], state: {}, today: null }) });
  assert.match(r.text, /Nothing in your Repertoire yet/);
});

test('these do not swallow neighbouring questions', async () => {
  assert.notEqual((await ask("what's on today"))?.matched, 'calendar-tomorrow');
  assert.notEqual((await ask('what did I train yesterday'))?.matched, 'since-trained');
});

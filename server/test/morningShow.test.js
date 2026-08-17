// The show composer's contract: receipts only, honest skips for missing
// sources, the highlight prefers agent-produced work, and the spoken-yes
// gate is armed exactly when something is pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeShow } from '../lib/morningShow.js';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = local(new Date());
const YESTERDAY = local(new Date(Date.now() - 86_400_000));
const NOW_ISO = new Date().toISOString();

const deps = {
  recentDays: async () => [
    { date: YESTERDAY, steps: 8538, hrv: 61.2, sleepAsleepMinutes: 431 },
    { date: TODAY, steps: 2100, sleepAsleepMinutes: 402 },
  ],
  foodToday: async () => ({ entries: [{ macros: { p: 80, kcal: 1900 } }] }),
  records: async () => [
    { id: 'aaa', kind: 'coach', status: 'pending', createdAt: NOW_ISO, text: 'coach verdict on squats' },
    { id: 'bbb', kind: 'research', status: 'pending', createdAt: NOW_ISO, question: 'creatine timing evidence' },
    { id: 'ccc', kind: 'capture', status: 'filed', createdAt: NOW_ISO, text: 'done thing' },
  ],
  eventsForDay: async () => [{ label: 'Push Day', time: '17:30' }],
  panel: async (vp, d) => ({ type: d.panel, data: { stub: true } }),
};

test('morning show: receipts spoken in order, times humanized, spoken-yes armed on the produced item', async () => {
  const { steps, pending } = await composeShow('/tmp/vault', { variant: 'morning' }, deps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /morning, sir/i);
  assert.match(all, /6 hours 42 minutes/, 'sleep read from today\'s file');
  assert.match(all, /8,538 steps yesterday/);
  assert.match(all, /Push Day at 5:30 pm/, '24h times become spoken 12h');
  // all-day entries speak like a person, never "at 12:00 am"
  const withAllDay = { ...deps, eventsForDay: async () => [
    { label: "Aarush's Birthday 🥳", time: '00:00' },
    { label: 'Push Day', time: '17:30' },
  ] };
  const again = await composeShow('/tmp/vault', { variant: 'morning' }, withAllDay);
  const cal = again.steps.map((s) => s.say).join(' | ');
  assert.match(cal, /it's Aarush's Birthday; one timed thing, starting with Push Day at 5:30 pm/);
  assert.doesNotMatch(cal, /12:00 am|🥳/, 'no midnight times, no emoji in speech');
  assert.match(all, /research agent drafted/i, 'overnight produce is narrated');
  assert.match(all, /Say the word/, 'the approval callout closes the brief');
  assert.equal(pending.recordId, 'bbb', 'highlight prefers agent-produced work over coach housekeeping');
});

test('evening show: today\'s numbers, tomorrow\'s shape, fuel beat carries its panel', async () => {
  const { steps } = await composeShow('/tmp/vault', { variant: 'evening' }, deps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /evening, sir/i);
  assert.match(all, /2,100 steps today/);
  assert.match(all, /80 grams of protein and 1,900 calories/);
  assert.match(all, /Tomorrow: one timed thing, first is Push Day at 5:30 pm/);
  const fuel = steps.find((s) => s.say.includes('protein'));
  assert.equal(fuel.panel?.type, 'nutrition-week', 'evidence pane rides its beat');
});

test('missing sources lose their beats silently — never filler, never a crash', async () => {
  const bare = {
    recentDays: async () => [],
    foodToday: async () => { throw new Error('no log'); },
    records: async () => [],
    eventsForDay: async () => { throw new Error('caldav down'); },
    panel: async () => { throw new Error('no panel'); },
  };
  const { steps, pending } = await composeShow('/tmp/vault', { variant: 'morning' }, bare);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /morning, sir/i, 'greeting survives everything');
  assert.doesNotMatch(all, /steps|calendar|Inbox|undefined|NaN/);
  assert.equal(pending, null);
  assert.ok(steps.length >= 2, 'greeting + close at minimum');
});

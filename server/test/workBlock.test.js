// THE HOUR BEFORE WORK. His instruction, 18 Sep: the leader panel goes to the
// top of Home in the hour before a work block, "since that's when that will be
// most relevant especially", and the same focus goes out over Telegram.
//
// Both hang on one definition (src/workBlock.js) so the panel and the message
// can never disagree about the same moment. These pin the definition, and the
// two ways it could quietly go wrong: promoting the lead by dropping another
// section, and a reminder that fires twice or fires empty.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkBlock, nextWorkBlock, leadLeadsNow, promoteLead, hm2min, untilWords,
  LEAD_WINDOW_MIN,
} from '../../src/workBlock.js';
import {
  buildReminder, dueNow, localDayKey, runLeaderReminder, _resetLeaderReminder,
} from '../lib/leaderReminder.js';

// his actual calendar, 18 Sep 2026, from /api/calendar/today
const TODAY = [
  { time: '10:00', end: '10:30', label: 'Haircut 💇🏽‍♂️ (Amaan)', calendar: 'Appointment' },
  { time: '11:45', end: '12:45', label: 'Workout', calendar: 'Health' },
  { time: '13:15', end: '14:00', label: 'Walk Tank 🐶🐾', calendar: 'Family' },
  { time: '14:00', end: '14:30', label: 'Get ready', calendar: 'Health' },
  { time: '15:30', end: '20:00', label: 'Work 💰', calendar: 'Work' },
  { time: '22:00', end: '22:30', label: 'Mindfulness or Journal 🧘📓', calendar: 'Health' },
  { time: '22:30', end: '06:00', label: 'Recharge 💤', calendar: 'Health' },
];
const at = (h, m = 0) => h * 60 + m;

test('a work block is the Work CALENDAR, not a word in a label', () => {
  // "Walk Tank" contains "wal"… and a keyword rule would also miss a block
  // called "Deep focus". His calendars already separate the two properly.
  assert.equal(isWorkBlock({ time: '15:30', label: 'Work 💰', calendar: 'Work' }), true);
  assert.equal(isWorkBlock({ time: '13:15', label: 'Walk Tank 🐶🐾', calendar: 'Family' }), false);
  assert.equal(isWorkBlock({ time: '11:45', label: 'Workout', calendar: 'Health' }), false,
    'a Health "Workout" is being read as work — he would get the lead before the gym');
  assert.equal(isWorkBlock({ time: '22:30', label: 'Recharge 💤', calendar: 'Health' }), false);
  // the narrow label fallback, for an event filed on the wrong calendar
  assert.equal(isWorkBlock({ time: '09:00', label: 'Work', calendar: 'Personal' }), true);
  assert.equal(isWorkBlock({ time: '09:00', label: 'Networking drinks', calendar: 'Personal' }), false);
  assert.equal(isWorkBlock(null), false);
  assert.equal(isWorkBlock({ label: 'Work', calendar: 'Work' }), false, 'an all-day event has no start to be an hour before');
});

test('the window opens exactly an hour before, and closes when work starts', () => {
  assert.equal(leadLeadsNow(TODAY, at(14, 29)), false, 'too early — 61 minutes out');
  assert.equal(leadLeadsNow(TODAY, at(14, 30)), true, 'the window should open at exactly 60 minutes');
  assert.equal(leadLeadsNow(TODAY, at(15, 29)), true);
  // a block already under way is not something to prepare for — he asked for
  // the hour BEFORE, and at 16:00 he has been working for half an hour
  assert.equal(leadLeadsNow(TODAY, at(15, 30)), false);
  assert.equal(leadLeadsNow(TODAY, at(18, 0)), false);
  assert.equal(leadLeadsNow(TODAY, at(9, 0)), false);
  assert.equal(leadLeadsNow([], at(14, 45)), false, 'no calendar, no promotion');
});

test('the NEXT work block is the next one, not the first one in the array', () => {
  const twoBlocks = [
    { time: '18:00', label: 'Work 💰', calendar: 'Work' },
    { time: '09:00', label: 'Work 💰', calendar: 'Work' },
  ];
  assert.equal(nextWorkBlock(twoBlocks, at(8, 30)).time, '09:00');
  assert.equal(nextWorkBlock(twoBlocks, at(12, 0)).time, '18:00');
  assert.equal(nextWorkBlock(twoBlocks, at(19, 0)), null);
  assert.equal(nextWorkBlock(TODAY, at(14, 40)).startsIn, 50);
});

test('PROMOTING THE LEAD NEVER DROPS A SECTION', () => {
  // the Home orders are asserted in dev to cover every section exactly once;
  // a promotion that lost or duplicated one would blank part of his screen
  const order = ['working', 'wrap', 'focus', 'lead', 'plan', 'today', 'agents'];
  const moved = promoteLead(order, true);
  assert.deepEqual([...moved].sort(), [...order].sort(), 'the promotion changed the SET of sections');
  assert.equal(moved.length, order.length);
  assert.equal(new Set(moved).size, moved.length, 'a section appears twice');
  // working stays first — his standing requirement that anything running is
  // always visible — and the lead takes the next slot
  assert.deepEqual(moved.slice(0, 2), ['working', 'lead']);
  // with no working strip, the lead really is first
  assert.equal(promoteLead(['wrap', 'focus', 'lead'], true)[0], 'lead');
  // and off, nothing moves at all
  assert.deepEqual(promoteLead(order, false), order);
  assert.deepEqual(promoteLead(['a', 'b'], true), ['a', 'b'], 'an order with no lead was rewritten');
});

test('a malformed time is ignored rather than guessed at', () => {
  assert.equal(hm2min('15:30'), 930);
  assert.equal(hm2min('9:05'), 545);
  assert.equal(hm2min('25:00'), null);
  assert.equal(hm2min('15:75'), null);
  assert.equal(hm2min('soon'), null);
  assert.equal(hm2min(null), null);
  assert.equal(nextWorkBlock([{ time: 'all day', label: 'Work', calendar: 'Work' }], 0), null);
});

test('the words under the card read like a person wrote them', () => {
  assert.equal(untilWords(40), 'in 40 minutes');
  assert.equal(untilWords(1), 'in 1 minute');
  assert.equal(untilWords(0), 'now');
  assert.equal(untilWords(null), '');
});

// ---- the Telegram half ----

test('the reminder carries the lead, and says nothing when there is no lead', () => {
  const work = { label: 'Work 💰', startsIn: 45, time: '15:30' };
  const text = buildReminder(
    { title: 'Name the decision', line: 'Say which call is yours to make.', why: 'Three threads stalled on nobody owning them.' },
    work,
    { question: 'Did the Tuesday conversation happen?' },
  );
  assert.match(text, /Before work/);
  assert.match(text, /Work 💰 in 45 minutes/);
  assert.match(text, /Name the decision/);
  assert.match(text, /Say which call is yours to make/);
  assert.match(text, /Still open: Did the Tuesday conversation happen\?/);
  // no lead is silence, not a header with nothing under it
  assert.equal(buildReminder(null, work, null), null);
  assert.equal(buildReminder({}, work, null), null);
});

test('it fires ONCE, in the window, and not again that day', () => {
  _resetLeaderReminder();
  const d = (h, m) => new Date(2026, 8, 18, h, m);
  assert.equal(dueNow(TODAY, d(14, 29)), null, 'fired 61 minutes out');
  assert.ok(dueNow(TODAY, d(14, 45)), 'did not fire inside the window');
  assert.equal(dueNow(TODAY, d(16, 0)), null, 'fired after work had started');
  // the per-day guard
  assert.equal(dueNow(TODAY, d(14, 45), { sentDay: localDayKey(d(14, 45)) }), null,
    'it would send again every minute for the whole hour');
  assert.ok(dueNow(TODAY, d(14, 45), { sentDay: '2026-09-17' }), 'yesterday’s send blocked today’s');
});

test('a day with no lead is marked sent, so it does not retry for an hour', async () => {
  _resetLeaderReminder();
  let sends = 0;
  const deps = {
    loadEvents: async () => TODAY,
    state: async () => ({ today: null }),
    send: async () => { sends++; },
    configured: () => true,
  };
  const now = new Date(2026, 8, 18, 14, 45);
  const first = await runLeaderReminder(now, deps);
  assert.equal(first.sent, false);
  assert.match(first.why, /no lead/);
  const second = await runLeaderReminder(new Date(2026, 8, 18, 14, 46), deps);
  assert.match(second.why, /already sent today/);
  assert.equal(sends, 0, 'an empty reminder went out');
});

test('it actually sends, once, when there IS a lead', async () => {
  _resetLeaderReminder();
  const sent = [];
  const deps = {
    loadEvents: async () => TODAY,
    state: async () => ({ today: { title: 'Name the decision', line: 'Say which call is yours.' } }),
    send: async (t) => { sent.push(t); },
    configured: () => true,
  };
  const out = await runLeaderReminder(new Date(2026, 8, 18, 14, 45), deps);
  assert.equal(out.sent, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Name the decision/);
  await runLeaderReminder(new Date(2026, 8, 18, 15, 0), deps);
  assert.equal(sent.length, 1, 'it sent twice in one day');
});

test('no Telegram, no work, no crash', async () => {
  _resetLeaderReminder();
  const off = await runLeaderReminder(new Date(2026, 8, 18, 14, 45), { configured: () => false });
  assert.equal(off.sent, false);
  assert.match(off.why, /not configured/);

  _resetLeaderReminder();
  const noWork = await runLeaderReminder(new Date(2026, 8, 18, 14, 45), {
    loadEvents: async () => [], state: async () => ({ today: { title: 'x' } }),
    send: async () => { throw new Error('must not send'); }, configured: () => true,
  });
  assert.equal(noWork.sent, false);
});

test('the window constant is the one both sides read', () => {
  assert.equal(LEAD_WINDOW_MIN, 60);
});

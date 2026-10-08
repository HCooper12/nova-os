// THE LEADER'S ORDER — the matrix the Blend 1 mockup draws on its ladder card
// (design/mockups/82-redesign-leader-r2.html, MARKS), plus his three rules of
// 9 Oct 2026: an unread reply first; today's idea first in the morning, the
// hour before a work block and during it; otherwise the open question or
// whatever else is next. One row per moment; the expected order is the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderOrder, ideaWindow, firstWorkBlock, daysWords } from '../../src/leaderOrder.js';

const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
// Monday: one work block 09:00 to 12:00 on his Work calendar (the mockup's "before your 09:00")
const MON = [{ time: '09:00', end: '12:00', label: 'Work', calendar: 'Work 💰' }, { time: '18:00', end: '19:00', label: 'Gym', calendar: 'Health' }];
const NONE = [{ time: '10:00', end: '11:00', label: 'Brunch', calendar: 'Family' }];
const SHIFT = [{ time: '15:30', end: '20:00', label: 'Work', calendar: 'Work' }];

const asking = { open: true, since: 'since Friday' };
const base = { idea: true, question: asking, daysQuiet: 9, openCount: 7 };

const TABLE = [
  // the ladder's five moments, as drawn
  ['Mon 07:10, the morning', MON, '07:10', base, ['idea', 'question', 'conversation'], ['roundup'], /before your 09:00/],
  ['Mon 12:40, the morning is over', MON, '12:40', base, ['question', 'idea', 'conversation'], ['roundup'], /waited since Friday/],
  ['Mon 12:41, after he answers', MON, '12:41', { idea: true, question: null, daysQuiet: 0, openCount: 6, receipts: [{ key: 'a1' }] }, ['idea', 'receipt:a1', 'conversation'], [], /nothing else/],
  ['Thu 07:05, a reply he has not read', MON, '07:05', { idea: true, reply: { unread: true }, daysQuiet: 3, openCount: 6 }, ['reply', 'idea', 'roundup', 'conversation'], [], /while you were away/],
  ['Sat 14:20, five quiet days', NONE, '14:20', { idea: true, daysQuiet: 5, openCount: 6 }, ['roundup', 'idea', 'conversation'], [], /five days quiet/],
  // his rules, 9 Oct: the hour before and during the block
  ['Mon 08:20, the hour before work', MON, '08:20', base, ['idea', 'question', 'conversation'], ['roundup'], /starts in 40 minutes/],
  ['Mon 10:30, during the block', MON, '10:30', base, ['idea', 'question', 'conversation'], ['roundup'], /in your work block, until 12:00/],
  ['a late shift: idea top all morning, through the hour before, through the shift', SHIFT, '14:45', base, ['idea', 'question', 'conversation'], ['roundup'], /starts in 45 minutes/],
  ['a late shift, during it', SHIFT, '19:00', base, ['idea', 'question', 'conversation'], ['roundup'], /until 20:00/],
  ['after the shift the question leads', SHIFT, '20:30', base, ['question', 'idea', 'conversation'], ['roundup'], /waited/],
  // no work block known: the morning still applies, until 12:00, and says so
  ['no block today, 09:00', NONE, '09:00', base, ['idea', 'question', 'conversation'], ['roundup'], /no work block on your calendar today, so until 12:00/],
  ['no block today, 12:00 sharp', NONE, '12:00', base, ['question', 'idea', 'conversation'], ['roundup'], /waited/],
  // an unread reply beats everything, even the block
  ['a reply beats the block', MON, '10:30', { ...base, reply: { unread: true } }, ['reply', 'idea', 'question', 'conversation'], ['roundup'], /while you were away/],
  // and his answer, just taken, holds the card while he reads the line back
  ['his answer just taken', MON, '12:41', { idea: true, answered: { fresh: true }, daysQuiet: 0, openCount: 6 }, ['answered', 'idea', 'conversation'], [], /has your answer/],
  // the round-up's restraint
  ['Not today holds the round-up', NONE, '14:20', { idea: true, daysQuiet: 5, openCount: 6, roundupOff: true }, ['idea', 'conversation'], ['roundup'], /nothing else/],
  ['two quiet days is not a round-up', NONE, '14:20', { idea: true, daysQuiet: 2, openCount: 6 }, ['idea', 'conversation'], [], /nothing else/],
  ['nothing open, no round-up', NONE, '14:20', { idea: true, daysQuiet: 9, openCount: 0 }, ['idea', 'conversation'], [], /nothing else/],
  ['never told anything, something open', NONE, '14:20', { idea: false, daysQuiet: null, openCount: 2 }, ['roundup', 'conversation'], [], /not told me anything yet/],
  // absence renders as absence
  ['no idea yet, morning: the question leads', MON, '05:30', { idea: false, question: asking, daysQuiet: 1, openCount: 3 }, ['question', 'conversation'], [], /waited/],
  ['nothing at all: the conversation', NONE, '15:00', {}, ['conversation'], [], /nothing else/],
  ['receipts newest first, before the conversation', NONE, '15:00', { idea: true, receipts: [{ key: 'b' }, { key: 'a' }] }, ['idea', 'receipt:b', 'receipt:a', 'conversation'], [], /nothing else/],
];

for (const [name, events, at, r, order, held, why] of TABLE) {
  test(`order · ${name}`, () => {
    const out = leaderOrder(hm(at), events, r);
    assert.deepEqual(out.order, order);
    assert.equal(out.now, order[0]);
    assert.deepEqual(out.held, held);
    assert.match(out.why, why);
  });
}

test('the idea window reads the calendar the Summary Home reads', () => {
  assert.equal(firstWorkBlock(MON).time, '09:00');
  assert.equal(firstWorkBlock(NONE), null);
  // a Work event filed on another calendar still counts when it says so plainly
  assert.equal(firstWorkBlock([{ time: '13:00', end: '17:00', label: 'Shift', calendar: 'Personal' }]).time, '13:00');
  assert.equal(ideaWindow(MON, hm('07:59')).kind, 'morning');
  assert.equal(ideaWindow(MON, hm('08:00')).kind, 'before');
  assert.equal(ideaWindow(MON, hm('09:00')).kind, 'during');
  assert.equal(ideaWindow(MON, hm('12:00')), null);
  assert.equal(ideaWindow(NONE, hm('11:59')).kind, 'morning');
  assert.equal(ideaWindow(NONE, hm('12:00')), null);
});

test('a night shift that crosses midnight keeps the idea on top through it', () => {
  const NIGHT = [{ time: '22:00', end: '06:00', label: 'Work', calendar: 'Work' }];
  assert.equal(ideaWindow(NIGHT, hm('23:30')).kind, 'during');
  assert.equal(ideaWindow(NIGHT, hm('02:00')).kind, 'during');
});

test('counts in the reason are words when small', () => {
  assert.equal(daysWords(5), 'five days');
  assert.equal(daysWords(1), 'one day');
  assert.equal(daysWords(13), '13 days');
});

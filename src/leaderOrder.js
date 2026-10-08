// WHAT THE LEADER PUTS FIRST — one deterministic function over the record and
// the clock, run on every open, after every write, and as the minute turns.
// A model never decides it. design/mockups/82-redesign-leader-r2.html, Blend 1
// (the ladder card draws this rule as a matrix over five moments).
//
// His words, 9 Oct 2026, when he chose Blend 1: "Unread replies from the
// leader should jump to the top. The advice for the day should be considered
// to be most important because it is a concept that I would ideally be
// looking at implementing that day. It should be the first thing at the top
// in the morning and then it should also appear at the top within the last
// hour before starting my work block and during my work block. All other
// times it can revert to an open question or whatever else is important at
// the top."
//
// So, top to bottom:
//   answered      his answer has just been taken: the Leader's line back to
//                 him holds the card while he reads it (a few seconds)
//   reply         a Leader reply he has not read, before everything
//   idea          today's idea, in its window: the morning (until his first
//                 work block today, or 12:00 when none is known), the hour
//                 before a work block, and the block itself
//   question      the Leader's open question, one at a time
//   roundup       three quiet days and something open, held while a question
//                 waits (the follow-up's own restraint) or when he said Not
//                 today
//   idea          today's idea, outside its window
//   receipt:*     what he set down this visit, newest first, each with Undo
//   conversation  always last
//
// Pure: no React, no clock of its own, no state. The work-block reading is
// src/workBlock.js's, the same one the Summary Home and the Telegram
// reminder use, so the three can never disagree about when work starts.

import { isWorkBlock, hm2min, nextWorkBlock, currentWorkBlock, LEAD_WINDOW_MIN } from './workBlock.js';

export const NOON_MIN = 12 * 60;
export const ROUNDUP_QUIET_DAYS = 3;

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
// "five days" in a sentence, "13 days" past twelve (the house writes small
// counts as words in prose, numerals in forms)
export const daysWords = (n) => (n >= 0 && n < NUM.length ? `${NUM[n]} day${n === 1 ? '' : 's'}` : plural(n, 'day'));

// His first work block today, by start time, from the calendar he keeps.
export function firstWorkBlock(events) {
  let best = null;
  for (const e of events || []) {
    if (!isWorkBlock(e)) continue;
    const start = hm2min(e.time);
    if (start === null) continue;
    if (!best || start < best.start) best = { start, time: e.time, label: e.label || 'Work' };
  }
  return best;
}

// Is today's idea in its window right now, and why. Null when it is not.
export function ideaWindow(events, nowMin) {
  const during = currentWorkBlock(events, nowMin);
  if (during) return { kind: 'during', why: `you are in your work block, until ${during.endTime}` };
  const next = nextWorkBlock(events, nowMin);
  if (next && next.startsIn <= LEAD_WINDOW_MIN) {
    return { kind: 'before', why: next.startsIn <= 1 ? 'your work block starts now' : `your work block starts in ${next.startsIn} minutes` };
  }
  const first = firstWorkBlock(events);
  if (first) {
    return nowMin < first.start ? { kind: 'morning', why: `it is morning, before your ${first.time}` } : null;
  }
  return nowMin < NOON_MIN
    ? { kind: 'morning', why: 'it is morning; no work block on your calendar today, so until 12:00' }
    : null;
}

// The order. `r` is the record as the page reads it:
//   answered   { fresh: true } while the Leader's line back to his answer holds the card
//   reply      { unread: true } for the newest Leader reply he has not opened
//   idea       true when today's idea has landed
//   question   { open: true, since: 'since Friday' } for the Leader's open question
//   daysQuiet  whole days since he last told the Leader anything (null: never)
//   openCount  open struggles on the record
//   roundupOff true when he said Not today to the round-up, today
//   receipts   [{ key }] what he set down this visit, newest first
// Returns { order, now, why, held } — order[0] is the card; held lists what
// the rule kept back on purpose (the struck ring on the ladder).
export function leaderOrder(nowMin, events, r = {}) {
  const out = [];
  const held = [];
  const why = {};
  if (r.answered?.fresh) { out.push('answered'); why.answered = 'the Leader has your answer'; }
  if (r.reply?.unread) { out.push('reply'); why.reply = 'the Leader answered while you were away'; }
  const win = r.idea ? ideaWindow(events, nowMin) : null;
  if (win) { out.push('idea'); why.idea = win.why; }
  const asking = !!r.question?.open;
  if (asking) { out.push('question'); why.question = r.question.since ? `it has waited ${r.question.since}` : 'the Leader is waiting on it'; }
  const quiet = r.daysQuiet == null ? Infinity : r.daysQuiet;
  const roundupDue = quiet >= ROUNDUP_QUIET_DAYS && (r.openCount || 0) > 0;
  if (roundupDue) {
    if (asking || r.roundupOff) held.push('roundup');
    else {
      out.push('roundup');
      why.roundup = r.daysQuiet == null
        ? 'you have not told me anything yet, and no question is waiting'
        : `${daysWords(r.daysQuiet)} quiet, and no question waiting`;
    }
  }
  if (r.idea && !out.includes('idea')) { out.push('idea'); why.idea = 'nothing else is waiting'; }
  for (const rc of r.receipts || []) out.push(`receipt:${rc.key}`);
  out.push('conversation');
  why.conversation = 'nothing else is waiting';
  const now = out[0];
  return { order: out, now, why: why[now] || 'nothing else is waiting', held };
}

// Minutes since local midnight, the clock the rule reads.
export const minuteOfDay = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

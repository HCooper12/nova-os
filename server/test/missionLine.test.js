// The headline under "Good evening" and the button on the live block — the
// two things he reported on 12 Sep. Both rules are invisible from a
// screenshot taken at any one minute, which is exactly how the duplicate
// survived: at 22:07 the line and the card below it said the same sentence,
// and at 09:00 they would not have.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plainLabel, blockKind, isLiveBlock, minsLeft, blockLine, nextLine,
  blockCta, blockDetail, pickTagline, genericLine, spanLabel,
} from '../../src/missionLine.js';

// His real calendar for 12 Sep, read from the live server.
const READY = { time: '10:00', end: '10:30', label: 'Get ready', recurring: true };
const PARTY = { time: '12:00', end: '17:00', label: 'Rachel Wood’s birthday gathering \u{1F973}' };
const REFLECT = { time: '22:00', end: '22:30', label: 'Mindfulness or Journal \u{1F9D8}\u{1F4D3}', recurring: true };
const NIGHT = { time: '22:30', end: '06:00', label: 'Recharge \u{1F4A4}', recurring: true };
const at = (h, m = 0) => h * 60 + m;

// ---- emoji belong in lists, not in sentences ----

test('a calendar label loses its emoji in prose and keeps its words', () => {
  assert.equal(plainLabel(REFLECT.label), 'Mindfulness or Journal');
  assert.equal(plainLabel(NIGHT.label), 'Recharge');
  assert.equal(plainLabel(PARTY.label), 'Rachel Wood’s birthday gathering');
});

test('a label that is ONLY emoji keeps them — an empty headline is worse', () => {
  assert.equal(plainLabel('\u{1F973}'), '\u{1F973}');
  assert.equal(plainLabel(null), '');
});

// ---- what a block is ----

test('his four real blocks classify the way he would read them', () => {
  assert.equal(blockKind(REFLECT.label), 'reflect');
  assert.equal(blockKind(NIGHT.label), 'sleep');
  assert.equal(blockKind(PARTY.label), 'social');
  assert.equal(blockKind(READY.label), 'prep');
});

test('a block Nova does not recognise says so instead of guessing', () => {
  assert.equal(blockKind('Zamboni'), null);
  assert.equal(blockKind(''), null);
});

test('a social meal is social first — "Dinner with friends" is not a food log', () => {
  assert.equal(blockKind('Dinner with friends'), 'social');
  assert.equal(blockKind('Dinner'), 'meal');
});

// ---- the overnight wrap ----

test('an overnight block is live at half eleven AND at two in the morning', () => {
  assert.equal(isLiveBlock(NIGHT, at(23, 30)), true);
  assert.equal(isLiveBlock(NIGHT, at(2)), true, 'the old start<=now<end test could never match');
  assert.equal(isLiveBlock(NIGHT, at(21)), false);
  assert.equal(isLiveBlock(NIGHT, at(7)), false);
});

test('a ONE-OFF overnight event is not live the morning before it starts', () => {
  // a 23:00 red-eye on today's list has not happened yet at 02:00 today
  const oneOff = { time: '23:00', end: '07:00', label: 'Flight' };
  assert.equal(isLiveBlock(oneOff, at(2)), false);
  assert.equal(isLiveBlock(oneOff, at(23, 30)), true);
});

test('minutes left survive midnight', () => {
  assert.equal(minsLeft(NIGHT, at(23, 40)), 380);
  assert.equal(minsLeft(NIGHT, at(2)), 240);
  assert.equal(minsLeft(REFLECT, at(22, 7)), 23);
});

test('a duration reads as words under an hour and as the house 7h 30m over it', () => {
  assert.equal(spanLabel(23), '23 minutes');
  assert.equal(spanLabel(1), '1 minute');
  assert.equal(spanLabel(450), '7h 30m');
  assert.equal(spanLabel(240), '4h');
});

// ---- the headline for a block ----

test('"In the thick of" is gone, and every block line carries its number', () => {
  const lines = [
    blockLine(REFLECT, at(22, 7)),
    blockLine(NIGHT, at(23, 40)),
    blockLine(PARTY, at(14)),
    blockLine(READY, at(10, 10)),
  ];
  for (const l of lines) assert.ok(!/in the thick of/i.test(l), l);
  assert.equal(lines[0], '23 minutes to put the day down.');
  assert.equal(lines[1], '6h 20m until 06:00 if you turn in now.');
  assert.equal(lines[2], 'Rachel Wood’s birthday gathering until 17:00.', 'a five-hour party states its end, not a countdown');
  assert.equal(lines[3], '20 minutes left of Get ready.');
});

test('the next block never reads "Cleared for" a bed', () => {
  assert.equal(nextLine(NIGHT, at(22, 7)), 'Lights out at 22:30 — a 7h 30m night.');
  assert.equal(nextLine(PARTY, at(11, 30)), '30 minutes clear, then Rachel Wood’s birthday gathering.');
  assert.equal(nextLine(PARTY, at(8)), 'Clear until 12:00, then Rachel Wood’s birthday gathering.');
});

// ---- the button ----

test('the button is the thing the block is FOR', () => {
  assert.deepEqual(blockCta(REFLECT), { intent: 'journal', label: 'Open the journal' });
  assert.deepEqual(blockCta({ time: '09:00', end: '11:00', label: 'Deep work' }), { intent: 'timer', label: 'Focus until 11:00' });
  assert.equal(blockCta({ time: '12:00', end: '12:30', label: 'Lunch' }).intent, 'fuel');
});

test('a block with nothing for Nova to do gets NO button, not a decorative timer', () => {
  // the vault has never recorded a completed focus block; offering one on a
  // party, a nap or an unknown block is a button that does nothing
  assert.equal(blockCta(NIGHT), null);
  assert.equal(blockCta(PARTY), null);
  assert.equal(blockCta(READY), null);
  assert.equal(blockCta({ time: '09:00', end: '10:00', label: 'Zamboni' }), null);
  assert.match(blockDetail(PARTY, at(14)), /Nothing for Nova to do here/);
});

// ---- the headline never restates the card ----

const SIGNALS = {
  hour: 22, nowMin: at(22, 7), dayIndex: 255,
  block: REFLECT, next: NIGHT, proteinGap: 40, stepsShort: 0, inboxPending: 0,
};

test('THE REGRESSION: when the card holds the live block, the headline does not', () => {
  const withoutCard = pickTagline(SIGNALS, null);
  assert.equal(withoutCard.topic, 'block');
  const withCard = pickTagline(SIGNALS, 'block');
  assert.notEqual(withCard.topic, 'block');
  assert.notEqual(withCard.line, withoutCard.line, 'two slots, one fact, is the fault he reported');
  assert.equal(withCard.line, '40 g of protein left to close tonight.');
});

test('skipping the card\'s rung drops to the next TRUE thing, not to a stock line', () => {
  const quiet = { ...SIGNALS, proteinGap: 0 };
  assert.equal(pickTagline(quiet, 'block').line, 'Lights out at 22:30 — a 7h 30m night.');
});

test('the ladder order is unchanged — a live session still outranks everything', () => {
  const s = { ...SIGNALS, session: { routineName: 'Upper Body', setsDone: 1 } };
  assert.equal(pickTagline(s, 'session').topic, 'block', 'the card took the session, so the headline takes the block');
  assert.equal(pickTagline(s, null).line, 'Upper Body is mid-flight — 1 set down.');
});

test('with nothing true left, the line is generic — and generic never claims data', () => {
  const empty = { hour: 20, nowMin: at(20), dayIndex: 3 };
  const r = pickTagline(empty, null);
  assert.equal(r.topic, 'generic');
  assert.equal(r.line, genericLine(20, 3));
});

test('the generic line rotates by day so it is not the same phrase every night', () => {
  const seen = new Set([0, 1, 2].map((d) => genericLine(20, d)));
  assert.equal(seen.size, 3);
  assert.equal(genericLine(20, 3), genericLine(20, 0), 'deterministic — the same day always reads the same');
  assert.notEqual(genericLine(9, 0), genericLine(20, 0), 'morning and evening are different pools');
});

// ---- the end of the day ----

test('inside the sleep block the day is CLOSED — no chasing a daily total', () => {
  const s = { hour: 22, nowMin: at(22, 31), block: NIGHT, proteinGap: 150, stepsShort: 4000 };
  // true at 22:31, and useless at 22:31
  assert.notEqual(pickTagline(s, 'block').topic, 'protein');
  assert.notEqual(pickTagline(s, 'block').topic, 'steps');
  // the same numbers an hour earlier, before the block, still count
  assert.equal(pickTagline({ ...s, block: REFLECT, nowMin: at(22, 7) }, 'block').topic, 'protein');
});

test('at the end of the day the useful line is what tomorrow already owes', () => {
  const s = {
    hour: 22, nowMin: at(22, 31), block: NIGHT, proteinGap: 150,
    tomorrow: { count: 9, sources: ['Push — makeup', 'Upper Body'] },
  };
  assert.equal(pickTagline(s, 'block').line, 'Tomorrow picks up 9 exercises from 2 earlier sessions.');
  const one = { ...s, tomorrow: { count: 5, sources: ['Upper Body'] } };
  assert.equal(pickTagline(one, 'block').line, 'Tomorrow picks up 5 exercises from Upper Body.');
});

test('tomorrow is not mentioned in the middle of today', () => {
  const s = { hour: 14, nowMin: at(14), tomorrow: { count: 9, sources: ['Upper Body'] } };
  assert.notEqual(pickTagline(s, null).topic, 'tomorrow');
});

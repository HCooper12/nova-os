// WHICH EVIDENCE CARD A REPLY MAY OFFER.
//
// His report, 9 Sep, with a screenshot: a Leader conversation about handling
// a negative older colleague, and the blue EVIDENCE button under it opened
// "WHY IS MY CABLE OVERHEAD TRICEP EXTENSION STALLED?".
//
// The old rule was four regexes over the reply text, and in every one of them
// the \b bound only to the first alternative — so `flat`, `floor`, `schedule`
// and `exhaust` matched anywhere, in any subject. Underneath that was the
// larger fault: nothing checked the reply was about his BODY at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { offerVerdictFor } from '../../src/verdictOffer.js';

// ---- the reports ----

// The reply from the screenshot, as far as it is legible in it.
const LEADERSHIP = `A negative veteran is very often a dissenter with nowhere legitimate to
put their experience. Give them the seat — "you've seen this go wrong more times than anyone
here, so I want you on the failure modes" — and the same instinct comes out as contribution
instead of drag. Before the 15:30, write two sentences on a scrap of paper. One is specific
recognition, a real thing this person did and the concrete outcome it caused. The other is the
standard going forward, in plain words. Tell me which they are — reports or peers.`;

test('THE REPORT: a leadership answer offers no training evidence', () => {
  assert.equal(offerVerdictFor(LEADERSHIP), null);
  assert.equal(offerVerdictFor(LEADERSHIP, { agent: 'leader' }), null);
});

test('THE REPORT: the four words that used to fire, in their real sentences', () => {
  for (const line of [
    'Keep the team from going flatly hostile about it.',
    'Give them the floor in the next stand-up.',
    'Put it in the schedule before the week fills up.',
    'An exhaustive review would cost you more than it returns.',
    'Flatten the hierarchy for that one meeting.',
  ]) assert.equal(offerVerdictFor(line), null, line);
});

// ---- the agent has no standing ----

test('the Leader never offers a reading of his body, whatever it said', () => {
  const real = 'Your bench press has stalled for 40 days across 7 sessions.';
  assert.ok(offerVerdictFor(real), 'sanity: this is a real stall');
  assert.equal(offerVerdictFor(real, { agent: 'leader' }), null);
});

test('Nova and the Coach still may', () => {
  const real = 'Your bench press has stalled for 40 days across 7 sessions.';
  assert.equal(offerVerdictFor(real, { agent: 'nova' })?.kind, 'stalled');
  assert.equal(offerVerdictFor(real, { agent: 'coach' })?.kind, 'stalled');
});

// ---- it still does its job ----

test('the card he actually wanted still appears', () => {
  assert.equal(offerVerdictFor('Cable Overhead Tricep Extension has been flat for 40 days across 7 sessions with effort steady.')?.kind, 'stalled');
  assert.equal(offerVerdictFor('You are tired because you have slept under six hours for four nights.')?.kind, 'tired');
  assert.equal(offerVerdictFor('You are 84 g short of your protein floor today.')?.kind, 'protein');
  assert.equal(offerVerdictFor('Your sharpest window today is the morning — deep work before 11.')?.kind, 'peak');
});

test('a trigger without the subject is not enough', () => {
  assert.equal(offerVerdictFor('The project has plateaued and morale is the reason.'), null);
  assert.equal(offerVerdictFor('She is the sharpest person on the team.'), null);
  assert.equal(offerVerdictFor('I am exhausted by this quarter.'), null);
});

test('the subject without a trigger is not enough either', () => {
  assert.equal(offerVerdictFor('Push day is at 17:30 and the gym will be busy.'), null);
});

test('empty and missing text offer nothing', () => {
  for (const junk of ['', null, undefined]) assert.equal(offerVerdictFor(junk), null);
});

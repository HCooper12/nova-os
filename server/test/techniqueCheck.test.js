// DID IT LAND? (src/techniqueCheck.js) — when Wrap the day asks about
// today's technique. The rules pinned: a pass is never asked about, an answer
// becomes a receipt (and reopens on Change), and the evening with nothing
// logged still asks — but only from 18:00, only if he has not dismissed the
// wrap, and it does not resurface an answer he gave elsewhere this morning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shortTechniqueName, techniqueQuestionState, questionOnlyWrap, WRAP_FROM_HOUR } from '../../src/techniqueCheck.js';
import { CARD_FROM_HOUR } from '../lib/wrapDay.js';

const day = '2026-09-25';
const served = (over = {}) => ({
  date: day, outcome: null, result: null, note: null,
  technique: { id: 'irp', name: 'Ironic Process Rebound (the "white bear" effect)', tell: 'they cannot stop thinking about it' },
  ...over,
});

test('the name he will remember: a trailing gloss goes, a gloss-only name stays', () => {
  assert.equal(shortTechniqueName('Ironic Process Rebound (the "white bear" effect)'), 'Ironic Process Rebound');
  assert.equal(shortTechniqueName('Presupposition (Milton Model)'), 'Presupposition');
  assert.equal(shortTechniqueName('Barnum / Cold Reading'), 'Barnum / Cold Reading');
  assert.equal(shortTechniqueName('(only a gloss)'), '(only a gloss)');
});

test('nothing served, or a pass, is never asked about', () => {
  assert.equal(techniqueQuestionState(null), null);
  assert.equal(techniqueQuestionState({ date: day, technique: null }), null);
  assert.equal(techniqueQuestionState(served({ outcome: 'skipped' })), null, 'only what he tried can have landed');
});

test('asked against the technique\'s own tell, on the short name', () => {
  const q = techniqueQuestionState(served());
  assert.equal(q.name, 'Ironic Process Rebound');
  assert.equal(q.tell, 'they cannot stop thinking about it');
  assert.equal(q.answered, false);
});

test('an answer becomes a receipt — after the tick has drawn, and until he reopens it', () => {
  const r = served({ outcome: 'tried', result: 'landed', note: 'on Sam' });
  assert.equal(techniqueQuestionState(r).answered, true);
  assert.equal(techniqueQuestionState(r, { tick: 'done' }).answered, false, 'the tick is still drawing: the question row stays');
  assert.equal(techniqueQuestionState(r, { reopenedOn: day }).answered, false, 'Change reopens it');
  assert.equal(techniqueQuestionState(r, { reopenedOn: '2026-09-24' }).answered, true, "yesterday's reopen does not reopen today");
});

test('the evening without a plate asks from 18:00 and not before', () => {
  const q = techniqueQuestionState(served());
  assert.equal(questionOnlyWrap(q, { hour: 17, day }), false);
  assert.equal(questionOnlyWrap(q, { hour: 18, day }), true);
  assert.equal(questionOnlyWrap(null, { hour: 21, day }), false);
});

test('a dismissed wrap stays dismissed', () => {
  const q = techniqueQuestionState(served());
  assert.equal(questionOnlyWrap(q, { hour: 20, day, dismissedOn: day }), false);
  assert.equal(questionOnlyWrap(q, { hour: 20, day, dismissedOn: '2026-09-24' }), true, "yesterday's dismissal is yesterday's");
});

test('an answer from this morning does not resurface as an evening card; one given tonight shows its receipt', () => {
  const q = techniqueQuestionState(served({ outcome: 'tried', result: 'missed' }));
  assert.equal(questionOnlyWrap(q, { hour: 20, day }), false);
  assert.equal(questionOnlyWrap(q, { hour: 20, day, answeredOn: day }), true);
});

test('the evening threshold is the same hour the food wrap uses', () => {
  assert.equal(WRAP_FROM_HOUR, CARD_FROM_HOUR, 'twin of server/lib/wrapDay.js — change both or neither');
});

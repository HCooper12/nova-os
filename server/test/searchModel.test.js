// The search sheet's view model (src/searchModel.js): which mockup-117 frame,
// from what the server answered. Pure; sample text only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFrame, markedParts, noteParas, fmtDay, fmtSecs } from '../../src/searchModel.js';

const row = (o) => ({ id: 'a', title: 'T', type: 'concept', date: '2026-10-12', line: 'the bill carries interest.', marks: [[4, 25]], para: 0, ...o });
const base = { q: 'bill carries interest', reachable: true, total: 214 };

test('marks split the line where the server said, and a mark that does not fit is dropped', () => {
  assert.deepEqual(markedParts('the bill carries interest.', [[4, 25]]).map((p) => [p.text, p.mark]), [['the ', false], ['bill carries interest', true], ['.', false]]);
  assert.deepEqual(markedParts('short', [[2, 99]]), [{ text: 'short', mark: false }]);
});

test('no Mac: the offline frame, whatever else is in hand', () => {
  const f = buildFrame({ ...base, reachable: false, res: { q: base.q, words: { rows: [row()], ms: 5 } }, lastReached: '06:40' });
  assert.equal(f.kind, 'offline');
  assert.equal(f.lastReached, '06:40');
});

test('words paint first: meaning still searching shows its place, not a count', () => {
  const res = { q: base.q, total: 214, words: { rows: [row()], ms: 180 }, meaning: null };
  const f = buildFrame({ ...base, res });
  assert.equal(f.kind, 'results');
  assert.equal(f.meaningState, 'pending');
  assert.match(f.meta, /214 notes · words 0\.18 s · meaning searching/);
});

test('joined: exact rows first, at most two meaning rows before Show all, and the count is real', () => {
  const mean = [1, 2, 3, 4, 5].map((i) => row({ id: `m${i}`, marks: undefined }));
  const res = { q: base.q, total: 214, words: { rows: [row({ id: 'x1' }), row({ id: 'x2' }), row({ id: 'x3' })], ms: 180 }, meaning: { rows: mean, ms: 460, state: 'ok' } };
  const f = buildFrame({ ...base, res });
  assert.equal(f.wordsShown.length, 3);
  assert.equal(f.meaningShown.length, 2);
  assert.equal(f.showAll, 8);
  assert.match(f.meta, /words 0\.18 s · meaning 0\.46 s/);
  const all = buildFrame({ ...base, res, showAll: true });
  assert.equal(all.meaningShown.length, 5);
  assert.equal(all.showAll, 0);
});

test('meaning down says so and never shows a count for it', () => {
  for (const [state, text] of [['no-index', /not been built/], ['embedder-down', /not running/], ['error', /did not answer/]]) {
    const f = buildFrame({ ...base, res: { q: base.q, total: 3, words: { rows: [row()], ms: 110 }, meaning: { rows: [], ms: 1, state } } });
    assert.equal(f.meaningState, 'down');
    assert.match(f.meaningDownText, text);
    assert.match(f.meta, /words only/);
    assert.doesNotMatch(f.meta, /meaning 0/);
  }
});

test('no exact row and nothing by meaning is an answer, not a loading state', () => {
  const f = buildFrame({ ...base, res: { q: base.q, total: 214, words: { rows: [], ms: 150 }, meaning: { rows: [], ms: 410, state: 'ok' } } });
  assert.equal(f.kind, 'results');
  assert.equal(f.words.length, 0);
  assert.equal(f.meaning.length, 0);
});

test('an answer for an older query is marked stale, not passed off as the new one', () => {
  const f = buildFrame({ ...base, q: 'bill carries', res: { q: 'bill', total: 214, words: { rows: [row()], ms: 100 }, meaning: null } });
  assert.equal(f.stale, true);
  assert.match(f.meta, /^Searching/);
});

test('a short query is the Recent frame; a failure that is not the network says what happened', () => {
  assert.equal(buildFrame({ ...base, q: 'b', res: null }).kind, 'recent');
  const f = buildFrame({ ...base, res: { q: base.q, error: { offline: false, message: '/api/recall/notes failed: 500' } } });
  assert.equal(f.kind, 'error');
  assert.match(f.detail, /500/);
});

test('the opened note lights the paragraph that holds the line and marks the phrase; a wrong para is not trusted', () => {
  const paras = ['Skipped effort does not vanish.', 'Every hour you skip gets added to the bill, and the bill carries interest.', 'Small early payments.'];
  const r = row({ line: '…and the bill carries interest.', marks: [[9, 30]], para: 2 });
  const out = noteParas(paras, r);
  assert.deepEqual(out.map((p) => p.lit), [false, true, false]);
  assert.deepEqual(out[1].parts.filter((p) => p.mark).map((p) => p.text), ['bill carries interest']);
  const none = noteParas(['nothing here'], r);
  assert.equal(none.some((p) => p.lit), false);
});

test('days and timings read plainly, and an unreadable date is nothing', () => {
  assert.equal(fmtDay('2026-10-12', new Date('2026-11-17')), '12 Oct');
  assert.equal(fmtDay('2025-03-02', new Date('2026-11-17')), '2 Mar 2025');
  assert.equal(fmtDay('', new Date()), '');
  assert.equal(fmtSecs(460), '0.46 s');
});

// THE LIVING STAGE ON THE PHONE (10 Nov 2026, mockup 114's .ph): the pure
// facts the phone stage is laid out and ordered by, at the mockup's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PH, PHONE_CORE_SCALE, phoneGeometry, phoneOrder, railX, phoneColumns, openTop, capSentence, phoneFace, countWords } from '../../src/phoneStageFacts.js';

test('on the mockup\'s own 402 x 874, the derived numbers are the mockup\'s', () => {
  const g = phoneGeometry(402, 874);
  assert.equal(g.col, 180);
  assert.equal(g.openW, 370);
  assert.equal(g.countAllDy, -438);
  assert.equal(g.dealX, 95);
  assert.equal(g.dealY, 246);
  assert.ok(Math.abs(g.miniScale - 0.5714) < 0.0001);
  assert.ok(Math.abs(g.colScale - 0.6429) < 0.0001);
  assert.ok(Math.abs(PHONE_CORE_SCALE - 0.595) < 0.001);
});

test('his phone and the smallest: the columns fit with the gutters, the count row still lands on the grid', () => {
  for (const [w, h] of [[390, 844], [375, 812]]) {
    const g = phoneGeometry(w, h);
    assert.equal(g.col * 2 + PH.gap + PH.side * 2, w);
    assert.equal(h - PH.countBottom - PH.countH + g.countAllDy, PH.gridTop - PH.countH);
  }
});

test('the newest panel is the hero; the rest wait in the rail, newest first', () => {
  assert.deepEqual(phoneOrder([]), { hero: null, rail: [] });
  assert.deepEqual(phoneOrder(['a']), { hero: 'a', rail: [] });
  assert.deepEqual(phoneOrder(['a', 'b', 'c', 'd']), { hero: 'd', rail: ['c', 'b', 'a'] });
  assert.equal(railX(0), 0);
  assert.equal(railX(2), 340);
});

test('See all: each panel to the shorter column, the left on a tie, dealt from the hero\'s room toward the centre', () => {
  const out = phoneColumns([{ key: 'a', h: 100 }, { key: 'b', h: 60 }, { key: 'c', h: 30 }, { key: 'd', h: 40 }], { dealX: 95, dealY: 246 });
  assert.deepEqual(out.map((o) => [o.key, o.col, o.top]), [['a', 0, 0], ['b', 1, 0], ['c', 1, 70], ['d', 0, 110]]);
  assert.equal(out[0].dx, 95);
  assert.equal(out[1].dx, -95);
  assert.equal(out[0].dy, 246 - 0 - 50);
  assert.equal(out[2].dy, 246 - 70 - 15);
});

test('an opened panel is centred and never higher than 64', () => {
  assert.equal(openTop(300, 874), 287);
  assert.equal(openTop(800, 844), 64);
});

test('the caption is the sentence being said, its spoken words lit, nothing after it', () => {
  assert.deepEqual(capSentence({ lit: 'Morning. Steps have', later: ' landed four days out of seven. Protein was under.' }), { lit: 'Morning. Steps have', rest: ' landed four days out of seven.' });
  assert.deepEqual(capSentence({ lit: 'Two of them need your word.', later: ' Next one.' }), { lit: 'Two of them need your word.', rest: '' });
  assert.deepEqual(capSentence({ lit: '', later: 'Pull day at six, lats first' }), { lit: '', rest: 'Pull day at six, lats first' });
  assert.equal(capSentence(null), null);
  assert.equal(capSentence({ lit: ' ', later: '' }), null);
});

test('the face: rest with nothing, the hero while he is spoken to, everything once the voice has stopped, and his tap wins', () => {
  assert.equal(phoneFace({}), 'rest');
  assert.equal(phoneFace({ turning: true }), 'turn');
  assert.equal(phoneFace({ speaking: true, panels: 3 }), 'hero');
  assert.equal(phoneFace({ panels: 3, held: false }), 'hero');
  assert.equal(phoneFace({ panels: 3, held: true }), 'all');
  assert.equal(phoneFace({ turning: true, panels: 3, held: true }), 'all', 'the reply window keeps what the answer raised');
  assert.equal(phoneFace({ speaking: true, panels: 3, forced: 'all' }), 'all');
  assert.equal(phoneFace({ panels: 3, held: true, forced: 'hero' }), 'hero');
});

test('the count row says what a tap does, in plain words', () => {
  assert.deepEqual(countWords('hero', 1), { from: 'From this answer', act: '' });
  assert.deepEqual(countWords('hero', 4), { from: 'From this answer', act: 'See all 4' });
  assert.deepEqual(countWords('all', 4), { from: 'Everything from this answer', act: 'Show latest' });
});

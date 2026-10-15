// The card Nova says is waiting (15 Oct 2026): the voice presence shows the
// proposal THIS exchange filed, and nothing from an older one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalAfterAsk } from '../../src/vals/valsChrome.js';

const card = (recordId, status = 'pending') => ({ recordId, title: `card ${recordId}`, status });

test('the proposal filed after his words is the one shown', () => {
  const chat = [
    { who: 'you', text: 'move push to Thursday' },
    { who: 'nova', text: 'Card is waiting for your yes.', proposal: card('r1') },
  ];
  assert.equal(proposalAfterAsk(chat, 'move push to Thursday')?.recordId, 'r1');
});

test('an older exchange’s proposal is not this turn’s', () => {
  const chat = [
    { who: 'you', text: 'move push to Thursday' },
    { who: 'nova', text: 'Waiting on you.', proposal: card('r1') },
    { who: 'you', text: 'how did I sleep' },
    { who: 'nova', text: 'Seven hours.' },
  ];
  assert.equal(proposalAfterAsk(chat, 'how did I sleep'), null);
});

test('the newest of several', () => {
  const chat = [
    { who: 'you', text: 'plan my week' },
    { who: 'nova', text: 'One.', proposal: card('a', 'done') },
    { who: 'nova', text: 'Two.', proposal: card('b') },
  ];
  assert.equal(proposalAfterAsk(chat, 'plan my week')?.recordId, 'b');
});

test('nothing to show without an ask, a chat, or a record id', () => {
  assert.equal(proposalAfterAsk([], 'x'), null);
  assert.equal(proposalAfterAsk(null, 'x'), null);
  assert.equal(proposalAfterAsk([{ who: 'you', text: 'x' }, { who: 'nova', text: 'y', proposal: { title: 't' } }], 'x'), null);
  assert.equal(proposalAfterAsk([{ who: 'you', text: 'x' }], ''), null);
});

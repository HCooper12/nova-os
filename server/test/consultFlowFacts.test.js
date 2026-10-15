import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultNodes, consultCaption, MAX_NODES } from '../../src/motion/consultFlowFacts.js';
import { publishConsult, consultOf, subscribeConsult, watchConsult } from '../../src/motion/consultFeed.js';

// the roster lib/consult.js keeps on a job (runConsults' entries)
const ask = (agent, state = 'asking', round = 1, label) => ({ agent, state, round, label: label ?? { researcher: 'the Researcher', calendar: 'your calendar', librarian: 'the Librarian', nova: 'Nova' }[agent], question: 'q' });

test('no roster, no map: nothing is drawn without a real consult', () => {
  assert.deepEqual(consultNodes(null), []);
  assert.deepEqual(consultNodes([]), []);
  assert.equal(consultCaption([]), '');
});

test('one node per agent, standing as its latest ask stands, each in its own name', () => {
  const n = consultNodes([ask('researcher', 'done'), ask('calendar'), ask('researcher', 'asking', 2)]);
  assert.deepEqual(n.map((x) => [x.agent, x.state, x.name]), [['calendar', 'asking', 'Calendar'], ['researcher', 'asking', 'Researcher']]);
  assert.equal(n.find((x) => x.agent === 'calendar').code, true, 'the calendar is read by code');
  assert.equal(consultNodes([ask('a'), ask('b'), ask('c'), ask('d'), ask('e')].map((x) => ({ ...x, label: 'x' }))).length, MAX_NODES);
});

test('the caption says what is happening, in code\'s words', () => {
  assert.equal(consultCaption(consultNodes([ask('researcher')])), 'Coach is asking the Researcher.');
  assert.equal(consultCaption(consultNodes([ask('calendar')])), 'Coach is checking your calendar.');
  assert.equal(consultCaption(consultNodes([ask('researcher'), ask('calendar')])), 'Coach is asking the Researcher and checking your calendar.');
  assert.equal(consultCaption(consultNodes([ask('researcher', 'done'), ask('librarian')])), 'The Researcher answered. Still asking the Librarian.');
  assert.equal(consultCaption(consultNodes([ask('researcher', 'done')])), 'The Researcher answered. Coach is writing to you.');
  assert.equal(consultCaption(consultNodes([ask('researcher'), ask('calendar', 'done')])), 'Checked your calendar. Still asking the Researcher.');
  assert.equal(consultCaption(consultNodes([ask('researcher', 'done'), ask('librarian', 'done'), ask('calendar', 'done')])), 'The Researcher and the Librarian both answered. Checked your calendar. Coach is writing to you.');
  assert.equal(consultCaption(consultNodes([ask('researcher', 'done'), ask('librarian', 'failed')])), 'The Researcher answered. The Librarian could not answer. Coach is writing to you with what came back.');
  for (const c of [consultCaption(consultNodes([ask('researcher'), ask('librarian', 'done')]))]) assert.ok(!/[—–]/.test(c), 'no dashes in his copy');
});

test('the feed: a poll publishes its roster, and a poll that ends clears it', () => {
  let heard = 0;
  const off = subscribeConsult(() => { heard += 1; });
  let h = null;
  const poller = watchConsult('coach', { onReady() {}, onError() {} }, (handlers) => { h = handlers; return { cancel() {} }; });
  h.onProgress({ consult: [ask('researcher')] });
  assert.equal(consultOf('coach')[0].agent, 'researcher');
  h.onProgress({ consult: [ask('researcher')] });
  assert.equal(heard, 1, 'the same roster polled twice is no change');
  h.onProgress({ consult: [ask('researcher', 'done')] });
  assert.equal(heard, 2);
  h.onReady({ result: {} });
  assert.equal(consultOf('coach'), null, 'an answered turn draws nothing');
  h.onProgress({ consult: [ask('calendar')] });
  poller.cancel();
  assert.equal(consultOf('coach'), null, 'a cancelled poll draws nothing');
  publishConsult('coach', [ask('nova')]);
  h.onError('boom');
  assert.equal(consultOf('coach'), null, 'a failed turn draws nothing');
  off();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReply } from '../../src/vals/valsChrome.js';

test('the phone stage reply never shows a raw artifact token', () => {
  assert.equal(cleanReply('Here is the plan.\n[[artifact:abc-1234]]\nDone.'), 'Here is the plan.\nDone.');
  assert.ok(!/artifact/.test(cleanReply('Filed it [[artifact:pending]] for you.')));
  assert.equal(cleanReply(''), '');
});

// THE CLAUDE LIMIT IS NOT AN ANSWER (25 Sep 2026). At 10:12 AEST his Coach
// question came back as "You've hit your session limit · resets 11am
// (Australia/Melbourne)", shown in Coach's own bubble, twice, and he retyped
// the question at 11:01. The CLI's own words are recognised as a state of
// the account, so the lane says so plainly and hands his question back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { usageLimitNotice } from '../lib/claudeCode.js';

test('the Claude usage limit is a state of the account, never Coach\'s answer', () => {
  assert.equal(usageLimitNotice("You've hit your session limit · resets 11am (Australia/Melbourne)"),
    "Claude's usage limit is reached for now; it resets at 11am. Nothing was answered and nothing was lost: ask again after that.");
  assert.equal(usageLimitNotice('Your rep limit resets each block, so keep the sets honest.'), null, 'an answer about limits is still an answer');
  assert.equal(usageLimitNotice(`${'A long coaching answer. '.repeat(20)}You've hit your session limit`), null, 'only a reply that is nothing but the notice');
});

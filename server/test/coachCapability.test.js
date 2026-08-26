// Coach told him "I don't have write access in this session — no file-editing
// tool is available to me". True about its TOOLS, and beside the point: Coach
// changes the program by PROPOSING a typed edit he accepts. The prompt only
// ships on turn 1, and his conversation persists for days, so a session
// started under older rules kept refusing. These pin the correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachPrompt } from '../lib/claudeCode.js';

test('the Coach prompt states plainly that it CAN change the program', () => {
  const p = buildCoachPrompt({ question: 'swap spider curl', context: '' });
  assert.match(p, /PROPOSE/, 'the mechanism is named');
  assert.match(p, /never tell him you are unable to edit it/i, 'and refusing is explicitly forbidden');
});

test('the prompt no longer sends him to the Inbox to say yes', () => {
  const p = buildCoachPrompt({ question: 'swap spider curl', context: '' });
  assert.match(p, /APPLY IT/, 'he accepts it on the reply itself');
  assert.doesNotMatch(p, /approve it in your Inbox/i, 'the detour is what made Coach look incapable');
});

test('it still refuses to claim a change is already made', () => {
  const p = buildCoachPrompt({ question: 'swap spider curl', context: '' });
  assert.match(p, /never claim it's already done/i, 'models decide, code acts — and only after his yes');
});

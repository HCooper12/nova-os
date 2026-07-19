import test from 'node:test';
import assert from 'node:assert/strict';

const { NOVA_LENS } = await import('../lib/lens.js');
const { buildAskPrompt, buildCoachPrompt, buildQuickSessionPrompt } = await import('../lib/claudeCode.js');
const { buildResearchPrompt } = await import('../lib/researcher.js');
const { buildOutlinePrompt } = await import('../lib/studio.js');

test('the operating lens is a tight, principle-based spine', () => {
  assert.match(NOVA_LENS, /GROUND IN REAL DATA/);
  assert.match(NOVA_LENS, /THINK ACROSS DOMAINS/);
  assert.match(NOVA_LENS, /PROPOSE, DON'T IMPOSE/);
  assert.ok(NOVA_LENS.length < 1600, 'the lens rides on every prompt — it must stay tight');
});

test('every model-based agent reasons through the same lens', () => {
  const prompts = [
    buildAskPrompt({ question: 'q', context: 'c' }),
    buildCoachPrompt({ question: 'q', context: 'c' }),
    buildQuickSessionPrompt({ minutes: 30, note: '', context: 'c' }),
    buildResearchPrompt('q'),
    buildOutlinePrompt({ relPath: 'Wiki/Studio/Ideas/X.md', title: 'X', raw: '# X' }, 'short'),
  ];
  for (const p of prompts) {
    assert.ok(p.startsWith('NOVA OPERATING LENS'), 'lens leads the prompt');
    assert.match(p, /GROUND IN REAL DATA/);
  }
});

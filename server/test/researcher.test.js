import test from 'node:test';
import assert from 'node:assert/strict';

const { buildResearchPrompt, normalizeResearch } = await import('../lib/researcher.js');

test('research prompt demands citations, honesty about gaps, and typed JSON', () => {
  const p = buildResearchPrompt('optimal protein timing around training');
  assert.match(p, /numbered citation/);
  assert.match(p, /could NOT establish/);
  assert.match(p, /optimal protein timing around training/);
  assert.match(p, /"title"/);
});

test('normalize refuses unsourced briefs and incomplete output', () => {
  const good = normalizeResearch({
    title: 'Protein Timing',
    body: 'Summary [1].\n\n- Point [1]\n\n## Sources\n1. Study — https://example.org',
  });
  assert.equal(good.title, 'Protein Timing');

  assert.throws(() => normalizeResearch({ title: 'X', body: 'claims with no citations at all, no sources section' }), /missing citations/);
  assert.throws(() => normalizeResearch({ title: '', body: 'x [1] ## Sources' }), /incomplete/);
});

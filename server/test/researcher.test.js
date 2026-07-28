import test from 'node:test';
import assert from 'node:assert/strict';

const { buildResearchPrompt, normalizeResearch, parseResearchDirective } = await import('../lib/researcher.js');

test('parseResearchDirective extracts and strips; junk degrades honestly', () => {
  const ok = parseResearchDirective('On it — takes a couple of minutes.\n\nRESEARCH {"question":"creatine timing evidence"}');
  assert.equal(ok.cleanText, 'On it — takes a couple of minutes.');
  assert.deepEqual(ok.research, { question: 'creatine timing evidence' });

  assert.equal(parseResearchDirective('No directive here.').research, null);
  assert.equal(parseResearchDirective('Reply.\nRESEARCH {"question":""}').research, null, 'empty question rejected');
  assert.equal(parseResearchDirective('Reply.\nRESEARCH {broken').research, null);
});

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

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildResearchPrompt, normalizeResearch, parseResearchDirective } = await import('../lib/researcher.js');

test('parseResearchDirective extracts and strips; junk degrades honestly', () => {
  const ok = parseResearchDirective('On it — takes a couple of minutes.\n\nRESEARCH {"question":"creatine timing evidence"}');
  assert.equal(ok.cleanText, 'On it — takes a couple of minutes.');
  assert.deepEqual(ok.research, { question: 'creatine timing evidence', when: 'now' });

  const tonight = parseResearchDirective('Queued.\nRESEARCH {"question":"zone 2 volume","when":"tonight"}');
  assert.deepEqual(tonight.research, { question: 'zone 2 volume', when: 'tonight' });
  const junkWhen = parseResearchDirective('Ok.\nRESEARCH {"question":"x y z q","when":"whenever"}');
  assert.equal(junkWhen.research.when, 'now', 'unknown when degrades to now, never invents a schedule');

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


test('the citation gate checks integrity: every cited number resolves to a source with a URL', async () => {
  const { checkCitations, normalizeResearch } = await import('../lib/researcher.js');
  const good = 'Creatine raises strength [1] and is safe long-term [2].\n\n## Sources\n[1] Kreider 2017 — https://example.org/kreider\n[2] ISSN position stand — https://example.org/issn';
  assert.deepEqual(checkCitations(good), { cited: [1, 2], entries: [1, 2], missing: [], withoutUrl: [], ok: true });
  assert.equal(normalizeResearch({ title: 'Creatine', body: good }).title, 'Creatine');
  // a claim pointing at nothing
  const dangling = good.replace('[2].', '[2]. It also aids sleep [3].');
  assert.throws(() => normalizeResearch({ title: 'x', body: dangling }), /cites \[3\] but its Sources list has no such entry/);
  // a source he cannot open
  const noUrl = good.replace(' — https://example.org/issn', '');
  assert.throws(() => normalizeResearch({ title: 'x', body: noUrl }), /source \[2\] carries no URL/);
  // the old shallow pass: one "[1]" and the word "sources" with nothing behind it
  assert.throws(() => normalizeResearch({ title: 'x', body: 'Claim [1]. See sources below.' }), /missing citations/);
  // numbered-list sources are read too
  const numbered = 'Fact [1].\n\nSources\n1. Title — https://example.org/a';
  assert.equal(checkCitations(numbered).ok, true);
});

test('a plan handoff rides the prompt as MATERIAL, and is absent when there is none', () => {
  const plain = buildResearchPrompt('Is creatine safe long-term?');
  assert.ok(!plain.includes('MATERIAL FROM AN EARLIER AGENT'));
  const withContext = buildResearchPrompt('Check these claims', 'Claim 1: 3-minute rests for strength.');
  assert.ok(withContext.includes('MATERIAL FROM AN EARLIER AGENT'));
  assert.ok(withContext.includes('Claim 1: 3-minute rests'));
  assert.ok(withContext.indexOf('The question:') < withContext.indexOf('MATERIAL FROM'), 'question first, then what it refers to');
});

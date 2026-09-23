// THE PANEL — several named researchers on one question, then one merge.
//
// His ask, 18 Sep: "happy for extra agents to complete parallel research
// that'll lead to better results and answers and data." The gain is only real
// if the angles differ — four copies of the same agent run the same searches
// and cost four times as much for the same brief. So the rules that keep them
// different, and the rules that stop the merge inventing anything, are pinned
// here. None of it needs a child process.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEF_RULES, DECISION_RULES, FALLBACK_PANEL, MIN_WORKERS, MAX_WORKERS, MAX_NAME,
  buildPlannerPrompt, parsePanel, buildWorkerPrompt, parseFindings,
  buildSynthesisPrompt, panelProgress,
} from '../lib/researchPanel.js';

test('THE RULES HAVE ONE HOME — the single agent and the merge say the same thing', async () => {
  // A shared format is a contract: two copies of the brief rules would drift
  // the first time one was edited, and the panel path would quietly stop
  // demanding citations or stop being allowed to answer no.
  const { buildResearchPrompt } = await import('../lib/researcher.js');
  const single = buildResearchPrompt('Should I do X?');
  const merged = buildSynthesisPrompt('Should I do X?', [{ name: 'A', findings: [{ claim: 'c', url: 'https://e.com' }] }]);
  for (const rules of [BRIEF_RULES, DECISION_RULES]) {
    assert.ok(single.includes(rules), 'the single-agent path lost a shared rule block');
    assert.ok(merged.includes(rules), 'the merge lost a shared rule block');
  }
});

test('the planner is told to include an angle that looks for disagreement', () => {
  // The failure this prevents: a panel of four confirmers, which is worse
  // than one researcher because it launders one view as four.
  const p = buildPlannerPrompt('Is creatine worth it?');
  assert.match(p, /disagreement|counter-evidence|case against/i);
  assert.match(p, /must not overlap/i, 'nothing stops two workers running identical searches');
  assert.match(p, /panel that only confirms is a panel that wastes his money/i);
  assert.match(p, /never "Researcher 2"/, 'the names are not required to be readable');
});

test('parsePanel keeps what is usable and refuses what is not', () => {
  const ok = parsePanel('[{"name":"Direct evidence","brief":"find studies"},{"name":"The case against","brief":"find critics"}]');
  assert.equal(ok.length, 2);
  assert.deepEqual(ok[0], { name: 'Direct evidence', brief: 'find studies' });

  // two workers with one name is one worker
  const dup = parsePanel([
    { name: 'Evidence', brief: 'a' }, { name: 'evidence', brief: 'b' }, { name: 'Against', brief: 'c' },
  ]);
  assert.equal(dup.length, 2);

  // capped, so a planner that names nine angles cannot spawn nine children
  const many = parsePanel(Array.from({ length: 9 }, (_, i) => ({ name: `Angle ${i}`, brief: 'x' })));
  assert.equal(many.length, MAX_WORKERS);

  // below the floor, or unusable — the caller falls back rather than running a
  // "panel" of one
  assert.equal(parsePanel('[{"name":"Only one","brief":"x"}]'), null);
  assert.equal(parsePanel('I think we should look at three angles…'), null);
  assert.equal(parsePanel(null), null);
  assert.equal(parsePanel([{ name: 'No brief' }, { brief: 'no name' }]), null);
});

test('a long name is cut on a word, because mid-word looks broken not short', () => {
  // the first real planner run named an angle "Individual Variability & Side
  // Effects", and a hard slice left "Individual Variability & Side Effe" in
  // his job tray — which reads as a bug, not as an abbreviation
  const real = parsePanel([
    { name: 'Individual Variability & Side Effects', brief: 'a' }, { name: 'Second', brief: 'b' },
  ]);
  assert.equal(real[0].name, 'Individual Variability & Side');
  assert.ok(real[0].name.length <= MAX_NAME);
  // never left dangling on a connective
  const dangling = parsePanel([
    { name: 'Demand signals and market rankings and more', brief: 'a' }, { name: 'Second', brief: 'b' },
  ]);
  assert.doesNotMatch(dangling[0].name, /\s(and|or|the|of|in|for|with)$|[&,+/-]$/i);
  // a single unbreakable word still has to fit
  const oneWord = parsePanel([
    { name: 'x'.repeat(200), brief: 'a' }, { name: 'Second', brief: 'b' },
  ]);
  assert.equal(oneWord[0].name.length, MAX_NAME);
});

test('the fallback panel is a real panel, and covers the angle one agent skips', () => {
  assert.ok(FALLBACK_PANEL.length >= MIN_WORKERS && FALLBACK_PANEL.length <= MAX_WORKERS);
  const names = FALLBACK_PANEL.map((w) => w.name.toLowerCase()).join(' ');
  assert.match(names, /against/, 'even the fallback must contain a dissenting angle');
  for (const w of FALLBACK_PANEL) {
    assert.ok(w.name && w.brief && w.brief.length > 40, `thin fallback angle: ${w.name}`);
  }
  // it must survive its own parser, or the fallback is a second bug
  assert.equal(parsePanel(FALLBACK_PANEL).length, FALLBACK_PANEL.length);
});

test('a worker is told to FIND, not to conclude, and that a URL is the price', () => {
  const p = buildWorkerPrompt('Is creatine worth it?', { name: 'The case against', brief: 'find critics' });
  assert.match(p, /The case against/);
  assert.match(p, /find critics/);
  assert.match(p, /EVERY finding carries the URL/i);
  assert.match(p, /do not reach a verdict/i, 'workers will each write their own verdict');
  assert.match(p, /Stay on your angle/i);
  // an empty angle is a finding, not a failure — the merge needs to know
  assert.match(p, /no credible evidence found for X" is a genuinely useful finding/i);
});

test('findings without a usable URL are dropped HERE, not at the citation gate', () => {
  // The gate rejects the WHOLE brief for one bad citation. Dropping the line
  // early costs one finding instead of the entire run.
  const got = parseFindings({
    findings: [
      { claim: 'good', url: 'https://example.com/a', note: 'solid' },
      { claim: 'no url' },
      { claim: 'bad scheme', url: 'javascript:alert(1)' },
      { claim: 'relative', url: '/local/thing' },
      { url: 'https://example.com/b' },
      'not an object',
    ],
  });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { claim: 'good', url: 'https://example.com/a', note: 'solid' });
  assert.deepEqual(parseFindings('nonsense'), []);
  assert.deepEqual(parseFindings(null), []);
});

test('THE MERGE CANNOT GO SHOPPING — only the URLs the panel reported', () => {
  const p = buildSynthesisPrompt('Q?', [
    { name: 'Direct evidence', findings: [{ claim: 'a', url: 'https://one.example', note: 'RCT' }] },
    { name: 'The case against', findings: [{ claim: 'b', url: 'https://two.example' }] },
  ]);
  assert.match(p, /Use ONLY the URLs above/);
  assert.match(p, /one unrecoverable failure/i);
  assert.match(p, /Merge, do not concatenate/);
  assert.match(p, /the same URL cited twice gets ONE number/i);
  // disagreement is the payload, not an inconvenience to average away
  assert.match(p, /disagreement is the most valuable thing/i);
  assert.ok(p.includes('https://one.example') && p.includes('https://two.example'));
});

test('a failed angle is named in the brief, never silently dropped', () => {
  const p = buildSynthesisPrompt('Q?', [
    { name: 'Direct evidence', findings: [{ claim: 'a', url: 'https://one.example' }] },
    { name: 'What is current', error: 'timed out' },
  ]);
  assert.match(p, /THIS RESEARCHER FAILED — timed out/);
  assert.match(p, /What is current.*produced nothing/s);
  assert.match(p, /a gap he does not know about is worse than one he does/i);
});

test('progress says how many are BACK, counting a failure as back', () => {
  // "3 of 4 done" would hide a failure; he is owed the difference between an
  // angle that answered and an angle that died.
  const p = panelProgress([
    { name: 'A', status: 'done', found: 6 },
    { name: 'B', status: 'error' },
    { name: 'C', status: 'working' },
  ]);
  assert.equal(p.total, 3);
  assert.equal(p.back, 2);
  assert.equal(p.label, '2 of 3 back');
  assert.deepEqual(p.workers.map((w) => w.status), ['done', 'error', 'working']);
  assert.equal(p.workers[0].found, 6);
  assert.equal(panelProgress([]).label, '');
  assert.equal(panelProgress(null).total, 0);
});

test('the searching workers stay on the cheaper tier', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'researcher.js',
  ), 'utf8');
  // the four searching workers are well-specified extraction, not judgment —
  // they must not quietly drift onto the expensive tier
  assert.match(src, /const WORKER_MODEL = 'sonnet';/,
    'the four searching workers are no longer pinned to the cheaper tier');
});

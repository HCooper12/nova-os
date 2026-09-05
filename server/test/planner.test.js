// The planner's pure halves — the prompt it is given, and what it is allowed
// to come back with.
//
// Everything with consequences lives in plan.js and is tested there. What is
// tested here is the boundary: that the planner is never told about an agent
// that does not exist, that a malformed reply fails closed rather than
// producing half a plan, and that a step's input can carry an earlier step's
// output without any agent needing to know a plan exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerPrompt, parsePlan, interpolate, extractFirstUrl, parseTitleAuthor, clampQuestion, buildReportPrompt } from '../lib/planner.js';
import { DELEGABLE_IDS, CAPABILITIES } from '../lib/capabilities.js';
import { validatePlan, MAX_PLAN_USD, MAX_STEPS } from '../lib/plan.js';

test('the planner is only ever offered agents that exist', () => {
  const prompt = buildPlannerPrompt('watch this and check it');
  for (const id of DELEGABLE_IDS) assert.ok(prompt.includes(id), `prompt omits ${id}`);
  // the two that are reachable but never delegated must not appear as options
  assert.ok(!prompt.includes('(Coach)'), 'Coach must not be offered to the planner');
  assert.ok(!prompt.includes('(Claude Code)'), 'the code lane must not be offered to the planner');
});

test('the prompt states both ceilings, so the model is not guessing at them', () => {
  const prompt = buildPlannerPrompt('do a thing');
  assert.ok(prompt.includes(`$${MAX_PLAN_USD}`));
  assert.ok(prompt.includes(`${MAX_STEPS} steps`));
});

test('the prompt tells it to report a shortfall rather than invent a step', () => {
  // this is the behaviour he asked for: say what would be needed
  assert.match(buildPlannerPrompt('x'), /DO NOT invent a step/);
  assert.match(buildPlannerPrompt('x'), /"cannot"/);
});

test('a clean reply parses into steps with execution fields initialised', () => {
  const plan = parsePlan('{"steps":[{"id":"s1","capability":"watch","what":"pull it","input":"https://y/v","needs":[]}],"cannot":"","report":"answer him"}');
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].status, 'waiting');
  assert.equal(plan.steps[0].recordId, null);
  assert.equal(plan.report, 'answer him');
});

test('a reply wrapped in commentary still parses', () => {
  const plan = parsePlan('Sure — here is the plan:\n{"steps":[{"id":"a","capability":"research"}],"cannot":""}\nHope that helps.');
  assert.equal(plan.steps[0].capability, 'research');
});

test('an unparseable reply fails closed', () => {
  assert.equal(parsePlan('I could not do that'), null);
  assert.equal(parsePlan('{ broken'), null);
  assert.equal(parsePlan(''), null);
});

test('a reply with no steps but a "cannot" survives, so he still gets told', () => {
  const plan = parsePlan('{"steps":[],"cannot":"nothing here reads a PDF you have not given me"}');
  assert.deepEqual(plan.steps, []);
  assert.match(plan.cannot, /reads a PDF/);
  // and the validator turns it into a refusal rather than a run
  assert.equal(validatePlan(plan).ok, false);
});

test('a step can be handed an earlier step\'s output without any agent knowing', () => {
  assert.equal(interpolate('check {{s1}} against the literature', { s1: 'CLAIMS' }), 'check CLAIMS against the literature');
  // an unresolved reference is left visible rather than replaced with "undefined"
  assert.equal(interpolate('check {{s9}}', { s1: 'x' }), 'check {{s9}}');
  assert.equal(interpolate('', {}), '');
});

test('dispatch helpers read what the lanes need out of a free-text input', () => {
  assert.equal(extractFirstUrl('watch https://youtu.be/abc please'), 'https://youtu.be/abc');
  assert.equal(extractFirstUrl('no link here'), null);
  assert.deepEqual(parseTitleAuthor('Atomic Habits by James Clear'), { title: 'Atomic Habits', author: 'James Clear' });
  assert.equal(parseTitleAuthor('Atomic Habits'), null);
  assert.equal(clampQuestion('x'.repeat(900)).length, 500, 'the Researcher refuses questions over 500 chars');
});

test('the report is told the coverage, and told to lead with it when short', () => {
  const plan = {
    report: 'where is it overstating',
    steps: [
      { id: 's1', capability: 'watch', what: 'pull it', status: 'done', output: 'TRANSCRIPT' },
      { id: 's2', capability: 'research', what: 'check it', status: 'failed', error: 'no sources found' },
    ],
  };
  const prompt = buildReportPrompt('watch and check this', plan, { coverage: '1 of 2 steps completed' });
  assert.match(prompt, /1 of 2 steps completed/);
  assert.match(prompt, /COVERAGE IS A FINDING/);
  assert.match(prompt, /FAILED: no sources found/, 'a failed step is shown to the reporter, not hidden');
  assert.match(prompt, /Watcher/, 'outputs are attributed to the agent that produced them');
});

test('every delegable capability has a dispatcher clause in the planner', async () => {
  // the pairing that would otherwise rot: a capability marked delegable with
  // nothing able to start it
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../lib/planner.js', import.meta.url), 'utf8'));
  for (const id of DELEGABLE_IDS) {
    assert.ok(src.includes(`step.capability === '${id}'`), `no dispatcher for delegable capability "${id}"`);
    assert.ok(CAPABILITIES[id], `${id} vanished from the registry`);
  }
});

// --- The handoff. Found by the first real plan (7bf8cee7, 5 Sep): the
// Researcher's brief was titled "Watcher Claims Not Received" because the
// planner wrote the dependency in prose, not as {{s1}}, and the step output
// it would have received was a title line anyway.
import { handoffFor, stripPlaceholders, summarise } from '../lib/planner.js';

test('a declared need is handed over even when the plan forgot the placeholder', () => {
  const step = { id: 's2', input: 'Check the claims from the Watcher\'s verdict against the literature', needs: ['s1'] };
  const out = handoffFor(step, { s1: 'Claim 1: heavy loads for strength. Claim 2: 6-12 reps for size.' });
  assert.ok(out.startsWith('FROM S1:\n'));
  assert.ok(out.includes('Claim 2'));
});

test('an already-interpolated need is not handed over twice — unless the lane takes context separately', () => {
  const step = { id: 's2', input: 'Check {{s1}} against the literature', needs: ['s1'] };
  assert.equal(handoffFor(step, { s1: 'verdict' }), '', 'inline lanes already have it in the input');
  assert.equal(handoffFor(step, { s1: 'verdict' }, { all: true }), 'FROM S1:\nverdict');
});

test('a need whose step produced nothing is skipped, not handed over as "undefined"', () => {
  assert.equal(handoffFor({ id: 's3', input: 'x', needs: ['s1', 's2'] }, { s2: 'only this' }), 'FROM S2:\nonly this');
});

test('the Researcher\'s question loses its placeholders but keeps its sense', () => {
  assert.equal(stripPlaceholders('Compare {{s1}} against the research, and {{ s2 }}.'), 'Compare against the research, and.');
  assert.equal(stripPlaceholders('   plain   '), 'plain');
});

test('what one agent hands the next is the substance, not the headline', () => {
  const watcher = { text: 'Watch: https://x — instruction', decision: { title: 'Solid Physiology, One Outdated Claim', payload: { title: 't', body: '**Verdict:** rest periods claim is outdated…' } } };
  const out = summarise(watcher);
  assert.ok(out.includes('rest periods claim is outdated'), 'the payload body must travel');
  assert.ok(!out.includes('Watch: https://x'), 'the instruction echo is noise once there is a body');
  // no body at all: fall back to the record's own words rather than nothing
  assert.equal(summarise({ text: 'Research: q', decision: { title: 'T' } }), 'T\nResearch: q');
});

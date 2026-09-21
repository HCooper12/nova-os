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
import { buildPlannerPrompt, parsePlan, interpolate, extractFirstUrl, parseTitleAuthor, clampQuestion, buildReportPrompt, fallbackReport } from '../lib/planner.js';
import { DELEGABLE_IDS, CAPABILITIES } from '../lib/capabilities.js';
import { validatePlan, planProgress, MAX_PLAN_USD, MAX_STEPS } from '../lib/plan.js';

test('the planner is only ever offered agents that exist', () => {
  const prompt = buildPlannerPrompt('watch this and check it');
  for (const id of DELEGABLE_IDS) assert.ok(prompt.includes(id), `prompt omits ${id}`);
  // the Coach is offered since 21 Sep (capabilities.test.js says why); the
  // code lane can alter the machinery running the plan and never is
  assert.ok(prompt.includes('(Coach)'), 'the Coach is offered to the planner');
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


// 6 Sep 2026: approving a FINISHED plan re-ran it, because the report was a
// bare title/body the filer could not file. The report is now a fileable note.
import { reportDecision, reportTitle } from '../lib/planner.js';
test('the report decision is a note the inbox filer understands', () => {
  const d = reportDecision('Watch X then check each claim', '**Both steps completed.** …');
  assert.equal(d.route, 'note');
  assert.equal(d.confidence, 'high');
  assert.ok(d.title.startsWith('Report: Watch X'));
  assert.equal(d.payload.title, d.title);
  assert.equal(d.payload.body, '**Both steps completed.** …');
});

test('the report title drops the goal\'s URL — it becomes the vault filename', () => {
  assert.equal(reportTitle('Watch https://www.youtube.com/watch?v=abc and list every claim'), 'Report: Watch and list every claim');
  assert.equal(reportTitle('https://x.y/z — compare the claims'), 'Report: compare the claims');
  assert.equal(reportTitle(''), 'Report: plan');
});

// WHAT HE COMES BACK TO WHEN THE SUMMARY DOES NOT ARRIVE.
//
// The old failure path said "losing the synthesis must not lose the work" in a
// comment and then left the record pending with an error, no decision and no
// finishedAt — so the steps that HAD run became invisible and Home showed
// nothing. He walked away for an hour and came back to an error message.
const PARTIAL = { steps: [
  { id: 's1', capability: 'research', what: 'find the suppliers', status: 'done', output: 'Three: A, B and C.' },
  { id: 's2', capability: 'research', what: 'read their terms', status: 'failed', error: 'the site refused' },
  { id: 's3', capability: 'write', what: 'write it up', status: 'skipped', error: 'it needed s2, which produced nothing' },
] };

test('a failed write-up still delivers the work that landed', () => {
  const r = fallbackReport('find me three suppliers', PARTIAL, planProgress(PARTIAL), 'the model timed out');
  assert.match(r, /could not write up the summary/);
  assert.match(r, /the model timed out/);
  assert.match(r, /Coverage: 1 of 3 steps completed \(1 failed, 1 skipped for want of them\)/);
  assert.match(r, /Three: A, B and C\./, 'the step that DID run is in his hands');
  assert.match(r, /Failed: the site refused/);
  assert.match(r, /Did not run — it needed s2, which produced nothing/);
});

test('nothing getting through reads as nothing, never as a thin answer', () => {
  const none = { steps: [
    { id: 's1', capability: 'research', what: 'find them', status: 'failed', error: 'the site refused' },
    { id: 's2', capability: 'write', what: 'write it up', status: 'skipped', error: 'it needed s1, which produced nothing' },
  ] };
  const r = fallbackReport('find me three suppliers', none, planProgress(none), 'no step produced anything');
  assert.match(r, /^None of this came back, sir\./);
  assert.match(r, /Nothing below is an answer/);
  assert.match(r, /Coverage: 0 of 2 steps completed/);
});

test('the report prompt tells a skipped step apart from an empty one', () => {
  const p = buildReportPrompt('find me three suppliers', PARTIAL, planProgress(PARTIAL));
  assert.match(p, /FAILED: the site refused/);
  assert.match(p, /DID NOT RUN: it needed s2, which produced nothing/);
  // "(no output)" would read as "it ran and found nothing", which is a claim
  assert.ok(!p.includes('write it up\n(no output)'), 'a skipped step never reads as an empty result');
  assert.match(p, /DID NOT RUN found nothing because nobody looked/);
});

// --- 21 Sep 2026: the plan that could not see his program, and the
// correction that went nowhere. What a plan inherits, what it is told, and
// how a corrected plan carries the old one's work.
import { inheritedFrom, inheritedText, amendPlan, reportDecision as reportDecision2, missingInputsNote } from '../lib/planner.js';
import { costLine } from '../lib/plan.js';

test('the planner is told about the Coach and the dossier, and that his data goes through them', () => {
  const p = buildPlannerPrompt('review my program');
  assert.match(p, /program \(Program dossier\)/);
  assert.match(p, /coach \(Coach\)/);
  assert.match(p, /HIS OWN DATA FIRST/);
  assert.match(p, /Reading his own data is never in "cannot"/);
  assert.match(p, /never trim a plan to save money/);
});

test('a plan built on finished work is told what is already in hand', () => {
  const p = buildPlannerPrompt('now judge it against my program', { inherited: [{ label: 'Researcher — volume evidence', output: 'Weekly sets per muscle is the unit that matters.' }] });
  assert.match(p, /MATERIAL ALREADY IN HAND/);
  assert.match(p, /do not commission it again/);
  assert.match(p, /Researcher — volume evidence: Weekly sets per muscle/);
  assert.doesNotMatch(buildPlannerPrompt('x'), /MATERIAL ALREADY IN HAND/);
});

test('what a finished plan hands on: every done step by agent and task, and its report', () => {
  const rec = {
    goal: 'Review my program', finishedAt: '2026-09-21T01:37:16Z',
    plan: { steps: [
      { id: 's1', capability: 'research', what: 'volume evidence', status: 'done', output: 'brief one' },
      { id: 's2', capability: 'research', what: 'split evidence', status: 'failed', output: null },
    ] },
    decision: { payload: { body: 'THE REPORT' } },
  };
  const held = inheritedFrom(rec);
  assert.deepEqual(held.map((m) => m.label), ['Researcher — volume evidence', "Nova's report on \"Review my program\""]);
  assert.equal(held[0].output, 'brief one');
  const text = inheritedText({ inherited: held });
  assert.match(text, /FROM EARLIER WORK — Researcher — volume evidence:\nbrief one/);
  assert.match(text, /FROM EARLIER WORK — Nova's report/);
  assert.equal(inheritedText({}), '');
});

test('the report is told to end in concrete changes he can act on by saying so', () => {
  const p = buildReportPrompt('review my program', { steps: [], report: '' }, { coverage: '2 of 2 steps completed' });
  assert.match(p, /## What I would change/);
  assert.match(p, /which routine, which exercise, which number/);
  assert.match(p, /"make all of them"/);
  assert.match(p, /THE REPORT IS ABOUT HIM/);
});

test('the report card says what approve does and that the conversation already has it', () => {
  const d = reportDecision2('review my program', 'body');
  assert.match(d.reason, /^Approve = keep this report/);
  assert.match(d.reason, /already in Nova's and the Coach's context/);
});

test('a step with SOME of its inputs runs and is told what is missing; with none it skips', () => {
  const plan = { steps: [
    { id: 's1', capability: 'program', what: 'his program', status: 'done' },
    { id: 's2', capability: 'research', what: 'the gaps', status: 'failed', error: 'brief cites [19] but its Sources list has no such entry' },
    { id: 's3', capability: 'coach', what: 'review it', needs: ['s1', 's2'], missing: ['s2'] },
  ] };
  const note = missingInputsNote(plan.steps[2], plan);
  assert.match(note, /INPUTS THAT DID NOT ARRIVE/);
  assert.match(note, /s2 \(Researcher: the gaps\) FAILED — brief cites \[19\]/);
  assert.match(note, /say plainly what is therefore unknown/);
  assert.equal(missingInputsNote({ id: 'x' }, plan), '');
  // and the report is told the step ran short
  const p = buildReportPrompt('g', { steps: [{ ...plan.steps[2], status: 'done', output: 'the review' }] }, { coverage: '1 of 1' });
  assert.match(p, /ran WITHOUT s2, which failed/);
});

test('a step\'s output is handed on whole — the sources at the end of a brief are the point', () => {
  const long = 'x'.repeat(15000);
  assert.equal(summarise({ kind: 'program', decision: { title: 'D', payload: { body: long } } }).length, 15002);
  assert.equal(summarise({ kind: 'research', decision: { title: 'R', payload: { body: long } } }).length, 15002);
  assert.equal(summarise({ kind: 'research', decision: { title: 'R', payload: { body: 'x'.repeat(40000) } } }).length, 24000, 'only a runaway is clipped');
  assert.match(buildPlannerPrompt('review my program'), /ALWAYS include a fresh dossier step/);
});

test('the plan card carries the cost line and says a correction re-draws it', () => {
  assert.match(costLine(7.8, true), /above the usual \$6\.00/);
});

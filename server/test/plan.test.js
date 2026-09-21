// The plan validator — the component that decides whether Nova may spend his
// money across several agents, and the one that has to produce the sentence
// he asked for when it cannot: not "invalid capability", but what is missing.
//
// Every rule gets a test because the failure modes are all quiet ones. A
// validator that is too permissive spends money on nonsense; one that is too
// strict refuses work Nova can plainly do; and one whose messages are written
// for a log tells him nothing he can act on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, costLine, schedule, describePlan, planProgress, MAX_STEPS, MAX_PLAN_USD, unmetNeeds, skipReason } from '../lib/plan.js';

const step = (id, capability, needs = []) => ({ id, capability, needs, what: `do ${id}` });

test('his own example validates, and costs what the lanes cost', () => {
  // the request that started this: watch it, check the claims, find the
  // counter-evidence. If this does not pass, the feature does not work.
  const plan = { steps: [
    step('s1', 'watch'),
    step('s2', 'research', ['s1']),
    step('s3', 'research', ['s1']),
  ] };
  const v = validatePlan(plan);
  assert.equal(v.ok, true, v.errors.join(' · '));
  // watch $3 + two research panels at their real $5.40 each
  assert.equal(v.ceilingUsd, 13.8);
  // ABOVE THE SOFT LINE AND STILL OK. His instruction, 21 Sep: no caps on
  // research; the number is shown and he decides. The flag is what the card
  // uses to say so.
  assert.ok(v.ceilingUsd > MAX_PLAN_USD);
  assert.equal(v.overSoftCap, true);
  assert.match(costLine(v.ceilingUsd, v.overSoftCap), /above the usual/);
  assert.match(costLine(v.ceilingUsd, v.overSoftCap), /pauses and asks/);
  assert.doesNotMatch(costLine(2, false), /above the usual/);
});

test('an unknown agent is reported as a missing agent, in his words', () => {
  const v = validatePlan({ steps: [step('a', 'summarise-pdf')] });
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /would need a new agent/);
  assert.match(v.errors[0], /summarise-pdf/, 'name the thing it cannot do');
});

test('a non-delegable agent is refused by name, not by rule', () => {
  const code = validatePlan({ steps: [step('a', 'code')] });
  assert.equal(code.ok, false);
  assert.match(code.errors[0], /Claude Code is yours to ask directly/);
  // the Coach is a step since 21 Sep — see capabilities.test.js
  const coach = validatePlan({ steps: [step('a', 'program'), step('b', 'coach', ['a'])] });
  assert.equal(coach.ok, true, coach.errors.join(' · '));
});

test('cost never refuses a plan — a book inside one is shown as expensive, not blocked', () => {
  // Before 21 Sep this was an error naming the Librarian. His instruction:
  // no caps; show the number and let him decide.
  const v = validatePlan({ steps: [step('a', 'watch'), step('b', 'book')] });
  assert.equal(v.ok, true, v.errors.join(' · '));
  assert.equal(v.ceilingUsd, 28);
  assert.equal(v.overSoftCap, true);
});

test('the step ceiling is enforced', () => {
  const many = Array.from({ length: MAX_STEPS + 1 }, (_, i) => step(`s${i}`, 'research'));
  const v = validatePlan({ steps: many });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => new RegExp(`ceiling is ${MAX_STEPS}`).test(e)));
});

test('an empty plan is rejected as nothing to run', () => {
  assert.equal(validatePlan({ steps: [] }).ok, false);
  assert.match(validatePlan({ steps: [] }).errors[0], /nothing to run/);
  assert.equal(validatePlan(null).ok, false);
  assert.equal(validatePlan({}).ok, false);
});

test('a dependency on a step that does not exist is named', () => {
  const v = validatePlan({ steps: [step('a', 'watch'), step('b', 'research', ['ghost'])] });
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /waits on "ghost", which is not in the plan/);
});

test('a step cannot wait on itself', () => {
  const v = validatePlan({ steps: [step('a', 'watch', ['a'])] });
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /waits on itself/);
});

test('a dependency loop is caught before anything runs', () => {
  const v = validatePlan({ steps: [
    step('a', 'watch', ['b']),
    step('b', 'research', ['a']),
  ] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(' '), /loop, so none of them could start/);
});

test('duplicate step ids are rejected', () => {
  const v = validatePlan({ steps: [step('a', 'watch'), step('a', 'research')] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(' '), /two steps share the id "a"/);
});

test('a step with no agent is rejected', () => {
  const v = validatePlan({ steps: [{ id: 'a', what: 'something' }] });
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /does not say which agent/);
});

// ---- scheduling ----

test('independent steps run in the same wave', () => {
  const steps = [step('s1', 'watch'), step('s2', 'research', ['s1']), step('s3', 'research', ['s1'])];
  assert.deepEqual(schedule(steps), [['s1'], ['s2', 's3']], 'the two checks start together once the transcript exists');
});

test('a chain schedules one per wave', () => {
  const steps = [step('a', 'watch'), step('b', 'research', ['a']), step('c', 'research', ['b'])];
  assert.deepEqual(schedule(steps), [['a'], ['b'], ['c']]);
});

test('scheduling a cyclic plan returns nothing rather than spinning', () => {
  const steps = [step('a', 'watch', ['b']), step('b', 'research', ['a'])];
  assert.deepEqual(schedule(steps), [], 'never loop forever on a plan that should have been rejected');
});

// ---- what he sees, and what the report is allowed to claim ----

test('the plan reads as agents and actions, not as JSON', () => {
  const lines = describePlan({ steps: [step('s1', 'watch'), step('s2', 'research', ['s1'])] });
  assert.match(lines[0], /^1\. Watcher — do s1$/);
  assert.match(lines[1], /^2\. Researcher \(after s1\) — do s2$/);
});

test('coverage is stated, and a failed step is never quietly dropped', () => {
  const p = planProgress({ steps: [
    { id: 'a', status: 'done' }, { id: 'b', status: 'failed' }, { id: 'c', status: 'done' },
  ] });
  assert.equal(p.allSettled, true);
  assert.deepEqual(p.failed, ['b']);
  // the number of failures is IN the coverage line, not left to the prose
  assert.equal(p.coverage, '2 of 3 steps completed (1 failed)');
  assert.equal(p.partial, true);
  assert.equal(p.empty, false);
});

// PARTIAL COMPLETION. He walks away, step 2 fails, and everything downstream
// of it used to run anyway — handoffFor dropped the missing output and
// interpolate left a raw {{s2}} in the instruction, so the agent answered a
// question about a document nobody had written.
test('a step whose dependency produced nothing is skipped, and named', () => {
  assert.deepEqual(unmetNeeds({ needs: ['s1', 's2'] }, { s1: 'the list' }), ['s2']);
  assert.deepEqual(unmetNeeds({ needs: [] }, {}), []);
  assert.deepEqual(unmetNeeds({}, {}), []);
  assert.equal(skipReason(['s2']), 'it needed s2, which produced nothing');
  assert.equal(skipReason(['s1', 's2']), 'it needed s1 and s2, which produced nothing');
  assert.equal(skipReason(['s1', 's2', 's3']), 'it needed s1, s2 and s3, which produced nothing');
  assert.equal(skipReason([]), '');
});

test('coverage counts what COMPLETED, not what merely stopped', () => {
  const p = planProgress({ steps: [
    { id: 'a', status: 'done' }, { id: 'b', status: 'failed' },
    { id: 'c', status: 'skipped' }, { id: 'd', status: 'done' },
  ] });
  // the old rule was `total - failed`, which counted the skipped step as done
  assert.equal(p.coverage, '2 of 4 steps completed (1 failed, 1 skipped for want of them)');
  assert.deepEqual(p.done, ['a', 'd']);
  assert.deepEqual(p.skipped, ['c']);
  assert.equal(p.settled, 4);
  assert.equal(p.allSettled, true, 'a skipped step is settled — it is never coming back');
  assert.equal(p.partial, true);
});

test('nothing getting through is its own answer, not a small number', () => {
  const p = planProgress({ steps: [{ id: 'a', status: 'failed' }, { id: 'b', status: 'skipped' }] });
  assert.equal(p.empty, true, 'no report should be synthesised out of this');
  assert.equal(p.partial, false);
  assert.equal(p.coverage, '0 of 2 steps completed (1 failed, 1 skipped for want of them)');
  // and a wholly clean run claims nothing extra
  const clean = planProgress({ steps: [{ id: 'a', status: 'done' }] });
  assert.equal(clean.coverage, '1 of 1 steps completed');
  assert.equal(clean.empty, false);
  assert.equal(clean.partial, false);
});

test('a plan still running has not settled', () => {
  const p = planProgress({ steps: [{ id: 'a', status: 'done' }, { id: 'b', status: 'running' }] });
  assert.equal(p.allSettled, false);
});

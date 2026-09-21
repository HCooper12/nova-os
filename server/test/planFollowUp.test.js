// THE CONVERSATION KNOWS ABOUT HIS PLANS — pinned against the 21 Sep failure:
// he corrected a proposed plan two minutes after it was drawn, the words went
// to a chat that had never seen it, and the plan ran as written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planPhase, isAffirmativeOrNegative, recentPlanContext, describePlanForModel, plansContext, latestReportLine } from '../lib/planFollowUp.js';

const T0 = Date.parse('2026-09-21T01:32:29Z');
const min = (n) => n * 60_000;
const step = (id, capability, what, status = 'waiting', output = null, error = null) => ({ id, capability, what, status, output, error, needs: [] });

const proposed = {
  id: 'p1', kind: 'plan', status: 'pending', createdAt: new Date(T0).toISOString(), planOk: true,
  goal: 'Review my program and find the evidence on volume',
  plan: { steps: [step('s1', 'research', 'Find the volume evidence')] },
  cannot: 'None of the agents can read his program',
};
const running = { ...proposed, id: 'p2', status: 'classifying', approvedAt: new Date(T0 + min(2)).toISOString(), plan: { steps: [step('s1', 'research', 'Find the volume evidence', 'running')] } };
const paused = { ...running, id: 'p3', pausedOn: 's1', plan: { steps: [step('s1', 'research', 'Find the volume evidence', 'paused', null, 'paused at its budget')] } };
const finished = {
  ...proposed, id: 'p4', status: 'pending', finishedAt: new Date(T0 + min(5)).toISOString(),
  plan: { steps: [step('s1', 'research', 'Find the volume evidence', 'done', 'a brief')] },
  decision: { route: 'note', payload: { body: 'THE REPORT. Your split is fine. ## What I would change\n1. Cut Pull to six exercises.' } },
};

test('a plan reads as the phase it is actually in', () => {
  assert.equal(planPhase(proposed), 'proposed');
  assert.equal(planPhase(running), 'running');
  assert.equal(planPhase(paused), 'paused');
  assert.equal(planPhase(finished), 'finished');
  assert.equal(planPhase({ ...proposed, status: 'classifying', plan: null }), 'planning');
  assert.equal(planPhase({ ...proposed, planOk: false }), 'refused');
  assert.equal(planPhase({ kind: 'research' }), null);
});

test('a bare yes or no is an answer to the card; anything with substance is a correction', () => {
  for (const t of ['yes', 'Yes.', 'yep', 'ok', 'go ahead', 'do it', 'run it', 'yes, run it', 'no', 'leave it', 'not now', 'sure, nova']) {
    assert.equal(isAffirmativeOrNegative(t), true, `"${t}" should be a yes/no`);
  }
  for (const t of [
    'The coach agent should be able to analyse and pull my current workout information? So don\'t say no agents are capable of doing that',
    'yes but include the coach',
    'add a step that checks my nutrition',
    'no, I meant the other program',
  ]) {
    assert.equal(isAffirmativeOrNegative(t), false, `"${t}" is a correction, not a yes/no`);
  }
});

test('the plan he is most likely talking about is the newest one inside the window', async () => {
  const records = [proposed, running, finished, { kind: 'research', id: 'r1', createdAt: new Date(T0).toISOString() }];
  const live = await recentPlanContext({ now: T0 + min(6), records });
  assert.equal(live.record.id, 'p4', 'the plan that finished a minute ago wins');
  assert.equal(live.phase, 'finished');
  const earlier = await recentPlanContext({ now: T0 + min(1), records: [proposed] });
  assert.equal(earlier.phase, 'proposed');
  assert.equal(await recentPlanContext({ now: T0 + min(60), records }), null, 'outside the window nothing is live');
  assert.equal(await recentPlanContext({ now: T0 + min(6), records: [{ ...finished, status: 'discarded' }] }), null);
});

test('the model is handed the plan as it stands — steps, the cannot, and a finished report in full', () => {
  const text = describePlanForModel(finished);
  assert.match(text, /PLAN \[finished/);
  assert.match(text, /Review my program/);
  assert.match(text, /Researcher: Find the volume evidence — done/);
  assert.match(text, /Not covered, per the plan: None of the agents/);
  assert.match(text, /THE REPORT/);
  assert.match(text, /Cut Pull to six exercises/);
  const p = describePlanForModel(paused);
  assert.match(p, /PAUSED at its budget/);
  assert.match(p, /Paused on step s1/);
});

test('the plans block carries the newest finished report in full and older ones short', async () => {
  const older = { ...finished, id: 'p0', finishedAt: new Date(T0 - min(30)).toISOString(), decision: { payload: { body: 'OLD REPORT '.repeat(200) } } };
  const block = await plansContext({ now: T0 + min(6), records: [older, finished, proposed] });
  assert.match(block, /HIS PLANS/);
  assert.match(block, /Cut Pull to six exercises/, 'the newest report is in full');
  assert.ok(block.includes('report continues in his Inbox'), 'the older report is clipped and says so');
  assert.match(block, /Never send him to the Inbox to find out what a plan concluded/);
  assert.equal(await plansContext({ now: T0, records: [] }), null);
});

test('the Coach\'s resumed turn gets the newest finished report as one line', async () => {
  const line = await latestReportLine({ now: T0 + min(9), records: [finished, proposed] });
  assert.match(line, /finished 4 min ago/);
  assert.match(line, /Cut Pull to six exercises/);
  assert.equal(await latestReportLine({ now: T0 + min(9), records: [proposed] }), null);
});

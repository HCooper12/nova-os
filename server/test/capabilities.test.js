// The capability registry is a CONTRACT, and the failure it prevents is the
// worst one this feature can have: Nova confidently planning a step that
// cannot run.
//
// Three files have to agree about what exists — the router that classifies a
// request, the route that dispatches it, and this registry that the planner
// reads. Any two of them can drift silently. So the agreement is asserted
// rather than assumed, the same way the exercise atlas is pinned against his
// real library.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, CAPABILITY_IDS, DELEGABLE_IDS, ceilingFor, isCapability, describeForPlanner, describeForHim } from '../lib/capabilities.js';
import { LANES, LANE_LABEL } from '../lib/intentRouter.js';
import { CHAT_JOB_LANES } from '../../src/chatLanes.js';

test('every capability is a lane the router can return', () => {
  for (const id of CAPABILITY_IDS) {
    assert.ok(LANES.includes(id), `capability "${id}" is not a router lane — nothing would dispatch it`);
  }
});

test('every router lane has a capability entry', () => {
  for (const lane of LANES) {
    assert.ok(isCapability(lane), `lane "${lane}" has no capability entry — the planner cannot see it`);
  }
});

test('every capability has a dispatch label', () => {
  // LANE_LABEL is what the route and the UI name the lane; a missing entry is
  // a lane that dispatches into an unnamed void
  for (const id of CAPABILITY_IDS) {
    assert.ok(LANE_LABEL[id], `capability "${id}" has no LANE_LABEL`);
  }
});

test('what the chat may start and what a plan may delegate are the same set', () => {
  // they answer the same question — "can Nova start this without being told
  // to, on its own judgement" — so a difference between them is a bug in one
  assert.deepEqual([...DELEGABLE_IDS].sort(), [...CHAT_JOB_LANES].sort());
});

test('Coach and Claude Code are reachable but never delegated', () => {
  // his instruction: Coach stays its own agent. Code can alter the machinery
  // running the plan, which is not a step a planner should take alone.
  assert.equal(CAPABILITIES.coach.delegable, false);
  assert.equal(CAPABILITIES.code.delegable, false);
  assert.ok(isCapability('coach'), 'still reachable — just not delegated');
});

test('every capability declares the fields the planner and validator need', () => {
  for (const [id, c] of Object.entries(CAPABILITIES)) {
    for (const field of ['agent', 'summary', 'input', 'output', 'costUsd', 'autonomy', 'delegable']) {
      assert.ok(c[field] !== undefined, `${id} is missing "${field}"`);
    }
    assert.ok(typeof c.costUsd === 'number' && c.costUsd > 0, `${id} has no usable cost ceiling`);
    assert.ok(['observe', 'propose', 'act-on-approval'].includes(c.autonomy), `${id} has an unknown autonomy level`);
  }
});

test('the ceiling is a sum of real ceilings, and unknown steps cost nothing', () => {
  assert.equal(ceilingFor(['watch']), 3);
  assert.equal(ceilingFor(['watch', 'research']), 4);
  assert.equal(ceilingFor([]), 0);
  assert.equal(ceilingFor(['nonsense']), 0, 'an unknown id contributes nothing — the validator rejects it separately');
});

test('a book step alone exceeds the plan ceiling, and that is the honest answer', () => {
  // the Librarian's own budget is $25; his plan ceiling is $3. So a plan
  // cannot quietly include one — Nova has to say it costs more and ask for it
  // separately, which is the behaviour he asked for
  assert.ok(ceilingFor(['book']) > 3, 'a book must not fit silently inside a plan');
});

test('the planner is only ever told about delegable capabilities', () => {
  const block = describeForPlanner();
  for (const id of DELEGABLE_IDS) assert.ok(block.includes(id), `planner block omits ${id}`);
  assert.ok(!block.includes('(Claude Code)'), 'the planner must not be offered the code lane');
  assert.ok(!block.includes('(Coach)'), 'the planner must not be offered the Coach');
});

test('what he is told covers everything, delegable or not', () => {
  const lines = describeForHim();
  assert.equal(lines.length, CAPABILITY_IDS.length);
  assert.ok(lines.some((l) => /Coach/.test(l) && /not something Nova delegates/.test(l)));
});

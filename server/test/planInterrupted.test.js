// 1 NOV 2026: HIS PLAN WAS CUT OFF ONE SECOND AFTER ITS LAST STEP FINISHED.
// The reload script asked "is anything running?", saw only the Coach job end,
// and restarted; the plan, still collecting that step and about to write its
// report, was stamped Interrupted with the work done and nobody told. Three
// guards: a plan counts as running work, a restart's casualties are resumed
// at boot, and a finished plan he asked for notifies him.
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-planint-'));
mkdirSync(path.join(base, 'data'), { recursive: true });
mkdirSync(path.join(base, 'vault', 'Wiki'), { recursive: true });
// a fake `claude`: waits FAKE_SLEEP ms, then prints the JSON envelope the planner parses
const fake = path.join(base, 'fake-claude.mjs');
writeFileSync(fake, `#!/usr/bin/env node
const ms = Number(process.env.FAKE_SLEEP || 0);
setTimeout(() => process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: 'Two of three steps finished. The Coach step was cut off by a restart.', total_cost_usd: 0, duration_ms: ms, usage: {} })), ms);
`);
chmodSync(fake, 0o755);
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.CLAUDE_BIN = fake;
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.NOVA_PLAN_POLL_MS = '20';

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const vault = path.join(base, 'vault');
const { createRecord, getRecord } = await import('../lib/inboxStore.js');
const { resumePlan, resumeInterruptedPlans, STEP_INTERRUPTED } = await import('../lib/planner.js');
const { activeJobs } = await import('../lib/jobRegistry.js');
const { recordPush } = await import('../lib/notifyPolicy.js');

const INTERRUPTED = 'Interrupted — the server restarted while this was being processed. Discard it, or re-run the loop.';
const iso = (ms = 0) => new Date(Date.now() - ms).toISOString();

async function plantPlan(id, { allDone = false, ageMs = 0, interrupted = true, steps = null } = {}) {
  await createRecord({ id: `${id}s3`, kind: 'coach-review', status: 'error', error: INTERRUPTED, createdAt: iso(ageMs), text: 'Coach review' });
  await createRecord({
    id, kind: 'plan', status: interrupted ? 'error' : 'pending', error: interrupted ? INTERRUPTED : null,
    createdAt: iso(ageMs), startedAt: iso(ageMs), goal: 'Re-run the plan and fold in dips', planOk: true,
    plan: { steps: steps || [
      { id: 's1', capability: 'program', status: 'done', output: 'dossier', needs: [] },
      { id: 's2', capability: 'research', status: 'done', output: 'brief', needs: ['s1'] },
      { id: 's3', capability: 'coach', status: allDone ? 'done' : 'running', output: allDone ? 'batch' : null, recordId: allDone ? null : `${id}s3`, needs: ['s1', 's2'] },
    ] },
  });
}

test('a plan counts as running work while it finishes, so a reload waits for it', async () => {
  await plantPlan('aa000001', { allDone: true });
  process.env.FAKE_SLEEP = '500';
  assert.equal(activeJobs().byLane.plan || 0, 0, 'nothing running before');
  const run = resumePlan(vault, 'aa000001');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(activeJobs().byLane.plan, 1, 'the plan is in flight while its report is written');
  await run;
  assert.equal(activeJobs().byLane.plan || 0, 0, 'and not after');
  assert.equal((await getRecord('aa000001')).status, 'pending');
});

test('a plan a restart cut off is resumed at boot: nothing re-dispatched, a report written, the cut step named plainly', async () => {
  await plantPlan('bb000002');
  process.env.FAKE_SLEEP = '0';
  const { resumed, runs } = await resumeInterruptedPlans(vault);
  assert.deepEqual(resumed, ['bb000002']);
  await Promise.all(runs);
  const rec = await getRecord('bb000002');
  assert.equal(rec.status, 'pending', 'waiting on him, so it shows in the Inbox and can notify');
  assert.ok(rec.finishedAt);
  assert.equal(rec.error == null || /report failed/.test(rec.error), true);
  const s3 = rec.plan.steps.find((s) => s.id === 's3');
  assert.equal(s3.status, 'failed');
  assert.match(s3.error, /already in your Inbox/);
  assert.equal(STEP_INTERRUPTED.includes('Discard'), false, "the step's sentence is about a step, not a record");
  assert.deepEqual(rec.plan.steps.filter((s) => s.status === 'done').map((s) => s.id), ['s1', 's2'], 'the finished steps are carried');
});

test('boot resumes only recent plans that were cut off, never old ones, other errors, or empty plans', async () => {
  await plantPlan('cc000003', { ageMs: 30 * 3600 * 1000 });
  await plantPlan('dd000004', { interrupted: false });
  await plantPlan('ee000005', { steps: [] });
  const { resumed } = await resumeInterruptedPlans(vault);
  assert.deepEqual(resumed, [], 'a day-old plan, a healthy plan and a plan with no steps stay as they are');
  assert.equal((await getRecord('cc000003')).status, 'error');
});

test('a finished plan he asked for notifies him; a plan still working or in error does not', () => {
  assert.equal(recordPush({ kind: 'plan', status: 'pending', source: 'planner' }).push, true);
  assert.equal(recordPush({ kind: 'plan', status: 'classifying', source: 'planner' }).push, false);
  assert.equal(recordPush({ kind: 'plan', status: 'error', source: 'planner' }).push, false);
  assert.equal(recordPush({ kind: 'coach', status: 'pending', source: 'coach' }).push, false, 'other drafts stay Inbox-only');
});

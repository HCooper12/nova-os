// A PLAN'S BUILD STEP WAITS ON THE RECORD THE BUILD SETTLES. Pinned against
// his plan 0ae72205 (1 Nov 2026): the mockup step failed at once with "the
// record vanished" because the plan was handed the Builder's JOB id and looked
// it up as an Inbox record; the build itself ran on and filed its receipt under
// a fresh id two minutes after the report told him it had broken. And the
// build it did run was given `[[artifact:8b7f33e1]]` instead of the Coach's
// plan, so it mocked up a plan it had never seen.
//
// Everything here is temporary: NOVA_DATA_DIR, the projects root and the vault
// are mkdtemp folders set BEFORE any import, and the claude CLI is a stub.
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-plan-build-data-'));
process.env.NOVA_PROJECTS_DIR = mkdtempSync(path.join(tmpdir(), 'nova-plan-build-projects-'));
process.env.NOVA_PLAN_POLL_MS = '40';
const vault = mkdtempSync(path.join(tmpdir(), 'nova-plan-build-vault-'));

// One-shot stub: the Builder and the report writer both print an envelope.
// FAIL_BUILD in the environment makes the builder's run fail.
const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-plan-build-cli-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const args = process.argv.slice(2);
const prompt = args[args.indexOf('-p') + 1] || '';
const building = prompt.startsWith('You are building something for Hayden');
if (building && require('node:fs').existsSync(${JSON.stringify(path.join(stubDir, 'fail'))})) {
  process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'the builder ran out of turns' }));
  process.exit(0);
}
const said = building
  ? 'Made the page. It shows ' + (prompt.includes('Upper A: Weighted Pull-Up 3x6') ? 'the Coach plan in full.' : 'only a link to the plan.')
  : 'THE REPORT. The mockup is built.';
process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: said }));
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const store = await import('../lib/inboxStore.js');
const { runPlan, retryFailedSteps, expandArtifactTokens, awaitJob, failedSteps } = await import('../lib/planner.js');
const { retryRecord } = await import('../lib/inbox.js');
const { planCanRetry } = await import('../../src/vals/valsInbox.js');

const wait = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 30));
  }
};

let n = 0;
async function planWith(steps, extra = {}) {
  n += 1;
  return store.createRecord({
    id: `plan${n}`, kind: 'plan', status: 'pending', planOk: true, source: 'planner', mode: 'draft',
    createdAt: new Date().toISOString(), goal: `Mock up the four-day program (${n})`,
    plan: { steps }, ...extra,
  });
}

test('the build step waits on the record its build settles, not on a job id it cannot find', async () => {
  const plan = await planWith([
    { id: 's1', capability: 'build', what: 'Mock up the plan as workout cards', input: 'One card per workout.', needs: [], status: 'waiting' },
  ]);
  await runPlan(vault, plan.id);
  const after = await store.getRecord(plan.id);
  const s1 = after.plan.steps[0];
  assert.equal(s1.status, 'done', `the step failed: ${s1.error}`);
  assert.doesNotMatch(String(s1.error || ''), /vanished/);
  assert.match(s1.output, /Made the page/);
  // ONE build record, the one the step named, settled in place
  const builds = (await store.listRecords()).filter((r) => r.kind === 'build');
  assert.equal(builds.length, 1, 'no orphan receipt beside the step\'s record');
  assert.equal(builds[0].id, s1.recordId);
  assert.equal(builds[0].status, 'filed');
  assert.equal(builds[0].parentPlanId, plan.id);
  assert.ok(builds[0].buildBrief.includes('One card per workout.'), 'the whole brief rides the record for Retry');
  assert.ok(after.finishedAt, 'the plan finished and wrote its report');
});

test('a step that produced a document hands on the document, not its [[artifact:id]] token', async () => {
  const read = async (id) => (id === '8b7f33e1' ? { title: 'Four-day rebuild', body: 'Upper A: Weighted Pull-Up 3x6\nLower: Squat 3x8' } : null);
  const out = await expandArtifactTokens('Coach review\n[[artifact:8b7f33e1]]\nand [[artifact:gone0000]]', read);
  assert.match(out, /DOCUMENT "Four-day rebuild":\nUpper A: Weighted Pull-Up 3x6/);
  assert.doesNotMatch(out, /\[\[artifact:8b7f33e1\]\]/);
  // an unknown document is left as it was rather than invented
  assert.match(out, /\[\[artifact:gone0000\]\]/);
  assert.equal(await expandArtifactTokens('no tokens here', read), 'no tokens here');
});

test('a weave step follows its JOB to ready, and a lost job fails in plain words', async () => {
  const jobs = { j1: [{ status: 'staging' }, { status: 'ready', summary: 'Three pages about the book', changes: [{ path: 'Wiki/Book.md' }] }] };
  const getJob = async (id) => (jobs[id] ? jobs[id].shift() || { status: 'ready', summary: 'x' } : null);
  const ok = await awaitJob({ jobId: 'j1', jobLane: 'ingest' }, { getJob, pollMs: 5 });
  assert.equal(ok.ok, true);
  assert.match(ok.output, /Three pages about the book/);
  assert.match(ok.output, /Wiki\/Book\.md/);
  const lost = await awaitJob({ jobId: 'nope', jobLane: 'ingest' }, { getJob, pollMs: 5 });
  assert.equal(lost.ok, false);
  assert.match(lost.why, /gone from the Mac/);
});

test('a failed build step can be retried: only that step runs again, and the plan writes a new report', async () => {
  writeFileSync(path.join(stubDir, 'fail'), '1');
  const plan = await planWith([
    { id: 's1', capability: 'program', what: 'Read his program', input: '', needs: [], status: 'done', output: 'his program', recordId: 'prog1' },
    { id: 's2', capability: 'build', what: 'Build the mockup page', input: 'Cards per day.', needs: ['s1'], status: 'waiting' },
  ]);
  await runPlan(vault, plan.id);
  let rec = await store.getRecord(plan.id);
  assert.equal(rec.plan.steps[1].status, 'failed');
  // the cause, in its own words, not "the record vanished"
  assert.match(rec.plan.steps[1].error, /ran out of turns/i);
  assert.deepEqual(failedSteps(rec).map((s) => s.id), ['s2']);
  assert.equal(planCanRetry(rec), true, 'the Inbox offers Retry on this plan');

  // the failed build's own record is retryable too
  const failedBuild = await store.getRecord(rec.plan.steps[1].recordId);
  assert.equal(failedBuild.status, 'error');

  (await import('node:fs')).rmSync(path.join(stubDir, 'fail'));
  const again = await retryRecord(vault, plan.id);
  assert.equal(again.status, 'classifying');
  rec = await wait(async () => { const r = await store.getRecord(plan.id); return r.finishedAt ? r : null; });
  assert.equal(rec.plan.steps[0].recordId, 'prog1', 'the step that worked was carried, not run again');
  assert.equal(rec.plan.steps[1].status, 'done', rec.plan.steps[1].error);
  assert.equal(planCanRetry(rec), false);
  await assert.rejects(retryFailedSteps(vault, plan.id), /nothing in that plan failed/);
});

test('a failed build record retries from its own brief, on the same record', async () => {
  const rec = await store.createRecord({
    id: 'build1', kind: 'build', status: 'error', source: 'nova', mode: 'auto', createdAt: new Date().toISOString(),
    error: 'the builder exited with code 1', buildBrief: 'A page with one card per workout.', buildName: 'program mockup',
  });
  const again = await retryRecord(vault, rec.id);
  assert.equal(again.status, 'classifying');
  const done = await wait(async () => { const r = await store.getRecord(rec.id); return r.status !== 'classifying' ? r : null; });
  assert.equal(done.status, 'filed', done.error);
  assert.equal(done.buildAttempt, 2);
  assert.equal(done.error, null);
});

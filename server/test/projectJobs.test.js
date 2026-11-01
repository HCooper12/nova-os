// A PROJECT JOB, RUN, AND WHEN THE QUEUE RUNS (phase 3, PROJECTS-PLAN §5 and
// his answers of 1 Nov 2026). No model and no sandbox run here: the CLI run,
// the checks and the Breaker are stubs; every folder is a temp dir, set before
// import.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const base = mkdtempSync(path.join(tmpdir(), 'nova-jobs-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });
mkdirSync(process.env.NOVA_PROJECTS_DIR, { recursive: true });

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { jobTools, jobModel, parseNeedsYou, runProjectJob, _setJobDepsForTest } = await import('../lib/projectJobs.js');
const { pickJobs, runProjectQueues, reconcileProjectJobs, projectsMorningLine, _setSchedulerDepsForTest } = await import('../lib/projectScheduler.js');
const { novaKernel, queueProjectJob, retryProjectJob } = await import('../lib/novaProjects.js');
const store = await import('../lib/inboxStore.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');

const k = () => novaKernel(vault);
let n = 0;
function project(allowances = { research: true, draft: true, code: true, test: true, commit: true }, over = {}) {
  n += 1;
  const { project: p } = k().createProject({
    name: `Room ${n}`, kind: 'life', goal: 'A calmer bedroom', done: 'Furniture chosen', deadline: null,
    phases: [{ name: 'Measure' }], reads: [], allowances, limit: {}, firstMoves: [],
  }, { withPage: false, dryRun: false });
  return over && Object.keys(over).length ? k().updateProject(p, over) : p;
}

// the CLI run, stubbed: it writes what `write` says into the folder, then replies
function stubRun({ write = { 'deliverables/plan.md': '# Plan\n' }, reply = 'Wrote the plan.' } = {}) {
  const calls = [];
  return {
    calls,
    run: async (folder, argv) => {
      calls.push(argv);
      for (const [rel, body] of Object.entries(typeof write === 'function' ? write(calls.length) : write)) {
        mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true });
        writeFileSync(path.join(folder, rel), body);
      }
      return { text: typeof reply === 'function' ? reply(calls.length) : reply, envelope: { result: 'x', total_cost_usd: 0.12 } };
    },
  };
}
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 25)); }
}
const quiet = { context: async () => '', him: async () => '', spend: async () => {}, sandbox: () => true };

test('tools come from the allowances: a draft has no shell, git history is always blocked, the web only with Research', () => {
  const draft = jobTools('draft', { draft: true });
  assert.equal(draft.allowed, 'Read,Write,Edit,Glob,Grep');
  assert.match(draft.disallowed, /(^|,)Bash(,|$)/);
  assert.match(draft.disallowed, /WebSearch/);
  const code = jobTools('code', { code: true, research: true });
  assert.equal(code.allowed, 'Read,Write,Edit,Glob,Grep,Bash,WebSearch,WebFetch');
  for (const blocked of ['Bash(git commit:*)', 'Bash(git push:*)', 'Bash(gh:*)', 'Agent', 'PushNotification']) assert.ok(code.disallowed.split(',').includes(blocked), blocked);
  assert.equal(code.disallowed.split(',').includes('Write'), false);
  assert.throws(() => jobTools('test', {}), /runs no model/);
});

test('Fable always asks: an override naming Fable never runs without his yes', () => {
  assert.equal(jobModel('code', { modelOverride: 'claude-fable-5-1' }, { lanePick: () => 'opus' }).ask, true);
  assert.equal(jobModel('code', { modelOverride: 'claude-fable-5-1' }, { lanePick: () => 'opus', fableOk: true }).ask, false);
  assert.deepEqual(jobModel('draft', {}, { lanePick: () => 'sonnet' }), { lane: 'project-draft', model: 'sonnet', ask: false });
});

test('the ask line: only the exact shape is read', () => {
  assert.deepEqual(parseNeedsYou('Done most of it.\nNEEDS YOU: Oak or walnut? | MY PICK: oak, it matches the floor'), { question: 'Oak or walnut?', pick: 'oak, it matches the floor' });
  assert.equal(parseNeedsYou('I think he needs you to decide'), null);
});

test('a draft job writes, code commits it (Commit on), the receipt and the log say so, and undo reverts it', async () => {
  const p = project();
  const stub = stubRun();
  _setJobDepsForTest({ ...quiet, run: stub.run });
  const job = k().enqueueJob(p, { kind: 'draft', input: 'a one-page plan' });
  const { recordId, done } = await runProjectJob(vault, k(), p.id, job);
  const out = await done;
  assert.equal(out.status, 'done');
  const r = await store.getRecord(recordId);
  assert.equal(r.status, 'filed');
  assert.equal(r.kind, 'project-job');
  assert.match(r.decision.payload.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(r.decision.payload.files, ['deliverables/plan.md']);
  assert.match(k().readLog(p), /draft job .* committed/);
  // the argv the CLI got: sandboxed folder run, no session kept, tools named
  const argv = stub.calls[0];
  assert.ok(argv.includes('--no-session-persistence'));
  assert.equal(argv[argv.indexOf('--allowedTools') + 1], 'Read,Write,Edit,Glob,Grep,WebSearch,WebFetch');
  const said = await undoFiling(vault, r.undoData);
  assert.match(said, /reverted/);
  assert.equal(existsSync(path.join(p.folder, 'deliverables', 'plan.md')), false);
  _setJobDepsForTest(null);
});

test('Commit off: the files stay uncommitted, and undo moves them to .nova/undone', async () => {
  const p = project({ draft: true });
  _setJobDepsForTest({ ...quiet, run: stubRun().run });
  const job = k().enqueueJob(p, { kind: 'draft', input: 'a plan' });
  const { recordId, done } = await runProjectJob(vault, k(), p.id, job);
  await done;
  const r = await store.getRecord(recordId);
  assert.equal(r.decision.payload.commit, null);
  assert.match(r.destination, /not committed \(Commit is off/);
  await undoFiling(vault, r.undoData);
  assert.equal(existsSync(path.join(p.folder, 'deliverables', 'plan.md')), false);
  const undone = readdirSync(path.join(p.folder, '.nova', 'undone'));
  assert.equal(undone.length, 1);
  _setJobDepsForTest(null);
});

test('stop and ask: the job waits, a card asks, Approve sends the pick back and the job runs again with it', async () => {
  const p = project();
  const stub = stubRun({ reply: (i) => (i === 1 ? 'Half done.\nNEEDS YOU: Oak or walnut? | MY PICK: oak' : 'Finished with oak.') });
  _setJobDepsForTest({ ...quiet, run: stub.run });
  const queued = await queueProjectJob(vault, p.id, { kind: 'draft', input: 'the shortlist', now: true });
  assert.equal(queued.started, true);
  await until(() => k().readQueue(p).jobs[0].status === 'waiting');
  const waiting = k().readQueue(p).jobs[0];
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.ask.question, 'Oak or walnut?');
  const card = (await store.listRecords()).find((x) => x.kind === 'project-needs-you' && x.jobId === waiting.id);
  assert.equal(card.status, 'pending');
  assert.equal(card.decision.route, 'project-answer');
  const filed = await fileDecision(vault, card.decision);
  assert.match(filed.destination, /answered "oak"/);
  await until(() => k().readQueue(p).jobs[0].status === 'done');
  assert.equal(k().readQueue(p).jobs[0].status, 'done');
  assert.match(stub.calls[1][1], /His answer: "oak"/);
  _setJobDepsForTest(null);
});

test('a code job: failed checks go back to the model, then the Breaker reads the diff', async () => {
  const p = project();
  let gateRuns = 0;
  const stub = stubRun({ write: { 'build/index.js': 'export const x = 1;\n' }, reply: 'Built it.' });
  let breakerAsk = null;
  _setJobDepsForTest({
    ...quiet, run: stub.run,
    gates: async () => ({
      gatesFor: () => [{ id: 'test', name: 'Tests' }],
      runGates: async () => { gateRuns += 1; return [{ id: 'test', name: 'Tests', ok: gateRuns > 1, caused: gateRuns === 1 }]; },
      causedFailures: (res) => res.filter((x) => !x.ok && x.caused),
      failureBrief: () => 'Tests failed: fix them.',
      receipt: ({ results }) => `Checks: ${results.every((x) => x.ok) ? 'all passed' : 'failing'}`,
      diffText: async () => 'diff',
    }),
    breaker: async (cwd, ask) => { breakerAsk = ask; return { found: false }; },
  });
  const job = k().enqueueJob(p, { kind: 'code', input: 'a tiny module' });
  const { recordId, done } = await runProjectJob(vault, k(), p.id, job);
  assert.equal((await done).status, 'done');
  assert.equal(stub.calls.length, 2);
  assert.match(stub.calls[1][1], /THE CHECKS FAILED/);
  assert.equal(breakerAsk, 'a tiny module');
  const r = await store.getRecord(recordId);
  assert.match(r.decision.payload.body, /Checks: all passed/);
  _setJobDepsForTest(null);
});

test('Fable on the project: nothing runs, a card asks, and Approve lets that one job run on it', async () => {
  const p = project(undefined, { modelOverride: 'claude-fable-5-1' });
  const stub = stubRun();
  _setJobDepsForTest({ ...quiet, run: stub.run });
  const job = k().enqueueJob(p, { kind: 'draft', input: 'a plan' });
  const { done } = await runProjectJob(vault, k(), p.id, job);
  const out = await done;
  assert.equal(out.status, 'waiting');
  assert.equal(stub.calls.length, 0);
  k().updateJob(p, job.id, { status: 'waiting', ask: out.ask });
  const card = (await store.listRecords()).find((x) => x.kind === 'project-needs-you' && x.jobId === job.id);
  assert.equal(card.decision.payload.fable, true);
  k().answerJob(p, job.id, 'yes', { fableOk: true });
  const again = k().readQueue(p).jobs[0];
  assert.equal(again.fableOk, true);
  assert.equal(again.answer, null);
  const second = await runProjectJob(vault, k(), p.id, again);
  assert.equal((await second.done).status, 'done');
  assert.equal(stub.calls[0][stub.calls[0].indexOf('--model') + 1], 'claude-fable-5-1');
  _setJobDepsForTest(null);
});

test('no sandbox, no draft or code job', async () => {
  const p = project();
  _setJobDepsForTest({ ...quiet, run: stubRun().run, sandbox: () => false });
  const job = k().enqueueJob(p, { kind: 'draft', input: 'x' });
  const { recordId, done } = await runProjectJob(vault, k(), p.id, job);
  const out = await done;
  assert.equal(out.status, 'failed');
  assert.match(out.error, /without the sandbox/);
  assert.equal((await store.getRecord(recordId)).status, 'error');
  _setJobDepsForTest(null);
});

// ---- the scheduler --------------------------------------------------------

const P = (id, over = {}) => ({ id, name: id, stage: 'active', dryRun: false, quiet: { from: '22:00', to: '07:00' }, folder: `/tmp/${id}`, queue: { jobs: [{ id: `${id}j1`, kind: 'research', status: 'queued', needs: [] }] }, ...over });

test('pickJobs: overnight only on its own; his press any time; dry run waits for his press', () => {
  const noon = 12 * 60;
  const night = 23 * 60;
  assert.equal(pickJobs([P('a')], { minutes: noon }).start.length, 0);
  assert.match(pickJobs([P('a')], { minutes: noon }).held[0].why, /outside its window/);
  assert.equal(pickJobs([P('a')], { minutes: night }).start.length, 1);
  assert.equal(pickJobs([P('a')], { minutes: noon, force: true }).start.length, 1);
  assert.match(pickJobs([P('a', { dryRun: true })], { minutes: night }).held[0].why, /dry run/);
  assert.equal(pickJobs([P('a', { dryRun: true })], { minutes: noon, force: true }).start.length, 1);
});

test('pickJobs: two projects at most, one job each, paused and linked never', () => {
  const night = 1 * 60;
  const three = pickJobs([P('a'), P('b'), P('c')], { minutes: night });
  assert.deepEqual(three.start.map((s) => s.project.id), ['a', 'b']);
  assert.match(three.held[0].why, /2 projects are already working/);
  const busy = P('a', { queue: { jobs: [{ id: 'r', status: 'running', needs: [] }, { id: 'q', status: 'queued', needs: [] }] } });
  const r = pickJobs([busy, P('b'), P('c')], { minutes: night });
  assert.deepEqual(r.start.map((s) => s.project.id), ['b']);
  assert.equal(pickJobs([P('a', { stage: 'paused' })], { minutes: night, force: true }).start.length, 0);
  assert.equal(pickJobs([P('a', { linked: true })], { minutes: night, force: true }).start.length, 0);
  assert.equal(pickJobs([P('a'), P('b')], { minutes: night, only: 'b' }).start[0].project.id, 'b');
});

test('runProjectQueues: a conversation in flight holds the automatic run, never his press', async () => {
  const p = project();
  k().enqueueJob(p, { kind: 'test', input: '' });
  let ran = 0;
  _setSchedulerDepsForTest({ busy: async () => true, minutes: () => 23 * 60, runJob: async () => { ran += 1; return { recordId: 'r1', done: Promise.resolve({ status: 'done' }) }; } });
  assert.equal((await runProjectQueues(vault)).busy, true);
  assert.equal(ran, 0);
  const forced = await runProjectQueues(vault, { force: true, projectId: p.id });
  assert.equal(forced.started.length, 1);
  await until(() => k().readQueue(p).jobs[0].status === 'done');
  const j = k().readQueue(p).jobs[0];
  assert.equal(j.status, 'done');
  assert.ok(existsSync(path.join(process.env.NOVA_DATA_DIR, 'projects', 'load.jsonl')));
  const line = JSON.parse(readFileSync(path.join(process.env.NOVA_DATA_DIR, 'projects', 'load.jsonl'), 'utf8').trim().split('\n').pop());
  assert.equal(line.projectId, p.id);
  assert.equal(typeof line.load, 'number');
  _setSchedulerDepsForTest(null);
});

test('after a restart: a cut-off job runs once more, then fails plainly', async () => {
  const p = project();
  const j = k().enqueueJob(p, { kind: 'research', input: 'x' });
  const rec = await store.createRecord({ id: 'cut00001', kind: 'project-research', status: 'classifying', text: 'Research: x', createdAt: new Date().toISOString(), projectId: p.id });
  k().updateJob(p, j.id, { status: 'running', attempts: 1, recordId: rec.id });
  let r = await reconcileProjectJobs(vault);
  assert.equal(r.requeued >= 1, true);
  assert.equal(k().readQueue(p).jobs[0].status, 'queued');
  assert.equal((await store.getRecord(rec.id)).status, 'error');
  k().updateJob(p, j.id, { status: 'running', attempts: 2, recordId: null });
  r = await reconcileProjectJobs(vault);
  assert.equal(k().readQueue(p).jobs[0].status, 'failed');
});

test('Retry on a failed job record puts the job back and starts it', async () => {
  const p = project();
  const j = k().enqueueJob(p, { kind: 'draft', input: 'x' });
  k().updateJob(p, j.id, { status: 'failed', error: 'boom' });
  const rec = await store.createRecord({ id: 'fail0001', kind: 'project-job', status: 'error', error: 'boom', text: 'Draft: x', createdAt: new Date().toISOString(), projectId: p.id, jobId: j.id });
  _setSchedulerDepsForTest({ busy: async () => false, runJob: async () => ({ recordId: 'new00001', done: new Promise(() => {}) }) });
  const after = await retryProjectJob(vault, rec);
  assert.equal(after.status, 'withdrawn');
  assert.match(after.destination, /Running again/);
  assert.equal(k().readQueue(p).jobs[0].status, 'running');
  _setSchedulerDepsForTest(null);
});

test('the morning line is counted, one line, and absent when nothing happened', async () => {
  const p = project();
  const a = k().enqueueJob(p, { kind: 'draft', input: 'a' });
  const b = k().enqueueJob(p, { kind: 'draft', input: 'b' });
  k().updateJob(p, a.id, { status: 'done', endedAt: new Date().toISOString() });
  k().updateJob(p, b.id, { status: 'waiting' });
  const line = await projectsMorningLine(vault);
  assert.match(line, new RegExp(`${p.name}: 1 job finished, 1 waiting on you`));
  assert.equal(line.split('\n').length, 1);
  assert.equal(await projectsMorningLine(vault, { since: Date.now() + 1000 }) === null || /waiting on you/.test(await projectsMorningLine(vault, { since: Date.now() + 1000 })), true);
});

test('the project folders are real git repos (the commit path is not mocked)', () => {
  const p = project();
  assert.equal(execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: p.folder, encoding: 'utf8' }).trim(), 'true');
});

test('a job answers only for what it changed: an earlier uncommitted file is not its own', async () => {
  const p = project({ draft: true });
  writeFileSync(path.join(p.folder, 'deliverables', 'earlier.md'), 'from an earlier job\n');
  _setJobDepsForTest({ ...quiet, run: stubRun({ write: { 'deliverables/new.md': 'new\n' } }).run });
  const job = k().enqueueJob(p, { kind: 'draft', input: 'x' });
  const { recordId, done } = await runProjectJob(vault, k(), p.id, job);
  await done;
  const r = await store.getRecord(recordId);
  assert.deepEqual(r.decision.payload.files, ['deliverables/new.md']);
  await undoFiling(vault, r.undoData);
  assert.equal(existsSync(path.join(p.folder, 'deliverables', 'earlier.md')), true);
  _setJobDepsForTest(null);
});

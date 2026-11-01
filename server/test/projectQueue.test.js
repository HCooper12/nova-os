// THE PROJECT QUEUE (phase 3, PROJECTS-PLAN §5): a job is queued only when its
// allowance is on, starts only when what it needs is done, and its state moves
// only through the kernel.
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-queue-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'projects-env');

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { makeKernel, runnableJobs, blockedJobs, inWindow } = await import('../lib/projectKernel.js');

function fresh() {
  rmSync(path.join(base, 'h'), { recursive: true, force: true });
  const host = { name: 'Nova', projectsRoot: path.join(base, 'h', 'Projects'), dataDir: path.join(base, 'h', 'data'), vaultRoot: path.join(base, 'h', 'vault') };
  mkdirSync(host.vaultRoot, { recursive: true });
  return makeKernel(host);
}

const brief = (allowances = { research: true, draft: true }) => ({
  name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'Furniture chosen', deadline: null,
  phases: [{ name: 'Measure' }], reads: [], allowances, limit: {}, firstMoves: ['find three videos'],
});

test('a job is queued, logged and read back', () => {
  const k = fresh();
  const { project } = k.createProject(brief(), { withPage: false });
  const job = k.enqueueJob(project, { kind: 'research', input: '  three calm bedrooms  ', origin: 'spoken' });
  assert.equal(job.status, 'queued');
  assert.equal(job.input, 'three calm bedrooms');
  assert.equal(job.origin, 'spoken');
  assert.deepEqual(k.readQueue(project.id).jobs.map((j) => j.id), [job.id]);
  assert.match(readFileSync(path.join(project.folder, 'LOG.md'), 'utf8'), /queue · queued research: three calm bedrooms/);
});

test('a kind whose allowance is off is refused, naming the switch', () => {
  const k = fresh();
  const { project } = k.createProject(brief({ research: true }), { withPage: false });
  assert.throws(() => k.enqueueJob(project, { kind: 'code', input: 'build it' }), (e) => e.code === 'allowance' && /turn Code on/.test(e.message));
  assert.throws(() => k.enqueueJob(project, { kind: 'draft', input: 'write it' }), (e) => e.code === 'allowance');
  assert.throws(() => k.enqueueJob(project, { kind: 'deploy', input: 'ship it' }), (e) => e.code === 'job');
  assert.equal(k.readQueue(project).jobs.length, 0);
});

test('a linked project has no queue and refuses one', () => {
  const k = fresh();
  const linked = { id: 'aaaaaaaa', name: 'Science Atlas', linked: true, allowances: { research: true } };
  assert.deepEqual(k.readQueue(linked), { jobs: [] });
  assert.throws(() => k.enqueueJob(linked, { kind: 'research', input: 'x' }), (e) => e.code === 'linked');
});

test('needs: a job waits for the one before it, and a failed need blocks it', () => {
  const k = fresh();
  const { project } = k.createProject(brief(), { withPage: false });
  const a = k.enqueueJob(project, { kind: 'research', input: 'find' });
  const b = k.enqueueJob(project, { kind: 'draft', input: 'write it up', needs: [a.id] });
  assert.deepEqual(runnableJobs(k.readQueue(project)).map((j) => j.id), [a.id]);
  k.updateJob(project, a.id, { status: 'done' });
  assert.deepEqual(runnableJobs(k.readQueue(project)).map((j) => j.id), [b.id]);
  k.updateJob(project, a.id, { status: 'failed' });
  assert.deepEqual(runnableJobs(k.readQueue(project)), []);
  assert.deepEqual(blockedJobs(k.readQueue(project)).map((j) => j.id), [b.id]);
  assert.throws(() => k.enqueueJob(project, { kind: 'draft', input: 'x', needs: ['nothere1'] }), (e) => e.code === 'job');
});

test('stop and ask: a waiting job goes back in the queue only with his answer', () => {
  const k = fresh();
  const { project } = k.createProject(brief(), { withPage: false });
  const j = k.enqueueJob(project, { kind: 'draft', input: 'a shortlist' });
  assert.throws(() => k.answerJob(project, j.id, 'oak'), (e) => e.code === 'job');
  k.updateJob(project, j.id, { status: 'waiting', ask: { question: 'Oak or walnut?', pick: 'oak' } });
  assert.throws(() => k.answerJob(project, j.id, '   '), (e) => e.code === 'job');
  const back = k.answerJob(project, j.id, 'walnut');
  assert.equal(back.status, 'queued');
  assert.equal(back.answer, 'walnut');
  assert.equal(back.ask.question, 'Oak or walnut?');
});

test('cancel: only a queued or waiting job, and it is logged', () => {
  const k = fresh();
  const { project } = k.createProject(brief(), { withPage: false });
  const j = k.enqueueJob(project, { kind: 'research', input: 'x' });
  k.updateJob(project, j.id, { status: 'running' });
  assert.throws(() => k.cancelJob(project, j.id), (e) => e.code === 'job');
  k.updateJob(project, j.id, { status: 'queued' });
  assert.equal(k.cancelJob(project, j.id).status, 'cancelled');
  assert.match(k.readLog(project), /cancelled research: x/);
});

test('updateJob keeps the job shape: no new keys, no unknown states', () => {
  const k = fresh();
  const { project } = k.createProject(brief(), { withPage: false });
  const j = k.enqueueJob(project, { kind: 'research', input: 'x' });
  const after = k.updateJob(project, j.id, { kind: 'code', input: 'rm -rf', status: 'running' });
  assert.equal(after.kind, 'research');
  assert.equal(after.input, 'x');
  assert.throws(() => k.updateJob(project, j.id, { status: 'pushed' }), (e) => e.code === 'job');
});

test('the window: overnight across midnight, and a bad window falls back to 22:00 to 07:00', () => {
  const at = (h, m = 0) => h * 60 + m;
  const night = { from: '22:00', to: '07:00' };
  assert.equal(inWindow(night, at(22)), true);
  assert.equal(inWindow(night, at(3, 30)), true);
  assert.equal(inWindow(night, at(6, 59)), true);
  assert.equal(inWindow(night, at(7)), false);
  assert.equal(inWindow(night, at(12)), false);
  assert.equal(inWindow({ from: '25:00', to: 'x' }, at(23)), true);
  assert.equal(inWindow({ from: '09:00', to: '09:00' }, at(9)), false);
});

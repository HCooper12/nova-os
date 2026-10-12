// A finished Builder/Breaker answer survives the process that ran it
// (12 Oct: the phone came back to "working" all night after the run had
// finished). Own data dir, set BEFORE the import: never his live server/data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-codejobs-'));
process.env.NOVA_DATA_DIR = dir;
const { saveCodeJob, loadCodeJob, sweepCodeJobs, watchCodeJobs } = await import('../lib/codeJobStore.js');
test.after(() => rm(dir, { recursive: true, force: true }));

test('a settled job is written once it settles, and read back after memory forgets it', async () => {
  const memory = new Map([['35258d26', { id: '35258d26', status: 'running', result: null, error: null }]]);
  const w = watchCodeJobs({ getJob: (id) => memory.get(id), everyMs: 60_000 });
  w.add('35258d26');
  await w.tick();
  assert.equal(await loadCodeJob('35258d26'), null, 'nothing written while it is still running');
  memory.get('35258d26').status = 'ready';
  memory.get('35258d26').result = { text: 'The code is changed', sessionId: 'abc' };
  await w.tick();
  w.stop();
  memory.clear(); // the restart
  const back = await loadCodeJob('35258d26');
  assert.equal(back.status, 'ready');
  assert.equal(back.result.text, 'The code is changed');
  assert.equal(w.pending.size, 0);
});

test('ids that are not job ids are never turned into paths', async () => {
  assert.equal(await loadCodeJob('../../etc/passwd'), null);
  await saveCodeJob({ id: '../x', status: 'ready' });
  assert.ok(!(await readdir(path.join(dir, 'code-jobs'))).includes('x.json'));
});

test('a week-old answer is swept', async () => {
  await saveCodeJob({ id: 'aaaaaaaa', status: 'ready', result: { text: 'old' } });
  const old = (Date.now() - 8 * 24 * 3600_000) / 1000;
  await utimes(path.join(dir, 'code-jobs', 'aaaaaaaa.json'), old, old);
  assert.equal(await sweepCodeJobs(), 1);
  assert.equal(await loadCodeJob('aaaaaaaa'), null);
});

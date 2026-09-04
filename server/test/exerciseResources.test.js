// The batch writer that will apply 105 form-video links in one go.
//
// Doing this through setExerciseKnowledge would take 105 write locks and leave
// 105 backups of one file. The batch is one lock, one backup, one undo — and
// the property that matters is ALL-OR-NOTHING: a bad URL in the ninetieth
// entry must refuse the whole batch, not leave his library half updated with
// no record of where it stopped.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-exres-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-exres-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0'; // the state cache is per module — a scratch vault is not independent without this

import test from 'node:test';
import assert from 'node:assert/strict';

const { addCustomExercise, loadExerciseLibrary, setExerciseResources } = await import('../lib/exercises.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const a = await addCustomExercise(vault, 'Test Row', 'Back', 'weight_reps');
const b = await addCustomExercise(vault, 'Test Curl', 'Biceps', 'weight_reps');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const urlFor = async (id) => {
  const { exercises } = await loadExerciseLibrary(vault);
  return exercises.find((e) => e.id === id)?.resourceUrl ?? null;
};

test('a batch writes every entry in one pass', async () => {
  const res = await setExerciseResources(vault, [
    { id: a.id, resourceUrl: 'https://www.youtube.com/watch?v=aaa' },
    { id: b.id, resourceUrl: 'https://www.youtube.com/watch?v=bbb' },
  ]);
  assert.equal(res.written, 2);
  assert.equal(await urlFor(a.id), 'https://www.youtube.com/watch?v=aaa');
  assert.equal(await urlFor(b.id), 'https://www.youtube.com/watch?v=bbb');
});

test('a bad URL anywhere refuses the WHOLE batch', async () => {
  // the property this test exists for: nothing is half-applied
  await assert.rejects(
    () => setExerciseResources(vault, [
      { id: a.id, resourceUrl: 'https://www.youtube.com/watch?v=changed' },
      { id: b.id, resourceUrl: 'javascript:alert(1)' },
    ]),
    /not an http\(s\) link/,
  );
  assert.equal(await urlFor(a.id), 'https://www.youtube.com/watch?v=aaa', 'the first entry must NOT have been written');
});

test('an unknown exercise id refuses the whole batch too', async () => {
  await assert.rejects(
    () => setExerciseResources(vault, [
      { id: a.id, resourceUrl: 'https://www.youtube.com/watch?v=zzz' },
      { id: 'no-such-exercise', resourceUrl: 'https://www.youtube.com/watch?v=yyy' },
    ]),
    /no exercise "no-such-exercise"/,
  );
  assert.equal(await urlFor(a.id), 'https://www.youtube.com/watch?v=aaa', 'still untouched');
});

test('an empty url clears the link rather than storing an empty string', async () => {
  await setExerciseResources(vault, [{ id: b.id, resourceUrl: '' }]);
  assert.equal(await urlFor(b.id), null);
});

test('an empty batch is a no-op, not an error', async () => {
  const res = await setExerciseResources(vault, []);
  assert.equal(res.written, 0);
  assert.equal(await urlFor(a.id), 'https://www.youtube.com/watch?v=aaa');
});

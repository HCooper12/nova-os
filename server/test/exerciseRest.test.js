// A lift's own rest time (16 Oct 2026): set once, kept on the exercise, so it
// applies on every day. Temp vault, never his.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-rest-data-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-rest-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const X = await import('../lib/exercises.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const find = async (id) => (await X.loadExerciseLibrary(vault)).exercises.find((e) => e.id === id);

test('a rest time is kept on the exercise and read back from the library', async () => {
  const { exercises } = await X.loadExerciseLibrary(vault);
  const bench = exercises.find((e) => /bench/i.test(e.name));
  assert.ok(bench && bench.restSeconds === undefined, 'starts with no rest of its own');
  const out = await X.setExerciseKnowledge(vault, bench.id, { restSeconds: 120 });
  assert.equal(out.restSeconds, 120);
  assert.equal((await find(bench.id)).restSeconds, 120);
  const raw = await readFile(path.join(vault, X.LIBRARY_REL_PATH), 'utf8');
  assert.match(raw, /restSeconds: 120/);
  // other exercises are untouched
  const others = (await X.loadExerciseLibrary(vault)).exercises.filter((e) => e.id !== bench.id);
  assert.ok(others.every((e) => e.restSeconds === undefined));
});

test('it rounds to 5 s, refuses nonsense, and clears back to the general setting', async () => {
  const { exercises } = await X.loadExerciseLibrary(vault);
  const id = exercises[0].id;
  assert.equal((await X.setExerciseKnowledge(vault, id, { restSeconds: 92 })).restSeconds, 90);
  await assert.rejects(() => X.setExerciseKnowledge(vault, id, { restSeconds: 5 }), /restSeconds must be/);
  await assert.rejects(() => X.setExerciseKnowledge(vault, id, { restSeconds: 9000 }), /restSeconds must be/);
  await assert.rejects(() => X.setExerciseKnowledge(vault, id, { restSeconds: 'soon' }), /restSeconds must be/);
  assert.equal((await find(id)).restSeconds, 90, 'a refused value changes nothing');
  const cleared = await X.setExerciseKnowledge(vault, id, { restSeconds: null });
  assert.equal(cleared.restSeconds, undefined);
  assert.equal((await find(id)).restSeconds, undefined);
});

test('setting a rest leaves cues and the link alone, and the reverse', async () => {
  const { exercises } = await X.loadExerciseLibrary(vault);
  const id = exercises[1].id;
  await X.setExerciseKnowledge(vault, id, { cues: 'brace', resourceUrl: 'https://example.com/x' });
  await X.setExerciseKnowledge(vault, id, { restSeconds: 150 });
  let e = await find(id);
  assert.deepEqual([e.cues, e.resourceUrl, e.restSeconds], ['brace', 'https://example.com/x', 150]);
  await X.setExerciseKnowledge(vault, id, { cues: 'tuck' });
  e = await find(id);
  assert.equal(e.restSeconds, 150);
});

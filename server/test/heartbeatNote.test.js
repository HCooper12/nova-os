// A loop's last word about itself — "couldn't run — workout data unreadable"
// — beside its beat, and carried on the Ops agent payload until a run that
// could look clears it. The beats file's shape is untouched.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-hbnote-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { beat, note, readNotes, readHeartbeats } = await import('../lib/heartbeat.js');
const { composeOps } = await import('../lib/ops.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('note: recorded with a timestamp, read back, carried by Ops, and cleared by null', async () => {
  await beat('training-check');
  await note('training-check', "couldn't run — workout data unreadable (ENOENT)");
  const notes = await readNotes();
  assert.match(notes['training-check'].note, /couldn't run/);
  assert.ok(notes['training-check'].at);
  // the beats file stays a plain name → ISO map
  const beats = await readHeartbeats();
  assert.equal(typeof beats['training-check'], 'string');
  assert.equal(Object.keys(JSON.parse(await readFile(path.join(dataDir, 'heartbeat.json'), 'utf8'))).length, 1);

  const ops = await composeOps();
  const tc = ops.agents.find((a) => a.id === 'training-check');
  assert.match(tc.lastNote.note, /workout data unreadable/);
  assert.equal(ops.agents.find((a) => a.id === 'compost').lastNote, null, 'a loop with no word has null, not an empty string');

  await note('training-check', null);
  assert.deepEqual(await readNotes(), {});
  assert.equal((await composeOps()).agents.find((a) => a.id === 'training-check').lastNote, null);
});

test('note: clearing a note that was never set does not create the file', async () => {
  const fresh = await mkdtemp(path.join(tmpdir(), 'nova-hbnote2-'));
  const prev = process.env.NOVA_DATA_DIR;
  process.env.NOVA_DATA_DIR = fresh;
  try {
    await note('compost', null);
    assert.ok(!existsSync(path.join(fresh, 'heartbeat-notes.json')));
  } finally {
    process.env.NOVA_DATA_DIR = prev;
    await rm(fresh, { recursive: true, force: true });
  }
});

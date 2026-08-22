// The model board: the single registry every Claude-spawning lane reads its
// model from, plus the on/off switch behind each one. The contract these
// tests pin is the one the 21-Aug Fable-5 incident was about — NO lane may
// ever end up with a blank/absent --model, whatever is (or isn't) stored.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-modelprefs-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  LANES, LANE_GROUPS, MODEL_CHOICES,
  modelFor, laneEnabled, assertLaneOn, laneOffError, laneSkipped,
  getModelPrefs, setLanePref, resetLanePref,
} = await import('../lib/modelPrefs.js');

const PREFS = path.join(dataDir, 'model-prefs.json');
const clean = () => rm(PREFS, { force: true });

test.afterEach(clean);

test('every lane has a real default model, a group that exists, and an honest off-effect', () => {
  const valid = new Set(MODEL_CHOICES.map((m) => m.value));
  const groups = new Set(LANE_GROUPS.map((g) => g.id));
  const ids = new Set();
  for (const lane of LANES) {
    assert.ok(lane.id && !ids.has(lane.id), `duplicate or missing lane id: ${lane.id}`);
    ids.add(lane.id);
    assert.ok(valid.has(lane.def), `${lane.id} defaults to an unrecognised model: ${lane.def}`);
    assert.ok(groups.has(lane.group), `${lane.id} is in an unknown group: ${lane.group}`);
    assert.ok(lane.label && lane.hint && lane.off, `${lane.id} is missing its label/hint/off text`);
  }
});

test('modelFor never returns empty — an unset, unknown or corrupt pref falls back to the default', async () => {
  await clean();
  for (const lane of LANES) {
    const m = modelFor(lane.id);
    assert.equal(m, lane.def);
    assert.ok(typeof m === 'string' && m.length > 0, `${lane.id} produced a blank model`);
  }

  // a stored model that is not on the board is ignored, not passed through
  await writeFile(PREFS, JSON.stringify({ lanes: { coach: { model: 'gpt-9' } } }), 'utf8');
  assert.equal(modelFor('coach'), LANES.find((l) => l.id === 'coach').def);

  // and a corrupt file degrades to the defaults rather than to nothing
  await writeFile(PREFS, 'not json at all', 'utf8');
  assert.equal(modelFor('coach'), LANES.find((l) => l.id === 'coach').def);
});

test('an unknown lane id throws instead of silently resolving', () => {
  assert.throws(() => modelFor('no-such-lane'), /unknown model lane/);
  assert.throws(() => laneEnabled('no-such-lane'), /unknown model lane/);
});

test('a saved model is read back by modelFor, and reset puts it back', async () => {
  await clean();
  await setLanePref('coach', { model: 'claude-sonnet-5' });
  assert.equal(modelFor('coach'), 'claude-sonnet-5');
  assert.equal(getModelPrefs().lanes.find((l) => l.id === 'coach').customised, true);

  await resetLanePref('coach');
  assert.equal(modelFor('coach'), LANES.find((l) => l.id === 'coach').def);
  assert.equal(getModelPrefs().lanes.find((l) => l.id === 'coach').customised, false);
});

test('lanes are ON until switched off, and the switch survives a reload', async () => {
  await clean();
  assert.equal(laneEnabled('researcher'), true);
  assert.equal(assertLaneOn('researcher'), true);

  await setLanePref('researcher', { enabled: false });
  assert.equal(laneEnabled('researcher'), false);
  assert.throws(() => assertLaneOn('researcher'), /switched off in Settings/);

  // the off switch must not disturb the model, and vice versa
  assert.equal(modelFor('researcher'), LANES.find((l) => l.id === 'researcher').def);
  await setLanePref('researcher', { model: 'haiku' });
  assert.equal(laneEnabled('researcher'), false, 'setting a model must not silently switch a lane back on');
  assert.equal(modelFor('researcher'), 'haiku');
});

test('laneOffError names the lane in words a person can act on', async () => {
  await clean();
  const err = laneOffError('coach');
  assert.match(err.message, /Ask Coach/);
  assert.match(err.message, /Settings/);
  assert.equal(err.laneOff, 'coach');
});

test('laneSkipped reports true only when off — the background lanes\' quiet path', async () => {
  await clean();
  assert.equal(laneSkipped('daily-review', 'test'), false);
  await setLanePref('daily-review', { enabled: false });
  assert.equal(laneSkipped('daily-review', 'test'), true);
});

test('writes are validated: a bad model or lane is rejected, not stored', async () => {
  await clean();
  await assert.rejects(() => setLanePref('coach', { model: 'gpt-9' }), /model must be one of/);
  await assert.rejects(() => setLanePref('nope', { model: 'opus' }), /unknown lane/);
  await assert.rejects(() => setLanePref('coach', { enabled: 'yes' }), /enabled must be true or false/);
  assert.equal(modelFor('coach'), LANES.find((l) => l.id === 'coach').def);
});

test('getModelPrefs returns the whole board, each lane resolved', async () => {
  await clean();
  const board = getModelPrefs();
  assert.equal(board.lanes.length, LANES.length);
  assert.deepEqual(board.models, MODEL_CHOICES);
  for (const lane of board.lanes) {
    assert.ok(lane.model, `${lane.id} came back without a model`);
    assert.equal(lane.enabled, true);
  }
});

test('resetLanePref with no lane clears the whole board', async () => {
  await clean();
  await setLanePref('coach', { model: 'haiku', enabled: false });
  await setLanePref('pulse', { model: 'opus' });
  await resetLanePref();
  assert.equal(modelFor('coach'), LANES.find((l) => l.id === 'coach').def);
  assert.equal(modelFor('pulse'), LANES.find((l) => l.id === 'pulse').def);
  assert.equal(laneEnabled('coach'), true);
});

// The regression that motivated the whole file: a spawn site that forgets to
// name a model inherits the account's ambient default. This walks the real
// source and fails if any CLAUDE_BIN spawn is missing a --model flag, or
// names one as a bare literal instead of going through the board.
test('every spawn site in server/lib names its model through the board', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
  const offenders = [];
  const literals = [];
  for (const name of await readdir(libDir)) {
    if (!name.endsWith('.js') || name === 'modelPrefs.js') continue;
    const src = await readFile(path.join(libDir, name), 'utf8');
    const spawns = (src.match(/spawn\(CLAUDE_BIN/g) || []).length;
    if (!spawns) continue;
    if (!src.includes('modelFor(')) offenders.push(name);
    if (/'--model',\s*'/.test(src)) literals.push(name);
  }
  assert.deepEqual(offenders, [], `these files spawn the CLI without reading the model board: ${offenders.join(', ')}`);
  assert.deepEqual(literals, [], `these files hard-code a model literal instead of using modelFor(): ${literals.join(', ')}`);
});

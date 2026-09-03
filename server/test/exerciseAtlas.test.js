// The anatomy table is only useful if it stays in step with his library.
//
// The failure this prevents is silent by nature: an exercise with no atlas
// entry, or an entry naming a muscle that does not exist, renders a body
// diagram with nothing lit. It looks like a lift that trains nothing rather
// than like a bug, so no one reports it. Hence a test rather than a
// convention.
//
// Two halves. The internal checks always run. The coverage check runs against
// HIS REAL LIBRARY when the vault is reachable (it is, on his Mac, from
// server/.env) — that is the half that catches an exercise he adds in the app
// and the atlas never hears about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXERCISE_ATLAS, atlasFor } from '../lib/data/exerciseAtlas.js';
import { MUSCLE_IDS, EQUIPMENT, resolveMuscles, viewsFor } from '../lib/muscles.js';
import { loadExerciseLibrary, LIBRARY_REL_PATH } from '../lib/exercises.js';

const entries = Object.entries(EXERCISE_ATLAS);

test('every atlas muscle exists in the vocabulary', () => {
  for (const [id, a] of entries) {
    for (const m of [...a.primary, ...a.secondary]) {
      assert.ok(MUSCLE_IDS.includes(m), `${id} names "${m}", which is not a muscle`);
    }
  }
});

test('every atlas entry names equipment we recognise', () => {
  for (const [id, a] of entries) {
    assert.ok(EQUIPMENT.includes(a.equipment), `${id} has equipment "${a.equipment}"`);
  }
});

test('every exercise trains at least one primary muscle', () => {
  // a lift with no primary lights nothing — the exact silent failure above
  for (const [id, a] of entries) {
    assert.ok(a.primary.length > 0, `${id} has no primary muscle`);
    assert.ok(a.primary.length <= 3, `${id} claims ${a.primary.length} primary muscles — the diagram stops meaning anything`);
  }
});

test('no muscle is both primary and secondary on the same lift', () => {
  for (const [id, a] of entries) {
    const both = a.primary.filter((m) => a.secondary.includes(m));
    assert.deepEqual(both, [], `${id} lists ${both.join(', ')} twice — one region cannot be two colours`);
  }
});

test('resolveMuscles reports what it dropped instead of swallowing it', () => {
  const r = resolveMuscles(['triceps', 'posterior chain'], ['chest']);
  assert.deepEqual(r.primary, ['triceps']);
  assert.deepEqual(r.dropped, ['posterior chain'], 'an unmapped name must be visible, not silently gone');
});

test('a muscle named twice resolves to primary only', () => {
  const r = resolveMuscles(['biceps'], ['biceps', 'forearms']);
  assert.deepEqual(r.primary, ['biceps']);
  assert.deepEqual(r.secondary, ['forearms']);
});

test('views follow the muscles, front first, and are empty when nothing maps', () => {
  assert.deepEqual(viewsFor(['chest']), ['front']);
  assert.deepEqual(viewsFor(['lats']), ['back']);
  assert.deepEqual(viewsFor(['chest', 'lats']), ['front', 'back'], 'front is drawn first');
  assert.deepEqual(viewsFor([]), [], 'no muscles means no diagram, not a blank body');
});

test('the shoulder question he asked about resolves to real regions', () => {
  // "how do I grow my shoulders" should reach the three deltoid heads across
  // his library, not a single lump called Shoulders
  const heads = new Set();
  for (const [, a] of entries) {
    for (const m of [...a.primary, ...a.secondary]) if (m.endsWith('-delts')) heads.add(m);
  }
  assert.deepEqual([...heads].sort(), ['front-delts', 'rear-delts', 'side-delts']);
});

// ---- against his real library ----
// The suite does not export VAULT_PATH, so reading only the environment made
// both checks below skip on the one machine where they matter — a green run
// that proved nothing. Read server/.env the way the server itself does, and
// skip only where there genuinely is no vault (CI, a fresh clone).
function vaultFromEnvFile() {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  try {
    const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^VAULT_PATH=(.*)$/);
      if (m) return m[1].trim();
    }
  } catch { /* no .env — the skip below is the honest outcome */ }
  return null;
}
const vaultPath = vaultFromEnvFile();
const haveVault = !!vaultPath && existsSync(path.join(vaultPath, LIBRARY_REL_PATH));

test('the atlas covers his real library exactly, both ways', { skip: haveVault ? false : 'vault not reachable' }, async () => {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const missing = exercises.filter((e) => !atlasFor(e.id)).map((e) => `${e.id} (${e.name})`);
  assert.deepEqual(missing, [], 'exercises in his library with no anatomy — their diagram would be blank');
  const ids = new Set(exercises.map((e) => e.id));
  const stale = Object.keys(EXERCISE_ATLAS).filter((id) => !ids.has(id));
  assert.deepEqual(stale, [], 'atlas entries for exercises that no longer exist');
});

test('every exercise resolves to at least one drawable view', { skip: haveVault ? false : 'vault not reachable' }, async () => {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  for (const e of exercises) {
    const a = atlasFor(e.id);
    const r = resolveMuscles(a.primary, a.secondary);
    assert.ok(r.views.length > 0, `${e.name} would render no body diagram`);
    assert.deepEqual(r.dropped, [], `${e.name} names a muscle that does not resolve`);
  }
});

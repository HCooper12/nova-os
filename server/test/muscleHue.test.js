// EVERY MUSCLE HAS A HUE, and the hue is a token that exists. Pinned so a
// group added to the library, or a theme block that forgets a token, is
// caught here rather than seen as a colourless bar on his phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MUSCLE_GROUPS } from '../lib/exercises.js';
import { MUSCLE_IDS } from '../lib/muscles.js';
import { MUSCLE_TOKEN, MUSCLE_HEX, ANATOMY_GROUP, muscleVar, muscleHex, muscleHexStatic, musclePalette } from '../../src/muscleHue.js';

test('every muscle group in the library owns a token and a hex', () => {
  for (const g of MUSCLE_GROUPS) {
    assert.ok(MUSCLE_TOKEN[g], `${g} has no token`);
    assert.match(MUSCLE_HEX[g] || '', /^#[0-9a-f]{6}$/i, `${g} has no hex`);
  }
});

test('the tokens are declared on :root in index.css, once each, with the same hex', async () => {
  const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');
  for (const [g, token] of Object.entries(MUSCLE_TOKEN)) {
    const re = new RegExp(`${token.replace(/[-]/g, '\\-')}\\s*:\\s*(#[0-9a-fA-F]{6})`, 'g');
    const hits = [...css.matchAll(re)].map((m) => m[1].toLowerCase());
    assert.ok(hits.length >= 1, `${token} (${g}) is not declared in index.css`);
    assert.equal(hits[0], MUSCLE_HEX[g].toLowerCase(), `${token}'s first declaration (:root) must match MUSCLE_HEX`);
  }
});

test('every anatomy region the body draws files under a group that has a hue', () => {
  for (const id of MUSCLE_IDS) {
    const g = ANATOMY_GROUP[id];
    assert.ok(g, `${id} is not filed under a group`);
    assert.ok(MUSCLE_TOKEN[g], `${id} files under ${g}, which has no hue`);
  }
  for (const id of Object.keys(ANATOMY_GROUP)) assert.ok(MUSCLE_IDS.includes(id), `${id} is not an anatomy id the server knows`);
});

test('an anatomy id and any casing of a group resolve to the same hue', () => {
  assert.equal(muscleVar('lats'), 'var(--nv-m-back)');
  assert.equal(muscleVar('BACK'), 'var(--nv-m-back)');
  assert.equal(muscleVar('back'), muscleVar('Back'));
  assert.equal(muscleHexStatic('front-delts'), MUSCLE_HEX.Shoulders);
  assert.equal(muscleHexStatic('nothing'), null);
});

test('no two muscles share a hue', () => {
  const hexes = Object.values(MUSCLE_HEX).map((h) => h.toLowerCase());
  assert.equal(new Set(hexes).size, hexes.length);
});

test('helpers degrade honestly for an unknown group', () => {
  assert.equal(muscleVar('Chest'), 'var(--nv-m-chest)');
  assert.equal(muscleVar('Nonsense'), 'var(--nv-ink40)');
  assert.equal(muscleHex('Triceps'), '#b48cff');
  assert.equal(muscleHex('Nonsense'), null);
  assert.deepEqual(musclePalette('Chest'), { primary: '#ff8a7a', secondary: '#59e6ff' });
  assert.equal(musclePalette(undefined), null);
});

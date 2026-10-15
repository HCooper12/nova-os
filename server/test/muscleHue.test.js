// EVERY MUSCLE HAS A HUE, and the hue is a token that exists. Pinned so a
// group added to the library, or a theme block that forgets a token, is
// caught here rather than seen as a colourless bar on his phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MUSCLE_GROUPS } from '../lib/exercises.js';
import { MUSCLE_IDS, MUSCLES } from '../lib/muscles.js';
import { MUSCLE_TOKEN, MUSCLE_HEX, ANATOMY_GROUP, MUSCLE_SIDE, MIXED_TOKEN, anatomyOf, sideFor, muscleVar, muscleHex, muscleHexStatic, musclePalette } from '../../src/muscleHue.js';

test('every muscle group in the library owns a token and a hex', () => {
  for (const g of MUSCLE_GROUPS) {
    assert.ok(MUSCLE_TOKEN[g], `${g} has no token`);
    assert.match(MUSCLE_HEX[g] || '', /^#[0-9a-f]{6}$/i, `${g} has no hex`);
  }
});

// A token is either declared as a hex in index.css (the original thirteen),
// or, for a group the 15 Oct split made, as a color-mix of two of those in
// src/muscleTaxonomy.css, whose dark-ground hex is the srgb mix of theirs.
const hexOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, pct, b) => `#${hexOf(a).map((x, i) => Math.round((x * pct + hexOf(b)[i] * (100 - pct)) / 100).toString(16).padStart(2, '0')).join('')}`;

test('the tokens are declared on :root, once each, with the same hex', async () => {
  const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');
  const mixes = await readFile(new URL('../../src/muscleTaxonomy.css', import.meta.url), 'utf8');
  const rootHex = (token) => {
    const re = new RegExp(`${token.replace(/[-]/g, '\\-')}\\s*:\\s*(#[0-9a-fA-F]{6})`, 'g');
    return [...css.matchAll(re)].map((m) => m[1].toLowerCase())[0] || null;
  };
  for (const [g, token] of Object.entries(MUSCLE_TOKEN)) {
    const mix = MIXED_TOKEN[token];
    if (!mix) {
      assert.ok(rootHex(token), `${token} (${g}) is not declared in index.css`);
      assert.equal(rootHex(token), MUSCLE_HEX[g].toLowerCase(), `${token}'s first declaration (:root) must match MUSCLE_HEX`);
      continue;
    }
    const [a, pct, b] = mix;
    assert.ok(mixes.includes(`${token}: color-mix(in srgb, var(${a}) ${pct}%, var(${b}));`), `${token} (${g}) is declared as the mix it claims`);
    const want = mixHex(rootHex(a), pct, rootHex(b));
    // srgb rounding may differ by one step per channel between engines
    hexOf(want).forEach((x, i) => assert.ok(Math.abs(x - hexOf(MUSCLE_HEX[g])[i]) <= 1, `${g}: ${MUSCLE_HEX[g]} is not the mix ${want}`));
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
  assert.equal(muscleVar('LATS'), 'var(--nv-m-back)');
  // an old name still has a hue: the head that kept the family's colour
  assert.equal(muscleVar('BACK'), 'var(--nv-m-back)');
  assert.equal(muscleVar('back'), muscleVar('Back'));
  assert.equal(muscleVar('Shoulders'), 'var(--nv-m-shoulders)');
  assert.equal(muscleVar('rhomboids'), 'var(--nv-m-upper-back)');
  assert.equal(muscleHexStatic('front-delts'), MUSCLE_HEX['Front Delts']);
  assert.equal(muscleHexStatic('side-delts'), MUSCLE_HEX['Side Delts']);
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

// THE SPOKEN REPORT LIGHTS A GROUP, NOT A REGION. "Chest" has to light every
// chest region and choose a camera side without asking the server, so the
// client's copy of the sides is pinned to the server's `views`.
test('every group resolves to its regions, and every region to a side', () => {
  for (const g of MUSCLE_GROUPS) {
    const ids = anatomyOf(g);
    if (g === 'Full Body' || g === 'Mobility') { assert.deepEqual(ids, [], `${g} is a filing, not anatomy`); continue; }
    // two groups own no region: glute medius and grip light their hosts
    assert.ok(ids.length, `${g} lights nothing`);
    for (const id of ids) assert.ok(MUSCLE_IDS.includes(id), `${g} → ${id} is not anatomy`);
  }
  assert.deepEqual(anatomyOf('chest'), ['chest']);
  assert.deepEqual(anatomyOf('Back'), ['lats', 'rhomboids', 'traps', 'lower-back'], 'an old name lights its whole family');
  assert.deepEqual(anatomyOf('Abductors'), ['glutes']);
  assert.deepEqual(anatomyOf('Grip'), ['forearms']);
  assert.deepEqual(anatomyOf('Rear Delts'), ['rear-delts']);
  for (const id of MUSCLE_IDS) {
    const side = MUSCLE_SIDE[id];
    assert.ok(side, `${id} has no side`);
    assert.ok(MUSCLES[id].views.includes(side), `${id}: client says ${side}, server draws ${MUSCLES[id].views.join('/')}`);
  }
  assert.equal(sideFor(anatomyOf('Back')), 'back');
  assert.equal(sideFor(anatomyOf('Shoulders')), 'front', 'a mixed group is seen from the front');
  assert.equal(sideFor([]), 'three-quarter');
});

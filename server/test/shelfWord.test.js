// THE WORD ON THE BACK WALL. The 3D room had a plank, two washes of light and
// some dust — nothing with an edge, so the volumes stood in front of nothing.
// A word set behind them and CUT by them is the depth the room was missing.
//
// Three contracts, none of which a screenshot would catch going stale: the
// word names the filter you are actually looking at, it sits between the wall
// and the books in z, and the plane is disposed with the rest of the room.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shelf = await readFile(path.join(ROOT, 'src', 'shelf3d', 'Shelf3D.jsx'), 'utf8');
const vals = await readFile(path.join(ROOT, 'src', 'vals', 'valsLibrary.js'), 'utf8');
const screen = await readFile(path.join(ROOT, 'src', 'screens', 'Library.jsx'), 'utf8');

test('every filter chip has a word, and the shelf is handed one', () => {
  // The chips valsLibrary actually builds. If a sixth kind lands on the shelf
  // and nobody gives it a word, the wall silently keeps the previous one.
  const chipKeys = ['all', 'book', 'video', 'podcast', 'article'];
  const block = vals.match(/const SHELF_WORD = \{([\s\S]*?)\};/);
  assert.ok(block, 'SHELF_WORD is gone from valsLibrary');
  for (const k of chipKeys) {
    assert.match(block[1], new RegExp(`\\b${k}:\\s*'[^']+'`), `no wall word for the "${k}" filter`);
  }
  assert.match(vals, /libraryWord:/, 'valsLibrary no longer exposes libraryWord');
  assert.match(screen, /<Shelf3D[^>]*word=\{v\.libraryWord\}/,
    'the Library screen no longer hands the stage its word');
});

test('the word stands between the wall and the books', () => {
  // glowWall still carries its z as a literal; the word's is a named constant,
  // so each is read the way it is actually written rather than by one regex
  // that only happens to fit both today.
  const wallM = shelf.match(/glowWall\.position\.set\([^)]*?,\s*(-?[0-9.]+)\s*\)/);
  assert.ok(wallM, 'glowWall has no position.set in Shelf3D.jsx');
  const wordM = shelf.match(/^const WORD_Z = (-?[0-9.]+);/m);
  assert.ok(wordM, 'WORD_Z is not declared as a plain constant in Shelf3D.jsx');
  assert.match(shelf, /wordMesh\.position\.set\(0, WORD_Y, WORD_Z\)/,
    'the word plane is no longer placed from WORD_Y/WORD_Z');
  const wall = Number(wallM[1]);
  const word = Number(wordM[1]);
  // in front of the wash, behind the row — this is the whole trick. Put it at
  // or behind the wall and the books stop cutting it; put it in front of them
  // and it is a caption pasted over the shelf.
  assert.ok(word > wall, `the word (z ${word}) is not in front of the wall (z ${wall})`);
  assert.ok(word < 0, `the word (z ${word}) is not behind the books`);
});

test('the word is a wall, not a headline, and not a glow', () => {
  const m = shelf.match(/^const WORD_ALPHA = ([0-9.]+);/m);
  assert.ok(m, 'WORD_ALPHA is gone');
  const alpha = Number(m[1]);
  assert.ok(alpha > 0.05 && alpha < 0.35,
    `WORD_ALPHA ${alpha} is either invisible or competing with the volumes`);
  // Calm turns the room's lights down (glowFloor/glowWall go to zero). It must
  // not take the label off the wall — that would be Calm deleting information.
  assert.match(shelf, /wordMat\.opacity = WORD_ALPHA \* stageFade;/,
    'the word no longer recedes with the room on open');
  assert.doesNotMatch(shelf, /wordMat\.opacity = [^;]*tokens\.calm/,
    'Calm is switching the word off — Calm dims light, it does not remove labels');
});

test('the plane and its texture are disposed with the room', () => {
  for (const line of ['wordGeo.dispose();', 'wordMat.dispose();', 'if (wordTex) wordTex.dispose();']) {
    assert.ok(shelf.includes(line), `missing teardown: ${line}`);
  }
  // repainted on theme change, because the house serif is not the same face in
  // every theme — a retint alone would leave Daylight wearing Command's type
  assert.match(shelf, /wordMat\.color\.copy\(tokens\.ink\)/, 'the word does not follow the theme ink');
});

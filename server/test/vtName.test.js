// SHARED-ELEMENT NAMES. The Library shipped a morph that could never fire: the
// shelf minted `lib-<hash>-<index>` and the detail header minted nothing. Both
// halves of a view-transition pair fail SILENTLY — the browser cross-fades and
// says nothing — so the only defence is that both ends compute the name the
// same way, from the id alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vtName, vtNameUnlessOpen, vtStyle } from '../../src/vtName.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

// His real ids, read off the running app on 16 Sep — vault paths, not slugs.
const REAL = [
  "Wiki/Sources/Confidence Without BS — Sinek on Announcing Change",
  "Wiki/Sources/Harvey Specter's Five Confidence Keys (Blind Spot)",
  "Wiki/Sources/Kayo's Five Longevity Habits — Right List, Sold Hook",
  "Wiki/Sources/3-Head Delt Isolation Cues (Kian Deehan Reel)",
  'Raw/Original - ccfe2700',
];

// A custom-ident may not start with a digit or a double hyphen, and may not
// contain spaces, slashes, quotes or punctuation. This is the whole reason the
// original hashed instead of using the id.
const CSS_IDENT = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

test('every real vault path becomes a legal CSS identifier', () => {
  for (const id of REAL) {
    const n = vtName('lib', id);
    assert.match(n, CSS_IDENT, `${JSON.stringify(id)} → ${JSON.stringify(n)} is not a usable name`);
    assert.ok(!n.includes('--'), 'a leading/inner double hyphen reads as a custom property');
  }
});

test('the SAME id gives the SAME name — which is the entire point', () => {
  // the fault: the shelf's name embedded an array index, so the detail side
  // could not reproduce it even in principle.
  for (const id of REAL) assert.equal(vtName('lib', id), vtName('lib', id));
  assert.equal(vtName('lib', REAL[0]), vtName('lib', REAL[0]));
});

test('two sources that slugify identically still get different names', () => {
  // titles collide far more often than they look like they will
  const a = vtName('lib', 'Wiki/Sources/The Plan');
  const b = vtName('lib', 'Wiki/Sources/The  Plan');   // two spaces
  const c = vtName('lib', 'Raw/The Plan');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});

test('no two of his real ids collide', () => {
  const names = REAL.map((id) => vtName('lib', id));
  assert.equal(new Set(names).size, REAL.length);
});

test('the prefix separates the families, so a note and a source never clash', () => {
  const id = REAL[0];
  assert.notEqual(vtName('note', id), vtName('lib', id));
});

test('an id that is all punctuation still yields a legal name', () => {
  // slug goes empty; the prefix is what keeps it valid
  for (const odd of ['—', '///', '   ', '(((']) {
    const n = vtName('note', odd);
    assert.match(n, CSS_IDENT, `${JSON.stringify(odd)} → ${JSON.stringify(n)}`);
  }
});

test('a long path does not become a 200-character identifier', () => {
  const n = vtName('lib', 'Wiki/Sources/' + 'a-very-long-title '.repeat(20));
  assert.ok(n.length < 70, `name is ${n.length} chars`);
  assert.match(n, CSS_IDENT);
  assert.doesNotMatch(n, /-{2,}/, 'the slice must not leave a dangling hyphen run');
});

test('no id at all mints nothing, rather than a name for nothing', () => {
  assert.equal(vtName('lib', null), null);
  assert.equal(vtName('lib', undefined), null);
  assert.equal(vtName('lib', ''), null);
  assert.deepEqual(vtStyle('lib', null), {});
  assert.match(String(vtName('lib', 0)), /^lib-0-/, 'a zero id is an id, not an absence');
});

test('THE UNIQUENESS GUARD: the card gives its name up while the detail holds it', () => {
  // two elements with one name = the morph is dropped, silently. This is the
  // trap valsRecipes already handles by hand and nothing else did.
  const id = REAL[0];
  assert.equal(vtNameUnlessOpen('lib', id, id), null, 'the open row must release the name');
  assert.equal(vtNameUnlessOpen('lib', id, REAL[1]), vtName('lib', id), 'a different row keeps it');
  assert.equal(vtNameUnlessOpen('lib', id, null), vtName('lib', id));
  assert.deepEqual(vtStyle('lib', id, id), {}, 'and spreads to nothing');
  assert.deepEqual(vtStyle('lib', id, null), { viewTransitionName: vtName('lib', id) });
});

test('nothing in src/ still mints a name from an ARRAY INDEX', async () => {
  // the original fault, in a form a reader would not notice: `lib-${hue}-${i}`
  // looks stable until the shelf reorders, and cannot be reproduced elsewhere.
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...await walk(full));
      else if (/\.jsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const bad = [];
  for (const f of await walk(SRC)) {
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/viewTransitionName:\s*`([^`]*)`/g)) {
      if (/\$\{\s*i\s*\}|\$\{\s*idx\s*\}|\$\{\s*index\s*\}/.test(m[1])) {
        bad.push(`${path.relative(SRC, f)}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(bad, [], `these names embed a list index:\n${bad.join('\n')}`);
});

// SEARCH → RESULTS (15 Oct 2026, the approved motion set, scene 10): the
// numbers the mockup set, and the choreography's shape in the one FLIP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SEARCH, SEARCH_IN, SEARCH_OUT, searchKey, enterDelay, animates, countLabel } from '../../src/motion/searchMotion.js';

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');

test('the mockup numbers: 45 ms stagger, twelve rows, 180 ms out, 8 px drop', () => {
  assert.deepEqual(SEARCH, { stagger: 45, cap: 12, exitMs: 180, rise: 8 });
  assert.deepEqual(SEARCH_IN, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }]);
  assert.deepEqual(SEARCH_OUT, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }]);
});

test('arrivals wait for the exits, then stack 45 ms apart, never past the twelfth', () => {
  assert.equal(enterDelay(0), 0);
  assert.equal(enterDelay(2), 90);
  assert.equal(enterDelay(0, 180), 180);
  assert.equal(enterDelay(3, 180), 315);
  assert.equal(enterDelay(40), 11 * 45);
  assert.equal(enterDelay(-1, -5), 0);
  assert.ok(animates(0) && animates(11));
  assert.ok(!animates(12) && !animates(-1));
});

test('whitespace is no search; the count says the real number', () => {
  assert.equal(searchKey('  '), '');
  assert.equal(searchKey(null), '');
  assert.equal(searchKey(' chick '), 'chick');
  assert.equal(countLabel(3, 'recipe'), '3 recipes');
  assert.equal(countLabel(1, 'recipe'), '1 recipe');
  assert.equal(countLabel(0, 'match', 'matches'), '0 matches');
  assert.equal(countLabel('x', 'line'), '0 lines');
});

test('the choreography lives in the one FLIP, transform and opacity only', () => {
  const src = read('src/useFlipList.js');
  const branch = src.slice(src.indexOf('if (searching) {\n      // the exits play first'), src.indexOf('} else for (const [id, it] of after)'));
  assert.ok(branch.length > 200, 'the search branch exists');
  assert.ok(!/\b(top|left|width|height|margin):/.test(branch), 'rows move on transform alone');
  assert.match(branch, /if \(running\) \{ try \{ running\.cancel\(\);/, 'a keystroke retargets: cancel, then start from where it is drawn');
  assert.match(branch, /spring\('snappy'\)/);
  assert.match(branch, /spring\('bouncy'\)/);
  assert.match(src, /if \(searching && \(!o\.search \|\| reduce\)\) \{/, 'an emptied field and reduced motion are instant');
  const hook = read('src/motion/useSearchMotion.js');
  assert.match(hook, /useFlipList\(rootRef, `\$\{q\}\\u0002\$\{key\}\\u0002\$\{also\}`, \{ \.\.\.opts, search: q \}\)/);
});

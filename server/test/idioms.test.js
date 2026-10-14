// THE IDIOM TABLE (server/lib/idioms.js; design/EVIE-STUDY.md §4B). Each row
// rewrites a human phrasing into the strict grammar verbs.js already has.
// The proof that matters: every rewrite PARSES, to the verb the row names,
// through the real parseCommand (read-only use). And anything outside the
// table is handed on exactly as he said it.
//
// NOVA_DATA_DIR is set BEFORE import (the test-data-isolation rule).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-idioms-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { expandIdioms, idiomRow, IDIOMS } = await import('../lib/idioms.js');
const { parseCommand } = await import('../lib/verbs.js');

test.after(() => rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }));

const verbsOf = (p) => (p?.any ? p.any.map((c) => c.verb) : p?.verb ? [p.verb] : []);

// said → (rewritten, the verb(s) it must reach)
const CASES = [
  ['Knock the eggs off the list', 'tick the eggs off the list', ['shopping.done']],
  ['knock milk off', 'tick milk off', ['todo.done', 'shopping.done', 'plan.priority']],
  ['strike the dentist off my to-dos', 'tick the dentist off my to-dos', ['todo.done']],
  ['Hey Nova, scratch bread off the shopping list.', 'tick bread off the shopping list', ['shopping.done']],
  ['mark off the gym', 'tick off the gym', ['todo.done', 'shopping.done', 'plan.priority']],
  ["that's milk sorted off the list", 'tick milk off the list', ['shopping.done']],
  ['put the eggs back on the shopping list', 'untick the eggs on the shopping list', ['shopping.undone']],
  ["I've polished off my lunch", 'had my lunch', ['meal.eaten']],
  ['wolfed down breakfast', 'had my breakfast', ['meal.eaten']],
  ["that's dinner done", 'had my dinner', ['meal.eaten']],
  ["lunch's done", 'had my lunch', ['meal.eaten']],
  ['scrap the protein bar from my food log', 'remove protein bar from the food log', ['foodlog.remove']],
  ['get rid of the banana off today\'s food log', 'remove banana from the food log', ['foodlog.remove']],
  ['stick call mum on my to-do list', 'add call mum to my to-do list', ['todo.add']],
  ['pop renew rego on my to-dos', 'add renew rego to my to-dos', ['todo.add']],
  ["I'm skipping the long run today", 'mark the long run as skipped', ['plan.priority']],
  ['give journaling a miss today', 'mark journaling as skipped', ['plan.priority']],
  ['crank the music up', 'turn music up', ['mac.volume']],
  ['bring it down a bit', 'turn it down a bit', ['mac.volume']],
];

test('every rewrite is a form the strict grammar already parses, to the right verb', () => {
  for (const [said, rewritten, verbs] of CASES) {
    const out = expandIdioms(said);
    assert.equal(out, rewritten, said);
    // the Mac's verbs only parse when he is at the Mac (verbs.js parseMac)
    const parsed = parseCommand(out, verbs[0] === 'mac.volume' ? { fromMac: true } : {});
    assert.ok(parsed, `${said} → "${out}" did not parse`);
    assert.deepEqual(verbsOf(parsed), verbs, `${said} → "${out}"`);
  }
});

test('every row is exercised by at least one case, and the table stays short', () => {
  const hit = new Set(CASES.map(([said]) => idiomRow(said)));
  for (let i = 0; i < IDIOMS.length; i++) assert.ok(hit.has(i), `row ${i} (${IDIOMS[i][2]}) has no case`);
  assert.ok(IDIOMS.length <= 15);
});

test('outside the table, his words pass through untouched', () => {
  for (const said of [
    'tick off the eggs', 'What\'s left on the list?', 'I picked up the kids', 'I smashed it at the gym',
    'scrap that idea', 'knock knock', 'skip this song', 'crank out some work', 'Hey Nova, how was my sleep?',
    'Put the kettle on', '',
  ]) {
    assert.equal(expandIdioms(said), said, said);
  }
});

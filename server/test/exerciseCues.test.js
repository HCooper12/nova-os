// Form cues — the "best form practices" half of the Lyfta ask.
//
// The exercise panel rendered a `cues` field long before this file existed,
// and on 4 Sep exactly 0 of his 135 exercises had one: a real field on a built
// surface, empty on every card.
//
// The rule that matters is precedence. These are SEEDS. A cue he has written
// for himself must always win, or a well-meant default quietly overwrites his
// own coaching — which would be worse than the empty field it replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_CUES, cuesFor } from '../lib/data/exerciseCues.js';
import { EXERCISE_ATLAS } from '../lib/data/exerciseAtlas.js';

test('every exercise in the atlas has cues, and none is orphaned', () => {
  const missing = Object.keys(EXERCISE_ATLAS).filter((id) => !cuesFor(id));
  assert.deepEqual(missing, [], 'these would render an empty cues field');
  const orphaned = Object.keys(EXERCISE_CUES).filter((id) => !EXERCISE_ATLAS[id]);
  assert.deepEqual(orphaned, [], 'cues for exercises that no longer exist');
});

test('a cue is short enough to read between sets, and long enough to say something', () => {
  for (const [id, text] of Object.entries(EXERCISE_CUES)) {
    assert.ok(text.length >= 40, `${id} says too little to be worth the space`);
    assert.ok(text.length <= 260, `${id} is ${text.length} chars — a card read between sets is not an essay`);
    assert.ok(/[.!]$/.test(text.trim()), `${id} does not end in a full stop`);
  }
});

test('cues are instructions, not descriptions', () => {
  // a cue that describes the lift instead of telling him what to do is filler
  const suspicious = Object.entries(EXERCISE_CUES).filter(([, t]) => /^(This|The) (exercise|movement|lift)\b/i.test(t));
  assert.deepEqual(suspicious.map(([id]) => id), []);
});

test('an unknown exercise gets nothing rather than a guess', () => {
  assert.equal(cuesFor('made-up-lift'), null);
  assert.equal(cuesFor(''), null);
  assert.equal(cuesFor(undefined), null);
});

test('the panel prefers HIS cue over the seed', async () => {
  // pinned as source, because the precedence is the whole safety property and
  // it lives in one expression in panels.js
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/panels.js', import.meta.url), 'utf8');
  assert.match(src, /cues:\s*ex\.cues\s*\|\|\s*cuesFor\(ex\.id\)/, 'his vault cue must come first in the fallback chain');
});

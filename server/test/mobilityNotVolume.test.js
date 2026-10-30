// His calls, 31 Oct 2026: mobility moves are not working sets, and "sore" is
// not pain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMuscles } from '../../src/muscleCredit.js';

test('a move filed under Mobility trains no countable muscle, whatever primary it carries', () => {
  const r = resolveMuscles({ id: 'deep-sumo-squat-torso-twist-x', name: 'Deep Sumo Squat Torso Twist', muscleGroup: 'Mobility', primary: 'Quads', secondary: ['Glutes'] });
  assert.equal(r.muscleGroup, 'Mobility');
  assert.deepEqual(r.secondary, []);
});

test('"sore" alone is not a pain word', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../lib/sessionNotes.js', import.meta.url), 'utf8');
  const re = new RegExp(src.match(/const PAIN_WORDS = \/(.*)\/i;/)[1], 'i');
  assert.equal(re.test("Triceps sore from yesterday's arm workout"), false);
  assert.equal(re.test('sharp pain in the shoulder'), true);
});

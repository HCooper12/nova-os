import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineGlyph } from '../../src/trainSummaryFacts.js';

test('his routines get their own symbols, read from the name first', () => {
  assert.equal(routineGlyph('Push', [{ muscle: 'Shoulders' }]), 'chest');
  assert.equal(routineGlyph('Pull', [{ muscle: 'Back' }]), 'back');
  assert.equal(routineGlyph('Upper Body', [{ muscle: 'Back' }]), 'upper');
  assert.equal(routineGlyph('Leg Day', [{ muscle: 'Quads' }]), 'leg');
  assert.equal(routineGlyph('Arms and Delts', [{ muscle: 'Biceps' }]), 'arm');
});

test('a name that says nothing falls back to the lead muscle, then upper body', () => {
  assert.equal(routineGlyph('Tuesday', [{ muscle: 'Hamstrings' }]), 'leg');
  assert.equal(routineGlyph('Session B', [{ muscle: 'Triceps' }]), 'arm');
  assert.equal(routineGlyph('Mystery', []), 'upper');
});

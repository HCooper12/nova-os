// One movement, two renderings — the 2D SVG and the 3D rig must agree.
//
// PATTERNS drives the flat figure with CSS transforms; POSES drives the 3D body
// with joint angles. They share ids by construction, so a lift that resolves
// to a pattern animates in both — unless one list gains an entry the other
// lacks, which is the drift this pins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, POSES, poseAt, patternFor } from '../../src/exerciseMotion.js';

test('every 2D pattern has a 3D pose, and vice versa', () => {
  const p = Object.keys(PATTERNS).sort();
  const q = Object.keys(POSES).sort();
  assert.deepEqual(q, p, 'a pattern without a pose stands still in 3D; a pose without a pattern is unreachable');
});

test('a pose interpolates from start to end and is neutral where unstated', () => {
  assert.deepEqual(poseAt('curl', 0), { elbow: 10 });
  assert.deepEqual(poseAt('curl', 1), { elbow: 125 });
  assert.deepEqual(poseAt('curl', 0.5), { elbow: 67.5 });
  assert.equal(poseAt('squat', 0).hip, 0, 'a squat starts standing');
});

test('an unknown pattern yields no pose, not a default stance', () => {
  assert.equal(poseAt('made-up', 0.5), null);
  assert.equal(poseAt(null, 0.5), null);
});

test('joint angles stay inside what a body can do', () => {
  // a sanity band, not anatomy: nothing here should ask for a 270° elbow
  for (const [id, { from, to }] of Object.entries(POSES)) {
    for (const pose of [from, to]) {
      for (const [k, v] of Object.entries(pose)) {
        if (k === 'lift' || k === 'shoulderLift') { assert.ok(v >= 0 && v <= 1, `${id}.${k}`); continue; }
        assert.ok(v >= 0 && v <= 180, `${id}.${k} = ${v}° is not a joint angle`);
      }
    }
  }
});

test('his lifts reach a pose end to end', () => {
  for (const name of ['Barbell Curl', 'Back Squat', 'Romanian Deadlift', 'Lateral Raise', 'Lat Pulldown']) {
    const pattern = patternFor(name, []);
    assert.ok(pattern && poseAt(pattern, 1), `${name} → ${pattern} has no pose`);
  }
});

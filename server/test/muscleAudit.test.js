// THE AUDITED TABLE (src/muscleAudit.js, 15 Oct 2026). His standing rule:
// every exercise says which muscles it truly works, one primary at 1 per set
// and each substantial secondary at ½. These pin the table itself: every one
// of the 140 lifts in his library is in it, every muscle it names is a real
// group, and the 30 lifts of his program map exactly as he approved them, so
// any change to a row is a visible diff here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDITED, AUDIT_PATTERNS, IN_PROGRAM_AT_AUDIT } from '../../src/muscleAudit.js';
import { MUSCLE_GROUPS, NON_VOLUME } from '../../src/muscleTaxonomy.js';

test('the audit covers all 140 lifts in his library, one primary each, every muscle a real group', () => {
  const rows = Object.entries(AUDITED);
  assert.equal(rows.length, 140);
  for (const [id, r] of rows) {
    assert.match(id, /^[a-z0-9-]+$/, id);
    assert.ok(MUSCLE_GROUPS.includes(r.primary), `${id}: ${r.primary} is not a group`);
    assert.ok(Array.isArray(r.secondary), id);
    for (const m of r.secondary) {
      assert.ok(MUSCLE_GROUPS.includes(m), `${id}: secondary ${m} is not a group`);
      assert.ok(!NON_VOLUME.has(m), `${id}: ${m} can never be a secondary`);
      assert.notEqual(m, r.primary, `${id}: its primary is not also a secondary`);
    }
    assert.equal(new Set(r.secondary).size, r.secondary.length, `${id}: no muscle twice`);
    if (NON_VOLUME.has(r.primary)) assert.deepEqual(r.secondary, [], `${id}: a non-volume lift credits nothing`);
    assert.ok(AUDIT_PATTERNS[r.pattern], `${id}: its pattern "${r.pattern}" carries a checked source`);
    assert.ok(typeof r.note === 'string' && r.name, id);
  }
});

test('no lift is left on the old Shoulders / Back names', () => {
  for (const [id, r] of Object.entries(AUDITED)) {
    for (const m of [r.primary, ...r.secondary]) assert.ok(m !== 'Shoulders' && m !== 'Back', `${id} still says ${m}`);
  }
});

// his program on 15 Oct 2026, exactly as approved (his decisions included:
// the chest-supported row is a lats lift, a dead hang is grip and never
// volume, hammer curls are biceps with forearms at ½, and the EZ-bar reverse
// curl is forearms with biceps at ½, because his sets end when his forearms do)
const HIS_PROGRAM = {
  'barbell-bench-press': ['Chest', ['Front Delts', 'Triceps']],
  'incline-barbell-bench-press': ['Chest', ['Front Delts', 'Triceps']],
  'face-pull': ['Rear Delts', ['Upper Back']],
  'spider-curl': ['Biceps', []],
  'bulgarian-split-squat': ['Quads', ['Glutes', 'Adductors']],
  'hack-squat': ['Quads', ['Glutes']],
  'dead-hang': ['Grip', []],
  'wide-grip-lat-pulldown': ['Lats', ['Upper Back', 'Biceps']],
  'cable-hammer-curls': ['Biceps', ['Forearms']],
  'lying-t-bar-row': ['Upper Back', ['Lats', 'Rear Delts', 'Biceps']],
  'ez-bar-reverse-curl': ['Forearms', ['Biceps']],
  'dumbbell-shrug': ['Traps', []],
  'cable-lateral-raise-behind-back-wrist-height': ['Side Delts', []],
  'dumbbell-shoulder-press-single-arm': ['Front Delts', ['Triceps']],
  'cable-flys-high-position-per-arm-weight': ['Chest', []],
  'cable-overhead-tricep-extension': ['Triceps', []],
  'incline-dumbbell-bench-with-palms-facing-in': ['Chest', ['Front Delts', 'Triceps']],
  'chest-supported-dumbbell-row': ['Lats', ['Upper Back', 'Rear Delts', 'Biceps']],
  'alternate-incline-dumbbell-curl': ['Biceps', []],
  'rope-overhead-tricep-extension': ['Triceps', []],
  'cable-bicep-curl': ['Biceps', []],
  'machine-hip-thrust': ['Glutes', []],
  'standing-dumbbell-calf-raise': ['Calves', []],
  'hamstring-lying-leg-curls': ['Hamstrings', []],
  'standing-machine-calf-raises': ['Calves', []],
  'weighted-pull-up': ['Lats', ['Upper Back', 'Biceps']],
  'carter-extension': ['Triceps', []],
  'triceps-pushdown-straight-bar-attachment': ['Triceps', []],
  'reverse-pec-deck': ['Rear Delts', []],
  'adductor-machine': ['Adductors', []],
};

test('the 30 lifts of his program map exactly as he approved', () => {
  assert.equal(Object.keys(HIS_PROGRAM).length, 30);
  assert.deepEqual([...IN_PROGRAM_AT_AUDIT].sort(), Object.keys(HIS_PROGRAM).sort(), 'the table marks the same 30 as his program');
  for (const [id, [primary, secondary]] of Object.entries(HIS_PROGRAM)) {
    assert.deepEqual([AUDITED[id]?.primary, AUDITED[id]?.secondary], [primary, secondary], id);
  }
});

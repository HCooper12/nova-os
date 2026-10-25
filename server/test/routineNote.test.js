// A per-lift note on a routine entry (mockup 104) survives the file round
// trip and every entry writer; an empty note is never written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-note-'));
const { replaceRoutineEntries, renderRoutinesFile, parseRoutines, cleanNote } = await import('../lib/workouts.js');

const lib = new Map([['lat-raise', { id: 'lat-raise', name: 'Cable Lateral Raise', muscleGroup: 'Side Delts', trackingType: 'weight_reps' }]]);
const data = { routines: [{ id: 'r1', name: 'Delts', exercises: [{ exerciseId: 'lat-raise', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 }] }], schedule: {} };

test('a note is kept, trimmed to one line, and rendered in the readable body', () => {
  const next = replaceRoutineEntries(data, 'r1', [{ exerciseId: 'lat-raise', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15, note: '  drop sets\n behind back ' }], lib);
  assert.equal(next.routines[0].exercises[0].note, 'drop sets behind back');
  const raw = renderRoutinesFile(next, lib);
  assert.match(raw, /Cable Lateral Raise — 3 × 12-15 · drop sets behind back/);
  assert.equal(parseRoutines(raw).routines[0].exercises[0].note, 'drop sets behind back');
});

test('a blank note is not written at all', () => {
  const next = replaceRoutineEntries(data, 'r1', [{ exerciseId: 'lat-raise', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15, note: '   ' }], lib);
  assert.equal('note' in next.routines[0].exercises[0], false);
  assert.equal(cleanNote(''), null);
});

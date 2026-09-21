// THE PROGRAM DOSSIER — his program as data a plan can hand on. Pinned
// because the 21 Sep plan's report opened "no agent ever saw your actual
// program" while every fact was in the vault.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgram, renderGoals, buildProgramDossier } from '../lib/programDossier.js';

const routines = [
  { id: 'r1', name: 'Pull', exercises: [
    { name: 'Weighted Pull-Up', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8, muscleGroup: 'Back' },
    { name: 'Spider Curl', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12, muscleGroup: 'Biceps' },
  ] },
  { id: 'r2', name: 'Leg Day', exercises: [{ name: 'Hack Squat', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 8 }] },
];
const schedule = { monday: 'active-rest', tuesday: 'r1', wednesday: 'r2', thursday: 'r1', friday: 'active-rest', saturday: 'active-rest', sunday: 'active-rest' };

test('the program renders as the week he trains and the sets he is prescribed', () => {
  const text = renderProgram({ routines, schedule, goals: { daysPerWeek: 4 } });
  assert.match(text, /WEEKLY SCHEDULE \(3 training days; his goal says 4\)/);
  assert.match(text, /Tuesday: Pull · Wednesday: Leg Day · Thursday: Pull/);
  assert.match(text, /Pull — 2 exercises, 6 working sets: Weighted Pull-Up 3×6-8 \[Back\]; Spider Curl 3×10-12 \[Biceps\]/);
  assert.match(text, /Hack Squat 3×8/);
  assert.match(renderProgram({ routines: [], schedule: {} }), /no routines on file/);
});

test('goals render as one line and absence is said', () => {
  assert.match(renderGoals({ goal: 'Lean muscle gain', daysPerWeek: 4 }), /goal: Lean muscle gain; days per week: 4/);
  assert.equal(renderGoals(null), 'GOALS: none on file.');
});

test('the dossier assembles every section and NAMES the ones it could not read', async () => {
  const d = await buildProgramDossier('/nowhere', {
    loadExercises: async () => [],
    loadRoutines: async () => ({ routines, schedule }),
    loadGoals: async () => ({ goal: 'Lean muscle gain', daysPerWeek: 3 }),
    loadBlock: async () => 'NO TRAINING BLOCK SET',
    loadAnalytics: async () => 'TRAINING ANALYTICS: Biceps 15 hard sets',
    loadAudit: async () => ({ weekOf: '2026-09-21', summary: 'I ran 9 checks; 4 need a decision', checks: [{ status: 'fired', label: 'A lift flat for three weeks', detail: 'Bench has not moved in 9 weeks' }] }),
    loadKnowledge: async () => { throw new Error('page missing'); },
    now: new Date('2026-09-21T02:00:00Z'),
  });
  assert.equal(d.title, 'Program dossier — 2026-09-21');
  assert.match(d.body, /read from the vault by code/);
  assert.match(d.body, /Tuesday: Pull/);
  assert.match(d.body, /NO TRAINING BLOCK SET/);
  assert.match(d.body, /Biceps 15 hard sets/);
  assert.match(d.body, /\[fired\] A lift flat for three weeks: Bench has not moved/);
  assert.deepEqual(d.failed, ['coaching knowledge']);
  assert.match(d.body, /FAILED to load this turn.*coaching knowledge/);
  assert.deepEqual(d.counts, { routines: 2, exercises: 0 });
});

// The analytics engine's contract: PRs detected against all prior history,
// plateaus need real span, RPE drift needs sustained change, volume counts
// working sets by muscle, and the program audit catches the live program's
// actual visible errors (Pull-Up in two routines, Push twice running).
import test from 'node:test';
import assert from 'node:assert/strict';
import { personalRecords, prsInSession, detectPlateaus, rpeTrend, weeklyMuscleVolume, auditProgram } from '../lib/trainingAnalytics.js';

const S = (date, name, sets, exerciseId = 'bench') => ({
  date, routineName: 'Push',
  exercises: [{ exerciseId, name, sets }],
});

test('PRs: first crossing celebrated once, echo e1RMs suppressed, history-aware', () => {
  const sessions = [
    S('2026-07-01', 'Bench Press', [{ weight: 60, reps: 8 }]),
    S('2026-07-08', 'Bench Press', [{ weight: 62.5, reps: 8 }]),
  ];
  const today = S('2026-07-15', 'Bench Press', [{ weight: 65, reps: 8 }, { weight: 65, reps: 9 }]);
  const prs = prsInSession([...sessions, today], today);
  assert.equal(prs.filter((p) => p.kind === 'weight').length, 1, 'one weight PR, not one per set');
  assert.equal(prs[0].value, 65);
  assert.equal(prs[0].previous, 62.5);
  assert.ok(!prs.some((p) => p.kind === 'e1rm'), 'e1RM echo of the same weight PR is suppressed');

  const bests = personalRecords([...sessions, today]);
  assert.equal(bests.bench.weight.value, 65);
  assert.ok(bests.bench.e1rm.value > 65);
});

test('plateau: flat e1RM across a real span flags; a progressing lift never does', () => {
  const flat = ['07-01', '07-08', '07-15', '07-22', '07-29'].map((d) =>
    S(`2026-${d}`, 'Curl', [{ weight: 20, reps: 10 }], 'curl'));
  const found = detectPlateaus(flat);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Curl');
  assert.ok(found[0].spanDays >= 21);

  const growing = ['07-01', '07-08', '07-15', '07-22', '07-29'].map((d, i) =>
    S(`2026-${d}`, 'Row', [{ weight: 50 + i * 2.5, reps: 10 }], 'row'));
  assert.equal(detectPlateaus(growing).length, 0);

  // thin history stays silent — three sessions is an opinion, not a plateau
  assert.equal(detectPlateaus(flat.slice(0, 3)).length, 0);
});

test('RPE drift: sustained rise flags, steady stays quiet, thin data returns null', () => {
  const mk = (d, rpe) => ({ date: d, exercises: [{ exerciseId: 'x', name: 'X', sets: [{ weight: 50, reps: 8, rpe }] }] });
  const rising = [7, 7, 7.5, 7, 8.5, 8.5, 9, 9].map((r, i) => mk(`2026-07-${String(i + 1).padStart(2, '0')}`, r));
  const t = rpeTrend(rising);
  assert.ok(t.drift.rising, `expected rising (delta ${t.drift.delta})`);
  const steady = [7, 7.5, 7, 7.5, 7, 7.5, 7, 7.5].map((r, i) => mk(`2026-07-${String(i + 1).padStart(2, '0')}`, r));
  assert.ok(!rpeTrend(steady).drift.rising);
  assert.equal(rpeTrend(rising.slice(0, 3)).drift, null, 'too thin to judge');
});

test('weekly volume: working sets per muscle per calendar week, warm-ups excluded', () => {
  const exercises = [
    { id: 'bench', name: 'Bench', muscleGroup: 'Chest' },
    { id: 'row', name: 'Row', muscleGroup: 'Back' },
  ];
  const sessions = [
    { date: '2026-08-10', exercises: [ // a Monday
      { exerciseId: 'bench', name: 'Bench', sets: [{ weight: 60, reps: 8, setType: 'warmup' }, { weight: 80, reps: 5 }, { weight: 80, reps: 5 }] },
      { exerciseId: 'row', name: 'Row', sets: [{ weight: 60, reps: 10 }] },
    ] },
    { date: '2026-08-12', exercises: [{ exerciseId: 'bench', name: 'Bench', sets: [{ weight: 80, reps: 5 }] }] },
  ];
  const vol = weeklyMuscleVolume(sessions, exercises);
  assert.equal(vol.length, 1);
  assert.equal(vol[0].week, '2026-08-10');
  assert.equal(vol[0].groups.Chest, 3, 'warm-up excluded, both sessions summed');
  assert.equal(vol[0].groups.Back, 1);
});

test('program audit: catches his program\'s real, previously invisible errors', () => {
  const exercises = [
    { id: 'pullup', name: 'Pull-Up', muscleGroup: 'Back' },
    { id: 'bench', name: 'Bench', muscleGroup: 'Chest' },
  ];
  const routines = [
    { id: 'push', name: 'Push', exercises: [{ exerciseId: 'pullup', targetSets: 3 }, { exerciseId: 'bench', targetSets: 12 }] },
    { id: 'pull', name: 'Pull', exercises: [{ exerciseId: 'pullup', targetSets: 3 }] },
  ];
  const schedule = { monday: 'push', tuesday: 'push', wednesday: 'pull', thursday: 'push', friday: 'pull' };
  const findings = auditProgram({ routines, schedule, goals: { daysPerWeek: 4 }, exercises });
  const kinds = findings.map((f) => f.kind);
  assert.ok(kinds.includes('duplicate-exercise'), 'Pull-Up in both routines');
  assert.ok(kinds.includes('consecutive-repeat'), 'Push monday AND tuesday');
  assert.ok(kinds.includes('days-mismatch'), 'goal 4 days, schedule 5');
  // a clean program returns nothing
  assert.equal(auditProgram({
    routines: [{ id: 'a', name: 'A', exercises: [{ exerciseId: 'bench', targetSets: 3 }] }],
    schedule: { monday: 'a' }, goals: { daysPerWeek: 1 }, exercises,
  }).length, 0);
});

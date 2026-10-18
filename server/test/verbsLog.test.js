// weight.log and workout.log: code-only verbs for the two things he says most
// at the scale and at the rack. Temp vault AND data dir BEFORE any import, so
// nothing here can touch the real server/data or his vault.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-verblog-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-verblog-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { parseCommand, runVerb, tryCommand, resolveAny, matchExercise } = await import('../lib/verbs.js');
const { loadDay } = await import('../lib/healthData.js');
const { loadSessions } = await import('../lib/workoutSessions.js');
const { loadExerciseLibrary } = await import('../lib/exercises.js');
const { undoRecord } = await import('../lib/inbox.js');
const { saveSessionDraft, clearSessionDraft } = await import('../lib/sessionDraft.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('weight.log grammar: claims unambiguous weigh-ins only', () => {
  for (const [said, kg] of [
    ['I weigh 82', 82], ['weight 82.4', 82.4], ['log my weight 82.1 kg', 82.1], ['82.4 kilos this morning', 82.4],
    ['Nova, my weight is 81.9', 81.9], ["I'm 82 kg", 82], ['I weigh 82 point 4', 82.4], ['weighed in at 83.0 kilograms', 83],
  ]) {
    assert.deepEqual(parseCommand(said), { verb: 'weight.log', args: { kg } }, said);
  }
  // not claimed: age, pounds, other days, sentences that merely contain the words
  for (const said of ["I'm 82", 'I weigh about 82', 'I weigh 180 lbs', 'weight 82 yesterday', 'why is my weight 82 today', 'what is my weight',
    'weight 60 for 8', 'my weight has been going up', '82 kg']) {
    assert.ok(!parseCommand(said) || parseCommand(said).verb !== 'weight.log', said);
  }
});

test('weight.log: writes today through the manual path, replies from code, undo restores', async () => {
  const out = await runVerb(vault, 'I weigh 82.4', { verb: 'weight.log', args: { kg: 82.4 } });
  assert.equal(out.acted.said, 'Logged 82.4 kg for today.');
  assert.ok(out.acted.undoable);
  let day = await loadDay(today());
  assert.equal(day.weightKg, 82.4);
  // a second weigh-in the same day replaces the first; undo puts the first back
  const second = await runVerb(vault, 'weight 82.9', { verb: 'weight.log', args: { kg: 82.9 } });
  assert.equal((await loadDay(today())).weightKg, 82.9);
  const undone = await undoRecord(vault, second.acted.recordId);
  assert.equal(undone.status, 'undone');
  assert.equal((await loadDay(today())).weightKg, 82.4);
  // undoing the first removes the reading entirely (the day had none before)
  await undoRecord(vault, out.acted.recordId);
  day = await loadDay(today());
  assert.equal(day.weightKg, undefined);
});

test('weight.log: implausible values are refused in words and write nothing', async () => {
  for (const kg of [8, 29.9, 300.1, 820, 'abc']) {
    await assert.rejects(() => runVerb(vault, 'q', { verb: 'weight.log', args: { kg } }), /between 30 and 300|isn't a bodyweight/);
  }
  assert.equal((await loadDay(today()))?.weightKg, undefined);
  const said = await tryCommand(vault, 'I weigh 8');
  assert.equal(said.miss, true);
  assert.match(said.text, /between 30 and 300/);
});

test('workout.log grammar: sure phrasings claim, bare ones are candidates, talk is not claimed', () => {
  assert.deepEqual(parseCommand('squat 100 kg 5 reps'), { verb: 'workout.log', args: { exercise: 'squat', weight: 100, reps: 5 } });
  assert.deepEqual(parseCommand('did 3 sets of 10 pull-ups'), { verb: 'workout.log', args: { exercise: 'pull-ups', sets: 3, reps: 10 } });
  assert.deepEqual(parseCommand('did bench 60 for 8'), { verb: 'workout.log', args: { exercise: 'bench', weight: 60, reps: 8 } });
  assert.deepEqual(parseCommand('3 sets of 8 bench at 60 kg'), { verb: 'workout.log', args: { exercise: 'bench', sets: 3, reps: 8, weight: 60 } });
  assert.deepEqual(parseCommand('bench 60 for 8'), { any: [{ verb: 'workout.log', args: { exercise: 'bench', weight: 60, reps: 8 } }], fallthrough: true });
  // not claimed at all
  for (const said of ['how many sets of 10 should I do', 'I need to bench more', 'bench', 'what did I bench last week', 'remind me to do 3 sets of 10 pull-ups at 6pm',
    'set eggs to 12', 'bench 60']) {
    const p = parseCommand(said);
    assert.ok(!p || (p.verb !== 'workout.log' && !(p.any || []).some((c) => c.verb === 'workout.log')), said);
  }
});

test('exercise match: exact, alias and unique fuzzy resolve; ambiguity and strangers do not', async () => {
  const { exercises } = await loadExerciseLibrary(vault);
  assert.equal(matchExercise(exercises, 'bench').hit.name, 'Barbell Bench Press');
  assert.equal(matchExercise(exercises, 'Pull-Ups').hit.name, 'Pull-Up');
  assert.equal(matchExercise(exercises, 'squat').hit.name, 'Back Squat');
  assert.equal(matchExercise(exercises, 'deadlift').hit.name, 'Deadlift');
  assert.equal(matchExercise(exercises, 'ohp').hit.name, 'Barbell Overhead Press');
  assert.equal(matchExercise(exercises, 'lat pulldoen').hit.name, 'Lat Pulldown'); // a slip of the tongue
  assert.equal(matchExercise(exercises, 'press').hit, null); // many presses: never a guess
  assert.ok(matchExercise(exercises, 'press').ambiguous.length > 1);
  assert.equal(matchExercise(exercises, 'zumba').hit, null);
  assert.equal(matchExercise(exercises, 'incline').hit, null);
});

test('workout.log: files into one Quick log session, appends, and undo takes back exactly its own sets', async () => {
  const a = await tryCommand(vault, 'did bench 60 for 8');
  assert.equal(a.text, 'Logged Barbell Bench Press: 60 kg × 8.');
  let sessions = (await loadSessions(vault)).filter((s) => s.routineId === 'voice-log');
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].exercises[0].sets, [{ weight: 60, reps: 8 }]);

  const b = await tryCommand(vault, 'did 3 sets of 10 pull-ups');
  assert.equal(b.text, 'Logged Pull-Up: 3 sets of 10 reps.');
  const c = await tryCommand(vault, 'squat 100 kg 5 reps');
  assert.match(c.text, /Back Squat: 100 kg × 5/);
  sessions = (await loadSessions(vault)).filter((s) => s.routineId === 'voice-log');
  assert.equal(sessions.length, 1, 'later sets append to the same Quick log');
  assert.deepEqual(sessions[0].exercises.map((e) => e.name), ['Barbell Bench Press', 'Pull-Up', 'Back Squat']);
  assert.equal(sessions[0].exercises[1].sets.length, 3);

  // a bare phrasing resolves because bench is a real exercise of his
  const d = await tryCommand(vault, 'bench 62.5 for 6');
  assert.match(d.text, /62.5 kg × 6/);
  sessions = (await loadSessions(vault)).filter((s) => s.routineId === 'voice-log');
  assert.equal(sessions[0].exercises[0].sets.length, 2);

  // undo, newest first: only that call's sets leave
  await undoRecord(vault, d.acted.recordId);
  sessions = (await loadSessions(vault)).filter((s) => s.routineId === 'voice-log');
  assert.deepEqual(sessions[0].exercises[0].sets, [{ weight: 60, reps: 8 }]);
  await undoRecord(vault, c.acted.recordId);
  await undoRecord(vault, b.acted.recordId);
  sessions = (await loadSessions(vault)).filter((s) => s.routineId === 'voice-log');
  assert.deepEqual(sessions[0].exercises.map((e) => e.name), ['Barbell Bench Press']);
  // undoing the last of it removes the session file entirely
  await undoRecord(vault, a.acted.recordId);
  assert.equal((await loadSessions(vault)).filter((s) => s.routineId === 'voice-log').length, 0);
});

test('workout.log: an unknown exercise says so and writes nothing; so does a missing weight', async () => {
  const miss = await tryCommand(vault, 'did zumbaa 40 for 10');
  assert.equal(miss.miss, true);
  assert.equal(miss.text, 'I couldn\'t find "zumbaa" in your exercises.');
  // a bare phrasing with a stranger's name is not even a command
  assert.equal(await tryCommand(vault, 'zumbaa 40 for 10'), null);
  const noWeight = await tryCommand(vault, 'did 3 sets of 10 bench');
  assert.equal(noWeight.miss, true);
  assert.match(noWeight.text, /How much weight/);
  const amb = await tryCommand(vault, 'did press 40 for 10');
  assert.equal(amb.miss, true);
  assert.match(amb.text, /could be .*Which one/);
  for (const bad of [{ reps: 0 }, { reps: 101 }, { reps: 5, sets: 11 }, { reps: 5, weight: -4 }]) {
    await assert.rejects(() => runVerb(vault, 'q', { verb: 'workout.log', args: { exercise: 'bench', weight: 60, ...bad } }));
  }
  assert.equal((await loadSessions(vault)).filter((s) => s.routineId === 'voice-log').length, 0);
  // resolveAny on a stranger's bare phrasing is a clean null, not an error
  assert.equal(await resolveAny(vault, parseCommand('zumbaa 40 for 10')), null);
});

test('workout.log: refuses while a workout is open in Train', async () => {
  await saveSessionDraft({ workoutSession: { startedAt: 1, routineName: 'Push', exercises: [{ exerciseId: 'x', sets: [{ done: true }] }] } });
  try {
    const out = await tryCommand(vault, 'did bench 60 for 8');
    assert.equal(out.miss, true);
    assert.match(out.text, /workout open in Train/);
    assert.equal((await loadSessions(vault)).filter((s) => s.routineId === 'voice-log').length, 0);
  } finally {
    await clearSessionDraft({ reason: 'discarded' });
  }
});

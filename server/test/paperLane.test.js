// THE STUDY LANE — a paper becomes a change to HIS program, or honestly does
// not. Code validates every proposed change against the plan's real ids; a
// change that does not survive is a conversation, never a tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadPrompt, parseClaims, buildJudgePrompt, parseJudgement, renderPlan, renderPaperNote, startPaper } from '../lib/paperLane.js';
import { opsFromFix } from '../lib/coachPlan.js';

const routines = [
  { id: 'push', name: 'Push', exercises: [{ exerciseId: 'barbell-bench-press', targetSets: 4, targetRepsLow: 6, targetRepsHigh: 8 }, { exerciseId: 'cable-fly', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 }] },
  { id: 'legs', name: 'Leg Day', exercises: [{ exerciseId: 'barbell-back-squat', targetSets: 3, targetRepsLow: 5, targetRepsHigh: 5 }] },
];
const exercises = [
  { id: 'barbell-bench-press', name: 'Barbell Bench Press', muscleGroup: 'Chest' },
  { id: 'cable-fly', name: 'Cable Fly', muscleGroup: 'Chest' },
  { id: 'barbell-back-squat', name: 'Barbell Back Squat', muscleGroup: 'Quads' },
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'Quads' },
];

const CLAIMS = { title: 'Weekly set volume and hypertrophy: a meta-analysis', source: 'J Sports Sci 2017', kind: 'meta-analysis', population: '15 studies, 401 mostly untrained young men', intervention: 'Resistance training at <5, 5-9 and 10+ sets per muscle per week, 6-24 weeks', outcomes: ['Dose-response: 10+ sets/week produced greater hypertrophy than <5 (ES 0.24 vs 0.11)'], limits: ['Mostly untrained subjects', 'Short interventions'], quotes: ['a graded dose-response relationship'], applicability: 'The subjects were largely untrained; he is not. The direction likely holds, the magnitude will not.', confidence: 'high' };

test('the read prompt fetches THIS source, asks for data not advice, and names who is asking', () => {
  const p = buildReadPrompt({ source: 'https://pubmed.ncbi.nlm.nih.gov/27433992/', prose: 'does this change my chest volume', him: 'male, 27y, goal: lose' });
  assert.match(p, /Fetch it: https:\/\/pubmed/);
  assert.match(p, /abstract-only read must be labelled/);
  assert.match(p, /No advice here — that is the next pass/);
  assert.match(p, /male, 27y, goal: lose/);
  assert.match(p, /does this change my chest volume/);
  const t = buildReadPrompt({ source: 'Pasted abstract text here', prose: '', him: 'x' });
  assert.match(t, /SOURCE TEXT:\nPasted abstract text here/);
});

test('claims parse into data, with a bad kind coerced and an empty read refused', () => {
  const c = parseClaims(`Sure.\n${JSON.stringify({ ...CLAIMS, kind: 'landmark' })}`);
  assert.equal(c.kind, 'article');
  assert.equal(c.outcomes.length, 1);
  assert.equal(c.confidence, 'high');
  assert.equal(parseClaims('{"title":"x"}'), null, 'a title with no findings is not a read');
  assert.equal(parseClaims('nothing'), null);
});

test('the judge prompt carries his REAL block and forbids invented exercises', () => {
  const p = buildJudgePrompt({ claims: CLAIMS, plan: renderPlan(routines, exercises), library: 'barbell-bench-press — Barbell Bench Press (Chest)', schedule: 'monday: Push', goals: 'bench 100kg by December', recent: '- 2026-09-06 Push: Barbell Bench Press 80×6,80×6', intake: 'His numbers (Intake…)', shelf: '', open: '' });
  assert.match(p, /WHAT, IF ANYTHING, WOULD THIS CHANGE IN HIS CURRENT BLOCK/);
  assert.match(p, /push — Push:\n  barbell-bench-press \(Barbell Bench Press\) 4×6-8/);
  assert.match(p, /Is he the population\?/);
  assert.match(p, /"not-for-him" and you propose NOTHING/);
  assert.match(p, /Never invent an exercise/);
  assert.match(p, /bench 100kg by December/);
});

test('a change survives only if its ops name real ids in his plan — otherwise it is a conversation', () => {
  const raw = JSON.stringify({
    verdict: 'change', grade: 'moderate', summary: 'S', whyForHim: 'W',
    changes: [
      { title: 'Chest to 12 sets', why: 'dose-response', expect: 'more chest', watchFor: 'joint pain', ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'cable-fly', targetSets: 4, targetRepsLow: 12, targetRepsHigh: 15 }] },
      { title: 'Add pec deck', why: 'x', ops: [{ op: 'add', routineId: 'push', exerciseId: 'pec-deck', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 }] },
      { title: 'Prescribe squat in Push', why: 'x', ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'barbell-back-squat', targetSets: 3, targetRepsLow: 5, targetRepsHigh: 5 }] },
      { title: 'New exercise', why: 'x', ops: [{ op: 'new-exercise', name: 'Sled', muscleGroup: 'Quads', trackingType: 'weight_reps', ref: '$new1' }] },
    ],
    discuss: ['Consider a fourth day'],
  });
  const j = parseJudgement(raw, { routines, exercises });
  assert.equal(j.verdict, 'change');
  assert.equal(j.changes.length, 3, 'capped at three');
  assert.deepEqual(j.changes[0].fix, { action: 'ops', ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'cable-fly', targetSets: 4, targetRepsLow: 12, targetRepsHigh: 15 }] });
  assert.equal(j.changes[1].fix, null);
  assert.match(j.changes[1].unappliable, /pec-deck is not in his library/);
  assert.equal(j.changes[2].fix, null);
  assert.match(j.changes[2].unappliable, /barbell-back-squat is not in push/);
  assert.deepEqual(j.discuss, ['Consider a fourth day']);
  // and the Coach's one-tap path accepts what survived
  assert.deepEqual(opsFromFix(j.changes[0].fix), j.changes[0].fix.ops);
});

test('"not for him" proposes nothing, whatever the model listed', () => {
  const j = parseJudgement(JSON.stringify({ verdict: 'not-for-him', grade: 'strong', summary: 'Elite marathoners.', whyForHim: 'He is a lifter on a cut.', changes: [{ title: 'Run 200km/week', why: 'x', ops: [{ op: 'remove', routineId: 'push', exerciseId: 'cable-fly' }] }] }), { routines, exercises });
  assert.equal(j.verdict, 'not-for-him');
  assert.deepEqual(j.changes, []);
});

test('the note carries the claims, the verdict for him, and labels a tap from a conversation', () => {
  const j = parseJudgement(JSON.stringify({ verdict: 'change', grade: 'moderate', summary: 'Direction holds.', whyForHim: 'Trained, but volume is low.', changes: [
    { title: 'Chest to 12 sets', why: 'dose-response', expect: 'visible in 6 weeks', watchFor: 'elbow', ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'cable-fly', targetSets: 4, targetRepsLow: 12, targetRepsHigh: 15 }] },
    { title: 'Add pec deck', why: 'y', ops: [{ op: 'add', routineId: 'push', exerciseId: 'pec-deck', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 }] },
  ], discuss: ['A fourth day'] }), { routines, exercises });
  const note = renderPaperNote({ claims: CLAIMS, judgement: j, sourceUrl: 'https://x.y/z', date: '2026-09-08' });
  assert.match(note, /^# Weekly set volume and hypertrophy/);
  assert.match(note, /## For Hayden — verdict: change \(moderate evidence\)/);
  assert.match(note, /Chest to 12 sets.*_\(one tap in the Inbox\)_/);
  assert.match(note, /Add pec deck.*a conversation, not a tap: exercise pec-deck is not in his library/);
  assert.match(note, /### Worth a conversation\n\n- A fourth day/);
  assert.match(note, /Applicability, in the Researcher's words/);
});

// ---- the run, with the store and both models stubbed ----
function fakeStore() {
  const records = new Map();
  return {
    records,
    createRecord: async (r) => { records.set(r.id, { ...r }); return records.get(r.id); },
    updateRecord: async (id, patch) => { records.set(id, { ...records.get(id), ...patch }); return records.get(id); },
    listRecords: async () => [...records.values()],
  };
}
const deps = (store, answers) => ({
  store,
  ask: async (prompt) => (/You are Nova's Researcher/.test(prompt) ? answers.read : answers.judge),
  profile: { getProfile: async () => ({ intake: { facts: { sex: 'male', age: 27, weightKg: 84.9, heightCm: 188, activity: 'very', goal: 'lose' }, plan: {} }, focus: '' }), intakeLine: () => 'His numbers (Intake): 2767 kcal' },
  goals: { goalsContext: async () => 'bench 100kg' },
  sessions: { loadSessions: async () => [{ date: '2026-09-06', routineName: 'Push', exercises: [{ name: 'Bench', sets: [{ weightKg: 80, reps: 6 }] }] }] },
  exercisesLib: { loadExerciseLibrary: async () => ({ exercises }) },
  workouts: { loadRoutines: async () => ({ routines, schedule: { monday: 'push' } }) },
  shelf: { shelfContext: async () => '' },
  review: { programReviewContext: async () => '' },
  notify: async () => {},
});

test('a study that applies becomes a note to keep AND a proposal the Coach can apply — nothing is written', async () => {
  const store = fakeStore();
  const record = await startPaper('/vault', { urls: ['https://pubmed.ncbi.nlm.nih.gov/27433992/'], prose: 'chest volume?' }, deps(store, {
    read: JSON.stringify(CLAIMS),
    judge: JSON.stringify({ verdict: 'change', grade: 'moderate', summary: 'S', whyForHim: 'W', changes: [{ title: 'Chest to 12 sets', why: 'dose-response', expect: 'six weeks', watchFor: 'elbows', ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'cable-fly', targetSets: 4, targetRepsLow: 12, targetRepsHigh: 15 }] }], discuss: [] }),
  }));
  assert.equal(record.kind, 'paper');
  assert.equal(record.status, 'classifying', 'NOVA IS WORKING can show it');
  await new Promise((r) => setTimeout(r, 40));
  const paper = store.records.get(record.id);
  assert.equal(paper.status, 'pending');
  assert.equal(paper.decision.route, 'note', 'the study files as a note he can keep');
  assert.match(paper.decision.title, /for you: change$/);
  assert.equal(paper.judgement.verdict, 'change');
  assert.equal(paper.proposals.length, 1);
  const proposal = store.records.get(paper.proposals[0]);
  assert.equal(proposal.kind, 'coach-program', 'the SAME record the program review raises — the Inbox already applies it');
  assert.equal(proposal.findingKind, 'paper');
  assert.deepEqual(opsFromFix(proposal.fix), [{ op: 'prescribe', routineId: 'push', exerciseId: 'cable-fly', targetSets: 4, targetRepsLow: 12, targetRepsHigh: 15 }]);
  assert.match(proposal.text, /^Coach: Chest to 12 sets — dose-response Expect six weeks \(from "Weekly set volume/);
});

test('a study that is not for him files the note with no proposals; an unreadable source is an error, not a guess', async () => {
  const store = fakeStore();
  const r1 = await startPaper('/vault', { urls: ['https://x.y/marathon'] }, deps(store, {
    read: JSON.stringify({ ...CLAIMS, title: 'Elite Ethiopian marathoners', population: '14 elite male marathoners' }),
    judge: JSON.stringify({ verdict: 'not-for-him', grade: 'weak', summary: 'S', whyForHim: 'Not his population.', changes: [{ title: 'x', why: 'y', ops: [{ op: 'remove', routineId: 'push', exerciseId: 'cable-fly' }] }] }),
  }));
  await new Promise((r) => setTimeout(r, 40));
  const p = store.records.get(r1.id);
  assert.equal(p.status, 'pending');
  assert.deepEqual(p.proposals, []);
  assert.match(p.decision.title, /for you: not-for-him$/);
  const r2 = await startPaper('/vault', { urls: ['https://x.y/paywalled'] }, deps(store, { read: 'I could not access this paper.', judge: '{}' }));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(store.records.get(r2.id).status, 'error');
  assert.match(store.records.get(r2.id).error, /could not read that source into claims/);
  await assert.rejects(startPaper('/vault', {}, deps(store, {})), /give me the paper/);
});

// THE ROUTER: a paper aimed at his program goes to the study lane; a creator
// study, plain research and a bare link keep their own lanes.
test('router: "what would this study change in my program" is the paper lane; creator studies and research are not', async () => {
  const { routeIntent } = await import('../lib/intentRouter.js');
  const lane = (q) => routeIntent(q).lane;
  assert.equal(lane('what would this study change in my program https://pubmed.ncbi.nlm.nih.gov/27433992/'), 'paper');
  assert.equal(lane('apply this paper to my training https://x.y/z'), 'paper');
  assert.equal(lane('read this meta-analysis and tell me what it means for my block: https://x.y/z'), 'paper');
  assert.equal(lane('does this article change my plan? https://x.y/z'), 'paper');
  assert.equal(lane('analyse this creator https://www.youtube.com/@x'), 'study', 'a creator study is the other lane');
  assert.equal(lane('research zone 2 training'), 'research');
  assert.equal(lane('https://x.y/paper.pdf'), 'research', 'a bare link is still the Researcher');
  assert.equal(lane('should i deload today'), 'coach');
});

// THE WEEKLY PROGRAM CHECK (31 Oct 2026). Code finds the gaps in his plan
// against his ranges; the model proposes concrete changes; code refuses any
// change it cannot apply or that does not do what it claims, and writes the
// numbers on the card itself. His own notes never outrank a volume fix.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-check-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  templateWeek, completedWeeks, perSetMinutes, detectGaps, applyToTemplate, effectOf, validateChanges,
  programCardRecord, effectiveRanges, exerciseChangeThisWeek, declinedReplacements, runProgramCheck, checkDue,
  rangesKeyOf, movesLine, buildCheckPrompt, MAX_ADDED_MINUTES, sessionMinutesLine, maybeRunCoachChecks,
} = await import('../lib/coachProgramCheck.js');
const { opsFromFix } = await import('../lib/coachPlan.js');
const { coachSuggestions } = await import('../../src/coachSuggestions.js');
const { coachWaiting } = await import('../../src/trainSummaryFacts.js');
const { parseModelJson, firstBalancedObjectMatch } = await import('../lib/jsonSalvage.js');

const parse = (raw) => { const m = firstBalancedObjectMatch(String(raw || '')); return m ? parseModelJson(m[0]) : null; };
const GOAL = ['Side Delts', 'Rear Delts', 'Lats', 'Biceps'];
// fixture ids are not in the audit table, so each is taken at its own word
const EX = [
  { id: 'tst-press', name: 'Test Shoulder Press', muscleGroup: 'Front Delts', secondary: ['Side Delts', 'Triceps'] },
  { id: 'tst-lateral', name: 'Test Lateral Raise', muscleGroup: 'Side Delts' },
  { id: 'tst-cable-lateral', name: 'Test Cable Lateral', muscleGroup: 'Side Delts' },
  { id: 'tst-reverse-fly', name: 'Test Reverse Fly', muscleGroup: 'Rear Delts' },
  { id: 'tst-pulldown', name: 'Test Pulldown', muscleGroup: 'Lats', secondary: ['Biceps'] },
  { id: 'tst-curl', name: 'Test Curl', muscleGroup: 'Biceps' },
  { id: 'tst-curl-2', name: 'Test Hammer Curl', muscleGroup: 'Biceps', secondary: ['Forearms'] },
  { id: 'tst-squat', name: 'Test Squat', muscleGroup: 'Quads', secondary: ['Glutes'] },
  { id: 'tst-new', name: 'Test Unaudited', muscleGroup: 'Side Delts', audit: 'pending' },
  { id: 'tst-stretch', name: 'Test Stretch', muscleGroup: 'Mobility' },
];
const ROUTINES = [
  { id: 'push', name: 'Push', exercises: [{ exerciseId: 'tst-press', targetSets: 4, targetRepsLow: 6, targetRepsHigh: 10 }, { exerciseId: 'tst-lateral', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 }] },
  { id: 'pull', name: 'Pull', exercises: [{ exerciseId: 'tst-pulldown', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 12 }, { exerciseId: 'tst-curl', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 12 }, { exerciseId: 'tst-curl-2', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 12 }, { exerciseId: 'tst-reverse-fly', targetSets: 4, targetRepsLow: 12, targetRepsHigh: 15 }] },
  { id: 'legs', name: 'Legs', exercises: [{ exerciseId: 'tst-squat', targetSets: 4, targetRepsLow: 6, targetRepsHigh: 10 }] },
  { id: 'mob', name: 'Mobility', exercises: [{ exerciseId: 'tst-stretch', targetSets: 2, targetRepsLow: 8, targetRepsHigh: 8 }] },
  { id: 'arms', name: 'Arms Optional', exercises: [{ exerciseId: 'tst-curl', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 }] },
];
const SCHEDULE = { monday: 'push', tuesday: 'pull', wednesday: 'legs', thursday: 'push', friday: 'mob', saturday: 'pull' };

/* ----------------------------- the template ------------------------------- */

test('his weekly template, by the house rules: 1 to the primary, ½ to each secondary, a routine on two days twice, mobility nothing', () => {
  const t = templateWeek(ROUTINES, SCHEDULE, EX);
  // press 4×2 days: Front 8, Side ½×8=4, Triceps 4; lateral 3×2 = 6 → Side 10
  assert.equal(t.perMuscle['Side Delts'], 10);
  assert.equal(t.perMuscle['Front Delts'], 8);
  assert.equal(t.perMuscle.Lats, 8);
  assert.equal(t.perMuscle.Biceps, 8 + 8 + 4, 'curls 4×2 + 4×2, pulldown ½×8');
  assert.equal(t.perMuscle.Mobility, undefined);
  assert.equal(t.sets, 2 * 7 + 2 * 16 + 4, 'mobility sets are not training volume');
  assert.equal(t.days.length, 6);
});

test('completed weeks never include the week in progress, and a one-session week is a week away', () => {
  const now = new Date('2026-10-31T10:00:00');
  const weekly = [{ week: '2026-10-26', groups: { Lats: 12 } }, { week: '2026-10-19', groups: { Lats: 3 } }, { week: '2026-10-12', groups: { Lats: 9 } }];
  const sessions = [{ date: '2026-10-19' }, { date: '2026-10-13' }, { date: '2026-10-14' }, { date: '2026-10-16' }];
  const c = completedWeeks(weekly, { now, sessions });
  assert.deepEqual(c.map((w) => w.week), ['2026-10-19', '2026-10-12', '2026-10-05']);
  assert.equal(c[0].trained, false, 'one session');
  assert.equal(c[1].trained, true);
  assert.equal(c[2].trained, false, 'nothing logged');
});

test('his minutes per set are measured from watch-timed sessions; too few and it says it is an estimate', () => {
  assert.deepEqual(perSetMinutes([{ minutes: 80, sets: 20 }, { minutes: 45, sets: 15 }, { minutes: 74, sets: 19 }]), { minutes: 3.9, measured: true, days: 3 });
  assert.equal(perSetMinutes([{ minutes: 80, sets: 20 }]).measured, false);
  assert.match(sessionMinutesLine([{ routine: 'Upper', minutes: 80 }, { routine: 'Upper', minutes: 76 }, { routine: 'Pull', minutes: 45 }]), /Upper ~78 min \(2\), Pull ~45 min \(1\)/);
});

/* -------------------------------- detection ------------------------------- */

test('detection, ranked by goal impact: the plan cannot reach a floor, then weeks that keep landing short, then no direct lift, then past the top', () => {
  const t = templateWeek(ROUTINES, SCHEDULE, EX);
  const ranges = { 'Side Delts': [12, 20], Biceps: [10, 16] };
  const completed = [
    { week: 'w1', trained: true, groups: { Lats: 6, 'Rear Delts': 8 } },
    { week: 'w2', trained: true, groups: { Lats: 7, 'Rear Delts': 9 } },
    { week: 'w3', trained: false, groups: {} },
  ];
  const gaps = detectGaps({ template: t, completed, thisWeek: [{ muscle: 'Lats', bySunday: 8 }], ranges, goalMuscles: GOAL, routines: ROUTINES, exercises: EX, schedule: SCHEDULE });
  const kinds = gaps.map((g) => `${g.kind}:${g.muscle}`);
  assert.equal(kinds[0], 'plan-short:Side Delts', 'Side Delts plans 10 of 12');
  assert.equal(gaps[0].gap, 2);
  assert.ok(kinds.includes('plan-short:Lats'), 'Lats plans 8 of 10');
  assert.ok(kinds.includes('plan-over:Biceps'), 'Biceps plans 20 against a top of 16');
  assert.ok(kinds.indexOf('plan-over:Biceps') > kinds.indexOf('plan-short:Lats'));
  // rear delts: the plan reaches 8 < 10 → plan-short, not landing-short
  assert.ok(kinds.includes('plan-short:Rear Delts'));
});

test('landing short only when the plan reaches it, two real weeks missed it, and this week does not either', () => {
  const t = { perMuscle: { Lats: 12 }, sets: 12, days: [] };
  const completed = [{ week: 'a', trained: true, groups: { Lats: 6 } }, { week: 'b', trained: true, groups: { Lats: 7 } }, { week: 'c', trained: true, groups: { Lats: 12 } }];
  const base = { template: t, completed, ranges: null, goalMuscles: ['Lats'], routines: ROUTINES, exercises: EX, schedule: SCHEDULE };
  assert.equal(detectGaps({ ...base, thisWeek: [{ muscle: 'Lats', bySunday: 7 }] })[0].kind, 'landing-short');
  assert.equal(detectGaps({ ...base, thisWeek: [{ muscle: 'Lats', bySunday: 12 }] }).length, 0, 'this week lands it: the old weeks were the old program');
});

test('a goal muscle with no lift of its own is said, even when ½ credits reach the floor', () => {
  const t = templateWeek(ROUTINES, SCHEDULE, EX);
  const gaps = detectGaps({ template: t, completed: [], ranges: { Triceps: [2, 10] }, goalMuscles: ['Triceps'], routines: ROUTINES, exercises: EX, schedule: SCHEDULE });
  assert.deepEqual(gaps.map((g) => g.kind), ['no-direct']);
});

/* --------------------------- the template ops ----------------------------- */

test('a change is applied to a COPY, and its effect is computed: sets per muscle and minutes at his pace', () => {
  const ops = [{ op: 'prescribe', routineId: 'push', exerciseId: 'tst-lateral', targetSets: 4 }];
  const copy = applyToTemplate(ROUTINES, ops, EX);
  assert.equal(ROUTINES[0].exercises[1].targetSets, 3, 'his routines untouched');
  assert.equal(copy[0].exercises[1].targetSets, 4);
  const e = effectOf({ routines: ROUTINES, schedule: SCHEDULE, exercises: EX, ops, minutesPerSet: { minutes: 3.9 }.minutes });
  assert.deepEqual(e.moves.map((m) => [m.muscle, m.delta, m.before, m.after]), [['Side Delts', 2, 10, 12]], 'Push is on two days');
  assert.equal(e.setsDelta, 2);
  assert.equal(e.minutes, 8);
  assert.throws(() => applyToTemplate(ROUTINES, [{ op: 'remap', exerciseId: 'tst-curl', muscleGroup: 'Chest' }], EX), /not an operation this check may use/);
  assert.throws(() => applyToTemplate(ROUTINES, [{ op: 'add', routineId: 'push', exerciseId: 'tst-lateral' }], EX), /already in Push/);
  assert.throws(() => applyToTemplate(ROUTINES, [{ op: 'prescribe', routineId: 'push', exerciseId: 'tst-lateral', targetSets: 12 }], EX), /not 1-8/);
  assert.throws(() => applyToTemplate(ROUTINES, [{ op: 'remove', routineId: 'nope', exerciseId: 'tst-lateral' }], EX), /not in his plan/);
});

/* ------------------------------ the validation ---------------------------- */

const ctx = (over = {}) => {
  const t = templateWeek(ROUTINES, SCHEDULE, EX);
  const ranges = { 'Side Delts': [12, 20], Biceps: [10, 16] };
  const gaps = detectGaps({ template: t, completed: [], ranges, goalMuscles: GOAL, routines: ROUTINES, exercises: EX, schedule: SCHEDULE });
  return { routines: ROUTINES, schedule: SCHEDULE, exercises: EX, ranges, gaps, goalMuscles: GOAL, minutesPerSet: 3.9,
    evidence: [{ path: 'Wiki/Inbox/Side Delt Brief.md', title: 'Side Delt Brief', kind: 'Researcher brief' }], parse, ...over };
};
const change = (over) => ({ title: 'Lateral raise: 3 → 4 sets on Push', fixes: ['Side Delts'], ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'tst-lateral', targetSets: 4 }], why: 'Your brief says side delts want direct work.', evidence: ['Wiki/Inbox/Side Delt Brief.md', 'Wiki/Made Up.md'], ...over });

test('a good change survives with code\'s numbers on it; invented evidence is dropped', () => {
  const v = validateChanges(JSON.stringify({ changes: [change()] }), ctx());
  assert.equal(v.accepted.length, 1, JSON.stringify(v.refused));
  const a = v.accepted[0];
  assert.deepEqual(a.fixes, ['Side Delts']);
  assert.equal(a.minutes, 8);
  assert.deepEqual(a.evidence, [{ path: 'Wiki/Inbox/Side Delt Brief.md', title: 'Side Delt Brief' }]);
  assert.match(movesLine(a, { measured: true }), /^Side Delts \+2 \(10 → 12 of 12–20\) sets a week; adds ~8 min a week\.$/);
});

test('code refuses: moves nothing it claims, under a goal floor, past a goal top, too many minutes, unaudited, declined, a second swap', () => {
  const c = ctx();
  const refusedFor = (ch, extra = {}) => { const v = validateChanges(JSON.stringify({ changes: [ch] }), { ...c, ...extra }); assert.equal(v.accepted.length, 0, `${ch.title} should be refused`); return v.refused[0].why; };
  assert.match(refusedFor(change({ fixes: ['Lats'] })), /moves none of the muscles it claims to fix/);
  assert.match(refusedFor(change({ title: 'cut pulldowns', fixes: ['Biceps'], ops: [{ op: 'remove', routineId: 'pull', exerciseId: 'tst-pulldown' }] }), { ranges: { ...c.ranges, Lats: [4, 12] } }), /drops Lats under its floor/);
  assert.match(refusedFor(change({ title: 'more curls', fixes: ['Side Delts'], ops: [{ op: 'prescribe', routineId: 'push', exerciseId: 'tst-lateral', targetSets: 8 }] }), { ranges: { ...c.ranges, 'Side Delts': [12, 14] } }), /pushes Side Delts past its top/);
  assert.match(refusedFor(change({ ops: [{ op: 'add', routineId: 'legs', exerciseId: 'tst-cable-lateral', targetSets: 3 }, { op: 'prescribe', routineId: 'push', exerciseId: 'tst-lateral', targetSets: 5 }] })), new RegExp(`more than ${MAX_ADDED_MINUTES}`));
  assert.match(refusedFor(change({ ops: [{ op: 'add', routineId: 'legs', exerciseId: 'tst-new', targetSets: 2 }] })), /not audited/);
  assert.match(refusedFor(change({ ops: [{ op: 'swap', routineId: 'push', exerciseId: 'tst-lateral', replaceWith: 'tst-cable-lateral' }, { op: 'prescribe', routineId: 'push', exerciseId: 'tst-cable-lateral', targetSets: 4 }] }), { declined: new Set(['tst-cable-lateral']) }), /turned Test Cable Lateral down/);
  const swap = (title) => change({ title, ops: [{ op: 'swap', routineId: 'push', exerciseId: 'tst-press', replaceWith: 'tst-cable-lateral' }] });
  assert.match(refusedFor(swap('swap the press'), { swapAllowed: false }), /one exercise change a week/);
  const two = validateChanges(JSON.stringify({ changes: [swap('swap one'), change({ title: 'swap two', ops: [{ op: 'swap', routineId: 'push', exerciseId: 'tst-lateral', replaceWith: 'tst-cable-lateral' }, { op: 'prescribe', routineId: 'push', exerciseId: 'tst-cable-lateral', targetSets: 4 }] })] }), c);
  assert.equal(two.accepted.filter((a) => a.hasSwap).length, 1, 'one swap a week, across the run');
  assert.equal(validateChanges('not json', c).accepted.length, 0);
});

test('cutting past-the-top volume is a change in its own right, and it saves time', () => {
  const v = validateChanges(JSON.stringify({ changes: [{ title: 'Hammer curl: 4 → 2 sets on Pull', fixes: ['Biceps'], ops: [{ op: 'prescribe', routineId: 'pull', exerciseId: 'tst-curl-2', targetSets: 2 }], why: 'Biceps sit past the top.' }] }), ctx());
  assert.equal(v.accepted.length, 1, JSON.stringify(v.refused));
  assert.equal(v.accepted[0].minutes, -16);
  assert.match(movesLine(v.accepted[0], { measured: false }), /Biceps −4 .*saves ~16 min a week \(estimated\)/);
});

test('at most three, ranked: the biggest goal gap first, fewer minutes breaking a tie; a change already waiting is not twinned', () => {
  const lat = change();
  const fly = { title: 'Reverse fly: 4 → 5 on Pull', fixes: ['Rear Delts'], ops: [{ op: 'prescribe', routineId: 'pull', exerciseId: 'tst-reverse-fly', targetSets: 5 }], why: 'x' };
  const cut = { title: 'Hammer curl 4 → 2', fixes: ['Biceps'], ops: [{ op: 'prescribe', routineId: 'pull', exerciseId: 'tst-curl-2', targetSets: 2 }], why: 'x' };
  const pull = { title: 'Pulldown 4 → 5', fixes: ['Lats'], ops: [{ op: 'prescribe', routineId: 'pull', exerciseId: 'tst-pulldown', targetSets: 5 }], why: 'x' };
  const v = validateChanges(JSON.stringify({ changes: [cut, fly, lat, pull] }), ctx());
  assert.equal(v.accepted.length, 3);
  assert.deepEqual(v.accepted.map((a) => a.title).sort(), [fly.title, lat.title, pull.title].sort(), 'three goal gaps closed outrank time won back');
  assert.deepEqual(v.refused, [{ title: cut.title, why: 'more than 3 changes' }]);
  // with room, the cut comes after every gap-closer
  const two = validateChanges(JSON.stringify({ changes: [cut, lat] }), ctx());
  assert.deepEqual(two.accepted.map((a) => a.title), [lat.title, cut.title]);
  const twin = validateChanges(JSON.stringify({ changes: [lat] }), ctx({ pendingKeys: new Set([v.accepted.find((a) => a.title === lat.title).key]) }));
  assert.match(twin.refused[0].why, /already waiting/);
});

/* -------------------------------- the card -------------------------------- */

test('the card rides the coach-program rails: its yes applies the ops, its numbers are code\'s, the deck leads with it', () => {
  const [a] = validateChanges(JSON.stringify({ changes: [change()] }), ctx()).accepted;
  const now = new Date('2026-10-31T09:00:00Z');
  const rec = programCardRecord(a, { week: '2026-10-26', rank: 0, rangesLabel: 'your ranges', minutesPerSet: { minutes: 3.9, measured: true }, now });
  assert.equal(rec.kind, 'coach-program');
  assert.equal(rec.findingKind, 'program-check');
  assert.equal(rec.status, 'pending');
  assert.deepEqual(opsFromFix(rec.fix), a.ops, 'his yes goes through applyOps, undoably');
  assert.match(rec.text, /^Coach: Lateral raise: 3 → 4 sets on Push\. Side Delts \+2 \(10 → 12 of 12–20\) sets a week; adds ~8 min a week\. Your brief says/);
  assert.match(rec.text, /\(From: Side Delt Brief\.\)$/);
  // the deck: ranges card first, then the check, then everything else, his notes last
  const items = [
    { id: 'n1', kind: 'coach-program', findingKind: 'reported-form', status: 'pending', text: 'Coach: You have flagged your own form on X 2 times.', createdAt: '2026-10-29T00:00:00Z' },
    { ...rec },
    { id: 'r1', key: 'coach-ranges:2026-10-31', status: 'pending', createdAt: '2026-10-31T10:00:00Z', decision: { route: 'goal-target', payload: { action: 'goal', settings: { volumeRanges: { 'Side Delts': [12, 20] } } } }, rangesProposal: { summary: 's', rows: [{ muscle: 'Side Delts', low: 12, high: 20, goal: true, why: 'w' }], sources: [{ title: 'Brief' }], kept: [] } },
    { id: 'm1', kind: 'coach-program', findingKind: 'mapping', status: 'pending', text: 'Coach: remap.', createdAt: '2026-10-20T00:00:00Z' },
  ];
  const cards = coachSuggestions(items, { routines: ROUTINES, schedule: SCHEDULE, now: now.getTime() });
  assert.deepEqual(cards.map((c) => c.id), ['r1', rec.id, 'm1', 'n1']);
  const check = cards[1];
  assert.equal(check.via, 'approve', 'a real yes, not "a yes asks Coach to draft"');
  assert.equal(check.diff.type, 'muscles');
  assert.deepEqual(check.diff.moves, [{ muscle: 'Side Delts', delta: 2, after: 12, low: 12, high: 20 }]);
  assert.equal(check.diff.minutes, 8);
  assert.equal(check.source, "From Coach's weekly program check");
  assert.equal(cards[0].headline, 'Your weekly set ranges, from your research');
  assert.equal(cards[0].diff.type, 'ranges');
  assert.equal(cards[0].source, 'From your research, read by Coach');
  assert.equal(coachWaiting(cards).headline, 'Coach proposed your weekly ranges — review');
  assert.equal(coachWaiting(cards.slice(1)).headline, check.headline);
});

/* ---------------------------- ranges and guards --------------------------- */

test('which ranges a check judges against, said on every card', () => {
  const pending = { status: 'pending', key: 'coach-ranges:2026-10-31', decision: { payload: { settings: { volumeRanges: { Lats: [12, 20] } } } } };
  assert.deepEqual(effectiveRanges({ volumeRanges: { Lats: [10, 18] } }, [pending]).ranges, { Lats: [12, 20] });
  assert.match(effectiveRanges(null, [pending]).label, /proposed from your research on 2026-10-31, waiting on your yes/);
  assert.match(effectiveRanges({ volumeRanges: { Lats: [10, 18] }, volumeRangesSource: { date: '2026-10-31' } }, []).label, /your ranges, from your research \(2026-10-31\)/);
  assert.match(effectiveRanges({}, []).label, /the 10-20 default/);
  assert.notEqual(rangesKeyOf(effectiveRanges(null, [pending])), rangesKeyOf(effectiveRanges({}, [])));
  assert.deepEqual(checkDue({ state: { week: '2026-10-26', rangesKey: 'a' }, week: '2026-10-26', rangesKey: 'a' }).due, false);
  assert.equal(checkDue({ state: { week: '2026-10-26', rangesKey: 'a' }, week: '2026-10-26', rangesKey: 'b' }).why, 'the ranges changed');
  assert.equal(checkDue({ state: { week: '2026-10-19' }, week: '2026-10-26', rangesKey: 'a' }).why, 'a new week');
});

test('the stall restraint\'s guards, read across lanes: one exercise change a week, a declined replacement stays declined for 60 days', () => {
  const now = Date.parse('2026-10-31T09:00:00Z');
  assert.equal(exerciseChangeThisWeek([{ kind: 'coach-program', findingKind: 'stale', createdAt: '2026-10-28T00:00:00Z' }], now), true);
  assert.equal(exerciseChangeThisWeek([{ kind: 'coach-program', findingKind: 'program-check', finding: { exerciseChange: true }, createdAt: '2026-10-29T00:00:00Z' }], now), true);
  assert.equal(exerciseChangeThisWeek([{ kind: 'coach-program', findingKind: 'stale', createdAt: '2026-10-20T00:00:00Z' }], now), false);
  const d = declinedReplacements([
    { kind: 'coach-program', status: 'discarded', discardedAt: '2026-10-20T00:00:00Z', fix: { action: 'swap', replaceWith: 'a' } },
    { kind: 'coach-program', status: 'discarded', discardedAt: '2026-10-20T00:00:00Z', fix: { action: 'ops', ops: [{ op: 'swap', replaceWith: 'b' }] } },
    { kind: 'coach-program', status: 'discarded', discardedAt: '2026-07-01T00:00:00Z', fix: { action: 'swap', replaceWith: 'c' } },
  ], now);
  assert.deepEqual([...d].sort(), ['a', 'b']);
});

test('the prompt carries the gaps, the time, the evidence and the swap rule — and the ops it may use', () => {
  const c = ctx();
  const p = buildCheckPrompt({ goal: 'V', goalMuscles: GOAL, rangesLabel: 'your ranges', rangesLine: 'Side Delts 12-20', gaps: c.gaps, program: 'P', library: 'L', minutesPerSet: { minutes: 3.9, measured: true, days: 5 }, sessionMinutes: 'Measured session lengths: Upper ~78 min (2).', evidence: c.evidence, declined: ['Deadlift'], swapAllowed: false, today: '2026-10-31' });
  assert.match(p, /1\. Side Delts: your weekly plan credits 10 sets against a floor of 12/);
  assert.match(p, /3\.9 min per working set \(median of 5 watch-timed sessions\)/);
  assert.match(p, /NO swaps this week/);
  assert.match(p, /never offer these\): Deadlift/);
  assert.match(p, /"op":"prescribe"/);
  assert.doesNotMatch(p, /"op":"remap"/);
});

/* --------------------------------- the run -------------------------------- */

const runDeps = (over = {}) => {
  const filed = [];
  return {
    filed,
    deps: {
      laneEnabled: () => true,
      listRecords: async () => [],
      exercises: EX,
      plan: { routines: ROUTINES, schedule: SCHEDULE },
      sessions: [],
      goals: async () => ({ goal: 'V-taper', goalMuscles: GOAL, volumeRanges: { 'Side Delts': [12, 20], Biceps: [10, 16] } }),
      goalMuscles: GOAL,
      thisWeek: null,
      timing: [{ minutes: 80, sets: 20 }, { minutes: 45, sets: 15 }, { minutes: 74, sets: 19 }],
      evidence: [{ path: 'Wiki/Inbox/Side Delt Brief.md', title: 'Side Delt Brief', kind: 'Researcher brief' }],
      ask: async () => ({ text: JSON.stringify({ changes: [change()] }), costUsd: 0.9 }),
      file: async (r) => { filed.push(r); return r; },
      now: new Date('2026-10-31T09:00:00Z'),
      ...over,
    },
  };
};

test('a run: code detects, the model proposes, code files the cards that survive — nothing applied', async () => {
  const t = runDeps();
  const out = await runProgramCheck('/v', t.deps);
  assert.equal(out.status, 'filed', JSON.stringify(out.refused));
  assert.equal(t.filed.length, 1);
  assert.equal(t.filed[0].status, 'pending', 'a card waits on his yes');
  assert.equal(out.minutesPerSet.minutes, 3.9);
  // regression, 31 Oct real run: the cards read "saves ~NaN min a week"
  assert.equal(t.filed[0].finding.minutesPerWeek, 8);
  assert.doesNotMatch(t.filed[0].text, /NaN/);
  assert.match(t.filed[0].finding.against, /your ranges/);
});

test('a run stands down: cards still waiting, a clean plan, a switched-off lane, a model that failed', async () => {
  const waiting = runDeps({ listRecords: async () => [{ kind: 'coach-program', findingKind: 'program-check', status: 'pending' }] });
  assert.equal((await runProgramCheck('/v', waiting.deps)).status, 'skipped');
  const clean = runDeps({ goals: async () => ({ volumeRanges: { 'Side Delts': [6, 20], 'Rear Delts': [6, 20], Lats: [6, 20], Biceps: [6, 30] } }) });
  let asked = false;
  clean.deps.ask = async () => { asked = true; return ''; };
  assert.equal((await runProgramCheck('/v', clean.deps)).status, 'clean');
  assert.equal(asked, false, 'no gap, no model');
  assert.equal((await runProgramCheck('/v', runDeps({ laneEnabled: () => false }).deps)).status, 'off');
  const broke = runDeps({ ask: async () => { throw new Error('limit'); } });
  assert.equal((await runProgramCheck('/v', broke.deps)).status, 'error');
  assert.equal(broke.filed.length, 0);
});

test('the scheduler glue: ranges first, then the check, once a week and again when the ranges change', async () => {
  const calls = [];
  const deps = {
    listRecords: async () => [],
    goals: async () => ({}),
    runRanges: async () => { calls.push('ranges'); return { status: 'skipped' }; },
    runCheck: async () => { calls.push('check'); return { status: 'clean' }; },
    now: new Date('2026-10-31T09:00:00Z'),
  };
  const a = await maybeRunCoachChecks('/v', deps);
  assert.deepEqual(calls, ['ranges', 'check']);
  assert.equal(a.check.status, 'clean');
  const b = await maybeRunCoachChecks('/v', deps);
  assert.deepEqual(calls, ['ranges', 'check', 'ranges'], 'checked this week against these ranges already');
  assert.equal(b.check.status, 'skipped');
  deps.goals = async () => ({ volumeRanges: { Lats: [12, 20] } });
  await maybeRunCoachChecks('/v', deps);
  assert.deepEqual(calls.slice(-2), ['ranges', 'check'], 'his ranges changed: check again');
});

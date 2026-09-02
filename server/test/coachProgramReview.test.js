// The Coach's program review: catching a mis-filed lift, a lift that has
// stopped paying, and a muscle short for weeks — then asking until answered.
//
// The false positives in here are not hypothetical. The first draft of the
// name rules announced that a Seated Leg Curl trains biceps and that a
// Wide-Grip Pull-Up trains forearms. A coach who says that once is never
// believed again, so each of those is now a test.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  expectedGroupFromName, findMappingSuspects, findStaleLifts,
  findChronicUnderVolume, rankFindings, nudgeDue, nudgeLine, NUDGE_DAYS,
} = await import('../lib/coachProgramReview.js');

test('the expert reads a lift name the way a coach would', () => {
  assert.equal(expectedGroupFromName('Face Pull'), 'Shoulders');
  assert.equal(expectedGroupFromName('Barbell Row'), 'Back');
  assert.equal(expectedGroupFromName('Preacher Curl'), 'Biceps');
  assert.equal(expectedGroupFromName('Tricep Pushdown'), 'Triceps');
  assert.equal(expectedGroupFromName('Leg Press'), 'Quads');
});

test('a compound name containing a generic word is never read by the generic word', () => {
  // every one of these was wrong in the first draft
  assert.equal(expectedGroupFromName('Seated Leg Curl'), 'Hamstrings', 'not Biceps');
  assert.equal(expectedGroupFromName('Nordic Curl'), 'Hamstrings', 'not Biceps');
  assert.equal(expectedGroupFromName('Wrist Curl'), 'Forearms', 'not Biceps');
  assert.equal(expectedGroupFromName('Wide-Grip Pull-Up'), 'Back', 'a grip is a modifier, not a muscle');
  assert.equal(expectedGroupFromName('Close-Grip Bench Press'), 'Chest', 'ditto');
  assert.equal(expectedGroupFromName('Leg Press Calf Raise'), 'Calves', 'not Quads');
  assert.equal(expectedGroupFromName('Cable Glute Kickback'), 'Glutes', 'not Triceps');
});

test('it says nothing about a name it cannot read — silence beats a wrong correction', () => {
  // a Jefferson curl is spinal flexion, not a biceps curl; a sled or a carry
  // depends on how it is loaded. Coach only corrects him when it is certain.
  assert.equal(expectedGroupFromName('Jefferson Curl'), null);
  assert.equal(expectedGroupFromName('Sled Push'), null);
  assert.equal(expectedGroupFromName('Farmer Carry'), null);
  assert.equal(expectedGroupFromName('Push Day Complex'), null);
  assert.equal(expectedGroupFromName(''), null);
});

test('a mis-filed lift is caught, and the fix moves it to the right muscle', () => {
  const out = findMappingSuspects([
    { id: 'face-pull', name: 'Face Pull', muscleGroup: 'Back' },
    { id: 'row', name: 'Barbell Row', muscleGroup: 'Back' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].expected, 'Shoulders');
  assert.deepEqual(out[0].fix, { action: 'remap', exerciseId: 'face-pull', muscleGroup: 'Shoulders' });
  assert.match(out[0].line, /landing on the wrong muscle/);
});

test('a compound filed under either of its prime movers is a CHOICE, not an error', () => {
  const out = findMappingSuspects([
    { id: 'bench', name: 'Bench Press', muscleGroup: 'Triceps' },
    { id: 'dl', name: 'Sumo Deadlift', muscleGroup: 'Glutes' },
    { id: 'row2', name: 'Cable Row', muscleGroup: 'Biceps' },
  ]);
  assert.deepEqual(out, [], 'Coach does not pick fights it cannot win');
});

test('a lift flat across four sessions and three weeks earns a swap — to the same muscle', () => {
  const sessions = [
    { date: '2026-08-01', exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: 20, reps: 10 }] }] },
    { date: '2026-08-08', exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: 20, reps: 10 }] }] },
    { date: '2026-08-15', exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: 20, reps: 10 }] }] },
    { date: '2026-08-22', exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: 20, reps: 10 }] }] },
  ];
  const exercises = [
    { id: 'fly', name: 'Cable Fly', muscleGroup: 'Chest' },
    { id: 'incline', name: 'Incline Bench Press', muscleGroup: 'Chest' },
    { id: 'curl', name: 'Curl', muscleGroup: 'Biceps' },
  ];
  const out = findStaleLifts(sessions, exercises, { now: new Date('2026-08-23T12:00:00') });
  assert.equal(out.length, 1);
  assert.equal(out[0].fix.action, 'swap');
  assert.equal(out[0].fix.replaceWith, 'incline', 'the alternative trains the SAME muscle');
  assert.ok(!out[0].alternatives.some((a) => a.id === 'curl'), 'never offers a different muscle as a substitute');
});

test('a lift still climbing is left alone, and an off day is not evidence', () => {
  const climbing = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((date, i) => ({
    date, exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: 20 + i * 2.5, reps: 10 }] }],
  }));
  const exercises = [{ id: 'fly', name: 'Cable Fly', muscleGroup: 'Chest' }, { id: 'x', name: 'Other Press', muscleGroup: 'Chest' }];
  assert.deepEqual(findStaleLifts(climbing, exercises, { now: new Date('2026-08-23T12:00:00') }), []);

  const flagged = climbing.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, anomaly: 'sick' })) }));
  assert.deepEqual(findStaleLifts(flagged, exercises, { now: new Date('2026-08-23T12:00:00') }), [], 'an off day is excluded');
});

test('a stale lift with nothing else for that muscle stays quiet — no empty advice', () => {
  const sessions = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((date) => ({
    date, exercises: [{ exerciseId: 'only', name: 'Only Chest Thing', sets: [{ weight: 20, reps: 10 }] }],
  }));
  const out = findStaleLifts(sessions, [{ id: 'only', name: 'Only Chest Thing', muscleGroup: 'Chest' }], { now: new Date('2026-08-23T12:00:00') });
  assert.deepEqual(out, []);
});

test('a goal muscle short three weeks running is a programming finding, not a bad week', () => {
  const weekly = [
    { week: '2026-08-17', groups: { Biceps: 8 } },
    { week: '2026-08-10', groups: { Biceps: 9 } },
    { week: '2026-08-03', groups: { Biceps: 7 } },
  ];
  const out = findChronicUnderVolume(weekly, { goalMuscles: ['Biceps'], target: 12 });
  assert.equal(out.length, 1);
  assert.equal(out[0].avg, 8);
  assert.match(out[0].line, /3 weeks running/);
  // one good week inside the window and it is not chronic
  weekly[1].groups.Biceps = 13;
  assert.deepEqual(findChronicUnderVolume(weekly, { goalMuscles: ['Biceps'], target: 12 }), []);
});

test('a wrong mapping outranks everything — it corrupts every other number', () => {
  const ranked = rankFindings([
    { kind: 'stale', key: 'a' }, { kind: 'under-volume', key: 'b' }, { kind: 'mapping', key: 'c' },
  ]);
  assert.deepEqual(ranked.map((f) => f.kind), ['mapping', 'under-volume', 'stale']);
});

test('it nudges on a schedule, escalates once, then stops for good', () => {
  const day = 86_400_000;
  const t0 = Date.parse('2026-08-01T08:00:00Z');
  const rec = { createdAt: new Date(t0).toISOString(), lastRaisedAt: new Date(t0).toISOString(), nudges: 0, text: 'Coach: swap the fly.' };
  assert.equal(nudgeDue(rec, t0 + 2 * day), null, 'two days is not nagging territory');
  const first = nudgeDue(rec, t0 + NUDGE_DAYS[0] * day);
  assert.equal(first.nudge, 1);
  assert.equal(first.final, false);

  const after = { ...rec, nudges: 1, lastRaisedAt: new Date(t0 + 3 * day).toISOString() };
  assert.equal(nudgeDue(after, t0 + 5 * day), null, 'the clock restarts from the last raise');
  const second = nudgeDue(after, t0 + (3 + NUDGE_DAYS[1]) * day);
  assert.equal(second.final, true, 'the second is the last');
  assert.match(nudgeLine(after, 2), /Last time I'll raise it/);

  const spent = { ...after, nudges: NUDGE_DAYS.length };
  assert.equal(nudgeDue(spent, t0 + 400 * day), null, 'after the last one it never asks again');
});

test('raising: one at a time, never a duplicate, never more than two open', async () => {
  const { raiseProgramFindings } = await import('../lib/coachProgramReview.js');
  const rows = [];
  const store = {
    listRecords: async () => rows,
    createRecord: async (r) => { rows.push(r); return r; },
    updateRecord: async (id, patch) => { Object.assign(rows.find((r) => r.id === id), patch); },
  };
  const findings = [
    { kind: 'mapping', key: 'k1', line: 'one', fix: { action: 'remap' } },
    { kind: 'stale', key: 'k2', line: 'two', fix: { action: 'swap' } },
    { kind: 'stale', key: 'k3', line: 'three', fix: null },
  ];
  const review = async () => ({ findings });

  const first = await raiseProgramFindings('/tmp/v', { store, review, now: Date.now() });
  assert.equal(first.raised.length, 2, 'two at most — a list of asks is noise, not coaching');

  const again = await raiseProgramFindings('/tmp/v', { store, review, now: Date.now() });
  assert.equal(again.raised.length, 0, 'the open ones fill the cap and nothing is duplicated');

  // he answers one; the third may now be raised, but the ANSWERED one never again
  rows.find((r) => r.findingKey === 'k1').status = 'filed';
  const third = await raiseProgramFindings('/tmp/v', { store, review, now: Date.now() });
  assert.deepEqual(third.raised.map((r) => r.findingKey), ['k3']);
  const fourth = await raiseProgramFindings('/tmp/v', { store, review, now: Date.now() });
  assert.equal(fourth.raised.length, 0);
  assert.equal(rows.filter((r) => r.findingKey === 'k1').length, 1, 'an answered finding is never re-raised');
});

test('an unanswered ask is nudged, and the nudge rewrites the line rather than stacking a record', async () => {
  const { raiseProgramFindings } = await import('../lib/coachProgramReview.js');
  const day = 86_400_000;
  const t0 = Date.parse('2026-08-01T08:00:00Z');
  const rows = [{ id: 'a', kind: 'coach-program', findingKey: 'k1', status: 'pending', text: 'Coach: swap the fly.', nudges: 0, createdAt: new Date(t0).toISOString(), lastRaisedAt: new Date(t0).toISOString() }];
  const store = {
    listRecords: async () => rows,
    createRecord: async (r) => { rows.push(r); return r; },
    updateRecord: async (id, patch) => { Object.assign(rows.find((r) => r.id === id), patch); },
  };
  const out = await raiseProgramFindings('/tmp/v', { store, review: async () => ({ findings: [] }), now: t0 + 4 * day });
  assert.equal(out.nudged.length, 1);
  assert.equal(rows.length, 1, 'nudging does not create a second record');
  assert.equal(rows[0].nudges, 1);
  assert.match(rows[0].text, /Still open/);
});


test('a finding he argued down does not return under next week\'s key — until its number has materially moved, and then it says so', async () => {
  const { raiseProgramFindings, subjectOfKey, findingMetric } = await import('../lib/coachProgramReview.js');
  assert.equal(subjectOfKey('under:Chest:2026-08-24'), 'under:Chest');
  assert.equal(subjectOfKey('effort:89:2026-08-24'), 'effort');
  assert.equal(findingMetric({ kind: 'under-volume', avg: 8, target: 12 }), 4);
  assert.equal(findingMetric({ kind: 'mapping' }), null, 'stable keys carry no metric — their exact key already makes a no permanent');

  const day = 86_400_000;
  const t0 = Date.parse('2026-08-03T08:00:00Z');
  const rows = [{
    id: 'a', kind: 'coach-program', findingKey: 'under:Chest:2026-07-27', status: 'discarded', discardedAt: new Date(t0).toISOString(),
    declineReason: 'shoulder is grumpy', finding: { kind: 'under-volume', muscle: 'Chest', avg: 8, target: 12 }, text: 'Coach: Chest under.', createdAt: new Date(t0).toISOString(),
  }];
  const store = {
    listRecords: async () => rows,
    createRecord: async (r) => { rows.push(r); return r; },
    updateRecord: async (id, patch) => { Object.assign(rows.find((r) => r.id === id), patch); },
  };
  const finding = (week, avg) => ({ kind: 'under-volume', key: `under:Chest:${week}`, muscle: 'Chest', avg, target: 12, weeks: 3, line: `Chest has been under target — averaging ${avg} against 12.`, fix: null });

  // next week, same picture → the no holds (this used to re-raise: new key, same subject)
  let out = await raiseProgramFindings('/tmp/v', { store, review: async () => ({ findings: [finding('2026-08-03', 8)] }), now: t0 + 7 * day });
  assert.equal(out.raised.length, 0, 'a new week key is not a new finding');
  // five weeks on, the number barely moved → still no
  out = await raiseProgramFindings('/tmp/v', { store, review: async () => ({ findings: [finding('2026-09-07', 7.5)] }), now: t0 + 35 * day });
  assert.equal(out.raised.length, 0, 'a 12.5% move is not material');
  // five weeks on and materially worse → it returns, naming the history
  out = await raiseProgramFindings('/tmp/v', { store, review: async () => ({ findings: [finding('2026-09-07', 6)] }), now: t0 + 35 * day });
  assert.equal(out.raised.length, 1);
  assert.match(out.raised[0].text, /You passed on this on 3 Aug \("shoulder is grumpy"\); the number behind it has moved from 4 to 6\./);
});


test('the second nudge speaks from the original line — nudges do not compound', async () => {
  const { raiseProgramFindings, nudgeLine } = await import('../lib/coachProgramReview.js');
  const day = 86_400_000;
  const t0 = Date.parse('2026-08-01T08:00:00Z');
  const rows = [];
  const store = {
    listRecords: async () => rows,
    createRecord: async (r) => { rows.push(r); return r; },
    updateRecord: async (id, patch) => { Object.assign(rows.find((r) => r.id === id), patch); },
  };
  const review = async () => ({ findings: [{ kind: 'stale', key: 'k9', line: 'swap the fly for a press.', fix: null }] });
  await raiseProgramFindings('/tmp/v', { store, review, now: t0 });
  assert.equal(rows[0].originalText, 'Coach: swap the fly for a press.');
  await raiseProgramFindings('/tmp/v', { store, review, now: t0 + 4 * day });
  assert.match(rows[0].text, /^Still open, sir: swap the fly for a press\./);
  await raiseProgramFindings('/tmp/v', { store, review, now: t0 + 12 * day }); // NUDGE_DAYS[1] = 7 after the first nudge
  assert.match(rows[0].text, /^Last time I'll raise it, sir: swap the fly for a press\./);
  assert.doesNotMatch(rows[0].text, /Still open/, 'the first nudge\'s phrasing must not be inside the second');
  // a record from before originalText existed still nudges from its text
  assert.match(nudgeLine({ text: 'Coach: add a row.' }, 1), /^Still open, sir: add a row\./);
});

// ---- [17] plan 3 (gated → exact match): the client file ranks the alternatives ----
test('demoteAverted: a candidate named in the What Works Avoid section sinks to the bottom with the reason; nothing fuzzy', async () => {
  const { demoteAverted } = await import('../lib/coachProgramReview.js');
  const page = `# What Works For Hayden\n\n## Responds to\n- 2026-09-01 — Direct arm isolation work is where he is progressing.\n\n## Avoid / does not land\n- 2026-08-29 — Cable Lateral Raise (behind back) form breaks down specifically on his left side under load.\n- 2026-09-01 — Left-side shoulder instability now shows up on Dumbbell Shoulder Press (Single Arm) too.\n\n## Nutrition patterns\n- Protein lands late.`;
  const alts = [{ id: 'a', name: 'Cable Lateral Raise (behind back)' }, { id: 'b', name: 'Machine Lateral Raise' }, { id: 'c', name: 'Dumbbell Shoulder Press (Single Arm)' }, { id: 'd', name: 'Arnold Press' }];
  const r = demoteAverted(alts, page);
  assert.deepEqual(r.ordered.map((x) => x.id), ['b', 'd', 'a', 'c']);
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[0].reason, /^Cable Lateral Raise \(behind back\) form breaks down/);
  // a lift mentioned only under "Responds to" is not averted
  assert.deepEqual(demoteAverted([{ id: 'x', name: 'Direct arm isolation work' }], page).skipped, []);
  assert.deepEqual(demoteAverted(alts, '').ordered.map((x) => x.id), ['a', 'b', 'c', 'd'], 'no file, no change');
  assert.deepEqual(demoteAverted(alts, '# Page\n\n## Responds to\n- nothing').skipped, [], 'no Avoid section, nothing skipped');
});

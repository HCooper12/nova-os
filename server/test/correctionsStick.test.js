// CORRECTIONS STICK (second-brain audit #2, 7 Nov 2026). He closed the shoulder
// three times and the record never moved. These hold the three halves: a
// closed area reads as closed to every agent; his own words close it; the
// records are compared. Temp data and vault, set before any import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'nova-corrections-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
const vault = path.join(root, 'vault');
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
await mkdir(path.join(vault, 'Wiki', 'Health'), { recursive: true });

const {
  areaTerms, namesArea, closedAreas, closedAsOf, isStaleConcern, scrubClosed,
} = await import('../lib/concernClose.js');
const {
  addInjury, listInjuries, resolveInjury, resolveInjuries, reopenInjuries, injuriesContext, closedConcerns, closedLine, _reset,
} = await import('../lib/injuryLog.js');
const { lastDebriefLine, debriefMemoryContext, rememberDebrief } = await import('../lib/debriefMemory.js');
const { withoutClosed } = await import('../lib/coachKnowledge.js');
const { findNoteSignals } = await import('../lib/coachProgramReview.js');
const { composeShow } = await import('../lib/morningShow.js');

test.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

const SHOULDER_ENTRY = { area: 'Shoulder', note: 'Lateral raises paused pending a physio assessment.', severity: 'moderate', startedAt: '2026-10-13', resolvedAt: '2026-11-07' };
const NOW = new Date('2026-11-08T00:00:00Z');
const closedShoulder = closedAreas([SHOULDER_ENTRY], { now: NOW });

test('an area is read as a body part: an exercise named after it is not it', () => {
  assert.deepEqual(areaTerms('Shoulder').exact, ['shoulder']);
  assert.ok(areaTerms('Lower back / hip (above glutes)').exact.includes('lower back'));
  assert.ok(namesArea('my shoulder is sore', 'Shoulder'));
  assert.ok(namesArea('both shoulders', 'Shoulder'));
  assert.ok(!namesArea('the shoulder press felt strong', 'Shoulder'));
  assert.ok(!namesArea('hip thrust went well', 'Lower back / hip (above glutes)'));
  assert.ok(namesArea('my back is fine', 'Lower back / hip (above glutes)'));
  assert.ok(!namesArea("I'm back and ready to train", 'Lower back / hip (above glutes)'));
});

test('a closed area is named with the rule not to raise it; an active one is still loud', async () => {
  _reset();
  const hurt = await addInjury(vault, { area: 'Shoulder', note: 'Lateral raises paused pending a physio assessment.', severity: 'moderate' });
  await addInjury(vault, { area: 'Lower back / hip', note: 'Dull ache above the glutes', severity: 'niggle' });
  await resolveInjury(vault, hurt.id);
  const ctx = await injuriesContext(vault);
  assert.match(ctx, /ACTIVE INJURIES[\s\S]*Lower back \/ hip/);
  assert.match(ctx, /CLOSED BY HIM[\s\S]*Shoulder \(closed \d{4}-\d{2}-\d{2}\)/);
  assert.match(ctx, /Do not raise them, ask about them, suggest a physio/);
  assert.equal(closedLine([]), null);
});

test('an area that hurts again is not closed: an active entry outranks the old resolution', () => {
  const again = [SHOULDER_ENTRY, { area: 'Shoulder', note: 'pinching again', severity: 'niggle', startedAt: '2026-11-08' }];
  assert.deepEqual(closedAreas(again, { now: NOW }), []);
  assert.deepEqual(closedAreas([SHOULDER_ENTRY], { now: new Date('2027-06-01T00:00:00Z') }), [], 'a closure past the window stops being named');
});

test('old text about a closed area is taken out; the rest of it stays', () => {
  const debrief = "Push went well, 4,247kg against 3,261kg. The shoulder note is what I'd carry forward. You kept the sore-shoulder overhead pattern out of it. Shoulder press held RPE 9.";
  const out = scrubClosed(debrief, closedShoulder);
  assert.doesNotMatch(out, /carry forward|sore-shoulder/);
  assert.match(out, /4,247kg/);
  assert.match(out, /Shoulder press held RPE 9/, 'the lift is not the worry');
  assert.doesNotMatch(scrubClosed('Have you seen the physio yet? Bench is up.', closedShoulder), /physio/);
  assert.equal(scrubClosed(debrief, []), debrief);
  assert.ok(isStaleConcern('Shoulder pain mid left side', closedShoulder));
  assert.ok(!isStaleConcern('He does not count his shoulder entries as an injury and will not see a physio.', closedShoulder), 'the closing line itself is what must survive');
});

test('text written after the closure is new evidence and keeps its voice', () => {
  assert.deepEqual(closedAsOf(closedShoulder, '2026-11-09'), []);
  assert.equal(closedAsOf(closedShoulder, '2026-10-13').length, 1);
  const after = { text: 'New shoulder pain at the top of the press.', date: '2026-11-09', at: '2026-11-09T01:00:00Z' };
  assert.match(lastDebriefLine(after, { closed: closedShoulder }), /New shoulder pain/);
});

test('debrief memory no longer hands the Coach a carry about a closed area', async () => {
  await rememberDebrief({ routineId: 'push', routineName: 'Push', sessionId: 's1', date: '2026-10-13', text: "Bench moved. The shoulder pain is what I'd carry forward." });
  const ctx = await debriefMemoryContext('push', { closed: closedShoulder });
  assert.match(ctx, /Bench moved/);
  assert.doesNotMatch(ctx, /carry forward/);
  await rememberDebrief({ routineId: 'pull', routineName: 'Pull', sessionId: 's2', date: '2026-10-13', text: 'Sore shoulder today.' });
  assert.equal(await debriefMemoryContext('pull', { closed: closedShoulder }), null, 'nothing left, no line at all');
  assert.equal(lastDebriefLine({ text: 'Sore shoulder today.', date: '2026-10-13', at: '2026-10-13T00:00:00Z' }, { closed: closedShoulder }), null);
});

test('What Works keeps the closing line and drops the old worry from the prompt, never from the page', () => {
  const page = [
    '- 2026-11-01 — He does not count his shoulder entries as an injury and will not see a physio.',
    '- 2026-09-01 — Left-side shoulder instability is no longer confined to Cable Lateral Raise.',
    '- 2026-09-02 — Cable Lateral Raise form breaks down on his left side.',
    '- 2026-11-20 — New shoulder pain on the left.',
  ].join('\n');
  const out = withoutClosed(page, closedShoulder);
  assert.match(out, /does not count his shoulder entries/);
  assert.doesNotMatch(out, /instability/);
  assert.match(out, /form breaks down/);
  assert.match(out, /New shoulder pain/);
});

test('the pain card stops raising a closed area, and raises new pain as ever', () => {
  const sessions = [{ date: '2026-10-13', exercises: [{ exerciseId: 'lat', name: 'Cable Lateral Raise', pain: 'Shoulder, mostly the middle of the left shoulder' }] }];
  const lib = [{ id: 'lat', name: 'Cable Lateral Raise' }];
  assert.equal(findNoteSignals(sessions, lib).length, 1, 'with nothing closed, it raises');
  assert.equal(findNoteSignals(sessions, lib, { closed: closedShoulder }).length, 0);
  const fresh = [{ date: '2026-11-09', exercises: [{ exerciseId: 'lat', name: 'Cable Lateral Raise', pain: 'Shoulder, sharp at the top' }] }];
  assert.equal(findNoteSignals(fresh, lib, { closed: closedShoulder }).length, 1);
});

test('the morning show never names a resolved entry as a concern (it read every entry before)', async () => {
  const deps = {
    recentDays: async () => [],
    foodToday: async () => ({ entries: [] }),
    records: async () => [],
    eventsForDay: async () => [],
    panel: async (vp, d) => ({ type: d.panel, data: {} }),
    injuries: async () => [SHOULDER_ENTRY],
    lastSessions: async () => [{ date: '2026-11-06', exercises: [{ name: 'Cable Lateral Raise', pain: 'Shoulder, left side' }] }],
  };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: new Date('2026-11-07T21:00:00Z') }, deps);
  assert.doesNotMatch(JSON.stringify(steps), /Shoulder \(|"name":"Shoulder"/);
  assert.doesNotMatch(JSON.stringify(steps), /Cable Lateral Raise/);
});

test('resolving several entries is one write and undoing reopens exactly those', async () => {
  _reset();
  const before = await listInjuries(vault);
  const a = await addInjury(vault, { area: 'Knee', note: 'a', severity: 'niggle' });
  const b = await addInjury(vault, { area: 'Knee', note: 'b', severity: 'niggle' });
  const closed = await resolveInjuries(vault, [a.id, b.id]);
  assert.deepEqual(closed.map((c) => c.id).sort(), [a.id, b.id].sort());
  assert.ok((await closedConcerns(vault)).some((c) => c.area === 'Knee'));
  await reopenInjuries(vault, [a.id, b.id]);
  const after = await listInjuries(vault);
  assert.equal(after.length, before.length + 2);
  assert.ok(after.filter((i) => i.area === 'Knee').every((i) => !i.resolvedAt));
});

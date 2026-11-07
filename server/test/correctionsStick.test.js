// CORRECTIONS STICK (second-brain audit #2, 7 Nov 2026). He closed the shoulder
// three times and the record never moved. These hold the three halves: a
// closed area reads as closed to every agent; his own words close it; the
// records are compared. Temp data and vault, set before any import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'nova-corrections-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
const vault = path.join(root, 'vault');
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
await mkdir(path.join(vault, 'Wiki', 'Health'), { recursive: true });

const {
  areaTerms, namesArea, closesArea, closedAreas, closedAsOf, isStaleConcern, scrubClosed,
  readClosure, hearClosure, closeFromCard, _resetPendingAsk, recordContradictions, contradictionBlock,
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

/* ------------------------------ his own words ----------------------------- */

// His three sentences, word for word from the conversation record.
const SAID_15_OCT = "My shoulder pain is okay at the moment, so ignore this and re-evaluate as needed. I like the single arm shoulder press so I’ll be keeping that";
const SAID_30_OCT = 'No, I have not gone to the physio. Ignore anything that is currently relating to my shoulder, as my shoulder is okay at the moment, so we can close that concern.';
const SAID_1_NOV = 'Like I’ve already said to you before we are going to ignore the shoulder injury point because it is not a shoulder injury and I’m not going to see a physio so ignore that for now and keep lateral razors in the program however they are best suited. Otherwise, I’m liking the idea of the plan overall so create a visual depiction of the plan that I can read and look at';

const SHOULDER = [{ id: 'a', area: 'Shoulder' }, { id: 'b', area: 'Shoulder' }];
const TWO = [...SHOULDER, { id: 'c', area: 'Lower back / hip (above glutes)' }];

test('his three sentences each close the shoulder, and none of them is the whole turn', () => {
  for (const said of [SAID_15_OCT, SAID_30_OCT, SAID_1_NOV]) {
    const r = readClosure(said, TWO);
    assert.equal(r.kind, 'close', said);
    assert.deepEqual(r.groups.map((g) => g.area), ['Shoulder'], 'only the area he named');
    assert.deepEqual(r.groups[0].ids, ['a', 'b'], 'both Shoulder entries');
  }
  assert.equal(readClosure(SAID_1_NOV, TWO).whole, false, 'the plan request still reaches the model');
  assert.equal(readClosure(SAID_15_OCT, TWO).whole, false);
});

test('the short ways he says it, alone, are the whole turn', () => {
  for (const said of ['my shoulder is fine', "My shoulder's okay.", 'ignore the shoulder', 'close the shoulder concern', 'it is not a shoulder injury']) {
    const r = readClosure(said, TWO);
    assert.equal(r.kind, 'close', said);
    assert.equal(r.whole, true, said);
  }
});

test('words with no area: the pain word speaks for one area, and asks across several', () => {
  const one = [{ id: 'c', area: 'Knee' }];
  assert.equal(readClosure("the pain's gone", one).kind, 'close');
  assert.equal(readClosure('close that concern', one).kind, 'close');
  const r = readClosure("the pain's gone", TWO);
  assert.equal(r.kind, 'ask', 'several areas: never a guess');
  assert.deepEqual(r.groups.map((g) => g.area), ['Shoulder', 'Lower back / hip (above glutes)']);
  assert.equal(readClosure('close that concern', TWO).kind, 'ask');
});

test('"that" is whatever was just said: the line before settles it, or leaves it alone', () => {
  const asked = { lastSaid: 'Have you seen the physio about your shoulder yet?' };
  const r = readClosure("ignore that, it's okay", TWO, asked);
  assert.equal(r.kind, 'close');
  assert.deepEqual(r.groups.map((g) => g.area), ['Shoulder']);
  assert.equal(readClosure("ignore that, it's okay", TWO).kind, 'none', 'with nothing before it, it could be about anything');
  assert.equal(readClosure("ignore that, it's okay", TWO, { lastSaid: 'Your calorie target looks low this week.' }).kind, 'none');
  assert.equal(readClosure('close that concern', TWO, { lastSaid: 'Your calorie target looks low this week.' }).kind, 'none');
  assert.equal(readClosure('close that concern', TWO, { lastSaid: 'Your shoulder and your hip both came up.' }).kind, 'ask');
});

test('what does not close a concern', () => {
  const said = [
    'is my shoulder okay to train?',
    'my shoulder is not fine',
    "my shoulder isn't okay",
    'my shoulder still hurts but the press is fine',
    'my shoulder is fine but it still pinches on the press',
    "don't ignore my shoulder",
    'if my shoulder is fine I will press',
    'ignore the shoulder press',
    'the shoulder press is fine',
    'my mate\'s shoulder is fine',
    'my shoulder is getting better',
    'that hip thrust is fine',
    'the plan is fine',
    "I'm fine",
    'okay',
  ];
  for (const s of said) assert.equal(readClosure(s, TWO).kind, 'none', s);
  assert.ok(!closesArea('my shoulder is fine, my knee is sore.', 'Knee'), 'one area closed is not another');
});

test('two areas one word fits are asked about; a side he names settles it', () => {
  const sides = [{ id: 'l', area: 'Left shoulder' }, { id: 'r', area: 'Right shoulder' }];
  assert.equal(readClosure('my shoulder is fine', sides).kind, 'ask');
  const left = readClosure('my left shoulder is fine', sides);
  assert.equal(left.kind, 'close');
  assert.deepEqual(left.groups.map((g) => g.area), ['Left shoulder']);
  const backs = [{ id: 'u', area: 'Upper back' }, { id: 'd', area: 'Lower back' }];
  assert.equal(readClosure('my back is fine', backs).kind, 'ask');
  assert.equal(readClosure('my lower back is fine', backs).groups[0].area, 'Lower back');
  const both = readClosure('my knee is fine and my shoulder is fine', [{ id: 'k', area: 'Knee' }, ...SHOULDER]);
  assert.equal(both.kind, 'close', 'two areas he named are two areas he closed');
  assert.equal(both.groups.length, 2);
});

const fresh = async () => {
  _reset();
  _resetPendingAsk();
  await rm(path.join(vault, 'Wiki', 'Health', 'Injury Log.md'), { force: true });
  _reset();
};
const recordFor = async (id) => (await import('../lib/inboxStore.js')).getRecord(id);

test('the door closes it on the rails: one line back, a receipt, an undo that reopens it', async () => {
  await fresh();
  const a = await addInjury(vault, { area: 'Shoulder', note: 'one', severity: 'niggle' });
  const b = await addInjury(vault, { area: 'Shoulder', note: 'two', severity: 'moderate' });
  const heard = await hearClosure(vault, 'my shoulder is fine');
  assert.equal(heard.whole, true);
  assert.equal(heard.said, "Closed Shoulder in your Injury Log. Say undo if that's wrong.");
  assert.ok((await listInjuries(vault)).every((i) => i.resolvedAt), 'both entries');
  const raw = await readFile(path.join(vault, 'Wiki/Health/Injury Log.md'), 'utf8');
  assert.match(raw, /## Active\n\n_none/);
  const record = await recordFor(heard.acted.recordId);
  assert.equal(record.kind, 'act');
  assert.equal(record.status, 'filed');
  const { undoRecord } = await import('../lib/inbox.js');
  await undoRecord(vault, record.id);
  assert.ok((await listInjuries(vault)).every((i) => !i.resolvedAt));
  assert.deepEqual((await listInjuries(vault)).map((i) => i.id), [a.id, b.id]);
});

test('inside a longer turn it still closes, and the model is told, not asked', async () => {
  await fresh();
  await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'moderate' });
  const heard = await hearClosure(vault, SAID_30_OCT);
  assert.ok(heard.acted);
  assert.ok((await listInjuries(vault)).every((i) => i.resolvedAt));
  const longer = await (async () => { await fresh(); await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'moderate' }); return hearClosure(vault, SAID_1_NOV); })();
  assert.equal(longer.whole, false);
  assert.match(longer.note, /^\[Code has just closed Shoulder/);
  assert.match(longer.note, /Do not ask about it again/);
  const { hisWordsOf } = await import('../lib/coach.js');
  assert.equal(hisWordsOf(`${longer.note}\n\n${SAID_1_NOV}`), SAID_1_NOV, 'his words stay his words');
});

test('several areas: the door asks, closes nothing, and his next word settles it', async () => {
  await fresh();
  await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'niggle' });
  await addInjury(vault, { area: 'Knee', note: 'y', severity: 'niggle' });
  const asked = await hearClosure(vault, "the pain's gone");
  assert.equal(asked.asked, true);
  assert.equal(asked.said, 'Which one do you want closed: Shoulder, or Knee?');
  assert.ok((await listInjuries(vault)).every((i) => !i.resolvedAt), 'nothing closed on a guess');
  const answered = await hearClosure(vault, 'the knee');
  assert.ok(answered.acted);
  const after = await listInjuries(vault);
  assert.ok(after.find((i) => i.area === 'Knee').resolvedAt);
  assert.ok(!after.find((i) => i.area === 'Shoulder').resolvedAt);
  await hearClosure(vault, "the pain's gone");
  assert.equal((await hearClosure(vault, 'neither')), null, 'one area left, and that word closes nothing');
});

test('an ordinary question costs the door nothing and changes nothing', async () => {
  await fresh();
  await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'niggle' });
  assert.equal(await hearClosure(vault, 'what should I eat for dinner tonight'), null);
  assert.equal(await hearClosure(vault, 'is the shoulder press better than a machine'), null);
  assert.ok((await listInjuries(vault)).every((i) => !i.resolvedAt));
});

test('the 1 Nov path: a learning that says an injury no longer counts closes the log, and undo reopens it', async () => {
  await fresh();
  await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'moderate' });
  await addInjury(vault, { area: 'Knee', note: 'y', severity: 'niggle' });
  const { fileDecision, undoFiling } = await import('../lib/inbox.js');
  const insight = 'He does not count his shoulder entries as an injury and will not see a physio. Keep lateral raises in his program wherever they fit best, and do not hold shoulder work back waiting on a physio assessment.';
  const out = await fileDecision(vault, { route: 'coach-learning', payload: { action: 'learn', insight, kind: 'decision' } });
  assert.match(out.destination, /What Works For Hayden/);
  assert.match(out.destination, /Injury Log — closed Shoulder/);
  const after = await listInjuries(vault);
  assert.ok(after.find((i) => i.area === 'Shoulder').resolvedAt);
  assert.ok(!after.find((i) => i.area === 'Knee').resolvedAt, 'the other area is untouched');
  const said = await undoFiling(vault, out.undo);
  assert.match(said, /reopened Shoulder/);
  assert.ok((await listInjuries(vault)).every((i) => !i.resolvedAt));
  assert.doesNotMatch(await readFile(path.join(vault, 'Wiki/Health/What Works For Hayden.md'), 'utf8'), /does not count his shoulder/);
});

test('a learning about something else leaves the log alone', async () => {
  await fresh();
  await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'moderate' });
  assert.equal(await closeFromCard(vault, ['He finishes on triceps when time is short.']), null);
  assert.ok((await listInjuries(vault)).every((i) => !i.resolvedAt));
});

test('the model reaches the same verb, and a name it cannot place is said back', async () => {
  await fresh();
  await addInjury(vault, { area: 'Shoulder', note: 'x', severity: 'moderate' });
  const { describeForModel, runVerb } = await import('../lib/verbs.js');
  assert.match(describeForModel(), /"verb":"injury\.close"/);
  await assert.rejects(() => runVerb(vault, 'the knee', { verb: 'injury.close', args: { area: 'knee' } }), /no open entry for "knee"/);
  const out = await runVerb(vault, 'his shoulder', { verb: 'injury.close', args: { area: 'shoulder' } });
  assert.match(out.acted.said, /Closed Shoulder/);
});

/* ------------------------- do the records agree? ------------------------- */

const HIP = { id: 'h', area: 'Lower back / hip (above glutes)', note: 'Dull ache', severity: 'niggle', startedAt: '2026-10-15' };
const ACTIVE_SHOULDER = { id: 's', area: 'Shoulder', note: 'Lateral raises paused pending a physio assessment.', severity: 'moderate', startedAt: '2026-10-13' };

test('Profile against the log: the disagreement the audit found, in the words on his pages', () => {
  const profile = 'Goal muscles: side and rear delts. No injuries or limitations at the moment. Logs every set in Nova.';
  const [line, ...rest] = recordContradictions({ profile, injuries: [HIP], now: NOW });
  assert.equal(rest.length, 0);
  assert.match(line, /Profile says "No injuries or limitations at the moment\."/);
  assert.match(line, /Lower back \/ hip \(above glutes\) \(since 2026-10-15\) as active/);
  assert.deepEqual(recordContradictions({ profile, injuries: [SHOULDER_ENTRY], now: NOW }), [], 'nothing active, nothing to disagree with');
});

test('his three sentences, as a What Works line against an active entry, each read as a contradiction', () => {
  for (const said of [SAID_15_OCT, SAID_30_OCT, SAID_1_NOV]) {
    const whatWorks = `## Decisions log\n- 2026-11-01 — ${said}\n`;
    const lines = recordContradictions({ injuries: [ACTIVE_SHOULDER], whatWorks, now: NOW });
    assert.equal(lines.length, 1, said);
    assert.match(lines[0], /^What Works \(2026-11-01\) says/);
    assert.match(lines[0], /still holds Shoulder as active/);
  }
});

test('a closing line older than the entry is history, not a contradiction: the pain came back after it', () => {
  const whatWorks = '- 2026-09-01 — His shoulder is fine.\n';
  assert.deepEqual(recordContradictions({ injuries: [ACTIVE_SHOULDER], whatWorks, now: NOW }), []);
});

test('a Profile or What Works line that still worries about a closed area is named', () => {
  const closedProfile = recordContradictions({ profile: 'He has shoulder pain on overhead work.', injuries: [SHOULDER_ENTRY], now: NOW });
  assert.equal(closedProfile.length, 1);
  assert.match(closedProfile[0], /he closed that area/);
  const later = recordContradictions({ injuries: [SHOULDER_ENTRY], whatWorks: '- 2026-11-07 — Fine.\n- 2026-11-08 — His shoulder pain limits raises.\n', now: NOW });
  assert.equal(later.length, 1);
  assert.match(later[0], /written after he closed/);
});

test('when the three pages agree, nothing is raised', () => {
  const lines = recordContradictions({ profile: 'Trains four days a week.', injuries: [SHOULDER_ENTRY, HIP], whatWorks: '- 2026-11-01 — He does not count his shoulder entries as an injury.\n', now: NOW });
  assert.deepEqual(lines, []);
  assert.equal(contradictionBlock([]), null);
});

test('a contradiction reaches the block Coach reads, as something to put to him', async () => {
  await fresh();
  await addInjury(vault, { area: 'Lower back / hip', note: 'Dull ache', severity: 'niggle' });
  await writeFile(path.join(vault, 'Wiki/Profile.md'), '# Profile\n\nNo injuries or limitations at the moment.\n', 'utf8');
  const ctx = await injuriesContext(vault);
  assert.match(ctx, /RECORDS THAT DISAGREE/);
  assert.match(ctx, /Ask which is true/);
  assert.match(ctx, /Profile says "No injuries or limitations at the moment\."/);
  await rm(path.join(vault, 'Wiki/Profile.md'));
  assert.doesNotMatch(await injuriesContext(vault), /RECORDS THAT DISAGREE/, 'a page that is gone claims nothing');
});

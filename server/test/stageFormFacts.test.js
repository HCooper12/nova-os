// THE STAGE'S PANEL FORMS (mockup 114): each form only from the card's own
// data; the scope and the claim title derived by code, never invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageForm, cardDrawable, proposalCard, sparkPath } from '../../src/stageFormFacts.js';

test('a card that cannot be drawn is no panel: a note without lines is not an empty frame', () => {
  assert.equal(cardDrawable({ kind: 'note', label: 'NOT IN THE PAGES', text: 'words in the wrong field' }), false);
  assert.equal(cardDrawable({ kind: 'note', lines: ['None of the six records your tempo.'] }), true);
  assert.equal(cardDrawable({ kind: 'mystery' }), false);
  assert.equal(cardDrawable({ macKind: 'sets' }), true);
  assert.equal(cardDrawable({ kind: 'list', items: [] }), false);
});

test('a metric "4 of 7" is a ring with its scope; a plain number is a figure, and a series only when it is there', () => {
  const r = stageForm({ kind: 'metric', label: 'STEPS', value: '4', unit: 'of 7', caption: 'DAYS ON TARGET' });
  assert.equal(r.form, 'ring');
  assert.equal(r.pct, 57);
  assert.equal(r.meta, '7 days');
  assert.equal(r.small, 'days on target');
  const f = stageForm({ kind: 'metric', label: 'WEIGHT', value: '82.4', unit: 'kg' });
  assert.equal(f.form, 'fig');
  assert.equal(f.spark, null, 'no series, no sparkline');
  assert.equal(f.meta, '');
  const s = stageForm({ kind: 'metric', value: '82.4', unit: 'kg', series: [{ date: '2026-11-01', value: 82.1 }, { date: '2026-11-02', value: 82.6 }, { date: '2026-11-03', value: 82.4 }] });
  assert.ok(s.spark?.d.startsWith('M'));
  assert.equal(s.meta, '3 days');
  assert.equal(stageForm({ kind: 'metric', value: 'twelve' }).form, null, 'not a number: the plain form');
});

test('protein bars: gold, a dashed target only where the card states one, and the title counts the days under it', () => {
  const bars = [150, 98, 160, 166, 104, 146, 158].map((value, i) => ({ name: 'MTWTFSS'[i], value, pct: Math.round((value / 166) * 100) }));
  const b = stageForm({ kind: 'bars', label: 'Protein vs your 140g floor', bars });
  assert.equal(b.form, 'bars');
  assert.equal(b.hue, 'var(--nv-gold)');
  assert.ok(Math.abs(b.target - (140 / 166) * 100) < 1);
  assert.equal(b.title, 'Under the line twice');
  assert.equal(b.meta, 'this week');
  assert.equal(b.legend, 'dashed line is the daily target');
  const plain = stageForm({ kind: 'bars', label: 'Protein this week', bars, foot: '5 of 7 days cleared it' });
  assert.equal(plain.target, null, 'no target stated: no line drawn');
  assert.equal(plain.title, '', 'and no claim');
  assert.equal(plain.foot, '5 of 7 days cleared it');
  assert.equal(stageForm({ kind: 'bars', bars: [{ name: 'W1', value: 7, pct: 88 }, { name: 'Now', value: 6, pct: 75 }] }).meta, '2 weeks');
});

test('lists take the form their rows carry: times, weekdays, sets x reps, agents, sources, plain lines', () => {
  const day = stageForm({ kind: 'list', label: 'YOUR DAY', items: [{ name: 'Stand-up', note: '9:30' }, { name: 'One to one', note: '13:00' }, { name: 'Pull day', note: '18:00' }] }, { now: 10 * 60 });
  assert.equal(day.form, 'timeline');
  assert.deepEqual(day.items.map((x) => x.now), [false, true, false], 'the next point after now is marked');
  assert.equal(day.meta, '3 fixed', 'a calendar timed events are its fixed points');
  const week = stageForm({ kind: 'list', label: 'THIS WEEK', items: [{ name: 'Monday', note: 'Push' }, { name: 'Wednesday', note: 'Pull' }, { name: 'Saturday', note: 'Free' }] });
  assert.equal(week.form, 'week');
  assert.equal(week.days.length, 7);
  assert.equal(week.title, 'Saturday is free');
  const train = stageForm({ kind: 'list', label: 'TODAY · PULL', items: [{ name: 'Lat pulldown', note: '4 × 8' }, { name: 'Row', note: '4 × 10' }] });
  assert.equal(train.form, 'rows');
  assert.equal(train.title, 'Pull day, lat pulldown first');
  assert.equal(stageForm({ kind: 'list', label: 'LIFTS', items: [{ name: 'Row', note: '4 × 10' }] }).title, '', 'no session named: no title');
  const drafts = stageForm({ kind: 'list', label: 'OVERNIGHT', items: [{ name: 'A brief', note: 'Researcher' }, { name: 'Three notes merged', note: 'Librarian' }] });
  assert.equal(drafts.form, 'agents');
  assert.equal(drafts.items[0].hue, 'var(--nv-m-quads)');
  const src = stageForm({ kind: 'list', label: 'SOURCES', items: [{ name: 'A', note: 'vault' }, { name: 'B', note: 'page' }] });
  assert.equal(src.form, 'sources');
  assert.equal(src.meta, '2');
  assert.equal(stageForm({ kind: 'list', label: 'KEEP IN MIND', items: [{ name: 'One' }, { name: 'Two' }] }).form, 'dots');
  assert.equal(stageForm({ kind: 'list', items: [{ name: 'Mixed', note: '9:30' }, { name: 'Other', note: 'later' }] }).form, null, 'mixed rows: the plain form');
});

test('a video carries its timecode only when a real start time exists; the scope never says whose it is', () => {
  const v = stageForm({ kind: 'video', title: 'Elbows lead', channel: 'video.example', startS: 192 });
  assert.equal(v.start, '3:12');
  assert.equal(v.meta, 'from 3:12');
  const n = stageForm({ kind: 'video', title: 'No start', channel: 'video.example' });
  assert.equal(n.start, '');
  assert.equal(n.meta, '');
  for (const c of [{ kind: 'quote', text: 'x' }, { kind: 'page', title: 'p', host: 'h' }, { kind: 'note', lines: ['l'] }]) assert.equal(stageForm(c).meta, '');
});

test('a proposal panel reads its body line and proposer from its record, and is nothing without a proposal', () => {
  assert.equal(proposalCard(null), null);
  const p = proposalCard({ recordId: 'r1', title: 'Add 4 sets', status: 'pending' }, { agent: 'coach', decision: { why: 'Takes the week from six hard sets to ten.' } });
  assert.deepEqual([p.key, p.body, p.who], ['proposal:r1', 'Takes the week from six hard sets to ten.', 'coach']);
  assert.equal(proposalCard({ recordId: 'r2', title: 'X' }).body, '', 'no record: no body, never a made-up one');
  const f = stageForm(p);
  assert.deepEqual([f.form, f.hue, f.meta], ['proposal', 'var(--nv-good)', 'coach']);
  assert.equal(sparkPath([1, 2]), null);
});

test('the briefing calendar rows ("9:30 am", "5:30 pm · passed", "all day") make the timeline, fixed points counted', () => {
  const f = stageForm({ kind: 'list', label: 'TODAY · 3 ON THE CALENDAR', items: [{ name: 'Gym', note: 'all day' }, { name: 'Stand-up', note: '9:30 am · passed' }, { name: 'Pull day', note: '6:00 pm' }] }, { now: 12 * 60 });
  assert.equal(f.form, 'timeline');
  assert.equal(f.meta, '2 fixed', 'the all-day note is not a fixed point');
  assert.deepEqual(f.items.map((x) => [x.time, x.past, x.now]), [['all day', false, false], ['09:30', true, false], ['18:00', false, true]]);
  assert.equal(stageForm({ kind: 'list', label: 'NOTES', items: [{ name: 'a', note: 'all day' }] }).form, null, 'no timed row: not a timeline');
});

test('overnight drafts that are Inbox records carry their ids and count as drafts; rows without one are only named', () => {
  const f = stageForm({ kind: 'list', label: 'THE FLEET, OVERNIGHT', items: [{ name: 'Sleep debt', note: 'research', id: 'r1' }, { name: 'Merged notes', note: 'distill', id: 'r2' }] });
  assert.equal(f.form, 'agents');
  assert.equal(f.meta, '2 drafts');
  assert.deepEqual(f.items.map((x) => [x.id, x.who]), [['r1', 'Researcher'], ['r2', 'Distill']]);
  assert.equal(f.items[0].hue, 'var(--nv-m-quads)');
  const named = stageForm({ kind: 'list', items: [{ name: 'X', note: 'Librarian' }] });
  assert.equal(named.items[0].id, null, 'no record id: no buttons');
  assert.equal(named.meta, '1');
});

test('hue by subject when a card has no tone: caution is warn, what is not known is warn, the week is green, a tone always wins', async () => {
  const { stageHue } = await import('../../src/wallFacts.js');
  assert.equal(stageHue({ kind: 'list', label: 'WORTH KEEPING IN MIND', items: [{ name: 'a' }] }), 'var(--nv-warn)');
  assert.equal(stageHue({ kind: 'note', label: 'NOT IN THE PAGES', lines: ['x'] }), 'var(--nv-warn)');
  assert.equal(stageHue({ kind: 'list', label: 'THIS WEEK', items: [{ name: 'Saturday', note: 'Free' }] }), 'var(--nv-good)');
  assert.equal(stageHue({ kind: 'proposal', title: 'x' }), 'var(--nv-good)');
  assert.equal(stageHue({ kind: 'list', label: 'WORTH KEEPING IN MIND', tone: 'cy', items: [{ name: 'a' }] }), 'var(--nv-cy)');
  assert.equal(stageHue({ kind: 'list', label: 'ERRANDS', items: [{ name: 'a' }] }), 'var(--nv-nova)');
});

test('a talk with a proven moment takes the video form with its chip; the bars use the target the card states', () => {
  const m = stageForm({ kind: 'media', title: 'On sleep', channel: 'A podcast', stamp: '41:10', src: 'x.jpg' });
  assert.deepEqual([m.form, m.start, m.meta], ['video', '41:10', 'from 41:10']);
  assert.equal(stageForm({ kind: 'media', title: 'No moment' }).form, null);
  const b = stageForm({ kind: 'bars', label: 'Protein this week', target: 140, targetPct: 84.3, bars: [{ name: 'M', value: 150, pct: 90 }, { name: 'T', value: 98, pct: 59 }] });
  assert.equal(b.target, 84.3);
  assert.equal(b.title, 'Under the line once');
});

// the instruments as server/lib/instruments.js builds them (round four)
const W = (steps) => ({ kind: 'instrument', instrument: 'week', data: { ok: true, floor: 8000, total: steps.reduce((a, b) => a + (b || 0), 0), series: steps.map((s, i) => ({ date: `2026-11-0${i + 4}`, label: 'MTWTFSS'[i], steps: s, today: i === 6 })) } });

test('the briefing instruments take the mockup forms from their own data, never the 3D figure', async () => {
  const { instrumentForm } = await import('../../src/stageFormFacts.js');
  const week = instrumentForm(W([9000, 4000, 8100, null, 12000, 7000, 2000]));
  assert.deepEqual([week.form, week.tag, week.value, week.of, week.small, week.meta], ['ring', 'Steps', '3', 7, 'days on target', '7 days']);
  const vit = instrumentForm({ kind: 'instrument', instrument: 'vitals', data: { ok: true, hrv: 70.7, restingHr: 56, delta: 8, verdict: 'recovered', band: { lo: 55, hi: 68, avg: 65, n: 7 }, date: '2026-11-10', stale: false } });
  assert.deepEqual([vit.form, vit.tag, vit.value, vit.unit, vit.title, vit.meta], ['fig', 'HRV', '70.7', 'ms', '8% above your usual', 'vs 7 days']);
  assert.equal(vit.small, 'resting heart 56 bpm');
  const fuel = instrumentForm({ kind: 'instrument', instrument: 'fuel', data: { ok: true, planned: 233, eaten: 5, floor: 167, pace: 56, behind: 51 } });
  assert.deepEqual([fuel.form, fuel.tag, fuel.value, fuel.of, fuel.unit, fuel.title, fuel.hue], ['ring', 'Protein', '5', 167, 'g', 'Behind pace by 51 g', 'var(--nv-gold)']);
  assert.equal(fuel.small, '51 g behind pace · 233 g planned');
  const body = instrumentForm({ kind: 'instrument', instrument: 'body', data: { ok: true, session: 'Pull A', exercises: 2, lifts: [{ name: 'Lat Pulldown', sets: 4, repsLow: 8, repsHigh: 10, muscle: 'Lats' }, { name: 'Face Pull', sets: 3, repsLow: 15, repsHigh: 15, muscle: 'Rear Delts' }] } });
  assert.deepEqual([body.form, body.tag, body.title, body.meta], ['rows', 'Train', 'Pull A, lat pulldown first', '2 lifts']);
  assert.deepEqual(body.items.map((x) => [x.note, x.hue]), [['4 × 8-10', 'var(--nv-m-back)'], ['3 × 15', 'var(--nv-m-rear-delts)']]);
  const day = instrumentForm({ kind: 'instrument', instrument: 'day', data: { ok: true, now: 10.5, blocks: [{ t: 9.5, len: 0.5, label: 'Stand-up' }, { t: 13, len: 1, label: 'One to one' }] } });
  assert.deepEqual([day.form, day.tag, day.meta], ['timeline', 'Your day', '2 fixed']);
  assert.deepEqual(day.items.map((x) => [x.time, x.past, x.now]), [['09:30', true, false], ['13:00', false, true]]);
  // what an instrument cannot carry is no panel on the stage (no 3D fallback)
  assert.equal(cardDrawable({ kind: 'instrument', instrument: 'body', data: { ok: true, session: null } }), false);
  assert.equal(cardDrawable({ kind: 'instrument', instrument: 'fuel', data: { ok: true, eaten: 5, floor: null } }), false);
  assert.equal(cardDrawable(W([1, 2])), true);
});

test('eyebrow tags are the short subject; the detail moves to the scope or the claim title', async () => {
  const { stageTag } = await import('../../src/stageFormFacts.js');
  assert.deepEqual(stageTag('COACH · A CHANGE WORTH MAKING'), { tag: 'COACH', scope: '', title: 'A change worth making' });
  assert.deepEqual(stageTag('COACH · ASKED 3×'), { tag: 'COACH', scope: 'asked 3×', title: '' });
  assert.deepEqual(stageTag('PROGRAM AUDIT · WEEK OF 2026-11-09', { today: '2026-11-10' }), { tag: 'PROGRAM AUDIT', scope: 'this week', title: '' });
  assert.equal(stageTag('PROGRAM AUDIT · WEEK OF 2026-11-02', { today: '2026-11-10' }).scope, 'week of 2 nov');
  assert.deepEqual(stageTag('TODAY’S TECHNIQUE · DAY TWO'), { tag: 'Technique', scope: 'day two', title: '' });
  assert.equal(stageTag('THE FLEET, OVERNIGHT').tag, 'Overnight');
  assert.equal(stageTag('WAITING ON YOU').tag, 'Needs your word');
  assert.equal(stageTag('WORTH KEEPING IN MIND').tag, 'Keep in mind');
  assert.deepEqual(stageTag('TODAY · 3 ON THE CALENDAR'), { tag: 'Your day', scope: '', title: '' });
});

test('one thing said is one panel; a row cut mid-word breaks at a word; audit bars wear their own tones', async () => {
  const { cardLineKey, wordCut } = await import('../../src/stageFormFacts.js');
  const a = { kind: 'list', label: 'COACH · A CHANGE WORTH MAKING', items: [{ name: 'You have flagged your own form on Cable Hammer', note: 'NEW' }] };
  const b = { kind: 'list', label: 'COACH', items: [{ name: 'You have flagged your own form on Cable Hammer Curls 3 times' }] };
  assert.equal(cardLineKey(a), cardLineKey(b));
  assert.notEqual(cardLineKey(a), cardLineKey({ kind: 'list', items: [{ name: 'Three notes merged into one' }] }));
  assert.equal(cardLineKey({ kind: 'metric', value: '12' }), '', 'a bare number is never matched by its text');
  assert.equal(wordCut('Research: As of November 2026, what are the ne'), 'Research: As of November 2026, what are the…');
  assert.equal(wordCut('Short and whole'), 'Short and whole');
  const audit = stageForm({ kind: 'bars', label: 'PROGRAM AUDIT · WEEK OF 2026-11-09', bars: [{ name: 'Decide', value: 1, tone: 'warn', pct: 20 }, { name: 'Clean', value: 5, tone: 'good', pct: 100 }, { name: 'Not yet', value: 1, tone: 'cy', pct: 20 }] });
  assert.deepEqual(audit.rows.map((r) => r.hue), ['var(--nv-warn)', 'var(--nv-good)', 'var(--nv-cy)']);
});

test('the body instrument lists the session lifts as his program states them, nothing guessed', async () => {
  const { liftsOf } = await import('../lib/instruments.js');
  const lifts = liftsOf({ exercises: [{ name: 'Lat Pulldown', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 10, muscleGroup: 'Lats' }, { name: '(deleted exercise)', targetSets: 3 }, { name: 'Curl', targetSets: 0, muscleGroup: 'Biceps' }] });
  assert.deepEqual(lifts, [{ name: 'Lat Pulldown', sets: 4, repsLow: 8, repsHigh: 10, muscle: 'Lats' }, { name: 'Curl', sets: null, repsLow: null, repsHigh: null, muscle: 'Biceps' }]);
});

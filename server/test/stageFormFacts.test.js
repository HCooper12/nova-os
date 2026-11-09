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

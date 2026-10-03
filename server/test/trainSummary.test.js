// THE SUMMARY TRAIN PAGE (redesign variation A, 27 Sep 2026): the pure facts
// the page draws (src/trainSummaryFacts.js), the one behaviour that must not
// regress — a ✕ on a Coach card asks why and files the reason, never the
// bare discard — and the source contracts no screenshot would catch.
process.env.TZ = 'Australia/Sydney';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { weekDots, trainedDays, coachWaiting, hardSetsRing, declineReason, weekdayOf, verdictRest } = await import('../../src/trainSummaryFacts.js');
const { valsTrainSummary } = await import('../../src/vals/valsTrainSummary.js');
const { COACH_DECLINE_REASONS } = await import('../../src/vals/valsInbox.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// Mon Push ✓ · Tue Full body ✓ · Wed Pull (today) · Thu Legs · Fri rest · Sat Push · Sun rest
const SCHEDULE = { monday: 'Push day', tuesday: 'Full body', wednesday: 'Pull day', thursday: 'Legs', friday: null, saturday: 'Push day', sunday: '' };
const WED = new Date(2026, 8, 23, 9, 0); // Wednesday 23 Sep 2026

test('weekDots: done, today, planned and rest, Monday first, and the line says what comes next', () => {
  const { dots, line } = weekDots(SCHEDULE, ['monday', 'tuesday'], WED);
  assert.deepEqual(dots.map((d) => d.state), ['done', 'done', 'today', 'planned', 'rest', 'planned', 'rest']);
  assert.deepEqual(dots.map((d) => d.letter).join(''), 'MTWTFSS');
  assert.equal(dots[2].isToday, true);
  assert.equal(dots[2].routine, 'Pull day');
  assert.equal(line, 'Legs Thursday, then rest');
});

test('weekDots: a session day gone by with nothing logged is missed, not still planned', () => {
  const thu = new Date(2026, 8, 24, 9, 0);
  const { dots } = weekDots(SCHEDULE, ['monday'], thu);
  assert.equal(dots[1].state, 'missed');   // Tuesday: Full body, nothing logged
  assert.equal(dots[2].state, 'missed');   // Wednesday
  assert.equal(dots[3].state, 'today');
  assert.equal(dots[4].state, 'rest');     // Friday rest stays rest
});

test('weekDots: logged work on a day still ahead is ignored; today done shows done; dates and names both read', () => {
  const { dots } = weekDots(SCHEDULE, ['2026-09-23', 'saturday'], WED);
  assert.equal(dots[2].state, 'done');
  assert.equal(dots[2].isToday, true);
  assert.equal(dots[5].state, 'planned', 'Saturday is ahead of Wednesday: it cannot be done yet');
  assert.equal(weekdayOf('2026-09-27'), 'sunday');
  assert.equal(weekdayOf(new Date(2026, 8, 28)), 'monday');
  assert.equal(weekdayOf('nonsense'), null);
});

test('weekDots: the line names the next session and what follows it, or says there is none', () => {
  const back = { ...SCHEDULE, friday: 'Push day' };
  assert.equal(weekDots(back, [], WED).line, 'Legs Thursday, then Push day Friday');
  assert.equal(weekDots({ monday: 'Push day' }, [], WED).line, 'Rest for the rest of the week');
  assert.equal(weekDots(SCHEDULE, [], new Date(2026, 8, 27, 9)).line, 'The week ends today');
  // a trained rest day is a done day with no routine
  const { dots } = weekDots(SCHEDULE, ['friday'], new Date(2026, 8, 26, 9));
  assert.equal(dots[4].state, 'done');
  assert.equal(dots[4].routine, null);
});

test('trainedDays: every weekday a slot or an off-plan lift was done on; today only once a session is filed', () => {
  const week = { muscles: [
    { exercises: [{ doneOn: ['monday'] }, { doneOn: ['wednesday'] }], extras: [{ doneOn: ['tuesday'] }] },
    { exercises: [{ doneOn: [] }], extras: [] },
  ] };
  // Wednesday's sets are the draft of a session in progress — not a done day
  assert.deepEqual(trainedDays(week, null, WED), ['monday', 'tuesday']);
  assert.deepEqual(trainedDays(week, { sessions: [{ name: 'Pull day' }] }, WED), ['monday', 'tuesday', 'wednesday']);
  assert.deepEqual(trainedDays(null, null, WED), []);
});

test('coachWaiting: a card being answered or folding away is not waiting', () => {
  const cards = [
    { id: 'a', headline: 'Add a fourth set of curls', state: 'working' },
    { id: 'b', headline: 'Swap the row', state: 'open' },
    { id: 'c', headline: 'Drop the fly', state: 'leaving' },
    { id: 'd', headline: 'Move legs', state: 'discussing' },
  ];
  assert.deepEqual(coachWaiting(cards), { count: 2, headline: 'Swap the row' });
  assert.deepEqual(coachWaiting([]), { count: 0, headline: null });
});

test('hardSetsRing: one ring, a segment per muscle in its own hue, filled no further than its share', () => {
  const vol = [
    { muscle: 'Back', sets: 3, target: 14, goalMuscle: true },
    { muscle: 'Chest', sets: 18, target: 10, goalMuscle: false },
    { muscle: 'Biceps', sets: 2, target: 12, goalMuscle: true },
  ];
  const r = hardSetsRing(vol);
  assert.equal(r.done, 23);
  assert.equal(r.target, 36);
  // Chest's 18 of 10 counts as 10 towards the ring: (3 + 10 + 2) / 36
  assert.equal(r.pct, Math.round((15 / 36) * 100));
  assert.equal(r.segments[0].hue, 'var(--nv-m-back)');
  assert.equal(r.segments[1].fill, 1);
  assert.ok(Math.abs(r.segments.reduce((n, s) => n + s.share, 0) - 1) < 1e-9);
  assert.deepEqual(r.short, ['Back', 'Biceps']);
  // with the planned week, short means short by Sunday on the plan as written
  assert.deepEqual(hardSetsRing(vol, { shortMuscles: ['Biceps'] }).short, ['Biceps']);
  assert.equal(hardSetsRing([]), null);
  assert.equal(hardSetsRing([{ muscle: 'Back', sets: 2, target: 0 }]), null);
});

test('declineReason: the chip, his line, or both; nothing is not a reason', () => {
  assert.equal(declineReason('Not now', ''), 'Not now');
  assert.equal(declineReason('', '  my shoulder  '), 'my shoulder');
  assert.equal(declineReason('Too aggressive', 'my shoulder'), 'Too aggressive: my shoulder');
  assert.equal(declineReason(null, '   '), undefined);
});

// ---- the ✕ asks why, and the reason rides the record ------------------------

function fakeApp(state) {
  const calls = [];
  const app = {
    state: { novaStyle: 'summary', screen: 'workouts', workoutsView: 'routines', liveWorkoutRoutines: [], ...state },
    setState(p) { calls.push(['setState', p]); this.state = { ...this.state, ...(typeof p === 'function' ? p(this.state) : p) }; },
    inboxAction: (...a) => calls.push(['inboxAction', ...a]),
    answerCoachSuggestion: (...a) => calls.push(['answerCoachSuggestion', ...a]),
    reopenCoachSuggestion: (...a) => calls.push(['reopenCoachSuggestion', ...a]),
    openTrainCoach: () => calls.push(['openTrainCoach']),
    closeTrainCoach: () => calls.push(['closeTrainCoach']),
    trainCoachEntry: () => calls.push(['trainCoachEntry']),
    doCoach: (...a) => calls.push(['doCoach', ...a]),
    openContextMenu: () => {},
  };
  return { app, calls };
}
const CARD = { id: 'rec-1', headline: 'Add a fourth set of Barbell Curl', state: 'open', yes: () => {}, no: () => { throw new Error('the bare ✕ ran'); }, discuss: () => {} };
const baseV = (over = {}) => ({
  usingLiveWorkouts: true, weekStrip: [], routinesList: [], carryovers: [], trainToday: { actions: {} },
  coachDeck: { cards: [CARD], waiting: 1, where: 'Pull day', rail: ['wait'], canAll: false },
  workoutCardLabel: 'Pull day', workoutCardMeta: '6 exercises', workoutCardK: 'TRAIN · TODAY', ringVitals: [],
  ...over,
});
const CTX = { demoMode: false, go: () => () => {} };

test('null off summary, in demo mode, before routines load, and while the live session is open', () => {
  assert.equal(valsTrainSummary(fakeApp({ novaStyle: 'cupertino' }).app, CTX, baseV()).trainSummary, null);
  assert.equal(valsTrainSummary(fakeApp({}).app, { ...CTX, demoMode: true }, baseV()).trainSummary, null);
  assert.equal(valsTrainSummary(fakeApp({}).app, CTX, baseV({ usingLiveWorkouts: false })).trainSummary, null);
  assert.equal(valsTrainSummary(fakeApp({ workoutsView: 'session' }).app, CTX, baseV()).trainSummary, null);
  assert.ok(valsTrainSummary(fakeApp({}).app, CTX, baseV()).trainSummary);
});

test('the Coach row counts what waits, and the sheet is open exactly when trainTab is coach', () => {
  const T = valsTrainSummary(fakeApp({}).app, CTX, baseV()).trainSummary;
  assert.equal(T.coach.count, 1);
  assert.equal(T.coach.headline, CARD.headline);
  assert.equal(T.coachSheet.open, false);
  assert.equal(valsTrainSummary(fakeApp({ trainTab: 'coach' }).app, CTX, baseV()).trainSummary.coachSheet.open, true);
});

test('✕ opens the ask-why; Pass on it files the reason through the Inbox discard-with-reason path, then offers Undo', () => {
  const { app, calls } = fakeApp({ trainTab: 'coach' });
  let T = valsTrainSummary(app, CTX, baseV()).trainSummary;
  T.coachSheet.deck.cards[0].no();
  assert.equal(app.state.trainSumAskWhy, 'rec-1', 'the ✕ asks why instead of discarding');
  assert.ok(!calls.some(([k]) => k === 'inboxAction' || k === 'answerCoachSuggestion'), 'nothing was filed on the ✕ itself');

  T = valsTrainSummary(app, CTX, baseV()).trainSummary;
  const a = T.coachSheet.declineAsking;
  assert.deepEqual(a.reasons, COACH_DECLINE_REASONS, 'the Inbox\'s own reasons, one list');
  a.pick('Too aggressive');
  T = valsTrainSummary(app, CTX, baseV()).trainSummary;
  T.coachSheet.declineAsking.setText('my elbow is grumpy');
  T = valsTrainSummary(app, CTX, baseV()).trainSummary;
  T.coachSheet.declineAsking.confirm();
  assert.deepEqual(calls.find(([k]) => k === 'inboxAction'), ['inboxAction', 'rec-1', 'discard', 'Too aggressive: my elbow is grumpy']);
  assert.ok(!calls.some(([k]) => k === 'answerCoachSuggestion'), 'never the bare discard');
  assert.equal(app.state.trainSumAskWhy, null);

  T = valsTrainSummary(app, CTX, baseV()).trainSummary;
  assert.equal(T.coachSheet.receipt.reason, 'Too aggressive: my elbow is grumpy');
  T.coachSheet.receipt.undo();
  assert.deepEqual(calls.at(-1), ['reopenCoachSuggestion', 'rec-1']);
});

test('Keep it closes the question and files nothing; a stale card is cleared with that as its reason, unasked', () => {
  const { app, calls } = fakeApp({ trainTab: 'coach', trainSumAskWhy: 'rec-1' });
  valsTrainSummary(app, CTX, baseV()).trainSummary.coachSheet.declineAsking.keep();
  assert.equal(app.state.trainSumAskWhy, null);
  assert.ok(!calls.some(([k]) => k === 'inboxAction'));
  const stale = { ...CARD, id: 'rec-2', stale: 'Barbell Curl is already 4 sets' };
  const T = valsTrainSummary(app, CTX, baseV({ coachDeck: { cards: [stale], waiting: 1, where: '' } })).trainSummary;
  T.coachSheet.deck.cards[0].no();
  assert.deepEqual(calls.at(-1), ['inboxAction', 'rec-2', 'discard', 'Already changed: Barbell Curl is already 4 sets']);
});

test('a card the discard-with-reason is carrying away folds on the Inbox\'s leave beat', () => {
  const { app } = fakeApp({ trainTab: 'coach', inboxLeaving: { 'rec-1': 'discard' } });
  const T = valsTrainSummary(app, CTX, baseV()).trainSummary;
  assert.equal(T.coachSheet.deck.cards[0].state, 'leaving');
  assert.equal(T.coach.count, 0);
});

// ---- source contracts -------------------------------------------------------

test('Workouts.jsx takes the summary branch as its first line; the rest is the classic screen', () => {
  const src = read('src/screens/Workouts.jsx');
  assert.match(src, /export function Workouts\(\{ v \}\) \{\s*(?:\/\/[^\n]*\n\s*)*if \(v\.summary && v\.trainSummary\) return <TrainSummary v=\{v\} parts=\{TRAIN_PARTS\} \/>;/);
  // the classic Segmented is still there for cupertino and command
  assert.match(src, /<Segmented stretch ariaLabel="Train"/);
  // the summary page never imports the classic screen back
  assert.doesNotMatch(read('src/screens/TrainSummary.jsx'), /from '\.\/Workouts\.jsx'/);
});

test('no type on the Train page or its sheets is below 12px', () => {
  const small = [];
  const src = read('src/screens/TrainSummary.jsx');
  for (const m of src.matchAll(/font: [`'"]([^`'"]*)[`'"]/g)) {
    const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
    if (px && Number(px[1]) < 12) small.push(`TrainSummary.jsx: ${m[1]}`);
  }
  const css = read('src/index.css');
  const start = css.indexOf('THE SUMMARY TRAIN PAGE (27 Sep 2026)');
  const end = css.indexOf('/* shared panes for the new components */');
  assert.ok(start > 0 && end > start, 'the .nv-ts-* block was not found where the summary floor reads');
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  let seen = 0;
  for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (!px) continue;
      seen++;
      if (Number(px[1]) < 12) small.push(`index.css ${rule[1].trim()}: ${px[1]}px`);
    }
  }
  assert.ok(seen > 30, `expected to read the page's type, found ${seen}`);
  assert.deepEqual(small, [], `below the floor:\n  ${small.join('\n  ')}`);
});

test('both sheets are aria-modal roots with their z-index inline, closed by their own backdrop', () => {
  // edgeBack.js picks the topmost [aria-modal="true"] by its INLINE z-index
  // and closes it by clicking it
  const src = read('src/screens/TrainSummary.jsx');
  const roots = [...src.matchAll(/<div ref=\{exit\.scrimRef\} role="dialog" aria-modal="true"[^>]*onClick=\{exit\.close\}\s*\n\s*style=\{\{ position: 'fixed', inset: 0, zIndex: (\d+)/g)];
  assert.equal(roots.length, 2, 'the Coach sheet and the lift sheet');
  for (const r of roots) {
    const z = Number(r[1]);
    // over the tab bar (72); under the context menu (120) the lift sheet's
    // "Why Coach set it" opens, and under the week sheet (145)
    assert.ok(z > 72 && z < 120, `z-index ${z}`);
  }
  assert.equal((src.match(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/g) || []).length, 2, 'a tap inside a panel must not reach its backdrop');
});

test('the ✕ path calls the reason-carrying discard, never the bare one', () => {
  const vals = read('src/vals/valsTrainSummary.js');
  assert.match(vals, /app\.inboxAction\(askingCard\.id, 'discard', reason\)/);
  assert.match(vals, /no: c\.stale\s*\n?\s*\? \(\) => app\.inboxAction\(c\.id, 'discard', /);
  assert.doesNotMatch(vals, /answerCoachSuggestion\(/, 'the classic deck\'s bare-discard ✕');
  assert.doesNotMatch(vals, /inboxDiscard\(/);
  assert.doesNotMatch(read('src/screens/TrainSummary.jsx'), /answerCoachSuggestion|inboxDiscard|inboxAction/);
  // one list of reasons, read by the Inbox too
  assert.match(read('src/vals/valsInbox.js'), /: COACH_DECLINE_REASONS\)/);
});

test('the Coach sheet is its own history entry, and the back swipe closes it', () => {
  const app = read('src/App.jsx');
  assert.match(app, /\.\.\.this\.recipeFromHistory\(\), \.\.\.this\.pagesFromHistory\(\) \}\);/);
  assert.match(app, /return \{ \.\.\.this\.pinnedFromHistory\(\), \.\.\.this\.trainCoachFromHistory\(\), \.\.\.this\.viewFromHistory\(\), \.\.\.this\.deeperReportFromHistory\(\), \.\.\.this\.captureSheetFromHistory\(\), \.\.\.this\.documentsFromHistory\(\), \.\.\.this\.recordFromHistory\(\), \.\.\.this\.novaFocusFromHistory\(\) \};/);
  assert.match(app, /novaOverlay: 'traincoach'/);
  assert.match(app, /const withTrain = \{ \.\.\.withIndex, \.\.\.valsTrainSummary\(this, ctx, withIndex\) \};/, 'spread after the Index in renderVals');
});

test('the hero verdict never says "earned 0 reps": zero or less is a hold (his Push day, 28 Sep)', () => {
  assert.equal(verdictRest({ lift: 'Incline Barbell Bench Press', delta: 0, unit: 'rep' }), ' has earned a hold: same weight, cleaner reps.');
  assert.equal(verdictRest({ delta: -1, unit: 'rep' }), ' has earned a hold: same weight, cleaner reps.');
  assert.equal(verdictRest({ delta: 1, unit: 'rep' }), ' has earned a rep.');
  assert.equal(verdictRest({ delta: 2, unit: 'rep' }), ' has earned 2 reps.');
  assert.equal(verdictRest({ delta: 2.5, unit: 'kg' }), ' has earned 2.5 kg.');
  assert.equal(verdictRest({ label: 'outgrown' }), ' has outgrown its prescription.');
  assert.equal(verdictRest(null), '');
});

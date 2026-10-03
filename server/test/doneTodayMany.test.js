// A DAY WITH SEVERAL SESSIONS SAYS ALL OF THEM (3 Oct 2026).
//
// His report: "Side note technically I finished the full arms and delts
// session, make up pull and the make up upper body (just chose to not
// complete the final two makeup exercises). So this screen should be
// reflecting that and not only partial data."
//
// His phone read "DONE TODAY · Made up Upper Body · 1 exercise · 3 sets,
// filed today · + 2 more today" (the main session hidden behind "+ 2 more")
// and the Saturday row "✓ Made up Upper Body · 1 done" (a finished make-up
// reading as partial). The fixture below is his day as the vault holds it:
// Arms and Delts (6 exercises, 18 sets), then the Pull make-up (Lying T Bar
// Row, the one exercise Pull on 29 Sep left), then the Upper Body make-up
// (Wide-Grip Lat Pulldown; Reverse Pec Deck and Chest-Supported Dumbbell Row
// left off by his choice). Both make-ups were filed the way App.jsx files
// them: routineId 'carryover', a "— makeup" name and sourceRoutineName only.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// never his live server/data
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-donetoday-'));

const { doneTodayOf, makeupContext, makeupFor, leftoversOf } = await import('../lib/makeupDay.js');
const { carryoverContext } = await import('../lib/workoutCarryover.js');
const { doneTodayCard, dayDoneMarks, dayDoneText, homeTrainingCard } = await import('../../src/doneToday.js');
const { valsWorkouts } = await import('../../src/vals/valsWorkouts.js');
const { valsTrainSummary } = await import('../../src/vals/valsTrainSummary.js');
const { todayPanels } = await import('../../src/trainPanels.js');

const ex = (id, name = id) => ({ exerciseId: id, name, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 });
const sets = (n) => Array.from({ length: n }, () => ({ weight: 50, reps: 10, done: true }));
const logged = (id, n = 3) => ({ exerciseId: id, name: id, sets: sets(n) });

const ARMS = { id: 'c9b2a11a', name: 'Arms and Delts', exercises: ['alternate-incline-dumbbell-curl', 'cable-bicep-curl', 'carter-extension', 'cable-lateral-raise', 'cable-overhead-tricep-extension', 'reverse-pec-deck-a'].map((i) => ex(i)) };
const PULL = { id: 'e470bd00', name: 'Pull', exercises: ['weighted-pull-up', 'cable-hammer-curls', 'lying-t-bar-row', 'spider-curl', 'ez-bar-reverse-curl', 'dumbbell-shrug', 'dead-hang'].map((i) => ex(i)) };
const UPPER = { id: 'f5a0c85d', name: 'Upper Body', exercises: [ex('incline-db-bench'), ex('barbell-bench-press'), ex('wide-grip-lat-pulldown'), ex('cable-lateral-raise'), ex('reverse-pec-deck', 'Reverse Pec Deck'), ex('chest-supported-dumbbell-row', 'Chest-Supported Dumbbell Row')] };
const ROUTINES = [ARMS, PULL, UPPER];

const DAY = '2026-10-03';
const SESSIONS = [
  // newest first, as loadSessions returns them
  { id: '8b14b0b7', date: DAY, routineId: 'carryover', routineName: 'Upper Body — makeup', sourceRoutineName: 'Upper Body', finishedAt: '2026-10-03T06:08:26.603Z', exercises: [logged('wide-grip-lat-pulldown')] },
  { id: '1bf8a470', date: DAY, routineId: 'carryover', routineName: 'Pull — makeup', sourceRoutineName: 'Pull', finishedAt: '2026-10-03T05:52:14.074Z', exercises: [logged('lying-t-bar-row')] },
  { id: 'a18ac4fb', date: DAY, routineId: ARMS.id, routineName: 'Arms and Delts', finishedAt: '2026-10-03T04:57:57.307Z', exercises: ARMS.exercises.map((e) => logged(e.exerciseId)) },
  { id: '8d3798c6', date: '2026-10-01', routineId: UPPER.id, routineName: 'Upper Body', cutShort: 'out of time', finishedAt: '2026-10-01T04:11:25.639Z', exercises: [logged('incline-db-bench'), logged('barbell-bench-press'), logged('cable-lateral-raise')] },
  { id: 'c88e0e41', date: '2026-09-29', routineId: PULL.id, routineName: 'Pull', cutShort: 'gym busy', finishedAt: '2026-09-29T04:05:53.375Z', exercises: ['weighted-pull-up', 'cable-hammer-curls', 'spider-curl', 'ez-bar-reverse-curl', 'dumbbell-shrug', 'dead-hang'].map((i) => logged(i)) },
];
// Saturday's template in his week is Arms and Delts (schedule.saturday)
const SCHEDULE = { monday: 'e6ac4eb3', tuesday: PULL.id, wednesday: '0efa3872', thursday: UPPER.id, friday: 'active-rest', saturday: ARMS.id, sunday: 'active-rest' };

const HIS_DAY = doneTodayOf(DAY, SESSIONS, ROUTINES, { scheduledRoutine: ARMS, carryovers: [] });

test('his day: Done Today names all three sessions, in the order done, with the totals once', () => {
  assert.equal(HIS_DAY.sessions.length, 3);
  assert.deepEqual(HIS_DAY.totals, { exercises: 8, sets: 24 });
  const card = doneTodayCard(HIS_DAY);
  assert.equal(card.title, '3 sessions today');
  assert.equal(card.meta, '8 exercises · 24 sets in all');
  assert.deepEqual(card.lines.map((l) => `${l.title} · ${l.meta}`), [
    'Arms and Delts · 6 exercises · 18 sets',
    'Made up Pull · 1 exercise · 3 sets',
    'Made up Upper Body · 1 exercise · 3 sets · 2 left off',
  ]);
  assert.equal(card.scheduledDone, true, 'Arms and Delts is Saturday\'s routine and it is done');
  assert.ok(!('more' in card), 'nothing is folded into "+ N more"');
});

test('a filed make-up reads FINISHED; what he left off is his choice, named, never owed', () => {
  const ub = HIS_DAY.sessions.find((s) => s.madeUp?.routineName === 'Upper Body');
  assert.deepEqual(ub.leftOff, ['Reverse Pec Deck', 'Chest-Supported Dumbbell Row']);
  assert.deepEqual(ub.carried, []);
  const pull = HIS_DAY.sessions.find((s) => s.madeUp?.routineName === 'Pull');
  assert.deepEqual(pull.leftOff, [], 'the Pull make-up did the one exercise Pull left');
  const line = doneTodayCard(HIS_DAY).lines[2];
  assert.equal(line.title, 'Made up Upper Body');
  assert.equal(line.leftOff, '2 left off');
  assert.match(line.leftOffWhy, /Reverse Pec Deck, Chest-Supported Dumbbell Row: left off, your call/);
  for (const l of doneTodayCard(HIS_DAY).lines) {
    assert.doesNotMatch(`${l.title} ${l.meta}`, /\bdone\b|\bfinish\b|\d+ left(?! off)/, `"${l.title} · ${l.meta}" reads as partial or owed`);
  }
});

test('leftovers of a filed make-up are not offered as owed anywhere that offers on its own', async () => {
  // the carry-over row is consumed when the make-up is filed (App.finishWorkoutSession
  // → removeCarryover), so the store is empty: no make-up for the date, no debt
  const empty = { listCarryovers: async () => [] };
  assert.equal(await makeupFor(DAY, empty), null, 'no "Finish Upper Body · 2 left" card');
  assert.equal(await makeupContext(new Date(2026, 9, 3, 18), empty), null, 'no make-up line for the Coach or the brief');
  assert.equal(await carryoverContext(), null, 'no carried-over debt line for any agent');
  // the day's own record says "left off", never "left"
  const marks = dayDoneMarks(HIS_DAY);
  assert.equal(marks[2].note, '2 left off');
  // …unless he pushed them on from the finish screen: then they ARE planned,
  // and the record says where they went instead of calling them left off
  const pushed = [{ id: 'x1', forDate: '2026-10-05', sourceRoutineName: 'Upper Body', exercises: [ex('reverse-pec-deck', 'Reverse Pec Deck'), ex('chest-supported-dumbbell-row', 'Chest-Supported Dumbbell Row')] }];
  const withPush = doneTodayOf(DAY, SESSIONS, ROUTINES, { scheduledRoutine: ARMS, carryovers: pushed });
  const ub = withPush.sessions.find((s) => s.madeUp?.routineName === 'Upper Body');
  assert.deepEqual(ub.leftOff, []);
  assert.deepEqual(ub.carried.map((c) => c.name), ['Reverse Pec Deck', 'Chest-Supported Dumbbell Row']);
  assert.equal(doneTodayCard(withPush).lines[2].meta, '1 exercise · 3 sets · 2 moved to Monday');
});

test('a later session cannot rewrite what a make-up left off on its day', () => {
  const later = [{ id: 'z', date: '2026-10-05', routineId: 'carryover', routineName: 'Upper Body — makeup', sourceRoutineName: 'Upper Body', finishedAt: '2026-10-05T05:00:00Z', exercises: [logged('reverse-pec-deck')] }, ...SESSIONS];
  const day = doneTodayOf(DAY, later, ROUTINES, { scheduledRoutine: ARMS });
  assert.deepEqual(day.sessions.find((s) => s.madeUp?.routineName === 'Upper Body').leftOff, ['Reverse Pec Deck', 'Chest-Supported Dumbbell Row']);
  // (leftoversOf itself is unchanged: an explicit re-choice still derives the remainder)
  assert.equal(leftoversOf(UPPER, SESSIONS).exercises.length, 2);
});

test('one session keeps the single, simple card', () => {
  const one = doneTodayOf(DAY, SESSIONS.filter((s) => s.id === 'a18ac4fb'), ROUTINES, { scheduledRoutine: ARMS });
  const card = doneTodayCard(one);
  assert.equal(card.title, 'Arms and Delts');
  assert.equal(card.meta, '6 exercises · 18 sets, filed today');
  assert.equal(card.lines, null);
  const mk = doneTodayCard(doneTodayOf(DAY, SESSIONS.filter((s) => s.id === '8b14b0b7' || s.date < DAY), ROUTINES, { scheduledRoutine: ARMS }));
  assert.equal(mk.title, 'Made up Upper Body');
  assert.equal(mk.meta, '1 exercise · 3 sets, filed today · 2 left off');
  assert.equal(doneTodayCard(null), null);
});

test('a session that is neither the day\'s routine nor a make-up is named as the extra it was', () => {
  const day = doneTodayOf(DAY, SESSIONS, ROUTINES, { scheduledRoutine: null });
  assert.equal(dayDoneText(dayDoneMarks(day)), 'Arms and Delts (extra) · made up Pull · made up Upper Body, 2 left off');
  assert.equal(dayDoneText(dayDoneMarks(HIS_DAY)), 'Arms and Delts · made up Pull · made up Upper Body, 2 left off');
});

// ---- Home's Training card (3 Oct): "it should not behave like I haven't
// done it" — both idioms read this same fold (valsMission.js), so a session
// filed today replaces the scheduled badge whole, never word by word. -----

const SCHEDULED = { k: 'TRAIN · TODAY', label: 'Arms and Delts', meta: '6 exercises · tap to open Train' };

test('Home\'s Training card: one session filed today says its name and size, marked done', () => {
  const one = doneTodayOf(DAY, SESSIONS.filter((s) => s.id === 'a18ac4fb'), ROUTINES, { scheduledRoutine: ARMS });
  const card = homeTrainingCard(one, SCHEDULED);
  assert.equal(card.k, 'TRAIN · DONE');
  assert.equal(card.label, '✓ Arms and Delts');
  assert.equal(card.meta, '6 exercises · 18 sets, filed today');
});

test('Home\'s Training card: three sessions say the day\'s totals, never just the last make-up', () => {
  const card = homeTrainingCard(HIS_DAY, SCHEDULED);
  assert.equal(card.k, 'TRAIN · DONE');
  assert.equal(card.label, '✓ 3 sessions today');
  assert.equal(card.meta, '8 exercises · 24 sets in all');
});

test('Home\'s Training card is untouched while nothing was filed today', () => {
  assert.deepEqual(homeTrainingCard(null, SCHEDULED), SCHEDULED);
  assert.deepEqual(homeTrainingCard({ sessions: [] }, SCHEDULED), SCHEDULED);
});

// ---- the real view models, on his Saturday -------------------------------
function appFor(overview, extra = {}) {
  const state = {
    exercisePickerQuery: '', coachChat: [], liveWorkoutRoutines: ROUTINES.map((r) => ({ ...r, completedCount: 1 })),
    liveWorkoutSchedule: SCHEDULE, liveTrainOverview: overview, liveCarryovers: [], trainTab: 'gym', workoutsView: 'routines',
    screen: 'workouts', ...extra,
  };
  return { state, basePlan: [], setState() {} };
}
const OVERVIEW = { today: { routineId: ARMS.id, name: ARMS.name, exerciseCount: 6 }, restDay: false, makeup: null, doneToday: HIS_DAY };

test('the Saturday row and the Gym card, as valsWorkouts builds them for his phone', (t) => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 3, 18, 0) });
  t.after(() => mock.timers.reset());
  const v = valsWorkouts(appFor(OVERVIEW), {});
  const sat = v.weekStrip.find((d) => d.day === 'saturday');
  assert.equal(sat.isToday, true);
  assert.deepEqual(sat.doneMarks.map((m) => `✓ ${m.text}${m.note ? ` · ${m.note}` : ''}`), [
    '✓ Arms and Delts',
    '✓ Made up Pull',
    '✓ Made up Upper Body · 2 left off',
  ]);
  // the plan control is left as he set it, but no longer says "finish"
  assert.equal(sat.value, `makeup:${UPPER.id}`);
  assert.equal(sat.options.find((o) => o.value === sat.value).label, 'Made up Upper Body');
  assert.equal(sat.makeup.leftOff, '2 left off');
  // the Gym hero's Done Today card is the whole day
  assert.equal(v.gymHero.done.title, '3 sessions today');
  assert.equal(v.gymHero.done.lines.length, 3);
  assert.equal(v.trainToday.done.title, '3 sessions today', 'the Today tab reads the same card');
  // other days keep their plain marks
  assert.deepEqual(v.weekStrip.find((d) => d.day === 'thursday').doneMarks, []);
});

test('the summary Train page agrees: the hero lists the day, the week note says all of it', (t) => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 3, 18, 0) });
  t.after(() => mock.timers.reset());
  const app = appFor(OVERVIEW, { novaStyle: 'summary' });
  const ctx = { demoMode: false, todayRoutine: ARMS, go: () => () => {} };
  const v = valsWorkouts(app, ctx);
  const { trainSummary: T } = valsTrainSummary(app, ctx, v);
  assert.equal(T.hero.kind, 'done');
  assert.equal(T.hero.title, '3 sessions today');
  assert.equal(T.hero.sub, '8 exercises · 24 sets in all');
  assert.deepEqual(T.hero.lines.map((l) => l.title), ['Arms and Delts', 'Made up Pull', 'Made up Upper Body']);
  assert.equal(T.hero.also, null, 'Arms and Delts is done; nothing offers to begin it again');
  assert.ok(T.week.notes.includes('Saturday · Arms and Delts · made up Pull · made up Upper Body, 2 left off'), T.week.notes.join(' | '));
  const dot = T.week.dots.find((d) => d.day === 'saturday');
  assert.equal(dot.state, 'done');
  assert.match(dot.aria, /Arms and Delts · made up Pull · made up Upper Body, 2 left off/);
});

test('the Today pane still shows the made-up panel and hides a scheduled card already done', () => {
  const p = todayPanels(OVERVIEW);
  assert.equal(p.madeUp, true);
  assert.equal(OVERVIEW.doneToday.scheduledDone, true);
  const pane = read('src/TrainToday.jsx');
  assert.match(pane, /!\(panels\.madeUp && o\.doneToday\?\.scheduledDone\)/, 'the done routine is offered again beside its own tick');
  assert.match(pane, /done\.lines\.map/, 'the Today pane lists one make-up only');
});

test('both idioms of the screen draw the whole day, and nothing folds it into "+ N more"', () => {
  const screen = read('src/screens/Workouts.jsx');
  assert.match(screen, /<DoneLines lines=\{v\.gymHero\.done\.lines\} \/>/);
  assert.match(screen, /<DayDoneMarks marks=\{d\.doneMarks\} \/>/, 'the Apple week row');
  assert.match(screen, /d\.doneMarks\?\.length > 1/, 'the compact week strip');
  assert.doesNotMatch(screen, /done\.more/);
  assert.doesNotMatch(read('src/vals/valsWorkouts.js'), /more: d\.sessions/);
  assert.match(read('src/screens/TrainSummary.jsx'), /h\.lines\.map/);
});

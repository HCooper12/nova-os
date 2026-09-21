// MAKE-UP IS A FOCUS, not a second control.
//
// His report, 22 Sep: "When nova briefs me about my day and says I have a push
// day (for example) plus a makeup session, this is wrong. For today I changed
// it to say push because I need to finish the makeup push exercises. So allow
// the option for the focus to be chosen as a make up day."
//
// The week strip had TWO selects stacked per day — the weekday routine, and a
// separate "Make-up day…" picker. A day could therefore be Push AND a make-up,
// which is two answers to one question, and it made him edit the WEEKDAY
// TEMPLATE (changing every future Tuesday) to express one Tuesday.
//
// These pin the fold: one control, both idioms, and no way to set a template
// day and a make-up in the same gesture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFile(path.join(ROOT, ...p), 'utf8');

test('the focus select offers a make-up for every routine', async () => {
  const vals = await read('src', 'vals', 'valsWorkouts.js');
  const block = vals.slice(vals.indexOf('const weekStrip ='), vals.indexOf('const routinesList'));
  assert.match(block, /value: `makeup:\$\{r\.id\}`/,
    'the focus options no longer include a make-up per routine');
  assert.match(block, /label: `Make-up · finish \$\{r\.name\}`/);
  // ...and the ordinary choices survive
  assert.match(block, /label: 'Rest'/);
  assert.match(block, /label: 'Active rest'/);
});

test('choosing a make-up NEVER also writes the weekday template', async () => {
  const vals = await read('src', 'vals', 'valsWorkouts.js');
  const m = vals.match(/onChange: \(e\) => \{[\s\S]*?\n {6}\},/);
  assert.ok(m, 'the week strip onChange is gone');
  const body = m[0];
  // the make-up branch returns before assignScheduleDay is reached — this is
  // the whole fault: one day, two answers
  const makeupBranch = body.slice(body.indexOf("startsWith('makeup:')"), body.indexOf('if (dayMakeup)'));
  assert.match(makeupBranch, /markMakeupDay/);
  assert.match(makeupBranch, /return;/, 'the make-up branch falls through into the template write');
  assert.doesNotMatch(makeupBranch, /assignScheduleDay/);
});

test('leaving a make-up clears the override BEFORE writing the template', async () => {
  const vals = await read('src', 'vals', 'valsWorkouts.js');
  const m = vals.match(/onChange: \(e\) => \{[\s\S]*?\n {6}\},/)[0];
  const clearAt = m.indexOf('clearMakeupDay');
  const assignAt = m.indexOf('assignScheduleDay');
  assert.ok(clearAt > 0 && assignAt > 0, 'one of the two writes is missing');
  assert.ok(clearAt < assignAt,
    'the template is written before the make-up is dropped — the date keeps finishing a session he just stopped planning');
});

test('a make-up with no routine id still selects, by name', async () => {
  // workoutCarryover.js falls back to the NAME when either side lacks an id,
  // so a row written without one must not render as a blank select — which
  // would silently rewrite the template on his next touch
  const vals = await read('src', 'vals', 'valsWorkouts.js');
  assert.match(vals, /liveRoutines\.find\(\(r\) => r\.name === dayMakeup\.sourceRoutineName\)\?\.id/);
});

test('BOTH IDIOMS lost the second control', async () => {
  // the project rule: every surface ships in both Home idioms from one view
  // model. A fold applied to one strip and not the other leaves the fault
  // alive on whichever layout he is actually using.
  const screen = await read('src', 'screens', 'Workouts.jsx');
  assert.doesNotMatch(screen, /d\.setMakeup/, 'a second make-up control survives');
  assert.doesNotMatch(screen, /d\.makeupOptions/, 'a second make-up option list survives');
  // exactly two selects remain in the strip — one per idiom
  const selects = [...screen.matchAll(/value=\{d\.value\}/g)];
  assert.equal(selects.length, 2, `expected one focus select per idiom, found ${selects.length}`);
  // and the gold "Make-up · …" note stays in both, so the day still says what it is
  assert.equal([...screen.matchAll(/Make-up ·/g)].length, 2);
});

test('the view model stopped exposing what nothing renders', async () => {
  const vals = await read('src', 'vals', 'valsWorkouts.js');
  const block = vals.slice(vals.indexOf('const weekStrip ='), vals.indexOf('const routinesList'));
  for (const dead of ['setMakeup:', 'makeupOptions:', 'clearMakeup:']) {
    assert.ok(!block.includes(dead), `weekStrip still exposes ${dead} with nothing reading it`);
  }
});

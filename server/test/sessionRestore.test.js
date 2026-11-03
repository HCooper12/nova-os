// THE DEVICE COPY OF A WORKOUT IS WHAT A REOPEN SHOWS (4 Nov 2026).
// Measured in WebKit: with the Mac unreachable, a reopened Nova had his
// in-progress workout in device storage and NOT on screen, because the
// state defaults written after `...restoreActiveSession()` (workoutSession:
// null, workoutsView: 'routines', journalComposerText: '') overwrote what it
// restored. It came back only when the Mac answered with the server copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { opensSessionFrom } from '../../src/sessionReopen.js';

const app = readFileSync(fileURLToPath(new URL('../../src/App.jsx', import.meta.url)), 'utf8');

test('the restores are the LAST keys of the initial state, after every default', () => {
  const start = app.indexOf('  state = {\n');
  const end = app.indexOf('\n  };\n', start);
  assert.ok(start > 0 && end > start, 'the state literal moved');
  const body = app.slice(start, end);
  const at = body.indexOf('...restoreActiveSession(),');
  assert.ok(at > 0, 'restoreActiveSession is no longer spread into the state');
  const after = body.slice(at);
  // nothing but the other restores and comments may follow it
  const keys = after.split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  assert.deepEqual(keys, ['...restoreDrafts(),', '...restoreChats(),'], `something is written after the restore: ${keys.join(' ')}`);
  for (const k of ['workoutSession', 'workoutsView', 'editingSessionId', 'journalComposerText', 'inboxInput', 'trainTab']) {
    assert.ok(!new RegExp(`\\b${k}:`).test(after), `${k} is defaulted after the restore and wipes it`);
  }
});

test('a fresh workout reopens on the logger, on Train', () => {
  const fn = app.slice(app.indexOf('function restoreActiveSession() {'), app.indexOf('function restoreChats() {'));
  assert.match(fn, /out\.workoutsView = 'session';/);
  assert.match(fn, /out\.trainTab = 'gym';/);
  assert.match(fn, /if \(opensSessionFrom\([^)]*location\.hash\)\) out\.screen = 'workouts';/);
});

test('the start URL opens the workout; a link to elsewhere is kept', () => {
  assert.equal(opensSessionFrom(''), true, 'the installed app reopens with no hash');
  assert.equal(opensSessionFrom('#'), true);
  assert.equal(opensSessionFrom('#/'), true);
  assert.equal(opensSessionFrom('#/mission'), true, 'Home is where a reload lands; the workout wins');
  assert.equal(opensSessionFrom('#/workouts'), true);
  assert.equal(opensSessionFrom('#/inbox'), false, 'the capture icon must still open the Inbox');
  assert.equal(opensSessionFrom('#/recipes'), false);
  assert.equal(opensSessionFrom('#/voice?x=1'), false);
});

test('an unreachable draft check is said in the offline card, not a toast', () => {
  assert.ok(!/toastMsg\('Couldn’t check the server for a workout draft/.test(app), 'the toast is back');
  assert.match(app, /this\.setState\(\{ draftCheckWaiting: true \}\);/);
  assert.match(app, /if \(this\.state\.draftCheckWaiting\) this\.setState\(\{ draftCheckWaiting: false \}\);/);
  const vm = readFileSync(fileURLToPath(new URL('../../src/vals/valsMission.js', import.meta.url)), 'utf8');
  assert.match(vm, /st\.draftCheckWaiting \? " Nova couldn't check your Mac for a saved workout yet/);
});

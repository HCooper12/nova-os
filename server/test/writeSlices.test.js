// The slice-tagging safety property, pinned permanently.
//
// Tagging a write with the slices it touched lets the client pull 3 slices
// instead of 30. The failure mode is silent and therefore serious: if a tag
// omits a slice that really changed, the screen keeps showing stale data with
// no error, no toast, nothing — Nova quietly lying about the vault. So the
// rules under test are absolute:
//
//   1. An unknown path resyncs EVERYTHING (null), never "nothing".
//   2. No tag may ever be an empty list.
//   3. Every tagged slice name must be a real snapshot slice — a typo like
//      'shoppinglist' would refresh nothing and look like it worked.
//   4. The polymorphic write paths stay untagged, on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { slicesForPath, slicesForKind, WRITE_SLICE_MAP, KIND_SLICE_MAP } from '../lib/writeSlices.js';
import { SLICES } from '../routes/snapshot.js';

test('an unknown path means SYNC EVERYTHING, not sync nothing', () => {
  for (const path of ['/something-new', '/api/whatever', '/', '/todos-not-really']) {
    assert.equal(slicesForPath(path), null, `${path} must fall back to a full sync`);
  }
});

test('junk input falls back to a full sync rather than throwing', () => {
  for (const junk of [undefined, null, '', 0, {}, []]) {
    assert.equal(slicesForPath(junk), null);
  }
});

test('THE SAFETY PROPERTY: no tag is ever an empty list', () => {
  for (const entry of WRITE_SLICE_MAP) {
    assert.ok(
      Array.isArray(entry.slices) && entry.slices.length > 0,
      `${entry.test} has an empty slice list — that would read as "nothing changed"`,
    );
  }
});

test('every tagged slice name is a real snapshot slice', () => {
  const real = new Set(Object.keys(SLICES));
  for (const entry of WRITE_SLICE_MAP) {
    for (const slice of entry.slices) {
      assert.ok(real.has(slice), `${entry.test} tags "${slice}", which is not a snapshot slice`);
    }
  }
});

test('the polymorphic write paths are deliberately untagged', () => {
  // these route one input to any surface — naming slices for them is guessing
  for (const path of ['/intent', '/inbox/approve', '/inbox', '/ingest', '/studio/x', '/loops/run']) {
    assert.equal(slicesForPath(path), null, `${path} must not be narrowly tagged`);
  }
});

test('the known write paths tag the slices their libs actually read', () => {
  // fuelCross reads workoutSessions, foodLog, rotation and recipes (lib/fuelCross.js)
  // — so every one of those write paths must name it
  for (const path of ['/food-log', '/rotation/consumed', '/recipes/123', '/workouts/sessions']) {
    assert.ok(slicesForPath(path).includes('fuelCross'), `${path} changes fuelCross`);
  }
  // streaks reads workoutSessions and healthData (lib/streaks.js)
  for (const path of ['/workouts/sessions', '/health-data/import']) {
    assert.ok(slicesForPath(path).includes('streaks'), `${path} changes streaks`);
  }
  // a journal entry is a real vault note
  const journal = slicesForPath('/journal/entries');
  assert.ok(journal.includes('notes') && journal.includes('graph'), 'a journal entry is a note in the graph');
  // a logged meal moves both rollups, not just today
  const food = slicesForPath('/food-log');
  assert.ok(food.includes('nutritionWeek') && food.includes('nutritionMonth'));
});

test('query strings and trailing slashes do not defeat matching', () => {
  assert.deepEqual(slicesForPath('/todos/'), ['todos']);
  assert.deepEqual(slicesForPath('/todos?done=1'), ['todos']);
  assert.deepEqual(slicesForPath('/todos/42/toggle'), ['todos']);
});

// The bug this file exists to prevent shipping twice: several routes fire a
// domain broadcast ('todos', 'health') as well as the generic chokepoint one.
// While those stayed untagged, EVERY tagged write was accompanied by an
// untagged sibling, the client correctly fell back to a full sync, and the
// whole optimisation was worth nothing — visibly, with no error to notice.
test('the domain broadcast kinds are tagged, or the path tags cancel out', () => {
  assert.deepEqual(slicesForKind('todos'), ['todos']);
  assert.deepEqual(slicesForKind('money'), ['money']);
  assert.ok(slicesForKind('health').includes('streaks'));
  assert.ok(slicesForKind('notes').includes('graph'));
});

test('an unknown kind resyncs everything, and the generic kind defers to the path', () => {
  assert.equal(slicesForKind('write'), null, "'write' is tagged from its path, not its kind");
  assert.equal(slicesForKind('inbox'), null, 'an inbox approval can write anything');
  assert.equal(slicesForKind('forge'), null);
  assert.equal(slicesForKind('brand-new-kind'), null);
  assert.equal(slicesForKind(undefined), null);
});

test('every kind-tagged slice name is a real snapshot slice', () => {
  const real = new Set(Object.keys(SLICES));
  for (const [kind, slices] of Object.entries(KIND_SLICE_MAP)) {
    assert.ok(slices.length > 0, `${kind} has an empty slice list`);
    for (const slice of slices) assert.ok(real.has(slice), `kind "${kind}" tags unreal slice "${slice}"`);
  }
});

test('a path and its matching kind agree about the slices they name', () => {
  // where both exist they describe the same write, so the kind must not claim
  // less than the path — a narrower kind tag would under-refresh
  for (const [kind, path] of [['todos', '/todos'], ['money', '/money'], ['notes', '/notes']]) {
    const byPath = slicesForPath(path);
    for (const slice of slicesForKind(kind)) {
      assert.ok(byPath.includes(slice), `kind "${kind}" names ${slice} but ${path} does not`);
    }
  }
});

test('a prefix must match a whole path segment', () => {
  // '/notesomething' is not a /notes write
  assert.equal(slicesForPath('/notesomething'), null);
  assert.deepEqual(slicesForPath('/notes'), ['notes', 'graph']);
});

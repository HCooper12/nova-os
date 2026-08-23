// The morning health push must survive a missing metric.
//
// 23 Aug 2026: HealthKit had no resting-HR sample, the Shortcut interpolated
// nothing, and the body arrived as `"restingHeartRate":,`. body-parser
// rejected it, so ONE absent metric silently discarded every other metric in
// the push and the phone was told "internal error". These tests pin both
// halves of the fix: empty slots read as null, and the repair must never
// touch anything inside a string value — this writes to his health record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repairEmptyJsonValues, parseWithEmptyValues } from '../lib/jsonRepair.js';

test('THE REAL PAYLOAD: an absent metric becomes null, the rest survives', () => {
  const sent = '{"date":"2026-08-23","steps":8412,"restingHeartRate":,"hrv":70,"vo2Max":}';
  const out = parseWithEmptyValues(sent);
  assert.ok(out, 'the push must be recoverable');
  assert.equal(out.repaired, 2);
  assert.deepEqual(out.value, {
    date: '2026-08-23', steps: 8412, restingHeartRate: null, hrv: 70, vo2Max: null,
  });
});

test('THE SAFETY PROPERTY: nothing inside a string is ever rewritten', () => {
  // a colon followed by a comma INSIDE a value would be corrupted by the
  // naive regex version of this fix
  const tricky = '{"note":"woke at 6: , felt flat","hrv":}';
  const out = parseWithEmptyValues(tricky);
  assert.equal(out.value.note, 'woke at 6: , felt flat');
  assert.equal(out.value.hrv, null);
  assert.equal(out.repaired, 1);
});

test('escaped quotes do not break string tracking', () => {
  const s = '{"note":"he said \\"6: ,\\" then left","steps":}';
  const out = parseWithEmptyValues(s);
  assert.equal(out.value.note, 'he said "6: ," then left');
  assert.equal(out.value.steps, null);
});

test('valid JSON is left completely alone', () => {
  const good = '{"a":1,"b":"x, y","c":[1,2],"d":null}';
  assert.equal(repairEmptyJsonValues(good).repaired, 0);
  assert.equal(repairEmptyJsonValues(good).text, good);
  // and it reports "not our case" rather than re-parsing something that was
  // never broken — the caller only reaches here after a real parse failure
  assert.equal(parseWithEmptyValues(good), null);
});

test('missing array elements and trailing commas are handled', () => {
  assert.deepEqual(parseWithEmptyValues('{"xs":[1,,3]}').value, { xs: [1, null, 3] });
  assert.deepEqual(parseWithEmptyValues('{"a":1,}').value, { a: 1 });
  assert.deepEqual(parseWithEmptyValues('{"xs":[1,2,]}').value, { xs: [1, 2] });
});

test('a body broken some OTHER way fails honestly, never half-parsed', () => {
  // truncated mid-payload — repairing empty values cannot save this, and
  // handing back a partial object would silently store wrong health data
  assert.equal(parseWithEmptyValues('{"date":"2026-08-23","steps":'), null);
  assert.equal(parseWithEmptyValues('not json at all'), null);
  assert.equal(parseWithEmptyValues(''), null);
  assert.equal(parseWithEmptyValues('{"a":,'), null, 'repaired but still unparseable → null');
});

test('every empty slot in a full-shaped morning push is recovered', () => {
  // the worst realistic case: a morning where almost nothing was measured
  const sparse = '{"date":"2026-08-24","steps":,"restingHeartRate":,"hrv":,"sleepAsleepMinutes":,"vo2Max":,"weightKg":81.2}';
  const out = parseWithEmptyValues(sparse);
  assert.equal(out.repaired, 5);
  assert.equal(out.value.weightKg, 81.2);
  assert.equal(out.value.date, '2026-08-24');
  for (const k of ['steps', 'restingHeartRate', 'hrv', 'sleepAsleepMinutes', 'vo2Max']) {
    assert.equal(out.value[k], null, `${k} must be null, not missing or zero`);
  }
});

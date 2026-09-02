// Brief warm — the two windows (morning + evening), and the persistent-
// failure note: three all-failed runs say so once; the first warm clears it.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-warm-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { warmVariantFor, warmFailureState, warmFailureNote, WARM_FAIL_RUNS, WARM_WINDOWS } = await import('../lib/briefWarm.js');

test('windows: morning 05–10, evening 19–22, nothing in between', () => {
  assert.equal(warmVariantFor(4), null);
  assert.equal(warmVariantFor(5), 'morning');
  assert.equal(warmVariantFor(9), 'morning');
  assert.equal(warmVariantFor(10), null);
  assert.equal(warmVariantFor(14), null);
  assert.equal(warmVariantFor(19), 'evening');
  assert.equal(warmVariantFor(21), 'evening');
  assert.equal(warmVariantFor(22), null);
  assert.deepEqual(Object.keys(WARM_WINDOWS), ['morning', 'evening']);
});

test('persistent failure: silent below the threshold, one honest line at it, cleared by the first warm', () => {
  const at = new Date(2026, 8, 3, 5, 30);
  let s = null;
  s = warmFailureState(s, { skipped: true }, at);
  assert.equal(s, null, 'a skipped run is no verdict');
  s = warmFailureState(s, { lines: 0, warmed: 0, failed: 0 }, at);
  assert.equal(s, null, 'nothing attempted is no verdict either');
  for (let i = 0; i < WARM_FAIL_RUNS - 1; i++) {
    s = warmFailureState(s, { lines: 8, warmed: 0, failed: 8 }, new Date(at.getTime() + i * 1800e3));
    assert.equal(warmFailureNote(s), null, `run ${i + 1} stays quiet`);
  }
  s = warmFailureState(s, { lines: 8, warmed: 0, failed: 8 }, new Date(at.getTime() + 3 * 1800e3));
  assert.equal(s.streak, WARM_FAIL_RUNS);
  assert.match(warmFailureNote(s), /^brief warm has failed since 05:30 — first open will be slow$/, 'since = the FIRST failure, not the latest');
  s = warmFailureState(s, { lines: 8, warmed: 3, failed: 5 }, at);
  assert.equal(s.streak, 0);
  assert.equal(warmFailureNote(s), null, 'a partial warm is a warm — the note clears');
});

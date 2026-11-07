import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-asks-'));
const { unaskedOnce } = await import('../lib/injuryLog.js');

test('a disagreement is put to him once, across sessions, then rests for 30 days', async () => {
  const line = 'Profile says no injuries; the log holds Lower back as active.';
  const t0 = new Date('2026-11-07T10:00:00Z');
  assert.deepEqual(await unaskedOnce([line], { now: t0 }), [line]);
  assert.deepEqual(await unaskedOnce([line], { now: new Date('2026-11-08T10:00:00Z') }), []);
  assert.deepEqual(await unaskedOnce([line], { now: new Date('2026-12-01T10:00:00Z') }), []);
  assert.deepEqual(await unaskedOnce([line], { now: new Date('2026-12-08T10:00:00Z') }), [line]);
});

test('a new disagreement still gets through', async () => {
  const now = new Date('2026-12-09T10:00:00Z');
  assert.deepEqual(await unaskedOnce(['Something new.'], { now }), ['Something new.']);
});

// The health insight's SPEND CAP — the decision layer only. The spawn itself
// needs the CLI and is deliberately not tested (same boundary the Telegram
// bridge draws); everything that decides whether to spend money lives here.
//
// This lane had no test file at all when the August 2026 audit found it
// retrying an expensive compose every hour from 06:00 to midnight.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-insight-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { triesToday, recordFailedAttempt, MAX_TRIES_PER_DAY, getLatestInsight } =
  await import('../lib/healthInsight.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('the cap is per-day: yesterday\'s attempts do not spend today\'s budget', () => {
  assert.equal(triesToday({ tries: 3, triesDate: '2026-08-31' }, '2026-09-01'), 0);
  assert.equal(triesToday({ tries: 2, triesDate: '2026-09-01' }, '2026-09-01'), 2);
  assert.equal(triesToday(undefined, '2026-09-01'), 0, 'a slot that never ran has spent nothing');
  assert.equal(triesToday({ ...{} }, '2026-09-01'), 0);
});

test('a failed attempt is counted, and stops at the cap', async () => {
  const t = '2026-09-01';
  let n = 0;
  for (let i = 0; i < MAX_TRIES_PER_DAY; i++) n = await recordFailedAttempt('morning', t, `boom ${i}`);
  assert.equal(n, MAX_TRIES_PER_DAY, 'every attempt leaves a mark — without one, no cap can exist');

  const cached = await getLatestInsight();
  assert.equal(triesToday(cached.morning, t), MAX_TRIES_PER_DAY, 'the counter survives a reload');
  assert.match(cached.morning.lastError, /boom 2/, 'the last failure says what went wrong');
});

test('a failure never overwrites the last real insight, and never fakes a run', async () => {
  const cached = await getLatestInsight();
  // `date` is the last SUCCESS. Leaving it alone is what lets a later attempt
  // today still succeed — and keeps a real earlier insight on screen instead
  // of blanking it because a retry failed.
  assert.equal(cached.morning.date, null, 'a failed compose is not a completed run');
  assert.equal(cached.morning.hasInsight, false);
  assert.equal(cached.morning.insight, null, 'no invented insight');

  const onDisk = JSON.parse(await readFile(path.join(dataDir, 'health', 'insight.json'), 'utf8'));
  assert.equal(onDisk.evening.tries, 0, 'one slot failing does not spend the other slot\'s budget');
  assert.equal(onDisk.evening.triesDate, null);
});

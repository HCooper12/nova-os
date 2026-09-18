// HOW LONG HAS THIS BEEN RUNNING. His instruction, 18 Sep: the job tray must
// be live and accurate. "Live" is Elapsed.jsx's interval; "accurate" is all
// here — where a start time comes from, and what happens to it across a
// reload, a second device, a finished job and a second run of the same job.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sinceFor, startedFrom, formatElapsed, elapsedLabel, _resetJobClock,
} from '../../src/jobClock.js';

test('a client flag starts its clock once and keeps it', () => {
  _resetJobClock();
  const t0 = sinceFor('leader', true, 1000);
  // the val builders run on EVERY render — the second, third and hundredth
  // call this second must not restamp the start
  assert.equal(sinceFor('leader', true, 5000), t0);
  assert.equal(sinceFor('leader', true, 9000), t0);
  assert.equal(t0, 1000);
});

test('a job that finishes forgets its mark, so the NEXT run times itself', () => {
  _resetJobClock();
  sinceFor('coach', true, 1000);
  sinceFor('coach', false);                      // the flag went false
  const second = sinceFor('coach', true, 60_000);
  assert.equal(second, 60_000,
    'the second run inherited the first run’s clock — it would open at "59m"');
});

test('two jobs keep two clocks', () => {
  _resetJobClock();
  sinceFor('code', true, 1000);
  sinceFor('forge', true, 4000);
  assert.equal(sinceFor('code', true, 9000), 1000);
  assert.equal(sinceFor('forge', true, 9000), 4000);
});

test('a server stamp is read as UTC, because everything operational is', () => {
  // He is AEST (+10) and every operational stamp Nova writes is UTC. This
  // displays a DIFFERENCE, so the only way to get it wrong is to misparse —
  // and a Z-suffixed ISO string parses to the same instant everywhere.
  const t = startedFrom('2026-09-18T02:30:00.000Z');
  assert.equal(t, Date.UTC(2026, 8, 18, 2, 30, 0));
  assert.equal(startedFrom(null), null);
  assert.equal(startedFrom(''), null);
  assert.equal(startedFrom('not a date'), null);
});

test('the format reads at a glance and never jitters', () => {
  assert.equal(formatElapsed(0), 'just now');
  assert.equal(formatElapsed(999), 'just now');
  assert.equal(formatElapsed(1000), '1s');
  assert.equal(formatElapsed(42_000), '42s');
  assert.equal(formatElapsed(59_999), '59s');
  assert.equal(formatElapsed(60_000), '1m 00s');
  // padded, so the column does not shift width as the seconds roll over
  assert.equal(formatElapsed(3 * 60_000 + 2_000), '3m 02s');
  assert.equal(formatElapsed(59 * 60_000 + 59_000), '59m 59s');
  assert.equal(formatElapsed(60 * 60_000), '1h 00m');
  assert.equal(formatElapsed(64 * 60_000), '1h 04m');
  assert.equal(formatElapsed(null), '');
  assert.equal(formatElapsed(NaN), '');
});

test('A FINISHED JOB STOPS COUNTING', () => {
  // The tray was built to end "1 running" meaning "one thing died last week".
  // A timer still climbing on a job that finished would be the same bug in a
  // new column — "Ready for review · 3h 12m" is a number that means nothing.
  const started = 1000;
  assert.equal(elapsedLabel({ startedAt: started }, 61_000), '1m 00s');
  assert.equal(elapsedLabel({ startedAt: started, done: true }, 61_000), '');
  assert.equal(elapsedLabel({ startedAt: started, failed: true }, 61_000), '');
  assert.equal(elapsedLabel({ }, 61_000), '', 'a job with no start time invented one');
  assert.equal(elapsedLabel(null, 61_000), '');
});

test('clock skew between his phone and the Mac never shows a negative age', () => {
  // the Mac stamps createdAt; his phone renders it. A few seconds of skew
  // must read as "just now", never as "-4s", which reads as a bug.
  assert.equal(elapsedLabel({ startedAt: 10_000 }, 6_000), 'just now');
});

test('the tray hands Elapsed a startedAt on every kind of job', async () => {
  // the wiring, which is what actually rots: a new job kind added to the tray
  // without a start time shows no clock and nobody notices.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const vals = await readFile(path.join(root, 'src', 'vals', 'valsChrome.js'), 'utf8');

  const tray = vals.slice(vals.indexOf('jobTray:'), vals.indexOf('agentsGroupLabel'));
  const unshifts = [...tray.matchAll(/jobs\.(?:unshift|push)\(\{[\s\S]*?\}\)/g)].map((m) => m[0]);
  assert.ok(unshifts.length >= 5, `only found ${unshifts.length} tray rows — the scan is wrong`);
  for (const row of unshifts) {
    // done/failed rows legitimately carry no clock — they are not running
    if (/done: true|failed: true/.test(row)) continue;
    assert.match(row, /startedAt:/, `a running tray row with no clock:\n${row.slice(0, 120)}`);
  }
});

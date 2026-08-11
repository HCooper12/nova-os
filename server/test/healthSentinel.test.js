// The missed-push sentinel: nudges once, after 09:00 local, only when
// yesterday's health file is genuinely absent — and records the nudge so a
// 2-minute tick can call it freely. Temp data dir BEFORE imports.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-sentinel-'));
// hermetic: never let the suite read the real server request log — the
// midnight-evidence check must see exactly what each test gives it
process.env.NOVA_REQLOG = path.join(process.env.NOVA_DATA_DIR, 'absent.log');

import test from 'node:test';
import assert from 'node:assert/strict';

const { shouldNudge, runMissedPushSentinel, yesterdayLocal } = await import('../lib/healthSentinel.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };

test('shouldNudge: after 09:00, when yesterday did not close, once per day', () => {
  assert.equal(shouldNudge(at(8, 59), { hasYesterdayFile: false, lastNudgeDay: null }), false, 'too early');
  assert.equal(shouldNudge(at(9, 0), { hasYesterdayFile: false, lastNudgeDay: null }), true, '09:00 opens it');
  assert.equal(shouldNudge(at(9, 0), { hasYesterdayFile: true, yesterdayStepsComplete: true, lastNudgeDay: null }), false, 'the day closed properly — silence');
  // the 11 Aug silence: a file existed, but it held only a midday partial
  assert.equal(shouldNudge(at(9, 0), { hasYesterdayFile: true, yesterdayStepsComplete: false, lastNudgeDay: null }), true, 'stale partial must still shout');
  assert.equal(shouldNudge(at(9, 0), { hasYesterdayFile: true, yesterdayStepsComplete: undefined, lastNudgeDay: null }), true, 'no steps at all in the file = did not close');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(shouldNudge(at(15, 0), { hasYesterdayFile: false, lastNudgeDay: todayStr }), false, 'already nudged today');
});

test('runner: sends the honest message once, then stays quiet; a landed file keeps it silent', async () => {
  const sent = [];
  const send = async (text) => { sent.push(text); return true; };

  // no file for yesterday → one nudge naming the date and the fix
  const r1 = await runMissedPushSentinel({ now: at(10, 0), send });
  assert.equal(r1.nudged, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0], new RegExp(yesterdayLocal(at(10, 0))));
  assert.match(sent[0], /Run Immediately/);
  assert.match(sent[0], /can't tell from here whether the Mac was awake/, 'no log evidence → never invents a cause');

  // second tick same day → silence (once per day)
  const r2 = await runMissedPushSentinel({ now: at(10, 2), send });
  assert.equal(r2.nudged, false);
  assert.equal(sent.length, 1);

  // when the file exists, the sentinel has nothing to say
  const hd = path.join(process.env.NOVA_DATA_DIR, 'health');
  await mkdir(hd, { recursive: true });
  await writeFile(path.join(hd, `${yesterdayLocal(at(10, 0))}.json`), '{"steps":1,"stepsComplete":true}', 'utf8');
  await rm(path.join(hd, 'sentinel.json'), { force: true });
  const r3 = await runMissedPushSentinel({ now: at(10, 4), send });
  assert.equal(r3.nudged, false, 'a day that closed properly is silent');
  assert.equal(sent.length, 1);
});

test('a stale partial nudges with the number in the message — the 11 Aug silence, closed', async () => {
  const { mkdir: mk, writeFile: wf, rm: rmf } = await import('node:fs/promises');
  const hd = path.join(process.env.NOVA_DATA_DIR, 'health');
  await mk(hd, { recursive: true });
  const yday = yesterdayLocal(at(10, 0));
  await wf(path.join(hd, `${yday}.json`), JSON.stringify({ date: yday, steps: 813, stepsComplete: false }), 'utf8');
  await rmf(path.join(hd, 'sentinel.json'), { force: true });
  // a request log with a line inside the midnight window = evidence the Mac was up
  const logPath = path.join(process.env.NOVA_DATA_DIR, 'req.log');
  const midnight = at(0, 7);
  await wf(logPath, `req ${midnight.toISOString()} GET /api/snapshot ← 127.0.0.1 → 200 in 5ms\n`, 'utf8');
  process.env.NOVA_REQLOG = logPath;
  const sent = [];
  const r = await runMissedPushSentinel({ now: at(10, 0), send: async (t) => { sent.push(t); return true; } });
  process.env.NOVA_REQLOG = path.join(process.env.NOVA_DATA_DIR, 'absent.log');
  assert.equal(r.nudged, true);
  assert.match(sent[0], /midday partial \(813 steps\)/, 'names the stale figure he can check against Health');
  assert.match(sent[0], /never left the phone/, 'log evidence present → names the real cause');
});

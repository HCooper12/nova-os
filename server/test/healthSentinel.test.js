// The missed-push sentinel: nudges once, after 09:00 local, only when
// yesterday's health file is genuinely absent — and records the nudge so a
// 2-minute tick can call it freely. Temp data dir BEFORE imports.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-sentinel-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { shouldNudge, runMissedPushSentinel, yesterdayLocal } = await import('../lib/healthSentinel.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };

test('shouldNudge: after 09:00, only when the file is missing, once per day', () => {
  assert.equal(shouldNudge(at(8, 59), { hasYesterdayFile: false, lastNudgeDay: null }), false, 'too early');
  assert.equal(shouldNudge(at(9, 0), { hasYesterdayFile: false, lastNudgeDay: null }), true, '09:00 opens it');
  assert.equal(shouldNudge(at(9, 0), { hasYesterdayFile: true, lastNudgeDay: null }), false, 'data landed — silence');
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
  assert.match(sent[0], /can't tell which from here/, 'never invents a cause it cannot see');

  // second tick same day → silence (once per day)
  const r2 = await runMissedPushSentinel({ now: at(10, 2), send });
  assert.equal(r2.nudged, false);
  assert.equal(sent.length, 1);

  // when the file exists, the sentinel has nothing to say
  const hd = path.join(process.env.NOVA_DATA_DIR, 'health');
  await mkdir(hd, { recursive: true });
  await writeFile(path.join(hd, `${yesterdayLocal(at(10, 0))}.json`), '{"steps":1}', 'utf8');
  await rm(path.join(hd, 'sentinel.json'), { force: true });
  const r3 = await runMissedPushSentinel({ now: at(10, 4), send });
  assert.equal(r3.nudged, false);
  assert.equal(sent.length, 1);
});

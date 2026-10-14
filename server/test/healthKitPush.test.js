// Nova's own Apple Health reader (ios/App/App/NovaHealthPlugin.swift, his call
// 14 Oct 2026) sends exact calendar days. The before-4am shift that files a
// midnight Shortcut's "today" under yesterday must NOT move them.
process.env.TZ = 'Australia/Sydney';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-hk-'));
process.env.NOVA_DATA_DIR = dataDir;

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { healthDataRouter } = await import('../routes/healthData.js');
const { loadDay, readPushLog } = await import('../lib/healthData.js');

test.after(async () => { mock.timers.reset(); await rm(dataDir, { recursive: true, force: true }); });

async function post(body) {
  const app = express();
  app.use(express.json());
  app.use('/api', healthDataRouter(dataDir));
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  } finally { server.close(); }
}

test('at 00:30 a HealthKit reading for today stays on today; a Shortcut one moves to yesterday', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-15T00:30:00+11:00') });
  try {
    const hk = await post({ date: '2026-10-15', metrics: { steps: 120 }, source: 'healthkit' });
    assert.equal(hk.status, 200);
    assert.equal((await loadDay('2026-10-15'))?.steps, 120, 'filed on the day it was read for');

    const sc = await post({ date: '2026-10-15', steps: 9000 });
    assert.equal(sc.status, 200);
    assert.equal((await loadDay('2026-10-14'))?.steps, 9000, 'the Shortcut path keeps its midnight shift');
  } finally { mock.timers.reset(); }
});

test('a HealthKit push is receipted as healthkit, and "source" is never mistaken for a metric', async () => {
  const r = await post({ date: '2026-10-10', metrics: { steps: 9908, hrv: 83.1, restingHeartRate: 53 }, source: 'healthkit' });
  assert.equal(r.status, 200);
  const day = await loadDay('2026-10-10');
  assert.equal(day.steps, 9908);
  assert.equal(day.hrv, 83.1);
  assert.equal(day.source, undefined);
  const last = (await readPushLog()).at(-1);
  assert.equal(last.source, 'healthkit');
});

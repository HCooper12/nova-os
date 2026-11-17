// Handoff: life, exclusion of the caller's own device, bad kind, both doors.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-handoff-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const H = await import('../lib/handoff.js');
const doorLib = await import('../lib/wristDoor.js');
const { handoffRouter, wristHandoffRouter } = await import('../routes/handoff.js');

let t = 5_000_000;
let main; let mainBase; let door; let doorBase; let token;
test.before(async () => {
  H.setHandoffClock(() => t);
  const app = express();
  app.use(express.json());
  app.use('/api', handoffRouter());
  main = app.listen(0, '127.0.0.1');
  await new Promise((r) => main.once('listening', r));
  mainBase = `http://127.0.0.1:${main.address().port}/api`;
  doorLib._resetWristDoorForTests();
  door = doorLib.createWristDoorApp({ routers: [wristHandoffRouter()] }).listen(0, '127.0.0.1');
  await new Promise((r) => door.once('listening', r));
  doorBase = `http://127.0.0.1:${door.address().port}`;
  const p = doorLib.startPairing({ name: 'Series 7' });
  doorLib.approvePairing(p.code);
  token = (await doorLib.claimPairing({ pairingId: p.pairingId, secret: p.secret })).token;
});
test.after(async () => {
  main?.close(); door?.close();
  await doorLib._flushForTests?.();
  await rm(dataDir, { recursive: true, force: true });
});
test.beforeEach(() => { H._resetHandoffForTests(); H.setHandoffClock(() => t); });

const j = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const wristPost = (b) => j(`${doorBase}/wrist/handoff`, b, { Authorization: `Bearer ${token}` });
const wristGet = async () => (await (await fetch(`${doorBase}/wrist/handoff`, { headers: { Authorization: `Bearer ${token}` } })).json()).handoff;
const phoneGet = async () => (await (await fetch(`${mainBase}/handoff`)).json()).handoff;

test('watch to phone and phone to watch, never your own', async () => {
  assert.equal(await phoneGet(), null);
  assert.deepEqual(await (await wristPost({ kind: 'talk', title: '  How is my protein  ' })).json(), { ok: true });
  assert.equal(await wristGet(), null); // not offered back to the device that set it
  const seen = await phoneGet();
  assert.equal(seen.kind, 'talk');
  assert.equal(seen.title, 'How is my protein');
  assert.equal(seen.deviceName, 'Series 7');

  assert.deepEqual(await (await j(`${mainBase}/handoff`, { kind: 'fuel', title: 'Logging breakfast' })).json(), { ok: true });
  const onWatch = await wristGet();
  assert.equal(onWatch.kind, 'fuel');
  assert.equal(onWatch.device, 'phone');
  assert.equal((await phoneGet()).kind, 'talk'); // phone still sees only the watch's
});

test('records live 10 minutes, the newest other device wins, title is capped', async () => {
  await wristPost({ kind: 'talk', title: 'x'.repeat(300) });
  assert.equal((await phoneGet()).title.length, 120);
  t += H.HANDOFF_TTL_MS - 1;
  assert.ok(await phoneGet());
  t += 2;
  assert.equal(await phoneGet(), null);
});

test('bad kind is 400 on both doors and writes nothing', async () => {
  let r = await wristPost({ kind: 'train', title: 'x' });
  assert.equal(r.status, 400);
  r = await j(`${mainBase}/handoff`, { kind: '', title: 'x' });
  assert.equal(r.status, 400);
  assert.equal(await phoneGet(), null);
  assert.equal(await wristGet(), null);
});

test('the door refuses a handoff without a watch token', async () => {
  const r = await j(`${doorBase}/wrist/handoff`, { kind: 'talk', title: 'x' });
  assert.equal(r.status, 401);
});

test('newest of several other devices is the one offered', () => {
  H.setHandoff({ device: 'w1', kind: 'talk', title: 'older' });
  t += 1000;
  H.setHandoff({ device: 'w2', kind: 'fuel', title: 'newer' });
  assert.equal(H.handoffFor('phone').title, 'newer');
  assert.equal(H.handoffFor('w2').title, 'older');
});

// The wrist's talk lane: the door forwards to the spoken lane and adds nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

let dir; let upstream; let door; let doorUrl; let token; const seen = [];
const MAIN = 'main-token-never-leaves';

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'nova-wrist-ask-'));
  process.env.NOVA_DATA_DIR = dir;
  // a stand-in for the spoken lane: records what arrived, answers like it
  upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ url: req.url, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/ask/audio') return res.end(JSON.stringify({ text: 'Logged.', heard: 'log my oats' }));
      // the keepalive drip a slow answer carries in front of its JSON
      res.write(' ');
      setTimeout(() => res.end(JSON.stringify({ text: `You said: ${JSON.parse(body.toString()).question}`, sessionId: 's1' })), 20);
    });
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const doorLib = await import('../lib/wristDoor.js');
  const { wristAskRouter } = await import('../routes/wristAsk.js');
  doorLib._resetWristDoorForTests();
  const app = doorLib.createWristDoorApp({ routers: [wristAskRouter({ port: upstream.address().port, token: MAIN })] });
  door = app.listen(0, '127.0.0.1');
  await new Promise((r) => door.once('listening', r));
  doorUrl = `http://127.0.0.1:${door.address().port}`;
  const p = doorLib.startPairing({ name: 'Series 7' });
  doorLib.approvePairing(p.code);
  token = (await doorLib.claimPairing({ pairingId: p.pairingId, secret: p.secret })).token;
});

after(async () => {
  door?.close(); upstream?.close();
  const doorLib = await import('../lib/wristDoor.js');
  await doorLib._flushForTests?.();
  await rm(dir, { recursive: true, force: true });
});

const post = (p, { body, type = 'application/json', auth = token } = {}) => fetch(`${doorUrl}${p}`, {
  method: 'POST', headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': type }, body,
});

test('a watch question reaches the spoken lane labelled watch and the answer comes back whole', async () => {
  seen.length = 0;
  const r = await post('/wrist/ask', { body: JSON.stringify({ question: '  how is my protein  ' }) });
  assert.equal(r.status, 200);
  const out = JSON.parse(await r.text()); // tolerant of the drip in front
  assert.deepEqual(out, { text: 'You said: how is my protein', sessionId: 's1' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, '/api/ask/sync');
  assert.equal(seen[0].headers['x-nova-via'], 'watch');
  assert.equal(seen[0].headers.authorization, `Bearer ${MAIN}`);
  assert.equal(decodeURIComponent(seen[0].headers['x-nova-device']), 'Series 7');
});

test('the main token never comes back to the watch', async () => {
  const r = await post('/wrist/ask', { body: JSON.stringify({ question: 'hello there' }) });
  const raw = await r.text();
  assert.ok(!raw.includes(MAIN));
  assert.ok(![...r.headers.values()].some((v) => v.includes(MAIN)));
});

test('no token, the main token, or no words: nothing is forwarded', async () => {
  seen.length = 0;
  assert.equal((await post('/wrist/ask', { body: JSON.stringify({ question: 'x' }), auth: null })).status, 401);
  assert.equal((await post('/wrist/ask', { body: JSON.stringify({ question: 'x' }), auth: MAIN })).status, 401);
  assert.equal((await post('/wrist/ask', { body: JSON.stringify({ question: '   ' }) })).status, 400);
  assert.equal((await post('/wrist/ask/audio', { body: Buffer.from('abc'), type: 'audio/mp4', auth: null })).status, 401);
  assert.equal(seen.length, 0);
});

test('a recording is passed through byte for byte with its type, and what was heard rides back', async () => {
  seen.length = 0;
  const clip = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
  const r = await post('/wrist/ask/audio', { body: clip, type: 'audio/mp4' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: 'Logged.', heard: 'log my oats' });
  assert.equal(seen[0].url, '/api/ask/audio');
  assert.equal(seen[0].headers['content-type'], 'audio/mp4');
  assert.equal(seen[0].headers['x-nova-via'], 'watch');
  assert.ok(seen[0].body.equals(clip));
});

test('a recording past the limit is refused before it reaches Nova', async () => {
  seen.length = 0;
  const r = await post('/wrist/ask/audio', { body: Buffer.alloc(7 * 1024 * 1024, 1), type: 'audio/mp4' });
  assert.equal(r.status, 413);
  assert.equal(seen.length, 0);
});

test('the spoken lane being down is said in words, not a bare failure', async () => {
  const doorLib = await import('../lib/wristDoor.js');
  const { wristAskRouter } = await import('../routes/wristAsk.js');
  const app = doorLib.createWristDoorApp({ routers: [wristAskRouter({ port: 1, token: MAIN })] });
  const s = app.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/wrist/ask`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'are you there' }) });
  const out = await r.json();
  s.close();
  assert.equal(out.text, 'Nova on your Mac did not answer the door.');
  assert.match(out.error, /unreachable/);
  assert.ok(!JSON.stringify(out).includes(MAIN));
});

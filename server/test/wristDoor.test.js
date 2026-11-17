// THE WRIST DOOR'S GUARD (server/lib/wristDoor.js, routes/wristPair.js).
// These pin: pairing start -> pending -> approve -> one token, once; the
// token opens a protected router and nothing else does (not the main
// API_TOKEN, not a revoked device, not a wrong secret, not an expired
// pairing); the pending cap and the approve lockout; the limiter's 429 and
// its recovery; no raw token on disk; 404 and a stackless 500.
//
// NOVA_DATA_DIR is set BEFORE any import (the 30-fake-greetings lesson).
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-wrist-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.API_TOKEN = 'main-full-access-token-for-the-test';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const W = await import('../lib/wristDoor.js');
const { wristPairOwnerRouter } = await import('../routes/wristPair.js');

let t0 = Date.parse('2026-11-17T00:00:00Z');
let nowMs = t0;
function reset() {
  W._resetWristDoorForTests();
  nowMs = t0 += 86_400_000; // a fresh day per test, so stored lastSeenAt never collides
  W.setClock(() => nowMs);
}

// a dummy protected wrist router, plus one that throws
function protectedRouter() {
  const r = express.Router();
  r.get('/wrist/me', (req, res) => res.json({ device: req.wristDevice }));
  r.get('/wrist/boom', () => { throw new Error('secret internal detail /Users/x'); });
  return r;
}

async function door() {
  const app = W.createWristDoorApp({ routers: [protectedRouter()] });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, { body, token } = {}) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, json, text, headers: r.headers };
  };
  return { server, call };
}

// the owner side, as the main app would mount it
async function owner() {
  const app = express();
  app.use(express.json());
  app.use('/api', wristPairOwnerRouter());
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
  };
  return { server, call };
}

async function pairOne(d, o, name = 'Hayden watch') {
  const s = await d.call('POST', '/wrist/pair/start', { body: { name } });
  assert.equal(s.status, 200);
  const a = await o.call('POST', '/wrist/pair/approve', { code: s.json.code });
  assert.equal(a.status, 200);
  const c = await d.call('POST', '/wrist/pair/claim', { body: { pairingId: s.json.pairingId, secret: s.json.secret } });
  assert.equal(c.status, 200);
  return c.json;
}

test('happy path: start, claim pending, approve, claim once, second claim refused; token opens a protected route', async () => {
  reset();
  const d = await door();
  const o = await owner();
  try {
    const s = await d.call('POST', '/wrist/pair/start', { body: { name: '  Hayden\u0007 watch  ' } });
    assert.equal(s.status, 200);
    assert.match(s.json.code, /^\d{6}$/);
    assert.match(s.json.secret, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(s.json.expiresAt, new Date(nowMs + 5 * 60_000).toISOString());
    assert.equal(s.headers.get('cache-control'), 'no-store');
    assert.equal(s.headers.get('x-powered-by'), null);

    const claim = () => d.call('POST', '/wrist/pair/claim', { body: { pairingId: s.json.pairingId, secret: s.json.secret } });
    assert.deepEqual((await claim()).json, { pending: true });

    const a = await o.call('POST', '/wrist/pair/approve', { code: s.json.code });
    assert.deepEqual(a.json, { approved: true, name: 'Hayden watch' });

    const c = await claim();
    assert.equal(c.status, 200);
    assert.match(c.json.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(c.json.name, 'Hayden watch');

    const again = await claim();
    assert.equal(again.status, 403);
    assert.deepEqual(again.json, { error: 'That pairing is not valid.' });

    const me = await d.call('GET', '/wrist/me', { token: c.json.token });
    assert.equal(me.status, 200);
    assert.deepEqual(me.json, { device: { id: c.json.deviceId, name: 'Hayden watch' } });

    const list = await o.call('GET', '/wrist/devices');
    assert.equal(list.json.devices.length, 1); // the first test, so the store starts empty
    assert.deepEqual(Object.keys(list.json.devices[0]).sort(), ['createdAt', 'id', 'lastSeenAt', 'name', 'revokedAt']);
    assert.ok(list.json.devices[0].lastSeenAt, 'the authenticated call marked it seen');

    // the store file holds only the hash, never the raw token or secret
    await W._flushForTests();
    const raw = await readFile(path.join(dataDir, 'wrist-devices.json'), 'utf8');
    assert.ok(!raw.includes(c.json.token));
    assert.ok(!raw.includes(s.json.secret));
    assert.match(raw, /"tokenHash": "[0-9a-f]{64}"/);
  } finally { d.server.close(); o.server.close(); }
});

test('the main API_TOKEN, no token, and a junk token are all refused', async () => {
  reset();
  const d = await door();
  const o = await owner();
  try {
    await pairOne(d, o); // a real device exists, so refusal is not just an empty store
    for (const token of [process.env.API_TOKEN, undefined, 'x'.repeat(43), 'y'.repeat(500)]) {
      const r = await d.call('GET', '/wrist/me', { token });
      assert.equal(r.status, 401);
      assert.deepEqual(r.json, { error: 'unauthorized' });
    }
  } finally { d.server.close(); o.server.close(); }
});

test('a revoked device is refused; revoking an unknown id is 404', async () => {
  reset();
  const d = await door();
  const o = await owner();
  try {
    const c = await pairOne(d, o);
    assert.equal((await d.call('GET', '/wrist/me', { token: c.token })).status, 200);
    const del = await o.call('DELETE', `/wrist/devices/${c.deviceId}`);
    assert.deepEqual(del.json, { revoked: true });
    assert.equal((await d.call('GET', '/wrist/me', { token: c.token })).status, 401);
    assert.equal((await o.call('DELETE', '/wrist/devices/w_nope')).status, 404);
    const list = await o.call('GET', '/wrist/devices');
    assert.ok(list.json.devices.find((x) => x.id === c.deviceId).revokedAt);
  } finally { d.server.close(); o.server.close(); }
});

test('a wrong secret, an unknown id and an expired pairing are all the same refusal', async () => {
  reset();
  const d = await door();
  const o = await owner();
  try {
    const s = await d.call('POST', '/wrist/pair/start', { body: {} });
    await o.call('POST', '/wrist/pair/approve', { code: s.json.code });
    const wrong = await d.call('POST', '/wrist/pair/claim', { body: { pairingId: s.json.pairingId, secret: 'not-the-secret' } });
    assert.equal(wrong.status, 403);
    const unknown = await d.call('POST', '/wrist/pair/claim', { body: { pairingId: 'nope', secret: s.json.secret } });
    assert.equal(unknown.status, 403);
    assert.deepEqual(wrong.json, unknown.json);
    const missing = await d.call('POST', '/wrist/pair/claim', { body: {} });
    assert.equal(missing.status, 403);

    // the right secret still works after wrong guesses, until it expires
    const s2 = await d.call('POST', '/wrist/pair/start', { body: {} });
    await o.call('POST', '/wrist/pair/approve', { code: s2.json.code });
    nowMs += 5 * 60_000 + 1;
    const late = await d.call('POST', '/wrist/pair/claim', { body: { pairingId: s2.json.pairingId, secret: s2.json.secret } });
    assert.equal(late.status, 403);
    assert.deepEqual(late.json, { error: 'That pairing is not valid.' });
    // an expired code cannot be approved either
    const lateApprove = await o.call('POST', '/wrist/pair/approve', { code: s2.json.code });
    assert.equal(lateApprove.status, 400);
  } finally { d.server.close(); o.server.close(); }
});

test('a 4th live pending is refused; one expiring frees a slot', () => {
  reset();
  const codes = new Set();
  for (let i = 0; i < 3; i += 1) codes.add(W.startPairing({ name: `w${i}` }).code);
  assert.equal(codes.size, 3, 'codes are unique among live pendings');
  assert.throws(() => W.startPairing({}), (e) => e.code === 'too_many_pending');
  nowMs += 5 * 60_000;
  assert.ok(W.startPairing({}).code);
});

test('name: trimmed, capped at 40, defaulted', () => {
  reset();
  assert.equal(W.cleanName(undefined), 'Apple Watch');
  assert.equal(W.cleanName('   '), 'Apple Watch');
  assert.equal(W.cleanName('a'.repeat(100)).length, 40);
  assert.equal(W.cleanName(' Left\u202ewrist '), 'Leftwrist');
});

test('approve locks for 10 minutes after 5 wrong codes and clears every pending', async () => {
  reset();
  const o = await owner();
  try {
    const p = W.startPairing({});
    const wrong = p.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i += 1) assert.equal((await o.call('POST', '/wrist/pair/approve', { code: wrong })).status, 400);
    assert.equal((await o.call('POST', '/wrist/pair/approve', { code: 'abc' })).status, 400); // the 5th wrong
    const locked = await o.call('POST', '/wrist/pair/approve', { code: p.code });
    assert.equal(locked.status, 429);
    assert.equal(locked.headers.get('retry-after'), '600');
    await assert.rejects(W.claimPairing({ pairingId: p.pairingId, secret: p.secret }), (e) => e.code === 'bad_claim');
    nowMs += 10 * 60_000;
    const p2 = W.startPairing({});
    assert.deepEqual(W.approvePairing(p2.code), { approved: true, name: 'Apple Watch' });
  } finally { o.server.close(); }
});

test('wrong codes spread over more than 10 minutes do not lock', () => {
  reset();
  const p = W.startPairing({});
  const wrong = p.code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 4; i += 1) assert.throws(() => W.approvePairing(wrong), (e) => e.code === 'bad_code');
  nowMs += 10 * 60_000 + 1;
  for (let i = 0; i < 4; i += 1) assert.throws(() => W.approvePairing(wrong), (e) => e.code === 'bad_code');
  const p2 = W.startPairing({});
  assert.equal(W.approvePairing(p2.code).approved, true);
});

test('limiter: 429 with Retry-After past the limit, recovers after the window', async () => {
  reset();
  let t = 1_000_000;
  const app = express();
  app.use(W.rateLimit({ windowMs: 60_000, max: 2, now: () => t }));
  app.get('/x', (req, res) => res.json({ ok: true }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/x`;
  try {
    assert.equal((await fetch(url)).status, 200);
    t += 10_000;
    assert.equal((await fetch(url)).status, 200);
    const r = await fetch(url);
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '50');
    assert.deepEqual(await r.json(), { error: 'Too many requests. Try again in a minute.' });
    t += 50_000;
    assert.equal((await fetch(url)).status, 200);
  } finally { server.close(); }
});

test('limiter: the table is bounded and fails closed when full', () => {
  let t = 0;
  let k = 0;
  const mw = W.rateLimit({ windowMs: 1000, max: 5, maxKeys: 3, key: () => `k${k}`, now: () => t });
  const res = () => ({ code: 0, headers: {}, set(h, v) { this.headers[h] = v; }, status(c) { this.code = c; return this; }, json() { return this; } });
  for (k = 0; k < 3; k += 1) { let passed = false; mw({}, res(), () => { passed = true; }); assert.ok(passed); }
  const full = res();
  mw({}, full, () => assert.fail('a new key past the cap must not pass'));
  assert.equal(full.code, 429);
  t += 1000; // windows expire, so pruning makes room
  let passed = false;
  mw({}, res(), () => { passed = true; });
  assert.ok(passed);
  assert.ok(mw.size() <= 3);
});

test('clientIp: a non-loopback peer ignores X-Forwarded-For; loopback takes its LAST entry', () => {
  const req = (peer, xff) => ({ socket: { remoteAddress: peer }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(W.clientIp(req('203.0.113.9', '1.1.1.1')), '203.0.113.9');
  assert.equal(W.clientIp(req('127.0.0.1', '6.6.6.6, 198.51.100.7')), '198.51.100.7');
  assert.equal(W.clientIp(req('::1', '198.51.100.8')), '198.51.100.8');
  assert.equal(W.clientIp(req('::ffff:127.0.0.1')), '::ffff:127.0.0.1');
});

test('unknown path is 404; health says only ok; a thrown error is a stackless 500', async () => {
  reset();
  const d = await door();
  const o = await owner();
  try {
    assert.deepEqual((await d.call('GET', '/wrist/health')).json, { ok: true });
    const c = await pairOne(d, o);
    const nf = await d.call('GET', '/wrist/nothing-here', { token: c.token });
    assert.equal(nf.status, 404);
    assert.deepEqual(nf.json, { error: 'not found' });
    // unauthenticated unknown paths are refused at the gate, never mapped
    assert.equal((await d.call('GET', '/api/health')).status, 401);
    const boom = await d.call('GET', '/wrist/boom', { token: c.token });
    assert.equal(boom.status, 500);
    assert.equal(boom.text, JSON.stringify({ error: 'server error' }));
    // a malformed body is a plain 400, not a parser message
    const bad = await fetch(`http://127.0.0.1:${d.server.address().port}/wrist/pair/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: 'bad request' });
  } finally { d.server.close(); o.server.close(); }
});

test('the per-device limit holds at 60 a minute', async () => {
  reset();
  const d = await door();
  const o = await owner();
  try {
    const c = await pairOne(d, o);
    let last;
    for (let i = 0; i < 61; i += 1) last = await d.call('GET', '/wrist/me', { token: c.token });
    assert.equal(last.status, 429);
    nowMs += 60_000;
    assert.equal((await d.call('GET', '/wrist/me', { token: c.token })).status, 200);
  } finally { d.server.close(); o.server.close(); }
});

test('pairing is shut until he opens it, shuts again on approve, and a shut door starts nothing', async () => {
  const door = await import('../lib/wristDoor.js');
  door._resetWristDoorForTests();
  let t = 1_800_000_000_000;
  door.setClock(() => t);
  door.closePairingWindow();
  assert.throws(() => door.startPairing({ name: 'x' }), (e) => e.code === 'closed');
  door.openPairingWindow();
  const p = door.startPairing({ name: 'x' });
  assert.equal(door.approvePairing(p.code).approved, true);
  assert.throws(() => door.startPairing({ name: 'y' }), (e) => e.code === 'closed');
  // the approved watch can still claim after the window shut
  assert.ok((await door.claimPairing({ pairingId: p.pairingId, secret: p.secret })).token);
  door.openPairingWindow();
  t += door.PAIR_WINDOW_MS + 1;
  assert.throws(() => door.startPairing({ name: 'z' }), (e) => e.code === 'closed');
  door._resetWristDoorForTests();
});

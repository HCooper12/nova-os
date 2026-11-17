// THE WRIST DOOR'S GUARD (17 Nov 2026). His Apple Watch must reach Nova with
// the phone left behind. The watch is not on the tailnet, so a SECOND
// listener (not the main one on 4173) will be exposed to the public internet
// through Tailscale Funnel. This file is that listener's guard:
//
//   - per-device tokens: 32 random bytes, shown to the watch once, stored
//     only as a sha256 hash in <data dir>/wrist-devices.json
//   - a device-code pairing flow: the watch starts it and shows a 6-digit
//     code, he types that code into the MAIN (authenticated) app, the watch
//     claims its token with a secret only it knows
//   - in-memory rate limits with bounded memory that fail closed
//   - createWristDoorApp(): the whole door assembled in a fixed order
//
// The main API_TOKEN is NEVER accepted here. Only a device token, minted by
// a pairing he approved, opens this door.
//
// Pending pairings live in memory only and are lost on restart by design: a
// restart in the middle of pairing means the watch starts again.
import express from 'express';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// a cycle, but only used inside createWristDoorApp at call time, so safe in ESM
import { wristPairPublicRouter } from '../routes/wristPair.js';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = () => path.join(dataRoot(), 'wrist-devices.json');

export const PAIR_TTL_MS = 5 * 60_000;
export const MAX_PENDING = 3;
export const APPROVE_MAX_WRONG = 5;
export const APPROVE_WRONG_WINDOW_MS = 10 * 60_000;
export const APPROVE_LOCK_MS = 10 * 60_000;
export const LAST_SEEN_EVERY_MS = 60_000;
export const NAME_MAX = 40;
const DEFAULT_NAME = 'Apple Watch';
// a bearer longer than this is not one of ours; refuse before hashing
const TOKEN_MAX_LEN = 200;

/* --------------------------------------------------------------- clock -- */

// One clock for the whole door so tests can move time without sleeping.
let clock = () => Date.now();
export function setClock(fn) { clock = typeof fn === 'function' ? fn : () => Date.now(); }
const now = () => clock();
const iso = (ms) => new Date(ms).toISOString();

/* ------------------------------------------------------------- helpers -- */

const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest();
const token32 = () => randomBytes(32).toString('base64url');

function wristError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// The name comes from the public internet and is shown in his app: strip
// control characters, collapse whitespace, cap the length.
export function cleanName(name) {
  if (typeof name !== 'string') return DEFAULT_NAME;
  // eslint-disable-next-line no-control-regex
  const s = name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return s || DEFAULT_NAME;
}

/* -------------------------------------------------------- device store -- */

let store = null; // { devices: [...] }
let loadedFrom = null;
let loading = null;

async function load() {
  const file = FILE();
  if (store && loadedFrom === file) return store;
  if (loading && loadedFrom === file) return loading;
  loadedFrom = file;
  loading = (async () => {
    let next = { devices: [] };
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      if (raw && Array.isArray(raw.devices)) {
        next = { devices: raw.devices.filter((d) => d && typeof d.id === 'string' && typeof d.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(d.tokenHash)) };
      }
    } catch (e) {
      // A missing file is an empty store. An unreadable one is ALSO an empty
      // store, which fails closed: no device is let in until he pairs again.
      if (e.code !== 'ENOENT') console.log(`wrist-devices.json could not be read (${e.message}); no wrist device is admitted until it is fixed or re-paired`);
    }
    store = next;
    loading = null;
    return store;
  })();
  return loading;
}

let saveChain = Promise.resolve();
function save() {
  const snapshot = JSON.stringify({ devices: store.devices }, null, 2);
  const file = FILE();
  saveChain = saveChain.then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, snapshot, { mode: 0o600 });
    await rename(tmp, file);
  }).catch((e) => { console.log(`wrist-devices.json write failed: ${e.message}`); });
  return saveChain;
}

const publicDevice = (d) => ({ id: d.id, name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt || null, revokedAt: d.revokedAt || null });

export async function listDevices() {
  const s = await load();
  return s.devices.map(publicDevice);
}

export async function revokeDevice(id) {
  const s = await load();
  const d = s.devices.find((x) => x.id === id);
  if (!d) return false;
  if (!d.revokedAt) {
    d.revokedAt = iso(now());
    await save();
  }
  return true;
}

async function createDevice(name) {
  const s = await load();
  const token = token32();
  const at = iso(now());
  const device = { id: `w_${randomBytes(8).toString('hex')}`, name, tokenHash: sha256(token).toString('hex'), createdAt: at, lastSeenAt: null, revokedAt: null };
  s.devices.push(device);
  await save();
  return { token, device };
}

// Finds the non-revoked device whose hash matches. Every stored hash is
// compared, match or not, so the time taken does not say which device (or
// whether an early one) matched.
async function deviceForToken(token) {
  const s = await load();
  const digest = sha256(token);
  let found = null;
  for (const d of s.devices) {
    const stored = Buffer.from(d.tokenHash, 'hex');
    const same = stored.length === digest.length && timingSafeEqual(stored, digest);
    if (same && !d.revokedAt && !found) found = d;
  }
  return found;
}

// lastSeenAt goes to disk at most once a minute per device
function touch(device) {
  const t = now();
  const last = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
  if (t - last < LAST_SEEN_EVERY_MS) return;
  device.lastSeenAt = iso(t);
  save();
}

/* -------------------------------------------------------- the auth gate -- */

export function wristAuth() {
  return async (req, res, next) => {
    try {
      const auth = req.headers.authorization || '';
      const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!provided || provided.length > TOKEN_MAX_LEN) return res.status(401).json({ error: 'unauthorized' });
      const device = await deviceForToken(provided);
      if (!device) return res.status(401).json({ error: 'unauthorized' });
      touch(device);
      req.wristDevice = { id: device.id, name: device.name };
      return next();
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  };
}

/* ------------------------------------------------------------- pairing -- */

const DUMMY_HASH = sha256('no pairing');
const pendings = new Map(); // pairingId -> { id, code, secretHash, name, ip, createdAt, expiresAt, approved }
let wrongApprovals = []; // timestamps of wrong codes
let approveLockedUntil = 0;

function prunePendings() {
  const t = now();
  for (const [id, p] of pendings) if (p.expiresAt <= t) pendings.delete(id);
}

function freshCode() {
  const live = new Set([...pendings.values()].map((p) => p.code));
  for (let i = 0; i < 50; i += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!live.has(code)) return code;
  }
  throw wristError('too_many_pending', 'Could not find a free pairing code.');
}

// THE PAIRING WINDOW. The door is on the public internet, so pairing is shut
// unless he has just opened it from his own (authenticated) Nova. Without this
// anyone online could keep all three pairing slots full and stop him pairing;
// with it the door offers a stranger nothing but /wrist/health.
export const PAIR_WINDOW_MS = 10 * 60_000;
let pairOpenUntil = 0;
export function openPairingWindow(ms = PAIR_WINDOW_MS) {
  pairOpenUntil = now() + Math.min(Math.max(Number(ms) || PAIR_WINDOW_MS, 60_000), 30 * 60_000);
  return { openUntil: iso(pairOpenUntil) };
}
export function closePairingWindow() { pairOpenUntil = 0; pendings.clear(); }
export const pairingOpen = () => now() < pairOpenUntil;

export function startPairing({ name, ip } = {}) {
  if (!pairingOpen()) throw wristError('closed', 'Pairing is closed.');
  prunePendings();
  if (pendings.size >= MAX_PENDING) throw wristError('too_many_pending', 'Too many pairings are waiting.');
  const t = now();
  const pairingId = randomBytes(16).toString('base64url');
  const secret = token32();
  const code = freshCode();
  pendings.set(pairingId, {
    id: pairingId,
    code,
    secretHash: sha256(secret),
    name: cleanName(name),
    ip: typeof ip === 'string' ? ip.slice(0, 64) : null,
    createdAt: t,
    expiresAt: t + PAIR_TTL_MS,
    approved: false,
  });
  return { pairingId, code, secret, expiresAt: iso(t + PAIR_TTL_MS) };
}

export function approvePairing(code) {
  const t = now();
  if (approveLockedUntil > t) throw wristError('locked', 'Too many wrong codes.');
  prunePendings();
  const want = typeof code === 'string' || typeof code === 'number' ? String(code).replace(/\s+/g, '') : '';
  const match = /^\d{6}$/.test(want) ? [...pendings.values()].find((p) => p.code === want) : null;
  if (!match) {
    wrongApprovals = wrongApprovals.filter((w) => t - w < APPROVE_WRONG_WINDOW_MS);
    wrongApprovals.push(t);
    if (wrongApprovals.length >= APPROVE_MAX_WRONG) {
      pendings.clear();
      wrongApprovals = [];
      approveLockedUntil = t + APPROVE_LOCK_MS;
    }
    throw wristError('bad_code', 'That code is not valid or has expired.');
  }
  match.approved = true;
  pairOpenUntil = 0; // one watch per opening: the window shuts the moment he approves
  return { approved: true, name: match.name };
}

export async function claimPairing({ pairingId, secret } = {}) {
  prunePendings();
  const p = typeof pairingId === 'string' ? pendings.get(pairingId) : null;
  // hash whatever was sent so a bad id and a bad secret cost the same
  const given = sha256(typeof secret === 'string' ? secret : '');
  const okSecret = timingSafeEqual(given, p ? p.secretHash : DUMMY_HASH) && !!p;
  if (!p || !okSecret) throw wristError('bad_claim', 'That pairing is not valid.');
  if (!p.approved) return { pending: true };
  // delete BEFORE the disk write so a second claim racing this one cannot
  // mint a second device from the same approval
  pendings.delete(p.id);
  const { token, device } = await createDevice(p.name);
  return { token, deviceId: device.id, name: device.name };
}

/* -------------------------------------------------------- rate limiting -- */

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLoopback = (a) => typeof a === 'string' && (LOOPBACK.has(a) || /^::ffff:127\./.test(a) || /^127\./.test(a));

// WHICH ADDRESS THIS TRUSTS. The wrist listener binds to loopback and is
// reached only through tailscaled (`tailscale funnel` / `serve`), whose HTTP
// proxy is Go's httputil.ReverseProxy: it APPENDS the address it accepted the
// connection from to any X-Forwarded-For the client sent. So:
//   - peer (req.socket.remoteAddress) is NOT loopback: the header is never
//     read; the peer address is the key. A client cannot widen its limit.
//   - peer IS loopback (tailscaled): the LAST X-Forwarded-For entry is the
//     one tailscaled wrote. Earlier entries are client-supplied and ignored.
// ASSUMPTION, to verify on the real Funnel before go-live: tailscaled sets
// that last entry to the true public client address for Funnel traffic. If
// it instead writes a relay address, every watch shares one bucket (the
// limits still hold; they just become door-wide).
export function clientIp(req) {
  const peer = req.socket?.remoteAddress || '';
  if (!isLoopback(peer)) return peer || 'unknown';
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : (xff || '');
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last.length <= 64 ? last : peer;
}

const TOO_MANY = { error: 'Too many requests. Try again in a minute.' };

// Fixed window per key. Memory is bounded: expired windows are pruned, and if
// the table is still full a NEW key is refused (fail closed), never admitted.
export function rateLimit({ windowMs, max, key = clientIp, maxKeys = 10_000, now: nowFn } = {}) {
  if (!(windowMs > 0) || !(max > 0)) throw new Error('rateLimit needs a positive windowMs and max');
  const at = nowFn || now;
  const table = new Map(); // key -> { count, resetAt }
  let nextPrune = 0;
  const prune = (t) => { for (const [k, v] of table) if (v.resetAt <= t) table.delete(k); };
  const refuse = (res, ms) => {
    res.set('Retry-After', String(Math.max(1, Math.ceil(ms / 1000))));
    return res.status(429).json(TOO_MANY);
  };
  const mw = (req, res, next) => {
    const t = at();
    if (t >= nextPrune) { prune(t); nextPrune = t + windowMs; }
    let k;
    try { k = String(key(req) || 'unknown'); } catch { k = 'unknown'; }
    let slot = table.get(k);
    if (slot && slot.resetAt <= t) { table.delete(k); slot = null; }
    if (!slot) {
      if (table.size >= maxKeys) prune(t);
      if (table.size >= maxKeys) return refuse(res, windowMs);
      slot = { count: 0, resetAt: t + windowMs };
      table.set(k, slot);
    }
    slot.count += 1;
    if (slot.count > max) return refuse(res, slot.resetAt - t);
    return next();
  };
  mw.size = () => table.size;
  return mw;
}

/* ------------------------------------------------------------- the door -- */

export function createWristDoorApp({ routers = [], idempotency } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(rateLimit({ windowMs: 60_000, max: 120 }));
  app.use(express.json({ limit: '64kb' }));
  app.get('/wrist/health', (req, res) => res.json({ ok: true }));
  app.use(wristPairPublicRouter());
  app.use(wristAuth());
  app.use(rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.wristDevice?.id || 'none' }));
  if (idempotency) app.use(idempotency);
  for (const r of routers) app.use(r);
  app.use((req, res) => res.status(404).json({ error: 'not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // A malformed or oversized body is the client's fault: say so, in fixed
    // words, rather than calling it a server error. Nothing else leaks.
    if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).json({ error: 'too large' });
    if (err && err.status >= 400 && err.status < 500 && err.expose) return res.status(400).json({ error: 'bad request' });
    return res.status(500).json({ error: 'server error' });
  });
  return app;
}

/* ---------------------------------------------------------- test seams -- */

export function _resetWristDoorForTests() {
  pendings.clear();
  wrongApprovals = [];
  approveLockedUntil = 0;
  pairOpenUntil = Infinity; // the suite's older tests pair freely; the window has its own test
  store = null;
  loadedFrom = null;
  loading = null;
  clock = () => Date.now();
}
export const _flushForTests = () => saveChain;

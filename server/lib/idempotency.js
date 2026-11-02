// ONE WRITE, HOWEVER MANY TIMES IT IS SENT (2 Nov 2026, offline mode).
//
// The phone's Outbox replays a write when the Mac comes back. A write that
// timed out may still have landed (a slow Mac answered after the phone gave
// up), so the replay can be the SECOND copy of it. A workout session already
// guarded itself with a clientKey (workoutSessions.js); a meal, a capture, a
// shopping line, a journal line and a to-do did not, and each would file
// twice. Rather than teach every writer the trick one at a time, the client
// sends an `Idempotency-Key` header on every write it might send again, and
// this middleware answers a repeat of a key it has already completed with
// the SAME response, without running the handler a second time.
//
// Rules:
//   - only a request that carries a well-formed header is touched; everything else
//     passes through unchanged (the header is additive, not a contract change)
//   - only a 2xx answer is remembered: a rejection or a crash can be retried
//   - the key is scoped by method + path, so one key can never replay an
//     answer from a different route
//   - a repeat that arrives while the first is still running waits for it
//     rather than racing it
//   - remembered for 14 days, at most 2000 keys, kept in server/data (derived
//     operational state, never the vault)
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = () => path.join(dataRoot(), 'idempotency.json');
export const TTL_MS = 14 * 86400_000;
export const CAP = 2000;
const KEY_RE = /^[A-Za-z0-9._:-]{8,80}$/;

let store = null; // Map scope -> { status, body, at }
let loadedFrom = null;
const inFlight = new Map(); // scope -> Promise resolving when the first finishes

async function load() {
  const file = FILE();
  if (store && loadedFrom === file) return store;
  store = new Map();
  loadedFrom = file;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    for (const e of raw.entries || []) if (e && e.scope) store.set(e.scope, e);
  } catch { /* none yet, or unreadable: start empty — the worst case is the old behaviour */ }
  return store;
}

export function prune(entries, now = Date.now()) {
  return entries.filter((e) => now - e.at < TTL_MS).sort((a, b) => b.at - a.at).slice(0, CAP);
}

let saveChain = Promise.resolve();
function save() {
  saveChain = saveChain.then(async () => {
    const entries = prune([...store.values()]);
    store = new Map(entries.map((e) => [e.scope, e]));
    const file = FILE();
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ entries }), 'utf8');
    await rename(tmp, file);
  }).catch((e) => console.error('idempotency store save failed:', e.message));
  return saveChain;
}

export function idempotency() {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    // a key we cannot use is ignored, never a reason to refuse his write
    if (!KEY_RE.test(String(key))) return next();
    const scope = `${req.method} ${req.baseUrl || ''}${req.path} ${key}`;
    const known = await load();
    const waitFor = inFlight.get(scope);
    if (waitFor) await waitFor.catch(() => {});
    const done = known.get(scope);
    if (done && Date.now() - done.at < TTL_MS) {
      res.setHeader('Idempotent-Replay', 'true');
      return res.status(done.status).json(done.body);
    }
    let finish;
    inFlight.set(scope, new Promise((r) => { finish = r; }));
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        known.set(scope, { scope, status: res.statusCode, body, at: Date.now() });
        save();
      }
      return json(body);
    };
    res.on('close', () => { inFlight.delete(scope); finish(); });
    next();
  };
}

// test seam: forget the in-memory copy so a test can point NOVA_DATA_DIR elsewhere
export function _resetForTests() { store = null; loadedFrom = null; inFlight.clear(); saveChain = Promise.resolve(); }

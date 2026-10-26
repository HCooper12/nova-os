// Nova's local LLM client — a small instruct model on this Mac, served by
// one of two backends:
//   - OLLAMA (the default since 27 Oct 2026): `ollama serve` on 11434, the
//     native /api/chat. It was already installed and running here as a brew
//     launchd service, it handles Qwen3.5's chat template, tool calls and
//     thinking itself, and it unloads an idle model (`keep_alive`), which is
//     the headroom problem solving itself. design/LOCAL-NOVA-PLAN.md §3 has
//     the measurements that chose it.
//   - MLX (the original, 25 Sep): mlx_lm.server (OpenAI-compatible
//     /v1/chat/completions) from the MLX venv that powers the Kokoro TTS
//     sidecar (server/voice/env/, see lib/ttsLocal.js). Kept as the option:
//     NOVA_LOCAL_LLM_BACKEND=mlx.
// Every caller reads ONE shape whichever backend answered: the OpenAI
// message (content, tool_calls with `function.arguments` as a JSON string),
// because lib/localAsk.js and lib/textLane.js were written against it.
//
// Same idioms as ttsLocal.js on purpose: fileURLToPath (never URL.pathname —
// this repo's path has a space), liveness taken from the child's 'exit'
// event (a signal-killed process leaves exitCode === null, which reads as
// "still running" if you check exitCode instead — see ttsLocal.js's account
// of the thirteen-hour TTS silence), one shared in-flight boot so concurrent
// callers don't race to spawn a second server, and env overrides for every
// path/port so tests never spawn the real thing.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

/* -------------------------------- backend --------------------------------- */

/** 'ollama' (default) or 'mlx', read per call so a test can switch it. */
export function localBackend() {
  return String(process.env.NOVA_LOCAL_LLM_BACKEND || 'ollama').toLowerCase() === 'mlx' ? 'mlx' : 'ollama';
}

// A TEST RUN NEVER REACHES THE REAL OLLAMA (27 Oct 2026). Local-first made
// every `local: true` lane try this Mac before Claude, and the real Ollama
// answers on 11434 all day: without this, any of the ~500 suites that
// exercises an inbox capture or a journal prompt would quietly run the real
// model (seconds of GPU, and an answer no test controls). Under `node --test`
// (NODE_TEST_CONTEXT is set in every test child) the DEFAULTS are inert: the
// URL is a closed port, there is no binary, nothing spawns. A test that wants
// the Ollama path names its own stub with NOVA_OLLAMA_URL / NOVA_OLLAMA_BIN.
// Same lesson as the 30 fake greetings in his spoken log (memory: test data
// isolation): an unguarded default reaches the live thing.
const UNDER_TEST = () => !!process.env.NODE_TEST_CONTEXT;
const OLLAMA_URL = () => (process.env.NOVA_OLLAMA_URL || (UNDER_TEST() ? 'http://127.0.0.1:9' : 'http://127.0.0.1:11434')).replace(/\/+$/, '');
const OLLAMA_NO_SPAWN = () => process.env.NOVA_OLLAMA_NO_SPAWN === '1' || (UNDER_TEST() && !process.env.NOVA_OLLAMA_BIN);

// The binary: an explicit path, else `ollama` on PATH, else brew's. Read per
// call (a stat or two), so installing Ollama needs no restart.
function ollamaBin() {
  if (process.env.NOVA_OLLAMA_BIN) return existsSync(process.env.NOVA_OLLAMA_BIN) ? process.env.NOVA_OLLAMA_BIN : null;
  if (UNDER_TEST()) return null;
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, 'ollama');
    if (existsSync(p)) return p;
  }
  return existsSync('/opt/homebrew/bin/ollama') ? '/opt/homebrew/bin/ollama' : null;
}

// How long a loaded model stays resident after its last call. Ollama's own
// default is 5 min, which on 27 Oct meant every capture after a quiet spell
// paid a cold load; 30 min covers a working session and still gives the
// memory back overnight.
const KEEP_ALIVE = () => process.env.NOVA_LOCAL_LLM_KEEP_ALIVE || '30m';

// The context window. Ollama's default is 4096 tokens and the local Ask
// prompt alone is ~2.2k before his question and the vault pages a lookup
// hands back, so a chat turn asks for 8192. ONE size for every call, the
// preload included: Ollama reloads the runner whenever a request's num_ctx
// differs from the loaded one. Measured 27 Oct with 4096 for text lanes and
// 8192 for chat: every switch between a capture and an Ask paid a reload
// (a 0.4 s classify became 1.7 s, a 3.1 s tool call carried ~1.5 s of it),
// and /api/ps showed the runner flipping between the two sizes. An env
// value overrides it everywhere at once.
const NUM_CTX = (fallback) => {
  const v = Number(process.env.NOVA_LOCAL_LLM_NUM_CTX);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

// Shared with ttsLocal.js: one Python venv, one place it lives.
// read per call, so a test can point it at a scratch tree mid-run
const VOICE_DIR = () => process.env.NOVA_VOICE_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'voice');

const PORT = () => Number(process.env.NOVA_LOCAL_LLM_PORT || 4176);
const BASE = () => `http://127.0.0.1:${PORT()}`;

// How long a boot (server start + model load, including a first-time
// download of a multi-GB file over the network) is allowed before it is
// declared dead. Generous by default because a cold model pull can run long;
// override for tests so a stub sees a real deadline quickly.
const BOOT_TIMEOUT_MS = () => Number(process.env.NOVA_LOCAL_LLM_BOOT_TIMEOUT_MS || 600_000);

// How long a call that asked to wait for a boot (completeLocal's
// `waitForBoot`) will wait. The model is already downloaded on his Mac, so a
// load takes seconds; a cold download takes minutes and is not worth holding
// a capture for. Past this the call fails with a plain reason; the boot
// itself carries on in the background for the next call.
const WAIT_MS = () => Number(process.env.NOVA_LOCAL_LLM_WAIT_MS || 90_000);

// The swap a boot must leave alone (MLX backend only). On 19 Oct 2026 this
// Mac had 460 MB of swap free at a load average of 191; loading a 2.5 GB
// model then would have thrashed every other process on it, Nova's own
// server first.
const MIN_SWAP_FREE_MB = () => Number(process.env.NOVA_LOCAL_LLM_MIN_SWAP_FREE_MB || 1500);

/* ------------------------- what Ollama has (cached) ------------------------ */

// The board and the headroom guard are synchronous readers, and asking
// Ollama is not, so what it has pulled (/api/tags) and what it holds in
// memory right now (/api/ps) are a cached reading, refreshed by every status
// read (lib/modelPrefs.js refreshLocalStatus, every 30 s) and before every
// load. `reachable` is the last answer to "is anything listening".
let ollamaState = { reachable: false, models: [], loaded: [], at: null };

async function ollamaGet(route, timeoutMs = 1500) {
  const res = await fetch(`${OLLAMA_URL()}${route}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Ollama ${route} → ${res.status}`);
  return res.json();
}

/** Re-read what Ollama has pulled and loaded. Never throws: a server that
 *  is down reads as reachable false with the last lists cleared. */
export async function refreshOllama() {
  try {
    const tags = await ollamaGet('/api/tags');
    const models = (Array.isArray(tags?.models) ? tags.models : [])
      // an embedding model (nomic-embed-text is pulled here) cannot answer
      .filter((m) => !Array.isArray(m.capabilities) || m.capabilities.includes('completion'))
      .map((m) => ({ id: String(m.name || m.model || ''), sizeBytes: Number(m.size) || null }))
      .filter((m) => m.id);
    let loaded = [];
    try {
      const ps = await ollamaGet('/api/ps');
      loaded = (Array.isArray(ps?.models) ? ps.models : []).map((m) => String(m.name || m.model || '')).filter(Boolean);
    } catch { loaded = []; }
    ollamaState = { reachable: true, models, loaded, at: Date.now() };
  } catch {
    ollamaState = { reachable: false, models: [], loaded: [], at: Date.now() };
  }
  return ollamaState;
}

const sizeOf = (id) => ollamaState.models.find((m) => m.id === id)?.sizeBytes || null;
const isLoaded = (id) => ollamaState.loaded.includes(id);

/** The models Ollama has pulled that can answer: [{ id, sizeGB, name }].
 *  Empty on the MLX backend or when Ollama is not answering. */
export async function listLocalModels() {
  if (localBackend() !== 'ollama') return [];
  await refreshOllama();
  return cachedLocalModels();
}

/** The same list from the last reading, for a synchronous reader (the board). */
export function cachedLocalModels() {
  if (localBackend() !== 'ollama') return [];
  return ollamaState.models.map((m) => ({
    id: m.id,
    sizeGB: m.sizeBytes ? Math.round((m.sizeBytes / 1e9) * 10) / 10 : null,
    name: localModelName(m.id),
  }));
}

/* ------------------------------ memory headroom --------------------------- */

// Pure: `sysctl -n vm.swapusage` → { totalMB, freeMB }, or null when the text
// is not that shape. "total = 21504.00M  used = 21043.25M  free = 460.75M  (encrypted)"
// Read for the MLX backend only; see memoryHeadroom for why Ollama does not.
const toMB = (n, unit) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const u = String(unit || 'M').toUpperCase();
  return u === 'G' ? v * 1024 : u === 'K' ? v / 1024 : v;
};
export function parseSwapUsage(text) {
  const t = String(text || '');
  const free = t.match(/free\s*=\s*([\d.]+)\s*([KMG])?/i);
  if (!free) return null;
  const total = t.match(/total\s*=\s*([\d.]+)\s*([KMG])?/i);
  const freeMB = toMB(free[1], free[2]);
  if (freeMB == null) return null;
  return { totalMB: total ? toMB(total[1], total[2]) : null, freeMB };
}

/** Pure: `vm_stat` output → MB this Mac could hand a model now, or null when
 *  the text is not that shape. Free + inactive + speculative pages: inactive
 *  and speculative pages are file cache macOS gives up on demand, which is
 *  where the 9.6 GB "free" of 27 Oct mostly lived. */
export function parseVmStat(text) {
  const t = String(text || '');
  const pageSize = Number(t.match(/page size of (\d+) bytes/i)?.[1]);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return null;
  const pages = (label) => {
    const m = t.match(new RegExp(`Pages ${label}:\\s+(\\d+)`, 'i'));
    return m ? Number(m[1]) : null;
  };
  const free = pages('free');
  if (free == null) return null;
  const total = free + (pages('inactive') || 0) + (pages('speculative') || 0);
  return Math.round((total * pageSize) / (1024 * 1024));
}

/** What a model needs free before it loads, in MB: its file size × 1.15 +
 *  512 (the runner and its context), or, before Ollama has listed it, a floor
 *  by its parameter count. The 4B measured 3.1 GB resident on 27 Oct. */
export function memoryNeedMB(id, sizeBytes = null) {
  if (Number.isFinite(sizeBytes) && sizeBytes > 0) return Math.round((sizeBytes / (1024 * 1024)) * 1.15 + 512);
  const n = Number(String(id || '').match(/(\d+(?:\.\d+)?)b\b/i)?.[1]);
  if (!Number.isFinite(n)) return 4000;
  if (n <= 2) return 2000;
  if (n <= 4) return 3500;
  if (n <= 9) return 6000;
  // bigger than anything this Mac's tiers pick: 4-bit weights run ~0.6 GB
  // per billion parameters, so the floor grows with it rather than lying low
  return Math.round(n * 650 + 512);
}

const readSwapDefault = () => execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8', timeout: 2000 });
const readVmStatDefault = () => execFileSync('vm_stat', [], { encoding: 'utf8', timeout: 2000 });
let headroomOverride = null;
// Tests replace the whole reading (a function returning the headroom object)
// so ensureLocalModel can be driven without touching sysctl. null restores it.
export function _setHeadroomForTests(fn) { headroomOverride = fn || null; }

/** Is there memory to load the local model without thrashing this Mac?
 *  Returns { ok, freeMB, needMB, swapFreeMB, reason }.
 *
 *  OLLAMA: free memory (vm_stat) against what THIS model needs. The swap
 *  reading was the wrong instrument: on 27 Oct it read 994 MB free (under
 *  the 1,500 MB floor, a refusal) while the Mac had 9.6 GB of RAM free and
 *  ran the model without strain. macOS had shrunk swap to 4 GB total; swap
 *  free tracks how much swap was allocated, not how much memory is spare. A
 *  model Ollama already holds is ok whatever the reading: nothing new loads.
 *
 *  MLX: the swap floor as before (19 Oct). A Mac that has not needed swap yet
 *  (total 0: macOS grows it on demand) has room.
 *
 *  Either way a non-macOS host, or a reading that cannot be parsed, is not
 *  blocked on a guess. */
export function memoryHeadroom(opts) {
  if (!opts && headroomOverride) return headroomOverride();
  const backend = opts?.backend || localBackend();
  if (backend === 'ollama') {
    const {
      readVm = readVmStatDefault, platform = process.platform, model = defaultModel(),
      sizeBytes = sizeOf(model), loaded = isLoaded(model),
    } = opts || {};
    const needMB = memoryNeedMB(model, sizeBytes);
    let freeMB = null;
    if (platform === 'darwin') {
      try { freeMB = parseVmStat(readVm()); } catch { freeMB = null; }
    }
    if (loaded || freeMB == null || freeMB >= needMB) return { ok: true, freeMB, needMB, swapFreeMB: null, reason: null };
    return {
      ok: false,
      freeMB,
      needMB,
      swapFreeMB: null,
      reason: `this Mac has only ${freeMB} MB of memory free (${localModelName(model)} needs about ${needMB} MB to load without slowing everything else down)`,
    };
  }
  const { read = readSwapDefault, platform = process.platform, minFreeMB = MIN_SWAP_FREE_MB() } = opts || {};
  if (platform !== 'darwin') return { ok: true, freeMB: null, needMB: null, swapFreeMB: null, reason: null };
  let parsed = null;
  try { parsed = parseSwapUsage(read()); } catch { parsed = null; }
  if (!parsed) return { ok: true, freeMB: null, needMB: null, swapFreeMB: null, reason: null };
  const swapFreeMB = Math.round(parsed.freeMB);
  if (parsed.totalMB === 0) return { ok: true, freeMB: null, needMB: null, swapFreeMB, reason: null };
  if (parsed.freeMB < minFreeMB) {
    return {
      ok: false,
      freeMB: null,
      needMB: null,
      swapFreeMB,
      reason: `this Mac has only ${swapFreeMB} MB of swap free (the local model needs ${minFreeMB} MB to load without slowing everything else down)`,
    };
  }
  return { ok: true, freeMB: null, needMB: null, swapFreeMB, reason: null };
}

/* ---------------------------- hardware profile --------------------------- */

// The tiers this module chooses between, per backend. Pure data so a test
// can assert on the boundaries without touching os.* at all.
const TIERS = {
  mlx: [
    // Llama-3.2-3B was measured and failed the inbox contract 0/40 (design/
    // audits/2026-09-25-local-model-eval.md), so even the small tier runs the
    // 4B that passed 38/40: ~2.5 GB resident fits an 8 GB machine.
    { maxGB: 8, tier: '≤8GB', maxParamsB: 4, recommendedModel: 'mlx-community/Qwen3-4B-Instruct-2507-4bit' },
    { maxGB: 16, tier: '16GB', maxParamsB: 8, recommendedModel: 'mlx-community/Qwen3-4B-Instruct-2507-4bit' },
    { maxGB: 32, tier: '32GB', maxParamsB: 14, recommendedModel: 'mlx-community/Qwen2.5-7B-Instruct-4bit' },
    { maxGB: Infinity, tier: '>32GB', maxParamsB: 14, recommendedModel: 'mlx-community/Qwen2.5-7B-Instruct-4bit' },
  ],
  // The Qwen3.5 family on Ollama (27 Oct 2026). The 4B is the one measured
  // on his 16 GB M1 Pro: a JSON classify in 0.8 s with thinking off, a
  // correct native tool call, 3.1 GB resident. The 9B (~5 GB resident) is
  // the tier above, and on a 16 GB Mac an option on the board "when the Mac
  // is quiet", not the default.
  ollama: [
    { maxGB: 8, tier: '≤8GB', maxParamsB: 2, recommendedModel: 'qwen3.5:2b' },
    { maxGB: 16, tier: '16GB', maxParamsB: 4, recommendedModel: 'qwen3.5:4b' },
    { maxGB: 32, tier: '32GB', maxParamsB: 9, recommendedModel: 'qwen3.5:9b' },
    { maxGB: Infinity, tier: '>32GB', maxParamsB: 9, recommendedModel: 'qwen3.5:9b' },
  ],
};

// Pure: which model tier fits this machine, and which candidate to run.
// Injectable for tests (`hardwareProfile({ totalMemBytes, cpuModel, backend })`)
// — the real call site (defaultModel(), below) passes nothing and reads the
// live machine and the configured backend.
export function hardwareProfile({ totalMemBytes, cpuModel, backend } = {}) {
  const bytes = totalMemBytes ?? os.totalmem();
  const model = cpuModel ?? (os.cpus()[0]?.model || 'unknown CPU');
  const totalMemGB = Math.round((bytes / (1024 ** 3)) * 10) / 10;
  const tiers = TIERS[(backend || localBackend()) === 'mlx' ? 'mlx' : 'ollama'];
  const { tier, maxParamsB, recommendedModel } = tiers.find((t) => totalMemGB <= t.maxGB);
  return { totalMemGB, cpuModel: model, tier, maxParamsB, recommendedModel };
}

/** Does this id look like a model name the backend could run? An Ollama tag
 *  ("qwen3.5:4b", "llama3") or an MLX repo id ("mlx-community/Qwen3-4B-…").
 *  Shape only: whether it is pulled is listLocalModels' question. */
export function looksLikeModelId(id) {
  const s = String(id ?? '');
  return s.length > 0 && s.length <= 200 && /^[\w.-]+(\/[\w.-]+)*(:[\w.-]+)?$/.test(s);
}
export function modelFitsBackend(id, backend = localBackend()) {
  if (!looksLikeModelId(id)) return false;
  const s = String(id);
  const mlxShaped = s.includes('/') && !s.includes(':');
  return backend === 'mlx' ? mlxShaped : !mlxShaped;
}

// The model he picked on the board (lib/modelPrefs.js setLocalPrefs). Pushed
// in from there rather than read from here, because modelPrefs imports this
// module and the reverse import would be circular.
let preferredModel = null;
export function setPreferredModel(id) {
  preferredModel = id && looksLikeModelId(id) ? String(id) : null;
}

// The model this process will run, absent an explicit override: the env var
// wins outright (an eval run pins an exact candidate this way), then his
// pick on the board when it fits the backend, otherwise the machine's own
// hardwareProfile() picks — so the choice is derived from the Mac, never
// hard-coded.
export function defaultModel() {
  if (process.env.NOVA_LOCAL_LLM_MODEL) return process.env.NOVA_LOCAL_LLM_MODEL;
  if (preferredModel && modelFitsBackend(preferredModel)) return preferredModel;
  return hardwareProfile().recommendedModel;
}

/* -------------------------------- status --------------------------------- */

/** Is the server answering right now? (Not: is the model loaded.) */
export async function healthy() {
  if (localBackend() === 'ollama') {
    try {
      const res = await fetch(`${OLLAMA_URL()}/api/tags`, { signal: AbortSignal.timeout(1500) });
      ollamaState.reachable = res.ok;
      return res.ok;
    } catch {
      ollamaState.reachable = false;
      return false;
    }
  }
  try {
    const res = await fetch(`${BASE()}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Ready to answer without a load: for MLX the server IS the model (one model
// per process); for Ollama the server is up AND holds this model, because a
// chat call to an unloaded model would load it, and a load must pass the
// headroom guard first.
async function ready() {
  if (localBackend() !== 'ollama') return healthy();
  if (!(await healthy())) return false;
  await refreshOllama();
  return isLoaded(defaultModel());
}

function pythonBin() {
  return path.join(VOICE_DIR(), 'env', 'bin', 'python');
}

// configured ≠ ready, same distinction ttsLocal.js draws: configured means
// what this needs is actually installed; ready means the model answers
// RIGHT NOW without a load. A machine can be configured and not ready (the
// model just isn't loaded yet) — that is the ordinary state between uses,
// not a failure.
export async function localModelStatus() {
  const model = defaultModel();
  if (localBackend() === 'ollama') await refreshOllama();
  const configured = localModelConfigured();
  const isReady = configured ? await ready() : false;
  return { configured, ready: isReady, model, backend: localBackend(), headroom: memoryHeadroom() };
}

/** Synchronous half of the status: is what this needs installed? A stat,
 *  cheap enough for a synchronous board read. Ollama: the binary is on this
 *  Mac, or the server answered at the last reading (it can run elsewhere, a
 *  launchd service from a path not on PATH). MLX: the venv exists. */
export function localModelConfigured() {
  if (localBackend() === 'ollama') return !!ollamaBin() || ollamaState.reachable;
  return existsSync(pythonBin());
}

/** "qwen3.5:4b" → "Qwen3.5 4B"; "mlx-community/Qwen3-4B-Instruct-2507-4bit"
 *  → "Qwen3 4B". The model's own name, for a pill or a menu. */
export function localModelName(id = defaultModel()) {
  const raw = String(id || '');
  if (raw.includes(':') || !raw.includes('/')) {
    const [name, tag = ''] = raw.split(':');
    const base = name.split('/').pop() || '';
    const cap = base ? base[0].toUpperCase() + base.slice(1) : '';
    const size = tag.match(/^(\d+(?:\.\d+)?)b\b/i);
    if (cap) return size ? `${cap} ${size[1]}B` : cap;
    return 'Local model';
  }
  const name = raw.split('/').pop() || '';
  const m = name.match(/^([A-Za-z]+[\d.]*)-(\d+(?:\.\d+)?B)\b/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : name || 'Local model';
}

/** A short human name for a local model id, for the board:
 *  "qwen3.5:4b" → "Qwen3.5 4B on this Mac". */
export function localModelLabel(id = defaultModel()) {
  return `${localModelName(id)} on this Mac`;
}

/* --------------------------------- boot ----------------------------------- */

let child = null;   // the running server process, if we spawned one
let booting = null; // the in-flight boot, shared by every caller waiting on it

// Liveness is taken from the 'exit' event, which fires for a signal kill
// and a clean exit alike — exitCode alone reads a signal-killed child as
// still running (exitCode stays null), which is the exact bug ttsLocal.js
// paid for on 13 Sep with a thirteen-hour silent TTS outage.
function watchChild(proc, what) {
  proc.on('exit', (code, signal) => {
    console.log(`${what} exited (code ${code}, signal ${signal})`);
    if (child === proc) child = null;
  });
  proc.on('error', (e) => {
    console.log(`${what} failed to spawn: ${e.message}`);
    if (child === proc) child = null;
  });
  return proc;
}

function spawnServer(model) {
  const python = pythonBin();
  // Not installed is a different answer from died, and it has a different
  // remedy — same reasoning as ttsLocal.js's spawnSidecar().
  if (!existsSync(python)) throw new Error('local model python env is not installed — run server/voice/setup.sh');
  const proc = spawn(python, ['-m', 'mlx_lm', 'server', '--model', model, '--port', String(PORT())], {
    env: { ...process.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return watchChild(proc, 'local model server');
}

function spawnOllama(bin) {
  const url = new URL(OLLAMA_URL());
  const proc = spawn(bin, ['serve'], {
    env: { ...process.env, OLLAMA_HOST: `${url.hostname}:${url.port || 11434}` },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return watchChild(proc, 'ollama serve');
}

function noRoom(room) {
  const err = new Error(`the local model was not started: ${room.reason}`);
  err.noHeadroom = true;
  return err;
}

async function waitHealthy(what) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS();
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    if (!child) throw new Error(`${what} died at boot`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${what} never became healthy within ${Math.round(BOOT_TIMEOUT_MS() / 1000)}s`);
}

async function bootMlx() {
  const model = defaultModel();
  if (await healthy()) return true;
  // An already-running server is used whatever the memory; a NEW load is
  // refused when it would push this Mac into thrashing.
  if (!child) {
    // not installed is the more basic answer, with its own remedy: say it first
    if (!localModelConfigured()) throw new Error('local model python env is not installed — run server/voice/setup.sh');
    const room = memoryHeadroom();
    if (!room.ok) throw noRoom(room);
    child = spawnServer(model);
  }
  return waitHealthy('local model server');
}

// Ollama: the server first (usually already up as his brew service), then
// THIS model loaded, which is the step that costs memory and so the step the
// guard stands in front of. The preload carries the same keep_alive and
// num_ctx a chat turn sends: a load at a different context size is a reload
// on the next call.
async function bootOllama() {
  const model = defaultModel();
  if (!(await healthy())) {
    const bin = ollamaBin();
    if (!bin) throw new Error(`Ollama is not installed on this Mac (brew install ollama), and nothing answers at ${OLLAMA_URL()}`);
    if (OLLAMA_NO_SPAWN()) throw new Error(`Ollama is not answering at ${OLLAMA_URL()}`);
    if (!child) child = spawnOllama(bin);
    await waitHealthy('ollama serve');
  }
  await refreshOllama();
  if (isLoaded(model)) return true;
  if (ollamaState.models.length && !ollamaState.models.some((m) => m.id === model)) {
    throw new Error(`${model} is not on this Mac yet (ollama pull ${model})`);
  }
  const room = memoryHeadroom();
  if (!room.ok) throw noRoom(room);
  let res;
  try {
    res = await fetch(`${OLLAMA_URL()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: KEEP_ALIVE(), options: { num_ctx: NUM_CTX(CHAT_CTX) } }),
      signal: AbortSignal.timeout(BOOT_TIMEOUT_MS()),
    });
  } catch (e) {
    throw new Error(`the local model did not load: ${e.name === 'TimeoutError' ? 'it timed out' : e.message}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`the local model did not load: Ollama → ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  await refreshOllama();
  return true;
}

// Boot the server and load the model if it isn't answering. One shared
// in-flight boot — several callers arriving at once share ONE spawn+load,
// not a race of several.
export function ensureLocalModel() {
  if (booting) return booting;
  booting = (localBackend() === 'ollama' ? bootOllama() : bootMlx()).finally(() => { booting = null; });
  return booting;
}

// For tests and for a clean shutdown at the end of an eval run: stop the
// model. Ollama: ask it to unload this model now (keep_alive 0), which gives
// the memory back even when the server is his brew service and not ours;
// then stop the server only if we spawned it. Returns a promise for the
// unload; a caller that does not care may ignore it.
export function stopLocalModel() {
  let unload = Promise.resolve();
  if (localBackend() === 'ollama' && ollamaState.reachable) {
    const model = defaultModel();
    unload = fetch(`${OLLAMA_URL()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    }).then(() => refreshOllama()).catch(() => {});
  }
  if (child) {
    child.kill('SIGTERM');
    child = null;
  }
  return unload;
}

// The pid of the server we spawned, or null — for ops visibility only (e.g.
// sampling RSS during an eval run). Never used for control flow.
export function localModelPid() {
  return child ? child.pid : null;
}

/* ------------------------------- completion ------------------------------- */

const CHAT_CTX = 8192;
const COMPLETE_CTX = CHAT_CTX; // the same on purpose: see NUM_CTX above
const THOUGHT_ONLY = 'the local model spent its whole budget thinking and returned nothing';

// Wait for a boot, but no longer than `ms`: the boot carries on past the cap
// (the next call finds it ready); this caller gets a plain reason instead.
async function waitForBootCapped(ms) {
  let timer = null;
  const cap = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the local model did not finish loading within ${Math.round(ms / 1000)}s`)), ms);
    timer.unref?.();
  });
  try {
    await Promise.race([ensureLocalModel(), cap]);
  } finally {
    clearTimeout(timer);
  }
}

// The boot rule both calls share: by default a request must not wait out a
// boot — same rule as ttsLocal.js's synthesizeLocal(): if the model isn't
// up, kick a boot in the background and fail THIS call immediately with a
// clear reason. `waitForBoot` waits, capped by NOVA_LOCAL_LLM_WAIT_MS.
async function readyOrBoot(waitForBoot) {
  if (await ready()) return;
  if (!waitForBoot) {
    ensureLocalModel().catch(() => {});
    throw new Error('local model is still starting up');
  }
  await waitForBootCapped(WAIT_MS());
}

// The OpenAI-shaped messages the callers build → Ollama's native shape: a
// tool call's arguments are an OBJECT there (a string here), and a tool
// result names its tool as `tool_name`.
function toNativeMessages(messages) {
  return messages.map((m) => {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      return {
        role: 'assistant',
        content: typeof m.content === 'string' ? m.content : '',
        tool_calls: m.tool_calls.map((tc) => {
          let args = tc?.function?.arguments;
          if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { args = {}; } }
          return { function: { name: tc?.function?.name, arguments: args && typeof args === 'object' ? args : {} } };
        }),
      };
    }
    if (m?.role === 'tool') return { role: 'tool', content: String(m.content ?? ''), ...(m.name ? { tool_name: m.name } : {}) };
    return m;
  });
}

// Ollama's native reply → the OpenAI message every caller reads. Thinking is
// dropped: it is the model's scratch, never an answer.
function fromNative(json) {
  const msg = json?.message || {};
  const toolCalls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((tc) => ({
    id: `call_${randomBytes(4).toString('hex')}`,
    type: 'function',
    function: {
      name: String(tc?.function?.name || ''),
      arguments: JSON.stringify(tc?.function?.arguments && typeof tc.function.arguments === 'object' ? tc.function.arguments : (tc?.function?.arguments ?? {})),
    },
  }));
  const message = { role: 'assistant', content: typeof msg.content === 'string' ? msg.content : '' };
  if (toolCalls.length) message.tool_calls = toolCalls;
  const usage = (json?.prompt_eval_count != null || json?.eval_count != null)
    ? { prompt_tokens: Number(json.prompt_eval_count) || 0, completion_tokens: Number(json.eval_count) || 0 }
    : null;
  return { message, usage, doneReason: json?.done_reason || null };
}

async function postJson(url, body, timeoutMs) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(`local model request failed: ${e.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : e.message}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`local model → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch((e) => {
    throw new Error(`local model returned invalid JSON: ${e.message}`);
  });
}

// One native /api/chat call. `think` false is the default everywhere: left
// at Ollama's default for Qwen3.5 it spent 765 characters thinking about
// "toothpaste" and never reached the answer (27 Oct).
async function ollamaChat(model, messages, { tools, json, think, maxTokens, temperature, numCtx, timeoutMs }) {
  const body = {
    model,
    messages: toNativeMessages(messages),
    stream: false,
    think: !!think,
    keep_alive: KEEP_ALIVE(),
    options: { temperature, num_predict: maxTokens, num_ctx: numCtx },
  };
  if (tools && tools.length) body.tools = tools;
  if (json) body.format = 'json';
  return fromNative(await postJson(`${OLLAMA_URL()}/api/chat`, body, timeoutMs));
}

// One completion call. A lane that has chosen the local model
// (lib/textLane.js) passes `waitForBoot`: it waits for the load, capped by
// NOVA_LOCAL_LLM_WAIT_MS, because the alternative is no answer at all.
// `system` is sent as a system message ahead of the prompt; `json` asks
// Ollama to constrain the output to JSON (ignored on MLX, which has no such
// switch); `think` and `numCtx` are Ollama's too.
export async function completeLocal(prompt, {
  maxTokens = 512, temperature = 0, timeoutMs = 90_000, waitForBoot = false, system = null,
  think = false, json = false, numCtx = null,
} = {}) {
  const text = String(prompt || '');
  if (!text.trim()) throw new Error('completeLocal: empty prompt');
  const model = defaultModel();
  await readyOrBoot(waitForBoot);
  const messages = [];
  if (system && String(system).trim()) messages.push({ role: 'system', content: String(system) });
  messages.push({ role: 'user', content: text });
  const started = Date.now();
  if (localBackend() === 'ollama') {
    const out = await ollamaChat(model, messages, {
      json, think, maxTokens, temperature, numCtx: numCtx || NUM_CTX(COMPLETE_CTX), timeoutMs,
    });
    const ms = Date.now() - started;
    if (!out.message.content.trim()) throw new Error(out.doneReason === 'length' ? THOUGHT_ONLY : 'local model returned no text');
    return { text: out.message.content, ms, model };
  }
  const res = await postJson(`${BASE()}/v1/chat/completions`, {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  }, timeoutMs);
  const ms = Date.now() - started;
  const out = res.choices?.[0]?.message?.content;
  if (typeof out !== 'string' || !out.trim()) throw new Error('local model returned no text');
  return { text: out, ms, model };
}

// One chat turn with a whole message list and, optionally, OpenAI `tools`
// (lib/localAsk.js: Ask Nova on this Mac, with the vault read by code).
// Returns the assistant message in the OpenAI shape (content and any
// tool_calls, arguments as a JSON string) whichever backend answered,
// because what a reply MEANS is the caller's code to decide. Same boot rule
// as completeLocal with `waitForBoot`. An HTTP refusal carries its status on
// the error (`err.status`), so a caller can tell "this server does not take
// tools" (400) from a dead server.
export async function chatLocal(messages, {
  tools = null, maxTokens = 700, temperature = 0, timeoutMs = 90_000, waitForBoot = true,
  think = false, numCtx = null,
} = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('chatLocal: no messages');
  const model = defaultModel();
  await readyOrBoot(waitForBoot);
  const started = Date.now();
  if (localBackend() === 'ollama') {
    const out = await ollamaChat(model, messages, {
      tools, think, maxTokens, temperature, numCtx: numCtx || NUM_CTX(CHAT_CTX), timeoutMs,
    });
    const ms = Date.now() - started;
    if (!out.message.content.trim() && !out.message.tool_calls && out.doneReason === 'length') throw new Error(THOUGHT_ONLY);
    return { message: out.message, usage: out.usage, ms, model };
  }
  const body = { model, messages, max_tokens: maxTokens, temperature };
  if (tools && tools.length) body.tools = tools;
  const json = await postJson(`${BASE()}/v1/chat/completions`, body, timeoutMs);
  const ms = Date.now() - started;
  const message = json.choices?.[0]?.message;
  if (!message || typeof message !== 'object') throw new Error('local model returned no message');
  return { message, usage: json.usage || null, ms, model };
}

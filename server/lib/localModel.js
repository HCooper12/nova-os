// Nova's local LLM client — a small instruct model served by mlx_lm.server
// (OpenAI-compatible HTTP) on this Mac, via the same MLX venv that powers the
// Kokoro TTS sidecar (server/voice/env/, see lib/ttsLocal.js). Groundwork for
// a "private lane": before anything real routes here, this is measured
// against Claude Haiku on a real task (server/scripts/evalLocalClassifier.mjs)
// and the results are written to design/audits/. This module is the client
// only — nothing calls it from a production lane yet.
//
// Same idioms as ttsLocal.js on purpose: fileURLToPath (never URL.pathname —
// this repo's path has a space), liveness taken from the child's 'exit'
// event (a signal-killed process leaves exitCode === null, which reads as
// "still running" if you check exitCode instead — see ttsLocal.js's account
// of the thirteen-hour TTS silence), one shared in-flight boot so concurrent
// callers don't race to spawn a second server, and env overrides for every
// path/port so tests never spawn the real thing.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// Shared with ttsLocal.js: one Python venv, one place it lives.
const VOICE_DIR = process.env.NOVA_VOICE_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'voice');

const PORT = () => Number(process.env.NOVA_LOCAL_LLM_PORT || 4176);
const BASE = () => `http://127.0.0.1:${PORT()}`;

// How long a boot (server start + model load, including a first-time
// download of a multi-GB file over the network) is allowed before it is
// declared dead. Generous by default because a cold model pull can run long;
// override for tests so a stub sees a real deadline quickly.
const BOOT_TIMEOUT_MS = () => Number(process.env.NOVA_LOCAL_LLM_BOOT_TIMEOUT_MS || 600_000);

/* ---------------------------- hardware profile --------------------------- */

// The tiers this module chooses between. Pure data so a test can assert on
// the boundaries without touching os.* at all.
const TIERS = [
  // Llama-3.2-3B was measured and failed the inbox contract 0/40 (design/
  // audits/2026-09-25-local-model-eval.md), so even the small tier runs the
  // 4B that passed 38/40: ~2.5 GB resident fits an 8 GB machine.
  { maxGB: 8, tier: '≤8GB', maxParamsB: 4, recommendedModel: 'mlx-community/Qwen3-4B-Instruct-2507-4bit' },
  { maxGB: 16, tier: '16GB', maxParamsB: 8, recommendedModel: 'mlx-community/Qwen3-4B-Instruct-2507-4bit' },
  { maxGB: 32, tier: '32GB', maxParamsB: 14, recommendedModel: 'mlx-community/Qwen2.5-7B-Instruct-4bit' },
];
const OVER_32GB = { tier: '>32GB', maxParamsB: 14, recommendedModel: 'mlx-community/Qwen2.5-7B-Instruct-4bit' };

function tierFor(totalMemGB) {
  for (const t of TIERS) if (totalMemGB <= t.maxGB) return t;
  return OVER_32GB;
}

// Pure: which model tier fits this machine, and which candidate to run.
// Injectable for tests (`hardwareProfile({ totalMemBytes, cpuModel })`) —
// the real call site (defaultModel(), below) passes nothing and reads the
// live machine.
export function hardwareProfile({ totalMemBytes, cpuModel } = {}) {
  const bytes = totalMemBytes ?? os.totalmem();
  const model = cpuModel ?? (os.cpus()[0]?.model || 'unknown CPU');
  const totalMemGB = Math.round((bytes / (1024 ** 3)) * 10) / 10;
  const { tier, maxParamsB, recommendedModel } = tierFor(totalMemGB);
  return { totalMemGB, cpuModel: model, tier, maxParamsB, recommendedModel };
}

// The model this process will run, absent an explicit override: the env var
// wins outright (an eval run pins an exact candidate this way), otherwise
// the machine's own hardwareProfile() picks — so the choice is derived from
// the Mac, never hard-coded.
export function defaultModel() {
  return process.env.NOVA_LOCAL_LLM_MODEL || hardwareProfile().recommendedModel;
}

/* -------------------------------- status --------------------------------- */

export async function healthy() {
  try {
    const res = await fetch(`${BASE()}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function pythonBin() {
  return path.join(VOICE_DIR, 'env', 'bin', 'python');
}

// configured ≠ ready, same distinction ttsLocal.js draws: configured means
// the venv this needs is actually installed; ready means an HTTP call to the
// server answered RIGHT NOW. A machine can be configured and not ready (the
// server just isn't running yet) — that is the ordinary state between boots,
// not a failure.
export async function localModelStatus() {
  const model = defaultModel();
  const configured = existsSync(pythonBin());
  const ready = configured ? await healthy() : false;
  return { configured, ready, model };
}

/* --------------------------------- boot ----------------------------------- */

let child = null;   // the running server process, if we spawned one
let booting = null; // the in-flight boot, shared by every caller waiting on it

function spawnServer(model) {
  const python = pythonBin();
  // Not installed is a different answer from died, and it has a different
  // remedy — same reasoning as ttsLocal.js's spawnSidecar().
  if (!existsSync(python)) throw new Error('local model python env is not installed — run server/voice/setup.sh');
  const proc = spawn(python, ['-m', 'mlx_lm', 'server', '--model', model, '--port', String(PORT())], {
    env: { ...process.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // Liveness is taken from the 'exit' event, which fires for a signal kill
  // and a clean exit alike — exitCode alone reads a signal-killed child as
  // still running (exitCode stays null), which is the exact bug ttsLocal.js
  // paid for on 13 Sep with a thirteen-hour silent TTS outage.
  proc.on('exit', (code, signal) => {
    console.log(`local model server exited (code ${code}, signal ${signal})`);
    if (child === proc) child = null;
  });
  proc.on('error', (e) => {
    console.log(`local model server failed to spawn: ${e.message}`);
    if (child === proc) child = null;
  });
  return proc;
}

async function bootServer() {
  const model = defaultModel();
  if (await healthy()) return true;
  if (!child) child = spawnServer(model);
  const deadline = Date.now() + BOOT_TIMEOUT_MS();
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    if (!child) throw new Error('local model server died at boot');
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`local model server never became healthy within ${Math.round(BOOT_TIMEOUT_MS() / 1000)}s`);
}

// Boot the server if it isn't answering. One shared in-flight boot — several
// callers arriving at once share ONE spawn+load, not a race of several.
export function ensureLocalModel() {
  if (booting) return booting;
  booting = bootServer().finally(() => { booting = null; });
  return booting;
}

// For tests and for a clean shutdown at the end of an eval run: stop the
// server we spawned, if any. A no-op if nothing is running or it wasn't us
// that started it.
export function stopLocalModel() {
  if (child) {
    child.kill('SIGTERM');
    child = null;
  }
}

// The pid of the server we spawned, or null — for ops visibility only (e.g.
// sampling RSS during an eval run). Never used for control flow.
export function localModelPid() {
  return child ? child.pid : null;
}

/* ------------------------------- completion ------------------------------- */

// One completion call against the running server's OpenAI-compatible
// /v1/chat/completions endpoint. A request must not wait out a boot — same
// rule as ttsLocal.js's synthesizeLocal(): if the server isn't up, kick a
// boot in the background and fail THIS call immediately with a clear reason,
// rather than silently blocking for up to ten minutes.
export async function completeLocal(prompt, { maxTokens = 512, temperature = 0, timeoutMs = 90_000 } = {}) {
  const text = String(prompt || '');
  if (!text.trim()) throw new Error('completeLocal: empty prompt');
  const model = defaultModel();
  if (!(await healthy())) {
    ensureLocalModel().catch(() => {});
    throw new Error('local model is still starting up');
  }
  const started = Date.now();
  let res;
  try {
    res = await fetch(`${BASE()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: text }],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(`local model request failed: ${e.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : e.message}`);
  }
  const ms = Date.now() - started;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`local model → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  const json = await res.json().catch((e) => {
    throw new Error(`local model returned invalid JSON: ${e.message}`);
  });
  const out = json.choices?.[0]?.message?.content;
  if (typeof out !== 'string' || !out.trim()) throw new Error('local model returned no text');
  return { text: out, ms, model };
}

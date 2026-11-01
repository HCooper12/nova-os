// NOVA'S LOCAL EARS (2 Nov 2026): whisper-large-v3-turbo on this Mac's GPU,
// via mlx-whisper in its own venv (server/voice-stt/), held warm by a small
// Python server on 127.0.0.1:4177.
//
// His instruction that day: Nova must work with no internet connection and no
// Claude. The ears were the last piece that could not: every spoken turn went
// to Groq's Whisper over the internet (lib/transcribe.js). His 19 Oct yes was
// to a local transcriber measured against Groq on his real recordings BEFORE
// it becomes the default; lib/sttShadow.js is that measurement, and
// lib/transcribe.js decides when this client is called.
//
// The lifecycle is lib/ttsLocal.js's, on purpose, so the two engines read
// alike and carry the same scars: liveness from the 'exit' event (a signal-
// killed child has exitCode null, the 13 Sep thirteen-hour silence), one
// shared boot for every waiting caller, "not installed" said before a spawn,
// and env overrides for the directory and port so a test never starts the
// real model on his Mac.
//
// One difference, and why: a sentence the TTS cannot speak falls back to the
// browser's voice, so ttsLocal fails fast while it boots. Words have no such
// fallback. When the ears are called they are the answer (Groq is down, or he
// chose local), so a transcription WAITS for the boot, which measures ~1-5 s.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// fileURLToPath, never URL.pathname: this repo's path contains a space.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STT_DIR = () => process.env.NOVA_STT_DIR || path.join(__dirname, '..', 'voice-stt');
const PORT = () => Number(process.env.NOVA_STT_PORT || 4177);
const BASE = () => `http://127.0.0.1:${PORT()}`;
const PYTHON = () => path.join(STT_DIR(), 'env', 'bin', 'python');

export const LOCAL_STT_MODEL = 'whisper-large-v3-turbo (mlx)';

// Installed is the question here; running is localSttReady's. NOVA_STT_LOCAL=0
// switches the ears off without uninstalling them (his kill switch, one env
// line and a reload), and nothing then falls back to them or shadows on them.
export function localSttConfigured() {
  if (process.env.NOVA_STT_LOCAL === '0') return false;
  return existsSync(PYTHON()) && existsSync(path.join(STT_DIR(), 'server.py'));
}

let child = null;   // the running ears, if we spawned them
let booting = null; // the in-flight boot, shared by every caller waiting on it
let lastBootMs = null;

export async function sttHealthy() {
  try {
    const r = await fetch(`${BASE()}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function spawnEars() {
  // not installed is a different answer from died, with a different remedy
  if (!existsSync(PYTHON())) throw new Error('the local transcriber is not installed (run server/voice-stt/setup.sh)');
  const c = spawn(PYTHON(), [path.join(STT_DIR(), 'server.py')], {
    // brew's ffmpeg decodes every recording; launchd's PATH has no brew.
    // HF_HUB_OFFLINE: the ears must never need the internet to start.
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}`, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || '1', NOVA_STT_PORT: String(PORT()) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  c.on('exit', (code, signal) => {
    console.log(`stt ears exited (code ${code}, signal ${signal})`);
    if (child === c) child = null; // dead is dead: the next call respawns
  });
  c.on('error', (e) => {
    console.log(`stt ears failed to spawn: ${e.message}`);
    if (child === c) child = null;
  });
  return c;
}

// The boot allowance: model load measured 1.2 s warm and 4.4 s cold on this
// Mac (2 Nov). Two minutes is the same margin ttsLocal learned it needs when
// the Mac is under load (a slow boot must not be declared dead), and a test
// can shorten it.
const BOOT_MS = () => Number(process.env.NOVA_STT_BOOT_MS) || 120_000;

export function ensureEars() {
  if (booting) return booting;
  booting = bootEars().finally(() => { booting = null; });
  return booting;
}

async function bootEars() {
  if (await sttHealthy()) return { cold: false };
  if (!localSttConfigured()) throw new Error('the local transcriber is not installed (run server/voice-stt/setup.sh)');
  const started = Date.now();
  if (!child) child = spawnEars();
  const deadline = started + BOOT_MS();
  while (Date.now() < deadline) {
    if (await sttHealthy()) { lastBootMs = Date.now() - started; return { cold: true, bootMs: lastBootMs }; }
    if (!child) throw new Error('the local transcriber died while starting (run server/voice-stt/setup.sh)');
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the local transcriber did not start within ${Math.round(BOOT_MS() / 1000)} s`);
}

// Can the ears answer RIGHT NOW? Distinct from configured, the 14 Sep rule:
// an engine that is set up but not running is not ready. `boot: true` starts
// one in the background so the answer becomes true on its own; the default
// does not, because a status check must not load 1.5 GB into his Mac.
export async function localSttReady({ boot = false } = {}) {
  if (await sttHealthy()) return true;
  if (boot && localSttConfigured()) ensureEars().catch(() => {});
  return false;
}

export function _bootStats() { return { lastBootMs, running: !!child }; }

// Stop the ears we started (a test's cleanup; a future "give the memory back"
// control). Ears someone else started are left alone.
export function stopEars() {
  const c = child;
  child = null;
  if (c) { try { c.kill('SIGTERM'); } catch { /* already gone */ } }
  return !!c;
}

// The type an upload arrived as -> the extension ffmpeg judges the bytes by.
// Kept in step with transcribe.js audioExtension (an iPhone's AAC is m4a).
function extFor(mime, name) {
  const fromName = String(name || '').match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('flac')) return 'flac';
  return 'm4a';
}

// Audio (a Buffer of bytes, or a file path) -> { text, ms, model, seconds, cold }.
// Throws an Error whose message says the real cause in plain words (his
// 24 Oct rule, errors always factual); never an empty message. An empty
// `text` is a real answer: the clip had no words in it.
export async function transcribeLocal(input, { mime = 'audio/mp4', language = 'en', prompt = '', name = '', timeoutMs = 120_000 } = {}) {
  const isPath = typeof input === 'string';
  if (!isPath && !input?.length) throw new Error('the recording arrived empty');
  if (isPath && !existsSync(input)) throw new Error(`there is no audio file at ${input}`);
  const started = Date.now();
  const boot = await ensureEars();
  const sent = Date.now();
  let r;
  try {
    if (isPath) {
      r = await fetch(`${BASE()}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.resolve(input), language, prompt }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } else {
      const q = new URLSearchParams({ ext: extFor(mime, name), language: language || '', prompt: prompt || '' });
      r = await fetch(`${BASE()}/transcribe?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: input,
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(`the local transcriber took longer than ${Math.round(timeoutMs / 1000)} s`);
    if (e?.cause?.code === 'ECONNREFUSED') throw new Error('the local transcriber stopped answering mid-request');
    throw new Error(`the local transcriber could not be reached: ${e?.message || 'unknown error'}`);
  }
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`the local transcriber refused the recording (${r.status})${body?.error ? `: ${String(body.error).slice(0, 160)}` : ''}`);
  if (!body || typeof body.text !== 'string') throw new Error('the local transcriber answered without a transcript');
  return {
    text: body.text.replace(/\s+/g, ' ').trim(),
    ms: Date.now() - started,
    // the engine's own time on the audio, without the boot or the wire
    seconds: Number.isFinite(body.seconds) ? body.seconds : (Date.now() - sent) / 1000,
    language: body.language || language || '',
    model: LOCAL_STT_MODEL,
    cold: !!boot?.cold,
  };
}

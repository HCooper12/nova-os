// Nova's local voice provider — Kokoro-82M on MLX via a persistent Python
// sidecar (server/voice/sidecar.py). Free, on-device, no per-request cost.
// lib/tts.js dispatches here when NOVA_TTS_LOCAL=1 and no ElevenLabs key is
// set; the /api/tts contract (text in, mp3 bytes out) is unchanged, so the
// client and visualiser work identically on either provider.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// fileURLToPath, never URL.pathname — this repo's path contains a space.
const VOICE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'voice');
const PORT = () => Number(process.env.NOVA_TTS_PORT || 4175);
const BASE = () => `http://127.0.0.1:${PORT()}`;
// brew's path when it exists (launchd PATH lacks /opt/homebrew/bin), plain
// PATH lookup elsewhere (CI runners have no brew tree)
import { existsSync } from 'node:fs';
const FFMPEG = process.env.NOVA_FFMPEG
  || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');

export function localTtsEnabled() {
  return process.env.NOVA_TTS_LOCAL === '1';
}

// The presets the Voice screen offers. 'nova' and 'nova-light' are the
// ear-picked blends baked into the sidecar; each also has a '-jarvis'
// variant that runs the room-and-presence treatment below.
export function localVoices() {
  return [
    { id: 'nova', name: 'Nova (R3 blend)', category: 'local' },
    { id: 'nova-jarvis', name: 'Nova — workshop treatment', category: 'local' },
    { id: 'nova-light', name: 'Nova Light (R6 blend)', category: 'local' },
    { id: 'nova-light-jarvis', name: 'Nova Light — workshop treatment', category: 'local' },
  ];
}

// What the engine RECEIVES, never what Nova displays. Kokoro's G2P hammers
// both halves of open compounds ("heart rate" arrives as two stressed
// words); hyphenating collapses them to one stress. Add entries as his ear
// finds them.
const SPOKEN_REWRITES = [
  [/\bheart rate\b/gi, 'heart-rate'],
  [/\bstep count\b/gi, 'step-count'],
];
export function rewriteForSpeech(text) {
  let out = text;
  for (const [re, to] of SPOKEN_REWRITES) out = out.replace(re, to);
  return out;
}

// The "workshop" chain from the listening rounds: clear the boxiness, lift
// presence, hold an even level (JARVIS never gets louder when the news is
// bad), and ~20ms of room so the voice sits in a space instead of your ear.
const JARVIS_FX = 'highpass=f=90,equalizer=f=250:t=q:w=1.0:g=-2,'
  + 'equalizer=f=3200:t=q:w=1.4:g=3,'
  + 'acompressor=threshold=-18dB:ratio=3:attack=5:release=120,'
  + 'aecho=0.9:0.88:20:0.09,alimiter=limit=0.95';

let sidecar = null; // the running child, if we spawned one

async function healthy() {
  try {
    const res = await fetch(`${BASE()}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Boot the sidecar if it isn't answering. Model load + warm pass is ~8s on
// this machine, so the wait is generous once and free forever after.
export async function ensureSidecar() {
  if (await healthy()) return true;
  if (!sidecar || sidecar.exitCode !== null) {
    const python = path.join(VOICE_DIR, 'env', 'bin', 'python');
    sidecar = spawn(python, [path.join(VOICE_DIR, 'sidecar.py')], {
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    sidecar.on('exit', (code) => console.log(`tts sidecar exited (${code})`));
  }
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    if (sidecar.exitCode !== null) throw new Error(`tts sidecar died at boot (exit ${sidecar.exitCode}) — run server/voice/setup.sh`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('tts sidecar never became healthy — run server/voice/setup.sh');
}

function wavToMp3(wav, fx) {
  return new Promise((resolve, reject) => {
    const args = ['-loglevel', 'error', '-i', 'pipe:0'];
    if (fx) args.push('-af', fx);
    args.push('-f', 'mp3', '-b:a', '128k', 'pipe:1');
    const ff = spawn(FFMPEG, args);
    const out = [];
    const err = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => err.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0 || !out.length) return reject(new Error(`ffmpeg → ${code}: ${Buffer.concat(err)}`));
      resolve(Buffer.concat(out));
    });
    ff.stdin.end(wav);
  });
}

// Fixed lines repeat constantly — the voice-picker preview and the ack
// fillers ("On it, sir.") — and re-synthesizing a string that cannot change
// is pure waste that makes switching voices feel broken under load. Small
// insertion-ordered cache, warmed at boot so those lines answer in ~50ms
// from the first tap. Keep PREVIEW_LINE/ACK_LINES in step with App.jsx
// (speakAck / setVoiceId) — shared formats are contracts.
const AUDIO_CACHE_MAX = 48;
const audioCache = new Map(); // `${voiceId}|${text}` → mp3 Buffer
export const PREVIEW_LINE = 'This is how I sound, sir.';
export const ACK_LINES = ['On it, sir.', 'Let me look.', 'One moment.', 'Checking now.', 'Right away, sir.'];

export async function warmSpokenLines() {
  for (const v of localVoices()) {
    for (const line of [PREVIEW_LINE, ...ACK_LINES]) {
      await synthesizeLocal(line, v.id).catch(() => {}); // warm is best-effort
    }
  }
  console.log(`tts cache warm: ${audioCache.size} lines`);
}

export async function synthesizeLocal(text, voiceId) {
  const requested = (voiceId || '').trim() || 'nova';
  const jarvis = requested.endsWith('-jarvis');
  const voice = jarvis ? requested.slice(0, -'-jarvis'.length) : requested;
  const cacheKey = `${requested}|${text}`;
  const hit = audioCache.get(cacheKey);
  if (hit) return hit;
  await ensureSidecar();
  const res = await fetch(`${BASE()}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: rewriteForSpeech(text), voice }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`local tts → ${res.status}${detail.error ? `: ${detail.error}` : ''}`);
  }
  const wav = Buffer.from(await res.arrayBuffer());
  const mp3 = await wavToMp3(wav, jarvis ? JARVIS_FX : '');
  audioCache.set(cacheKey, mp3);
  if (audioCache.size > AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value);
  return mp3;
}

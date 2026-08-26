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
  // SYMBOLS A PERSON WOULD NEVER SAY. Record titles are written for the eye
  // ("Fuel × training:", "Push → Pull") and Nova was reading them out as
  // punctuation — his note: "reads certain titles a bit clunky without the
  // human touch". These turn written shorthand back into speech.
  [/\s*×\s*/g, ' and '],
  [/\s*→\s*/g, ' to '],
  [/\s+·\s+/g, ', '],
  [/\s*\/\s*/g, ' or '],
  [/\s*&\s*/g, ' and '],
  [/\s*\+\s*/g, ' plus '],
  [/\s*—\s*/g, ', '],   // an em dash is a breath, not a word
  [/\s*--\s*/g, ', '],
  [/(\d)\s*kg\b/gi, '$1 kilos'],
  [/(\d)\s*bpm\b/gi, '$1 beats per minute'],
  [/(\d)\s*ms\b/gi, '$1 milliseconds'],
  [/\bRPE\b/g, 'R P E'],
  [/\bHRV\b/g, 'H R V'],
  [/\bRHR\b/g, 'resting heart-rate'],
  [/\bvs\.?\b/gi, 'versus'],
  [/\be\.g\.\s*/gi, 'for example, '],
  [/\bi\.e\.\s*/gi, 'that is, '],
];
// A title cut mid-word ("…training days ave") is the single most robotic
// thing a voice can do. Trim back to the last whole word and let the
// sentence end, the way a person reading aloud would.
function mendTruncation(text) {
  return String(text).replace(/([A-Za-z]{2,})\s*(?:…|\.\.\.)\s*$/g, '$1.');
}
export function rewriteForSpeech(text) {
  let out = mendTruncation(text);
  for (const [re, to] of SPOKEN_REWRITES) out = out.replace(re, to);
  return out.replace(/\s{2,}/g, ' ').trim();
}

// The "workshop" chain from the listening rounds: clear the boxiness, lift
// presence, hold an even level (JARVIS never gets louder when the news is
// bad), and ~20ms of room so the voice sits in a space instead of your ear.
const JARVIS_FX = 'highpass=f=90,equalizer=f=250:t=q:w=1.0:g=-2,'
  + 'equalizer=f=3200:t=q:w=1.4:g=3,'
  + 'acompressor=threshold=-18dB:ratio=3:attack=5:release=120,'
  + 'aecho=0.9:0.88:20:0.09,alimiter=limit=0.95';

// Kokoro pads both ends of every utterance with silence; on sentence-chunked
// replies those pads stack into audible dead air between chunks and the
// whole exchange feels laggier than it is. Trim the edges (leading via
// silenceremove, trailing via reverse-trim-reverse) on EVERY local synth.
// Gently: -55dB so consonant onsets survive (-45dB clipped attacks — "not
// crispy-clear", his words), and 8ms fades so chunk boundaries never click.
const TRIM_FX = 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.03,'
  + 'areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,'
  + 'afade=t=in:d=0.008,areverse,afade=t=in:d=0.008,areverse';

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
  // 3 minutes, not 60s: model load measured 8-17s normally but >60s under
  // heavy machine load (a VM pinning cores while Chrome renders) — a boot
  // that is merely slow must not be declared dead.
  const deadline = Date.now() + 180_000;
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
    args.push('-f', 'mp3', '-b:a', '192k', 'pipe:1');
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
// Headroom matters more than bytes here: the fixed warm set is already
// 4 voices × 9 lines = 36, and a warmed morning brief adds ~8 more. At 48
// the brief's lines were the first thing evicted by any other synthesis —
// i.e. the cache would drop exactly the audio it had just pre-built. A
// sentence of mp3 is tens of KB, so 160 entries is single-digit megabytes.
const AUDIO_CACHE_MAX = 160;
const audioCache = new Map(); // `${voiceId}|${text}` → mp3 Buffer
export const PREVIEW_LINE = 'This is how I sound, sir.';
export const ACK_LINES = ['On it, sir.', 'Let me look.', 'One moment.', 'Checking now.', 'Right away, sir.'];
// spoken when a think runs long — keep in step with THINKING_LINES in App.jsx
export const THINKING_LINES = ['Still with you, sir.', 'Nearly there.', 'Just pulling that together.'];

export async function warmSpokenLines() {
  for (const v of localVoices()) {
    for (const line of [PREVIEW_LINE, ...ACK_LINES, ...THINKING_LINES]) {
      await synthesizeLocal(line, v.id).catch(() => {}); // warm is best-effort
    }
  }
  console.log(`tts cache warm: ${audioCache.size} lines`);
}

// His 21-Aug note: "Nova is speaking too quickly, it's hard to keep up."
// Kokoro takes a speed multiplier; 0.88 is a measured, unhurried delivery
// without dragging. Tunable per device without a rebuild.
const SPEED = () => {
  const v = Number(process.env.NOVA_TTS_SPEED);
  return Number.isFinite(v) && v >= 0.5 && v <= 1.5 ? v : 0.88;
};

export async function synthesizeLocal(text, voiceId) {
  const requested = (voiceId || '').trim() || 'nova';
  const jarvis = requested.endsWith('-jarvis');
  const voice = jarvis ? requested.slice(0, -'-jarvis'.length) : requested;
  const speed = SPEED();
  // speed is part of the identity of the audio — leaving it out of the key
  // would serve yesterday's pace after he changes it
  const cacheKey = `${requested}|${speed}|${text}`;
  const hit = audioCache.get(cacheKey);
  if (hit) return hit;
  await ensureSidecar();
  const res = await fetch(`${BASE()}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: rewriteForSpeech(text), voice, speed }),
    // 90s: a 2400-char worst case is ~2min of audio and can exceed 30s of
    // synthesis — timing it out returned a 400 and silenced a whole brief.
    // The client sends sentence-sized pieces, so this is a backstop.
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`local tts → ${res.status}${detail.error ? `: ${detail.error}` : ''}`);
  }
  const wav = Buffer.from(await res.arrayBuffer());
  const mp3 = await wavToMp3(wav, jarvis ? `${TRIM_FX},${JARVIS_FX}` : TRIM_FX);
  audioCache.set(cacheKey, mp3);
  if (audioCache.size > AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value);
  return mp3;
}

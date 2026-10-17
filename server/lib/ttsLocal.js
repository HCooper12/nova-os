// Nova's local voice provider — Kokoro-82M on MLX via a persistent Python
// sidecar (server/voice/sidecar.py). Free, on-device, no per-request cost.
// lib/tts.js dispatches here when NOVA_TTS_LOCAL=1 and no ElevenLabs key is
// set; the /api/tts contract (text in, mp3 bytes out) is unchanged, so the
// client and visualiser work identically on either provider.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename, readFile, readdir, stat, unlink } from 'node:fs/promises';

// fileURLToPath, never URL.pathname — this repo's path contains a space.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// NOVA_VOICE_DIR overrides it, same idiom as NOVA_TTS_PORT below: a test must
// be able to exercise the respawn rule without launching the real Kokoro
// engine on his Mac, and a spawn is the one thing a stub sidecar cannot fake.
const VOICE_DIR = process.env.NOVA_VOICE_DIR || path.join(__dirname, '..', 'voice');
const PORT = () => Number(process.env.NOVA_TTS_PORT || 4175);
const BASE = () => `http://127.0.0.1:${PORT()}`;
// brew's path when it exists (launchd PATH lacks /opt/homebrew/bin), plain
// PATH lookup elsewhere (CI runners have no brew tree)
import { existsSync } from 'node:fs';
const FFMPEG = process.env.NOVA_FFMPEG
  || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');

// The disk cache lives under the same data root every other derived store
// uses (server/data, or NOVA_DATA_DIR in tests) — never the vault, which is
// the source of truth and never operational cache (NOVA-METHOD.md).
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const DISK_CACHE_DIR = () => path.join(dataRoot(), 'voice', 'ttscache');

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
let booting = null;  // the in-flight boot, shared by every caller waiting on it

export async function healthy() {
  try {
    const res = await fetch(`${BASE()}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// THE THIRTEEN-HOUR SILENCE. On 13 Sep the sidecar was killed by a signal at
// 06:57 and Nova had no voice until 20:13, because a signal-killed child
// leaves `exitCode === null` — the same value a RUNNING child has. The old
// respawn test read `sidecar.exitCode !== null`, so it saw a corpse as alive,
// never restarted it, and then polled it for the full three minutes before
// throwing. Every reply after that did the same. Liveness is now taken from
// the 'exit' event, which fires for a signal and a clean exit alike, and the
// handle is dropped so the next call spawns a fresh one.
function spawnSidecar() {
  const python = path.join(VOICE_DIR, 'env', 'bin', 'python');
  // Not installed is a different answer from died, and it has a different
  // remedy. Spawning a path that isn't there buys an async 'error' event and
  // a vaguer message; asking first says the true thing immediately.
  if (!existsSync(python)) throw new Error('tts sidecar is not installed — run server/voice/setup.sh');
  const child = spawn(python, [path.join(VOICE_DIR, 'sidecar.py')], {
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code, signal) => {
    console.log(`tts sidecar exited (code ${code}, signal ${signal})`);
    if (sidecar === child) sidecar = null; // dead is dead — the next call respawns
    lastSynthOk = { at: 0, base: '' }; // and no longer ready on the strength of an old answer
  });
  child.on('error', (e) => {
    console.log(`tts sidecar failed to spawn: ${e.message}`);
    if (sidecar === child) sidecar = null;
  });
  return child;
}

// Boot the sidecar if it isn't answering. Model load + warm pass is ~8s on
// this machine, so the wait is generous once and free forever after.
// Concurrent callers share ONE boot — a brief queues a dozen sentences at
// once, and a dozen model loads would fight for the same cores.
export function ensureSidecar() {
  if (booting) return booting;
  booting = bootSidecar().finally(() => { booting = null; });
  return booting;
}

async function bootSidecar() {
  if (await healthy()) return true;
  if (!sidecar) sidecar = spawnSidecar();
  // 3 minutes, not 60s: model load measured 8-17s normally but >60s under
  // heavy machine load (a VM pinning cores while Chrome renders) — a boot
  // that is merely slow must not be declared dead.
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    if (!sidecar) throw new Error('tts sidecar died at boot — run server/voice/setup.sh');
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('tts sidecar never became healthy — run server/voice/setup.sh');
}

// Can the local engine answer RIGHT NOW? Distinct from "is it configured" —
// an engine that is set up but not running is a silence, and /tts/status has
// to say so or the client commits to a dead path instead of falling back to
// the browser's voice. Kicks off a boot in the background when it finds the
// sidecar down, so the answer becomes true on its own.
// A RECENT GOOD ANSWER IS PROOF OF LIFE (18 Oct 2026). The sidecar is single-
// threaded: while it renders the ack pre-render, its /health ping cannot
// answer inside 1.5s, /api/tts/status said ready:false, and the phone went
// to the browser voice for a reply the engine was perfectly able to speak.
const READY_TRUST_MS = 30_000;
// keyed to the engine's address: a good answer from one port proves nothing
// about another. Cleared the moment the engine is seen dead (exit, refused).
let lastSynthOk = { at: 0, base: '' };
export async function localReady() {
  if (lastSynthOk.base === BASE() && Date.now() - lastSynthOk.at < READY_TRUST_MS) return true;
  if (await healthy()) return true;
  ensureSidecar().catch(() => {}); // fire and forget — this call still reports false
  return false;
}

// 192k WAS THE BIGGEST THING ON THE WIRE, AND IT WAS NEVER EVEN HONOURED.
// Kokoro renders 24 kHz mono, which puts the encoder in MPEG-2 Layer III —
// capped at 160 kbps — so the request quietly became 160k. For a single
// channel of speech that is a near-CD music bitrate: a 7.7-second sentence
// shipped 153 KB, and over Tailscale on cellular the phone's median /api/tts
// was 3.9s against 0.96s from localhost. The gap is bytes, not synthesis:
// identical compute, four times the wait. Measured on a real sentence, 64k is
// 40% of the bytes (62 KB), and 23 dB SNR even when transcoded from the
// already-lossy 160k — encoding straight from the WAV, as this does, is
// better than that. Mono speech at 64k is broadcast-normal.
//
// NOVA_TTS_BITRATE is the knob: his ear is the judge, not mine, and turning it
// back up is one env line and a reload.
const BITRATE = () => process.env.NOVA_TTS_BITRATE || '64k';
export function mp3Args(fx) {
  const args = ['-loglevel', 'error', '-i', 'pipe:0'];
  if (fx) args.push('-af', fx);
  args.push('-f', 'mp3', '-b:a', BITRATE(), 'pipe:1');
  return args;
}

function wavToMp3(wav, fx) {
  return new Promise((resolve, reject) => {
    const args = mp3Args(fx);
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

// Fixed lines repeat constantly (the voice-picker preview) and
// re-synthesizing a string that cannot change is pure waste that makes
// switching voices feel broken under load. Small insertion-ordered cache,
// warmed at boot so the preview answers in ~50ms from the first tap. Keep
// PREVIEW_LINE in step with App.jsx (setVoiceId) — shared formats are
// contracts.
//
// The old fixed acks ("On it, sir.") and think-fillers used to be warmed here
// too. They are gone (15 Oct 2026, his "the same responses" note): an ack is
// now composed from his own words per turn (lib/acks.js) and synthesized the
// moment /api/ask returns it (routes/voice.js prewarmAck), so the client's
// /api/tts for it lands on this cache or joins the synthesis in flight.
// Headroom matters more than bytes here: a warmed morning brief adds ~8
// lines, and a per-turn ack one more. A sentence of mp3 is tens of KB, so 160
// entries is single-digit megabytes.
const AUDIO_CACHE_MAX = 160;
const audioCache = new Map(); // `${voiceId}|${speed}|${text}` → mp3 Buffer
// the same key, while its synthesis runs: a second request for it (the
// client's /api/tts arriving while the ack prewarm is still synthesizing)
// waits on the first instead of synthesizing the line twice
const inflight = new Map();
export const PREVIEW_LINE = 'This is how I sound, sir.';

// test hook — a disk-hit assertion needs the memory cache genuinely empty,
// not merely a fresh process
export function _resetAudioCacheForTest() {
  audioCache.clear();
}

// ---------------------------------------------------------------------------
// DISK CACHE for short lines (18 Oct 2026). The memory Map above is lost on
// every restart, and the per-turn prewarm starts at the moment the client
// asks — too late to ever help the acknowledgement it was meant to speed up.
// Acks come from a FINITE set of sentences (acks.js), so this renders them
// ahead of time to `${NOVA_DATA_DIR or server/data}/voice/ttscache/` and
// serves them from there on every restart, keyed EXACTLY like the memory
// cache so a disk hit is the same audio the memory cache would have held.
// Only short lines (<=80 chars) are worth the disk — a brief's long
// sentences are not acks and are not in the finite set this exists for.
// ---------------------------------------------------------------------------
const DISK_CACHE_MAX_FILES = () => Number(process.env.NOVA_TTS_DISK_CACHE_MAX) || 4000;
const PRUNE_INTERVAL_MS = 60_000;
let lastPruneAt = 0;
let pruning = false;

function ttsCacheKey(text, voiceId) {
  const requested = (voiceId || '').trim() || 'nova';
  return `${requested}|${SPEED()}|${text}`;
}

function diskPathFor(cacheKey) {
  const hash = createHash('sha1').update(cacheKey).digest('hex');
  return path.join(DISK_CACHE_DIR(), `${hash}.mp3`);
}

async function readDiskCache(cacheKey) {
  try {
    return await readFile(diskPathFor(cacheKey));
  } catch {
    return null; // missing or unreadable — a cold cache, not a fault
  }
}

// Fire-and-forget by design: the write never gates the response, and any
// failure (disk full, permissions, a race on NOVA_DATA_DIR) is swallowed —
// the request already has its audio either way.
async function writeDiskCacheAtomic(cacheKey, buf) {
  try {
    const dest = diskPathFor(cacheKey);
    await mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await writeFile(tmp, buf);
    await rename(tmp, dest);
    maybePrune();
  } catch { /* a missed write just means a colder disk cache */ }
}

function maybePrune() {
  const now = Date.now();
  if (pruning || now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  pruning = true;
  pruneDiskCache().catch(() => {}).finally(() => { pruning = false; });
}

async function pruneDiskCache() {
  const dir = DISK_CACHE_DIR();
  let names;
  try { names = await readdir(dir); } catch { return; }
  const mp3s = names.filter((n) => n.endsWith('.mp3'));
  const max = DISK_CACHE_MAX_FILES();
  if (mp3s.length <= max) return;
  const withStats = (await Promise.all(mp3s.map(async (n) => {
    try { return { n, mtime: (await stat(path.join(dir, n))).mtimeMs }; } catch { return null; }
  }))).filter(Boolean);
  withStats.sort((a, b) => a.mtime - b.mtime); // oldest first
  const excess = withStats.length - max;
  for (let i = 0; i < excess; i++) {
    await unlink(path.join(dir, withStats[i].n)).catch(() => {});
  }
}

// test hooks — bypass the once-a-minute throttle and go straight to disk,
// so a prune test does not need to wait a real minute
export async function _writeDiskCacheForTest(cacheKey, buf) {
  const dest = diskPathFor(cacheKey);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}
export async function _pruneNow() {
  return pruneDiskCache();
}

export async function diskCacheHas(text, voiceId) {
  try {
    await stat(diskPathFor(ttsCacheKey(text, voiceId)));
    return true;
  } catch {
    return false;
  }
}

export async function diskCacheStats() {
  const dir = DISK_CACHE_DIR();
  let names;
  try { names = await readdir(dir); } catch { return { files: 0, bytes: 0 }; }
  const mp3s = names.filter((n) => n.endsWith('.mp3'));
  let bytes = 0;
  await Promise.all(mp3s.map(async (n) => {
    try { bytes += (await stat(path.join(dir, n))).size; } catch { /* vanished mid-scan */ }
  }));
  return { files: mp3s.length, bytes };
}

// How many /api/tts requests are mid-flight right now. The ack prerender
// uses this to never compete with a live reply for the engine
// (server/lib/ackPrerender.js).
export function ttsBusy() {
  return busy + slotWaiters.length;
}

export async function warmSpokenLines() {
  for (const v of localVoices()) {
    await synthesizeLocal(PREVIEW_LINE, v.id).catch(() => {}); // warm is best-effort
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
  // would serve yesterday's pace after he changes it. ttsCacheKey() computes
  // this same formula — one resolution, shared with diskCacheHas().
  const cacheKey = ttsCacheKey(text, requested);
  const hit = audioCache.get(cacheKey);
  if (hit) return hit;
  // the place in line, before the first await (see takeTicket)
  const ticket = takeTicket();
  let job;
  try {
    // disk, before in-flight: a cold-boot restart has nothing in-flight and
    // everything on disk, and checking disk is cheap next to a synthesis
    const fromDisk = await readDiskCache(cacheKey);
    if (fromDisk) {
      audioCache.set(cacheKey, fromDisk);
      if (audioCache.size > AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value);
      return fromDisk;
    }
    const running = inflight.get(cacheKey);
    if (running) { ticket.release(); return await running; } // joining holds no place
    job = synthesizeUncached(text, { requested, jarvis, voice, speed, cacheKey, ticket });
    inflight.set(cacheKey, job);
    return await job;
  } finally {
    if (job) inflight.delete(cacheKey);
    ticket.release(); // idempotent: synthesizeUncached may have let it go already
  }
}

// A BUSY ENGINE IS NOT A DEAD ONE (15 Oct 2026). The sidecar is a SERIAL
// HTTPServer on purpose (synthesis must own its main thread), so its /health
// queues behind whatever sentence it is rendering. Every request used to ping
// /health first with a 1.5s limit: the phone asks for a reply's sentences at
// once, sentence one occupied the engine, and every other sentence's ping
// timed out and was refused as "still starting up". 30 of 33 /api/tts calls
// failed that way on his first working voice turn (14 Oct 23:39 UTC). While a
// synthesis is running, or one finished a moment ago, the engine is up; only
// an idle engine is worth asking.
const TRUST_MS = 60_000;
let busy = 0;
let lastOkAt = 0;
const believedUp = () => busy > 0 || Date.now() - lastOkAt < TRUST_MS;

// THE SOCKET BACKLOG ATE 469 SENTENCES (18 Oct 2026 audit). The sidecar is a
// serial HTTPServer with Python's default 5-deep listen backlog. The phone
// asked for a whole reply's sentences at once: every burst landed exactly
// 6 x 200 (one rendering + five queued in the kernel) and the rest were
// refused in 1-5 ms, which surfaced as "local tts is still starting up" and
// the client showed those sentences as text with no voice. 415 of them on
// 15 Oct alone. A burst now waits its turn HERE, in arrival order, with at
// most SLOTS requests at the engine (one rendering, one ready behind it so
// the engine never idles between sentences). NOVA_TTS_CONCURRENCY is the knob.
const SLOTS = () => {
  const n = Number(process.env.NOVA_TTS_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 2;
};
let slotsHeld = 0;
const slotWaiters = []; // FIFO: the reply's sentences reach the engine in order
// A place in line is taken SYNCHRONOUSLY, the moment a sentence is asked for,
// before any await (the disk-cache read, the /health ping) can reshuffle the
// burst: measured, taking it after those awaits let sentence 5 render first.
// A ticket is released exactly once, whether it was ever granted (a disk hit
// or a join onto an identical synthesis gives its place up unused).
function takeTicket() {
  let granted = false;
  let done = false;
  let grant;
  const ready = new Promise((r) => { grant = r; });
  const ticket = {
    ready,
    release() {
      if (done) return;
      done = true;
      if (!granted) {
        const i = slotWaiters.indexOf(ticket);
        if (i >= 0) slotWaiters.splice(i, 1);
        return;
      }
      const next = slotWaiters.shift();
      if (next) next._grant(); // the slot passes straight to the next in line
      else slotsHeld--;
    },
    _grant() { granted = true; grant(); },
  };
  if (slotsHeld < SLOTS()) { slotsHeld++; ticket._grant(); } else slotWaiters.push(ticket);
  return ticket;
}

// "Booting" and "bad request" are different answers with different remedies:
// a booting engine is worth asking again in a moment (routes/voice.js sends
// 503 + Retry-After), a bad request never is (400).
export class TtsBootingError extends Error {
  constructor(message = 'local tts is still starting up') {
    super(message);
    this.name = 'TtsBootingError';
    this.code = 'TTS_BOOTING';
    this.retryAfterSec = 2;
  }
}

async function synthesizeUncached(text, { jarvis, voice, speed, cacheKey, ticket }) {
  await ticket.ready; // at most SLOTS() requests at the engine, in arrival order
  // A REQUEST MUST NOT WAIT OUT A BOOT. The three-minute allowance above is
  // right for the boot itself and wrong inside a reply: he is looking at a
  // screen that says Nova is speaking. If the sidecar is not up, start it and
  // fail THIS sentence immediately — the client falls back to the browser
  // voice for it, and the sentence after the boot lands on the real one.
  if (!believedUp() && !(await healthy())) {
    ensureSidecar().catch(() => {});
    throw new TtsBootingError();
  }
  let res;
  busy++;
  try {
    res = await fetch(`${BASE()}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rewriteForSpeech(text), voice, speed }),
      // 90s: a 2400-char worst case is ~2min of audio and can exceed 30s of
      // synthesis — timing it out returned a 400 and silenced a whole brief.
      // The client sends sentence-sized pieces, so this is a backstop.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    lastOkAt = 0; // it did not answer at all: the next request asks /health again
    lastSynthOk = { at: 0, base: '' };
    // nothing listening means it died since its last good answer: the same
    // remedy, and the same words, as finding it down before the request
    if (e?.cause?.code === 'ECONNREFUSED') {
      ensureSidecar().catch(() => {});
      throw new TtsBootingError();
    }
    throw e;
  } finally {
    busy--;
  }
  if (res.ok) { lastOkAt = Date.now(); lastSynthOk = { at: lastOkAt, base: BASE() }; }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`local tts → ${res.status}${detail.error ? `: ${detail.error}` : ''}`);
  }
  const wav = Buffer.from(await res.arrayBuffer());
  ticket.release(); // the engine is done with it; ffmpeg runs outside the line
  const mp3 = await wavToMp3(wav, jarvis ? `${TRIM_FX},${JARVIS_FX}` : TRIM_FX);
  audioCache.set(cacheKey, mp3);
  if (audioCache.size > AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value);
  // Only short lines — the finite ack vocabulary this exists for, never a
  // brief's long sentences — are worth a disk slot. Fire-and-forget: a
  // write that fails must never turn into a failed /api/tts reply.
  if (String(text).length <= 80) writeDiskCacheAtomic(cacheKey, mp3);
  return mp3;
}

// NOVA'S SOUND EFFECTS — 25 Sep 2026, his ask off the Hormozi reel: "This
// exciting look with sound effects would be nice to implement into nova".
//
// Synthesised with Web Audio: nothing to fetch, nothing a service worker can
// serve stale, and every sound tuned here rather than in an asset. Played on
// iOS's AMBIENT session type, so the ticks sound alongside his music instead
// of stopping it — audioSession.js carries that reasoning.
//
// Two rules keep effects from turning into noise (Apple, "Designing
// Audio-Haptic Experiences"):
//   CAUSALITY — every sound is tied to something visibly happening: a row
//     crossing the band is a tick, the reel catching is the chime.
//   HARMONY — sounds are scheduled on the AUDIO clock, from the same timeline
//     the picture animates from (reel.js), so they land on the frame rather
//     than on whenever a setTimeout gets round to it.
//
// Silent is always a valid outcome: effects switched off in Settings, the
// microphone holding the session, Nova mid-sentence, or no Web Audio at all —
// the reveal runs exactly the same, just quietly. Nothing here ever throws.

import { claimForEffects } from './audioSession.js';

const KEY = 'novaos.sfx';

// On unless he turned them off (his call, 25 Sep: on by default).
export function sfxEnabled() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
export function setSfxEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

let ctx = null;
let armed = false;
let noise = null;
let sleepTimer = null;

function contextClass() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

// Call INSIDE his tap. iOS lets only a gesture start audio, and the reveal's
// component mounts a render later — so the tap arms the context here and the
// reel consumes it. Returns whether sound will play.
export function primeSfx({ busy = false } = {}) {
  armed = false;
  if (busy || !sfxEnabled()) return false;
  const AC = contextClass();
  if (!AC) return false;
  if (!claimForEffects()) return false;
  try {
    if (!ctx) ctx = new AC();
    clearTimeout(sleepTimer);
    if (ctx.state !== 'running') ctx.resume()?.catch?.(() => {});
    armed = true;
    return true;
  } catch { return false; }
}

// Hand the armed context to one reel, once. A reel mounted without a tap (a
// re-render, a remount) gets nothing and stays silent.
function take() {
  if (!armed || !ctx) return null;
  armed = false;
  return ctx;
}

// Let the audio hardware go once the last sound has rung out — an idle
// running context keeps iOS's audio session awake for nothing.
function sleepAfter(ac, atSec) {
  clearTimeout(sleepTimer);
  const ms = Math.max(0, (atSec - ac.currentTime) * 1000);
  sleepTimer = setTimeout(() => { try { ac.suspend()?.catch?.(() => {}); } catch { /* gone */ } }, ms);
}

function noiseBuffer(ac) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const len = Math.max(1, Math.round(ac.sampleRate * 0.05));
  noise = ac.createBuffer(1, len, ac.sampleRate);
  const d = noise.getChannelData(0);
  // a fixed seed: the reel sounds the same every time he hears it
  let s = 7;
  for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return noise;
}

function envelope(param, at, peak, attack, decay) {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(peak, at + attack);
  param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

// THE TICK: a detent passing a pawl — a bright filtered click with a short
// woody knock under it. Pitch wanders ±5% from tick to tick (deterministic)
// so a fast run reads as a drum, not a machine gun.
function tick(ac, out, at, i) {
  const wobble = 1 + (((i * 7919) % 11) - 5) / 100;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200 * wobble;
  band.Q.value = 2.2;
  const g = ac.createGain();
  envelope(g.gain, at, 0.42, 0.0015, 0.024);
  src.connect(band).connect(g).connect(out);
  src.start(at);
  src.stop(at + 0.04);
  const knock = ac.createOscillator();
  knock.type = 'sine';
  knock.frequency.value = 1450 * wobble;
  const kg = ac.createGain();
  envelope(kg.gain, at, 0.16, 0.001, 0.013);
  knock.connect(kg).connect(out);
  knock.start(at);
  knock.stop(at + 0.03);
  return [{ node: src, at }, { node: knock, at }];
}

// THE CHIME: glass, not a game-show bell. The technique lands on a rising
// fifth (A5 → E6), the concept shuffle on one softer note — the bigger moment
// gets the bigger sound, and neither is loud.
export const CHIMES = {
  technique: { notes: [880, 1318.51], gap: 0.075, peak: 0.2, decay: 1.1 },
  review: { notes: [1318.51], gap: 0, peak: 0.13, decay: 0.7 },
};
const PARTIALS = [[1, 1], [2, 0.22], [3.01, 0.07]];

function bell(ac, out, at, kind) {
  const b = CHIMES[kind] || CHIMES.technique;
  const nodes = [];
  b.notes.forEach((f, i) => {
    const t = at + i * b.gap;
    for (const [mult, level] of PARTIALS) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ac.createGain();
      envelope(g.gain, t, b.peak * level, 0.004, b.decay / Math.sqrt(mult));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + b.decay + 0.05);
      nodes.push({ node: o, at: t });
    }
  });
  return { nodes, endsAt: at + (b.notes.length - 1) * b.gap + b.decay + 0.05 };
}

const SILENT = { hurry() {}, stop() {}, audible: false };

// Sound for one spin. `ticks` and `landAt` are milliseconds from the start of
// the motion (reel.js); `lead` delays everything so the first tick and the
// first frame of motion leave together.
export function reelSound({ ticks = [], landAt = 0, chime = 'technique', lead = 0 } = {}, ac = take()) {
  if (!ac) return SILENT;
  try {
    const t0 = ac.currentTime + lead / 1000;
    const bus = ac.createGain();
    bus.gain.value = 0.9;
    bus.connect(ac.destination);
    const scheduled = [];
    ticks.forEach((ms, i) => scheduled.push(...tick(ac, bus, t0 + ms / 1000, i)));
    let landing = bell(ac, bus, t0 + landAt / 1000, chime);
    sleepAfter(ac, landing.endsAt + 0.3);
    const stopAll = (list, now) => { for (const s of list) { try { s.node.stop(now); } catch { /* already stopped */ } } };
    return {
      audible: true,
      // he tapped again mid-spin: the picture fast-forwards, so the ticks still
      // ahead are dropped and the chime moves to the new landing
      hurry(msToLand) {
        const now = ac.currentTime;
        stopAll(scheduled.filter((s) => s.at > now), now);
        stopAll(landing.nodes.filter((s) => s.at > now), now);
        landing = bell(ac, bus, now + Math.max(0, msToLand) / 1000, chime);
        sleepAfter(ac, landing.endsAt + 0.3);
      },
      stop() {
        const now = ac.currentTime;
        stopAll(scheduled, now);
        stopAll(landing.nodes, now);
        try { bus.disconnect(); } catch { /* gone */ }
      },
    };
  } catch { return SILENT; }
}

// What he just switched on, played once so he knows what it is.
export function previewSfx() {
  if (!primeSfx()) return;
  reelSound({ ticks: [0, 70, 160, 290], landAt: 470, chime: 'technique' });
}

// test hook — module state outlives a test file otherwise
export function _resetSfx() {
  ctx = null; armed = false; noise = null; clearTimeout(sleepTimer);
}

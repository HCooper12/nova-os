// Pre-renders every ack sentence to ttsLocal.js's disk cache, so the spoken
import os from 'node:os';
// acknowledgement that opens a turn is already sitting on disk by the time a
// real reply ever needs it (18 Oct 2026 — see ttsLocal.js's disk-cache
// comment for the measured problem this is half of).
//
// Acks come from a FINITE set of sentences: acks.js composes them, and the
// parent's `ackPrerenderList(vaultPath)` is meant to enumerate every
// distinct one. Until that export exists this throws a clear error instead
// of silently rendering nothing — a test can stub `list()` to exercise the
// rest of this file without it.
//
// Sequential, with a pause between lines, and never while a live /api/tts
// request is in flight (ttsBusy() from ttsLocal.js): this must never compete
// with him for the engine. Voice ids come from briefWarm.js's
// lastSpokenVoice() — the one voice his devices actually asked for — so
// nothing is rendered for a voice nobody uses.

export async function prerenderAcks({
  vaultPath,
  voiceIds,
  synth,
  has,
  list,
  sleepMs = 400,
  // the Mac comes first: while the load average sits above LOAD_MAX × cores
  // (a fresh boot with every app restoring, 18 Oct 2026: load 160+ on 10
  // cores), the pre-render waits rather than adding to it
  loadAvg = () => os.loadavg()[0],
  cores = os.cpus().length || 8,
  // Infinity by default so a test on a busy machine never waits on the real
  // load; index.js passes 2 for the real schedule
  loadMax = Infinity,
  loadWaitMs = 20_000,
  signal,
  busy,
} = {}) {
  const started = Date.now();
  const doSynth = synth || (await import('./ttsLocal.js')).synthesizeLocal;
  const doHas = has || (await import('./ttsLocal.js')).diskCacheHas;
  const doList = list || defaultList;
  const doBusy = busy || (await import('./ttsLocal.js')).ttsBusy;

  const sentences = await doList(vaultPath);
  if (!Array.isArray(sentences)) {
    throw new Error('ackPrerender: list() must resolve to an array of sentences');
  }

  const ids = voiceIds && voiceIds.length ? voiceIds : await defaultVoiceIds();

  let rendered = 0;
  let skipped = 0;
  let failed = 0;

  for (const voiceId of ids) {
    for (const text of sentences) {
      if (signal?.aborted) return summarize();
      // eslint-disable-next-line no-await-in-loop
      if (await doHas(text, voiceId)) { skipped++; continue; }
      // live replies come first — wait out any in-flight /api/tts before
      // touching the engine ourselves
      // eslint-disable-next-line no-await-in-loop
      while (doBusy() > 0) {
        if (signal?.aborted) return summarize();
        // eslint-disable-next-line no-await-in-loop
        await sleep(sleepMs);
      }
      // eslint-disable-next-line no-await-in-loop
      while (loadAvg() > loadMax * cores) {
        if (signal?.aborted) return summarize();
        // eslint-disable-next-line no-await-in-loop
        await sleep(loadWaitMs);
      }
      if (signal?.aborted) return summarize();
      try {
        // eslint-disable-next-line no-await-in-loop
        await doSynth(text, voiceId);
        rendered++;
      } catch {
        failed++;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(sleepMs); // never back-to-back — this never competes with a live reply
    }
  }
  return summarize();

  function summarize() {
    return { rendered, skipped, failed, ms: Date.now() - started };
  }
}

async function defaultList(vaultPath) {
  const acks = await import('./acks.js');
  if (typeof acks.ackPrerenderList !== 'function') {
    throw new Error('ackPrerender: acks.js has no ackPrerenderList() export yet — the finite ack vocabulary is not available to render');
  }
  return acks.ackPrerenderList(vaultPath);
}

async function defaultVoiceIds() {
  const { lastSpokenVoice } = await import('./briefWarm.js');
  const voiceId = await lastSpokenVoice();
  return [voiceId || undefined]; // undefined → the engine default
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

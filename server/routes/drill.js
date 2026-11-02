import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  enableOutboundWatch, disableOutboundWatch, outboundWatchOn, markTurn, currentTurnMark,
  connectionsSince, nonLocalHosts, withOutboundReason,
} from '../lib/outbound.js';
import { internetNeeds, stillNeedsInternet } from '../lib/internetNeeds.js';

// THE WI-FI-OFF DRILL, over the wire (2 Nov 2026; design/LOCAL-NOVA-PLAN.md
// §1b). scripts/drill.mjs marks a turn, runs one local-only turn, then reads
// back every host the server reached; scripts/preflight.mjs reads the honest
// list. Mounted under /api after the token gate in index.js; the router also
// checks the token itself when handed one, because a list of the hosts this
// Mac talks to is not something to hand an unauthenticated caller even if a
// future mount slips in front of the gate.
//
//   GET  /api/drill/connections?since=<ms>  the watcher's rows (hosts only)
//   POST /api/drill/turn   { label }         start watching, mark a turn
//   POST /api/drill/watch  { on }            switch the watcher on or off
//   POST /api/drill/run    { label? }        one local-only turn, watched
//   GET  /api/drill/needs                    what still needs the internet

const CLASSIFY_PROMPT = 'Classify this capture as one of: task, note, food, workout. Reply with JSON only, like {"kind":"task"}. Capture: "buy oat milk on the way home"';

/** A sentence long enough (over 80 characters) that the voice's disk cache
 *  skips it, and unique per run so the memory cache cannot answer for it:
 *  a cached line would measure nothing and write into server/data. */
export function drillSentence(now = new Date()) {
  const stamp = `${now.getHours()} ${String(now.getMinutes()).padStart(2, '0')} and ${now.getSeconds()} seconds`;
  return `Standing by. This is the drill, rendered fresh at ${stamp}, so the voice is measured for real.`;
}

const round = (ms) => Math.round(ms);

/** One local-only turn: a classify on the model on this Mac, a TTS render,
 *  and the ears when they are local. Each step reports ok / ms / error in
 *  its own words; a step that was not run says why. Never calls ElevenLabs
 *  (it costs) or a cloud transcriber (that is the internet). */
export async function runLocalTurn({ deps = {} } = {}) {
  const out = { classify: null, tts: null, ears: null };
  // THINK
  try {
    const { completeLocal } = deps.localModel || await import('../lib/localModel.js');
    const t0 = Date.now();
    const r = await withOutboundReason('drill: classify', () => completeLocal(CLASSIFY_PROMPT, { json: true, maxTokens: 40, timeoutMs: 60_000, waitForBoot: true }));
    out.classify = { ok: true, ms: round(Date.now() - t0), model: r.model, text: String(r.text || '').slice(0, 120) };
  } catch (e) {
    out.classify = { ok: false, error: e.message };
  }
  // SPEAK
  let clip = null;
  try {
    const tts = deps.tts || await import('../lib/tts.js');
    const engine = tts.ttsEngine();
    if (!engine) out.tts = { ok: false, skipped: true, error: 'no TTS engine is configured on this Mac' };
    else if (engine === 'elevenlabs') out.tts = { ok: false, skipped: true, engine, error: 'the voice is ElevenLabs; the drill does not call it (it costs, and it is the internet)' };
    else {
      const t0 = Date.now();
      clip = await withOutboundReason('drill: tts', () => tts.synthesize(drillSentence()));
      out.tts = { ok: true, engine, ms: round(Date.now() - t0), bytes: clip.length };
    }
  } catch (e) {
    out.tts = { ok: false, error: e.message };
  }
  // HEAR
  try {
    const tr = deps.transcribe || await import('../lib/transcribe.js');
    const be = await tr.loadWhisperBackend();
    if (!be) out.ears = { ok: false, skipped: true, error: 'no transcriber is configured on this Mac' };
    else if (be.backend === 'groq' || be.backend === 'openai') out.ears = { ok: false, skipped: true, backend: be.backend, error: `the ears are ${be.backend === 'groq' ? 'Groq' : 'OpenAI'} (internet); not exercised` };
    else if (!clip) out.ears = { ok: false, skipped: true, backend: be.backend, error: 'no voice clip to hear (the voice step did not run)' };
    else {
      const t0 = Date.now();
      const r = await withOutboundReason('drill: ears', () => tr.transcribeBuffer(clip, { mime: 'audio/mpeg', prompt: '' }));
      out.ears = { ok: true, backend: be.backend, ms: round(Date.now() - t0), text: r.text };
    }
  } catch (e) {
    out.ears = { ok: false, error: e.message };
  }
  return out;
}

function tokenGate(token) {
  if (!token) return (req, res, next) => next();
  const want = createHash('sha256').update(String(token)).digest();
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const got = createHash('sha256').update(auth.startsWith('Bearer ') ? auth.slice(7) : '').digest();
    if (!timingSafeEqual(got, want)) return res.status(401).json({ error: 'unauthorized' });
    next();
  };
}

export function drillRouter({ token = null, deps = {} } = {}) {
  const router = Router();
  router.use('/drill', tokenGate(token));

  router.get('/drill/connections', (req, res) => {
    const since = Number(req.query?.since) || 0;
    const rows = connectionsSince(since);
    res.json({ watching: outboundWatchOn(), turn: currentTurnMark(), since, rows, nonLocal: nonLocalHosts(rows) });
  });

  router.post('/drill/turn', (req, res) => {
    const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim() : 'drill';
    enableOutboundWatch();
    const turn = markTurn(label);
    res.json({ watching: true, turn, since: turn.at });
  });

  router.post('/drill/watch', (req, res) => {
    if (typeof req.body?.on !== 'boolean') return res.status(400).json({ error: 'send on: true or false' });
    if (req.body.on) enableOutboundWatch(); else disableOutboundWatch();
    res.json({ watching: outboundWatchOn() });
  });

  router.post('/drill/run', async (req, res) => {
    const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim() : 'drill';
    const wasOn = outboundWatchOn();
    enableOutboundWatch();
    const turn = markTurn(label);
    try {
      const steps = await runLocalTurn({ deps });
      const rows = connectionsSince(turn.at);
      res.json({ turn, steps, rows, nonLocal: nonLocalHosts(rows), watchedIn: 'server' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      if (!wasOn && process.env.NOVA_OUTBOUND_WATCH !== '1') disableOutboundWatch();
    }
  });

  router.get('/drill/needs', async (req, res) => {
    try {
      const needs = await (deps.internetNeeds || internetNeeds)();
      res.json({ needs, stillNeeds: stillNeedsInternet(needs) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

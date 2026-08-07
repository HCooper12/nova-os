import { Router } from 'express';
import { startAskNova, getMessageJob } from '../lib/claudeCode.js';
import { composeDispatch } from '../lib/dispatch.js';
import { ttsConfigured, listVoices, synthesize } from '../lib/tts.js';
import { buildAskContext } from '../lib/askContext.js';

// The voice line: Ask Nova (read-only Q&A job over the vault, polled via the
// shared /claude-code/message/:jobId endpoint) and the ElevenLabs TTS proxy.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function voiceRouter(vaultPath) {
  const router = Router();

  // Live context injected on the FIRST turn of a conversation; resumed turns
  // already carry it. Shared builder (lib/askContext.js) so the Voice
  // screen, the Siri sync ask, and the Telegram bridge can never drift.
  const askContext = (sessionId, opts) => buildAskContext(vaultPath, sessionId, opts);

  router.post('/ask', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      const jobId = startAskNova(vaultPath, { question, context: await askContext(sessionId), sessionId });
      res.json({ jobId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rituals — the morning brief / evening reflection conversations. The
  // instruction block is built server-side (versioned, tested) around a
  // dispatch composed fresh at tap time, then rides the normal ask pipeline.
  router.post('/ask/ritual', async (req, res) => {
    try {
      const { buildRitualQuestion, ritualLabel, RITUAL_KINDS } = await import('../lib/rituals.js');
      const kind = req.body?.kind;
      if (!RITUAL_KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be morning or evening' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      let dispatchText = '';
      try { dispatchText = (await composeDispatch(vaultPath, kind)).text; } catch { /* honest fallback in the builder */ }
      const question = buildRitualQuestion(kind, dispatchText);
      const jobId = startAskNova(vaultPath, { question, context: await askContext(sessionId), sessionId });
      res.json({ jobId, label: ritualLabel(kind) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Synchronous ask — starts the job and holds the response open until Nova
  // has answered, returning the plain text. This is what makes a hands-free
  // "Hey Siri, Ask Nova" Shortcut trivial: one request in, the spoken answer
  // out, no client-side polling.
  router.post('/ask/sync', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      // A real answer takes ~30s (context assembly + the model), and iOS
      // Shortcuts kills a request that sits SILENT that long — "The network
      // connection was lost". So flush the headers at once and drip a space
      // every few seconds while Nova thinks: leading whitespace is legal
      // JSON, so Get Dictionary Value still parses the result, and the
      // connection never looks idle to the phone.
      res.set('Content-Type', 'application/json');
      res.flushHeaders();
      const keepalive = setInterval(() => { try { res.write(' '); } catch { /* client gone */ } }, 3000);
      // status can't change after flushing, so failures answer 200 with a
      // spoken-friendly `text` — Siri says what went wrong instead of nothing
      const finish = (payload) => { clearInterval(keepalive); res.end(JSON.stringify(payload)); };

      const jobId = startAskNova(vaultPath, { question, context: await askContext(null, { fast: true }), direct: true });
      const deadline = Date.now() + 110_000;
      while (Date.now() < deadline) {
        if (res.writableEnded || res.destroyed) { clearInterval(keepalive); return; }
        const job = getMessageJob(jobId);
        if (job?.status === 'ready') return finish({ text: job.result.text, sessionId: job.result.sessionId });
        if (job?.status === 'error') return finish({ text: `Nova hit an error: ${job.error}`, error: job.error });
        await sleep(400);
      }
      finish({ text: 'Nova took too long to answer that one.', error: 'timeout' });
    } catch (e) {
      if (res.headersSent) { try { res.end(JSON.stringify({ text: `Nova hit an error: ${e.message}`, error: e.message })); } catch { /* gone */ } return; }
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tts/status', async (req, res) => {
    try {
      if (!ttsConfigured()) return res.json({ configured: false, voices: [] });
      const voices = await listVoices().catch(() => []);
      res.json({ configured: true, voices });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tts', async (req, res) => {
    try {
      if (!ttsConfigured()) return res.status(409).json({ error: 'ElevenLabs is not configured' });
      const audio = await synthesize(req.body?.text, req.body?.voiceId);
      res.set('Content-Type', 'audio/mpeg').send(audio);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

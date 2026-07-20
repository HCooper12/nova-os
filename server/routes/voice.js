import { Router } from 'express';
import { startAskNova, getMessageJob } from '../lib/claudeCode.js';
import { composeDispatch } from '../lib/dispatch.js';
import { ttsConfigured, listVoices, synthesize } from '../lib/tts.js';
import { profileContext } from '../lib/profile.js';
import { preferencesContext } from '../lib/learning.js';

// The voice line: Ask Nova (read-only Q&A job over the vault, polled via the
// shared /claude-code/message/:jobId endpoint) and the ElevenLabs TTS proxy.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function voiceRouter(vaultPath) {
  const router = Router();

  // Live context injected on the FIRST turn of a conversation; resumed turns
  // already carry it (and everything said since) in the session.
  async function askContext(sessionId) {
    if (sessionId) return '';
    const parts = [];
    try { parts.push(await profileContext(vaultPath)); } catch { /* optional */ }
    try { parts.push(await preferencesContext(vaultPath)); } catch { /* optional */ }
    try {
      const [morning, evening] = await Promise.all([
        composeDispatch(vaultPath, 'morning'),
        composeDispatch(vaultPath, 'evening'),
      ]);
      parts.push(`${morning.text}\n\n${evening.text}`);
    } catch { /* the prompt says "(unavailable)" honestly */ }
    return parts.join('\n\n');
  }

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

  // Synchronous ask — starts the job and holds the response open until Nova
  // has answered, returning the plain text. This is what makes a hands-free
  // "Hey Siri, Ask Nova" Shortcut trivial: one request in, the spoken answer
  // out, no client-side polling.
  router.post('/ask/sync', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      const jobId = startAskNova(vaultPath, { question, context: await askContext(null) });
      const deadline = Date.now() + 110_000;
      while (Date.now() < deadline) {
        const job = getMessageJob(jobId);
        if (job?.status === 'ready') return res.json({ text: job.result.text, sessionId: job.result.sessionId });
        if (job?.status === 'error') return res.status(500).json({ error: job.error });
        await sleep(400);
      }
      res.status(504).json({ error: 'Nova took too long to answer' });
    } catch (e) {
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

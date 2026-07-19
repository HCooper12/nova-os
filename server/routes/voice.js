import { Router } from 'express';
import { startAskNova } from '../lib/claudeCode.js';
import { composeDispatch } from '../lib/dispatch.js';
import { ttsConfigured, listVoices, synthesize } from '../lib/tts.js';

// The voice line: Ask Nova (read-only Q&A job over the vault, polled via the
// shared /claude-code/message/:jobId endpoint) and the ElevenLabs TTS proxy.

export function voiceRouter(vaultPath) {
  const router = Router();

  router.post('/ask', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;

      // Live context injected on the FIRST turn of a conversation; resumed
      // turns already carry it (and everything said since) in the session.
      let context = '';
      if (!sessionId) {
        try {
          const [morning, evening] = await Promise.all([
            composeDispatch(vaultPath, 'morning'),
            composeDispatch(vaultPath, 'evening'),
          ]);
          context = `${morning.text}\n\n${evening.text}`;
        } catch { /* the prompt says "(unavailable)" honestly */ }
      }

      const jobId = startAskNova(vaultPath, { question, context, sessionId });
      res.json({ jobId });
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

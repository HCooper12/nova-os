import { Router } from 'express';
import { appendTurns, readTurns } from '../lib/conversationLog.js';

// The conversation record (lib/conversationLog.js): the app mirrors its
// voice-chat lines here, and the Voice screen reads the whole record back,
// so every device and every door shows the same history.
export function conversationRouter() {
  const router = Router();

  router.get('/conversation', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 150, 1), 1000);
      const since = typeof req.query.since === 'string' && req.query.since ? req.query.since : null;
      const before = typeof req.query.before === 'string' && req.query.before ? req.query.before : null;
      res.json({ turns: await readTurns({ limit, since, before }) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/conversation', async (req, res) => {
    try {
      const turns = req.body?.turns;
      if (!Array.isArray(turns) || !turns.length) return res.status(400).json({ error: 'turns must be a non-empty array' });
      if (turns.length > 200) return res.status(400).json({ error: 'at most 200 turns per request' });
      const stored = await appendTurns(turns);
      res.json({ ok: true, stored: stored.map((t) => t.id) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

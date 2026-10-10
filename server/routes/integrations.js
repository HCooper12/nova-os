import { Router } from 'express';
import { notionStatus, saveNotionToken, clearNotionToken } from '../lib/notionAuth.js';

// THIRD-PARTY KEYS HE GIVES NOVA FROM HIS PHONE. The first is Notion: he
// pastes an internal integration's secret here, the server checks it with
// Notion itself before keeping it, and the key is stored privately on his
// Mac (server/lib/notionAuth.js) — never echoed back, never logged. This
// router sits behind the same /api auth every other route does; nothing
// here adds a second gate.
export function integrationsRouter() {
  const router = Router();

  router.get('/integrations/notion', async (req, res) => {
    try {
      res.json(await notionStatus());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/integrations/notion', async (req, res) => {
    try {
      const token = req.body?.token;
      if (typeof token !== 'string' || !token.trim()) return res.status(400).json({ error: 'token is required' });
      await saveNotionToken(token);
      // never the token itself — just what Notion said about the connection
      res.json(await notionStatus());
    } catch (e) {
      // 422, never 401: a 401 from Nova means HIS Nova token failed, not Notion's key
      const status = e.message === 'Notion did not accept that key' ? 422 : 502;
      res.status(status).json({ error: e.message });
    }
  });

  router.delete('/integrations/notion', async (req, res) => {
    try {
      await clearNotionToken();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

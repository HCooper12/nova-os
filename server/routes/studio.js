import { Router } from 'express';
import { setIdeaStatus, startOutline, IDEA_STATUSES } from '../lib/studio.js';

export function studioRouter(vaultPath) {
  const router = Router();

  router.post('/studio/idea/:id/status', async (req, res) => {
    try {
      res.json(await setIdeaStatus(vaultPath, req.params.id, req.body?.status));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/studio/idea/:id/outline', async (req, res) => {
    try {
      res.json({ record: await startOutline(vaultPath, req.params.id) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/studio/statuses', (req, res) => res.json({ statuses: IDEA_STATUSES }));

  return router;
}

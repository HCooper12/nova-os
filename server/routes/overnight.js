import { Router } from 'express';
import { listOvernight, enqueueOvernight, removeOvernightItem, runOvernightQueue } from '../lib/overnight.js';

// The overnight queue: list, enqueue, remove, and a run-now for demos and
// impatience. Running never bypasses review — results land as pending
// records exactly as a daytime run would.
export function overnightRouter(vaultPath) {
  const router = Router();

  router.get('/overnight', async (req, res) => {
    try { res.json(await listOvernight()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/overnight', async (req, res) => {
    try {
      const item = await enqueueOvernight({ kind: 'research', question: req.body?.question });
      res.json({ item, ...(await listOvernight()) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/overnight/remove', async (req, res) => {
    try {
      await removeOvernightItem(req.body?.id);
      res.json(await listOvernight());
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/overnight/run', async (req, res) => {
    try {
      // fire-and-return: the queue grinds on its own; the client watches
      // item statuses via the normal sync
      runOvernightQueue(vaultPath, { force: true }).catch((e) => console.error('overnight run-now failed:', e.message));
      res.json({ started: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

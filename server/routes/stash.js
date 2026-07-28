import { Router } from 'express';
import { loadStash, addStashItem, removeStashItem } from '../lib/stash.js';

// The Stash — categorised restock/reference links (Wiki/Library/Stash.md).
export function stashRouter(vaultPath) {
  const router = Router();

  router.get('/stash', async (_req, res) => {
    try {
      res.json(await loadStash(vaultPath));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/stash/items', async (req, res) => {
    try {
      res.json(await addStashItem(vaultPath, req.body || {}));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST (not DELETE) — identity travels in the body as the exact raw line
  router.post('/stash/items/remove', async (req, res) => {
    try {
      if (typeof req.body?.raw !== 'string') return res.status(400).json({ error: 'raw line is required' });
      res.json(await removeStashItem(vaultPath, req.body.raw));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

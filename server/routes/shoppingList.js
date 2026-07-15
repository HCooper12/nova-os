import { Router } from 'express';
import { loadShoppingList, toggleItem, confirmCompletion, startAddItems, getAddItemsJob } from '../lib/shoppingList.js';

export function shoppingListRouter(vaultPath) {
  const router = Router();

  router.get('/shopping-list', async (req, res, next) => {
    try {
      const list = await loadShoppingList(vaultPath);
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  router.post('/shopping-list/items', async (req, res, next) => {
    try {
      const items = req.body?.items;
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'at least one item is required' });
      if (items.length > 60) return res.status(400).json({ error: 'up to 60 items per add' });
      for (const it of items) {
        if (!it || typeof it.name !== 'string' || !it.name.trim()) return res.status(400).json({ error: 'each item needs a name' });
      }
      const jobId = startAddItems(vaultPath, items.map((it) => ({
        name: it.name.trim(),
        source: it.source ? String(it.source).trim() : null,
      })));
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/shopping-list/add-items/:jobId', (req, res) => {
    const job = getAddItemsJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, items: job.items, error: job.error });
  });

  router.post('/shopping-list/toggle', async (req, res, next) => {
    try {
      const { id, checked } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const items = await toggleItem(vaultPath, id, !!checked);
      res.json({ items });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/shopping-list/confirm-completion', async (req, res, next) => {
    try {
      const items = await confirmCompletion(vaultPath);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

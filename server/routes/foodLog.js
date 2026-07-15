import { Router } from 'express';
import { addEntry, removeEntry, getToday } from '../lib/foodLog.js';

export function foodLogRouter() {
  const router = Router();

  router.get('/food-log', async (req, res, next) => {
    try {
      res.json(await getToday());
    } catch (err) {
      next(err);
    }
  });

  router.post('/food-log', async (req, res, next) => {
    try {
      const { name, macros } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
      if (!macros || [macros.p, macros.c, macros.f, macros.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
        return res.status(400).json({ error: 'macros.p/c/f/kcal must be non-negative numbers' });
      }
      const day = await addEntry({ name: name.trim(), macros });
      res.json(day);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/food-log/:id', async (req, res, next) => {
    try {
      res.json(await removeEntry(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

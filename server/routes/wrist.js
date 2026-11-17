import { Router } from 'express';
import { buildWristToday, logUsual, undoUsual } from '../lib/wristToday.js';

// The Apple Watch's two calls: one small read of the day, and a one-tap food
// log with its undo. Mounted under /api by server/index.js.
export function wristRouter(vaultPath) {
  const router = Router();

  router.get('/wrist/today', async (req, res) => {
    try {
      res.json(await buildWristToday(vaultPath));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/wrist/food', async (req, res) => {
    const key = req.body?.key;
    if (typeof key !== 'string' || !key) return res.status(400).json({ error: 'key is required' });
    try {
      res.json(await logUsual(vaultPath, key));
    } catch (err) {
      if (err.code === 'unknown_usual') return res.status(404).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/wrist/food/:id/undo', async (req, res) => {
    try {
      res.json(await undoUsual(vaultPath, req.params.id, { date: req.body?.date }));
    } catch (err) {
      if (err.code === 'not_found') return res.status(404).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

export default wristRouter;

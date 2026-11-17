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
    // a portion: a multiplier on what he last logged, in quarter steps
    const times = req.body?.times === undefined || req.body?.times === null ? 1 : req.body.times;
    if (typeof times !== 'number' || !Number.isFinite(times) || times < 0.25 || times > 4 || Math.abs(times * 4 - Math.round(times * 4)) > 1e-9) {
      return res.status(400).json({ error: 'times must be between 0.25 and 4 in quarter steps' });
    }
    try {
      res.json(await logUsual(vaultPath, key, { times }));
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

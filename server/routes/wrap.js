import { Router } from 'express';
import { wrapDay } from '../lib/wrapDay.js';

// WRAP THE DAY (lib/wrapDay.js) — one deterministic sentence about the day's
// food against his targets, the fix that is still available tonight, and the
// one thing tomorrow needs. No model, so it is cheap enough to ride every
// sync and honest enough to speak without review.
export function wrapRouter(vaultPath) {
  const router = Router();
  router.get('/wrap', async (req, res, next) => {
    try {
      res.json(await wrapDay(vaultPath, { now: new Date() }));
    } catch (err) {
      next(err);
    }
  });
  return router;
}

import { Router } from 'express';
import { composeOps } from '../lib/ops.js';

// Nova Operations — one read-only endpoint; everything it reports is
// assembled from state the platform already keeps (records + heartbeats).
export function opsRouter() {
  const router = Router();
  router.get('/ops', async (req, res) => {
    try {
      res.json(await composeOps());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  return router;
}

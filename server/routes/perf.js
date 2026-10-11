// /api/perf/skillsets: the phone's frame report in, the last rows out.
import { Router } from 'express';
import { appendPerf, readPerf } from '../lib/perfLog.js';

export function perfRouter() {
  const router = Router();
  router.post('/perf/skillsets', async (req, res) => {
    try { await appendPerf('skillsets', req.body); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });
  router.get('/perf/skillsets', async (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    res.json({ rows: await readPerf('skillsets', limit) });
  });
  return router;
}

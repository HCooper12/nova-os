import { Router } from 'express';
import { saveDay, loadRecentDays, HEALTH_METRICS } from '../lib/healthData.js';
import { getLatestInsight, generateInsightNow } from '../lib/healthInsight.js';

export function healthDataRouter(vaultPath) {
  const router = Router();

  router.get('/health-insight', async (req, res, next) => {
    try {
      res.json(await getLatestInsight());
    } catch (err) {
      next(err);
    }
  });

  router.post('/health-insight/generate', async (req, res, next) => {
    try {
      res.json(await generateInsightNow(vaultPath));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/health-data', async (req, res, next) => {
    try {
      const date = req.body?.date;
      const metrics = req.body?.metrics;
      if (typeof date !== 'string') return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
      if (!metrics || typeof metrics !== 'object') return res.status(400).json({ error: 'metrics object is required' });
      const saved = await saveDay(date, metrics);
      res.json({ day: saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/health-data', async (req, res, next) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 14;
      const data = await loadRecentDays(days);
      res.json({ days: data, metrics: HEALTH_METRICS });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

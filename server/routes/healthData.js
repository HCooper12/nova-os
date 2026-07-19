import { Router } from 'express';
import { saveDay, loadRecentDays, HEALTH_METRICS } from '../lib/healthData.js';
import { getLatestInsight, generateInsightNow } from '../lib/healthInsight.js';
import { computeStreaks } from '../lib/streaks.js';

export function healthDataRouter(vaultPath) {
  const router = Router();

  router.get('/streaks', async (req, res, next) => {
    try {
      res.json(await computeStreaks(vaultPath));
    } catch (err) {
      next(err);
    }
  });

  router.get('/health-insight', async (req, res, next) => {
    try {
      res.json(await getLatestInsight());
    } catch (err) {
      next(err);
    }
  });

  router.post('/health-insight/generate', async (req, res, next) => {
    try {
      const slot = req.body?.slot === 'morning' ? 'morning' : (req.body?.slot === 'evening' ? 'evening' : (new Date().getHours() < 12 ? 'morning' : 'evening'));
      res.json(await generateInsightNow(vaultPath, slot));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/health-data', async (req, res, next) => {
    try {
      // Tolerate a raw-text JSON body — iOS Shortcuts sending the body as a
      // text/plain "File" rather than JSON is a common footgun; parse it
      // rather than reject an otherwise-valid push.
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* leave as-is; validation below fails honestly */ }
      }
      const date = body?.date;
      const metrics = body?.metrics;
      if (typeof date !== 'string') return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
      if (!metrics || typeof metrics !== 'object') return res.status(400).json({ error: 'metrics object is required' });
      const saved = await saveDay(date, metrics);
      const { broadcast } = await import('../lib/events.js');
      broadcast('health');
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

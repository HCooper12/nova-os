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
      let date = body?.date;
      const { logPushAttempt } = await import('../lib/healthData.js');
      if (typeof date !== 'string') {
        await logPushAttempt({ ok: false, error: 'date missing', keys: Object.keys(body || {}) });
        return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
      }
      // Accept EITHER {date, metrics:{...}} OR a flat {date, steps, hrv, ...}
      // — the flat shape is far simpler to build in a Shortcut (one
      // dictionary, no nesting). saveDay ignores keys it doesn't know.
      let metrics = body?.metrics;
      if (!metrics || typeof metrics !== 'object') {
        const { date: _omit, metrics: _m, manual: _man, ...rest } = body || {};
        metrics = rest;
      }
      if (!metrics || !Object.keys(metrics).length) {
        await logPushAttempt({ ok: false, date, error: 'no metrics' });
        return res.status(400).json({ error: 'at least one metric is required (steps, hrv, sleepAsleepMinutes, …)' });
      }
      // A 12:05am push carries yesterday's rolling-window numbers under
      // today's date — file it against the day it actually describes.
      let dateShifted = false;
      if (body?.manual !== true) {
        const { resolvePushDate } = await import('../lib/healthData.js');
        const resolved = resolvePushDate(date);
        date = resolved.date;
        dateShifted = resolved.shifted;
      }
      // The monotonic-steps rule: for a PAST day only a HIGHER reading may
      // replace what's stored (steps only ever increase within a day, so a
      // lower later push is a truncated reading). Manual edits always win.
      let stepsDropped = false;
      if (body?.manual !== true && metrics.steps != null) {
        const { loadDay, shouldDropPastSteps } = await import('../lib/healthData.js');
        const existing = await loadDay(date);
        if (shouldDropPastSteps(date, existing?.steps, metrics.steps)) {
          delete metrics.steps;
          stepsDropped = true;
          if (!Object.keys(metrics).length) {
            await logPushAttempt({ ok: true, date, keys: [], steps: null, stepsDropped });
            return res.json({ day: existing, note: 'that steps figure was lower than the one already recorded for that day — kept the higher reading' });
          }
        }
      }
      const saved = await saveDay(date, metrics, { manual: body?.manual === true });
      await logPushAttempt({ ok: true, date, keys: Object.keys(metrics), steps: metrics.steps ?? null, ...(stepsDropped ? { stepsDropped } : {}), ...(dateShifted ? { dateShifted: true } : {}) });
      const { broadcast } = await import('../lib/events.js');
      broadcast('health');
      res.json({ day: saved });
    } catch (err) {
      const { logPushAttempt } = await import('../lib/healthData.js');
      await logPushAttempt({ ok: false, error: err.message });
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

import { Router } from 'express';
import { loadRecentDays, HEALTH_METRICS } from '../lib/healthData.js';
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
      // The exact bytes the phone sent. Key names alone could not explain a
      // Shortcut whose visible actions built one payload while another
      // arrived — a whole afternoon went into inferring what this records
      // directly. Truncated; health metrics only, never credentials.
      const rawBody = (typeof body === 'string' ? body : JSON.stringify(body ?? null) || '').slice(0, 600);
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* leave as-is; validation below fails honestly */ }
      }
      let date = body?.date;
      const { logPushAttempt } = await import('../lib/healthData.js');
      if (typeof date !== 'string') {
        await logPushAttempt({ ok: false, error: 'date missing', keys: Object.keys(body || {}), rawBody });
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
        await logPushAttempt({ ok: false, date, error: 'no metrics', rawBody });
        return res.status(400).json({ error: 'at least one metric is required (steps, hrv, sleepAsleepMinutes, …)' });
      }
      // The fold, the midnight date-shift, and the monotonic-steps guard all
      // live in the SHARED ingest gate (lib/healthData.ingestHealthPayload)
      // — one format, both transports (this route + the drops folder).
      const { ingestHealthPayload } = await import('../lib/healthData.js');
      const result = await ingestHealthPayload({ date, metrics, manual: body?.manual === true, rawBody });
      if (!result.ok) return res.status(400).json({ error: result.error });
      if (result.allDropped) {
        const which = result.droppedKeys?.length ? result.droppedKeys.join(', ') : 'that reading';
        return res.json({ day: result.day, note: `${which} was lower than what's already recorded for that day — kept the higher reading` });
      }
      const { broadcast } = await import('../lib/events.js');
      broadcast('health');
      res.json({ day: result.day });
    } catch (err) {
      const { logPushAttempt } = await import('../lib/healthData.js');
      await logPushAttempt({ ok: false, error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  // Health Auto Export (a real app, real HealthKit entitlements) can reach
  // Apple's own de-duplicated aggregation — the thing a Shortcut cannot do.
  // See lib/autoExport.js for why, and its UNVERIFIED note: this route has
  // never seen a real payload from the app. Every date it finds still goes
  // through the SAME ingestHealthPayload gate as every other channel —
  // skipDateShift because these dates are already real per-sample calendar
  // dates, not a single ambiguous "today" claim; the monotonic guard stays
  // on, because a same-day re-sync should still only grow, never shrink.
  router.post('/health-data/auto-export', async (req, res, next) => {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* leave as-is; parser below fails honestly */ }
      }
      const { logPushAttempt, ingestHealthPayload } = await import('../lib/healthData.js');
      const { parseAutoExportPayload } = await import('../lib/autoExport.js');
      const { perDate, warnings } = parseAutoExportPayload(body);
      if (!perDate.size) {
        await logPushAttempt({ ok: false, source: 'auto-export', error: 'no usable metrics', warnings });
        return res.status(400).json({ error: 'no usable metrics', warnings });
      }
      const days = [];
      for (const [date, { metrics, warnings: dateWarnings }] of perDate) {
        const rawBody = JSON.stringify({ date, metrics }).slice(0, 600);
        const result = await ingestHealthPayload({ date, metrics, source: 'auto-export', skipDateShift: true, rawBody });
        days.push({ date, ...result, warnings: dateWarnings });
      }
      const { broadcast } = await import('../lib/events.js');
      broadcast('health');
      res.json({ days, warnings });
    } catch (err) {
      const { logPushAttempt } = await import('../lib/healthData.js');
      await logPushAttempt({ ok: false, source: 'auto-export', error: err.message });
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

import { Router } from 'express';

// THE ALERT LAYER's two doors (lib/alerts.js): the island's list, and the
// receipt of what he did with one. The list rides the snapshot as `alerts`.
export function alertsRouter() {
  const router = Router();

  router.get('/alerts', async (req, res) => {
    try {
      const { pendingAlerts, spokenAlert, firstThingLine, forPlace } = await import('../lib/alerts.js');
      const { PLACES } = await import('../lib/register.js');
      // where the asking device is (src/where.js), from the closed set only:
      // each card says whether it may show, may speak, or waits
      const place = PLACES.includes(req.query.place) ? req.query.place : 'unknown';
      // the lines he may hear ride with each card, written here by code, so
      // the phone never composes a word of an alert
      // ONE THING FIRST, FOR A FAULT (lib/firstLineFaults.js): the faults Nova
      // may open his next spoken turn with, in their source's own words, and
      // which he has heard today. The phone picks one (src/firstLine.js).
      const { firstLineState } = await import('../lib/firstLineFaults.js');
      let firstLine = null;
      try { firstLine = await firstLineState(); } catch { firstLine = null; }
      res.json({ place, alerts: pendingAlerts().map((a) => forPlace({ ...a, spoken: spokenAlert(a), firstThing: a.tier === 'next' ? firstThingLine(a) : null }, place)), firstLine });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // he heard this fault's line today: never again today (lib/firstLineFaults.js)
  router.post('/alerts/first-line/heard', async (req, res) => {
    try {
      const { markHeard, FAULT_ID } = await import('../lib/firstLineFaults.js');
      const id = String(req.body?.id || '');
      if (!FAULT_ID.test(id)) return res.status(400).json({ error: 'id must be a fault id (guardian:… or alert:…)' });
      const heard = await markHeard(id);
      try { (await import('../lib/events.js')).broadcast('alerts'); } catch { /* the next sync carries it */ }
      res.json({ ok: true, day: heard.day, heard: heard.ids });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/alerts/:id/acted', async (req, res) => {
    try {
      const { markActed, ACTED } = await import('../lib/alerts.js');
      const how = req.body?.how;
      if (!ACTED.includes(how)) return res.status(400).json({ error: `how must be one of ${ACTED.join(', ')}` });
      const row = await markActed(String(req.params.id).slice(0, 40), how);
      if (!row) return res.status(404).json({ error: 'no such alert' });
      res.json({ ok: true, acted: row.acted });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

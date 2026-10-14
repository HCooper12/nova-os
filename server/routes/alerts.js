import { Router } from 'express';

// THE ALERT LAYER's two doors (lib/alerts.js): the island's list, and the
// receipt of what he did with one. The list rides the snapshot as `alerts`.
export function alertsRouter() {
  const router = Router();

  router.get('/alerts', async (req, res) => {
    try {
      const { pendingAlerts, spokenAlert, firstThingLine } = await import('../lib/alerts.js');
      // the lines he may hear ride with each card, written here by code, so
      // the phone never composes a word of an alert
      res.json({ alerts: pendingAlerts().map((a) => ({ ...a, spoken: spokenAlert(a), firstThing: a.tier === 'next' ? firstThingLine(a) : null })) });
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

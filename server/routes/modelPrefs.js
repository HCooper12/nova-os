import { Router } from 'express';
import { getModelPrefs, setLanePref, resetLanePref } from '../lib/modelPrefs.js';
import { spendSummary } from '../lib/modelSpend.js';

// The model board — which Claude model every lane in Nova runs on, and
// whether it runs. Server-side (not per-device localStorage) for the same
// reason the inbox autonomy mode is: a lane switched off on the phone must
// be off for the schedulers on the Mac too, or the setting is a lie.
export function modelPrefsRouter() {
  const router = Router();

  router.get('/model-prefs', (req, res) => {
    try {
      res.json(getModelPrefs());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // What every lane actually costs, over a trailing window — the numbers
  // getModelPrefs() already folds into each lane's `spend` field, exposed
  // here directly for a caller that wants a different window than the
  // board's own 7 days.
  router.get('/model-spend', (req, res) => {
    try {
      const days = Number(req.query?.days);
      res.json(spendSummary(Number.isFinite(days) && days > 0 ? { days } : {}));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // QUIET HOURS (his call, 3 Oct 2026: "Yes notifications respect quiet
  // hours"). Server-side with the model board, for the same reason: the
  // pushes are sent from the Mac, so the window must live where they are
  // sent. Times are his Melbourne clock ("22:00"); `waiting` is how many
  // pushes are held for the end of the window right now.
  const quietView = async () => {
    const { getQuietHours, TIME_ZONE } = await import('../lib/quietHours.js');
    const { heldPushes } = await import('../lib/push.js');
    return { ...getQuietHours(), timeZone: TIME_ZONE, waiting: (await heldPushes()).length };
  };
  router.get('/prefs/quiet-hours', async (req, res) => {
    try {
      res.json(await quietView());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  // { enabled?, start?, end? }: any one alone. Turning it off, or moving the
  // window so that now is outside it, delivers what is held at once.
  router.put('/prefs/quiet-hours', async (req, res) => {
    try {
      const { setQuietHours } = await import('../lib/quietHours.js');
      const patch = {};
      for (const k of ['enabled', 'start', 'end']) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'send enabled, start or end' });
      await setQuietHours(patch);
      const { flushHeldPushes } = await import('../lib/push.js');
      await flushHeldPushes().catch((e) => console.log(`quiet hours: held pushes could not be delivered: ${e.message}`));
      res.json(await quietView());
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // One lane per call: { lane, model?, enabled? }. Either field may be sent
  // alone, so flipping a toggle never silently rewrites the model too.
  router.put('/model-prefs', async (req, res) => {
    try {
      const lane = req.body?.lane;
      if (typeof lane !== 'string' || !lane) return res.status(400).json({ error: 'lane is required' });
      const patch = {};
      if (req.body?.model !== undefined) patch.model = req.body.model;
      if (req.body?.enabled !== undefined) patch.enabled = req.body.enabled;
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'send a model, an enabled flag, or both' });
      res.json(await setLanePref(lane, patch));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Back to how it shipped — one lane, or the whole board with no `lane`.
  router.post('/model-prefs/reset', async (req, res) => {
    try {
      res.json(await resetLanePref(req.body?.lane || null));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Manual trigger for the model fail-safe (server/lib/modelWatch.js) — the
  // weekly scheduler runs this on its own; this is for "run it now" rather
  // than waiting for the window. Costs about 15c (four cheap probes).
  router.post('/model-watch/run', async (req, res) => {
    try {
      const { runModelWatch } = await import('../lib/modelWatch.js');
      res.json(await runModelWatch());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

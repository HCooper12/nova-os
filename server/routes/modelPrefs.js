import { Router } from 'express';
import { getModelPrefs, setLanePref, resetLanePref } from '../lib/modelPrefs.js';

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

  return router;
}

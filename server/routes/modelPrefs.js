import { Router } from 'express';
import { getModelPrefs, setLanePref, resetLanePref, setFallback, setLocalPrefs, refreshLocalStatus } from '../lib/modelPrefs.js';
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

  // One lane per call: { lane, model?, enabled?, effort?, provider? }. Any field
  // may be sent alone, so flipping a toggle never silently rewrites the model too.
  // provider: 'claude' | 'local' (only a lane with canRunLocal takes 'local').
  router.put('/model-prefs', async (req, res) => {
    try {
      const lane = req.body?.lane;
      if (typeof lane !== 'string' || !lane) return res.status(400).json({ error: 'lane is required' });
      const patch = {};
      if (req.body?.model !== undefined) patch.model = req.body.model;
      if (req.body?.enabled !== undefined) patch.enabled = req.body.enabled;
      // thinking effort, per lane (lib/modelPrefs.js effortFor)
      if (req.body?.effort !== undefined) patch.effort = req.body.effort;
      // who answers: Claude or the model on this Mac (lib/textLane.js)
      if (req.body?.provider !== undefined) patch.provider = req.body.provider;
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'send a model, an enabled flag, an effort, a provider, or any of them' });
      res.json(await setLanePref(lane, patch));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // The board-wide fallback: { enabled }. On, a `local: true` lane that Claude
  // answers with the usage-limit notice is answered by the local model instead.
  router.put('/model-prefs/fallback', async (req, res) => {
    try {
      res.json(await setFallback({ enabled: req.body?.enabled }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // The board-wide local settings: { first?, model? }, either alone. `first`
  // on, the lanes that can run on this Mac do, and ask Claude only when it
  // cannot answer (lib/textLane.js); `model` picks which pulled model runs
  // (null clears the pick). Returns the whole board.
  router.put('/model-prefs/local', async (req, res) => {
    try {
      const patch = {};
      if (req.body?.first !== undefined) patch.first = req.body.first;
      if (req.body?.model !== undefined) patch.model = req.body.model;
      res.json(await setLocalPrefs(patch));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Load the local model now, so the first local answer is not the one that
  // waits for it. Refused (with the reason) when this Mac has no memory to
  // spare; an already-running model is simply reported ready. Waits at most
  // NOVA_LOCAL_LLM_WAIT_MS (90 s): past that it answers 202 with
  // `warming: true` and the load carries on in the background.
  // Success → 200 with the board's `local` block; failure → 503 { error, ...local }.
  router.post('/model-prefs/local/warm', async (req, res) => {
    const { ensureLocalModel } = await import('../lib/localModel.js');
    const waitMs = Number(process.env.NOVA_LOCAL_LLM_WAIT_MS || 90_000);
    let timer = null;
    try {
      const boot = ensureLocalModel();
      const outcome = await Promise.race([
        boot.then(() => 'ready'),
        new Promise((r) => { timer = setTimeout(() => r('warming'), waitMs); timer.unref?.(); }),
      ]);
      if (outcome === 'warming') boot.catch(() => {}).finally(() => { refreshLocalStatus().catch(() => {}); });
      const local = await refreshLocalStatus();
      if (outcome === 'warming') return res.status(202).json({ ...local, warming: true });
      res.json(local);
    } catch (e) {
      const local = await refreshLocalStatus().catch(() => ({}));
      res.status(503).json({ error: e.message, ...local });
    } finally {
      clearTimeout(timer);
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

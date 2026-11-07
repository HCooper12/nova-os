import { Router } from 'express';
import { loadBeliefs, beliefsHome, confirmBelief, quietHome } from '../lib/beliefs.js';

// WHAT NOVA BELIEVES (lib/beliefs.js). A read of what the agents act on, a
// tick that stamps a date, a cross that goes through the verb registry (so it
// lands a receipt on the inbox rails and Undo is the Inbox's own), and the
// Home card's quiet period. No model anywhere on this route.
export function beliefsRouter(vaultPath) {
  const router = Router();
  const fail = (res, e, code = 400) => res.status(code).json({ error: e.message });

  router.get('/beliefs', async (req, res) => {
    try { res.json(await loadBeliefs(vaultPath)); } catch (e) { fail(res, e, 500); }
  });
  // the Home card's own cheap read; rides the snapshot
  router.get('/beliefs/home', async (req, res) => {
    res.json(await beliefsHome(vaultPath));
  });
  router.post('/beliefs/home/quiet', async (req, res) => {
    try { res.json(await quietHome()); } catch (e) { fail(res, e, 500); }
  });
  router.post('/beliefs/:id/confirm', async (req, res) => {
    try { res.json(await confirmBelief(vaultPath, req.params.id)); } catch (e) { fail(res, e); }
  });
  router.post('/beliefs/:id/drop', async (req, res) => {
    try {
      const { runVerb } = await import('../lib/verbs.js');
      const out = await runVerb(vaultPath, 'crossed out a belief', { verb: 'belief.drop', args: { id: req.params.id } }, { source: 'beliefs', direct: true });
      res.json(out.acted);
    } catch (e) { fail(res, e); }
  });
  return router;
}

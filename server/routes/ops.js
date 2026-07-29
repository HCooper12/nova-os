import { Router } from 'express';
import { composeOps } from '../lib/ops.js';
import { loadSkills } from '../lib/skills.js';

// Nova Operations — read-only endpoints; everything reported is assembled
// from state the platform already keeps (records, heartbeats, the skill
// registry page in the vault).
export function opsRouter(vaultPath) {
  const router = Router();
  router.get('/ops', async (req, res) => {
    try {
      res.json(await composeOps());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  router.get('/skills', async (req, res) => {
    try {
      res.json({ departments: await loadSkills(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  router.get('/pulse', async (req, res) => {
    try {
      const { getPulse, loadInterests } = await import('../lib/pulse.js');
      res.json({ topics: await getPulse(), interests: await loadInterests(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  return router;
}

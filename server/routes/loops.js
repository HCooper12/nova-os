import express from 'express';
import { getDispatchStatus, setDispatchConfig, runDispatch, DISPATCH_MODES } from '../lib/dispatch.js';
import { getCompost, runCompost, acceptProposal, dismissProposal } from '../lib/compost.js';

// The loops: Morning Dispatch (daily brief on the inbox rails) and the
// Compost loop (weekly read-only vault hygiene proposals).
export function loopsRouter(vaultPath) {
  const router = express.Router();

  router.get('/dispatch', async (req, res) => {
    try {
      res.json(await getDispatchStatus());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/dispatch/config', async (req, res) => {
    try {
      const patch = {};
      if (req.body?.mode !== undefined) {
        if (!DISPATCH_MODES.includes(req.body.mode)) return res.status(400).json({ error: 'mode must be one of ' + DISPATCH_MODES.join(', ') });
        patch.mode = req.body.mode;
      }
      if (req.body?.hour !== undefined) {
        const hour = Number(req.body.hour);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return res.status(400).json({ error: 'hour must be 0–23' });
        patch.hour = hour;
      }
      const config = await setDispatchConfig(patch);
      res.json({ config });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/dispatch/run', async (req, res) => {
    try {
      res.json(await runDispatch(vaultPath, { force: req.body?.force === true }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/compost', async (req, res) => {
    try {
      res.json(await getCompost());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/compost/run', async (req, res) => {
    try {
      res.json(await runCompost(vaultPath));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/compost/:id/accept', async (req, res) => {
    try {
      res.json(await acceptProposal(vaultPath, req.params.id));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/compost/:id/dismiss', async (req, res) => {
    try {
      res.json({ proposal: await dismissProposal(req.params.id) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

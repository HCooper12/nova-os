import express from 'express';
import { getDispatchStatus, setDispatchConfig, runDispatch, DISPATCH_MODES, DISPATCH_SLOTS } from '../lib/dispatch.js';
import { getCompost, runCompost, acceptProposal, dismissProposal } from '../lib/compost.js';
import { getTodoistStatus, syncTodoist } from '../lib/todoistSync.js';
import { getGuardian, runGuardian, runGuardianReport, exportVault, listBackups, restoreBackup } from '../lib/guardian.js';
import { runMealPrep } from '../lib/mealPrep.js';
import { getDailyReviewStatus, setReviewConfig, runDailyReview, REVIEW_MODES } from '../lib/dailyReview.js';

// The loops: the scheduled briefs (dispatch slots on the inbox rails), the
// Compost loop (weekly read-only vault hygiene proposals), and Todoist sync.
export function loopsRouter(vaultPath) {
  const router = express.Router();

  router.get('/dispatch', async (req, res) => {
    try {
      res.json(await getDispatchStatus(vaultPath));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/dispatch/config', async (req, res) => {
    try {
      const slot = req.body?.slot;
      if (!DISPATCH_SLOTS.includes(slot)) return res.status(400).json({ error: 'slot must be one of ' + DISPATCH_SLOTS.join(', ') });
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
      const config = await setDispatchConfig(slot, patch);
      res.json({ config });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/dispatch/run', async (req, res) => {
    try {
      const slot = req.body?.slot || 'morning';
      if (!DISPATCH_SLOTS.includes(slot)) return res.status(400).json({ error: 'slot must be one of ' + DISPATCH_SLOTS.join(', ') });
      res.json(await runDispatch(vaultPath, { slot, force: req.body?.force === true }));
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

  router.get('/todoist', async (req, res) => {
    try {
      res.json(await getTodoistStatus());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/todoist/sync', async (req, res) => {
    try {
      res.json({ result: await syncTodoist(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/learning', async (req, res) => {
    try {
      const { computePreferences } = await import('../lib/learning.js');
      res.json(await computePreferences(vaultPath));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/daily-review', async (req, res) => {
    try {
      res.json(await getDailyReviewStatus());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/daily-review/config', async (req, res) => {
    try {
      if (req.body?.mode !== undefined && !REVIEW_MODES.includes(req.body.mode)) return res.status(400).json({ error: 'mode must be off, draft, or auto' });
      res.json({ config: await setReviewConfig(req.body || {}) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/daily-review/run', async (req, res) => {
    try {
      res.json(await runDailyReview(vaultPath, { force: !!req.body?.force }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/mealprep/run', async (req, res) => {
    try {
      res.json(await runMealPrep(vaultPath, { force: !!req.body?.force }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/guardian', async (req, res) => {
    try {
      res.json(await getGuardian());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/guardian/run', async (req, res) => {
    try {
      res.json({ report: await runGuardian(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/guardian/backups', async (req, res) => {
    try {
      res.json({ files: await listBackups(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/guardian/restore', async (req, res) => {
    try {
      res.json(await restoreBackup(vaultPath, req.body?.backup));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/guardian/export', async (req, res) => {
    try {
      res.json(await exportVault(vaultPath));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/guardian/report', async (req, res) => {
    try {
      res.json(await runGuardianReport(vaultPath, { force: !!req.body?.force }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

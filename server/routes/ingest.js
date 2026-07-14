import { Router } from 'express';
import { startIngest, getJob, approveJob, discardJob } from '../lib/ingest.js';

export function ingestRouter(vaultPath) {
  const router = Router();
  const run = startIngest(vaultPath);

  router.post('/ingest', (req, res) => {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'missing text' });
    const jobId = run(text);
    res.json({ jobId });
  });

  router.get('/ingest/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json(job);
  });

  router.post('/ingest/:jobId/approve', async (req, res) => {
    try {
      await approveJob(req.params.jobId);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/ingest/:jobId/discard', async (req, res) => {
    try {
      await discardJob(req.params.jobId);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

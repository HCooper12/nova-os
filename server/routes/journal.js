import { Router } from 'express';
import { addEntry, listEntries } from '../lib/journal.js';
import { startPromptJob, getPromptJob } from '../lib/journalPrompt.js';

function sampleConcepts(pages, n) {
  const pool = pages.filter((p) => p.type === 'concept' || p.type === 'topic');
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).map((p) => ({ title: p.title, excerpt: (p.paragraphs[0] || '').slice(0, 160) }));
}

export function journalRouter(vault, vaultPath) {
  const router = Router();

  router.get('/journal/entries', async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const entries = await listEntries(vaultPath, { limit });
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  router.post('/journal/entries', async (req, res, next) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ error: 'text is required' });
      const linkedTitle = req.body?.linkedTitle ? String(req.body.linkedTitle).trim() : undefined;
      const entry = await addEntry(vaultPath, { text, linkedTitle });
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/journal/prompt', async (req, res, next) => {
    try {
      const seedTitle = req.body?.seedTitle ? String(req.body.seedTitle).trim() : null;
      const seedExcerpt = req.body?.seedExcerpt ? String(req.body.seedExcerpt).trim() : null;
      let seed;
      if (seedTitle) {
        seed = { seedTitle, seedExcerpt };
      } else {
        const pages = await vault.listPages();
        seed = { sample: sampleConcepts(pages, 6) };
      }
      const jobId = startPromptJob(seed);
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/journal/prompt/:jobId', (req, res) => {
    const job = getPromptJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  return router;
}

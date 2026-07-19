import { Router } from 'express';
import { getCachedSummary, startSummaryJob, getSummaryJob } from '../lib/noteSummaries.js';

export function notesRouter(vault) {
  const router = Router();

  router.get('/notes', async (req, res, next) => {
    try {
      const pages = await vault.listPages();
      const backlinks = await vault.backlinkCounts(pages);
      const summaries = pages
        .map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          tags: p.tags,
          date: p.date,
          backlinks: backlinks.get(p.id) || 0,
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      res.json({ notes: summaries });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notes/detail', async (req, res, next) => {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'missing id' });
      const [page, allPages] = await Promise.all([vault.getPage(id), vault.listPages()]);
      const byTitle = new Map(allPages.map((p) => [p.title.toLowerCase(), p]));
      const backlinks = await vault.backlinkCounts(allPages);
      const links = page.links
        .map((label) => {
          const target = byTitle.get(label.toLowerCase());
          return target ? { label: target.title, id: target.id } : null;
        })
        .filter(Boolean);
      res.json({
        id: page.id,
        title: page.title,
        type: page.type,
        tags: page.tags,
        status: page.status,
        date: page.date,
        url: page.url,
        paragraphs: page.paragraphs,
        links,
        backlinks: backlinks.get(page.id) || 0,
      });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
      next(err);
    }
  });

  router.post('/notes/summary', async (req, res, next) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'missing id' });
      const page = await vault.getPage(id);
      const bodyText = page.paragraphs.join('\n\n');
      const cached = await getCachedSummary(id, bodyText);
      if (cached) return res.json({ summary: cached, cached: true });
      const jobId = startSummaryJob(id, page.title, bodyText);
      res.json({ jobId });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
      next(err);
    }
  });

  router.get('/notes/summary/:jobId', (req, res) => {
    const job = getSummaryJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  // Whole-vault graph for the Memory Galaxy: every page as a node, every
  // resolvable wikilink as an undirected edge (index pairs into nodes).
  router.get('/recall', async (req, res, next) => {
    try {
      const { searchVault } = await import('../lib/recall.js');
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      res.json({ results: await searchVault(vault.vaultPath, q) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/graph', async (req, res, next) => {
    try {
      const pages = await vault.listPages();
      const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
      const indexById = new Map(pages.map((p, i) => [p.id, i]));
      const nodes = pages.map((p) => ({ id: p.id, title: p.title, type: p.type, date: p.date }));
      const links = [];
      const seen = new Set();
      pages.forEach((p, i) => {
        for (const label of p.links) {
          const target = byTitle.get(label.toLowerCase());
          if (!target || target.id === p.id) continue;
          const j = indexById.get(target.id);
          const key = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          links.push([i, j]);
        }
      });
      res.json({ nodes, links });
    } catch (err) {
      next(err);
    }
  });

  router.get('/activity', async (req, res, next) => {
    try {
      const entries = await vault.recentLog(8);
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

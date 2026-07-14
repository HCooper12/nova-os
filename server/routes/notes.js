import { Router } from 'express';

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

import { Router } from 'express';
import { buildLibrary, buildLibraryItem } from '../lib/library.js';

// The visual Library's read surface. Read-only by design: the shelf is a
// VIEW over the vault, never a second store — adding to the library IS the
// ingest rail (book/video/text), and edits are vault edits.
export function libraryRouter(vaultPath, vault) {
  const router = Router();

  router.get('/library', async (req, res, next) => {
    try {
      res.json({ items: await buildLibrary(vaultPath, vault) });
    } catch (err) { next(err); }
  });

  router.get('/library/item', async (req, res) => {
    try {
      const id = String(req.query.id || '');
      res.json(await buildLibraryItem(vaultPath, vault, id));
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
      res.status(400).json({ error: err.message });
    }
  });

  // Real jacket for a book, or 404/204 so the client keeps its generated
  // cover. 404 = looked up (or never asked before); 204 = the 7-day
  // negative cache already knows this book has none, answered without
  // asking Open Library again.
  router.get('/library/cover', async (req, res) => {
    try {
      const { getBookCoverResult } = await import('../lib/bookCovers.js');
      const { buf, cachedMiss } = await getBookCoverResult(req.query.title, req.query.author);
      if (!buf) return res.status(cachedMiss ? 204 : 404).end();
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' });
      res.end(buf);
    } catch {
      res.status(404).end();
    }
  });

  // Real poster for a video source, or 404 so the client keeps its
  // generated cover — the same contract as the book jacket above.
  router.get('/library/poster', async (req, res) => {
    try {
      const { getSourcePoster } = await import('../lib/sourcePosters.js');
      const buf = await getSourcePoster(req.query.url);
      if (!buf) return res.status(404).end();
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' });
      res.end(buf);
    } catch {
      res.status(404).end();
    }
  });

  return router;
}

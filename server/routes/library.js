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

  return router;
}

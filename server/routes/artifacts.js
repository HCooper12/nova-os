import { Router } from 'express';
import { listArtifacts, getArtifact, setPinned, trashArtifact, restoreArtifact } from '../lib/artifacts.js';

// THE DOCUMENTS — his ask (28 Sep): what Nova files for him should be
// "organised somewhere neatly", and reachable as a real list, not just a
// token in a chat bubble. Read-mostly (list/get) plus the three small state
// changes a filed document ever needs: pin it, trash it (undo of its
// creation), bring it back.
export function artifactsRouter(vaultPath) {
  const router = Router();

  router.get('/artifacts', async (req, res) => {
    try {
      const { q, agent, kind, limit } = req.query;
      const pinned = req.query.pinned === 'true' ? true : req.query.pinned === 'false' ? false : undefined;
      res.json(await listArtifacts(vaultPath, {
        q: typeof q === 'string' ? q : undefined,
        agent: typeof agent === 'string' ? agent : undefined,
        kind: typeof kind === 'string' ? kind : undefined,
        pinned,
        limit: limit ? Math.min(500, Math.max(1, Number(limit) || 200)) : undefined,
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/artifacts/:id', async (req, res) => {
    try {
      const artifact = await getArtifact(vaultPath, req.params.id);
      if (!artifact) return res.status(404).json({ error: 'not found' });
      res.json(artifact);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/artifacts/:id/pin', async (req, res) => {
    try {
      const updated = await setPinned(vaultPath, req.params.id, req.body?.pinned !== false);
      if (!updated) return res.status(404).json({ error: 'not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/artifacts/:id', async (req, res) => {
    try {
      const trashed = await trashArtifact(vaultPath, req.params.id);
      if (!trashed) return res.status(404).json({ error: 'not found' });
      res.json(trashed);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/artifacts/:id/restore', async (req, res) => {
    try {
      const restored = await restoreArtifact(vaultPath, req.params.id);
      if (!restored) return res.status(404).json({ error: 'not found' });
      res.json(restored);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

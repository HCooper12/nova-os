import { Router } from 'express';
import { getProfile, setProfile } from '../lib/profile.js';

export function profileRouter(vaultPath) {
  const router = Router();

  router.get('/profile', async (req, res, next) => {
    try {
      res.json({ profile: await getProfile(vaultPath) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/profile', async (req, res) => {
    try {
      res.json({ profile: await setProfile(vaultPath, req.body || {}) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

import { Router } from 'express';
import { getProfile, setProfile, PROFILE_SECTIONS } from '../lib/profile.js';
import { fileProfileFact } from '../lib/inbox.js';
import { profileTalkTurn, talkOpener } from '../lib/profileTalk.js';
import { plainCause } from '../lib/plainCause.js';

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

  // his own edit of one section: filed on the rails (kind 'profile-fact'),
  // so the Inbox can undo it like any other filing
  router.put('/profile/section', async (req, res) => {
    const { key, text, confirm } = req.body || {};
    if (!PROFILE_SECTIONS.some((s) => s.key === key)) {
      return res.status(400).json({ error: `there is no "${key}" section on the profile page` });
    }
    if (typeof text !== 'string' && !confirm) return res.status(400).json({ error: 'text is required' });
    try {
      const rec = await fileProfileFact(vaultPath, {
        key, text: typeof text === 'string' ? text.slice(0, 4000) : '', confirm: !!confirm, append: false, source: 'profile',
      });
      res.json({ profile: await getProfile(vaultPath), recordId: rec.id });
    } catch (e) {
      res.status(400).json({ error: plainCause(e) });
    }
  });

  router.post('/profile/talk/start', async (req, res) => {
    try {
      const profile = await getProfile(vaultPath);
      res.json({ say: talkOpener(profile), profile });
    } catch (e) {
      res.status(500).json({ error: plainCause(e) });
    }
  });

  router.post('/profile/talk', async (req, res) => {
    const { history, text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Say something first' });
    try {
      const out = await profileTalkTurn(vaultPath, { history: Array.isArray(history) ? history : [], text });
      if (out.error) return res.status(502).json({ error: plainCause(out.cause || out.error) });
      res.json(out);
    } catch (e) {
      // a filing failed after the model answered
      res.status(500).json({ error: plainCause(e) });
    }
  });

  return router;
}

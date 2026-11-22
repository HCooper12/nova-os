import { Router } from 'express';
import { ensureCutout, ensurePodcastArt, wallFor, ensureThumb, cutoutFile, sweepMentorArt } from '../lib/mentorArt.js';

// MENTORS, THE PICTURES (lib/mentorArt.js): what a mentor's page draws that
// the main mentors router does not serve. Read-only to everything but the
// mentors art folder; no model, no vault.
//
//   GET /mentors/:id/cutout       his cut-out portrait (PNG, made if missing);
//                                 404 with the plain cause when there is none
//   GET /mentors/:id/podcast-art  the cover of his podcast, fetched once from
//                                 Apple's artwork host; 404 with the plain cause
//   GET /mentors/:id/wall         {order, sig, sprite, building, error}: his
//                                 catalogue order and the sprite to draw it from
//                                 (the sprite file is served by the main
//                                 router's GET /mentors/art/:file)
//   GET /mentors/thumb/:videoId   one thumbnail, ?size=hi for the 1280 px frame

const CACHE = { 'Cache-Control': 'private, max-age=86400' };

export function mentorsArtRouter({ sweep = true } = {}) {
  const router = Router();

  const fail = (res, err) => {
    if (err?.notFound) return res.status(404).json({ error: err.message });
    if (err?.soft) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err?.message || 'something failed and gave no reason' });
  };

  router.get('/mentors/:id/cutout', async (req, res) => {
    try {
      const full = await ensureCutout(req.params.id);
      res.sendFile(full, { headers: CACHE }, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: `the cut-out ${cutoutFile(req.params.id)} could not be sent` });
      });
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/:id/podcast-art', async (req, res) => {
    try {
      const full = await ensurePodcastArt(req.params.id);
      res.sendFile(full, { headers: CACHE }, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'the podcast cover could not be sent' });
      });
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/:id/wall', async (req, res) => {
    try {
      const w = await wallFor(req.params.id);
      res.json({ ...w, sprite: w.sprite ? { ...w.sprite, url: `/api/mentors/art/${w.sprite.file}` } : null });
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/thumb/:videoId', async (req, res) => {
    try {
      const full = await ensureThumb(req.params.videoId, req.query.size === 'hi' ? 'hi' : 'mq');
      res.sendFile(full, { headers: CACHE }, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'no such picture' });
      });
    } catch (err) {
      if (err?.notFound) return res.status(404).json({ error: err.message });
      res.status(502).json({ error: err?.message || 'the thumbnail could not be fetched' });
    }
  });

  // once after start, quietly: a cut-out and a wall for everyone followed
  if (sweep) {
    const t = setTimeout(() => { sweepMentorArt().catch((e) => console.error('mentor art sweep failed:', e.message)); }, 30_000);
    t.unref?.();
  }
  return router;
}

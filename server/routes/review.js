import { Router } from 'express';
import { reviewToday, submitAnswer, drawEarly, reviewItemFor, GRADES } from '../lib/conceptReview.js';

// THE DAILY REVIEW — one queue, shared by both Home idioms and the morning
// brief (dispatch.js reads this same queue head; see conceptReview.js for
// why there is no longer a separate client-side pick).
//
//   GET  /review/today    today's queue, its gist/source/connections/curve,
//                         and the day's "N of M done" count
//   POST /review/answer   one tap — Next (grade 'read') or a recall choice;
//                         files to the Inbox rails, undoable
export function reviewRouter(vaultPath, vault) {
  const router = Router();

  router.get('/review/today', async (req, res, next) => {
    try {
      res.json(await reviewToday(vaultPath, vault));
    } catch (err) { next(err); }
  });

  // "Draw one early" — the shuffle reel's only remaining job, once the
  // day's reviews are done.
  router.get('/review/draw', async (req, res, next) => {
    try {
      const item = await drawEarly(vaultPath, vault);
      if (!item) return res.status(404).json({ error: 'nothing left undrawn' });
      res.json({ item });
    } catch (err) { next(err); }
  });

  router.get('/review/item', async (req, res, next) => {
    try {
      const id = String(req.query.id || '');
      const item = id ? await reviewItemFor(vaultPath, vault, id) : null;
      if (!item) return res.status(404).json({ error: 'not found' });
      res.json({ item });
    } catch (err) { next(err); }
  });

  router.post('/review/answer', async (req, res) => {
    try {
      const pageId = typeof req.body?.pageId === 'string' ? req.body.pageId : '';
      const grade = typeof req.body?.grade === 'string' ? req.body.grade : '';
      if (!pageId) return res.status(400).json({ error: 'pageId is required' });
      if (!GRADES.includes(grade)) return res.status(400).json({ error: `grade must be one of: ${GRADES.join(', ')}` });
      res.json(await submitAnswer(vaultPath, vault, { pageId, grade }));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  return router;
}

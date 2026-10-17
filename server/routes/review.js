import { Router } from 'express';
import { reviewToday, submitAnswer, drawEarly, reviewItemFor, GRADES } from '../lib/conceptReview.js';
import { getCachedReviewSummary, startReviewSummaryJob, getReviewSummaryJob, reviewSummaryInput } from '../lib/reviewSummary.js';
import { logRequestError } from '../lib/requestErrors.js';

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
    } catch (err) { logRequestError(err, req, res, next); }
  });

  // "Draw one early" — the shuffle reel's only remaining job, once the
  // day's reviews are done.
  router.get('/review/draw', async (req, res, next) => {
    try {
      // ?lane=body draws from the body lane (sleep, stress, health science)
      const lane = req.query.lane === 'body' ? 'body' : 'mind';
      const item = await drawEarly(vaultPath, vault, new Date(), lane);
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

  // The structured summary (mockup 98; rules in lib/reviewSummary.js):
  // cached per page body, else a job to poll. The cache check reads only the
  // page; the life sources are read only when a model call is really due.
  router.post('/review/summary', async (req, res, next) => {
    try {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      if (!id) return res.status(400).json({ error: 'missing id' });
      const page = await vault.getPage(id);
      const cached = await getCachedReviewSummary(id, page.paragraphs.join('\n\n'));
      if (cached) return res.json({ summary: cached, cached: true });
      const input = await reviewSummaryInput(vaultPath, vault, id);
      res.json({ jobId: startReviewSummaryJob(input) });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
      next(err);
    }
  });
  router.get('/review/summary/:jobId', (req, res) => {
    const job = getReviewSummaryJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
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

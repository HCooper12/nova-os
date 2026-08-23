import { Router } from 'express';
import { startIngest, getJob, approveJob, discardJob } from '../lib/ingest.js';

export function ingestRouter(vaultPath) {
  const router = Router();
  const run = startIngest(vaultPath);

  router.post('/ingest', (req, res) => {
    const { text, sourceUrl, book } = req.body || {};
    const url = sourceUrl && sourceUrl.trim() ? sourceUrl.trim() : undefined;
    // A book is title+author — the Librarian researches it, then the same
    // weave runs. Otherwise a bare link is enough (the job fetches the
    // video's transcript itself), or pasted text.
    const bookReq = book && String(book.title || '').trim() && String(book.author || '').trim()
      ? { title: String(book.title).trim(), author: String(book.author).trim(), notes: String(book.notes || '').trim(), model: typeof book.model === 'string' ? book.model : undefined }
      : null;
    if ((!text || !text.trim()) && !url && !bookReq) return res.status(400).json({ error: 'paste some text, a video link, or a book title + author' });
    try {
      const jobId = run(text && text.trim() ? text : null, url, bookReq);
      res.json({ jobId });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/ingest/:jobId', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json(job);
  });

  router.post('/ingest/:jobId/approve', async (req, res) => {
    try {
      await approveJob(req.params.jobId);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/ingest/:jobId/discard', async (req, res) => {
    try {
      await discardJob(req.params.jobId);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

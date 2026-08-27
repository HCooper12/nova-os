import { Router, raw } from 'express';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startIngest, getJob, approveJob, discardJob } from '../lib/ingest.js';

export function ingestRouter(vaultPath) {
  const router = Router();
  const run = startIngest(vaultPath);

  // A BOOK HE OWNS — Librarian Phase 2. The weave already knew how to handle
  // "Hayden supplied the text" (provenance: read, and it deepens any prior
  // researched pages); the only missing step was turning his file into text.
  //
  // express.raw rather than a multipart dependency: one file, one request,
  // no multer. Title and author come from the query, or from the EPUB's own
  // metadata when he does not supply them.
  // The raw body parser for this path is mounted in index.js, BEFORE the
  // global text parser that would otherwise decode these bytes as UTF-8.
  router.post('/ingest/book-file', raw({ type: '*/*', limit: '120mb' }), async (req, res) => {
    const filename = String(req.query.filename || '').trim();
    if (!filename) return res.status(400).json({ error: 'filename is required (it decides how the file is read)' });
    if (!req.body?.length) return res.status(400).json({ error: 'no file received' });
    // If some earlier middleware decoded the body to a string, the binary is
    // already destroyed — fail loudly rather than extracting from wreckage.
    if (!Buffer.isBuffer(req.body)) {
      return res.status(500).json({ error: 'upload was parsed as text before reaching the reader — the binary is corrupt. This is a server misconfiguration, not a bad file.' });
    }
    const { extractBookText, kindOf, SUPPORTED, normalizeReadingState } = await import('../lib/bookText.js');
    if (!kindOf(filename)) {
      return res.status(400).json({ error: `Nova can read ${SUPPORTED.join(', ')} — that file is something else. Export it to text first.` });
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'nova-book-'));
    const tmp = path.join(dir, path.basename(filename));
    try {
      await writeFile(tmp, req.body);
      const out = await extractBookText(tmp, filename);
      const title = String(req.query.title || out.meta.title || '').trim();
      const author = String(req.query.author || out.meta.author || '').trim();
      if (!title || !author) {
        return res.status(400).json({ error: 'that file carries no title/author of its own — send them with the upload' });
      }
      // his own copy => the deep path: text + book means provenance `read`
      const jobId = run(out.text, undefined, {
        title,
        author,
        notes: String(req.query.notes || '').trim(),
        model: typeof req.query.model === 'string' ? req.query.model : undefined,
        reading: normalizeReadingState(req.query.reading, 'absorbed'),
      });
      res.json({ jobId, title, author, kind: out.kind, chars: out.chars, parts: out.parts });
    } catch (e) {
      // extraction failures carry advice he can act on — pass them through
      res.status(400).json({ error: e.message });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // THE SCOUT — research a person or a social account into the vault. Its
  // own endpoint rather than a flag on /ingest, because "research this
  // person" is a different intent with a different input (one string, not
  // text + url + title + author) and deserves to fail with its own words.
  router.post('/ingest/person', async (req, res) => {
    try {
      const subjectRaw = typeof req.body?.subject === 'string' ? req.body.subject : '';
      const { parseSubject } = await import('../lib/scout.js');
      const subject = parseSubject(subjectRaw); // throws its own plain message
      const jobId = run(null, undefined, null, {
        ...subject,
        notes: String(req.body?.notes || '').trim(),
        model: typeof req.body?.model === 'string' ? req.body.model : undefined,
      });
      res.json({ jobId, subject });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

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

import { Router } from 'express';

// HIS NOTION WISHLIST (lib/wishlist.js). Every write files a record on the
// inbox rails; its Undo is /api/inbox/:id/undo like every other.
export function wishlistRouter(vaultPath) {
  const router = Router();
  const fail = (res, err, code = 400) => res.status(err.status || code).json({ error: err.message, code: err.code || null, ...(err.record ? { recordId: err.record.id } : {}) });

  // the cached items, when Notion was last read, and shared:false with the
  // reason when Notion cannot show them. A first visit starts a read.
  router.get('/wishlist', async (_req, res) => {
    try {
      const W = await import('../lib/wishlist.js');
      const view = await W.wishlistView();
      if (!view.lastSync && !view.syncing && view.reason !== 'Connect Notion in Settings first') W.kickSync(0);
      res.json(view);
    } catch (err) { fail(res, err, 500); }
  });

  router.post('/wishlist/sync', async (_req, res) => {
    try {
      const { readAll } = await import('../lib/wishlist.js');
      res.json(await readAll());
    } catch (err) { fail(res, err, 500); }
  });

  // { url, said }: the add, then the one line and the open questions
  router.post('/wishlist/add', async (req, res) => {
    try {
      const url = String(req.body?.url || '').trim();
      if (!url) return res.status(400).json({ error: 'a link is required' });
      const { addFromLink } = await import('../lib/wishlist.js');
      const out = await addFromLink(vaultPath, { url, said: String(req.body?.said || ''), source: 'text' });
      res.json({ recordId: out.record.id, pageId: out.pageId, pageUrl: out.pageUrl, name: out.draft.name, said: out.said, questions: out.questions });
    } catch (err) { fail(res, err, 502); }
  });

  // :id is the add's INBOX RECORD; { field?, value }
  router.post('/wishlist/:id/answer', async (req, res) => {
    try {
      const { answer } = await import('../lib/wishlist.js');
      res.json(await answer(req.params.id, req.body?.field || null, String(req.body?.value ?? '')));
    } catch (err) { fail(res, err); }
  });

  // :id is the NOTION PAGE from GET /wishlist; { status }: considering,
  // month, purchased, cancelled (or his status names)
  router.post('/wishlist/:id/status', async (req, res) => {
    try {
      const { setStatus } = await import('../lib/wishlist.js');
      res.json(await setStatus(req.params.id, req.body?.status));
    } catch (err) { fail(res, err); }
  });

  // { stars: 0 | 1 | 2 | 3 }: his "most wanted" marks, written as the Name prefix
  router.post('/wishlist/:id/star', async (req, res) => {
    try {
      const { setStars } = await import('../lib/wishlist.js');
      res.json(await setStars(req.params.id, req.body?.stars));
    } catch (err) { fail(res, err); }
  });

  router.post('/wishlist/:id/remove', async (req, res) => {
    try {
      const { removeItem } = await import('../lib/wishlist.js');
      res.json(await removeItem(req.params.id));
    } catch (err) { fail(res, err); }
  });

  // the photos, kept on this Mac (Notion's own links expire in an hour)
  router.get('/wishlist/image/:file', async (req, res) => {
    try {
      const { readMedia } = await import('../lib/stashMeta.js');
      const hit = await readMedia(req.params.file);
      if (!hit) return res.status(404).json({ error: 'no such picture' });
      res.set('Content-Type', hit.type).set('Cache-Control', 'private, max-age=31536000, immutable').send(hit.buf);
    } catch (err) { fail(res, err, 500); }
  });

  return router;
}

import { Router } from 'express';

export const OPEN_REFRESH_MS = 60_000;

// HIS NOTION WISHLIST (lib/wishlist.js). Every write files a record on the
// inbox rails; its Undo is /api/inbox/:id/undo like every other.
export function wishlistRouter(vaultPath) {
  const router = Router();
  const fail = (res, err, code = 400) => res.status(err.status || code).json({ error: err.message, code: err.code || null, ...(err.record ? { recordId: err.record.id } : {}) });

  // the cached items, when Notion was last read, and shared:false with the
  // reason when Notion cannot show them. OPENING THE PAGE READS NOTION AGAIN
  // when the last read (or try) is over a minute old (his call, 9 Nov), so an
  // edit he just made in Notion is here and on the shared page within a
  // moment; the read starts before the view is taken so the page sees
  // `syncing` and looks again until it lands. The 15-minute timer stays.
  router.get('/wishlist', async (_req, res) => {
    try {
      const W = await import('../lib/wishlist.js');
      let view = await W.wishlistView();
      if (view.reason !== 'Connect Notion in Settings first' && !view.syncing) {
        const cur = await W.readItems();
        const last = Math.max(Date.parse(cur.lastSync || 0) || 0, Date.parse(cur.lastTriedAt || 0) || 0);
        if (Date.now() - last > OPEN_REFRESH_MS) { W.readAll().catch(() => {}); view = await W.wishlistView(); }
      }
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

  // { name?, link?, notes?, price?, categories?: [names] }: only what is sent changes
  router.post('/wishlist/:id/edit', async (req, res) => {
    try {
      const { editItem } = await import('../lib/wishlist.js');
      res.json(await editItem(req.params.id, req.body || {}));
    } catch (err) { fail(res, err); }
  });

  // { url } an image link, or { dataUrl } a photo from his phone
  router.post('/wishlist/:id/picture', async (req, res) => {
    try {
      const { setPicture } = await import('../lib/wishlist.js');
      res.json(await setPicture(req.params.id, req.body || {}));
    } catch (err) { fail(res, err); }
  });

  router.post('/wishlist/:id/remove', async (req, res) => {
    try {
      const { removeItem } = await import('../lib/wishlist.js');
      res.json(await removeItem(req.params.id));
    } catch (err) { fail(res, err); }
  });

  // the shareable page's own words (lib/wishlistShare.js): GET the lines and
  // their defaults, POST { field: text } to change them, "" for the default
  router.get('/wishlist/share', async (_req, res) => {
    try {
      const S = await import('../lib/wishlistShare.js');
      res.json({ copy: await S.readCopy(), defaults: S.COPY_DEFAULTS });
    } catch (err) { fail(res, err, 500); }
  });
  router.post('/wishlist/share', async (req, res) => {
    try {
      const S = await import('../lib/wishlistShare.js');
      const copy = await S.setCopy(req.body?.copy || req.body || {});
      S.publishShare().catch(() => {});
      res.json({ copy });
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

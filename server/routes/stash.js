import { Router } from 'express';
import { loadStash, findDuplicate } from '../lib/stash.js';

// The Stash — shelves of links (Wiki/Library/Stash.md) and what Nova read
// about them (server/data/stash). Every write below rides the inbox rails
// (lib/stashRails.js) and answers with the record whose Undo takes it back.
export function stashRouter(vaultPath) {
  const router = Router();
  const fail = (res, err, code = 400) => res.status(err.status || code).json({ error: err.message, ...(err.duplicate ? { duplicate: err.duplicate } : {}) });

  // the shelves, and per link what Nova has read (picture, opens, place,
  // price). Links never read are filled in the background, one at a time.
  router.get('/stash', async (_req, res) => {
    try {
      const stash = await loadStash(vaultPath);
      const { getMeta, fillMissing } = await import('../lib/stashMeta.js');
      const meta = await getMeta();
      const urls = stash.categories.filter((c) => !c.bought).flatMap((c) => c.items.map((i) => i.url));
      fillMissing(urls);
      const keys = new Set(stash.categories.flatMap((c) => c.items.map((i) => i.key)));
      const slim = {};
      for (const [k, m] of Object.entries(meta)) {
        if (!keys.has(k)) continue;
        slim[k] = {
          image: m.image || null, title: m.title || null, state: m.state || null,
          opens: m.opens || 0, lastOpened: m.lastOpened || null, addedAt: m.addedAt || null, via: m.via || null,
          minutes: m.minutes || null, place: m.place || null, product: !!m.product, article: !!m.article,
          price: m.price ? { amount: m.price.amount ?? null, currency: m.price.currency || null, inStock: m.price.inStock ?? null, state: m.price.state, why: m.price.why || null, checkedOn: m.price.checkedOn || null, event: m.price.event || null } : null,
        };
      }
      res.json({ ...stash, meta: slim, readAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // the old add door (the classic page's form); now a filed record with Undo
  router.post('/stash/items', async (req, res) => {
    try {
      const { addLink } = await import('../lib/stashRails.js');
      const out = await addLink(vaultPath, req.body || {});
      res.json({ ...out.stash, record: out.record, raw: out.raw, category: out.category });
    } catch (err) {
      fail(res, err);
    }
  });

  // POST (not DELETE) — identity travels in the body as the exact raw line
  router.post('/stash/items/remove', async (req, res) => {
    try {
      if (typeof req.body?.raw !== 'string') return res.status(400).json({ error: 'raw line is required' });
      const { removeLink } = await import('../lib/stashRails.js');
      const out = await removeLink(vaultPath, req.body.raw);
      res.json({ ...out.stash, record: out.record });
    } catch (err) {
      fail(res, err);
    }
  });

  // one door for the item's other writes: { raw, action, ...args }
  router.post('/stash/items/act', async (req, res) => {
    const { raw, action } = req.body || {};
    if (typeof raw !== 'string') return res.status(400).json({ error: 'raw line is required' });
    try {
      const R = await import('../lib/stashRails.js');
      const b = req.body;
      const out = action === 'move' ? await R.moveLink(vaultPath, raw, b.to)
        : action === 'rhythm' ? await R.setRhythm(vaultPath, raw, b.weeks)
          : action === 'watch' ? await R.setWatch(vaultPath, raw, !!b.on)
            : action === 'note' ? await R.setNote(vaultPath, raw, b.note)
              : action === 'read' ? await R.markRead(vaultPath, raw, b.done !== false)
                : action === 'bought' ? await R.markBought(vaultPath, raw, { paid: b.paid, date: b.date })
                  : action === 'list' ? await R.toShoppingList(vaultPath, raw)
                    : action === 'check' ? await R.answerCheck(vaultPath, raw, b.answer)
                      : null;
      if (!out) return res.status(400).json({ error: `unknown action ${action}` });
      res.json({ ...(out.stash || await loadStash(vaultPath)), record: out.record || null, raw: out.raw || null });
    } catch (err) {
      fail(res, err);
    }
  });

  // a shelf of his own, or a gift list ("For Mum") with an optional day
  router.post('/stash/shelves', async (req, res) => {
    try {
      const { makeShelf } = await import('../lib/stashRails.js');
      const out = await makeShelf(vaultPath, req.body || {});
      res.json({ ...out.stash, record: out.record });
    } catch (err) {
      fail(res, err);
    }
  });

  // THE ADD BAR'S PREVIEW: is it already here, and what does the page call
  // itself. Reads the page once (the polite queue) and caches the picture.
  router.post('/stash/preview', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return res.status(400).json({ error: 'that is not a web link' });
    try {
      const dup = findDuplicate(await loadStash(vaultPath), url);
      if (dup) return res.json({ duplicate: { category: dup.category.name, raw: dup.item.raw, name: dup.item.name, url: dup.item.url } });
      const { previewLink } = await import('../lib/stashMeta.js');
      res.json({ preview: await previewLink(url) });
    } catch (err) {
      fail(res, err, 500);
    }
  });

  // THE SHARE SHEET'S DOOR (docs/stash-share-shortcut.md): a link from
  // Safari onto the shelf its site already lives on. Answers in words the
  // Shortcut can show as its banner.
  router.post('/stash/share', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return res.status(400).json({ error: 'not a web link', text: 'Nova needs a web link: share from Safari.' });
    try {
      const { shareLink } = await import('../lib/stashRails.js');
      const out = await shareLink(vaultPath, { url, name: req.body?.name });
      res.json({ ok: true, category: out.category, raw: out.raw, record: out.record, text: `Stashed on ${out.category}${out.picked === 'unsorted' ? ' (a new site)' : ''}` });
    } catch (err) {
      if (err.duplicate) return res.json({ ok: true, duplicate: err.duplicate, text: `Already on ${err.duplicate.category}` });
      fail(res, err);
    }
  });

  // opens and the Reader's place: operational notes, not his writes
  router.post('/stash/opened', async (req, res) => {
    try {
      const { noteOpened } = await import('../lib/stashMeta.js');
      const m = await noteOpened(String(req.body?.url || ''));
      res.json({ opens: m.opens, lastOpened: m.lastOpened });
    } catch (err) {
      fail(res, err, 500);
    }
  });
  router.post('/stash/place', async (req, res) => {
    try {
      const { notePlace } = await import('../lib/stashMeta.js');
      const m = await notePlace(String(req.body?.url || ''), req.body?.para);
      res.json({ place: m.place });
    } catch (err) {
      fail(res, err, 500);
    }
  });

  // THE READER: a reading link's text, fetched once and kept
  router.post('/stash/reader', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return res.status(400).json({ error: 'not a web link' });
    try {
      const { readerFor } = await import('../lib/stashMeta.js');
      res.json(await readerFor(url));
    } catch (err) {
      fail(res, err, 500);
    }
  });

  // a cached picture, by its hash name
  router.get('/stash/image/:file', async (req, res) => {
    try {
      const { readMedia } = await import('../lib/stashMeta.js');
      const hit = await readMedia(req.params.file);
      if (!hit) return res.status(404).json({ error: 'no such picture' });
      res.set('Content-Type', hit.type).set('Cache-Control', 'private, max-age=31536000, immutable').send(hit.buf);
    } catch (err) {
      fail(res, err, 500);
    }
  });

  return router;
}

import { Router } from 'express';
import { loadShoppingList } from '../lib/shoppingList.js';
import { pricesFor, readStale, retryChain, CHAIN_DEFS } from '../lib/shopPrices.js';
import { offersView, markOffer, scanRewardsMail } from '../lib/rewardsMail.js';
import { logosView, logoFile, ensureAllLogos } from '../lib/brandLogos.js';

// THE SHOPPING SCREEN'S READS (mockup 92, 10 Oct 2026): what each chain
// charged for the lines on his list, his rewards offers, and the logos.
// The list itself stays on /api/shopping-list (routes/shoppingList.js).
export function shoppingRouter(vaultPath) {
  const router = Router();
  const unticked = async () => (await loadShoppingList(vaultPath)).items.filter((i) => !i.checked);

  // Prices for every line on the list. Reading this also queues today's
  // reads for lines that have none (the polite queue does the rest), so a
  // line added now is priced within minutes, once.
  router.get('/shopping/prices', async (req, res, next) => {
    try {
      const { items } = await loadShoppingList(vaultPath);
      if (req.query.read !== '0') await readStale(items.filter((i) => !i.checked));
      res.json(await pricesFor(items));
    } catch (err) { next(err); }
  });

  // His Try again on a failed or blocked chain: ONE request, then the rest
  // follow only if it answers.
  router.post('/shopping/prices/retry', async (req, res) => {
    const chain = String(req.body?.chain || '');
    if (!CHAIN_DEFS[chain]) return res.status(400).json({ error: 'which chain?' });
    try {
      const queued = await retryChain(chain, await unticked());
      res.json({ queued });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.get('/shopping/offers', async (req, res, next) => {
    try { res.json(await offersView(vaultPath)); } catch (err) { next(err); }
  });

  router.post('/shopping/offers/scan', async (req, res, next) => {
    try { res.json(await scanRewardsMail(vaultPath)); } catch (err) { next(err); }
  });

  // "I activated it" / "Not for me", and their Undo ({ restore: prev })
  router.post('/shopping/offers/:id/mark', async (req, res) => {
    try {
      const b = req.body || {};
      res.json(await markOffer(req.params.id, b.restore ? { restore: b.restore } : { activated: b.activated, dismissed: b.dismissed }));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.get('/shopping/logos', async (req, res, next) => {
    try {
      const view = await logosView();
      // the first look starts the one-time read; the next look shows it
      if (Object.values(view).some((l) => !l.has && !l.miss)) ensureAllLogos().catch(() => {});
      res.json(view);
    } catch (err) { next(err); }
  });

  router.get('/shopping/logo/:key', async (req, res) => {
    const f = await logoFile(req.params.key);
    if (!f) return res.status(404).json({ error: 'no logo cached' });
    res.set({
      'Content-Type': f.type,
      'Cache-Control': 'private, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
      // an SVG from someone else's site never runs a script here
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    });
    res.sendFile(f.path);
  });

  return router;
}

// /api/products and a recipe's line products (1 Nov 2026; mockup 109,
// approved). His products, read from a label, found by search or typed, and
// linked to one line of a recipe; code recomputes the recipe from its lines
// and the change lands as a receipt with Undo (lib/products.js).
import { Router } from 'express';
import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { listProducts, saveProduct, matchProducts, searchProducts, linkProduct, lineState } from '../lib/products.js';

const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/;

function fail(res, e) {
  const status = ['product', 'recipe', 'unresolved'].includes(e.code) ? 400 : e.laneOff ? 400 : 500;
  res.status(status).json({ error: e.message, code: e.code || null });
}

export function productsRouter(vaultPath) {
  const router = Router();

  // his products; with ?for=<a line>, the ones that fit it first
  router.get('/products', async (req, res) => {
    try {
      const all = await listProducts();
      const line = String(req.query.for || '');
      res.json({ products: all, matches: line ? matchProducts(all, line) : [] });
    } catch (e) { fail(res, e); }
  });

  router.get('/products/search', async (req, res) => {
    try { res.json({ results: await searchProducts(req.query.q) }); } catch (e) { fail(res, e); }
  });

  router.post('/products', async (req, res) => {
    try { res.json({ product: await saveProduct(req.body || {}) }); } catch (e) { fail(res, e); }
  });

  // a label photo: the model reads the per-100 g column, polled like any scan
  router.post('/products/label', async (req, res) => {
    try {
      const m = String(req.body?.image || '').match(IMAGE_DATA_URL);
      if (!m) return res.status(400).json({ error: 'a label photo is needed' });
      const workDir = path.join(os.tmpdir(), 'nova-label', randomUUID().slice(0, 8));
      await mkdir(workDir, { recursive: true });
      const img = path.join(workDir, `label.${m[1]}`);
      await writeFile(img, Buffer.from(m[2], 'base64'));
      const { startFoodScan } = await import('../lib/scanFood.js');
      res.json({ jobId: startFoodScan('label-per100', [img], workDir, '') });
    } catch (e) { fail(res, e); }
  });

  router.get('/products/label/:jobId', async (req, res) => {
    const { getFoodScanJob } = await import('../lib/scanFood.js');
    const job = getFoodScanJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    const r = job.result;
    res.json({ status: job.status, error: job.error, result: r ? { name: r.name, per100: r.per100 || null, servingGrams: r.servingGrams ?? null, confidence: r.confidence, question: r.question } : null });
  });

  // which lines of a recipe carry his product
  router.get('/recipes/:id/products', async (req, res) => {
    try {
      const { loadRecipeData } = await import('../lib/recipes.js');
      const recipe = (await loadRecipeData(vaultPath)).recipes.find((r) => r.id === req.params.id);
      if (!recipe) return res.status(404).json({ error: 'recipe not found' });
      res.json({ lines: await lineState(recipe) });
    } catch (e) { fail(res, e); }
  });

  // link one line to his product (productId null unlinks): recompute, write
  // the recipe's macros, file the receipt with its Undo
  router.post('/recipes/:id/products', async (req, res) => {
    try {
      const out = await linkProduct(vaultPath, req.params.id, String(req.body?.line || ''), req.body?.productId || null);
      const { createRecord } = await import('../lib/inboxStore.js');
      const was = out.was ? ` Was ${out.was.p} g protein, ${out.was.kcal} kcal.` : '';
      const record = await createRecord({
        id: randomUUID().slice(0, 8), kind: 'recipe-products', source: 'capture', mode: 'auto', status: 'filed',
        text: `Recalculated from your products: ${req.params.id}`, createdAt: new Date().toISOString(), filedAt: new Date().toISOString(), auto: true,
        destination: `Recipe macros: ${out.macros.p} g protein, ${out.macros.kcal} kcal per serving`,
        decision: { route: 'recipe-products', confidence: 'high', title: 'Recalculated from your products', reason: `${out.linked} of ${out.total} lines from your products.${was}`, payload: { recipeId: req.params.id, macros: out.macros, was: out.was } },
        undoData: out.undo,
      });
      res.json({ ...out, recordId: record.id });
    } catch (e) { fail(res, e); }
  });

  return router;
}

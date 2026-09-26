// PICK IT UP — GET the catalogue summary, GET a search, POST/GET a refresh job.
import { Router } from 'express';
import { loadCatalogue, catalogueSummary, whatFits } from '../lib/eatOut.js';
import { startEatOutRefresh, getEatOutRefreshJob, PDF_BRANDS } from '../lib/eatOutSources.js';
import { laneEnabled } from '../lib/modelPrefs.js';

function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// vaultPath is unused here — the catalogue is code-derived operational data,
// not vault content — kept for signature parity with the other routers.
export function eatOutRouter(_vaultPath) {
  const router = Router();

  router.get('/eat-out', async (req, res, next) => {
    try {
      res.json(catalogueSummary(await loadCatalogue()));
    } catch (err) {
      next(err);
    }
  });

  router.get('/eat-out/fits', async (req, res, next) => {
    try {
      const { kcal, p, c, f, brands, kind, mode, limit } = req.query;
      const query = {
        kcal: parseNum(kcal),
        p: parseNum(p),
        c: parseNum(c),
        f: parseNum(f),
        brands: typeof brands === 'string' && brands.trim() ? brands.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        kind: kind || 'all',
        mode: mode === 'pairs' ? 'pairs' : 'single',
        limit: parseNum(limit) || undefined,
      };
      if (query.kcal == null && query.p == null && query.c == null && query.f == null) {
        return res.status(400).json({ error: 'give at least one of kcal, p, c, f' });
      }
      const catalogue = await loadCatalogue();
      res.json(whatFits(catalogue, query));
    } catch (err) {
      next(err);
    }
  });

  router.post('/eat-out/refresh', (req, res) => {
    try {
      const { brands } = req.body || {};
      const requested = Array.isArray(brands) && brands.length ? brands : null;
      const pdfKeys = new Set(PDF_BRANDS.map((b) => b.key));
      const onlyPdf = requested && requested.every((k) => pdfKeys.has(k));
      if (onlyPdf && !laneEnabled('eat-out-menu')) {
        return res.status(409).json({ error: 'Takeaway menu read is switched off in Settings → Claude models, and the requested brand(s) only publish a PDF.' });
      }
      const jobId = startEatOutRefresh({ brands: requested || undefined });
      res.json({ jobId });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/eat-out/refresh/:id', (req, res) => {
    const job = getEatOutRefreshJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json(job);
  });

  return router;
}

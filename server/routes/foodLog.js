import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { addEntry, removeEntry, getToday } from '../lib/foodLog.js';
import { computeFoodHistory } from '../lib/foodHistory.js';
import { startFoodScan, getFoodScanJob } from '../lib/scanFood.js';
import { recordTodaySnapshot } from '../lib/nutritionSnapshot.js';
import { lookupBarcode } from '../lib/barcodeLookup.js';

const MAX_SCAN_IMAGES = 5;

const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/;

export function foodLogRouter(vaultPath) {
  const router = Router();

  router.get('/food-log', async (req, res, next) => {
    try {
      res.json(await getToday());
    } catch (err) {
      next(err);
    }
  });

  router.post('/food-log', async (req, res, next) => {
    try {
      const { name, macros, source } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
      if (!macros || [macros.p, macros.c, macros.f, macros.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
        return res.status(400).json({ error: 'macros.p/c/f/kcal must be non-negative numbers' });
      }
      const day = await addEntry({ name: name.trim(), macros, source });
      recordTodaySnapshot(vaultPath).catch(() => {});
      res.json(day);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Cross-day history of off-plan foods — aggregated per item so the UI can show
  // what's been eaten that isn't a recipe, and offer a one-tap re-log.
  router.get('/food-log/history', async (req, res, next) => {
    try {
      const days = req.query.days ? Math.min(180, Math.max(1, Number(req.query.days) || 45)) : 45;
      res.json({ items: await computeFoodHistory({ days }) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/food-log/:id', async (req, res, next) => {
    try {
      const day = await removeEntry(req.params.id);
      recordTodaySnapshot(vaultPath).catch(() => {});
      res.json(day);
    } catch (err) {
      next(err);
    }
  });

  router.post('/food-log/scan', async (req, res, next) => {
    try {
      const { mode, images, note } = req.body || {};
      if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'at least one image is required' });
      if (images.length > MAX_SCAN_IMAGES) return res.status(400).json({ error: `up to ${MAX_SCAN_IMAGES} images per scan` });

      const workDir = path.join(os.tmpdir(), 'nova-food-scan', randomUUID().slice(0, 8));
      await mkdir(workDir, { recursive: true });
      const imagePaths = [];
      for (let i = 0; i < images.length; i++) {
        const m = String(images[i]).match(IMAGE_DATA_URL);
        if (!m) return res.status(400).json({ error: `image ${i + 1} is not a supported image data URL` });
        const [, ext, b64] = m;
        const imgPath = path.join(workDir, `photo-${i + 1}.${ext}`);
        await writeFile(imgPath, Buffer.from(b64, 'base64'));
        imagePaths.push(imgPath);
      }

      const jobId = startFoodScan(mode, imagePaths, workDir, note ? String(note).trim() : '');
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/food-log/scan/:jobId', (req, res) => {
    const job = getFoodScanJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  router.get('/food-log/barcode/:code', async (req, res, next) => {
    try {
      const result = await lookupBarcode(req.params.code);
      if (!result) return res.status(404).json({ error: 'No product found for that barcode' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

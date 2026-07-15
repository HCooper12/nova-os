import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadRecipeData, addRecipe, addAlternate } from '../lib/recipes.js';
import { loadRotation, setRotationSlot, setSlotConsumed } from '../lib/rotation.js';
import { startScan, getScanJob } from '../lib/scanRecipe.js';
import { startTweak, getTweakJob } from '../lib/tweakRecipe.js';
import { savePhoto, getPhoto, listPhotoRecipeIds } from '../lib/recipePhotos.js';

const VALID_CATEGORIES = ['CORE DAILY MEALS', 'ROTATION / SWAP MEALS', 'TREATS'];
const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/;

function validateRecipeInput(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim()) return 'name is required';
  if (!VALID_CATEGORIES.includes(body.category)) return 'category must be one of ' + VALID_CATEGORIES.join(', ');
  const m = body.macros;
  if (!m || [m.p, m.c, m.f, m.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
    return 'macros.p/c/f/kcal must be non-negative numbers';
  }
  if (!Array.isArray(body.ingredients) || !body.ingredients.length) return 'at least one ingredient is required';
  if (!Array.isArray(body.method) || !body.method.length) return 'at least one method step is required';
  return null;
}

function validateAlternateInput(body) {
  if (!body || typeof body.label !== 'string' || !body.label.trim()) return 'label is required';
  const m = body.macros;
  if (!m || [m.p, m.c, m.f, m.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
    return 'macros.p/c/f/kcal must be non-negative numbers';
  }
  if (!Array.isArray(body.ingredients) || !body.ingredients.length) return 'at least one ingredient is required';
  if (!Array.isArray(body.method) || !body.method.length) return 'at least one method step is required';
  return null;
}

export function recipesRouter(vaultPath) {
  const router = Router();

  router.get('/recipes', async (req, res, next) => {
    try {
      const data = await loadRecipeData(vaultPath);
      const photoIds = await listPhotoRecipeIds(vaultPath);
      res.json({ ...data, recipes: data.recipes.map((r) => ({ ...r, hasPhoto: photoIds.has(r.id) })) });
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ recipes: [], profile: null });
      next(err);
    }
  });

  router.post('/recipes', async (req, res, next) => {
    try {
      const error = validateRecipeInput(req.body);
      if (error) return res.status(400).json({ error });
      const recipe = await addRecipe(vaultPath, {
        name: req.body.name.trim(),
        category: req.body.category,
        makes: req.body.makes ? String(req.body.makes).trim() : null,
        macros: {
          p: req.body.macros.p,
          c: req.body.macros.c,
          f: req.body.macros.f,
          kcal: req.body.macros.kcal,
        },
        ingredients: req.body.ingredients.map((s) => String(s).trim()).filter(Boolean),
        method: req.body.method.map((s) => String(s).trim()).filter(Boolean),
      });
      res.json({ recipe });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/recipes/scan', async (req, res, next) => {
    try {
      const images = req.body?.images;
      if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'at least one image is required' });
      if (images.length > 4) return res.status(400).json({ error: 'up to 4 images per scan' });

      const workDir = path.join(os.tmpdir(), 'nova-scan', randomUUID().slice(0, 8));
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

      const jobId = startScan(imagePaths, workDir);
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipes/scan/:jobId', (req, res) => {
    const job = getScanJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  router.post('/recipes/:id/tweak', async (req, res, next) => {
    try {
      const request = req.body?.request;
      if (typeof request !== 'string' || !request.trim()) return res.status(400).json({ error: 'request text is required' });
      const { recipes } = await loadRecipeData(vaultPath);
      const recipe = recipes.find((r) => r.id === req.params.id);
      if (!recipe) return res.status(404).json({ error: 'recipe not found' });
      const jobId = startTweak(recipe, request.trim());
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipes/tweak/:jobId', (req, res) => {
    const job = getTweakJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  router.post('/recipes/:id/alternates', async (req, res, next) => {
    try {
      const error = validateAlternateInput(req.body);
      if (error) return res.status(400).json({ error });
      const { recipes } = await loadRecipeData(vaultPath);
      const recipe = recipes.find((r) => r.id === req.params.id);
      if (!recipe) return res.status(404).json({ error: 'recipe not found' });
      const updated = await addAlternate(vaultPath, recipe.name, {
        label: req.body.label.trim(),
        macros: { p: req.body.macros.p, c: req.body.macros.c, f: req.body.macros.f, kcal: req.body.macros.kcal },
        ingredients: req.body.ingredients.map((s) => String(s).trim()).filter(Boolean),
        method: req.body.method.map((s) => String(s).trim()).filter(Boolean),
      });
      res.json({ recipe: updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/recipes/:id/photo', async (req, res, next) => {
    try {
      const { recipes } = await loadRecipeData(vaultPath);
      if (!recipes.some((r) => r.id === req.params.id)) return res.status(404).json({ error: 'recipe not found' });
      await savePhoto(vaultPath, req.params.id, req.body?.image);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/recipes/:id/photo', async (req, res, next) => {
    try {
      const photo = await getPhoto(vaultPath, req.params.id);
      if (!photo) return res.status(404).json({ error: 'no photo for this recipe' });
      res.set('Content-Type', photo.mime);
      res.set('Cache-Control', 'private, max-age=300');
      res.send(photo.buffer);
    } catch (err) {
      next(err);
    }
  });

  router.get('/rotation', async (req, res, next) => {
    try {
      const { recipes } = await loadRecipeData(vaultPath);
      const rotation = await loadRotation(vaultPath, recipes);
      res.json(rotation);
    } catch (err) {
      next(err);
    }
  });

  router.post('/rotation', async (req, res, next) => {
    try {
      const { slot, recipeId } = req.body || {};
      const { recipes } = await loadRecipeData(vaultPath);
      const rotation = await setRotationSlot(vaultPath, recipes, slot, recipeId || null);
      res.json(rotation);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/rotation/consume', async (req, res, next) => {
    try {
      const { slot, consumed } = req.body || {};
      const { recipes } = await loadRecipeData(vaultPath);
      const rotation = await setSlotConsumed(vaultPath, recipes, slot, !!consumed);
      res.json(rotation);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

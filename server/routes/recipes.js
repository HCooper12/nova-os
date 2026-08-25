import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadRecipeData, addRecipe, addAlternate, promoteAlternate, editRecipe } from '../lib/recipes.js';
import { loadRotation, setRotationSlot, setSlotConsumed, setSlotVariant } from '../lib/rotation.js';
import { recordTodaySnapshot } from '../lib/nutritionSnapshot.js';
import { setRotationEntry } from '../lib/foodLog.js';
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

// An alternate needs a label, macros and ingredients. It does NOT need its own
// method: a tweak that only swaps ingredients ("drop the hash brown, add egg
// whites") is cooked exactly like the original, and the model returns no steps
// for it. Requiring them made a perfectly good tweak unsaveable — the route
// inherits the parent recipe's method instead.
function validateAlternateInput(body) {
  if (!body || typeof body.label !== 'string' || !body.label.trim()) return 'label is required';
  const m = body.macros;
  if (!m || [m.p, m.c, m.f, m.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
    return 'macros.p/c/f/kcal must be non-negative numbers';
  }
  if (!Array.isArray(body.ingredients) || !body.ingredients.length) return 'at least one ingredient is required';
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

  // Promote a scanned/logged food straight into the recipe bank. Macros are
  // required, but ingredients/method are optional — a snack has neither — so it
  // lands as a macro-only recipe the user can flesh out later. This is what lets
  // "save to recipe bank" work without re-entering anything.
  router.post('/recipes/quick', async (req, res) => {
    try {
      const b = req.body || {};
      if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'name is required' });
      if (!VALID_CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'category must be one of ' + VALID_CATEGORIES.join(', ') });
      const m = b.macros;
      if (!m || [m.p, m.c, m.f, m.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
        return res.status(400).json({ error: 'macros.p/c/f/kcal must be non-negative numbers' });
      }
      const recipe = await addRecipe(vaultPath, {
        name: b.name.trim(),
        category: b.category,
        makes: b.makes ? String(b.makes).trim() : null,
        macros: { p: m.p, c: m.c, f: m.f, kcal: m.kcal },
        ingredients: Array.isArray(b.ingredients) ? b.ingredients.map((s) => String(s).trim()).filter(Boolean) : [],
        method: Array.isArray(b.method) ? b.method.map((s) => String(s).trim()).filter(Boolean) : [],
        description: b.description ? String(b.description).trim() : null,
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
      // a follow-up refines the version already on screen rather than
      // restarting from the stored recipe
      const prior = req.body?.prior && Array.isArray(req.body.prior.ingredients) ? req.body.prior : null;

      // His ask: a photo of a DIFFERENT ingredient (a substitute's packaging,
      // its nutrition label, the item itself) so Nova reads the real numbers
      // off it rather than guessing — same data-URL-to-tmpfile pattern as
      // /recipes/scan just above.
      const images = req.body?.images;
      let workDir = null;
      const imagePaths = [];
      if (Array.isArray(images) && images.length) {
        if (images.length > 4) return res.status(400).json({ error: 'up to 4 images per tweak' });
        workDir = path.join(os.tmpdir(), 'nova-tweak', randomUUID().slice(0, 8));
        await mkdir(workDir, { recursive: true });
        for (let i = 0; i < images.length; i++) {
          const m = String(images[i]).match(IMAGE_DATA_URL);
          if (!m) return res.status(400).json({ error: `image ${i + 1} is not a supported image data URL` });
          const [, ext, b64] = m;
          const imgPath = path.join(workDir, `photo-${i + 1}.${ext}`);
          await writeFile(imgPath, Buffer.from(b64, 'base64'));
          imagePaths.push(imgPath);
        }
      }

      const jobId = startTweak(recipe, request.trim(), prior, imagePaths, workDir);
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
        // no steps of its own → cook it the way the original is cooked
        method: (Array.isArray(req.body.method) ? req.body.method.map((s) => String(s).trim()).filter(Boolean) : [])
          .length
          ? req.body.method.map((s) => String(s).trim()).filter(Boolean)
          : (recipe.method || []),
      });
      res.json({ recipe: updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Edit what's in a meal — his own, one Nova scanned, or a saved tweak.
  // `alt` names a variant; without it the parent recipe is edited.
  router.post('/recipes/:id/edit', async (req, res) => {
    try {
      // snapshot before, so we can tell whether the numbers moved with the food
      const prior = req.body?.ingredients
        ? (await loadRecipeData(vaultPath)).recipes.find((r) => r.id === req.params.id)
        : null;
      const priorSubject = prior && req.body?.alt ? (prior.alternates || []).find((a) => a.id === req.body.alt) : prior;
      const priorIng = priorSubject ? (req.body?.alt ? priorSubject.ingredients : priorSubject.ingredients.map((i) => i.name)) : null;

      const updated = await editRecipe(vaultPath, req.params.id, {
        ingredients: req.body?.ingredients,
        method: req.body?.method,
        macros: req.body?.macros,
      }, req.body?.alt || null);

      // Macros are never derived from ingredients — they're whatever was typed
      // or estimated. Changing the food while the numbers stand still is an
      // editing trap ("I fixed the recipe" but the macros are the old dish),
      // so say it out loud instead of letting it pass silently.
      const m = req.body?.macros;
      const pm = priorSubject?.macros;
      const ingredientsMoved = priorIng && JSON.stringify(priorIng) !== JSON.stringify(req.body.ingredients.filter((s) => String(s).trim()));
      const macrosStood = !m || (pm && m.p === pm.p && m.c === pm.c && m.f === pm.f && m.kcal === pm.kcal);
      res.json({
        recipe: updated,
        ...(ingredientsMoved && macrosStood ? { warning: 'Ingredients changed but the macros did not — update them if the change affects the numbers.' } : {}),
      });
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

  // Delete a recipe. removeRecipe existed (and was tested) since the
  // beginning but was reachable ONLY through inbox undo — the bank was
  // write-only from the UI. Clears any rotation slot pointing at it first
  // so the day never references a recipe that no longer exists.
  router.delete('/recipes/:id', async (req, res) => {
    try {
      const { removeRecipe } = await import('../lib/recipes.js');
      const { recipes } = await loadRecipeData(vaultPath);
      const rotation = await loadRotation(vaultPath, recipes);
      for (const [slot, r] of Object.entries(rotation.slots || {})) {
        if (r?.id === req.params.id) await setRotationSlot(vaultPath, recipes, slot, null);
      }
      const result = await removeRecipe(vaultPath, req.params.id);
      if (!result.removed) return res.status(404).json({ error: 'recipe not found' });
      res.json({ removed: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
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

  // TODAY's version of a slot — an alternate stands in without touching the
  // stored recipe; altId null returns to the original.
  // "This tweak IS the meal now" — alternate becomes primary, old main is
  // preserved as an alternate named Original (reversible by promoting back).
  router.post('/recipes/:id/promote', async (req, res) => {
    try {
      if (!req.body?.altId) return res.status(400).json({ error: 'altId is required' });
      const recipe = await promoteAlternate(vaultPath, req.params.id, req.body.altId);
      res.json({ recipe });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Renaming a variant changes its slug id, so any today-variant override
  // pointing at the old id migrates here — otherwise the slot would quietly
  // fall back to the main recipe.
  router.post('/recipes/:id/alternates/rename', async (req, res) => {
    try {
      const { altId, label } = req.body || {};
      if (!altId || !label) return res.status(400).json({ error: 'altId and label are required' });
      const { renameAlternate } = await import('../lib/recipes.js');
      const { recipe, newId, oldId } = await renameAlternate(vaultPath, req.params.id, altId, label);
      let rotation = null;
      if (newId !== oldId) {
        const { recipes } = await loadRecipeData(vaultPath);
        const { loadRotation, setSlotVariant } = await import('../lib/rotation.js');
        const current = await loadRotation(vaultPath, recipes);
        const slot = Object.entries(current.slots || {}).find(([, s]) => s && s.id === recipe.id && s.variantId === oldId)?.[0];
        if (slot) rotation = await setSlotVariant(vaultPath, recipes, slot, newId);
      }
      res.json({ recipe, rotation });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Rename the version currently IN USE. Previously only the other variants
  // could be renamed (they own a heading); the active one had no name to
  // edit, so anything he typed was lost the moment he switched away.
  router.post('/recipes/:id/rename-current', async (req, res) => {
    try {
      const { label } = req.body || {};
      if (!label || !String(label).trim()) return res.status(400).json({ error: 'label is required' });
      const { renameCurrentVersion } = await import('../lib/recipes.js');
      const { recipe } = await renameCurrentVersion(vaultPath, req.params.id, String(label).trim());
      res.json({ recipe });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/rotation/variant', async (req, res, next) => {
    try {
      const { recipes } = await loadRecipeData(vaultPath);
      const rotation = await setSlotVariant(vaultPath, recipes, req.body?.slot, req.body?.altId || null);
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
      // Write the meal into the food log too — the rotation frontmatter only
      // remembers TODAY, so without this a past day loses its main meals
      // entirely (his report: 54.6g shown against a real 149g).
      const chosen = rotation.slots?.[slot];
      if (chosen) {
        await setRotationEntry({
          slot,
          name: chosen.name,
          macros: chosen.macros,
          recipeId: chosen.id,
          consumed: !!consumed,
        }).catch(() => {});
      }
      recordTodaySnapshot(vaultPath).catch(() => {});
      res.json(rotation);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

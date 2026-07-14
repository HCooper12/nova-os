import { Router } from 'express';
import { loadRecipeData, addRecipe } from '../lib/recipes.js';
import { loadRotation, setRotationSlot } from '../lib/rotation.js';

const VALID_CATEGORIES = ['CORE DAILY MEALS', 'ROTATION / SWAP MEALS', 'TREATS'];

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

export function recipesRouter(vaultPath) {
  const router = Router();

  router.get('/recipes', async (req, res, next) => {
    try {
      const data = await loadRecipeData(vaultPath);
      res.json(data);
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

  return router;
}

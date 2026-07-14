import { Router } from 'express';
import { loadRecipes } from '../lib/recipes.js';

export function recipesRouter(vaultPath) {
  const router = Router();

  router.get('/recipes', async (req, res, next) => {
    try {
      const recipes = await loadRecipes(vaultPath);
      res.json({ recipes });
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ recipes: [] });
      next(err);
    }
  });

  return router;
}

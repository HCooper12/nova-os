import { Router } from 'express';
import { listTodos, addTodo, toggleTodo, setTodoCategory } from '../lib/todos.js';

export function todosRouter(vaultPath) {
  const router = Router();

  router.get('/todos', async (req, res, next) => {
    try {
      res.json(await listTodos(vaultPath));
    } catch (err) {
      next(err);
    }
  });

  router.post('/todos', async (req, res) => {
    try {
      res.json(await addTodo(vaultPath, req.body?.text, req.body?.category));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/todos/category', async (req, res) => {
    try {
      res.json(await setTodoCategory(vaultPath, req.body?.line, req.body?.category));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/todos/toggle', async (req, res) => {
    try {
      res.json(await toggleTodo(vaultPath, req.body?.line));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

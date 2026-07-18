import express from 'express';
import { startCapture, approveRecord, discardRecord, undoRecord, MODES } from '../lib/inbox.js';
import { listRecords, getRecord } from '../lib/inboxStore.js';

export function inboxRouter(vaultPath) {
  const router = express.Router();

  router.post('/inbox/capture', async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'text is required' });
      if (text.length > 4000) return res.status(400).json({ error: 'capture is too long (4000 chars max)' });
      const mode = MODES.includes(req.body?.mode) ? req.body.mode : 'auto-high';
      const source = req.body?.source === 'voice' ? 'voice' : 'text';
      const record = await startCapture(vaultPath, { text, source, mode });
      res.json({ id: record.id, status: record.status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/inbox', async (req, res) => {
    try {
      const items = await listRecords();
      res.json({ items, pendingCount: items.filter((r) => r.status === 'pending').length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // jobPoller-compatible: "running" while classifying, then "ready"/"error"
  router.get('/inbox/item/:id', async (req, res) => {
    try {
      const record = await getRecord(req.params.id);
      if (!record) return res.status(404).json({ error: 'not found' });
      const status = record.status === 'classifying' ? 'running' : record.status === 'error' ? 'error' : 'ready';
      res.json({ status, error: record.error || null, record });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/approve', async (req, res) => {
    try {
      const record = await approveRecord(vaultPath, req.params.id);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/discard', async (req, res) => {
    try {
      const record = await discardRecord(req.params.id);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/undo', async (req, res) => {
    try {
      const record = await undoRecord(vaultPath, req.params.id);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

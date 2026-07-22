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

  // Calendar follow-up answered "done" → deterministic journal receipt on
  // the rails (filed immediately — the tap IS the approval — and undoable).
  router.post('/followups', async (req, res) => {
    try {
      const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 120) : '';
      if (!label) return res.status(400).json({ error: 'label is required' });
      const time = typeof req.body?.time === 'string' ? req.body.time.slice(0, 5) : '';
      const { fileDecision } = await import('../lib/inbox.js');
      const { createRecord, updateRecord } = await import('../lib/inboxStore.js');
      const { randomUUID } = await import('node:crypto');
      const decision = {
        route: 'journal',
        confidence: 'high',
        title: `✓ ${label}`,
        reason: 'Calendar follow-up — confirmed done.',
        payload: { text: `✓ ${label}${time ? ` (${time} on the calendar)` : ''} — done.`, category: 'system', label: 'Calendar follow-up' },
      };
      const record = await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'followup',
        text: `✓ ${label}`,
        source: 'calendar',
        mode: 'auto',
        status: 'pending',
        createdAt: new Date().toISOString(),
        decision,
      });
      const { destination, undo } = await fileDecision(vaultPath, decision);
      res.json({ record: await updateRecord(record.id, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true }) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/research', async (req, res) => {
    try {
      const { startResearch } = await import('../lib/researcher.js');
      const record = await startResearch(vaultPath, req.body?.question);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
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

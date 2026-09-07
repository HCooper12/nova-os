import { Router } from 'express';
import { getRecord } from '../lib/inboxStore.js';
import { playable, getBriefingJob, BRIEFING_KIND } from '../lib/briefing.js';

// The briefing, ready to read or play. Read from the record rather than a
// separate store, so approving/undoing it in the Inbox and opening it here
// can never disagree about what exists.
export function briefingRouter() {
  const router = Router();

  router.get('/briefing/:id', async (req, res) => {
    try {
      const record = await getRecord(req.params.id);
      if (!record || record.kind !== BRIEFING_KIND) return res.status(404).json({ error: 'no such briefing' });
      const job = getBriefingJob(record.id);
      if (record.status === 'classifying') {
        return res.json({ id: record.id, status: 'working', stage: job?.stage || 'researching', angles: job?.angles || [], done: job?.done || 0, title: job?.title || null });
      }
      if (record.status === 'error') return res.json({ id: record.id, status: 'error', error: record.error || 'the briefing failed' });
      const b = record.decision?.payload?.briefing;
      if (!b) return res.status(409).json({ error: 'this briefing has no report attached' });
      const { briefing, beats } = playable(b);
      res.json({
        id: record.id, status: record.status, filed: record.status === 'filed', createdAt: record.createdAt,
        topic: record.decision.payload.topic || null, standing: record.decision.payload.standing || null,
        briefing, beats,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

import { Router } from 'express';
import { practiceSummary, setSkillStatus } from '../lib/practice.js';
import { startPrepare, startRehearsal } from '../lib/practiceLane.js';

// PRACTICE — the room (design/PRACTICE-PLAN.md "The API").
//
//   GET  /practice                     receipts only: pages, tallies, the next
//                                      scene, what is still being prepared
//   POST /practice/prepare             his sentence → a practice page (async;
//                                      the record carries the result)
//   POST /practice/rehearse            start a scene, take his turn, or end it
//                                      for the debrief; the client polls
//                                      /api/claude-code/:jobId like the Leader
//   POST /practice/skills/:slug/status active | paused | landed, with undo
export function practiceRouter(vaultPath) {
  const router = Router();

  router.get('/practice', async (req, res) => {
    try {
      res.json(await practiceSummary(vaultPath));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/practice/prepare', async (req, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ error: 'say which skill you want to practise' });
      const slug = typeof req.body?.slug === 'string' && req.body.slug ? req.body.slug : null;
      const record = await startPrepare(vaultPath, { text, research: req.body?.research === true, slug });
      res.json({ record });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.post('/practice/rehearse', async (req, res) => {
    try {
      const b = req.body || {};
      const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      const sessionId = str(b.sessionId);
      if (!sessionId && !str(b.slug)) return res.status(400).json({ error: 'which skill? slug is required to start a scene' });
      res.json(await startRehearsal(vaultPath, {
        slug: str(b.slug), scenario: str(b.scenario), sessionId, text: str(b.text), end: b.end === true,
      }));
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.post('/practice/skills/:slug/status', async (req, res) => {
    try {
      const status = String(req.body?.status || '');
      const out = await setSkillStatus(vaultPath, req.params.slug, status);
      let record = null;
      if (out.prior !== out.status) {
        const { createRecord } = await import('../lib/inboxStore.js');
        const { randomUUID } = await import('node:crypto');
        const at = new Date().toISOString();
        record = await createRecord({
          id: randomUUID().slice(0, 8), kind: 'practice-status',
          text: `Practice: ${out.title} is now ${out.status} (was ${out.prior}).`,
          source: 'practice', mode: 'auto', status: 'filed', auto: true,
          createdAt: at, filedAt: at, destination: out.relPath,
          undoData: { route: 'practice-status', slug: req.params.slug, prior: out.prior, statusLine: out.statusLine, updatedLine: out.updatedLine },
        });
      }
      res.json({ slug: req.params.slug, status: out.status, prior: out.prior, record });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  return router;
}

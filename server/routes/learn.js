import { Router } from 'express';
import { startLearn, MAX_LINKS } from '../lib/playbookLearn.js';
import { listPlaybooks, appliedSummary } from '../lib/playbooks.js';
import { getRecord } from '../lib/inboxStore.js';

// PLAYBOOKS: a method learned from videos and podcasts, applied by the
// matching agents once he approves it (lib/playbookLearn.js, lib/playbooks.js).
//
//   POST /learn {urls:[…], purpose?}   one pending record carries the draft;
//                                      the call returns at once with its id
//   GET  /learn/:id                    the job: step, each link read or failed
//                                      with its reason, the record's status
//   GET  /playbooks                    the pages he has, and how often each
//                                      was put in front of an agent
export function learnRouter(vaultPath) {
  const router = Router();

  router.post('/learn', async (req, res) => {
    try {
      const urls = Array.isArray(req.body?.urls) ? req.body.urls : (typeof req.body?.url === 'string' ? [req.body.url] : []);
      if (!urls.length) return res.status(400).json({ error: `send one to ${MAX_LINKS} links to learn from` });
      const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose : '';
      const record = await startLearn(vaultPath, { urls, purpose });
      res.json({ record });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.get('/learn/:id', async (req, res) => {
    try {
      const r = await getRecord(req.params.id);
      if (!r || r.kind !== 'playbook') return res.status(404).json({ error: 'no such learn job' });
      res.json({ id: r.id, status: r.status, step: r.learn?.step || null, links: r.learn?.links || [], error: r.error || null, title: r.decision?.title || null, text: r.text });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/playbooks', async (req, res) => {
    try {
      const [pages, applied] = await Promise.all([listPlaybooks(vaultPath), appliedSummary()]);
      res.json({
        playbooks: pages.map((p) => ({ title: p.title, relPath: p.relPath, triggers: p.triggers, agents: p.agents, rules: p.rules.length, sources: p.sources.length, updated: p.updated, uses: applied.byPlaybook[p.title]?.uses || 0, lastUsed: applied.byPlaybook[p.title]?.last || null })),
        applications: applied.total,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

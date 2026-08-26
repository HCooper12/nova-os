import { Router } from 'express';
import {
  readLeaderState, todayLead, generateDailyLead, runLeaderResearch,
  buildLeaderChatContext, applyLeaderReflection,
} from '../lib/leader.js';
import { startAskLeader } from '../lib/claudeCode.js';

export function leaderRouter(vaultPath) {
  const router = Router();

  // The homepage card and the Leader screen read THIS — receipts, not a
  // model call. An absent day is null, never a placeholder.
  router.get('/leader', async (req, res) => {
    try {
      const state = await readLeaderState();
      res.json({
        today: todayLead(state),
        recent: state.daily.slice(-8).reverse(),
        profile: {
          struggles: state.profile.struggles.filter((s) => !s.resolvedAt).slice(-8).reverse(),
          working: state.profile.working.slice(-8).reverse(),
        },
        researchCount: state.research.length,
        lastResearchAt: state.lastResearchAt,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Force-run a lane (the scheduler owns the normal cadence). Daily runs are
  // cheap; research is the expensive one and still respects its weekly gap
  // unless force is explicit.
  router.post('/leader/run', async (req, res) => {
    try {
      const kind = req.body?.kind === 'research' ? 'research' : 'daily';
      const force = !!req.body?.force;
      const out = kind === 'research'
        ? await runLeaderResearch(vaultPath, { force })
        : await generateDailyLead(vaultPath, { force });
      res.json(out);
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  // The sit-down. Same job/session shape as Coach — the client polls the
  // existing claude-code job endpoint for streaming partials.
  router.post('/leader/chat', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      const context = sessionId ? undefined : await buildLeaderChatContext(vaultPath);
      res.json({ jobId: startAskLeader(vaultPath, { question, context, sessionId }) });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  // Reflection intake for surfaces that aren't the chat (the weekly debrief
  // hands his spoken answers through here).
  router.post('/leader/reflect', async (req, res) => {
    try {
      const profile = await applyLeaderReflection({
        struggles: Array.isArray(req.body?.struggles) ? req.body.struggles : [],
        working: Array.isArray(req.body?.working) ? req.body.working : [],
        resolved: Array.isArray(req.body?.resolved) ? req.body.resolved : [],
      });
      res.json({ ok: true, profile });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  return router;
}

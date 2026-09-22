import { Router } from 'express';
import { composeOps } from '../lib/ops.js';
import { loadSkills } from '../lib/skills.js';

// Nova Operations — read-only endpoints; everything reported is assembled
// from state the platform already keeps (records, heartbeats, the skill
// registry page in the vault).
export function opsRouter(vaultPath) {
  const router = Router();
  router.get('/ops', async (req, res) => {
    try {
      res.json(await composeOps());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  // The Stream — the system's activity as one merged timeline of receipts
  // that already exist (records + significant requests). Read-only.
  router.get('/ops/stream', async (req, res) => {
    try {
      const { streamFeed } = await import('../lib/streamFeed.js');
      res.json(await streamFeed());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  // WORKING ON THIS MAC — every Claude Code session on the machine, judged
  // by when someone last spoke in it. Read-only; the two writes below are
  // the only things here that touch anything, and both are narrow.
  router.get('/ops/sessions', async (req, res) => {
    try {
      const { sessionsNow } = await import('../lib/claudeSessionsLive.js');
      res.json(await sessionsNow());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  // The lookup is deliberately a FRESH read rather than a cached picture:
  // a session that has ended between his tap and this request must be a
  // plain "it is not there any more", never a kill aimed at a dead id.
  router.post('/ops/sessions/show', async (req, res) => {
    try {
      const { sessionsNow, showSession, findSession } = await import('../lib/claudeSessionsLive.js');
      const found = findSession(await sessionsNow(), req.body?.sessionId);
      if (!found) return res.status(404).json({ error: 'That session is not running any more.' });
      res.json(await showSession({ session: found }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  router.post('/ops/sessions/close', async (req, res) => {
    try {
      const { sessionsNow, closeSession, findSession } = await import('../lib/claudeSessionsLive.js');
      const found = findSession(await sessionsNow(), req.body?.sessionId);
      if (!found) return res.status(404).json({ error: 'That session is not running any more.' });
      if (!found.canClose) {
        return res.status(409).json({ error: 'That one is still live, so Nova will not close it. Only a window left open or one that has already finished can be closed.' });
      }
      res.json(await closeSession({ session: found }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  router.get('/skills', async (req, res) => {
    try {
      res.json({ departments: await loadSkills(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  router.get('/pulse', async (req, res) => {
    try {
      const { getPulse, loadInterests } = await import('../lib/pulse.js');
      res.json({ topics: await getPulse(), interests: await loadInterests(vaultPath) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  return router;
}

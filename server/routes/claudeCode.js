import { Router } from 'express';
import { startMessage, getMessageJob, startBreaker } from '../lib/claudeCode.js';

const WORKSPACES = { repo: 'repoPath', vault: 'vaultPath' };
// Model aliases the frontend picker offers — anything else is rejected rather
// than passed through to the CLI's --model flag.
const MODELS = new Set(['sonnet', 'opus', 'fable', 'haiku']);
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function claudeCodeRouter({ repoPath, vaultPath }) {
  const router = Router();
  const cwdFor = { repo: repoPath, vault: vaultPath };

  router.post('/claude-code/message', async (req, res, next) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      const workspace = req.body?.workspace;
      const sessionId = req.body?.sessionId || undefined;
      const model = req.body?.model || undefined;
      if (!text) return res.status(400).json({ error: 'text is required' });
      if (!WORKSPACES[workspace]) return res.status(400).json({ error: 'workspace must be one of ' + Object.keys(WORKSPACES).join(', ') });
      if (model && !MODELS.has(model)) return res.status(400).json({ error: 'model must be one of ' + [...MODELS].join(', ') });
      if (sessionId && !SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });
      const jobId = startMessage(cwdFor[workspace], { text, sessionId, model });
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/claude-code/message/:jobId', (req, res) => {
    const job = getMessageJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error, partial: job.partial || null });
  });

  // Sparring loop: spawn a read-only Breaker over the workspace. Polled via
  // the same message/:jobId endpoint (shared jobs map).
  router.post('/claude-code/spar', async (req, res, next) => {
    try {
      const workspace = req.body?.workspace;
      const focus = typeof req.body?.focus === 'string' ? req.body.focus.trim().slice(0, 2000) : '';
      if (!WORKSPACES[workspace]) return res.status(400).json({ error: 'workspace must be one of ' + Object.keys(WORKSPACES).join(', ') });
      const jobId = startBreaker(cwdFor[workspace], { focus });
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  // C2: what the session changed, and his call on it. The diff is the
  // thing that made a terminal necessary; keeping/shelving closes the loop.
  router.get('/claude-code/changes', async (req, res) => {
    try {
      const { changeSummary } = await import('../lib/codeChanges.js');
      res.json(await changeSummary(req.query.workspace || 'repo', vaultPath));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/claude-code/commit', async (req, res) => {
    try {
      const { commitChanges } = await import('../lib/codeChanges.js');
      res.json(await commitChanges(req.body?.workspace || 'repo', vaultPath, req.body?.message));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/claude-code/shelve', async (req, res) => {
    try {
      const { shelveChanges } = await import('../lib/codeChanges.js');
      res.json(await shelveChanges(req.body?.workspace || 'repo', vaultPath));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/claude-code/unshelve', async (req, res) => {
    try {
      const { unshelveLatest } = await import('../lib/codeChanges.js');
      res.json(await unshelveLatest(req.body?.workspace || 'repo', vaultPath));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  return router;
}

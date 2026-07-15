import { Router } from 'express';
import { startMessage, getMessageJob } from '../lib/claudeCode.js';

const WORKSPACES = { repo: 'repoPath', vault: 'vaultPath' };

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
      const jobId = startMessage(cwdFor[workspace], { text, sessionId, model });
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/claude-code/message/:jobId', (req, res) => {
    const job = getMessageJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  return router;
}

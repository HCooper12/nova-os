import { Router } from 'express';
import { startMessage, getMessageJob } from '../lib/claudeCode.js';

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
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  return router;
}

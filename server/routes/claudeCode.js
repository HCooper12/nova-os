import { Router } from 'express';
import { startMessage, getMessageJob, startBreaker } from '../lib/claudeCode.js';
import { isValidModel } from '../lib/modelPrefs.js';

const WORKSPACES = { repo: 'repoPath', vault: 'vaultPath' };
// Exactly the values the model board recognises (aliases + pinned ids,
// including legacy pins kept valid for a saved choice) — anything else is
// rejected rather than passed through to the CLI's --model flag. isValidModel
// is DYNAMIC (resolved pinned ids move as modelWatch probes land), so a
// Set frozen at import time can't go stale here either.
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
      if (model && !isValidModel(model)) return res.status(400).json({ error: 'model is not a recognised alias or pinned id' });
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
    // `consult`: the agents this turn asked, as structured state (lib/consult.js)
    // — who, what, when asked and settled, and each answer — so a screen can
    // show the roster while they work and open each answer after.
    res.json({ status: job.status, result: job.result, error: job.error, partial: job.partial || null, visuals: job.visuals || null, consult: job.consult?.length ? job.consult : null });
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
  // Round 3 (10 Oct 2026): every write takes the ticked paths, checked in
  // lib/codeChanges.js before git is touched, and Undo takes back an
  // unpushed commit Nova made. `repoRoot` is this router's repoPath, so a
  // test mounts the router over a temporary repo and never his real one.
  const changes = () => import('../lib/codeChanges.js');
  const ws = (w) => (w === 'vault' ? 'vault' : 'repo');
  const fail = (res, e) => res.status(400).json({ error: e.message, code: e.code || null });
  router.get('/claude-code/changes', async (req, res) => {
    try {
      const sid = typeof req.query.sessionId === 'string' && SESSION_ID_RE.test(req.query.sessionId) ? req.query.sessionId : null;
      res.json(await (await changes()).changeSummary(ws(req.query.workspace), vaultPath, { repoRoot: repoPath, sessionId: sid }));
    } catch (e) { fail(res, e); }
  });
  router.get('/claude-code/diff', async (req, res) => {
    try { res.json(await (await changes()).fileDiff(ws(req.query.workspace), vaultPath, req.query.path, { repoRoot: repoPath })); } catch (e) { fail(res, e); }
  });
  router.get('/claude-code/commits', async (req, res) => {
    try { res.json(await (await changes()).listCommits(ws(req.query.workspace), vaultPath, { repoRoot: repoPath, since: Number(req.query.since) || 0 })); } catch (e) { fail(res, e); }
  });
  router.post('/claude-code/commit', async (req, res) => {
    try { res.json(await (await changes()).commitChanges(ws(req.body?.workspace), vaultPath, req.body?.message, { repoRoot: repoPath, paths: req.body?.paths })); } catch (e) { fail(res, e); }
  });
  router.post('/claude-code/undo', async (req, res) => {
    try { res.json(await (await changes()).undoCommit(ws(req.body?.workspace), vaultPath, { repoRoot: repoPath, sha: req.body?.sha })); } catch (e) { fail(res, e); }
  });
  router.post('/claude-code/shelve', async (req, res) => {
    try { res.json(await (await changes()).shelveChanges(ws(req.body?.workspace), vaultPath, { repoRoot: repoPath, paths: req.body?.paths })); } catch (e) { fail(res, e); }
  });
  router.post('/claude-code/unshelve', async (req, res) => {
    try { res.json(await (await changes()).unshelveLatest(ws(req.body?.workspace), vaultPath, { repoRoot: repoPath, sha: req.body?.sha || undefined })); } catch (e) { fail(res, e); }
  });

  return router;
}

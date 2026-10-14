import { Router } from 'express';
import { startMessage, getMessageJob, startBreaker } from '../lib/claudeCode.js';
import { isValidModel } from '../lib/modelPrefs.js';
import { listWorkspaces } from '../lib/codeWorkspaces.js';
import { watchCodeJobs, loadCodeJob } from '../lib/codeJobStore.js';
import { stageLineOf } from '../lib/handsFree.js';

// Exactly the values the model board recognises (aliases + pinned ids,
// including legacy pins kept valid for a saved choice) — anything else is
// rejected rather than passed through to the CLI's --model flag. isValidModel
// is DYNAMIC (resolved pinned ids move as modelWatch probes land), so a
// Set frozen at import time can't go stale here either.
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function claudeCodeRouter({ repoPath, vaultPath }) {
  const router = Router();
  // every Builder/Breaker answer is written to disk once it settles, so a
  // restart cannot turn a finished run into one that says "working" forever
  const settled = watchCodeJobs({ getJob: getMessageJob });
  // Where the Builder runs: Nova OS, the Vault, or a folder named in
  // server/data/code-workspaces.json (Science Atlas and Wren, 10 Oct 2026).
  // Anything else is refused, never quietly sent to Nova OS.
  // The same check the commit path makes (lib/codeChanges.js where): a
  // named folder must be the top of its own repository.
  const cwdOf = async (workspace) => {
    if (typeof workspace !== 'string' || !workspace) return null;
    try { return (await (await import('../lib/codeChanges.js')).where(workspace, vaultPath, repoPath)).cwd || null; } catch { return null; }
  };
  const badWorkspace = async () => 'workspace must be one of ' + (await listWorkspaces({ vaultPath })).map((w) => w.key).join(', ');

  router.post('/claude-code/message', async (req, res, next) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      const workspace = req.body?.workspace;
      const sessionId = req.body?.sessionId || undefined;
      const model = req.body?.model || undefined;
      if (!text) return res.status(400).json({ error: 'text is required' });
      const cwd = await cwdOf(workspace);
      if (!cwd) return res.status(400).json({ error: await badWorkspace() });
      if (model && !isValidModel(model)) return res.status(400).json({ error: 'model is not a recognised alias or pinned id' });
      if (sessionId && !SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });
      // the vault keeps the read/edit-only lane: no shell in his notes
      const jobId = startMessage(cwd, { text, sessionId, model, readOnly: workspace === 'vault' });
      settled.add(jobId);
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/claude-code/message/:jobId', async (req, res) => {
    const job = getMessageJob(req.params.jobId) || await loadCodeJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    // `consult`: the agents this turn asked, as structured state (lib/consult.js)
    // — who, what, when asked and settled, and each answer — so a screen can
    // show the roster while they work and open each answer after.
    // `stage`: what the Builder's run is doing between turns (checking,
    // fixing round n, the Breaker), narrated by code for the Code screen
    // `stageLine`: while a SLOW agent (the Researcher) is still being asked,
    // the one code-written line the app speaks once (lib/handsFree.js
    // stageLineOf); null the rest of the time, so the app stays quiet
    const slow = job.status === 'running' ? stageLineOf(job.consult) : null;
    // DRIVING (lib/register.js suppressGlass): nothing to look at. A VIS line
    // the model wrote anyway is stripped from the stream here, and no panel,
    // card or visual leaves this route, so the glass cannot rise by accident.
    if (job.noGlass) {
      const { parseVisualStream } = await import('../../src/visualBeats.js');
      const partial = job.partial ? parseVisualStream(job.partial).text : null;
      const result = job.result ? { ...job.result, text: typeof job.result.text === 'string' ? parseVisualStream(job.result.text).text : job.result.text, panel: null, card: null } : job.result;
      return res.json({ status: job.status, result, error: job.error, partial: partial || null, stage: job.stage || null, visuals: null, consult: job.consult?.length ? job.consult : null, stageLine: slow?.line || null, stageAgent: slow?.agent || null, glass: false });
    }
    res.json({ status: job.status, result: job.result, error: job.error, partial: job.partial || null, stage: job.stage || null, visuals: job.visuals || null, consult: job.consult?.length ? job.consult : null, stageLine: slow?.line || null, stageAgent: slow?.agent || null });
  });

  // Sparring loop: spawn a read-only Breaker over the workspace. Polled via
  // the same message/:jobId endpoint (shared jobs map).
  router.post('/claude-code/spar', async (req, res, next) => {
    try {
      const workspace = req.body?.workspace;
      const focus = typeof req.body?.focus === 'string' ? req.body.focus.trim().slice(0, 2000) : '';
      const cwd = await cwdOf(workspace);
      if (!cwd) return res.status(400).json({ error: await badWorkspace() });
      const jobId = startBreaker(cwd, { focus });
      settled.add(jobId);
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
  // a missing workspace is Nova OS (older clients sent none); an unknown one
  // is refused in lib/codeWorkspaces.js, never quietly read as Nova OS
  const ws = (w) => (typeof w === 'string' && w ? w : 'repo');
  const fail = (res, e) => res.status(400).json({ error: e.message, code: e.code || null });
  router.get('/claude-code/workspaces', async (req, res) => {
    try { res.json({ workspaces: await listWorkspaces({ vaultPath }) }); } catch (e) { fail(res, e); }
  });
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
    try { res.json(await (await changes()).listCommits(req.query.workspace === 'all' ? 'all' : ws(req.query.workspace), vaultPath, { repoRoot: repoPath, since: Number(req.query.since) || 0 })); } catch (e) { fail(res, e); }
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

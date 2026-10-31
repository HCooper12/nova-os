// /api/projects (Projects phase 1, 29 Oct 2026; PROJECTS-PLAN §4, §10b).
// Listing and reading are open; every write is a kernel call that refuses a
// linked project, and a stage move only FILES a card. appendLog has no route:
// the log is code's alone.
import { Router } from 'express';
import { novaKernel, allProjects, fileStageCard } from '../lib/novaProjects.js';
import { linkedProject, gitLog, sessionsIn, projectCost, LINKED_IDS } from '../lib/projectLinks.js';

const ID_RE = /^[0-9a-f]{8}$/;

function fail(res, e) {
  const status = e.code === 'linked' || e.code === 'protected' ? 403 : e.code === 'missing' ? 404 : e.code === 'duplicate' ? 409
    : ['brief', 'stage', 'settings', 'intake', 'exists', 'depth', 'lens', 'question', 'lane'].includes(e.code) ? 400 : 500;
  res.status(status).json({ error: e.message, code: e.code || null });
}

export function projectsRouter({ vaultPath, repoRoot, sessions } = {}) {
  const router = Router();
  const kernel = () => novaKernel(vaultPath);
  const readSessions = sessions || (async () => (await import('../lib/claudeSessionsLive.js')).sessionsNow());

  async function find(id) {
    if (LINKED_IDS.includes(id)) return linkedProject(id, { repoRoot });
    if (!ID_RE.test(id)) return null;
    return kernel().getProject(id);
  }

  router.get('/projects', async (req, res) => {
    try { res.json({ projects: await allProjects({ vaultPath, repoRoot }) }); } catch (e) { fail(res, e); }
  });

  router.get('/projects/:id', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      const k = kernel();
      const { listRecords } = await import('../lib/inboxStore.js');
      const cards = (await listRecords()).filter((r) => r.projectId === p.id && r.status === 'pending');
      let picture = null;
      try { picture = await Promise.race([readSessions(), new Promise((r) => setTimeout(() => r(null), 4000))]); } catch { picture = null; }
      const cost = projectCost(p.id);
      res.json({
        project: p,
        files: p.linked ? [] : k.folderListing(p),
        page: p.linked ? null : k.readPage(p),
        log: p.linked ? '' : k.readLog(p).split('\n').slice(-40).join('\n'),
        commits: p.linked ? await gitLog(p.linked.path) : [],
        cards,
        sessions: picture ? sessionsIn(picture, p.folder) : null,
        cost: { usd: cost.usd, costKnown: cost.known },
      });
    } catch (e) { fail(res, e); }
  });

  router.post('/projects/intake', async (req, res) => {
    try {
      const { startIntake } = await import('../lib/projectIntake.js');
      res.json(await startIntake(vaultPath, { text: req.body?.text, sessionId: req.body?.sessionId || null }));
    } catch (e) { fail(res, e); }
  });

  router.get('/projects/intake/:jobId', async (req, res) => {
    const { getMessageJob } = await import('../lib/claudeCode.js');
    const job = getMessageJob(req.params.jobId);
    if (!job || job.lane !== 'project-intake') return res.status(404).json({ error: 'that intake turn is not running here' });
    res.json({ id: job.id, status: job.status, stage: job.stage || null, partial: job.partial || '', result: job.result, error: job.error, sessionId: job.sessionId });
  });

  router.post('/projects/:id/stage', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      if (p.linked) return fail(res, Object.assign(new Error(`${p.name} is a linked project: Nova never moves it`), { code: 'linked' }));
      res.json({ record: await fileStageCard(p.id, String(req.body?.to || ''), req.body?.reason || '', { vaultPath }) });
    } catch (e) { fail(res, e); }
  });

  router.post('/projects/:id/archive', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      res.json(kernel().archiveProject(p));
    } catch (e) { fail(res, e); }
  });

  router.post('/projects/:id/settings', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      const out = kernel().applySettings(p, req.body || {});
      // three clean create/stage/settings actions in LOG.md: Nova proposes lifting dry run (a card, never a change)
      const { proposeDryRunLift } = await import('../lib/novaProjects.js');
      await proposeDryRunLift(p.id, { vaultPath }).catch(() => null);
      res.json(out);
    } catch (e) { fail(res, e); }
  });

  // RESEARCH FOR THIS PROJECT (phase 2): the Researcher's panel with the
  // project handed in; code checks every claim's source and writes research/.
  // { jobId } is the record's id, polled at GET /api/inbox/item/:id like any
  // record job. A linked project is refused (403) and nothing is written.
  router.post('/projects/:id/research', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      if (p.linked) return fail(res, Object.assign(new Error(`${p.name} is a linked project: Nova never writes research into it`), { code: 'linked' }));
      const { startProjectResearch } = await import('../lib/projectResearch.js');
      const model = req.body?.model === 'opus' || req.body?.model === 'sonnet' ? req.body.model : undefined;
      const record = await startProjectResearch(vaultPath, p.id, req.body?.question, { model });
      res.json({ jobId: record.id, record });
    } catch (e) { fail(res, e); }
  });

  // HIS "Watch them" on a candidates card, with the links he did not cross out
  router.post('/projects/:id/candidates/:recordId/watch', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      if (p.linked) return fail(res, Object.assign(new Error(`${p.name} is a linked project`), { code: 'linked' }));
      const { getRecord } = await import('../lib/inboxStore.js');
      const r = await getRecord(req.params.recordId);
      if (!r || r.projectId !== p.id) return res.status(404).json({ error: 'no such card for this project' });
      const { watchCandidates } = await import('../lib/projectResearch.js');
      const urls = Array.isArray(req.body?.urls) ? req.body.urls.map(String) : null;
      res.json({ record: await watchCandidates(vaultPath, r.id, urls) });
    } catch (e) { fail(res, e); }
  });

  // A VIDEO FOR THIS PROJECT (phase 2): the Watcher, with the project as its
  // destination and its lens (or his per-video pick). Lands only in
  // Projects/<Name>/Sources + Raw. { recordId } comes back; the record narrates.
  router.post('/projects/:id/watch', async (req, res) => {
    try {
      const p = await find(req.params.id);
      if (!p) return res.status(404).json({ error: 'no such project' });
      if (p.linked) return fail(res, Object.assign(new Error(`${p.name} is a linked project: Nova never files anything into it`), { code: 'linked' }));
      const { extractVideoUrl, startVideoWatch } = await import('../lib/watcher.js');
      const link = extractVideoUrl(String(req.body?.url || ''));
      if (!link) return res.status(400).json({ error: 'that does not look like a video link (YouTube, Instagram, TikTok, Vimeo…)' });
      const model = req.body?.model === 'opus' || req.body?.model === 'sonnet' ? req.body.model : undefined;
      const lens = typeof req.body?.lens === 'string' && req.body.lens ? req.body.lens : undefined;
      const record = await startVideoWatch(vaultPath, link.url, String(req.body?.question || link.question || '').slice(0, 500), { project: { id: p.id }, lens, model });
      res.json({ recordId: record.id, record });
    } catch (e) { fail(res, e); }
  });

  return router;
}

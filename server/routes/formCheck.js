import { Router } from 'express';
import { PROTOCOL, startFormCheck, getFormJob, rubricFor } from '../lib/formCheck.js';
import { storeAttachments } from '../lib/attachments.js';

// FORM CHECK (lib/formCheck.js) — he films one working set, Nova reads the
// frames against a written rubric, and refuses the clip if it cannot see
// what the rubric needs. The review is a proposal; his yes files it.
export function formCheckRouter(vaultPath) {
  const router = Router();

  // What to film, and what the rubric will look at — stated BEFORE he shoots.
  router.get('/form-check/protocol', async (req, res) => {
    const rubric = rubricFor(req.query.exercise || '');
    res.json({ protocol: PROTOCOL, rubric: { key: rubric.key, angle: rubric.angle, points: rubric.points } });
  });

  router.post('/form-check', async (req, res) => {
    try {
      const { video, exerciseId, exerciseName, sessionId, view, note } = req.body || {};
      if (!exerciseName) return res.status(400).json({ error: 'which lift is this?' });
      if (!video) return res.status(400).json({ error: 'attach the clip' });
      // one clip, stored the way every other attachment is
      const stored = await storeAttachments([video]);
      const item = stored.items.find((i) => i.kind === 'video');
      if (!item) return res.status(400).json({ error: 'that attachment is not a video' });
      const job = startFormCheck({ videoPath: item.path, exerciseId, exerciseName, sessionId, view, note, vaultPath });
      res.json({ jobId: job.id, status: job.status, protocol: PROTOCOL });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/form-check/:jobId', (req, res) => {
    const job = getFormJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'that form check is no longer in memory' });
    res.json(job);
  });

  return router;
}

import { Router } from 'express';
import { routeIntent, LANE_LABEL } from '../lib/intentRouter.js';

// The front door — one endpoint behind one input, anywhere in Nova.
//
// GET-style preview (`/intent/route`) shows him WHERE something will go
// before it goes; POST `/intent` actually dispatches into the lane. Every
// lane it dispatches to already existed and was already tested — this adds
// reach, not new machinery. The routing decision itself is deterministic
// (see lib/intentRouter.js): no model gets to send a squat question to the
// Researcher.
export function intentRouter(vaultPath) {
  const router = Router();

  router.post('/intent/route', (req, res) => {
    const decision = routeIntent(req.body?.text);
    res.json({ ...decision, label: decision.lane ? LANE_LABEL[decision.lane] : null });
  });

  router.post('/intent', async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      // he may override the lane from the UI — his call always wins over
      // the rules, and the override is honoured verbatim
      const forced = req.body?.lane;
      const decision = routeIntent(text);
      const lane = forced && Object.keys(LANE_LABEL).includes(forced) ? forced : decision.lane;
      if (!lane) return res.status(400).json({ error: 'nothing to route' });
      const out = { lane, label: LANE_LABEL[lane], why: forced ? 'you chose this lane' : decision.why };

      if (lane === 'watch') {
        const { startVideoWatch, extractVideoUrl } = await import('../lib/watcher.js');
        const found = extractVideoUrl(text);
        const url = decision.urls?.[0] || found?.url;
        if (!url) return res.status(400).json({ error: 'no video link found' });
        out.record = await startVideoWatch(vaultPath, url, decision.prose || found?.question || '');
        out.said = 'On it — pulling the transcript. The verdict lands in your Inbox.';
      } else if (lane === 'research') {
        const { startResearch } = await import('../lib/researcher.js');
        const q = decision.urls?.length ? `${decision.prose || 'Read and summarise this'}: ${decision.urls.join(' ')}` : text;
        out.record = await startResearch(vaultPath, q);
        out.said = 'Researching now — the brief lands in your Inbox with citations.';
      } else if (lane === 'study') {
        // A multi-source study is a real job, not a one-shot. Until the
        // Study lane runs itself, this files an honest, actionable brief
        // rather than pretending a single research pass covered a whole
        // catalogue — the protocol lives in design/WISETWINZ-STUDY-PLAN.md.
        const { startResearch } = await import('../lib/researcher.js');
        const q = `Catalogue study — ${decision.prose || 'analyse this creator'}. Sources: ${(decision.urls || []).join(' ') || '(named above)'}. Enumerate their whole body of work first, then compare against Nova's capabilities, and end with a prioritised list of what to adopt.`;
        out.record = await startResearch(vaultPath, q);
        out.said = 'Queued as a study — enumerating first, then comparing. It lands in your Inbox.';
      } else if (lane === 'code') {
        const { startMessage } = await import('../lib/claudeCode.js');
        const { jobId, sessionId } = startMessage(process.cwd(), { text });
        out.jobId = jobId; out.sessionId = sessionId;
        out.said = 'Running it as a Claude Code session — watch it on the Code screen.';
      } else if (lane === 'coach') {
        out.forward = { screen: 'workouts', tab: 'coach', question: text };
        out.said = 'That one is the Coach’s — opening it with your question.';
      } else if (lane === 'capture') {
        const { startCapture } = await import('../lib/inbox.js');
        out.record = await startCapture(vaultPath, { text, source: req.body?.source === 'voice' ? 'voice' : 'text' });
        out.said = 'Captured — Nova is filing it.';
      } else {
        out.forward = { screen: 'voice', question: text };
        out.said = 'Asking Nova.';
      }
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { routeIntent, LANE_LABEL } from '../lib/intentRouter.js';
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // the same root claudeCodeRouter's 'repo' workspace uses

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
      } else if (lane === 'book') {
        // A book from the front door (voice, Telegram, the palette). The
        // model-gated UI path calls /api/ingest directly with its choice;
        // this path runs on the board's default for the librarian lane.
        const meta = decision.book;
        if (!meta) return res.status(400).json({ error: 'could not read a title and author — try "add book <title> by <author>"' });
        const { startIngest } = await import('../lib/ingest.js');
        out.jobId = startIngest(vaultPath)(null, undefined, meta);
        out.said = `On it — the Librarian is researching "${meta.title}" by ${meta.author}. The draft pages land for your review.`;
      } else if (lane === 'research') {
        const { startResearch } = await import('../lib/researcher.js');
        const q = decision.urls?.length ? `${decision.prose || 'Read and summarise this'}: ${decision.urls.join(' ')}` : text;
        out.record = await startResearch(vaultPath, q);
        out.said = 'Researching now — the brief lands in your Inbox with citations.';
      } else if (lane === 'study') {
        // the real Study agent: enumerate → transcribe → synthesize vs
        // Nova's inventory. The record carries progress and the brief.
        const { startStudy } = await import('../lib/studyLane.js');
        out.record = await startStudy(vaultPath, { urls: decision.urls, prose: decision.prose });
        out.said = 'Study running — enumerating their whole catalogue, then transcribing and comparing. Nova pings you when the brief lands.';
      } else if (lane === 'code') {
        const { startMessage } = await import('../lib/claudeCode.js');
        // the repo, resolved from this file — process.cwd() under launchd is
        // nova-os/server, so a spoken build ran in the wrong directory
        const { jobId, sessionId } = startMessage(REPO_ROOT, { text });
        out.jobId = jobId; out.sessionId = sessionId;
        out.said = 'Running it as a Claude Code session — watch it on the Code screen.';
      } else if (lane === 'play') {
        const { resolveLatestVideo, openInBrowser } = await import('../lib/mediaLane.js');
        const found = await resolveLatestVideo(decision.prose || text);
        await openInBrowser(found.url).catch(() => {});
        out.played = found;
        out.said = `Here it is, sir — ${found.title}. Say the word and I'll have the Watcher digest it.`;
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

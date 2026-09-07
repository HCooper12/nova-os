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

  // ---- PLANS: a request that is several jobs, not one ---------------------
  //
  // His decision, 4 Sep: a plan never runs on Nova's own say-so. POST /plan
  // PROPOSES one — decompose, validate, and land it pending with its ceiling.
  // POST /plan/:id/run is the separate, explicit yes.
  router.post('/plan', async (req, res) => {
    try {
      const { startPlan } = await import('../lib/planner.js');
      const record = await startPlan(vaultPath, req.body?.text, { model: req.body?.model });
      res.json({ record, said: 'Working out who should do what — I will show you the plan before anything runs.' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/plan/:id/run', async (req, res) => {
    try {
      const { runPlan } = await import('../lib/planner.js');
      // fire and forget: the plan record carries its own progress, and the
      // steps take minutes — holding the request open would time out
      runPlan(vaultPath, req.params.id).catch(() => {});
      res.json({ ok: true, said: 'Running it now — I will come back with one report.' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // THE BROWSER HAND, LIVE: what it is doing right now, and the windows it
  // has opened — polled by the glass while a browse record is in flight.
  router.get('/browse/:id/live', async (req, res) => {
    try {
      const { liveFeed, shotDirFor } = await import('../lib/browse.js');
      const { getRecord } = await import('../lib/inboxStore.js');
      const record = await getRecord(req.params.id);
      if (!record || record.kind !== 'browse') return res.status(404).json({ error: 'no such browse run' });
      const feed = liveFeed(record.id);
      const { readdir } = await import('node:fs/promises');
      const path = await import('node:path');
      const dir = shotDirFor(record.id);
      const shots = (await readdir(dir).catch(() => [])).filter((f) => /^(shot|press)-\d+\.(png|jpe?g|webp)$/i.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      const { lastUrlOf } = await import('../lib/browse.js');
      res.json({ id: record.id, status: record.status, task: record.task || record.text, steps: feed?.steps || [], shots, lastUrl: record.finalUrl || lastUrlOf(feed), done: record.status !== 'classifying', summary: record.decision?.payload?.body || null, stoppedBefore: record.stoppedBefore || null, error: record.error || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // OPEN IT FOR REAL — in Nova's own visible browser on the Mac. Queued if a
  // headless run holds the profile; fires the moment it lands.
  router.post('/browse/open', async (req, res) => {
    try {
      const { openInNovaBrowser } = await import('../lib/browse.js');
      const out = await openInNovaBrowser(req.body?.url);
      res.json({ ...out, said: out.queued ? 'As soon as the hand is finished, it opens in Nova\'s browser.' : 'Open in Nova\'s browser.' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/browse/:id/shot/:file', async (req, res) => {
    try {
      if (!/^(shot|press)-\d+\.(png|jpe?g|webp)$/i.test(req.params.file)) return res.status(404).end();
      const path = await import('node:path');
      const { readFile } = await import('node:fs/promises');
      const { shotDirFor } = await import('../lib/browse.js');
      const dir = shotDirFor(req.params.id);
      const buf = await readFile(path.join(dir, req.params.file));
      const ext = req.params.file.split('.').pop().toLowerCase();
      res.set({ 'Content-Type': ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
      res.end(buf);
    } catch {
      res.status(404).end();
    }
  });

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
      } else if (lane === 'weave') {
        // the deep vault weave for a video — the same job the ingest modal
        // runs, reached by words now that the Inbox button is gone
        const url = decision.urls?.[0];
        if (!url) return res.status(400).json({ error: 'no video link found to weave' });
        const { startIngest } = await import('../lib/ingest.js');
        out.jobId = startIngest(vaultPath)('', url);
        out.said = 'Weaving it in — transcript first, then every concept and person as draft pages for your review.';
      } else if (lane === 'book') {
        // A book from the front door (voice, Telegram, the palette). The
        // model-gated UI path calls /api/ingest directly with its choice;
        // this path runs on the board's default for the librarian lane.
        const meta = decision.book;
        if (!meta) return res.status(400).json({ error: 'could not read a title and author — try "add book <title> by <author>"' });
        const { startIngest } = await import('../lib/ingest.js');
        out.jobId = startIngest(vaultPath)(null, undefined, meta);
        out.said = `On it — the Librarian is researching "${meta.title}" by ${meta.author}. The draft pages land for your review.`;
      } else if (lane === 'brief') {
        // THE WHOLE SENTENCE IS THE SPEC. The topic and his instructions are
        // not separated by a parser — the model that decomposes the topic and
        // the model that writes the report both get his words as he said
        // them, because "make it simply understood" is the most important
        // thing in the request and any split would drop it.
        const { startBriefing } = await import('../lib/briefing.js');
        out.record = await startBriefing(vaultPath, { topic: text, standing: text });
        out.said = 'On it — I will research this from a few angles at once, then write it up. You will get a notification when it is ready to read or listen to.';
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
      } else if (lane === 'browse') {
        const { startBrowse } = await import('../lib/browse.js');
        out.record = await startBrowse(vaultPath, text);
        out.said = 'Opening the browser — I will stop before anything that commits and show you what I found.';
      } else if (lane === 'leader') {
        out.forward = { screen: 'leader', question: text };
        out.said = 'That one is the Leader’s — opening it with your question.';
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

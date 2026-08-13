import { Router } from 'express';
import { startAskNova, startGreeting, getMessageJob, prewarmAsk } from '../lib/claudeCode.js';
import { composeDispatch } from '../lib/dispatch.js';
import { ttsConfigured, listVoices, synthesize } from '../lib/tts.js';
import { buildAskContext, todayLocalContext } from '../lib/askContext.js';

// The voice line: Ask Nova (read-only Q&A job over the vault, polled via the
// shared /claude-code/message/:jobId endpoint) and the ElevenLabs TTS proxy.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function voiceRouter(vaultPath) {
  const router = Router();

  // Live context injected on the FIRST turn of a conversation; resumed turns
  // already carry it. Shared builder (lib/askContext.js) so the Voice
  // screen, the Siri sync ask, and the Telegram bridge can never drift.
  const askContext = (sessionId, opts) => buildAskContext(vaultPath, sessionId, opts);

  router.post('/ask', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      const jobId = startAskNova(vaultPath, { question, context: await askContext(sessionId), sessionId });
      res.json({ jobId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // The wake debrief — the doorman greeting, generated (never templated)
  // from deterministic facts: time of day, arrival gap, the fleet's recent
  // receipts, and the gate count. The client decides WHEN a greeting is due;
  // this endpoint only decides the words.
  router.post('/greet', async (req, res) => {
    try {
      const gap = req.body?.gap === 'return' ? 'return' : 'new-day';
      const now = new Date();
      const bits = [
        `Local time: ${now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
        gap === 'return' ? 'He is RETURNING after a few hours away today.' : 'This is his FIRST arrival today.',
      ];
      try {
        const { fleetContext } = await import('../lib/fleetContext.js');
        const fleet = await fleetContext();
        if (fleet) bits.push(fleet);
      } catch { /* quiet rails, quiet greeting */ }
      try {
        const { overnightMorningLine } = await import('../lib/overnight.js');
        const line = await overnightMorningLine();
        if (line && gap === 'new-day') bits.push(line);
      } catch { /* optional */ }
      res.json({ jobId: startGreeting(vaultPath, { facts: bits.join('\n\n') }) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rituals — the morning brief / evening reflection conversations. The
  // instruction block is built server-side (versioned, tested) around a
  // dispatch composed fresh at tap time, then rides the normal ask pipeline.
  router.post('/ask/ritual', async (req, res) => {
    try {
      const { buildRitualQuestion, ritualLabel, RITUAL_KINDS } = await import('../lib/rituals.js');
      const kind = req.body?.kind;
      if (!RITUAL_KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of: ${RITUAL_KINDS.join(', ')}` });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      let dispatchText = '';
      if (kind === 'about-you') {
        // the interview's raw material is the profile as it stands, not the day
        try {
          const { profileContext } = await import('../lib/profile.js');
          dispatchText = await profileContext(vaultPath);
        } catch { /* honest fallback in the builder */ }
      } else {
        try { dispatchText = (await composeDispatch(vaultPath, kind)).text; } catch { /* honest fallback in the builder */ }
      }
      const question = buildRitualQuestion(kind, dispatchText);
      const jobId = startAskNova(vaultPath, { question, context: await askContext(sessionId), sessionId });
      res.json({ jobId, label: ritualLabel(kind) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Synchronous ask — starts the job and holds the response open until Nova
  // has answered, returning the plain text. This is what makes a hands-free
  // "Hey Siri, Ask Nova" Shortcut trivial: one request in, the spoken answer
  // out, no client-side polling.
  router.post('/ask/sync', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      // iOS Shortcuts kills a request that sits SILENT for too long ("The
      // network connection was lost"), so a long think needs SOMETHING on the
      // wire. The old fix dripped a space every 3s from the very start, on
      // the theory that leading whitespace is legal JSON and Shortcuts would
      // still parse it.
      //
      // That theory broke on his phone (13 Aug 2026): the server answered
      // 200 with the right answer, the body arrived as "    {"text":…}", and
      // Siri said it couldn't help — i.e. Shortcuts did NOT get a dictionary
      // out of it. It went unnoticed for so long because the drip only
      // corrupts SLOW answers, and answers only recently got fast enough for
      // the difference to show.
      //
      // So the drip now starts only once a request is genuinely long — past
      // the point where a clean body is worth less than a live connection.
      // Under that threshold (which is now every ordinary ask: ~2s resumed,
      // ~12s cold) the response is byte-perfect JSON with nothing in front
      // of it.
      res.set('Content-Type', 'application/json');
      res.flushHeaders();
      let keepalive = null;
      const KEEPALIVE_AFTER_MS = 20_000; // iOS gives up around 25s
      const keepaliveStart = setTimeout(() => {
        keepalive = setInterval(() => { try { res.write(' '); } catch { /* client gone */ } }, 5000);
      }, KEEPALIVE_AFTER_MS);
      // status can't change after flushing, so failures answer 200 with a
      // spoken-friendly `text` — Siri says what went wrong instead of nothing
      const finish = (payload) => {
        clearTimeout(keepaliveStart);
        if (keepalive) clearInterval(keepalive);
        res.end(JSON.stringify(payload));
      };

      // The spoken lane keeps ONE conversation alive rather than minting a
      // new one per ask. That single change removes the three biggest costs
      // in this request — context assembly, the CLI cold boot, and prompt
      // cache creation — because a resumed session skips all of them (see
      // lib/spokenSession.js for the measurements that motivated it).
      const { takeSpokenSession, dropSpokenSession } = await import('../lib/spokenSession.js');
      const spoken = takeSpokenSession();
      // A fresh session pays a CLI boot as well as a context build, and those
      // two waits are independent — so start the process now and assemble the
      // context while it boots, instead of doing them one after the other.
      if (!spoken.resumed) prewarmAsk(vaultPath, spoken.sessionId);
      // On a resumed turn the heavy context is already in the conversation;
      // only the volatile local numbers get re-stated. Both branches are
      // awaited the same way so the fast path stays visibly the cheap one.
      const [context, liveLine] = spoken.resumed
        ? ['', await todayLocalContext().catch(() => null) || '']
        : [await askContext(null, { fast: true }), ''];
      const started = Date.now();
      const jobId = startAskNova(vaultPath, {
        question, context, liveLine, direct: true,
        sessionId: spoken.sessionId, resume: spoken.resumed,
      });
      const deadline = Date.now() + 110_000;
      while (Date.now() < deadline) {
        if (res.writableEnded || res.destroyed) { clearInterval(keepalive); return; }
        const job = getMessageJob(jobId);
        if (job?.status === 'ready') {
          // One receipt line per spoken ask: whether the session was reused
          // and how long it took. "Why was that one slow?" is then answerable
          // from the log instead of by guessing (the whole reason this
          // latency problem went unexamined for so long).
          // The reply text is on the receipt too: when he says "Siri didn't
          // answer", the first question is whether Nova produced an answer at
          // all, and without this that took a live reproduction to establish.
          const reply = String(job.result.text || '');
          console.log(`ask/sync ${Date.now() - started}ms session=${spoken.resumed ? `resumed turn ${spoken.turns}` : `fresh (${spoken.reason})`} reply=${reply.length}ch ${JSON.stringify(reply.slice(0, 80))}`);
          return finish({ text: job.result.text, sessionId: job.result.sessionId });
        }
        if (job?.status === 'error') {
          // A dead process or a spent budget must not poison the next ask:
          // the following one starts a clean conversation rather than trying
          // to --resume something that is gone.
          dropSpokenSession();
          return finish({ text: `Nova hit an error: ${job.error}`, error: job.error });
        }
        await sleep(120);
      }
      dropSpokenSession();
      finish({ text: 'Nova took too long to answer that one.', error: 'timeout' });
    } catch (e) {
      if (res.headersSent) { try { res.end(JSON.stringify({ text: `Nova hit an error: ${e.message}`, error: e.message })); } catch { /* gone */ } return; }
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tts/status', async (req, res) => {
    try {
      if (!ttsConfigured()) return res.json({ configured: false, voices: [] });
      const voices = await listVoices().catch(() => []);
      res.json({ configured: true, voices });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tts', async (req, res) => {
    try {
      if (!ttsConfigured()) return res.status(409).json({ error: 'ElevenLabs is not configured' });
      const audio = await synthesize(req.body?.text, req.body?.voiceId);
      res.set('Content-Type', 'audio/mpeg').send(audio);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

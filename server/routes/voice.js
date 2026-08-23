import { Router } from 'express';
import { startAskNova, startGreeting, getMessageJob, prewarmAsk } from '../lib/claudeCode.js';
import { composeDispatch } from '../lib/dispatch.js';
import { ttsConfigured, ttsEngine, listVoices, synthesize } from '../lib/tts.js';
import { buildAskContext, todayLocalContext } from '../lib/askContext.js';
import { tryReflex } from '../lib/reflex.js';
import { composeShow } from '../lib/morningShow.js';

// The voice line: Ask Nova (read-only Q&A job over the vault, polled via the
// shared /claude-code/message/:jobId endpoint) and the ElevenLabs TTS proxy.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shortcuts variable NAMES, which arrive when a JSON body row holds typed
// text where the variable token was meant to go. They are valid strings, so
// nothing upstream can tell them from a real question — only this list can.
const PLACEHOLDER_QUESTIONS = new Set([
  'provided input', 'shortcut input', 'dictated text', 'ask nova', 'text',
  'spoken text', 'input', 'question', 'variable',
]);

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
      // The Reflex Layer: a direct question the live record already answers
      // never reaches the model. Code answers in <1s; a miss falls through
      // silently to the normal ask. (lib/reflex.js; MORNING-SHOW-PLAN.md)
      const reflex = await tryReflex(question).catch(() => null);
      if (reflex) {
        console.log(`reflex hit [${reflex.matched}] q=${JSON.stringify(question.slice(0, 80))} reply=${reflex.text.length}ch`);
        import('../lib/spokenLog.js').then(({ logSpoken }) => logSpoken('reflex', reflex.text)).catch(() => {});
        return res.json({ text: reflex.text, reflex: true });
      }
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      // Resumed turns get the volatile refresh (today's numbers + the
      // platform ledger) as a live line — his PWA conversation persists for
      // days, and turn-1 context alone left Nova blind to everything handed
      // to the platform since (observed 20 Aug: "what's the last video I
      // gave you?" answered from chat memory).
      const { resumedRefreshContext } = await import('../lib/askContext.js');
      const liveLine = sessionId ? await resumedRefreshContext().catch(() => '') : '';
      const jobId = startAskNova(vaultPath, { question, context: await askContext(sessionId), sessionId, liveLine });
      res.json({ jobId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Called the instant the microphone opens — before there is a question.
  // Boots the conversation's process (and, on a cold session, warms the
  // context cache) so the answer starts the moment he stops talking.
  // Deliberately cheap and fire-and-forget: it never blocks the ask.
  router.post('/ask/prewarm', (req, res) => {
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
    let warmed = false;
    // Only warm a process for a session that actually exists. Warming a
    // random id would park a useless child in a 4-slot pool and evict the
    // one that matters.
    if (sessionId) { try { warmed = prewarmAsk(vaultPath, sessionId, { resume: true }); } catch { /* best-effort */ } }
    // A NEW conversation pays ~2.4s of context assembly before the model
    // sees a word. Build it now, while he is still speaking; the ask picks
    // it up from the cache (see buildAskContext).
    else buildAskContext(vaultPath, null).catch(() => {});
    // Warm the VOICE too, not just the thinking. A cold Kokoro sidecar spends
    // ~8s loading its model, and that was paid AFTER the answer came back —
    // the one moment the wait is audible. Booting it now means it loads while
    // he is still speaking. Only when local TTS is actually the chosen path:
    // spawning a Python process for someone on ElevenLabs would be waste.
    import('../lib/ttsLocal.js')
      .then(({ localTtsEnabled, ensureSidecar }) => (localTtsEnabled() ? ensureSidecar() : null))
      .catch(() => { /* best-effort: a cold sidecar still boots on first use */ });
    res.json({ warmed });
  });

  // TODAY, FRESH — one card, rebuilt from the calendar as it stands right
  // now. His 21-Aug bug: he had Nova move three events and the TODAY card
  // in the rail still showed the old times, because a card is a snapshot of
  // the moment it was spoken. Anything that CHANGES the calendar re-pulls
  // this, so the glass can never contradict the vault.
  router.get('/glass/today', async (req, res) => {
    try {
      const { fetchEventsForDay } = await import('../lib/calendar.js');
      const { listCard } = await import('../lib/spokenCards.js');
      const events = await fetchEventsForDay(new Date(), { fresh: true });
      const speakTime = (t) => {
        const [H, M] = String(t || '').split(':').map(Number);
        if (Number.isNaN(H)) return t;
        return `${((H + 11) % 12) + 1}:${String(M || 0).padStart(2, '0')} ${H < 12 ? 'am' : 'pm'}`;
      };
      res.json({
        card: listCard({
          label: `TODAY · ${events.length} ON THE CALENDAR`,
          items: events.slice(0, 5).map((e) => ({ name: e.label, note: e.time === '00:00' ? 'all day' : speakTime(e.time) })),
        }),
      });
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
      // His ask (24 Aug): notice something like a movie marathon or a day
      // off on today's calendar and say a warm word about it — a check-in
      // moment, not just the full morning brief. Deterministic: the real
      // event, found by keyword (leisureEventToday, shared with the brief),
      // never invented or guessed at by the model.
      try {
        const { fetchEventsForDay } = await import('../lib/calendar.js');
        const { leisureEventToday } = await import('../lib/morningShow.js');
        const leisure = leisureEventToday(await fetchEventsForDay(now));
        if (leisure) bits.push(`Today's calendar includes "${leisure.label}" — worth a warm word if it genuinely fits, never forced.`);
      } catch { /* quiet rails, quiet greeting */ }
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
      // THE EXACT BYTES THE PHONE SENT. The health thread learned this the
      // expensive way — "key names alone could not explain a Shortcut whose
      // visible actions built one payload while another arrived" — and the
      // spoken lane just repeated the lesson: on 15 Aug a request arrived,
      // authenticated, answered 200, and Nova said "I'm ready, sir — what's
      // the question?" because the body carried no question at all. Without
      // this line, that is indistinguishable from a Shortcut that never ran.
      // Truncated; a spoken question only, never credentials.
      let body = req.body;
      const rawBody = (typeof body === 'string' ? body : JSON.stringify(body ?? null) || '').slice(0, 400);
      // Tolerate a raw-text body: iOS Shortcuts sending the request body as a
      // text "File" rather than JSON is a standing footgun in this codebase
      // (the health route already carries the same tolerance).
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* fall through to the field sweep */ }
      }
      // Accept the obvious spellings. A hand-built Shortcut names its variable
      // whatever felt natural at 6am, and a silently-dropped key is exactly
      // the failure mode that has now cost two separate multi-day hunts.
      const pick = (o) => ['question', 'text', 'prompt', 'input', 'q']
        .map((k) => (typeof o?.[k] === 'string' ? o[k].trim() : ''))
        .find((v) => v) || '';
      let question = pick(body);
      // A plain-text body that never parsed as JSON IS the question.
      if (!question && typeof body === 'string' && body.trim() && !body.trim().startsWith('{')) question = body.trim();

      if (!question) {
        // Answer 200 with spoken text, not a bare 400: a 400 makes Siri say
        // "I can't help with that", which describes nothing. This tells him
        // WHICH end is broken, out loud, the moment it happens.
        console.log(`ask/sync REJECTED: no question in body. raw=${JSON.stringify(rawBody)}`);
        return res.json({
          text: 'The Shortcut reached me but sent no question — its text variable is not making it into the request body. Check the Get Contents of URL step.',
          error: 'no question in body',
        });
      }
      // A Shortcut can send the NAME of a variable instead of its value — the
      // JSON body row accepts typed text, and "Provided Input" typed by hand
      // looks identical to the real token at a glance. That produces a
      // perfectly valid request carrying a phrase that is not a question, so
      // Nova answers "what's the question?" and everything downstream looks
      // healthy while being useless. Name it instead of politely absorbing it.
      if (PLACEHOLDER_QUESTIONS.has(question.toLowerCase().replace(/\s+/g, ' '))) {
        console.log(`ask/sync REJECTED: variable name sent as the question. raw=${JSON.stringify(rawBody)}`);
        return res.json({
          text: `The Shortcut sent the words "${question}" instead of what you said. In the Get Contents of URL step, the question field holds typed text rather than the variable — delete it and insert the Provided Input variable from the variable bar.`,
          error: 'variable name sent instead of its value',
        });
      }
      if (question.length > 1000) return res.status(400).json({ error: 'keep a spoken question under 1000 characters' });
      // The Reflex Layer, same as /ask: the Siri lane is where <1s matters
      // most — a reflex hit means Siri speaks the number before the CLI
      // would have finished booting. Miss → the session machinery below.
      const reflex = await tryReflex(question).catch(() => null);
      if (reflex) {
        console.log(`ask/sync reflex hit [${reflex.matched}] q=${JSON.stringify(question.slice(0, 80))}`);
        import('../lib/spokenLog.js').then(({ logSpoken }) => logSpoken('reflex', reflex.text)).catch(() => {});
        return res.json({ text: reflex.text, sessionId: null });
      }
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
          console.log(`ask/sync ${Date.now() - started}ms session=${spoken.resumed ? `resumed turn ${spoken.turns}` : `fresh (${spoken.reason})`} q=${JSON.stringify(question.slice(0, 60))} reply=${reply.length}ch ${JSON.stringify(reply.slice(0, 80))}`);
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

  // The Morning Show / Evening Debrief — deterministic receipts composed
  // as a spoken sequence; the client plays it through the TTS FIFO with
  // panes revealing per beat. Fast by construction (no model in the loop).
  router.post('/show', async (req, res) => {
    try {
      const variant = req.body?.variant === 'evening' ? 'evening' : 'morning';
      const show = await composeShow(vaultPath, { variant });
      console.log(`show composed [${variant}] ${show.steps.length} beats${show.pending ? ` highlight=${show.pending.recordId}` : ''}`);
      // the model must know what its own voice said — see lib/spokenLog.js
      const { logSpoken } = await import('../lib/spokenLog.js');
      for (const s of show.steps) await logSpoken('brief', s.say);
      res.json(show);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tts/status', async (req, res) => {
    try {
      if (!ttsConfigured()) return res.json({ configured: false, voices: [] });
      const voices = await listVoices().catch(() => []);
      res.json({ configured: true, engine: ttsEngine(), voices });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tts', async (req, res) => {
    try {
      if (!ttsConfigured()) return res.status(409).json({ error: 'no TTS engine is configured' });
      const audio = await synthesize(req.body?.text, req.body?.voiceId);
      res.set('Content-Type', 'audio/mpeg').send(audio);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

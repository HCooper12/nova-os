import { Router } from 'express';
import {
  readLeaderState, todayLead, generateDailyLead, runLeaderResearch,
  buildLeaderChatContext, applyLeaderReflection, leaderLiveLine, situationOf, answerSituation, openQuestion,
} from '../lib/leader.js';
import { readThread, appendThread, markReplySeen } from '../lib/leaderThread.js';
import { startAskLeader } from '../lib/claudeCode.js';
import { markHisWords } from '../lib/consult.js';

export function leaderRouter(vaultPath) {
  const router = Router();

  // The homepage card and the Leader screen read THIS — receipts, not a
  // model call. An absent day is null, never a placeholder.
  router.get('/leader', async (req, res) => {
    try {
      const state = await readLeaderState();
      const today = todayLead(state);
      const facts = situationOf(state);
      const now = Date.now();
      const struggles = state.profile.struggles;
      const open = struggles.filter((s) => !s.resolvedAt);
      const resolved = struggles.filter((s) => s.resolvedAt).sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));
      // the last time he told the Leader anything at all, open or not (the
      // honest line under the strip, Blend 1): the newest said, won, set down
      // or checked stamp, never a model's claim
      const stamps = [...struggles, ...state.profile.working]
        .flatMap((x) => [x.at, x.checkedAt, x.resolvedAt]).filter(Boolean)
        .map((t) => new Date(t).getTime()).filter(Number.isFinite);
      const lastToldAt = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
      let records = [];
      try { records = await (await import('../lib/inboxStore.js')).listRecords(); } catch { /* the question then reads today's alone */ }
      const thread = await readThread();
      res.json({
        today,
        // THE LIVE SITUATION, as its own channel — the second face of the Home
        // box. The model's read of it rides on today's record; the FACTS
        // (how many are open, how long since he said anything) are recomputed
        // here from the state, so the card is never stale about its own
        // staleness even if today's lead has not run.
        situation: facts ? { ...(today?.situation || {}), ...facts } : null,
        recent: state.daily.slice(-8).reverse(),
        profile: {
          struggles: open.slice(-8).reverse(),
          working: state.profile.working.slice(-8).reverse(),
        },
        // THE WHOLE PICTURE (Blend 1, 9 Oct 2026). `profile` above stays the
        // shape it always was; this is every open thing (the strip draws a
        // bead each, and "10 open" over eight items was the audit's finding
        // 2), every win, and what he has set down, newest first. Counts come
        // from these lists, never from a model.
        picture: {
          open: open.map((s) => ({ text: s.text, at: s.at, checkedAt: s.checkedAt || null })),
          working: state.profile.working.map((w) => ({ text: w.text, at: w.at })),
          resolved: resolved.slice(0, 20).map((s) => ({ text: s.text, at: s.at, resolvedAt: s.resolvedAt })),
          resolvedCount: resolved.length,
          lastToldAt,
          lastToldDays: lastToldAt ? Math.floor((now - new Date(lastToldAt).getTime()) / 86_400_000) : null,
        },
        // the question the Leader is waiting on, and whether he has answered it
        question: openQuestion(state, records),
        // the conversation, kept across reloads, newest last; each Leader
        // reply carries seenAt (null until he has opened it on top)
        thread: thread.slice(-120),
        researchCount: state.research.length,
        lastResearchAt: state.lastResearchAt,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // HIS ANSWER, WHEREVER HE IS. Typed or spoken straight into the situation
  // card — no chat to steer. The model only shapes what he said;
  // applyLeaderReflection does the writing, on the rails, with an undo.
  // THE SEEN MARK (his rule, 9 Oct 2026: an unread reply jumps to the top).
  // The page posts this once, when he opens the Leader with that reply on
  // top. Idempotent; no model; a receipt, not a decision, so no Inbox card.
  router.post('/leader/seen', async (req, res) => {
    try {
      const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { entry, wrote } = await markReplySeen(id);
      res.json({ ok: true, id: entry.id, seenAt: entry.seenAt, wrote });
    } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
  });

  router.post('/leader/situation/answer', async (req, res) => {
    try {
      res.json(await answerSituation(vaultPath, { text: req.body?.text }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Force-run a lane (the scheduler owns the normal cadence). Daily runs are
  // cheap; research is the expensive one and still respects its weekly gap
  // unless force is explicit.
  router.post('/leader/run', async (req, res) => {
    try {
      const kind = req.body?.kind === 'research' ? 'research' : 'daily';
      const force = !!req.body?.force;
      const out = kind === 'research'
        ? await runLeaderResearch(vaultPath, { force })
        : await generateDailyLead(vaultPath, { force });
      res.json(out);
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  // The sit-down. Same job/session shape as Coach — the client polls the
  // existing claude-code job endpoint for streaming partials.
  //
  // HIS WORDS COUNT HERE TOO (his call, 3 Oct 2026: "my own words in the
  // Leader chat or the Coach tab count the same way when those agents consult
  // the Coach"). The exact string handed to the Leader's turn is marked as
  // his (lib/consult.js markHisWords), so when the Leader consults the Coach
  // with it, a change he told the Leader to make applies on his standing
  // grant, exactly as it would from Nova or the Coach tab.
  router.post('/leader/chat', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      // THE ITEM HE IS TALKING ABOUT (Blend 1: the conversation rises with
      // the item quoted, so the Leader knows what he means). It rides in
      // front of his words, named as the page's, and is kept with his line.
      const quote = req.body?.quote && typeof req.body.quote === 'object' && typeof req.body.quote.title === 'string' && req.body.quote.title.trim()
        ? { kind: String(req.body.quote.kind || 'item').slice(0, 24), title: req.body.quote.title.trim().slice(0, 160), label: String(req.body.quote.label || '').slice(0, 80) }
        : null;
      const asked = quote ? `[He is talking about ${quote.label || 'this'}: "${quote.title}"]\n\n${question}` : question;
      // his line, kept as he typed it, before the turn starts: a reload while
      // the Leader works still shows what he said
      try { await appendThread({ who: 'you', text: question, sessionId, quote }); } catch { /* the turn still runs */ }
      if (sessionId) {
        // Resumed conversation: the session carries the deep picture, but the
        // VOLATILE picture — today's idea, the open struggles — is recomputed
        // every turn, exactly as the Coach's route does.
        const fresh = await leaderLiveLine().catch(() => '');
        const q = fresh ? `[Live now — trust this over anything earlier in this conversation: ${fresh}]\n\n${asked}` : asked;
        markHisWords(q);
        return res.json({ jobId: startAskLeader(vaultPath, { question: q, sessionId, keep: true }) });
      }
      const context = await buildLeaderChatContext(vaultPath);
      markHisWords(asked);
      res.json({ jobId: startAskLeader(vaultPath, { question: asked, context, sessionId: null, keep: true }) });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  // Reflection intake for surfaces that aren't the chat (the weekly debrief
  // hands his spoken answers through here).
  router.post('/leader/reflect', async (req, res) => {
    try {
      const out = await applyLeaderReflection({
        struggles: Array.isArray(req.body?.struggles) ? req.body.struggles : [],
        working: Array.isArray(req.body?.working) ? req.body.working : [],
        resolved: Array.isArray(req.body?.resolved) ? req.body.resolved : [],
        checked: Array.isArray(req.body?.checked) ? req.body.checked : [],
      });
      // `profile` keeps its old shape; what this call did and its receipt
      // ride beside it, so the page can put Undo where it happened
      res.json({ ok: true, profile: { struggles: out.struggles, working: out.working }, added: out.added, receiptId: out.receiptId });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  return router;
}

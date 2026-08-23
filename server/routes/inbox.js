import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { startCapture, approveRecord, discardRecord, undoRecord, retryRecord, MODES } from '../lib/inbox.js';
import { listRecords, getRecord } from '../lib/inboxStore.js';

export function inboxRouter(vaultPath) {
  const router = express.Router();

  router.post('/inbox/capture', async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'text is required' });
      if (text.length > 4000) return res.status(400).json({ error: 'capture is too long (4000 chars max)' });
      const mode = MODES.includes(req.body?.mode) ? req.body.mode : 'auto-high';
      const source = req.body?.source === 'voice' ? 'voice' : 'text';
      const record = await startCapture(vaultPath, { text, source, mode });
      res.json({ id: record.id, status: record.status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Spoken capture for the Siri Shortcut: same rails as /inbox/capture, but
  // holds the connection (with a whitespace drip so iOS never sees silence)
  // until the classifier settles, then answers with a SPEAKABLE `text` —
  // "filed as…", "drafted — approve it", or the honest error. One request
  // in, one sentence out.
  router.post('/inbox/capture/sync', async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'text is required', text: 'Nova heard nothing to capture.' });
      if (text.length > 4000) return res.status(400).json({ error: 'too long', text: 'Keep a spoken capture shorter, sir.' });
      // the Shortcuts placeholder trap, said OUT LOUD instead of filed as a
      // mystery draft: this exact literal means the text field holds typed
      // words where the blue variable chip should be
      if (/^provided input$/i.test(text)) {
        return res.status(400).json({ error: 'placeholder input', text: 'Your Shortcut sent the literal words Provided Input — in the text field, delete them and insert Provided Input as the blue variable chip instead.' });
      }
      const record = await startCapture(vaultPath, { text, source: 'voice', mode: req.body?.mode === 'review-all' ? 'review-all' : 'auto-high' });

      res.set('Content-Type', 'application/json');
      res.flushHeaders();
      const keepalive = setInterval(() => { try { res.write(' '); } catch { /* client gone */ } }, 3000);
      const finish = (payload) => { clearInterval(keepalive); res.end(JSON.stringify(payload)); };

      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (res.writableEnded || res.destroyed) { clearInterval(keepalive); return; }
        const r = await getRecord(record.id);
        if (r && r.status !== 'classifying') {
          if (r.status === 'filed') return finish({ id: r.id, status: r.status, text: `Filed — ${r.destination}.` });
          if (r.status === 'pending') return finish({ id: r.id, status: r.status, text: `Drafted as "${r.decision?.title || 'a capture'}" — say yes in the app or approve it in your Inbox.` });
          return finish({ id: r.id, status: r.status, text: `That didn't file: ${r.error || 'unknown error'}.` });
        }
        await new Promise((s) => setTimeout(s, 500));
      }
      finish({ id: record.id, status: 'classifying', text: 'Nova has it — still filing; check the Inbox in a moment.' });
    } catch (e) {
      if (res.headersSent) { try { res.end(JSON.stringify({ error: e.message, text: `That didn't work: ${e.message}` })); } catch { /* gone */ } return; }
      res.status(500).json({ error: e.message, text: `That didn't work: ${e.message}` });
    }
  });

  // Calendar follow-up answered "done" → deterministic journal receipt on
  // the rails (filed immediately — the tap IS the approval — and undoable).
  router.post('/followups', async (req, res) => {
    try {
      const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 120) : '';
      if (!label) return res.status(400).json({ error: 'label is required' });
      const time = typeof req.body?.time === 'string' ? req.body.time.slice(0, 5) : '';
      const { fileDecision } = await import('../lib/inbox.js');
      const { createRecord, updateRecord } = await import('../lib/inboxStore.js');
      const { randomUUID } = await import('node:crypto');
      const decision = {
        route: 'journal',
        confidence: 'high',
        title: `✓ ${label}`,
        reason: 'Calendar follow-up — confirmed done.',
        payload: { text: `✓ ${label}${time ? ` (${time} on the calendar)` : ''} — done.`, category: 'system', label: 'Calendar follow-up' },
      };
      const record = await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'followup',
        text: `✓ ${label}`,
        source: 'calendar',
        mode: 'auto',
        status: 'pending',
        createdAt: new Date().toISOString(),
        decision,
      });
      const { destination, undo } = await fileDecision(vaultPath, decision);
      res.json({ record: await updateRecord(record.id, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true }) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/research', async (req, res) => {
    try {
      const { startResearch } = await import('../lib/researcher.js');
      // model: the client already asked "Opus or Sonnet?" via the
      // model-choice gate before sending this request — 'opus'/'sonnet' only.
      const record = await startResearch(vaultPath, req.body?.question, { model: req.body?.model });
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Watch a video: accepts {url, question} or a raw {text} holding both.
  // Same rails as /research — explicit trigger, note lands pending.
  router.post('/video', async (req, res) => {
    try {
      const { startVideoWatch, extractVideoUrl } = await import('../lib/watcher.js');
      let url = String(req.body?.url || '').trim();
      let question = String(req.body?.question || '').trim();
      if (!url && req.body?.text) {
        const found = extractVideoUrl(req.body.text);
        if (!found) return res.status(400).json({ error: 'no video link found — paste the URL' });
        url = found.url;
        question = question || found.question;
      }
      const record = await startVideoWatch(vaultPath, url, question, { model: req.body?.model });
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // The Forge: build something from one spoken sentence. Answers IMMEDIATELY
  // with a spoken-friendly acknowledgment — the caller is usually a Shortcut
  // on his wrist, and the job reports its progress through the inbox rails
  // (agent lights, SSE) rather than by holding the request open.
  router.post('/forge', async (req, res) => {
    try {
      const { startForge } = await import('../lib/forge.js');
      const prompt = String(req.body?.prompt || req.body?.text || '').trim();
      const started = await startForge(prompt, { model: req.body?.model });
      res.json({ ...started, text: 'The Forge has it — I\'ll tell you when it\'s built.' });
    } catch (e) {
      // `text` so a spoken caller hears the reason rather than silence.
      res.status(400).json({ error: e.message, text: `I couldn't start that build: ${e.message}` });
    }
  });

  router.post('/forge/:id/stop', async (req, res) => {
    try {
      const { stopForge } = await import('../lib/forge.js');
      res.json(await stopForge(req.params.id));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/forge', async (req, res) => {
    try {
      const { listJobs } = await import('../lib/forge.js');
      res.json({ jobs: await listJobs() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // The proof image for a finished job. Served from the job data dir, and the
  // id is pattern-checked so a crafted id can't walk out of it.
  router.get('/forge/:id/proof', async (req, res) => {
    try {
      if (!/^[a-f0-9]{6,12}$/i.test(req.params.id)) return res.status(400).json({ error: 'bad job id' });
      const { JOBS_DIR } = await import('../lib/forge.js');
      const png = path.join(JOBS_DIR, `${req.params.id}.png`);
      if (!existsSync(png)) return res.status(404).json({ error: 'no proof image for that job' });
      res.sendFile(png);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/inbox', async (req, res) => {
    try {
      const items = await listRecords();
      res.json({ items, pendingCount: items.filter((r) => r.status === 'pending').length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // jobPoller-compatible: "running" while classifying, then "ready"/"error"
  router.get('/inbox/item/:id', async (req, res) => {
    try {
      const record = await getRecord(req.params.id);
      if (!record) return res.status(404).json({ error: 'not found' });
      const status = record.status === 'classifying' ? 'running' : record.status === 'error' ? 'error' : 'ready';
      res.json({ status, error: record.error || null, record });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/approve', async (req, res) => {
    try {
      const record = await approveRecord(vaultPath, req.params.id);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/discard', async (req, res) => {
    try {
      const record = await discardRecord(req.params.id, req.body?.reason);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // THE MODEL CHOICE GATE, scheduled-lane half: Pattern Scout/Distill raise
  // a pending 'model-choice' card instead of running when their weekly cron
  // fires (server/lib/modelChoice.js) — this is what actually runs the
  // week's job once he picks. Discarding the SAME card (the generic
  // /discard route above already handles any pending kind) skips the week.
  router.post('/inbox/:id/model-choice', async (req, res) => {
    try {
      const { resolveWeeklyModelChoice } = await import('../lib/modelChoice.js');
      const { record } = await resolveWeeklyModelChoice(vaultPath, req.params.id, req.body?.model);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/retry', async (req, res) => {
    try {
      const record = await retryRecord(vaultPath, req.params.id);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/inbox/:id/undo', async (req, res) => {
    try {
      const record = await undoRecord(vaultPath, req.params.id);
      res.json({ record });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

// TALK TO NOVA FROM THE WRIST (17 Nov 2026).
//
// The watch does not get its own answer machinery. It sends his words (or his
// recording) through the door, and the door hands them to the SAME spoken lane
// Siri and the Action Button use (routes/voice.js /ask/sync and /ask/audio),
// labelled `watch`, so the turn lands in the one conversation record and the
// phone shows it as part of the same thread.
//
// Why a forward and not a mount: the voice router is the whole spoken surface
// (dozens of routes). Mounting it on the door would put all of it on the
// public internet behind a watch token. The door carries exactly two verbs,
// and the main token used for the forward never leaves this process.
//
// Mounted ONLY on the wrist door (lib/wristDoor.js), behind wristAuth.
import express, { Router } from 'express';

// A recording from a watch is seconds of speech. 6 MB is far past that and
// far under what a stolen token could use to fill the Mac's memory.
const AUDIO_LIMIT = '6mb';

export function wristAskRouter({ port, token, fetchImpl = fetch } = {}) {
  const router = Router();
  const base = `http://127.0.0.1:${port}/api`;

  // The spoken lane can hold a long think open and drip a space to keep the
  // line alive, so the answer is piped through as it arrives, never buffered.
  const forward = async (req, res, path, { body, contentType }) => {
    const ac = new AbortController();
    // he lowered his wrist: stop waiting, which lets the lane see the line die
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    let up;
    try {
      up = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'X-Nova-Via': 'watch',
          ...(req.wristDevice?.name ? { 'X-Nova-Device': encodeURIComponent(req.wristDevice.name).slice(0, 120) } : {}),
        },
        body,
        signal: ac.signal,
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      // 200 with words, as the spoken lane itself does: the watch shows the
      // real cause instead of a bare failure
      return res.json({ text: 'Nova on your Mac did not answer the door.', error: `spoken lane unreachable: ${e.message}` });
    }
    res.status(up.status);
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'no-store');
    res.flushHeaders();
    try {
      for await (const chunk of up.body) res.write(chunk);
    } catch { /* either end went away mid-answer; nothing more to send */ }
    res.end();
  };

  router.post('/wrist/ask', async (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'question is required' });
    if (question.length > 20_000) return res.status(413).json({ error: 'too large' });
    return forward(req, res, '/ask/sync', { body: JSON.stringify({ question, where: req.body?.where }), contentType: 'application/json' });
  });

  // route-level, so the recording is only read AFTER the watch has shown its
  // token (the door's global parser is 64 KB of JSON and nothing else)
  router.post('/wrist/ask/audio', express.raw({ type: () => true, limit: AUDIO_LIMIT }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'a recording is required' });
    const type = String(req.get('content-type') || '');
    const contentType = /^audio\/[\w.+-]+$/.test(type) ? type : 'audio/mp4';
    return forward(req, res, '/ask/audio', { body: req.body, contentType });
  });

  return router;
}

export default wristAskRouter;

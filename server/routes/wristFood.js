// TELL THE WATCH WHAT HE ATE (17 Nov 2026): estimate by words or voice, then
// log it with any line dropped. Door-only (never mounted on main) because it
// takes a raw audio body at route level, exactly as wristAsk.js does, and the
// recording is read only after the watch has shown its token.
import express, { Router } from 'express';
import { estimateFromText, entryForEstimate, spendEstimate } from '../lib/wristEstimate.js';
import { logWatchEntry } from '../lib/wristToday.js';
import { startFoodDescribe } from '../lib/scanFood.js';
import { audioFromRequest } from '../lib/hearing.js';

const AUDIO_LIMIT = '6mb';
const send = (res, err) => res.status(err.status || 500).json({ error: err.message });

async function defaultTranscribe(audio, device) {
  // the SAME function /ask/audio calls (routes/voice.js)
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  return transcribeBuffer(audio.buf, { mime: audio.mime, name: audio.name, source: 'watch', device: device || 'watch', timeoutMs: 20_000 });
}

export function wristFoodRouter(vaultPath, { transcribe = defaultTranscribe, estimateDeps = {}, logEntry = logWatchEntry } = {}) {
  const router = Router();

  const run = async (req, res, text) => {
    try {
      // the describe lane reads his own recipes and log: it needs the vault, as POST /food-log/describe gives it
      res.json(await estimateFromText(text, { start: (t) => startFoodDescribe(t, { vaultPath }), ...estimateDeps }));
    } catch (e) {
      send(res, e);
    }
  };

  // JSON {text} or a recording. The audio parser is route-level and only
  // takes audio/*, so a JSON body falls through to the door's own parser.
  router.post('/wrist/food/estimate', express.raw({ type: (req) => /^audio\//i.test(String(req.headers['content-type'] || '')), limit: AUDIO_LIMIT }), async (req, res) => {
    if (Buffer.isBuffer(req.body)) {
      const audio = audioFromRequest(req.body, req.get('content-type'), '');
      if (audio.error) return res.status(422).json({ error: `I could not use that recording: ${audio.error}.` });
      let heard = '';
      try {
        heard = String((await transcribe(audio, 'watch')).text || '').trim();
      } catch (e) {
        return res.status(422).json({ error: `I could not turn that recording into words: ${e.message}` });
      }
      return run(req, res, heard);
    }
    if (typeof req.body?.text !== 'string') return res.status(400).json({ error: 'text or a recording is required' });
    return run(req, res, req.body.text);
  });

  router.post('/wrist/food/estimate/:estimateId/log', async (req, res) => {
    try {
      const drop = req.body?.drop === undefined || req.body?.drop === null ? [] : req.body.drop;
      const entry = entryForEstimate(req.params.estimateId, drop);
      const out = await logEntry(vaultPath, entry);
      spendEstimate(req.params.estimateId);
      res.json(out);
    } catch (e) {
      send(res, e);
    }
  });

  return router;
}

export default wristFoodRouter;

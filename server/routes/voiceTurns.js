import { Router } from 'express';
import { appendTurn, readTurns } from '../lib/voiceTurns.js';

// THE TURN RECEIPT. One POST per held spoken turn, written best-effort by the
// phone as the turn closes — see server/lib/voiceTurns.js for why it exists.
// It answers with `{ ok: true }` and nothing else: the client is not waiting,
// and must never be made to.
export function voiceTurnsRouter() {
  const router = Router();

  router.post('/voice/turn', async (req, res) => {
    try {
      const record = await appendTurn(req.body || {}, req.get('user-agent') || '');
      console.log(`voice turn ${record.surface} ${record.reason} after ${record.ms}ms, ${record.restarts} restart(s), heard=${record.heard}${record.engine ? ` via nova (meter ${record.vad}, ${record.bytes}B, words in ${record.txMs ?? '?'}ms)` : ''}`);
      res.json({ ok: true });
    } catch (e) {
      // a lost receipt is a lost line, never an error in his face mid-sentence
      console.log(`voice turn receipt failed: ${e.message}`);
      res.json({ ok: false });
    }
  });

  // For reading it back when he says it cut him off. Newest first.
  router.get('/voice/turns', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    res.json({ turns: readTurns().slice(-limit).reverse() });
  });

  return router;
}

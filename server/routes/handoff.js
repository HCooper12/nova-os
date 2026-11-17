import { Router } from 'express';
import { setHandoff, handoffFor } from '../lib/handoff.js';

// HANDOFF routes. Two faces of one record store (lib/handoff.js):
//   handoffRouter()      on the main API, /api/handoff, the phone is device 'phone'
//   wristHandoffRouter() on the wrist door, /wrist/handoff, device = the
//                        authenticated watch (req.wristDevice, set by wristAuth)
function face(path, who) {
  const router = Router();
  router.post(path, (req, res) => {
    const me = who(req);
    try {
      setHandoff({ device: me.id, deviceName: me.name, kind: req.body?.kind, title: req.body?.title });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === 'bad_kind') return res.status(400).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });
  router.get(path, (req, res) => res.json({ handoff: handoffFor(who(req).id) }));
  return router;
}

export const handoffRouter = () => face('/handoff', () => ({ id: 'phone', name: 'Phone' }));
export const wristHandoffRouter = () => face('/wrist/handoff', (req) => ({ id: req.wristDevice?.id || 'watch', name: req.wristDevice?.name }));

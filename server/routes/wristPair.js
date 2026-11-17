import { Router } from 'express';
import { startPairing, approvePairing, claimPairing, listDevices, revokeDevice, rateLimit, clientIp, openPairingWindow, closePairingWindow } from '../lib/wristDoor.js';

// THE WRIST DOOR'S PAIRING (lib/wristDoor.js). Two routers, two doors:
//   - wristPairPublicRouter: on the PUBLIC wrist listener, unauthenticated,
//     each route behind its own tight per-IP limit
//   - wristPairOwnerRouter: on the MAIN authenticated app only; this is where
//     he types the code his watch shows, and lists or revokes watches

const MAX_ID = 64;
const MAX_SECRET = 128;

// nothing a pairing answers may be cached by any proxy on the way
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

export function wristPairPublicRouter() {
  const router = Router();
  const startLimit = rateLimit({ windowMs: 10 * 60_000, max: 5 });
  const claimLimit = rateLimit({ windowMs: 5 * 60_000, max: 60 });

  router.post('/wrist/pair/start', startLimit, noStore, (req, res) => {
    const name = req.body && typeof req.body.name === 'string' ? req.body.name : undefined;
    try {
      res.json(startPairing({ name, ip: clientIp(req) }));
    } catch (e) {
      if (e.code === 'closed') return res.status(403).json({ error: 'Pairing is closed. Open it from Nova on your phone or Mac first.' });
      if (e.code === 'too_many_pending') {
        res.set('Retry-After', '300');
        return res.status(429).json({ error: 'Too many pairings are waiting. Try again in a few minutes.' });
      }
      throw e;
    }
  });

  router.post('/wrist/pair/claim', claimLimit, noStore, async (req, res) => {
    const { pairingId, secret } = req.body || {};
    const refuse = () => res.status(403).json({ error: 'That pairing is not valid.' });
    if (typeof pairingId !== 'string' || typeof secret !== 'string' || pairingId.length > MAX_ID || secret.length > MAX_SECRET) return refuse();
    try {
      res.json(await claimPairing({ pairingId, secret }));
    } catch (e) {
      if (e.code === 'bad_claim') return refuse();
      throw e;
    }
  });

  return router;
}

export function wristPairOwnerRouter() {
  const router = Router();

  router.post('/wrist/pair/approve', noStore, (req, res) => {
    const code = req.body ? req.body.code : undefined;
    try {
      res.json(approvePairing(code));
    } catch (e) {
      if (e.code === 'bad_code') return res.status(400).json({ error: 'That code is not valid or has expired.' });
      if (e.code === 'locked') {
        res.set('Retry-After', '600');
        return res.status(429).json({ error: 'Too many wrong codes. Pairing is locked for 10 minutes.' });
      }
      throw e;
    }
  });

  // he opens pairing for ten minutes; it shuts by itself on approve
  router.post('/wrist/pair/open', noStore, (req, res) => res.json(openPairingWindow()));
  router.post('/wrist/pair/close', noStore, (req, res) => { closePairingWindow(); res.json({ closed: true }); });

  router.get('/wrist/devices', async (req, res) => {
    res.json({ devices: await listDevices() });
  });

  router.delete('/wrist/devices/:id', async (req, res) => {
    const ok = await revokeDevice(req.params.id);
    if (!ok) return res.status(404).json({ error: 'No wrist device has that id.' });
    res.json({ revoked: true });
  });

  return router;
}

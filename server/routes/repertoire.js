import { Router } from 'express';
import { localDateISO } from '../lib/localDate.js';
import { techniqueForDay, loadRepertoire, flatten, logPractice, readState, computeStreak } from '../lib/repertoire.js';

// THE REPERTOIRE — today's technique, and the tap that says he practised it.
//
// The day is HIS local day, not UTC's: he opens Home at 04:30, when the UTC
// date is still yesterday, and a curriculum that served him yesterday's
// technique every morning would be worse than useless. localDateISO is the
// one place that decision lives.
export function repertoireRouter(vaultPath) {
  const router = Router();

  // Today's card. Deliberately GET-with-a-side-effect: the FIRST read of a
  // day records the pick, which is what makes Home and the spoken brief agree
  // about what today's technique is. A reload cannot re-roll the day.
  router.get('/repertoire/today', async (req, res, next) => {
    try {
      const date = localDateISO();
      const pick = await techniqueForDay(vaultPath, date);
      if (!pick) {
        const state = await readState();
        return res.json({
          date, technique: null,
          // honest degradation: say which of the two reasons it is, because
          // "nothing today" reads like a bug and these do not
          reason: 'Nothing in your Repertoire yet — send Nova a clip and ask it to teach you the techniques in it.',
          streak: computeStreak(state, date),
        });
      }
      res.json({ date, ...pick });
    } catch (err) { next(err); }
  });

  // The whole curriculum, in teaching order, with what he has done to each —
  // AND the research behind it. His ask, 15 Sep: "I'd like to be able to view
  // all of the research and techniques catalogue it has stored". The reports
  // are already on the records that filed them, so they are served from there
  // rather than re-read out of the vault: one source, and it keeps the
  // coverage receipt attached to the research it certifies.
  router.get('/repertoire', async (req, res, next) => {
    try {
      const techniques = flatten(await loadRepertoire(vaultPath));
      const state = await readState();
      const { listRecords } = await import('../lib/inboxStore.js');
      const reports = (await listRecords())
        .filter((r) => r.kind === 'repertoire' && r.decision?.payload?.body)
        .map((r) => ({
          id: r.id,
          title: r.decision.title,
          at: r.filedAt || r.updatedAt || r.createdAt,
          status: r.status,
          url: r.repertoireUrl || null,
          topUp: !!r.topUp,
          confirmLine: r.confirmLine || null,
          body: r.decision.payload.body,
          added: (r.decision.payload.techniques || []).length,
        }));
      res.json({
        techniques: techniques.map((t) => ({
          ...t,
          tried: Number(state.techniques[t.id]?.tried) || 0,
          seen: Number(state.techniques[t.id]?.seen) || 0,
          lastOn: state.techniques[t.id]?.lastSurfacedOn || null,
        })),
        reports,
        streak: computeStreak(state, localDateISO()),
      });
    } catch (err) { next(err); }
  });

  // "I tried it" / "not today". His own write, so it does not ride the
  // proposal rails (same as logging a meal) — it is reversible in place by
  // marking the day again, which corrects the tally rather than doubling it.
  router.post('/repertoire/practice', async (req, res) => {
    try {
      const { outcome, note } = req.body || {};
      const date = String(req.body?.date || '').slice(0, 10) || localDateISO();
      res.json(await logPractice(vaultPath, date, outcome, note || ''));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Send it something to analyse and learn from, without going through the
  // chat router — the Inbox composer and the Shortcut both land here.
  router.post('/repertoire/analyse', async (req, res) => {
    try {
      const { startRepertoire } = await import('../lib/repertoireLane.js');
      res.json(await startRepertoire(vaultPath, req.body || {}));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

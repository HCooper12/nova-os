import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { QUESTIONS, compute, describe, parseAnswer } from '../lib/intake.js';
import { createRecord } from '../lib/inboxStore.js';

// THE INTAKE (lib/intake.js). The interview itself runs on the glass; the
// server answers three things: what Nova already knows (so questions are
// confirmations), the parse of one answer, and the proposal — a pending
// record with the arithmetic as its body, which his yes files.
export function intakeRouter(vaultPath) {
  const router = Router();

  router.get('/intake/prefill', async (req, res) => {
    const out = { questions: QUESTIONS.map(({ key, ask, choices, unit, optional }) => ({ key, ask, choices, unit, optional })), known: {} };
    try {
      const { loadRecipeData } = await import('../lib/recipes.js');
      const { profile } = await loadRecipeData(vaultPath);
      if (profile?.heightCm) out.known.heightCm = { value: profile.heightCm, from: 'the recipe collection' };
      if (profile?.targetKcal) out.known.currentTargets = { targetKcal: profile.targetKcal, proteinFloorG: profile.proteinFloorG };
    } catch { /* no collection → nothing known */ }
    try {
      const { loadRecentDays, computeWeightTrend } = await import('../lib/healthData.js');
      const days = await loadRecentDays(60);
      const t = computeWeightTrend(days);
      // weighIns is a COUNT on the trend; the latest reading rides as latestKg/latestDate
      if (t?.latestKg) out.known.weightKg = { value: t.latestKg, on: t.latestDate, from: `your last weigh-in (${t.latestDate}${t.staleDays > 1 ? `, ${t.staleDays} days ago` : ''})` };
    } catch { /* no health data → nothing known */ }
    try {
      const { getProfile } = await import('../lib/profile.js');
      const p = await getProfile(vaultPath);
      if (p?.intake) out.known.intake = p.intake;
    } catch { /* no profile yet */ }
    res.json(out);
  });

  router.post('/intake/answer', (req, res) => {
    res.json(parseAnswer(req.body?.key, req.body?.text));
  });

  router.post('/intake/propose', async (req, res) => {
    try {
      const facts = req.body?.facts || {};
      const plan = compute(facts);
      const d = describe(facts, plan);
      const record = await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'intake',
        text: d.title,
        source: 'intake',
        mode: 'review-all',
        status: 'pending',
        decision: { route: 'intake', title: d.title, payload: { facts, plan, body: d.body } },
        createdAt: new Date().toISOString(),
      });
      res.json({ record, plan, lines: plan.lines, title: d.title, body: d.body });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

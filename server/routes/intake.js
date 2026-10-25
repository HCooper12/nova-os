import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { QUESTIONS, STABLE_FACTS, compute, describe, parseAnswer, mergeFacts, bodyFat } from '../lib/intake.js';
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
      // body fat: the newest reading Apple Health sent in the window
      const bf = [...days].reverse().find((d) => bodyFat(d.bodyFatPct) != null);
      if (bf) out.known.bodyFatPct = { value: bodyFat(bf.bodyFatPct), on: bf.date, from: `Apple Health (${bf.date})` };
      if (t?.latestKg) out.known.weightKg = { value: t.latestKg, on: t.latestDate, from: `your last weigh-in (${t.latestDate}${t.staleDays > 1 ? `, ${t.staleDays} days ago` : ''})` };
    } catch { /* no health data → nothing known */ }
    try {
      const { getProfile } = await import('../lib/profile.js');
      const p = await getProfile(vaultPath);
      if (p?.intake) {
        out.known.intake = p.intake;
        // what an edit or a redo keeps without asking (26 Oct 2026, his ask)
        out.stable = STABLE_FACTS;
      }
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

  // AN EDIT (26 Oct 2026, his ask): change what changed — a pace, a weight, a
  // body fat — and keep every other answer. It is his own act, so it files
  // at once instead of waiting in the Inbox, through the same approve path
  // (and the same undo) as the Intake's yes.
  router.post('/intake/apply', async (req, res) => {
    try {
      const { getProfile } = await import('../lib/profile.js');
      const stored = (await getProfile(vaultPath))?.intake;
      if (!stored?.facts) return res.status(400).json({ error: 'there is no Intake to edit yet — set your numbers first' });
      const facts = mergeFacts(stored.facts, req.body?.change || {});
      const plan = compute(facts);
      const d = describe(facts, plan);
      const id = randomUUID().slice(0, 8);
      await createRecord({
        id,
        kind: 'intake',
        text: d.title,
        source: 'intake-edit',
        mode: 'review-all',
        status: 'pending',
        decision: { route: 'intake', title: d.title, payload: { facts, plan, body: d.body } },
        createdAt: new Date().toISOString(),
      });
      const { approveRecord } = await import('../lib/inbox.js');
      const record = await approveRecord(vaultPath, id);
      res.json({ record, plan, facts, title: d.title });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // THE WEEKLY REVIEW (lib/fuelReview.js): what it last saw, or a run now
  router.get('/intake/review', async (req, res) => {
    const { readReviewState } = await import('../lib/fuelReview.js');
    res.json((await readReviewState()).last || null);
  });
  router.post('/intake/review', async (req, res) => {
    try {
      const { runFuelReview } = await import('../lib/fuelReview.js');
      res.json(await runFuelReview(vaultPath, { force: true }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

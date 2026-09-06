import { Router } from 'express';
import { loadExerciseLibrary, addCustomExercise, MUSCLE_GROUPS, TRACKING_TYPES } from '../lib/exercises.js';
import { loadRoutines, createRoutine, updateRoutine, deleteRoutine, setScheduleDay, WEEKDAYS } from '../lib/workouts.js';
import { loadExerciseState } from '../lib/exerciseState.js';
import { loadSessions, completeSession, updateSession, deleteSession, completedCountByRoutine } from '../lib/workoutSessions.js';
import { computeProgressions, draftSessionSummary, normalizeQuickPlan } from '../lib/coach.js';
import { startQuickSession } from '../lib/claudeCode.js';
import { getFitnessGoals, setFitnessGoals, goalsContext } from '../lib/fitnessGoals.js';
import { profileContext } from '../lib/profile.js';
import { loadRecentDays } from '../lib/healthData.js';
import { listCarryovers, addCarryover, rescheduleCarryover, removeCarryover, carryoverContext } from '../lib/workoutCarryover.js';

function annotateRoutines(routines, exerciseState, completedCounts, tunes = []) {
  return routines.map((r) => ({
    ...r,
    completedCount: completedCounts[r.id] || 0,
    exercises: r.exercises.map((e) => {
      const state = exerciseState[e.exerciseId];
      const tune = tunes.find((t) => t.exerciseId === e.exerciseId) || null;
      return { ...e, lastSets: state ? state.lastSets : [], lastDate: state ? state.lastDate : null, tune };
    }),
  }));
}

export function workoutsRouter(vaultPath) {
  const router = Router();

  // the redesigned TODAY pane's single read — see lib/trainOverview.js
  router.get('/train/overview', async (req, res, next) => {
    try {
      const { buildTrainOverview } = await import('../lib/trainOverview.js');
      res.json(await buildTrainOverview(vaultPath));
    } catch (err) { next(err); }
  });

  // The cross-reference agent, on demand: findings now, and (with raise)
  // the same weekly-cooldown Inbox drop the morning scheduler performs.
  // verdict cards (A1) — a question in, a full evidence card out. Every
  // number computed deterministically here; the model is not in this path.
  router.get('/verdict/:kind', async (req, res) => {
    try {
      const { buildVerdict } = await import('../lib/verdicts.js');
      res.json({ verdict: await buildVerdict(vaultPath, req.params.kind, req.query.of) });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.get('/train/fuel-cross', async (req, res, next) => {
    try {
      const { crossCheck } = await import('../lib/fuelCross.js');
      res.json(await crossCheck(vaultPath));
    } catch (err) { next(err); }
  });
  // the nightly reflection, on demand (guarded by the once-a-day state
  // unless forced) — the same run the 03:00 window performs
  router.post('/train/reflection/run', async (req, res, next) => {
    try {
      const { runReflection } = await import('../lib/coachReflection.js');
      res.json(await runReflection(vaultPath, { force: req.body?.force === true }));
    } catch (err) { next(err); }
  });
  // how Coach's edits file — his standing grant (direct) or confirm-first
  router.get('/train/coach-edits', async (req, res, next) => {
    try { const { getCoachEditConfig } = await import('../lib/coach.js'); res.json(await getCoachEditConfig()); } catch (err) { next(err); }
  });
  router.post('/train/coach-edits', async (req, res, next) => {
    try { const { setCoachEditConfig } = await import('../lib/coach.js'); res.json(await setCoachEditConfig(req.body || {})); } catch (err) { next(err); }
  });
  router.post('/train/fuel-cross/raise', async (req, res, next) => {
    try {
      const { raiseFuelFindings } = await import('../lib/coachCadence.js');
      res.json({ raised: await raiseFuelFindings(vaultPath) });
    } catch (err) { next(err); }
  });

  // The Coach's program review — mapping errors, muscles chronically
  // short, lifts that have stopped paying. Same shape as fuel-cross above:
  // a preview (no write) and an on-demand raise (the same rails the
  // morning window runs automatically), so this can be triggered without
  // waiting for the 7am-noon scheduler window.
  router.get('/train/program-review', async (req, res, next) => {
    try {
      const { reviewProgram } = await import('../lib/coachProgramReview.js');
      res.json(await reviewProgram(vaultPath));
    } catch (err) { next(err); }
  });
  router.post('/train/program-review/raise', async (req, res, next) => {
    try {
      const { raiseProgramFindings } = await import('../lib/coachProgramReview.js');
      res.json(await raiseProgramFindings(vaultPath));
    } catch (err) { next(err); }
  });

  // THE WEEKLY AUDIT. GET previews it without writing — including the checks
  // that came back CLEAR, which is the whole reason it exists: three
  // detectors had never fired on his data and silence was indistinguishable
  // from breakage. POST runs it for real (receipt + one inbox record), the
  // same thing the Monday scheduler does, so it can be triggered on demand.
  router.get('/train/program-audit', async (req, res, next) => {
    try {
      const { auditProgram, readAuditLog } = await import('../lib/coachProgramAudit.js');
      const [audit, history] = await Promise.all([auditProgram(vaultPath), readAuditLog()]);
      res.json({ ...audit, history: history.map(({ weekOf, at, summary }) => ({ weekOf, at, summary })) });
    } catch (err) { next(err); }
  });
  router.post('/train/program-audit/run', async (req, res, next) => {
    try {
      const { runWeeklyAudit } = await import('../lib/coachProgramAudit.js');
      const { audit, record } = await runWeeklyAudit(vaultPath);
      res.json({ summary: audit.summary, weekOf: audit.weekOf, checks: audit.checks, recordId: record?.id || null });
    } catch (err) { next(err); }
  });

  router.get('/workouts/exercises', async (req, res, next) => {
    try {
      res.json(await loadExerciseLibrary(vaultPath));
    } catch (err) {
      next(err);
    }
  });

  router.post('/workouts/exercises', async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const muscleGroup = req.body?.muscleGroup;
      const trackingType = req.body?.trackingType;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!MUSCLE_GROUPS.includes(muscleGroup)) return res.status(400).json({ error: 'muscleGroup must be one of ' + MUSCLE_GROUPS.join(', ') });
      if (trackingType && !TRACKING_TYPES.includes(trackingType)) return res.status(400).json({ error: 'trackingType must be one of ' + TRACKING_TYPES.join(', ') });
      const exercise = await addCustomExercise(vaultPath, name, muscleGroup, trackingType);
      res.json({ exercise });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // knowledge base: cues + one curated resource per exercise
  router.patch('/workouts/exercises/:id', async (req, res) => {
    try {
      const { setExerciseKnowledge } = await import('../lib/exercises.js');
      res.json({ exercise: await setExerciseKnowledge(vaultPath, req.params.id, { cues: req.body?.cues, resourceUrl: req.body?.resourceUrl }) });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.get('/workouts/routines', async (req, res, next) => {
    try {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const [{ routines, schedule, weekdays }, exerciseState, completedCounts] = await Promise.all([
        loadRoutines(vaultPath, exercises),
        loadExerciseState(vaultPath),
        completedCountByRoutine(vaultPath),
      ]);
      // Coach: earned progression suggestions, keyed `${routineId}:${exerciseId}`
      const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
      // his standing tunes ride along so the session view can show a FOCUS
      // prescription ("3s eccentric") next to the exercise it belongs to
      const { getTunes } = await import('../lib/progressionTunes.js');
      const tunes = await getTunes(vaultPath).catch(() => []);
      // COACH highlights — entries Coach put here (his ask: a change Coach
      // made must be visible in the plan, so he never has to remember it)
      const { readMarkers } = await import('../lib/coachPlan.js');
      const markers = await readMarkers().catch(() => ({}));
      const annotated = annotateRoutines(routines, exerciseState, completedCounts, tunes).map((r) => ({
        ...r,
        exercises: r.exercises.map((e) => {
          const mk = markers[`${r.id}:${e.exerciseId}`];
          // `coach` is taken by progression annotations (annotateRoutines) —
          // this is a different fact: Coach PUT this exercise here
          return mk ? { ...e, coachAdded: { at: mk.at, why: mk.why || null, startWeightKg: mk.startWeightKg || null } } : e;
        }),
      }));
      res.json({ routines: annotated, schedule, weekdays, progressions });
    } catch (err) {
      next(err);
    }
  });

  // COACH CHANGES THE PLAN. No note: the structured fix applies
  // deterministically, right now. With a note: the Coach model reads the
  // proposal + his words and answers in ops (a job; poll the GET below).
  // Either way the change files on the record with full undo.
  router.post('/workouts/coach-apply', async (req, res) => {
    try {
      const { recordId, note } = req.body || {};
      let fix = req.body?.fix || null;
      let proposal = String(req.body?.proposal || '');
      if (recordId) {
        const { listRecords } = await import('../lib/inboxStore.js');
        const record = (await listRecords()).find((r) => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'that proposal is no longer in the inbox' });
        if (record.status !== 'pending') return res.status(400).json({ error: 'that proposal was already answered' });
        fix = fix || record.fix || null;
        proposal = proposal || String(record.text || '').replace(/^Coach:\s*/, '');
      }
      const trimmedNote = String(note || '').trim();
      if (trimmedNote) {
        const { startCoachAmend } = await import('../lib/coachPlan.js');
        const jobId = startCoachAmend(vaultPath, { proposal, note: trimmedNote, fix, recordId: recordId || null });
        return res.json({ jobId });
      }
      const { opsFromFix, applyOps } = await import('../lib/coachPlan.js');
      const ops = opsFromFix(fix);
      if (!ops) return res.status(400).json({ error: 'this proposal has no one-tap change — add a note telling Coach what to do, or discuss it' });
      const { summary, undo } = await applyOps(vaultPath, ops, { why: proposal.slice(0, 90) || 'Coach change' });
      if (recordId) {
        const { updateRecord } = await import('../lib/inboxStore.js');
        await updateRecord(recordId, { status: 'filed', destination: 'workout plan', filedAt: new Date().toISOString(), auto: false, error: null, undoData: undo, applySummary: summary });
      }
      res.json({ applied: true, summary });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/workouts/coach-apply/:jobId', async (req, res) => {
    const { getAmendJob } = await import('../lib/coachPlan.js');
    const job = getAmendJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  router.post('/workouts/routines', async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'name is required' });
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const routine = await createRoutine(vaultPath, exercises, name, req.body.exercises || []);
      res.json({ routine });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/workouts/routines/:id', async (req, res, next) => {
    try {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const routine = await updateRoutine(vaultPath, exercises, req.params.id, { name: req.body?.name, exercises: req.body?.exercises });
      const [exerciseState, completedCounts] = await Promise.all([loadExerciseState(vaultPath), completedCountByRoutine(vaultPath)]);
      res.json({ routine: annotateRoutines([routine], exerciseState, completedCounts)[0] });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/workouts/routines/:id', async (req, res, next) => {
    try {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      await deleteRoutine(vaultPath, exercises, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/workouts/schedule', async (req, res, next) => {
    try {
      const { day, routineId } = req.body || {};
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const schedule = await setScheduleDay(vaultPath, exercises, day, routineId || null);
      res.json({ schedule, weekdays: WEEKDAYS });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/workouts/sessions', async (req, res, next) => {
    try {
      const { routineId, exerciseId, limit } = req.query;
      const sessions = await loadSessions(vaultPath, { routineId, exerciseId, limit: limit ? Number(limit) : undefined });
      // the Coach's reaction to each session, where the session was logged
      let said = {};
      try { said = await (await import('../lib/debriefMemory.js')).debriefsForSessions(sessions.map((s) => s.id)); } catch { /* none */ }
      res.json({ sessions: sessions.map((s) => (said[s.id] ? { ...s, coachSaid: said[s.id].text } : s)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/workouts/sessions', async (req, res, next) => {
    try {
      const session = await completeSession(vaultPath, req.body);
      // D2 — the reward moment: PRs computed HERE, synchronously, so the
      // save response carries them and the client can celebrate on the spot
      // (Telegram still pings separately via celebratePRs).
      let prs = [];
      try {
        const { prsInSession } = await import('../lib/trainingAnalytics.js');
        const all = await loadSessions(vaultPath, { limit: 60 });
        const full = all.find((s2) => s2.date === session.date && s2.routineId === session.routineId) || session;
        prs = prsInSession(all, full).slice(0, 3);
      } catch { /* a missing celebration is a non-event */ }
      // A REPLAY (the offline outbox re-POSTing a save whose response was
      // lost) must not re-fire anything outbound — the debrief and the PR
      // ping already went out when the session was first committed, and a
      // second buzz for a workout he finished once is exactly the kind of
      // thing that teaches him to ignore Nova. The PRs above are recomputed
      // and returned regardless: reading them changes nothing, and if the
      // first response never arrived he has not yet had his moment.
      if (!session.replayed) {
        // Coach's receipt rides the rails — never blocks the save
        draftSessionSummary(vaultPath, session).catch(() => {});
        // a PR detected on save is celebrated the moment it exists — the
        // cadence engine's only event-driven (non-clock) message
        import('../lib/coachCadence.js').then(({ celebratePRs }) => celebratePRs(vaultPath, session)).catch(() => {});
        // the coach at the rack: one unprompted reaction to THIS session,
        // composed from computed facts, delivered via Telegram (item 3)
        import('../lib/coachCadence.js').then(({ sessionDebrief }) => sessionDebrief(vaultPath, session)).catch(() => {});
      }
      res.json({ session, prs });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // In-progress session draft — the server-side copy of unsaved workout
  // progress. PUT on every edit (debounced client-side), GET on boot when the
  // device copy is missing, DELETE when the session finishes/discards.
  router.put('/workouts/session-draft', async (req, res) => {
    try {
      const { saveSessionDraft } = await import('../lib/sessionDraft.js');
      res.json(await saveSessionDraft(req.body || {}));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.get('/workouts/session-draft', async (req, res, next) => {
    try {
      const { getSessionDraft } = await import('../lib/sessionDraft.js');
      res.json({ draft: await getSessionDraft() });
    } catch (err) {
      next(err);
    }
  });
  // a discarded workout stays recoverable for 7 days — discard is the one
  // write that used to have no undo, and it cost a live session (19 Aug)
  router.get('/workouts/session-draft/discarded', async (req, res, next) => {
    try {
      const { getDiscardedDraft } = await import('../lib/sessionDraft.js');
      // the saved sessions let a legacy tombstone be recognised as a finish
      const sessions = await loadSessions(vaultPath, { limit: 12 }).catch(() => []);
      res.json({ draft: await getDiscardedDraft({ sessions }) });
    } catch (err) { next(err); }
  });
  router.post('/workouts/session-draft/restore', async (req, res) => {
    try {
      const { restoreDiscardedDraft } = await import('../lib/sessionDraft.js');
      res.json({ draft: await restoreDiscardedDraft() });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.delete('/workouts/session-draft', async (req, res, next) => {
    try {
      const { clearSessionDraft } = await import('../lib/sessionDraft.js');
      res.json(await clearSessionDraft({ reason: req.query.reason }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/workouts/carryovers', async (req, res, next) => {
    try {
      res.json({ carryovers: await listCarryovers() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/workouts/carryovers', async (req, res) => {
    try {
      res.json({ carryover: await addCarryover(req.body || {}) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/workouts/carryovers/:id/reschedule', async (req, res) => {
    try {
      res.json({ carryover: await rescheduleCarryover(req.params.id, req.body?.forDate) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete('/workouts/carryovers/:id', async (req, res) => {
    try {
      res.json(await removeCarryover(req.params.id));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/workouts/goals', async (req, res, next) => {
    try {
      res.json({ goals: await getFitnessGoals(vaultPath) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/workouts/goals', async (req, res) => {
    try {
      res.json({ goals: await setFitnessGoals(vaultPath, req.body || {}) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Ask Coach — assembles the live picture (goals, recent sessions,
  // progressions, recovery) and hands it to the read-only coach session.
  // The Injury Log — the page a coach checks before every prescription
  router.get('/workouts/injuries', async (req, res, next) => {
    try {
      const { listInjuries } = await import('../lib/injuryLog.js');
      res.json({ injuries: await listInjuries(vaultPath) });
    } catch (err) { next(err); }
  });
  router.post('/workouts/injuries', async (req, res) => {
    try {
      const { addInjury } = await import('../lib/injuryLog.js');
      res.json({ injury: await addInjury(vaultPath, req.body || {}) });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.post('/workouts/injuries/:id/resolve', async (req, res) => {
    try {
      const { resolveInjury } = await import('../lib/injuryLog.js');
      await resolveInjury(vaultPath, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  router.delete('/workouts/injuries/:id', async (req, res) => {
    try {
      const { removeInjury } = await import('../lib/injuryLog.js');
      await removeInjury(vaultPath, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.post('/workouts/coach', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      // the whole assembly lives in lib/coachTurn.js so the front door can
      // hand a question to the Coach in the same conversation
      const { startCoachTurn } = await import('../lib/coachTurn.js');
      let q = question;
      if (typeof req.body?.attachmentId === 'string' && req.body.attachmentId) {
        const { loadAttachment, attachmentPreamble } = await import('../lib/attachments.js');
        const att = await loadAttachment(req.body.attachmentId);
        if (!att) return res.status(400).json({ error: 'those attachments are gone — attach them again' });
        q = `${attachmentPreamble(att)}\n\n${question}`;
      }
      res.json({ jobId: await startCoachTurn(vaultPath, { question: q, sessionId, liveSession: req.body?.liveSession }) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Impromptu session: the Coach designs a time-boxed one-off for days
  // outside the program. Two steps: plan (claude job) → prepare (map onto
  // the library, session-editor-ready).
  router.post('/workouts/quick-session', async (req, res) => {
    try {
      const minutes = Math.min(180, Math.max(10, Number(req.body?.minutes) || 45));
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';

      // a section that fails is NAMED to the model; one that is empty says
      // nothing — these were six optional catches that swallowed both alike
      const { gatherContext } = await import('../lib/contextSections.js');
      const { text: context } = await gatherContext([
        { label: 'profile', load: () => profileContext(vaultPath) }, // who he is, first
        { label: 'goals', load: () => goalsContext(vaultPath) },
        { label: 'the program (library, week, progressions)', load: async () => {
          const out = [];
          const { exercises } = await loadExerciseLibrary(vaultPath);
          // muscle groups ride the names — the deterministic fact the don't-hammer rule needs
          out.push(`Exercise library (use these exact names where possible; muscle group in brackets): ${exercises.map((e) => `${e.name}${e.muscleGroup ? ` (${e.muscleGroup})` : ''}`).join('; ')}`);
          const { routines, schedule } = await loadRoutines(vaultPath, exercises);
          const dayKey = (d) => WEEKDAYS[(d.getDay() + 6) % 7];
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
          // active-rest is a schedule value, not a routine — name it honestly
          const dayName = (d) => { const v = schedule?.[dayKey(d)]; return v === 'active-rest' ? 'active rest' : (routines.find((r) => r.id === v)?.name || 'rest'); };
          out.push(`Week context — yesterday: ${dayName(yesterday)}, today's program: ${dayName(new Date())}, tomorrow: ${dayName(tomorrow)}.`);
          const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
          const keys = Object.keys(progressions);
          if (keys.length) out.push(`Earned progressions (prefill these when the exercise appears): ${keys.map((k) => `${k} +${progressions[k].delta}${progressions[k].kind === 'weight' ? 'kg' : ' rep'}`).join(', ')}.`);
          return out.join('\n\n');
        } },
        { label: 'carry-overs', load: async () => {
          // the gap the program leaves is RECORDED — a quick session should
          // reach for the carried-over work first, not guess at it
          const co = await carryoverContext();
          return co ? co + ' Consider building the session around clearing what is due or overdue.' : null;
        } },
        { label: 'recent sessions', load: async () => {
          const sessions = await loadSessions(vaultPath, { limit: 3 });
          const { exercises: lib } = await loadExerciseLibrary(vaultPath);
          const group = (e) => e.muscleGroup || lib.find((x) => x.id === e.exerciseId || x.name === e.name)?.muscleGroup || null;
          return sessions.length ? 'Recent sessions (what was hit, by muscle group):\n' + sessions.map((s) => `- ${s.date} ${s.routineName}: ${s.exercises.map((e) => `${e.name}${group(e) ? ` (${group(e)})` : ''}`).join(', ')}`).join('\n') : null;
        } },
        { label: 'recovery', load: async () => {
          const days = await loadRecentDays(7);
          const latest = [...days].reverse().find((d) => d.hrv != null || d.sleepAsleepMinutes != null);
          // the verdict the prompt is told to honour, not just the raw numbers
          const { computeDeloadSignal } = await import('../lib/coach.js');
          const signal = computeDeloadSignal(days);
          const bits = [];
          if (latest) bits.push(`Latest recovery: HRV ${latest.hrv ?? '—'}, sleep ${latest.sleepAsleepMinutes ? Math.round(latest.sleepAsleepMinutes / 60 * 10) / 10 + 'h' : '—'} (${latest.date}).`);
          bits.push(`Deload signal: ${signal.advise ? `YES — ${signal.reason}. Design LIGHT: fewer hard sets, stop 2-3 reps short.` : `no — ${signal.reason}.`}`);
          return bits.join(' ');
        } },
        // a designer checks the injury log before prescribing — the page a
        // real coach checks first (twin: the Coach chat's injuriesContext)
        { label: 'injuries', load: async () => (await import('../lib/injuryLog.js')).injuriesContext(vaultPath) },
        // a deload week or a block phase changes what a good session is
        { label: 'training block', load: async () => (await import('../lib/trainingBlocks.js')).blockContext(vaultPath) },
      ]);

      res.json({ jobId: startQuickSession(vaultPath, { minutes, note, context }) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/workouts/quick-session/prepare', async (req, res) => {
    try {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const state = await loadExerciseState(vaultPath);
      res.json({ session: normalizeQuickPlan(req.body?.plan, exercises, state) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put('/workouts/sessions/:id', async (req, res) => {
    try {
      res.json({ session: await updateSession(vaultPath, req.params.id, req.body || {}) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/workouts/sessions/:id', async (req, res) => {
    try {
      res.json(await deleteSession(vaultPath, req.params.id));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

import { Router } from 'express';
import { loadExerciseLibrary, addCustomExercise, MUSCLE_GROUPS, TRACKING_TYPES } from '../lib/exercises.js';
import { loadRoutines, createRoutine, updateRoutine, deleteRoutine, setScheduleDay, WEEKDAYS } from '../lib/workouts.js';
import { loadExerciseState } from '../lib/exerciseState.js';
import { loadSessions, completeSession, updateSession, deleteSession, completedCountByRoutine } from '../lib/workoutSessions.js';
import { computeProgressions, draftSessionSummary, normalizeQuickPlan } from '../lib/coach.js';
import { startQuickSession } from '../lib/claudeCode.js';
import { getFitnessGoals, setFitnessGoals, goalsContext } from '../lib/fitnessGoals.js';
import { profileContext } from '../lib/profile.js';
import { startAskCoach } from '../lib/claudeCode.js';
import { loadRecentDays } from '../lib/healthData.js';

function annotateRoutines(routines, exerciseState, completedCounts) {
  return routines.map((r) => ({
    ...r,
    completedCount: completedCounts[r.id] || 0,
    exercises: r.exercises.map((e) => {
      const state = exerciseState[e.exerciseId];
      return { ...e, lastSets: state ? state.lastSets : [], lastDate: state ? state.lastDate : null };
    }),
  }));
}

export function workoutsRouter(vaultPath) {
  const router = Router();

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
      res.json({ routines: annotateRoutines(routines, exerciseState, completedCounts), schedule, weekdays, progressions });
    } catch (err) {
      next(err);
    }
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
      res.json({ sessions });
    } catch (err) {
      next(err);
    }
  });

  router.post('/workouts/sessions', async (req, res, next) => {
    try {
      const session = await completeSession(vaultPath, req.body);
      // Coach's receipt rides the rails — never blocks the save
      draftSessionSummary(vaultPath, session).catch(() => {});
      res.json({ session });
    } catch (err) {
      res.status(400).json({ error: err.message });
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
  router.post('/workouts/coach', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) return res.status(400).json({ error: 'question is required' });
      const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
      if (sessionId) {
        // resumed conversation — the session already carries the picture
        return res.json({ jobId: startAskCoach(vaultPath, { question, sessionId }) });
      }

      const parts = [];
      try {
        parts.push(await profileContext(vaultPath)); // who he is, first
      } catch { /* optional */ }
      try {
        parts.push(await goalsContext(vaultPath));
      } catch { /* section optional */ }
      try {
        const sessions = await loadSessions(vaultPath, { limit: 6 });
        parts.push(sessions.length
          ? 'Recent sessions:\n' + sessions.map((s) => `- ${s.date} ${s.routineName}: ${s.exercises.map((e) => `${e.name} ${e.sets.map((x) => `${x.weight}x${x.reps}`).join(',')}`).join(' | ')}`).join('\n')
          : 'No sessions logged yet.');
      } catch { /* optional */ }
      try {
        const { exercises } = await loadExerciseLibrary(vaultPath);
        const { routines, schedule } = await loadRoutines(vaultPath, exercises);
        const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
        const keys = Object.keys(progressions);
        parts.push(`Routines: ${routines.map((r) => r.name).join(', ') || 'none'}. Schedule: ${JSON.stringify(schedule)}.`);
        if (keys.length) parts.push(`Earned progressions: ${keys.map((k) => `${k} +${progressions[k].delta}${progressions[k].kind === 'weight' ? 'kg' : ' rep'}`).join(', ')}.`);
      } catch { /* optional */ }
      try {
        const days = await loadRecentDays(7);
        const latest = [...days].reverse().find((d) => d.hrv != null || d.sleepAsleepMinutes != null);
        if (latest) parts.push(`Latest recovery: HRV ${latest.hrv ?? '—'} ms, sleep ${latest.sleepAsleepMinutes ? Math.round(latest.sleepAsleepMinutes / 60 * 10) / 10 + 'h' : '—'}, resting HR ${latest.restingHeartRate ?? '—'}.`);
        const { computeDeloadSignal } = await import('../lib/coach.js');
        const signal = computeDeloadSignal(days);
        parts.push(`Deload signal: ${signal.advise ? `YES — ${signal.reason}` : signal.reason}.`);
      } catch { /* optional */ }

      res.json({ jobId: startAskCoach(vaultPath, { question, context: parts.join('\n\n') }) });
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

      const parts = [];
      try {
        parts.push(await profileContext(vaultPath)); // who he is, first
      } catch { /* optional */ }
      try {
        parts.push(await goalsContext(vaultPath));
      } catch { /* optional */ }
      try {
        const { exercises } = await loadExerciseLibrary(vaultPath);
        parts.push(`Exercise library (use these exact names where possible): ${exercises.map((e) => e.name).join('; ')}`);
        const { routines, schedule } = await loadRoutines(vaultPath, exercises);
        const dayKey = (d) => WEEKDAYS[(d.getDay() + 6) % 7];
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const nameOf = (id) => routines.find((r) => r.id === id)?.name || 'rest';
        parts.push(`Week context — yesterday: ${nameOf(schedule?.[dayKey(yesterday)])}, today's program: ${nameOf(schedule?.[dayKey(new Date())])}, tomorrow: ${nameOf(schedule?.[dayKey(tomorrow)])}.`);
      } catch { /* optional */ }
      try {
        const sessions = await loadSessions(vaultPath, { limit: 3 });
        if (sessions.length) parts.push('Recent sessions:\n' + sessions.map((s) => `- ${s.date} ${s.routineName}: ${s.exercises.map((e) => e.name).join(', ')}`).join('\n'));
      } catch { /* optional */ }
      try {
        const days = await loadRecentDays(7);
        const latest = [...days].reverse().find((d) => d.hrv != null || d.sleepAsleepMinutes != null);
        if (latest) parts.push(`Latest recovery: HRV ${latest.hrv ?? '—'}, sleep ${latest.sleepAsleepMinutes ? Math.round(latest.sleepAsleepMinutes / 60 * 10) / 10 + 'h' : '—'} (${latest.date}).`);
      } catch { /* optional */ }

      res.json({ jobId: startQuickSession(vaultPath, { minutes, note, context: parts.join('\n\n') }) });
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

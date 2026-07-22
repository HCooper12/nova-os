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
import { loadRecentDays, weightTrendLine } from '../lib/healthData.js';
import { listCarryovers, addCarryover, rescheduleCarryover, removeCarryover, carryoverContext } from '../lib/workoutCarryover.js';
import { loadRecentDays as loadRecentNutritionDays } from '../lib/nutritionLog.js';
import { computeStreaks } from '../lib/streaks.js';
import { preferencesContext } from '../lib/learning.js';

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
      // the connections the sweep found missing — a coach that claims protein
      // expertise gets nutrition, bodyweight, debt, streaks, and learned habits
      try {
        const co = await carryoverContext();
        if (co) parts.push(co);
      } catch { /* optional */ }
      try {
        const nutrition = await loadRecentNutritionDays(7);
        if (nutrition.length) {
          const met = nutrition.filter((d) => d.floorMet === true).length;
          const tracked = nutrition.filter((d) => d.floorMet != null).length;
          const avgP = Math.round(nutrition.reduce((s, d) => s + (d.p || 0), 0) / nutrition.length);
          const last = nutrition[nutrition.length - 1];
          parts.push(`Nutrition (last ${nutrition.length} tracked days): protein floor met ${met}/${tracked}; avg ${avgP}g protein/day; latest ${last.date}: ${Math.round(last.p)}g P, ${Math.round(last.kcal)} kcal.`);
        } else {
          parts.push('Nutrition: no tracked days yet.');
        }
      } catch { /* optional */ }
      try {
        parts.push(weightTrendLine(await loadRecentDays(28)));
      } catch { /* optional */ }
      try {
        const s = await computeStreaks(vaultPath);
        const bits = [];
        if (s.workoutStreak >= 2) bits.push(`${s.workoutStreak}-week training streak`);
        if (s.lastWorkoutDate) bits.push(`last logged session ${s.lastWorkoutDate}`);
        if (bits.length) parts.push(`Streaks: ${bits.join('; ')}.`);
      } catch { /* optional */ }
      try {
        const prefs = await preferencesContext(vaultPath);
        if (prefs) parts.push(prefs);
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
        // active-rest is a schedule value, not a routine — name it honestly
        const dayName = (d) => { const v = schedule?.[dayKey(d)]; return v === 'active-rest' ? 'active rest' : (routines.find((r) => r.id === v)?.name || 'rest'); };
        parts.push(`Week context — yesterday: ${dayName(yesterday)}, today's program: ${dayName(new Date())}, tomorrow: ${dayName(tomorrow)}.`);
        const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
        const keys = Object.keys(progressions);
        if (keys.length) parts.push(`Earned progressions (prefill these when the exercise appears): ${keys.map((k) => `${k} +${progressions[k].delta}${progressions[k].kind === 'weight' ? 'kg' : ' rep'}`).join(', ')}.`);
      } catch { /* optional */ }
      try {
        // the gap the program leaves is RECORDED — a quick session should
        // reach for the carried-over work first, not guess at it
        const co = await carryoverContext();
        if (co) parts.push(co + ' Consider building the session around clearing what is due or overdue.');
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

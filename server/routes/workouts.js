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
  router.post('/train/fuel-cross/raise', async (req, res, next) => {
    try {
      const { raiseFuelFindings } = await import('../lib/coachCadence.js');
      res.json({ raised: await raiseFuelFindings(vaultPath) });
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
      res.json({ routines: annotateRoutines(routines, exerciseState, completedCounts, tunes), schedule, weekdays, progressions });
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
      // a PR detected on save is celebrated the moment it exists — the
      // cadence engine's only event-driven (non-clock) message
      import('../lib/coachCadence.js').then(({ celebratePRs }) => celebratePRs(vaultPath, session)).catch(() => {});
      // the coach at the rack: one unprompted reaction to THIS session,
      // composed from computed facts, delivered via Telegram (item 3)
      import('../lib/coachCadence.js').then(({ sessionDebrief }) => sessionDebrief(vaultPath, session)).catch(() => {});
      res.json({ session });
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
  router.delete('/workouts/session-draft', async (req, res, next) => {
    try {
      const { clearSessionDraft } = await import('../lib/sessionDraft.js');
      res.json(await clearSessionDraft());
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
      // Mid-workout asks carry the live session — the Coach must see what's
      // logged RIGHT NOW, whether the conversation is new or resumed.
      const { liveSessionContext, coachLiveLine } = await import('../lib/coach.js');
      const live = liveSessionContext(req.body?.liveSession);
      if (sessionId) {
        // Resumed conversation: the session carries the deep picture, but the
        // VOLATILE picture is recomputed every turn — a chat resumed after a
        // week was answering from week-old recovery numbers under a prompt
        // that says to trust them (the spoken lane's bug, same fix).
        const fresh = await coachLiveLine(vaultPath).catch(() => '');
        const preamble = [fresh, live ? `[${live}]` : ''].filter(Boolean).join('\n');
        const q = preamble ? `${preamble}\n\n${question}` : question;
        return res.json({ jobId: startAskCoach(vaultPath, { question: q, sessionId }) });
      }

      const parts = [];
      const failures = []; // a vanished section must be NAMED, never silent
      if (live) parts.push(live);
      try {
        parts.push(await profileContext(vaultPath)); // who he is, first
      } catch { failures.push('profile'); }
      try {
        parts.push(await goalsContext(vaultPath));
      } catch { failures.push('goals'); }
      try {
        // his Coaching Principles + What Works For Hayden pages — the
        // knowledge base that makes this HIS coach, not a textbook
        const { knowledgeContext } = await import('../lib/coachKnowledge.js');
        parts.push(await knowledgeContext(vaultPath));
      } catch { failures.push('coaching knowledge'); }
      try {
        const { blockContext } = await import('../lib/trainingBlocks.js');
        parts.push(await blockContext(vaultPath));
      } catch { failures.push('training block'); }
      try {
        const { adviceContext } = await import('../lib/coach.js');
        const adv = await adviceContext();
        if (adv) parts.push(adv);
      } catch { failures.push('advice outcomes'); }
      try {
        const { injuriesContext } = await import('../lib/injuryLog.js');
        const inj = await injuriesContext(vaultPath);
        if (inj) parts.push(inj);
      } catch { failures.push('injury log'); }
      try {
        // the full analytics picture: PRs, plateaus, RPE drift, weekly
        // muscle volume, program audit — computed fresh, one implementation
        const { analyticsContext } = await import('../lib/trainingAnalytics.js');
        const a = await analyticsContext(vaultPath);
        if (a) parts.push(a);
      } catch { failures.push('training analytics'); }
      try {
        // the prompt demands EXACT exercise names — give it the library to
        // name from (it previously saw only routine names)
        const { exercises } = await loadExerciseLibrary(vaultPath);
        parts.push(`EXERCISE LIBRARY (the only valid names for swaps/adds): ${exercises.map((e) => e.name).join(', ')}`);
      } catch { failures.push('exercise library'); }
      try {
        const sessions = await loadSessions(vaultPath, { limit: 6 });
        parts.push(sessions.length
          ? 'Recent sessions:\n' + sessions.map((s) => `- ${s.date} ${s.routineName}: ${s.exercises.map((e) => `${e.name} ${e.sets.map((x) => `${x.weight}x${x.reps}${x.rpe ? '@' + x.rpe : ''}`).join(',')}`).join(' | ')}`).join('\n')
          : 'No sessions logged yet.');
        const { estimateE1RMs } = await import('../lib/coach.js');
        const e1rms = estimateE1RMs(await loadSessions(vaultPath, { limit: 12 }));
        if (e1rms.length) parts.push('Estimated 1RMs (Epley, from logged sets — direction matters more than the number): ' + e1rms.slice(0, 8).map((x) => `${x.name} ${x.e1rm}kg${x.delta != null ? ` (${x.delta >= 0 ? '+' : ''}${x.delta})` : ''}`).join('; ') + '.');
      } catch { failures.push('recent sessions'); }
      try {
        const { exercises } = await loadExerciseLibrary(vaultPath);
        const { routines, schedule } = await loadRoutines(vaultPath, exercises);
        const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
        const keys = Object.keys(progressions);
        parts.push(`Routines: ${routines.map((r) => r.name).join(', ') || 'none'}. Schedule: ${JSON.stringify(schedule)}.`);
        const stepKeys = keys.filter((k) => progressions[k].kind !== 'outgrown');
        const outgrownKeys = keys.filter((k) => progressions[k].kind === 'outgrown');
        if (stepKeys.length) parts.push(`Earned progressions: ${stepKeys.map((k) => `${k} +${progressions[k].delta}${progressions[k].kind === 'weight' ? 'kg' : ' rep'}`).join(', ')}.`);
        if (outgrownKeys.length) parts.push(`PRESCRIPTION CHANGES DUE (deterministic — the engine has STOPPED suggesting more reps here): ${outgrownKeys.map((k) => `${k}: ${progressions[k].evidence}`).join(' | ')}. RAISE THIS UNPROMPTED at the start of your next reply if you haven't already discussed it with him: present the reasoning briefly and PROPOSE the concrete fix — a routine-edit swap to a weighted/harder variation from his exercise library, or new targets. He asked for exactly this: a coach that reflects and brings the alternative, not one that adds reps forever.`);
      } catch { failures.push('e1RM estimates'); }
      try {
        const days = await loadRecentDays(7);
        // the SERIES, not one day — a coach reading a single snapshot can't
        // see a trend, and autoregulation is trend-reading
        const series = days.filter((d) => d.hrv != null || d.sleepAsleepMinutes != null || d.restingHeartRate != null)
          .map((d) => `${d.date.slice(5)}: ${[d.hrv != null ? `HRV ${Math.round(d.hrv)}` : null, d.sleepAsleepMinutes != null ? `sleep ${(d.sleepAsleepMinutes / 60).toFixed(1)}h` : null, d.restingHeartRate != null ? `RHR ${d.restingHeartRate}` : null, d.steps != null ? `${d.steps} steps` : null].filter(Boolean).join(', ')}`);
        if (series.length) parts.push(`Recovery, last 7 days (oldest first):\n${series.join('\n')}`);
        const { computeDeloadSignal } = await import('../lib/coach.js');
        const signal = computeDeloadSignal(days);
        parts.push(`Deload signal: ${signal.advise ? `YES — ${signal.reason}. When this is YES and today holds a session, OPEN with the adjustment (concrete: −% load or capped RIR), don't wait to be asked` : signal.reason}.`);
      } catch { failures.push('recovery/deload'); }
      // the connections the sweep found missing — a coach that claims protein
      // expertise gets nutrition, bodyweight, debt, streaks, and learned habits
      try {
        const co = await carryoverContext();
        if (co) parts.push(co);
      } catch { failures.push('carryovers'); }
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
      } catch { failures.push('nutrition'); }
      try {
        // fuel × training joins — the cross-reference agent's findings
        const { crossCheck, crossContext } = await import('../lib/fuelCross.js');
        const xc = crossContext(await crossCheck(vaultPath));
        if (xc) parts.push(xc);
      } catch { failures.push('fuel cross-check'); }
      try {
        parts.push(weightTrendLine(await loadRecentDays(28)));
      } catch { failures.push('weight trend'); }
      try {
        const s = await computeStreaks(vaultPath);
        const bits = [];
        if (s.workoutStreak >= 2) bits.push(`${s.workoutStreak}-week training streak`);
        if (s.lastWorkoutDate) bits.push(`last logged session ${s.lastWorkoutDate}`);
        if (bits.length) parts.push(`Streaks: ${bits.join('; ')}.`);
      } catch { failures.push('streaks'); }
      // work that keeps not happening — the Coach asks why before proposing
      try {
        const { detectSkippedExercises, skippedContext } = await import('../lib/coach.js');
        const { exercises: lib } = await loadExerciseLibrary(vaultPath);
        const { routines } = await loadRoutines(vaultPath, lib);
        const sessions = await loadSessions(vaultPath, { limit: 30 });
        const list = detectSkippedExercises(routines, sessions);
        // cross-conversation memory: the Coach used to re-raise the same
        // skipped exercise in every NEW chat with no idea it already asked.
        // The top unraised one is recorded as raised (7-day cooldown).
        const { readFile: rf, writeFile: wf } = await import('node:fs/promises');
        const pathMod = await import('node:path');
        const { fileURLToPath } = await import('node:url'); // never URL.pathname — repo path has a space
        const raisedPath = pathMod.join(process.env.NOVA_DATA_DIR || pathMod.join(pathMod.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'coach-raised.json');
        let raised = {};
        try { raised = JSON.parse(await rf(raisedPath, 'utf8')); } catch { /* first run */ }
        const cutoff = Date.now() - 7 * 86400000;
        const fresh = list.filter((x) => !(raised[x.exerciseId] && new Date(raised[x.exerciseId]).getTime() > cutoff));
        const stale = list.filter((x) => !fresh.includes(x));
        const skipped = skippedContext(fresh);
        if (skipped) {
          parts.push(skipped + (stale.length ? `
(Already raised recently — do NOT re-raise unless he brings them up: ${stale.map((x) => x.name).join(', ')}.)` : ''));
          raised[fresh[0].exerciseId] = new Date().toISOString();
          wf(raisedPath, JSON.stringify(raised, null, 2)).catch(() => {});
        } else if (stale.length) {
          parts.push(`Repeatedly-skipped work was raised with him recently (${stale.map((x) => x.name).join(', ')}) — don't re-raise unless he brings it up.`);
        }
      } catch { failures.push('skipped-work memory'); }
      try {
        const { tunesContext } = await import('../lib/progressionTunes.js');
        const tunes = await tunesContext(vaultPath);
        if (tunes) parts.push(tunes);
      } catch { failures.push('progression tunes'); }
      try {
        const prefs = await preferencesContext(vaultPath);
        if (prefs) parts.push(prefs);
      } catch { failures.push('preferences'); }
      try {
        const { standingContext } = await import('../lib/standing.js');
        const standing = await standingContext(vaultPath);
        if (standing) parts.push(standing);
      } catch { failures.push('standing instructions'); }
      try {
        const { skillsContext } = await import('../lib/skills.js');
        const skills = await skillsContext(vaultPath);
        if (skills) parts.push(skills);
      } catch { failures.push('skills'); }
      // the shared brain: the Coach knows what the rest of the fleet did
      // lately (receipts off the rails — dispatch, reviews, drafts waiting)
      try {
        const { fleetContext } = await import('../lib/fleetContext.js');
        const fleet = await fleetContext();
        if (fleet) parts.push(fleet);
      } catch { failures.push('fleet activity'); }

      if (failures.length) {
        // Silent context loss made the Coach blame his logging for a code
        // failure ("if history is thin, say what to log"). Name what's gone.
        parts.push(`NOTE — these context sections FAILED to load this turn (an error, NOT thin logging): ${failures.join(', ')}. If one matters to the question, say the data could not be loaded — never tell him to log more because of it.`);
      }
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

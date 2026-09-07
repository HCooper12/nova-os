// THE COACH'S TURN — one function, two mouths.
//
// The Coach used to be reachable only from its own screen: the context it
// reasons from was assembled inline in the /workouts/coach route. Phase 2
// of the Verbs plan (design/VERBS-PLAN.md, 6 Sep 2026) wants delegation
// invisible — "should I deload this week?" asked of Nova is answered BY THE
// COACH, in the same transcript, with the Coach's own proposal chip. So the
// assembly moved here untouched (every section, every honest 'failures'
// note), and both the Coach screen and the front door call it.

import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';
import { loadSessions } from './workoutSessions.js';
import { computeProgressions } from './coach.js';
import { goalsContext } from './fitnessGoals.js';
import { profileContext } from './profile.js';
import { startAskCoach } from './claudeCode.js';
import { loadRecentDays, weightTrendLine, sleepEfficiencyLine, vo2MaxLine } from './healthData.js';
import { carryoverContext } from './workoutCarryover.js';
import { loadRecentDays as loadRecentNutritionDays } from './nutritionLog.js';
import { computeStreaks } from './streaks.js';
import { preferencesContext } from './learning.js';

// Returns the job id of the Coach's answer. A resumed conversation gets the
// volatile picture as a live line; a new one gets the full assembly.
export async function startCoachTurn(vaultPath, { question, sessionId = null, liveSession = null } = {}) {
  const { liveSessionContext, coachLiveLine } = await import('./coach.js');
  const live = liveSessionContext(liveSession);
  if (sessionId) {
    const fresh = await coachLiveLine(vaultPath).catch(() => '');
    const preamble = [fresh, live ? `[${live}]` : ''].filter(Boolean).join('\n');
    const q = preamble ? `${preamble}\n\n${question}` : question;
    return startAskCoach(vaultPath, { question: q, sessionId });
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
        const { knowledgeContext } = await import('./coachKnowledge.js');
        parts.push(await knowledgeContext(vaultPath));
      } catch { failures.push('coaching knowledge'); }
      try {
        const { blockContext } = await import('./trainingBlocks.js');
        parts.push(await blockContext(vaultPath));
      } catch { failures.push('training block'); }
      try {
        const { adviceContext } = await import('./coach.js');
        const adv = await adviceContext();
        if (adv) parts.push(adv);
      } catch { failures.push('advice outcomes'); }
      try {
        const { injuriesContext } = await import('./injuryLog.js');
        const inj = await injuriesContext(vaultPath);
        if (inj) parts.push(inj);
      } catch { failures.push('injury log'); }
      try {
        // the full analytics picture: PRs, plateaus, RPE drift, weekly
        // muscle volume, program audit — computed fresh, one implementation
        const { analyticsContext } = await import('./trainingAnalytics.js');
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
        const { estimateE1RMs } = await import('./coach.js');
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
        // A QUALITY HOLD IS NOT A "+0 REP PROGRESSION". Entries come back as
        // kind 'weight'/'reps' (a real earned step) or kind 'quality' (delta 0
        // — the engine deliberately holding the load, usually because of HIS
        // OWN note about form). Both were being flattened into one "Earned
        // progressions: X +0 rep" line, which told Coach a hold was a
        // progression of zero and dropped the sentence that caused it.
        const stepEarned = stepKeys.filter((k) => progressions[k].kind !== 'quality');
        const qualityHeld = stepKeys.filter((k) => progressions[k].kind === 'quality');
        if (stepEarned.length) parts.push(`Earned progressions: ${stepEarned.map((k) => {
          const p = progressions[k];
          const note = p.note ? ` — his note${p.noteDate ? ` (${p.noteDate})` : ''}: "${String(p.note).slice(0, 160)}"` : '';
          return `${k} +${p.delta}${p.kind === 'weight' ? 'kg' : ' rep'}${note}`;
        }).join(', ')}.`);
        if (qualityHeld.length) parts.push(`HELD ON PURPOSE — load NOT increased, quality prescribed instead (raise these in his own language, never as a number): ${qualityHeld.map((k) => {
          const p = progressions[k];
          const note = p.note ? ` his note${p.noteDate ? ` (${p.noteDate})` : ''}: "${String(p.note).slice(0, 160)}" —` : '';
          return `${k}:${note} focus: ${p.focus || 'strict form'}`;
        }).join(' | ')}.`);
        if (outgrownKeys.length) parts.push(`PRESCRIPTION CHANGES DUE (deterministic — the engine has STOPPED suggesting more reps here): ${outgrownKeys.map((k) => `${k}: ${progressions[k].evidence}`).join(' | ')}. RAISE THIS UNPROMPTED at the start of your next reply if you haven't already discussed it with him: present the reasoning briefly and PROPOSE the concrete fix — a routine-edit swap to a weighted/harder variation from his exercise library, or new targets. He asked for exactly this: a coach that reflects and brings the alternative, not one that adds reps forever.`);
      } catch { failures.push('e1RM estimates'); }
      try {
        const days = await loadRecentDays(7);
        // the SERIES, not one day — a coach reading a single snapshot can't
        // see a trend, and autoregulation is trend-reading
        const series = days.filter((d) => d.hrv != null || d.sleepAsleepMinutes != null || d.restingHeartRate != null)
          .map((d) => `${d.date.slice(5)}: ${[d.hrv != null ? `HRV ${Math.round(d.hrv)}` : null, d.sleepAsleepMinutes != null ? `sleep ${(d.sleepAsleepMinutes / 60).toFixed(1)}h` : null, d.restingHeartRate != null ? `RHR ${d.restingHeartRate}` : null, d.steps != null ? `${d.steps} steps` : null].filter(Boolean).join(', ')}`);
        if (series.length) parts.push(`Recovery, last 7 days (oldest first):\n${series.join('\n')}`);
        const { computeDeloadSignal } = await import('./coach.js');
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
        // HIS FUEL SYSTEM, not just its aggregates (7 Sep 2026, his ask that
        // the Coach be as expert on nutrition and Fuel as on training): the
        // real rotation, what is ticked, what is cooked, and the 25 dishes he
        // actually owns — so advice can name one instead of inventing food.
        const { fuelContext } = await import('./fuelContext.js');
        parts.push(await fuelContext(vaultPath));
      } catch { failures.push('fuel system'); }
      try {
        // HIS SHELF — the podcasts and videos he uploaded on purpose, ranked
        // against what he is asking about. The lens says how to weigh them;
        // this says which exist and where to read them in full.
        const { shelfContext } = await import('./sourceShelf.js');
        const shelf = await shelfContext(vaultPath, { topics: `${question || ''} training nutrition recovery protein hypertrophy sleep`, limit: 5 });
        if (shelf) parts.push(shelf);
      } catch { failures.push('his shelf'); }
      try {
        // fuel × training joins — the cross-reference agent's findings
        const { crossCheck, crossContext } = await import('./fuelCross.js');
        const xc = crossContext(await crossCheck(vaultPath));
        if (xc) parts.push(xc);
      } catch { failures.push('fuel cross-check'); }
      try {
        // program changes he has been asked about and not answered — Coach
        // must be able to raise it in conversation, not only in the Inbox
        const { programReviewContext } = await import('./coachProgramReview.js');
        const pr = await programReviewContext();
        if (pr) parts.push(pr);
      } catch { failures.push('program review'); }
      try {
        // the watch's account of his week + the logged-vs-tracked join
        const { watchContext } = await import('./healthWorkouts.js');
        const wc = await watchContext(vaultPath);
        if (wc) parts.push(wc);
      } catch { failures.push('watch workouts'); }
      try {
        const days28 = await loadRecentDays(28);
        parts.push(weightTrendLine(days28));
        // both stored daily since the health push existed and read by NOTHING
        // until now — time-in-bed never became sleep quality, and his aerobic
        // ceiling never informed a single word of coaching
        try {
          // 45 days of item-level eating had ONE consumer (recipe ideas);
          // no agent could see that his day starts at 13:30 and 83% of his
          // protein lands after 3pm — which is the shape of his floor misses
          const { foodPatternsContext } = await import('./foodPatterns.js');
          parts.push(await foodPatternsContext({ days: 21 }));
        } catch { failures.push('eating patterns'); }
        const sleepEff = sleepEfficiencyLine(days28);
        if (sleepEff) parts.push(sleepEff);
        const vo2 = vo2MaxLine(days28);
        if (vo2) parts.push(vo2);
      } catch { failures.push('weight trend'); }
      try {
        const s = await computeStreaks(vaultPath);
        const bits = [];
        if (s.workoutStreak >= 2) bits.push(`${s.workoutStreak}-week training streak`);
        if (s.lastWorkoutDate) bits.push(`last logged session ${s.lastWorkoutDate}`);
        if (bits.length) parts.push(`Streaks: ${bits.join('; ')}.`);
      } catch { failures.push('streaks'); }
      // what the Coach said at the rack after his last session (debriefMemory)
      try {
        const { debriefMemoryContext } = await import('./debriefMemory.js');
        const last = (await loadSessions(vaultPath, { limit: 1 }))[0];
        const dm = last ? await debriefMemoryContext(last.routineId) : null;
        if (dm) parts.push(dm);
      } catch { failures.push('last debrief'); }
      // DAYS that keep not happening — the training check's "didn't happen"
      // consumer (trainingCheck.missMemory): schedule vs logged-or-reconciled
      try {
        const { missMemory, missMemoryContext } = await import('./trainingCheck.js');
        const { listRecords } = await import('./inboxStore.js');
        const { exercises: lib0 } = await loadExerciseLibrary(vaultPath);
        const { routines: rs, schedule } = await loadRoutines(vaultPath, lib0);
        const sess = await loadSessions(vaultPath, { limit: 60 });
        const items = missMemory({ schedule, sessionDates: new Set(sess.map((s) => s.date)), records: await listRecords() });
        const names = Object.fromEntries(rs.map((r) => [r.id, r.name]));
        const mm = missMemoryContext(items, names);
        if (mm) parts.push(mm);
      } catch { failures.push('missed training days'); }
      // work that keeps not happening — the Coach asks why before proposing
      let markRaised = null; // stamped when the answer lands (startAskCoach onReady), never here
      try {
        const { detectSkippedExercises, skippedContext } = await import('./coach.js');
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
          // the 7-day cooldown used to be written HERE, during context
          // assembly — before the model had answered — so a failed job
          // consumed the window and the exercise went a week unraised
          // without ever having been raised. Stamp it on the answer.
          const candidate = fresh[0].exerciseId;
          markRaised = async () => {
            let latest = {};
            try { latest = JSON.parse(await rf(raisedPath, 'utf8')); } catch { /* first run */ }
            latest[candidate] = new Date().toISOString();
            await wf(raisedPath, JSON.stringify(latest, null, 2));
          };
        } else if (stale.length) {
          parts.push(`Repeatedly-skipped work was raised with him recently (${stale.map((x) => x.name).join(', ')}) — don't re-raise unless he brings it up.`);
        }
      } catch { failures.push('skipped-work memory'); }
      try {
        const { tunesContext } = await import('./progressionTunes.js');
        const tunes = await tunesContext(vaultPath);
        if (tunes) parts.push(tunes);
      } catch { failures.push('progression tunes'); }
      try {
        const prefs = await preferencesContext(vaultPath);
        if (prefs) parts.push(prefs);
      } catch { failures.push('preferences'); }
      try {
        const { standingContext } = await import('./standing.js');
        const standing = await standingContext(vaultPath);
        if (standing) parts.push(standing);
      } catch { failures.push('standing instructions'); }
      try {
        // the org: what the Leader is working on with him, the health read,
        // the rest of the fleet. Coach could not see any of it — so "I keep
        // missing sessions" and "I'm struggling to hold a standard at work"
        // could never be recognised as the same problem.
        const { orgContext } = await import('./orgContext.js');
        const org = await orgContext(vaultPath, 'coach');
        if (org) parts.push(org);
      } catch { failures.push('the org block'); }
      try {
        const { skillsContext } = await import('./skills.js');
        const skills = await skillsContext(vaultPath);
        if (skills) parts.push(skills);
      } catch { failures.push('skills'); }
      // the shared brain: the Coach knows what the rest of the fleet did
      // lately (receipts off the rails — dispatch, reviews, drafts waiting)
      try {
        const { fleetContext } = await import('./fleetContext.js');
        const fleet = await fleetContext();
        if (fleet) parts.push(fleet);
      } catch { failures.push('fleet activity'); }

      if (failures.length) {
        // Silent context loss made the Coach blame his logging for a code
        // failure ("if history is thin, say what to log"). Name what's gone —
        // in the fleet's one wording (lib/contextSections.js), which this
        // lane donated.
        const { ABSENT_NOTE } = await import('./contextSections.js');
        parts.push(ABSENT_NOTE(failures.map((label) => ({ label }))));
      }
      return startAskCoach(vaultPath, { question, context: parts.join('\n\n'), onReady: markRaised || undefined });
}

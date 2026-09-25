import { randomUUID } from 'node:crypto';
import { loadSessions, setSessionSummary } from './workoutSessions.js';
import { createRecord } from './inboxStore.js';
import { readExerciseNote } from './sessionNotes.js';

// Coach's progression engine — pure deterministic rules over logged history,
// per the agents plan: it only ever changes SUGGESTED numbers (session
// prefill + a visible chip); the human logs what actually happened, and
// nothing here writes a file.
//
// Rule: an exercise earns a progression when its last two logged sessions
// both "topped out" — at least the routine's target set count, with every
// set at or above the target-high reps. Weighted movements progress by
// +2.5kg; bodyweight movements progress by +1 rep. Time-based tracking types
// are left alone (no honest deterministic rule for them yet).

export const WEIGHT_STEP_KG = 2.5;
// Effort thresholds for the DEFAULT path (the RPE-tuned model has its own).
//
// CALIBRATED TO HIS SCALE, measured from his real log (323 rated sets across
// 32 sessions): RPE 7 = 1%, 8 = 10%, 9 = 64%, 10 = 24%. Eighty-eight percent
// sit at 9-10, and a 9 is his FIRST set on most exercises, not just his last.
// He confirmed in words what the distribution shows: a 9 means "it felt hard
// and I had to give a lot of effort by the end" — his normal working set, NOT
// one-rep-in-reserve.
//
// The consequence is the important part: an ABSOLUTE RPE cutoff carries
// almost no differential signal for him. Gating at 9.5 held every single lift
// at "quality" — 16/16 measured live on his server — and advice on everything
// is worth what advice on nothing is worth. Raising the cutoff alone does not
// fix it either: at 10 it still held 17/21, because he genuinely does take a
// top set to 10 most sessions.
//
// So effort no longer decides on its own. The discriminator is OBJECTIVE —
// is the best set's estimated 1RM moving? Effort only decides
// what to prescribe once we know it is NOT moving.
export const GRIND_RPE = 10; // his true ceiling — failure, not "hard"
export const READY_RPE = 9; // his normal hard working set — load is earned here
// A best-set drop larger than this is a REGRESSION, not a sticking point. The
// cause is different (recovery, a deload, a logging change), so the advice
// must be different — telling him to "add tempo" when he went backwards is
// answering the wrong question.
export const REGRESSION_MARGIN = 0.1;
// A bodyweight movement whose EVERY set clears target-high by this margin,
// two sessions running, has outgrown its prescription — see 'outgrown'.
const OUTGROWN_MARGIN = 2;
const WEIGHTED_TYPES = new Set(['weight_reps', 'weighted_bodyweight_reps']);
const BODYWEIGHT_TYPES = new Set(['bodyweight_reps']);

function toppedOut(sessionExercise, entry) {
  const sets = sessionExercise.sets || [];
  if (sets.length < entry.targetSets) return false;
  return sets.every((s) => (Number(s.reps) || 0) >= entry.targetRepsHigh);
}

const maxOf = (ex, pick) => Math.max(0, ...(ex.sets || []).map((s) => Number(pick(s)) || 0));

// The best set's ESTIMATED ONE-REP MAX (Epley), or best reps for bodyweight.
// This is the objective trend the progression engine reads first, because his
// RPE saturates at 9-10 and cannot discriminate on its own.
//
// Why e1RM and not weight × reps: volume-load punishes the exact thing
// progress looks like. Caught on his real log — Wide-Grip Lat Pulldown went
// 73kg×8 → 75kg×6, which volume-load scored 584 → 450 and reported as "you
// went backwards, check your sleep". By e1RM that is 92.5 → 90, correctly a
// near-flat lift rather than a collapse. Trading reps for load is normal
// progression and must never read as a regression.
export function bestSetLoad(ex) {
  let best = 0;
  for (const s of ex.sets || []) {
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (!r) continue;
    // bodyweight movements carry no weight — reps ARE the load
    const score = w > 0 ? w * (1 + r / 30) : r;
    if (score > best) best = score;
  }
  return best;
}

// routines: the resolved routines from loadRoutines (entries carry
// exerciseId/trackingType/targetSets/targetRepsHigh). Returns a map keyed
// `${routineId}:${exerciseId}` → { kind, delta, evidence }.
export async function computeProgressions(vaultPath, routines) {
  const sessions = await loadSessions(vaultPath); // newest first
  // His standing feedback, applied here so a correction he gave once holds
  // forever: a tuned step replaces the default, a hold suppresses the
  // suggestion entirely. See progressionTunes.js.
  const { getTunes, tuneFor } = await import('./progressionTunes.js');
  const tunes = await getTunes(vaultPath).catch(() => []);
  const out = {};

  for (const routine of routines) {
    for (const entry of routine.exercises) {
      if (!WEIGHTED_TYPES.has(entry.trackingType) && !BODYWEIGHT_TYPES.has(entry.trackingType)) continue;
      const tune = tuneFor(tunes, entry.exerciseId);
      if (tune?.hold) continue; // he asked for no progressions here — honour it

      const recent = [];
      for (const s of sessions) {
        const ex = s.exercises.find((e) => e.exerciseId === entry.exerciseId);
        if (ex && ex.anomaly) continue; // flagged off-day — not evidence
        if (ex && ex.sets?.length) recent.push(ex);
        if (recent.length === 2) break;
      }
      if (recent.length < 1) continue;

      // RPE-AUTOREGULATED model (tune {model:'rpe'}): effort decides, not
      // rep counting. One session at target with headroom (top-set RPE ≤ 8)
      // earns the step; RPE ≥ 9.5 means grinding — no progression even if
      // the reps were there. The audit: RPE captured for weeks, computed on
      // by nothing.
      if (tune?.model === 'rpe') {
        const last = recent[0];
        const rpes = last.sets.map((s) => s.rpe).filter((r) => r != null);
        if (!rpes.length) continue; // no effort data logged — the model can't run
        const top = Math.max(...rpes);
        // THE QUALITY PATH, for tuned lifts too. Grinding (RPE at his true
        // ceiling) with the work flat or backwards used to fall through this
        // branch as a silent "no progression" — the default path's hold-and-
        // coach never reached an autoregulated lift. Same rule, same shape.
        if (top >= GRIND_RPE && recent.length >= 2) {
          const loadNow = bestSetLoad(recent[0]);
          const loadPrev = bestSetLoad(recent[1]);
          if (!(loadNow > loadPrev)) {
            const lastW0 = maxOf(recent[0], (s) => s.weight);
            const backwards = loadPrev > 0 && loadNow < loadPrev * (1 - REGRESSION_MARGIN);
            out[`${routine.id}:${entry.exerciseId}`] = {
              kind: 'quality',
              delta: 0,
              focus: backwards ? 'same weight, full range — rebuild your best set before adding anything' : '3s lowering, no bounce out of the bottom, full range — same weight',
              evidence: `top set RPE ${top} on an autoregulated lift and the work ${backwards ? 'went BACKWARDS' : 'is flat'} (${Math.round(loadPrev)} → ${Math.round(loadNow)} est. 1RM${lastW0 ? `, now ${lastW0}kg` : ''}) — ${backwards ? 'that reads as recovery, not technique: hold the load and rebuild' : 'hold the load and own the reps before the step'}`,
            };
            continue;
          }
        }
        if (!toppedOut(last, entry) || top > 8) continue;
        const lastW = Math.max(...last.sets.map((s) => Number(s.weight) || 0));
        const step = tune?.stepKg ?? WEIGHT_STEP_KG;
        const rpeOutgrown = !WEIGHTED_TYPES.has(entry.trackingType)
          && last.sets.every((s) => (Number(s.reps) || 0) >= entry.targetRepsHigh + OUTGROWN_MARGIN);
        out[`${routine.id}:${entry.exerciseId}`] = WEIGHTED_TYPES.has(entry.trackingType)
          ? { kind: 'weight', delta: step, evidence: `hit target reps at top-set RPE ${top} (autoregulated: ≤8 earns the step)${lastW ? ` at ${lastW}kg` : ''}` }
          : rpeOutgrown
            ? { kind: 'outgrown', delta: 0, evidence: `every set ≥ ${entry.targetRepsHigh + OUTGROWN_MARGIN} reps at RPE ${top} against a ${entry.targetRepsLow}-${entry.targetRepsHigh} target — the prescription is outgrown; add load or a harder variation.` }
            : { kind: 'reps', delta: tune?.repStep ?? 1, evidence: `target reps at RPE ${top} — room for more (autoregulated)` };
        continue;
      }

      if (recent.length < 2) continue;

      // EFFORT GATES LOAD — even without an explicit RPE tune.
      //
      // He logs RPE on nearly every set, and this default path used to ignore
      // it completely: reps at target twice running earned +2.5kg no matter
      // how hard they were. Caught in his own data — Dumbbell Shoulder Press
      // (Single Arm) sat at 22.5kg for three sessions at RPE 9, 9 then 10
      // with reps FLAT at 7-8, and Coach kept prescribing another 2.5kg
      // (an 11% jump on a single-arm dumbbell, while he was already grinding).
      // That is the "suggesting changes for the sake of them" he called out.
      //
      // A coach reads the effort first: at RPE 9+ the bar is not the lever,
      // technique and time under tension are. So a grinding lift now earns a
      // QUALITY prescription instead of a number — his exact ask for "more
      // varied improvements like rep ranges, controlled form, time under
      // tension" rather than load every time.
      const rpesRecent = recent[0].sets.map((s) => s.rpe).filter((r) => r != null);
      const topRpe = rpesRecent.length ? Math.max(...rpesRecent) : null;
      const lastWeight = maxOf(recent[0], (s) => s.weight);

      // HIS OWN WORDS ARE EVIDENCE. He writes a note against the exercise
      // mid-session and, until now, this engine never read it — so a lift he
      // had just described himself heaving up with body momentum could still
      // earn +2.5kg because the rep count looked fine. A note reporting form
      // breaking down (or pain) HOLDS the load: the deterministic layer only
      // ever suppresses an increase, never invents one, and it quotes his
      // sentence back so the reason is his, not an inference.
      const lastNote = readExerciseNote(recent[0]);
      const formGone = !!lastNote?.signals.some((x) => x === 'form-breakdown' || x === 'pain');

      // OBJECTIVE TREND FIRST. His effort rating is near-constant, so "is it
      // moving?" is the only question that separates one lift from another.
      const loadNow = bestSetLoad(recent[0]);
      const loadPrev = bestSetLoad(recent[1]);
      const improving = loadNow > loadPrev;
      const regressed = loadPrev > 0 && loadNow < loadPrev * (1 - REGRESSION_MARGIN);
      const work = (n) => Math.round(n);

      // A lift only gets held when he is at his ACTUAL ceiling *and* the work
      // has stopped moving. At RPE 9 — his working effort — a lift that is
      // still climbing now progresses normally, which is the whole fix.
      // He said the form went. That is a stronger signal than any rep count,
      // and it decides before the numbers get a vote.
      if (formGone) {
        const why = lastNote.pain ? `you reported pain — "${lastNote.pain}"` : `your own note: "${lastNote.note}"`;
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'quality',
          delta: 0,
          note: lastNote.note || null,
          focus: 'same weight, strict form — own the rep before you own the load',
          evidence: `Holding ${lastWeight ? `${lastWeight}kg` : 'this weight'} because ${why}. Adding load to a lift you are already fighting buys worse reps, not more muscle — clean this up at the same weight first and the step is yours.`,
        };
        continue;
      }

      if (topRpe != null && topRpe >= GRIND_RPE && !improving) {
        const repsOf = (ex) => maxOf(ex, (s) => s.reps);
        const flat = repsOf(recent[0]) <= repsOf(recent[1]);
        const topReps = repsOf(recent[0]);
        // Only name a rep target he is actually BELOW. Caught on his own data:
        // a lateral raise at 12 reps against a target of 9 produced "earn 9
        // clean reps" — telling him to do FEWER than he already does. A number
        // that reads as nonsense costs more trust than saying nothing.
        const repRoom = entry.targetRepsHigh > topReps ? entry.targetRepsHigh : null;
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'quality',
          delta: 0,
          focus: regressed
            ? 'same weight, full range — rebuild your best set before adding anything'
            : '3s lowering, no bounce out of the bottom, full range — same weight',
          // A drop is a recovery question, not a technique question. Saying
          // "add tempo" to a lift that went backwards answers the wrong one.
          evidence: regressed
            ? `top set RPE ${topRpe} and your best set went BACKWARDS — ${work(loadPrev)} → ${work(loadNow)} est. 1RM${lastWeight ? ` (now ${lastWeight}kg)` : ''}. That reads as recovery, not a sticking point: sleep, food, or too many sets taken to 10. Rebuild to your previous best at this weight before changing the prescription.`
            : repRoom
              ? `top set RPE ${topRpe} at ${lastWeight}kg${flat ? ` and reps flat at ${topReps}` : ''}, with the work not moving (${work(loadPrev)} → ${work(loadNow)} est. 1RM) — adding load here just buys worse reps. Hold ${lastWeight}kg and make it harder with tempo: 3s lowering, no bounce, full range. Earn ${repRoom} clean reps at this weight before the next jump.`
              : `top set RPE ${topRpe} at ${lastWeight}kg for ${topReps} reps and the work is flat (${work(loadPrev)} → ${work(loadNow)} est. 1RM) — you're at the top of the range and at your limit, so more load or more reps both cost you form. Hold ${lastWeight}kg and spend a block making the same reps stricter: 3s lowering, no bounce, full range.`,
        };
        continue;
      }

      if (!recent.every((ex) => toppedOut(ex, entry))) continue;

      // DOUBLE PROGRESSION — reps within the prescribed range before load.
      // Topping the range at a hard-but-not-maximal effort means the reps are
      // there but the margin isn't; a coach banks a rep at the same weight
      // rather than jumping the load and losing three.
      if (WEIGHTED_TYPES.has(entry.trackingType) && topRpe != null && topRpe > READY_RPE) {
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'reps',
          delta: tune?.repStep ?? 1,
          // "feels like a 9" is the honest target on HIS scale — a 9 is his
          // hard working set, and telling him to wait for an 8 would mean
          // waiting for something he logs on 10% of sets.
          evidence: `target reps twice running but the top set hit RPE ${topRpe}${lastWeight ? ` on ${lastWeight}kg` : ''} — bank another rep at this weight first; take the load once the top set settles back to a 9.`,
        };
        continue;
      }

      if (WEIGHTED_TYPES.has(entry.trackingType)) {
        const step = tune?.stepKg ?? WEIGHT_STEP_KG;
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'weight',
          delta: step,
          evidence: `hit ${entry.targetRepsHigh}+ reps across all sets twice running${lastWeight ? ` at ${lastWeight}kg` : ''}${topRpe != null ? ` at RPE ${topRpe} — headroom for the step` : ''}${tune?.stepKg != null ? ` (step tuned to ${step}kg per your feedback)` : ''}`,
        };
      } else {
        // OUTGROWN, not "one more rep": a bodyweight movement repped WELL
        // past its target range two sessions running has stopped being the
        // stimulus the program prescribed — his exact words: coach kept
        // "adding reps to pull ups" with no reasoning and no alternative.
        // A real coach changes the PRESCRIPTION (load it, harden the
        // variation), so the engine stops suggesting reps and says so.
        const minsAbove = recent.every((ex) =>
          ex.sets.every((s) => (Number(s.reps) || 0) >= entry.targetRepsHigh + OUTGROWN_MARGIN));
        if (minsAbove) {
          const minRep = Math.min(...recent[0].sets.map((s) => Number(s.reps) || 0));
          out[`${routine.id}:${entry.exerciseId}`] = {
            kind: 'outgrown',
            delta: 0,
            evidence: `every set ≥ ${entry.targetRepsHigh + OUTGROWN_MARGIN} reps two sessions running (last: min ${minRep}) against a ${entry.targetRepsLow}-${entry.targetRepsHigh} target — more reps is no longer the stimulus. Time to add load (weighted) or a harder variation.`,
          };
        } else {
          const step = tune?.repStep ?? 1;
          out[`${routine.id}:${entry.exerciseId}`] = {
            kind: 'reps',
            delta: step,
            evidence: `topped ${entry.targetRepsHigh} reps on every set twice running${tune?.repStep != null ? ` (rep step tuned to +${step} per your feedback)` : ''}`,
          };
        }
      }
    }
  }
  // EVERY suggestion carries his most recent note for that lift, whether or
  // not the note changed the decision. Seeing "+2.5kg" beside his own
  // sentence about that exercise is the difference between a number he
  // trusts and a number he has to audit for himself.
  for (const [key, sug] of Object.entries(out)) {
    if (sug.note) continue; // the form-hold path already quoted him
    const exerciseId = key.split(':')[1];
    const last = sessions.find((x) => (x.exercises || []).some((e) => e.exerciseId === exerciseId && (e.note || e.pain)));
    const ex = last && (last.exercises || []).find((e) => e.exerciseId === exerciseId);
    const read = ex ? readExerciseNote(ex) : null;
    if (read) out[key] = { ...sug, note: read.note, noteDate: last.date, noteSignals: read.signals };
  }
  return out;
}

/* ---------------------------- deload advisory ---------------------------- */

// Recovery-aware deload signal — pure arithmetic over recent health days,
// honest about thin data, and ADVISORY only (a line in the brief and the
// Coach's context; nothing changes any plan by itself).
//
// Date-aware, not file-aware: loadRecentDays returns the last N FILES, and
// after automation misses those can span weeks — "the last 3 days" must mean
// the last 3 CALENDAR days or the advisory claims recency the data doesn't
// have (the honest-degradation rule; see the steps incident).
export const RHR_RISE_THRESHOLD = 0.08;
export function computeDeloadSignal(healthDays) {
  const dayAge = (d) => Math.round((new Date(new Date().toDateString()) - new Date(`${d.date}T12:00:00`)) / 86400000);
  const all = (healthDays || []).filter((d) => d.date);
  const withHrv = all.filter((d) => d.hrv != null && dayAge(d) <= 10);
  const recent = withHrv.filter((d) => dayAge(d) <= 3);
  const baseline = withHrv.filter((d) => dayAge(d) > 3);
  if (recent.length < 2 || baseline.length < 3) {
    return { advise: false, reason: `not enough recent recovery data (${recent.length} of the last 3 days have HRV, ${baseline.length} baseline days)` };
  }
  const avg = (list, key) => list.reduce((s, d) => s + d[key], 0) / list.length;
  const hrvDrop = (avg(baseline, 'hrv') - avg(recent, 'hrv')) / avg(baseline, 'hrv');

  const recentSleep = all.filter((d) => d.sleepAsleepMinutes != null && dayAge(d) <= 3);
  const sleepShort = recentSleep.length >= 3 && avg(recentSleep, 'sleepAsleepMinutes') < 360;

  // The third classic overreach signal, replayed on his real history before
  // shipping (Aug 2026, 24 RHR days): a 3-day average ≥ 8% above the 7-day
  // baseline fired twice in six weeks — once beside a 13% HRV drop — while
  // anything lower caught single-day noise (49 → 70 → 59). Thin data refuses.
  const withRhr = all.filter((d) => d.restingHeartRate != null && dayAge(d) <= 10);
  const rhrRecent = withRhr.filter((d) => dayAge(d) <= 3);
  const rhrBase = withRhr.filter((d) => dayAge(d) > 3);
  const rhrRise = rhrRecent.length >= 2 && rhrBase.length >= 3
    ? (avg(rhrRecent, 'restingHeartRate') - avg(rhrBase, 'restingHeartRate')) / avg(rhrBase, 'restingHeartRate')
    : null;

  if (hrvDrop >= 0.1) {
    return { advise: true, reason: `HRV is down ${Math.round(hrvDrop * 100)}% on your baseline across the last ${recent.length} logged day${recent.length === 1 ? '' : 's'} — a lighter session (−15% loads, stop 2-3 reps short) protects the trend` };
  }
  if (rhrRise != null && rhrRise >= RHR_RISE_THRESHOLD) {
    return { advise: true, reason: `resting heart rate is up ${Math.round(rhrRise * 100)}% on your baseline (${avg(rhrRecent, 'restingHeartRate').toFixed(0)} vs ${avg(rhrBase, 'restingHeartRate').toFixed(0)} bpm over the last ${rhrRecent.length} logged days) — the body is still paying for something; go lighter today` };
  }
  if (sleepShort) {
    return { advise: true, reason: 'under 6h sleep three nights running — cap intensity today and bank an early night' };
  }
  return { advise: false, reason: 'recovery trend looks steady' };
}

// HIS PROGRAM AS CODE READS IT, EVERY TURN (25 Sep 2026). His Coach
// conversation runs for days; a resumed turn carried the date and his
// recovery but not the program, so between his edits Coach reasoned from
// memory: it grepped for exercise ids, missed that its own add had never
// landed, and counted his sets in its head. This is the one listing both a
// new and a resumed turn get: every routine in the order of his week, every
// exercise in session order with its prescription and the muscle his library
// files it under, and the split the proposal check holds suggestions to.
export async function programContext(vaultPath) {
  const { loadExerciseLibrary } = await import('./exercises.js');
  const { loadRoutines, WEEKDAYS, ACTIVE_REST } = await import('./workouts.js');
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { routines, schedule } = await loadRoutines(vaultPath, exercises);
  if (!routines.length) return 'HIS PROGRAM NOW: no routines are set up in Train yet.';
  const SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const reps = (e) => (e.targetRepsLow && e.targetRepsHigh && e.targetRepsLow !== e.targetRepsHigh ? `${e.targetRepsLow}–${e.targetRepsHigh}` : `${e.targetRepsLow || e.targetRepsHigh || '?'}`);
  const daysOf = (id) => WEEKDAYS.filter((d) => schedule?.[d] === id).map((d) => SHORT[d]);
  const ordered = [...routines].sort((a, b) => {
    const rank = (r) => { const i = WEEKDAYS.findIndex((d) => schedule?.[d] === r.id); return i < 0 ? 99 : i; };
    return rank(a) - rank(b);
  });
  const lines = ordered.map((r) => {
    const days = daysOf(r.id);
    const sets = r.exercises.reduce((n, e) => n + (Number(e.targetSets) || 0), 0);
    const list = r.exercises.map((e, i) => `${i + 1} ${e.name} ${e.targetSets}×${reps(e)} (${e.muscleGroup || 'unfiled'})`).join(' · ');
    return `${days.length ? days.join('+') : 'not scheduled'} ${r.name} [${sets} sets]: ${list}`;
  });
  const off = WEEKDAYS.filter((d) => !schedule?.[d] || schedule[d] === ACTIVE_REST)
    .map((d) => `${SHORT[d]} ${schedule?.[d] === ACTIVE_REST ? 'active rest' : 'rest'}`);
  const split = splitRulesLine(routines);
  // THE SAME NUMBERS HIS TRAIN CARD SHOWS. Asked on 25 Sep why his goal
  // muscles were "under target", Coach said it could not see the target the
  // app used and counted for itself, and disagreed with the card. The planned
  // week (lib/plannedWeek.js, src/weekSets.js) is what the card and its sheet
  // read: done so far, still scheduled, the target, and short-by-Sunday.
  let week = '';
  try {
    const { buildTrainOverview } = await import('./trainOverview.js');
    const { weekSetsView } = await import('../../src/weekSets.js');
    const v = weekSetsView((await buildTrainOverview(vaultPath)).week);
    if (v) {
      const rows = v.muscles.filter((m) => m.planned || m.goal)
        .map((m) => `${m.muscle} ${m.done} done + ${m.due} still scheduled = ${m.projected} of ${m.target}${m.short ? ' SHORT' : ''}`);
      week = `\nHIS WEEK IN HARD SETS (the numbers his Train card shows him; quote these, never a count of your own): ${v.headline} ${rows.join('; ')}.`;
    }
  } catch { week = '\nHIS WEEK IN HARD SETS failed to compute this turn: say so rather than counting from memory.'; }
  return `HIS PROGRAM NOW (read from his Workout Routines page this turn; it supersedes anything earlier in this conversation, including what you proposed — check here before you say a change landed):\n${lines.join('\n')}${off.length ? `\n${off.join(' · ')}` : ''}${split ? `\n${split}` : ''}${week}`;
}

// YOUR CARDS, AS THE RECORD HAS THEM (25 Sep 2026). Coach told him to
// "approve the first four cards" when two existed, and to turn down cards it
// could have taken back itself. It now sees, every turn, what is waiting on
// him (with the id WITHDRAW needs) and what he did with the rest.
export async function coachCardsContext({ now = Date.now(), records = null } = {}) {
  const { COACH_ROUTES } = await import('../../src/coachSuggestions.js');
  const all = records || (await (await import('./inboxStore.js')).listRecords());
  const mine = all.filter((r) => r.kind === 'coach-program' || COACH_ROUTES.includes(r.decision?.route));
  const title = (r) => {
    if (r.decision?.title) return r.decision.title.replace(/^Coach:\s*/, '');
    const line = String(r.originalText || r.text || '').replace(/^Coach:\s*/, '');
    return `program review: ${line.split(/(?<=[.!?])\s/)[0].slice(0, 140)}`;
  };
  const at = (iso) => new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  const waiting = mine.filter((r) => r.status === 'pending');
  const dayAgo = now - 86_400_000;
  const answeredAt = (r) => r.filedAt || r.discardedAt || r.undoneAt || r.withdrawnAt || null;
  // the newest ten: enough to see what happened to this conversation's cards
  const answered = mine.filter((r) => r.status !== 'pending' && answeredAt(r) && Date.parse(answeredAt(r)) >= dayAgo)
    .sort((a, b) => Date.parse(answeredAt(a)) - Date.parse(answeredAt(b))).slice(-10);
  const verb = (r) => (r.status === 'filed' ? (r.instructed ? 'applied on his word' : 'he approved')
    : r.status === 'undone' ? 'he approved, then undid'
      : r.status === 'withdrawn' ? 'you took it back'
        : r.expired ? 'expired unanswered' : `he turned it down${r.declineReason ? ` ("${r.declineReason}")` : ''}`);
  const bits = [];
  bits.push(waiting.length
    ? `waiting on him: ${waiting.map((r) => `[${r.id}] ${title(r)}`).join(' · ')}`
    : 'nothing of yours is waiting on him');
  if (answered.length) bits.push(`answered in the last day: ${answered.map((r) => `${at(answeredAt(r))} ${verb(r)}: ${title(r)}`).join(' · ')}`);
  return `YOUR CARDS (the record, not your memory):\n${bits.join('\n')}${waiting.length ? '\nTo take back a waiting card, end with WITHDRAW {"ids":["<id>"]} on its own line.' : ''}`;
}

// The live line for RESUMED coach turns — the same fix the spoken lane got.
// A conversation persisted in localStorage indefinitely kept reasoning off
// the context computed on turn ONE (possibly weeks old) under a prompt that
// says to trust that context over the vault. Every resumed turn now
// re-states the volatile picture: date, recovery series, deload verdict,
// last session, streak. Cheap by design — local files only.
export async function coachLiveLine(vaultPath) {
  const bits = [];
  const today = new Date();
  bits.push(`today is ${today.toDateString()}`);
  try {
    const { loadRecentDays } = await import('./healthData.js');
    const days = await loadRecentDays(7);
    const series = days.filter((d) => d.hrv != null || d.sleepAsleepMinutes != null)
      .map((d) => `${d.date.slice(5)}: ${d.hrv != null ? `HRV ${Math.round(d.hrv)}` : ''}${d.sleepAsleepMinutes != null ? ` sleep ${(d.sleepAsleepMinutes / 60).toFixed(1)}h` : ''}${d.restingHeartRate != null ? ` RHR ${d.restingHeartRate}` : ''}`.trim());
    if (series.length) bits.push(`recovery 7d [${series.join(' | ')}]`);
    const deload = computeDeloadSignal(days);
    bits.push(`deload signal: ${deload.advise ? 'YES — ' : 'no — '}${deload.reason}`);
  } catch { bits.push('recovery data FAILED to load this turn'); }
  try {
    const { loadSessions } = await import('./workoutSessions.js');
    const sessions = await loadSessions(vaultPath, { limit: 1 });
    if (sessions.length) bits.push(`last session ${sessions[0].date} — ${sessions[0].routineName}`);
  } catch { bits.push('session history FAILED to load this turn'); }
  // THE DELTAS a days-old chat cannot know: a new injury, a tune, what he
  // said to the last proposals, where the progression engine stands now.
  // Each read names its own failure, like the two above.
  try {
    const { listInjuries } = await import('./injuryLog.js');
    const open = (await listInjuries(vaultPath)).filter((i) => !i.resolvedAt);
    bits.push(open.length ? `open injuries: ${open.map((i) => `${i.area} (${i.severity}, since ${i.startedAt})`).join(', ')}` : 'no open injuries');
  } catch { bits.push('injury log FAILED to load this turn'); }
  try {
    const { getTunes } = await import('./progressionTunes.js');
    const tunes = await getTunes(vaultPath);
    const held = tunes.filter((t) => t.hold).map((t) => t.name);
    bits.push(tunes.length ? `${tunes.length} progression tune${tunes.length === 1 ? '' : 's'} active${held.length ? ` (held: ${held.join(', ')})` : ''}` : 'no progression tunes');
  } catch { bits.push('progression tunes FAILED to load this turn'); }
  // A PLAN THAT FINISHED SINCE THIS CHAT BEGAN. His Coach conversation lives
  // for days; the report he wants walked through may have landed an hour
  // ago. Turn-1 context carries the full plans block; a resumed turn gets the
  // newest finished report here so "what did the research find and what do
  // I change" is answerable without starting over.
  try {
    const { latestReportLine } = await import('./planFollowUp.js');
    const line = await latestReportLine();
    if (line) bits.push(line);
  } catch { bits.push('his plans FAILED to load this turn'); }
  try {
    const { listRecords } = await import('./inboxStore.js');
    const COACH_ROUTES = new Set(['progression-tune', 'routine-edit', 'injury-log', 'goal-target', 'training-block', 'exercise-resource', 'coach-learning', 'exercise-remap', 'schedule-edit']);
    const cutoff = Date.now() - 7 * 86400000;
    const recent = (await listRecords()).filter((r) => COACH_ROUTES.has(r.decision?.route) && new Date(r.createdAt || 0).getTime() > cutoff);
    if (recent.length) {
      const n = (s) => recent.filter((r) => r.status === s).length;
      const declined = recent.filter((r) => r.status === 'discarded' && r.declineReason).map((r) => `"${r.declineReason}"`).slice(0, 3);
      bits.push(`your proposals last 7d: ${n('filed')} approved, ${n('discarded')} declined${declined.length ? ` (his reasons: ${declined.join(', ')})` : ''}, ${n('pending')} pending`);
    } else bits.push('no proposals of yours in the last 7d');
  } catch { bits.push('proposal outcomes FAILED to load this turn'); }
  try {
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { loadRoutines } = await import('./workouts.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    const prog = await computeProgressions(vaultPath, routines);
    const kinds = Object.values(prog).map((p) => p.kind);
    const count = (k) => kinds.filter((x) => x === k).length;
    bits.push(kinds.length
      ? `progression now: ${count('weight') + count('reps') + count('outgrown')} step${count('weight') + count('reps') + count('outgrown') === 1 ? '' : 's'} earned, ${count('quality')} held for quality`
      : 'progression now: nothing earned or held');
  } catch { bits.push('progression state FAILED to compute this turn'); }
  // His program and Coach's own cards, as the record has them. Joined with
  // single newlines on purpose: the whole preamble stays ONE paragraph, which
  // is how agentSessions.cleanTurnText knows it is plumbing, not his words.
  const blocks = [];
  try { blocks.push(await programContext(vaultPath)); } catch { blocks.push('HIS PROGRAM FAILED to load this turn — read Wiki/Health/Workout Routines.md before proposing anything'); }
  try { blocks.push(await coachCardsContext()); } catch { blocks.push('YOUR CARDS FAILED to load this turn'); }
  return [`LIVE UPDATE (recomputed this turn — supersedes earlier numbers in this conversation): ${bits.join('; ')}.`, ...blocks]
    .join('\n').replace(/\n{2,}/g, '\n');
}

/* --------------------------- quick sessions ------------------------------ */

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Turn the Coach's JSON plan into session-editor exercises: map names onto
// the real library (so history and prefills attach), fall back to ad-hoc
// entries for genuinely new movements. Pure and exported for tests.
export function normalizeQuickPlan(plan, libraryExercises, exerciseState = {}) {
  const name = String(plan?.name || '').trim().slice(0, 60);
  const rationale = String(plan?.rationale || '').trim().slice(0, 300);
  const raw = Array.isArray(plan?.exercises) ? plan.exercises : [];
  if (!name || !raw.length) throw new Error('the plan came back incomplete — try again');

  const byName = new Map(libraryExercises.map((e) => [e.name.toLowerCase(), e]));
  const exercises = raw.slice(0, 10).map((x) => {
    const xName = String(x?.name || '').trim().slice(0, 80);
    if (!xName) return null;
    const sets = Math.min(8, Math.max(1, Number(x.sets) || 3));
    const reps = Math.min(50, Math.max(1, Number(x.reps) || 10));
    const tokens = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const want = tokens(xName);
    const lib = byName.get(xName.toLowerCase())
      || libraryExercises.find((e) => e.name.toLowerCase().includes(xName.toLowerCase()) || xName.toLowerCase().includes(e.name.toLowerCase()))
      // token subset: "chest supported row" matches "Chest-Supported Dumbbell Row"
      || libraryExercises.find((e) => {
        const have = tokens(e.name);
        return want.size >= 2 && [...want].every((t) => have.has(t));
      });
    const state = lib ? exerciseState[lib.id] : null;
    const lastWeight = state?.lastSets?.length ? Math.max(...state.lastSets.map((s) => Number(s.weight) || 0)) : 0;
    return {
      exerciseId: lib ? lib.id : `adhoc-${slug(xName)}`,
      name: lib ? lib.name : xName,
      muscleGroup: lib?.muscleGroup || '',
      trackingType: lib?.trackingType || 'weight_reps',
      targetSets: sets,
      targetRepsLow: reps,
      targetRepsHigh: reps,
      coach: null,
      weightHint: String(x.weightHint || '').slice(0, 40) || null,
      adhoc: !lib,
      sets: Array.from({ length: sets }, () => ({ weight: lastWeight, reps, done: false })),
    };
  }).filter(Boolean);
  if (!exercises.length) throw new Error('the plan had no usable exercises');
  return { name, rationale, exercises };
}

/* ------------------------------ e1RM trends ------------------------------ */

// Estimated 1RMs (Epley: w × (1 + reps/30)) from logged history — progress
// read as signal, not noise. Per exercise: current best over the recent
// window vs the best before it, so the Coach sees direction, not just a
// number. Sets above 12 reps are skipped (the formula degrades badly there).
export function estimateE1RMs(sessions, { recentCount = 6 } = {}) {
  const best = (list) => {
    const byExercise = new Map();
    for (const s of list) {
      for (const e of s.exercises) {
        for (const set of e.sets) {
          if (!set.weight || !set.reps || set.reps > 12) continue;
          const e1 = set.weight * (1 + set.reps / 30);
          const cur = byExercise.get(e.exerciseId);
          if (!cur || e1 > cur.e1rm) byExercise.set(e.exerciseId, { name: e.name, e1rm: Math.round(e1 * 2) / 2 });
        }
      }
    }
    return byExercise;
  };
  const recent = best(sessions.slice(0, recentCount));
  const prior = best(sessions.slice(recentCount));
  const out = [];
  for (const [id, cur] of recent) {
    const before = prior.get(id);
    out.push({ exerciseId: id, name: cur.name, e1rm: cur.e1rm, delta: before ? Math.round((cur.e1rm - before.e1rm) * 2) / 2 : null });
  }
  return out.sort((a, b) => b.e1rm - a.e1rm);
}

/* --------------------------- session summary ----------------------------- */

const volumeOf = (session) => Math.round(session.exercises.reduce((v, e) => v + e.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0));

// Session receipts get a mode of their own so the trust ladder can watch
// (and one day propose changing) how they file — same off/draft/auto ladder
// as the scheduled agents.
// REGISTERED IN autonomyLedger.js AUTONOMY_TARGETS ('coach-receipt') — a mode config the
// trust ladder cannot see can never earn (or lose) autonomy. A new mode-config
// lane joins the registry in the same commit.
export const RECEIPT_MODES = ['draft', 'auto'];
const receiptConfigPath = async () => {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  return path.join(dir, 'coach-receipts.json');
};
export async function getReceiptConfig() {
  const { readFile } = await import('node:fs/promises');
  try {
    const raw = JSON.parse(await readFile(await receiptConfigPath(), 'utf8'));
    return { mode: RECEIPT_MODES.includes(raw.mode) ? raw.mode : 'draft' };
  } catch {
    return { mode: 'draft' };
  }
}
export async function setReceiptConfig(patch) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const next = { mode: RECEIPT_MODES.includes(patch?.mode) ? patch.mode : (await getReceiptConfig()).mode };
  const full = await receiptConfigPath();
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

// One deterministic line the moment a workout is logged — the receipt a
// good coach hands you on the way out. Drafted to the journal via the rails.
export async function draftSessionSummary(vaultPath, session) {
  const previous = (await loadSessions(vaultPath, { routineId: session.routineId, limit: 3 }))
    .filter((s) => s.id !== session.id)[0] || null;

  const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = volumeOf(session);
  const bits = [`${session.routineName} logged — ${session.exercises.length} exercise${session.exercises.length === 1 ? '' : 's'}, ${sets} sets, ${volume.toLocaleString()}kg volume`];

  if (previous) {
    const prevVol = volumeOf(previous);
    if (prevVol > 0) {
      const delta = Math.round(((volume - prevVol) / prevVol) * 100);
      bits[0] += ` (${delta >= 0 ? '+' : ''}${delta}% on ${previous.date})`;
    }
    const prevTop = new Map(previous.exercises.map((e) => [e.exerciseId, Math.max(...e.sets.map((s) => s.weight))]));
    const ups = session.exercises
      .filter((e) => prevTop.has(e.exerciseId) && Math.max(...e.sets.map((s) => s.weight)) > prevTop.get(e.exerciseId))
      .map((e) => `${e.name} ${prevTop.get(e.exerciseId)}→${Math.max(...e.sets.map((s) => s.weight))}kg`);
    if (ups.length) bits.push(`Loads up: ${ups.join(', ')}.`);
  } else {
    bits.push('First logged session for this routine — the baseline is set.');
  }

  // stamp the same one-liner into the session file itself (best-effort)
  setSessionSummary(vaultPath, session.id, bits.join(' ')).catch(() => {});

  const title = `Session — ${session.routineName} ${session.date}`;
  const { mode } = await getReceiptConfig();
  const body = bits.join(' ') + (bits.length === 1 ? '.' : '');
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'coach',
    text: title,
    source: 'coach',
    mode,
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title,
      reason: 'Coach’s deterministic session receipt — approve to journal it.',
      payload: { text: body, category: 'training', label: 'Session receipt' },
    },
  };
  await createRecord(record);
  if (mode === 'auto') {
    const { fileDecision } = await import('./inbox.js');
    const { updateRecord } = await import('./inboxStore.js');
    const settled = await settleAutoReceipt(record, {
      file: () => fileDecision(vaultPath, record.decision),
      update: (patch) => updateRecord(record.id, patch),
    });
    if (settled.filed) import('./telegram.js').then(({ sendTelegramText }) => sendTelegramText(`${title}\n\n${body}`)).catch(() => {});
    return settled.record;
  }
  return record;
}

// THE AUTO RECEIPT CANNOT DOUBLE-FILE. The journal line is written, then the
// record is flipped to filed. If the write fails nothing happened and the
// draft stays pending — a later approve files it once. If the write
// SUCCEEDS and the flip fails, the old code fell back to pending too, and
// approving that draft wrote the same line a second time. Now that path
// marks the record 'error' naming the torn state, so approval is closed.
// Injected fns so the torn state is testable without a broken store.
export async function settleAutoReceipt(record, { file, update }) {
  let filing;
  try {
    filing = await file();
  } catch {
    return { filed: false, record }; // nothing written — the pending draft is safe to approve later
  }
  try {
    const updated = await update({ status: 'filed', destination: filing.destination, undoData: filing.undo, filedAt: new Date().toISOString(), auto: true });
    return { filed: true, record: updated || { ...record, status: 'filed' } };
  } catch (e) {
    const torn = `journal line written (${filing.destination}) but the receipt could not be marked filed — approving would write it twice, so this is closed: ${e.message}`;
    let errored = null;
    try { errored = await update({ status: 'error', error: torn }); } catch { /* the store is down; the log is the receipt */ }
    console.error('coach auto receipt: ' + torn);
    return { filed: true, torn: true, record: errored || { ...record, status: 'error', error: torn } };
  }
}

/* --------------------------- live session ask ---------------------------- */

// Mid-session coaching needs the state of THIS session, not just history:
// what's logged so far, what's left, what he's mid-way through. The client
// sends its live session object; this renders the compact truth the Coach
// reasons from. Pure and exported for tests.
export function liveSessionContext(session) {
  if (!session || !Array.isArray(session.exercises) || !session.exercises.length) return '';
  const lines = session.exercises.map((e) => {
    const done = (e.sets || []).filter((s) => s.done);
    const status = e.skipped ? 'SKIPPED today'
      : done.length ? done.map((s) => `${Number(s.weight) || 0}x${Number(s.reps) || 0}${s.rpe ? `@${s.rpe}` : ''}`).join(', ') + ` (${done.length}/${(e.sets || []).length} sets)`
      : 'not started';
    return `- ${e.name}: ${status}`;
  });
  const doneSets = session.exercises.reduce((n, e) => n + (e.sets || []).filter((s) => s.done).length, 0);
  return `LIVE SESSION IN PROGRESS — ${session.routineName || 'Session'}, ${doneSets} sets logged so far. He is asking you MID-WORKOUT, so answer for the gym floor: short, decisive, about what to do in the next few minutes. Current state:\n${lines.join('\n')}`;
}

/* --------------- Coach program edits (proposed, never direct) ------------ */
// The Coach chat can PROPOSE a routine change: the model appends one
// `PROPOSE {json}` line, this code validates it against the REAL routines
// and exercise library (deterministic — unknown names are an honest error,
// never a guess), and a pending inbox record carries it to Hayden's thumb.
// Approval applies it through updateRoutine; undo restores the exact prior
// exercise list. Models decide, code acts.

export function parseCoachProposal(text) {
  const m = (text || '').match(/^\s*PROPOSE\s+(\{.*\})\s*$/m);
  if (!m) {
    // A PROPOSE line that is NOT the JSON form (a compacted session drifts
    // into prose like "PROPOSE swap: X → Y") used to be COMPLETELY silent:
    // no record, no error, and the raw directive left in the display text —
    // Coach promising an APPLY button that never came. Catch it, strip it,
    // and let the caller say so out loud.
    const prose = (text || '').match(/^\s*PROPOSE\b.*$/m);
    if (prose) {
      const cleanText = text.replace(prose[0], '').replace(/\n{3,}/g, '\n\n').trim();
      return { cleanText, proposal: null, parseError: 'the PROPOSE line was prose, not the typed JSON form' };
    }
    return { cleanText: text, proposal: null };
  }
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    return { cleanText, proposal: JSON.parse(m[1]) };
  } catch {
    return { cleanText, proposal: null, parseError: 'the proposal block was not valid JSON' };
  }
}

// EVERY CHANGE, NOT JUST THE FIRST (25 Sep 2026). His program review came
// back with five concrete changes and ended "tick the ones you want" —
// because this parser only ever read the FIRST PROPOSE line, so a reply
// could carry one approvable change at most. He approved the research brief
// and nothing happened: "It's pointless for me to approve something like
// that if coach wont then act on it or propose the changes for me to agree
// to and then make." Now every PROPOSE line is its own card.
export function parseCoachProposals(text) {
  const src = String(text || '');
  const proposals = [];
  const parseErrors = [];
  // the unreadable lines themselves, so a refusal can be shown to the Coach
  // that wrote them (coachProposals.js), not just counted
  const badLines = [];
  let cleanText = src;
  for (const m of src.matchAll(/^\s*PROPOSE\s+(\{.*\})\s*$/gm)) {
    cleanText = cleanText.replace(m[0], '');
    try { proposals.push(JSON.parse(m[1])); } catch {
      parseErrors.push('a proposal block was not valid JSON');
      badLines.push({ line: m[0].trim(), why: 'not valid JSON' });
    }
  }
  // a PROPOSE line in prose ("PROPOSE swap: X → Y") is caught, stripped and named
  for (const m of cleanText.matchAll(/^\s*PROPOSE\b.*$/gm)) {
    cleanText = cleanText.replace(m[0], '');
    parseErrors.push('a PROPOSE line was prose, not the typed JSON form');
    badLines.push({ line: m[0].trim(), why: 'prose, not the typed JSON form' });
  }
  return { cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(), proposals, parseErrors, badLines };
}

const EDIT_ACTIONS = ['swap', 'add', 'remove', 'targets', 'tune', 'injury', 'goal', 'block', 'resource', 'learn', 'remap', 'reorder', 'schedule', 'move'];

// THE FIELDS COACH ACTUALLY WRITES (25 Sep 2026). Between 11:01 and 11:26 that
// morning six of his twelve PROPOSE lines were refused and never became cards:
// every "add" named its exercise in `exercise` (the field remove, targets and
// reorder all use) while this validator read only `add`. The refusal was
// tacked on after the reply, Coach never saw it, and it went on telling him to
// approve cards that did not exist. The model's intent was never in doubt, so
// the field it reached for is accepted, the same stance the glass takes
// (src/visualBeats.js normaliseSpec). Nothing is guessed: a name still has to
// match his library or routine exactly, or loosely and uniquely.
const ACTION_ALIASES = { drop: 'remove', delete: 'remove', retarget: 'targets', relocate: 'move', insert: 'add', replace: 'swap' };
export function normaliseProposal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const p = { ...raw };
  const a = String(p.action || '').trim().toLowerCase();
  p.action = ACTION_ALIASES[a] || a;
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const first = (...keys) => keys.map((k) => str(p[k])).find(Boolean) || '';
  if (p.action === 'add') p.add = first('add', 'exercise', 'name', 'exerciseName');
  if (p.action === 'swap') {
    p.remove = first('remove', 'exercise', 'replace', 'out');
    p.add = first('add', 'with', 'replacement', 'in');
  }
  if (['remove', 'targets', 'reorder', 'tune', 'resource', 'remap'].includes(p.action) && !str(p.exercise)) p.exercise = first('remove', 'name', 'exerciseName');
  if (p.action === 'move') {
    p.exercise = first('exercise', 'name', 'exerciseName', 'remove', 'add');
    const from = first('from', 'fromRoutine', 'source');
    const to = first('to', 'toRoutine', 'destination');
    // "routine" is whichever end the model did not name
    p.from = from || (to ? str(p.routine) : '');
    p.to = to || (from ? str(p.routine) : '');
  }
  return p;
}

// WHAT A ROUTINE'S NAME PROMISES (25 Sep 2026). In one conversation Coach put a
// curl on his Push day twice, and he had to tell it: "The bicep curls are a
// pull exercise so it wouldn't make sense on a push day. You are failing with
// your expertise you are meant to have." A split is his structure, and the
// muscle an exercise trains is in his library, so whether a placement fits is
// a fact code can check before a card is drawn. Only Coach's own SUGGESTIONS
// are held to it: if he tells Coach to put curls on Push, that is his call.
// Shoulders sit on both push and pull days, because the library files rear
// and side delts under one group and face pulls belong on either.
export const SPLIT_DAYS = [
  { match: /\bpush\b/i, day: 'a push day', muscles: ['Chest', 'Shoulders', 'Triceps'] },
  { match: /\bpull\b/i, day: 'a pull day', muscles: ['Back', 'Biceps', 'Forearms', 'Shoulders'] },
  { match: /\b(legs?|lower)\b/i, day: 'a leg day', muscles: ['Quads', 'Hamstrings', 'Glutes', 'Calves'] },
  { match: /\bupper\b/i, day: 'an upper-body day', muscles: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms'] },
];
const ANY_DAY = new Set(['Abs', 'Mobility', 'Full Body', 'Other']); // work that belongs to no one day
export function splitOf(routineName) {
  return SPLIT_DAYS.find((s) => s.match.test(String(routineName || ''))) || null;
}
export function splitMisfit(routineName, muscleGroup) {
  const split = splitOf(routineName);
  if (!split || !muscleGroup || ANY_DAY.has(muscleGroup)) return null;
  return split.muscles.includes(muscleGroup) ? null : split;
}
// HIS CALL, IN HIS WORDS. "instructed" is the model's claim that he asked for
// a change, and it lets a change apply without his tap. On a live test the
// Coach, refused a curl onto Push, simply re-sent it as instructed. A
// placement that breaks his split therefore needs his own words behind it:
// the lift and the day it goes to, named in what he actually said.
const GENERIC_WORDS = new Set(['cable', 'dumbbell', 'barbell', 'machine', 'single', 'with', 'from', 'high', 'position', 'weight', 'attachment', 'behind', 'back', 'wrist', 'height', 'palms', 'facing', 'bench']);
export function namedIn(text, name) {
  const said = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const words = String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
  const stem = (w) => w.replace(/s$/, '');
  return words.some((w) => said.includes(` ${stem(w)}`));
}

// His split in one sentence, for the prompt and the per-turn picture — built
// from the same table the check uses, so the two can never disagree.
export function splitRulesLine(routines = []) {
  const rows = routines.map((r) => ({ name: r.name, split: splitOf(r.name) })).filter((x) => x.split);
  if (!rows.length) return '';
  return `HIS SPLIT (code refuses a suggestion that breaks it): ${rows.map((x) => `${x.name} holds ${x.split.muscles.join(', ')}`).join('; ')}; abs and mobility fit any day.`;
}

// A refusal Coach can act on. `substance` means the change itself was wrong
// for him (it breaks his split, duplicates, empties a routine, changes
// nothing), so the reply built on it has to change too; anything else is a
// wording fault the card can be fixed from.
function refuse(message, kind = 'format') {
  const e = new Error(message);
  e.kind = kind;
  return e;
}

// Compare names the way he reads them: case, hyphens and brackets aside.
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ONE NAME, ONE THING, or say which. An empty name used to match everything
// ("".includes is always true), so a remove that named no exercise quietly
// took the routine's FIRST one; and a loose name became whichever match came
// first. Exact wins; a single loose match is that match; several is a
// question sent back to Coach, never a guess.
function pickNamed(list, name, nameOf, where) {
  const want = nameKey(name);
  if (!want) return null;
  const exact = list.find((x) => nameKey(nameOf(x)) === want);
  if (exact) return exact;
  const loose = list.filter((x) => {
    const k = nameKey(nameOf(x));
    return k && (k.includes(want) || want.includes(k));
  });
  if (loose.length > 1) throw refuse(`"${name}" fits ${loose.length} in ${where} (${loose.slice(0, 5).map(nameOf).join(', ')}) — use the exact name`);
  return loose[0] || null;
}

// WHERE IT GOES (25 Sep 2026). Coach told him to do the rope extension
// "straight after the incline bench", but an add could only append, so it
// landed last and he moved it by hand ("You didn't place it in the spot you
// suggested it go on the push day, which is another failure. I have fixed
// it"). A place is a number, "first", "last", or after/before an exercise
// already there. `list` is what it will sit among; the answer is its 1-based
// position in the finished list.
function placementOf(raw, list, where, { required = false } = {}) {
  const max = list.length + 1;
  let after = typeof raw.after === 'string' ? raw.after : '';
  let before = typeof raw.before === 'string' ? raw.before : '';
  let pos = raw.position;
  if (pos && typeof pos === 'object') { after = after || String(pos.after || ''); before = before || String(pos.before || ''); pos = null; }
  if (typeof pos === 'string') {
    const s = pos.trim();
    const rel = s.match(/^(after|before)\s+(.+)$/i);
    if (rel) { if (/^after/i.test(rel[1])) after = rel[2]; else before = rel[2]; pos = null; }
    else if (/^(first|top|start)$/i.test(s)) pos = 1;
    else if (/^(last|end|bottom)$/i.test(s)) pos = max;
    else if (/^\d+$/.test(s)) pos = Number(s);
    else if (s) throw refuse(`position "${s}" isn't a place in ${where} — use "first", "last", a number, or "after": an exercise in ${where}`);
    else pos = null;
  }
  if (after.trim() || before.trim()) {
    const anchor = pickNamed(list, after || before, (e) => e.name, where);
    if (!anchor) throw refuse(`"${after || before}" isn't in ${where} (it has: ${list.map((e) => e.name).join(', ')})`);
    const i = list.indexOf(anchor);
    return after.trim() ? i + 2 : i + 1;
  }
  if (pos == null || pos === '') {
    if (required) throw refuse(`say where it goes: "position" "first", "last", 1–${max}, or "after": an exercise in ${where}`);
    return max;
  }
  const k = Math.round(Number(pos));
  if (!Number.isInteger(k) || k < 1 || k > max) throw refuse(`position must be "first", "last", 1–${max}, or "after": an exercise in ${where}`);
  return k;
}

// The same place, said the way the card says it, and stored the way the
// apply reads it: `afterName` follows that exercise even if his own edits
// have shifted the numbers since; the end of the list is no number at all
// (position null), so it stays the end.
function placeLabel(pos, list) {
  if (pos > list.length) return { text: '', afterName: null, position: null };
  if (pos <= 1) return { text: ', first', afterName: null, position: 1 };
  return { text: `, after ${list[pos - 2].name}`, afterName: list[pos - 2].name, position: pos };
}

const targetsPhrase = (p) => {
  const reps = p.targetRepsLow && p.targetRepsHigh ? (p.targetRepsLow === p.targetRepsHigh ? `${p.targetRepsLow}` : `${p.targetRepsLow}–${p.targetRepsHigh}`) : p.targetRepsLow || p.targetRepsHigh || null;
  if (p.targetSets && reps) return `${p.targetSets} × ${reps}`;
  if (p.targetSets) return `${p.targetSets} sets`;
  return reps ? `${reps} reps` : '';
};

// Two cards that ask the same thing are one card. Coach re-sends a change it
// thinks was lost; he should not be pushed twice for it.
export function proposalKey(route, p = {}) {
  return [route, p.action, p.routineId, p.fromRoutineId, p.removeExerciseId, p.addExerciseId || nameKey(p.addName), p.position,
    p.day, p.exerciseId, p.muscleGroup, p.targetSets, p.targetRepsLow, p.targetRepsHigh, p.area, p.metric, p.insight, p.url].map((x) => (x == null ? '' : String(x))).join('|');
}

// HOW COACH'S EDITS FILE. `direct: true` — his standing grant, given more
// than once ("just do it when I tell you") — means a change HE INSTRUCTED
// applies immediately on the rails (filed, undoable in the Inbox); Coach's
// OWN suggestions always wait for his yes. false → everything waits.
const editsConfigPath = async () => {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  return path.join(dir, 'coach-edits.json');
};
export async function getCoachEditConfig() {
  const { readFile } = await import('node:fs/promises');
  try {
    const raw = JSON.parse(await readFile(await editsConfigPath(), 'utf8'));
    return { direct: raw.direct !== false };
  } catch {
    return { direct: true };
  }
}
export async function setCoachEditConfig(patch) {
  const { writeFile, mkdir, rename } = await import('node:fs/promises');
  const path = await import('node:path');
  const next = { direct: patch?.direct !== false };
  const file = await editsConfigPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file + '.tmp', JSON.stringify(next, null, 2), 'utf8');
  await rename(file + '.tmp', file);
  return next;
}

export async function validateCoachEdit(vaultPath, rawIn, { asked = null } = {}) {
  const { loadExerciseLibrary } = await import('./exercises.js');
  const { loadRoutines } = await import('./workouts.js');
  const raw = normaliseProposal(rawIn) || {};
  const action = String(raw.action || '').toLowerCase();
  if (!EDIT_ACTIONS.includes(action)) throw refuse(`unknown action "${rawIn?.action}" (actions: ${EDIT_ACTIONS.join(', ')})`);
  const instructed = raw.instructed === true;
  // a split-breaking placement is his call only when his words name it
  // (namedIn); with no words to check (an older caller), the claim stands
  const hisCall = (exName, dayName) => instructed && (asked == null || (namedIn(asked, exName) && namedIn(asked, dayName)));

  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { routines } = await loadRoutines(vaultPath, exercises);
  const ci = (s) => String(s || '').trim().toLowerCase();

  // "remap" re-files ONE exercise under the muscle it actually trains —
  // every past set moves with it, because volume is computed from the
  // library at read time. Coach had no such action and bent "tune" to
  // fit ("Retag's below — tap APPLY IT" over a card that never rendered).
  if (action === 'remap') {
    const { MUSCLE_GROUPS } = await import('./exercises.js');
    const name = String(raw.exercise || raw.remove || '').trim();
    const ex = exercises.find((e) => ci(e.name) === ci(name));
    if (!ex) throw new Error(`"${name}" isn't in the exercise library`);
    const group = String(raw.muscleGroup || '').trim();
    if (!MUSCLE_GROUPS.includes(group)) throw new Error(`muscleGroup must be one of: ${MUSCLE_GROUPS.join(', ')}`);
    const before = ex.muscleGroup || 'Other';
    if (before === group) throw new Error(`${ex.name} is already filed under ${group}`);
    return {
      payload: { action, exerciseId: ex.id, exerciseName: ex.name, muscleGroup: group, before, reason: String(raw.reason || '').slice(0, 300) },
      title: `Coach: re-file ${ex.name} under ${group} (was ${before})`,
    };
  }

  // "tune" needs no routine — it adjusts the progression engine for ONE
  // exercise, wherever it appears. This is how his feedback ("that jump is
  // too big") becomes standing behaviour instead of a remark.
  if (action === 'tune') {
    const name = String(raw.exercise || '').trim();
    const lib = pickNamed(exercises, name, (e) => e.name, 'his exercise library');
    if (!lib) throw refuse(name ? `no exercise called "${name}" in his library` : 'a tune names the exercise it tunes');
    const stepKg = Number.isFinite(Number(raw.stepKg)) && Number(raw.stepKg) > 0 && Number(raw.stepKg) <= 20 ? Number(raw.stepKg) : null;
    const repStep = Number.isInteger(Number(raw.repStep)) && Number(raw.repStep) >= 1 && Number(raw.repStep) <= 5 ? Number(raw.repStep) : null;
    const hold = raw.hold === true;
    const focus = String(raw.focus || '').trim().slice(0, 120);
    const model = raw.model === 'rpe' ? 'rpe' : null; // autoregulated progression
    if (stepKg == null && repStep == null && !hold && !focus && !model) throw new Error('a tune needs stepKg, repStep, hold:true, a focus, or model:"rpe"');
    const bits = [hold ? 'hold progressions' : null, model ? 'RPE-autoregulated progression' : null, stepKg != null ? `weight step ${stepKg}kg` : null, repStep != null ? `rep step +${repStep}` : null, focus ? `focus: ${focus}` : null].filter(Boolean);
    return {
      payload: { action, exerciseId: lib.id, exerciseName: lib.name, stepKg, repStep, hold, focus, model, reason: String(raw.reason || '').slice(0, 200) },
      title: `Coach: tune ${lib.name} — ${bits.join(', ')}`,
    };
  }

  // "learn" writes ONE observed durable fact into What Works For Hayden —
  // the client file. Approval-gated like every write; this is how the
  // Coach's understanding of HIM compounds across conversations.
  if (action === 'learn') {
    const { LEARN_KINDS } = await import('./coachKnowledge.js');
    const insight = String(raw.insight || '').trim().slice(0, 300);
    if (insight.length < 10) throw new Error('a learning needs a real insight (10+ chars)');
    const kind = LEARN_KINDS.includes(raw.kind) ? raw.kind : 'works';
    return {
      payload: { action, insight, kind, reason: String(raw.reason || '').slice(0, 200) },
      title: `Coach: remember — ${insight.slice(0, 60)}${insight.length > 60 ? '…' : ''}`,
    };
  }

  // "resource" curates ONE form clip/diagram onto an exercise — the ▶ FORM
  // chip's supply line. The Coach found it on the open web; filing it is
  // still his call, like every write.
  if (action === 'resource') {
    const name = String(raw.exercise || '').trim();
    const lib = pickNamed(exercises, name, (e) => e.name, 'his exercise library');
    if (!lib) throw refuse(name ? `no exercise called "${name}" in his library` : 'a resource names the exercise it is for');
    const url = String(raw.url || '').trim();
    if (!/^https?:\/\//.test(url)) throw new Error('a resource needs an http(s) url');
    const cues = String(raw.cues || '').trim().slice(0, 300);
    return {
      payload: { action, exerciseId: lib.id, exerciseName: lib.name, url: url.slice(0, 300), cues, reason: String(raw.reason || '').slice(0, 200) },
      title: `Coach: file form resource for ${lib.name}`,
    };
  }

  // "block" starts (or advances) a training block — periodization as a
  // confirm-first proposal, like every program change
  if (action === 'block') {
    const { PHASES } = await import('./trainingBlocks.js');
    const phase = String(raw.phase || '').toLowerCase();
    if (!PHASES.includes(phase)) throw new Error(`phase must be one of ${PHASES.join(', ')}`);
    const lengthWeeks = Number(raw.lengthWeeks) >= 1 && Number(raw.lengthWeeks) <= 16 ? Number(raw.lengthWeeks) : 4;
    return {
      payload: { action, phase, lengthWeeks, startedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.startedAt || '')) ? raw.startedAt : null, deloadLastWeek: raw.deloadLastWeek !== false, note: String(raw.note || '').trim().slice(0, 300) },
      title: `Coach: start ${phase} block — ${lengthWeeks} weeks`,
    };
  }

  // "injury" logs a limitation the Coach heard about — pain in chat is
  // safety-critical data that must not evaporate when the conversation does
  if (action === 'injury') {
    const area = String(raw.area || '').trim().slice(0, 60);
    if (!area) throw new Error('an injury needs the affected area');
    const { SEVERITIES } = await import('./injuryLog.js');
    return {
      payload: { action, area, note: String(raw.note || '').trim().slice(0, 300), severity: SEVERITIES.includes(raw.severity) ? raw.severity : 'niggle' },
      title: `Coach: log ${area} ${SEVERITIES.includes(raw.severity) ? raw.severity : 'niggle'} to the Injury Log`,
    };
  }

  // "goal" proposes a MEASURABLE target — the goal page was one untouched
  // prose line; a coach that can't set targets can't coach toward them
  if (action === 'goal') {
    const metric = String(raw.metric || '').trim().slice(0, 60);
    const value = Number(raw.value);
    if (!metric || !Number.isFinite(value)) throw new Error('a goal needs a metric and a numeric value');
    const by = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.by || '')) ? raw.by : null;
    return {
      payload: { action, metric, value, unit: String(raw.unit || '').trim().slice(0, 12), by, note: String(raw.note || '').trim().slice(0, 200) },
      title: `Coach: target — ${metric} ${value}${raw.unit || ''}${by ? ` by ${by}` : ''}`,
    };
  }

  // "schedule" puts a routine (or rest) on ONE weekday. His review found
  // Push on Monday AND Tuesday — back to back — and Coach had no way to
  // propose moving a day, only exercises.
  if (action === 'schedule') {
    const { WEEKDAYS, ACTIVE_REST } = await import('./workouts.js');
    const { schedule } = await loadRoutines(vaultPath, exercises);
    const day = ci(raw.day);
    if (!WEEKDAYS.includes(day)) throw new Error(`day must be one of: ${WEEKDAYS.join(', ')}`);
    const want = ci(raw.routine);
    let routineId = null;
    let label = 'rest';
    if (want === 'active rest' || want === 'active-rest') { routineId = ACTIVE_REST; label = 'active rest'; }
    else if (want && want !== 'rest' && want !== 'none') {
      const r = routines.find((x) => ci(x.name) === want) || routines.find((x) => ci(x.name).includes(want) || want.includes(ci(x.name)));
      if (!r) throw new Error(`no routine called "${raw.routine}" (have: ${routines.map((x) => x.name).join(', ')})`);
      routineId = r.id;
      label = r.name;
    }
    const beforeId = schedule?.[day] || null;
    const nameOf = (id) => (!id ? 'rest' : id === ACTIVE_REST ? 'active rest' : routines.find((x) => x.id === id)?.name || 'an old routine');
    if (beforeId === routineId) throw new Error(`${day} is already ${label}`);
    const Day = day.charAt(0).toUpperCase() + day.slice(1);
    return {
      payload: { action, day, routineId, routineName: label, beforeId, beforeName: nameOf(beforeId), reason: String(raw.reason || '').slice(0, 300) },
      title: `Coach: ${Day} → ${label} (was ${nameOf(beforeId)})`,
    };
  }

  // ROUTINE-LEVEL CHANGES: add, remove, swap, targets, reorder, move.
  const { MUSCLE_GROUPS } = await import('./exercises.js');
  const MUSCLE_GROUP_SET = new Set(MUSCLE_GROUPS);
  const haveRoutines = routines.map((r) => r.name).join(', ');
  const findRoutine = (name, role = 'routine') => {
    if (!nameKey(name)) throw refuse(`name the ${role} (have: ${haveRoutines})`);
    const r = pickNamed(routines, name, (x) => x.name, 'his routines');
    if (!r) throw refuse(`no routine called "${name}" (have: ${haveRoutines})`);
    return r;
  };
  // an exercise that should be in this routine — and, when it is not, where it is
  const inRoutine = (r, name) => {
    if (!nameKey(name)) throw refuse(`the proposal names no exercise in ${r.name} (it has: ${r.exercises.map((e) => e.name).join(', ')})`);
    const e = pickNamed(r.exercises, name, (x) => x.name, r.name);
    if (e) return e;
    const elsewhere = routines.filter((x) => x.id !== r.id && x.exercises.some((y) => nameKey(y.name) === nameKey(name))).map((x) => x.name);
    throw refuse(`"${name}" isn't in ${r.name} (it has: ${r.exercises.map((x) => x.name).join(', ')})${elsewhere.length ? `; it is in ${elsewhere.join(' and ')}` : ''}`);
  };
  const fromLibrary = (name) => pickNamed(exercises, name, (e) => e.name, 'his exercise library');
  const splitRefusal = (exName, muscle, routineName, split) => {
    const homes = routines.filter((r) => !splitMisfit(r.name, muscle)).map((r) => r.name);
    return refuse(`${exName} trains ${muscle}, and ${routineName} is ${split.day} (${split.muscles.join(', ')}), so suggesting it there breaks his split${homes.length ? `; ${muscle} work belongs on ${homes.join(' or ')}` : ''}. Only if HE asked for exactly this placement, naming the exercise and the day, send it with "instructed":true`, 'substance');
  };
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d);
  const reason = String(raw.reason || '').slice(0, 300);

  // "move" takes ONE exercise off one routine and puts it on another, as ONE
  // card (25 Sep 2026). A move used to be a remove card plus an add card: he
  // said yes to the remove, the add had been refused, and his rope extension
  // was simply gone, three tricep sets short. The card read "Drop Cable
  // Lateral Raise" for a move, too, and he pushed back on losing an exercise
  // Coach was only relocating. One yes moves it; one undo puts both back.
  if (action === 'move') {
    const from = findRoutine(raw.from, 'routine it moves from');
    const to = findRoutine(raw.to, 'routine it moves to');
    if (from.id === to.id) throw refuse(`${from.name} to ${to.name} is the same routine; use "reorder" to change its place in the order`, 'substance');
    const target = inRoutine(from, raw.exercise);
    if (to.exercises.some((e) => e.exerciseId === target.exerciseId)) throw refuse(`${target.name} is already in ${to.name}, so a move would list it twice there; to take it off ${from.name} only, use "remove"`, 'substance');
    if (from.exercises.length === 1) throw refuse(`${target.name} is the only exercise in ${from.name}; moving it would leave that routine empty`, 'substance');
    const misfit = !hisCall(target.name, to.name) && splitMisfit(to.name, target.muscleGroup);
    if (misfit) throw splitRefusal(target.name, target.muscleGroup, to.name, misfit);
    const place = placeLabel(placementOf(raw, to.exercises, to.name), to.exercises);
    const payload = {
      action, routineId: to.id, routineName: to.name, fromRoutineId: from.id, fromRoutineName: from.name,
      removeExerciseId: target.exerciseId, removeName: target.name, muscleGroup: target.muscleGroup || null,
      position: place.position, afterName: place.afterName,
      targetSets: num(raw.targetSets, target.targetSets), targetRepsLow: num(raw.targetRepsLow, target.targetRepsLow), targetRepsHigh: num(raw.targetRepsHigh, target.targetRepsHigh),
      reason,
    };
    const retargeted = payload.targetSets !== target.targetSets || payload.targetRepsLow !== target.targetRepsLow || payload.targetRepsHigh !== target.targetRepsHigh;
    return { payload, title: `Coach: move ${target.name} from ${from.name} to ${to.name}${place.text}${retargeted ? `, at ${targetsPhrase(payload)}` : ''}` };
  }

  const routine = findRoutine(raw.routine);
  const payload = { action, routineId: routine.id, routineName: routine.name, reason };

  // "reorder" moves ONE exercise to a position ("put incline bench first" —
  // his own note said it fatigued him done later). Undo restores the list.
  if (action === 'reorder') {
    const target = inRoutine(routine, raw.exercise || raw.remove);
    const n = routine.exercises.length;
    const others = routine.exercises.filter((e) => e.exerciseId !== target.exerciseId);
    const pos = placementOf(raw, others, routine.name, { required: true });
    const current = routine.exercises.findIndex((e) => e.exerciseId === target.exerciseId) + 1;
    if (current === pos) throw refuse(`${target.name} is already number ${pos} in ${routine.name}`, 'substance');
    payload.removeExerciseId = target.exerciseId;
    payload.removeName = target.name;
    payload.position = pos;
    return { payload, title: `Coach: move ${target.name} to ${pos === 1 ? 'first' : pos === n ? 'last' : `number ${pos}`} in ${routine.name}` };
  }

  if (action === 'swap' || action === 'remove' || action === 'targets') {
    const target = inRoutine(routine, raw.remove || raw.exercise);
    payload.removeExerciseId = target.exerciseId;
    payload.removeName = target.name;
    if (action === 'remove' && routine.exercises.length === 1) throw refuse(`${target.name} is the only exercise in ${routine.name}; removing it would leave the routine empty`, 'substance');
    payload.removeMuscle = target.muscleGroup || null;
  }
  if (action === 'swap' || action === 'add') {
    const addName = String(raw.add || '').trim();
    if (!addName) throw refuse(`the proposal names no exercise to ${action === 'add' ? 'add' : 'swap in'}; put its exact name in "add"`);
    const lib = fromLibrary(addName);
    const group = lib ? lib.muscleGroup : (MUSCLE_GROUP_SET.has(raw.muscleGroup) ? raw.muscleGroup : null);
    if (action === 'add' && !lib && !group) throw refuse(`"${addName}" isn't in his exercise library; to add a new exercise, give its "muscleGroup" (one of: ${[...MUSCLE_GROUP_SET].join(', ')})`);
    if (lib && lib.id === payload.removeExerciseId) throw refuse(`that swaps ${lib.name} for itself`, 'substance');
    const already = lib ? routine.exercises.findIndex((e) => e.exerciseId === lib.id) : -1;
    if (already >= 0) throw refuse(`${lib.name} is already in ${routine.name} (number ${already + 1})`, 'substance');
    const incoming = group || (action === 'swap' ? payload.removeMuscle : null);
    const misfit = !hisCall(lib ? lib.name : addName, routine.name) && incoming !== payload.removeMuscle && splitMisfit(routine.name, incoming);
    if (misfit) throw splitRefusal(lib ? lib.name : addName, incoming, routine.name, misfit);
    payload.addExerciseId = lib ? lib.id : null; // null → created at approve time
    payload.addName = lib ? lib.name : addName.slice(0, 80);
    payload.muscleGroup = incoming || null;
    payload.trackingType = lib ? lib.trackingType : (raw.trackingType || null);
  }
  delete payload.removeMuscle;
  let place = null;
  if (action === 'add') {
    place = placeLabel(placementOf(raw, routine.exercises, routine.name), routine.exercises);
    payload.position = place.position;
    payload.afterName = place.afterName;
  }
  if (action !== 'remove') {
    payload.targetSets = num(raw.targetSets, null);
    payload.targetRepsLow = num(raw.targetRepsLow, null);
    payload.targetRepsHigh = num(raw.targetRepsHigh, null);
  }
  if (action === 'targets') {
    if (!payload.targetSets && !payload.targetRepsLow && !payload.targetRepsHigh) throw refuse('a retarget needs targetSets, targetRepsLow or targetRepsHigh');
    const now = routine.exercises.find((e) => e.exerciseId === payload.removeExerciseId);
    const same = (k) => !payload[k] || payload[k] === now[k];
    if (same('targetSets') && same('targetRepsLow') && same('targetRepsHigh')) throw refuse(`${now.name} in ${routine.name} is already ${targetsPhrase(now)}`, 'substance');
  }

  // a decision card says WHAT changes — "retarget Carter Extension" alone
  // asked him to approve a change he could not see (25 Sep)
  const targetText = (p) => {
    const reps = p.targetRepsLow && p.targetRepsHigh ? `${p.targetRepsLow}–${p.targetRepsHigh}` : p.targetRepsLow || p.targetRepsHigh || null;
    if (p.targetSets && reps) return ` to ${p.targetSets} × ${reps}`;
    if (p.targetSets) return ` to ${p.targetSets} sets`;
    if (reps) return ` to ${reps} reps`;
    return '';
  };
  const title = action === 'swap' ? `Coach: swap ${payload.removeName} → ${payload.addName} in ${routine.name}`
    : action === 'add' ? `Coach: add ${payload.addName} to ${routine.name}${place.text}`
    : action === 'remove' ? `Coach: remove ${payload.removeName} from ${routine.name}`
    : `Coach: retarget ${payload.removeName} in ${routine.name}${targetText(payload)}`;
  return { payload, title };
}

// His words alone: every leading bracketed block (a plan step's framing, the
// deck's "[He is talking about one of your suggested changes…]") and the
// recomputed "LIVE UPDATE (…)" preamble are the machine's, not his.
export function hisWordsOf(question) {
  return String(question || '').replace(/^\s*(?:(?:\[[\s\S]*?\]|LIVE UPDATE \(recomputed[^\n]*)\s*)+/, '').trim();
}

// Which rails an action's card rides. A move, like an add or a swap, is a
// routine edit.
export function routeForAction(action) {
  return action === 'remap' ? 'exercise-remap'
    : action === 'tune' ? 'progression-tune'
      : action === 'injury' ? 'injury-log'
        : action === 'goal' ? 'goal-target'
          : action === 'block' ? 'training-block'
            : action === 'resource' ? 'exercise-resource'
              : action === 'learn' ? 'coach-learning'
                : action === 'schedule' ? 'schedule-edit'
                  : 'routine-edit';
}

// A pending record the Inbox renders with Approve/Discard — the Coach's
// proposal, on the same rails as every other write. ALWAYS review-gated:
// program changes are confirm-first regardless of autonomy mode.
export async function createCoachEditRecord(vaultPath, { question, proposal, source = 'coach', validated = null }) {
  // `validated` is the { payload, title } a caller already checked (the
  // Coach's reply is checked whole before any card is filed); otherwise check
  const { payload, title } = validated || await validateCoachEdit(vaultPath, proposal, { asked: question });
  // THE CARD'S OWN LINE IS HIS QUESTION, NOT THE MACHINE'S PREAMBLE. A
  // question that reaches the Coach from a plan step or the front door
  // opens with bracketed context for the model ("[You are answering as one
  // step of a plan…]", "[The plan he is most likely referring to…]"), and on
  // 21 Sep two proposal cards showed exactly that as their text. Strip every
  // leading bracket block; what is left is what he actually asked.
  // A resumed turn also opens with the recomputed "LIVE UPDATE (…)" line —
  // every card filed on 25 Sep read that preamble as his question.
  const asked = hisWordsOf(question) || title;
  const record = {
    id: randomUUID().slice(0, 8),
    text: asked.slice(0, 300),
    source,
    mode: 'review-all',
    status: 'pending',
    // HE asked for this exact change (an imperative) vs Coach suggesting it —
    // the model marks it; startAskCoach applies an instructed one directly
    // when his standing grant (getCoachEditConfig) says so
    instructed: proposal?.instructed === true,
    createdAt: new Date().toISOString(),
    decision: {
      route: routeForAction(payload.action),
      confidence: 'high',
      title,
      reason: payload.reason || 'proposed in the Coach chat',
      payload,
    },
  };
  await createRecord(record);
  return record;
}

/* --------------------- advice-outcome accountability --------------------- */

// What the Coach recommended lately, and what happened to it. Proposals are
// already typed records on the rails — their status IS the outcome, so this
// needs no new store. Rides the Coach context AND the weekly debrief: a
// coach that never learns whether its advice landed can't improve.
export async function adviceContext(days = 14) {
  const { listRecords } = await import('./inboxStore.js');
  const COACH_ROUTES = new Set(['progression-tune', 'routine-edit', 'injury-log', 'goal-target', 'training-block', 'exercise-resource', 'coach-learning', 'schedule-edit']);
  const cutoff = Date.now() - days * 86400000;
  // fuel-cross findings are kind-based (no route — approving files nothing) and
  // his reasoned "no" to one belongs in front of the Coach exactly like a
  // declined program change
  const records = (await listRecords()).filter((r) =>
    (COACH_ROUTES.has(r.decision?.route) || r.kind === 'fuel-cross') && new Date(r.createdAt || 0).getTime() > cutoff);
  if (!records.length) return null;
  // a card Coach took back (WITHDRAW) was never his answer: not "pending", and
  // never a decline to ask him about
  const line = (r) => `${(r.createdAt || '').slice(5, 10)} ${r.decision?.title || r.text} → ${r.status === 'filed' ? 'APPROVED'
    : r.status === 'withdrawn' ? 'you took it back before he answered'
      : r.status === 'undone' ? 'approved, then undone by him'
        : r.status === 'discarded' ? (r.declineReason ? `declined — his reason: "${r.declineReason}" (reason is ON RECORD: never re-ask why; if the data genuinely contradicts it, you may make the counter-case ONCE)` : 'declined (no reason recorded — ask why once, briefly, next time it naturally fits)')
          : 'still pending his word'}`;
  return `YOUR RECENT RECOMMENDATIONS AND THEIR OUTCOMES (last ${days}d — hold yourself to these: don't re-propose declined ones, follow up on approved ones, nudge once on stale pending ones):\n${records.map(line).join('\n')}`;
}

/* ------------------------ repeatedly-skipped work ------------------------ */
// An exercise that keeps NOT happening is a signal, not an accident: no time,
// no machine, a niggle, or it simply doesn't belong in the program any more.
// Deterministic detection here (counts only, from real logged sessions); the
// Coach asks WHY and may PROPOSE a swap or removal through the normal rails.
// A session counts as "attended" for a routine only if something was logged,
// so a rest week doesn't read as skipping.
const SKIP_LOOKBACK = 4;   // most recent sessions of that routine
const SKIP_THRESHOLD = 2;  // missing in this many of them

export function detectSkippedExercises(routines, sessions, { lookback = SKIP_LOOKBACK, threshold = SKIP_THRESHOLD } = {}) {
  const out = [];
  for (const routine of routines) {
    const done = sessions.filter((s) => s.routineId === routine.id).slice(0, lookback);
    if (done.length < threshold) continue; // not enough history to claim a pattern
    for (const entry of routine.exercises) {
      const missed = done.filter((s) => !s.exercises.some((e) => e.exerciseId === entry.exerciseId && e.sets?.length));
      if (missed.length < threshold) continue;
      const lastDone = sessions.find((s) => s.exercises.some((e) => e.exerciseId === entry.exerciseId && e.sets?.length));
      out.push({
        routineId: routine.id,
        routineName: routine.name,
        exerciseId: entry.exerciseId,
        name: entry.name,
        missed: missed.length,
        of: done.length,
        lastDoneDate: lastDone ? lastDone.date : null,
      });
    }
  }
  // A DROP-OFF (used to happen, now doesn't) is unambiguous; a never-logged
  // entry may simply be newly added to the program, so it ranks lower and
  // labels itself. Capped so the Coach sees a signal, not a wall.
  return out
    .sort((a, b) => (a.lastDoneDate ? 0 : 1) - (b.lastDoneDate ? 0 : 1) || b.missed - a.missed || a.name.localeCompare(b.name))
    .slice(0, 4);
}

// Context line for the Coach — facts only; the asking is the Coach's job.
export function skippedContext(skipped) {
  if (!skipped.length) return '';
  const bits = skipped.map((s) => `${s.name} in ${s.routineName} — missing from ${s.missed} of the last ${s.of} sessions${s.lastDoneDate ? ` (last done ${s.lastDoneDate} — a real drop-off)` : ' (never logged at all — it may simply be newly added to the program, so ask rather than assume)'}`);
  return `REPEATEDLY SKIPPED WORK (real counts from his logged sessions — raise the most significant ONE naturally, ask why (time? equipment? a niggle? just dislike it?), and only after hearing the reason offer a swap or removal as a PROPOSE. Never nag about more than one, and never assume the reason):\n- ${bits.join('\n- ')}`;
}

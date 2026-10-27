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
import { startAskCoach, sessionContextTokens, claimConsultSession, getMessageJob } from './claudeCode.js';
import { sessionOwnerGuard } from './askSession.js';
import { isDeepAsk, coachDepth } from './intentRouter.js';
import { loadRecentDays, weightTrendLine, sleepEfficiencyLine, vo2MaxLine } from './healthData.js';
import { carryoverContext } from './workoutCarryover.js';
import { loadRecentDays as loadRecentNutritionDays } from './nutritionLog.js';
import { computeStreaks } from './streaks.js';
import { preferencesContext } from './learning.js';
import { localDateISO } from './localDate.js';
import { providerFor } from './modelPrefs.js';
import { startCoachLocal, wantsChange } from './localCoach.js';
import { holdForEscalation, becomeViewOf, failCarrier } from './askDispatch.js';
import { isLocalOnlySession, sessionTurns, localTurnsSinceClaude, transcriptOf, recordAskTurn } from './localAsk.js';

// ------------------------------ session hygiene ------------------------------
// 18 Oct 2026, measured: every resumed Coach turn appended 10-24k characters
// (the standing reminder, the whole live line, the whole program and cards
// block), the session reached 240k tokens in a day, and a 2.7 h gap cost a
// cold cache write of 239,841 tokens ($6.44). Three rules, all code:
//   1. the standing reminder rides the process (claudeCode.js
//      --append-system-prompt), never the turn;
//   2. a resumed turn carries only what CHANGED in the live line since the
//      turn before it, and the program block only when it changed;
//   3. a session past ~150k tokens, or idle 12 h, is rolled over: a fresh
//      session with the full picture and a code-written line carrying the
//      last few exchanges across.
export const ROLL_TOKENS = 150_000;
export const ROLL_IDLE_MS = 12 * 60 * 60_000;
const LIVE_HEAD = /^LIVE UPDATE \([^)]*\): ([\s\S]*?)\.?$/;

// SPEAK FIRST (18 Oct 2026, measured): a spoken Coach turn reached a tool
// call before any words, and he waited 34.7 s in silence for the first one.
// On a SPOKEN turn only (Nova's door with spoken: true), the turn carries
// this line; the Coach tab and consults never see it.
// HIS RULE, 18 Oct 2026: "the coach should always look things up if it needs
// the clarity and information. Any guessing is a failure." So the spoken
// rule never asks for an answer before the facts: when the Coach must look,
// its first sentence says what it is checking, then it answers from what it
// found. (The first version said "answer from what is in front of you before
// any tool call", which pushed toward a guess.)
export const SPEAK_FIRST_RULE = "[LOOK IT UP, NEVER GUESS: if the answer depends on anything not in the context above, read it with your tools before you answer; a guess is a failure. Spoken turn: if you need to look, your first sentence says what you are checking (for example \"Checking your last six bench sessions.\"), never a provisional answer; then answer from what you found.]";
// RAISE THE STRATEGY ONCE (26 Oct 2026, his ask that Coach act on what it
// notices). One rule, carried only when WHERE HE STANDS holds a real phase
// verdict. It is deliberately narrow: one sentence, once per conversation,
// then a question; never a remark on every reply (nova-turn-taking).
export const STRATEGY_RAISE_RULE = 'STRATEGY RULE: If WHERE HE STANDS carries a STRATEGY line he has not been told this week (no weekly debrief in context says it), raise it in one sentence before answering, then ask if he wants the plan. Never more than once per conversation.';
export const speakFirstLine = (spoken) => (spoken === true ? SPEAK_FIRST_RULE : '');

// What was last sent to each session, so the next turn can send the change.
// In memory: after a restart the first turn sends the whole line, once.
const lastLive = new Map(); // sessionId → { bits: Set<string>, plan: string }
const LAST_LIVE_MAX = 50;
export function _resetLiveMemory() { lastLive.clear(); }

// Split coachLiveLine's text into its facts (the '; '-joined head) and its
// program-and-cards block (every line after the head).
export function splitLiveLine(text) {
  const lines = String(text || '').split('\n');
  const m = LIVE_HEAD.exec(lines[0] || '');
  if (!m) return null;
  return { bits: m[1].split('; ').map((b) => b.trim()).filter(Boolean), plan: lines.slice(1).join('\n').trim() };
}

// The live line for THIS turn of THIS session: whole the first time, then
// only the facts that changed, and the plan block only when it moved. One
// paragraph that opens "LIVE UPDATE", so agentSessions.cleanTurnText still
// reads it as plumbing, never as his words.
export function liveDelta(sessionId, fresh) {
  const parsed = splitLiveLine(fresh);
  if (!parsed || !sessionId) return fresh || '';
  const prior = lastLive.get(sessionId);
  lastLive.delete(sessionId);
  lastLive.set(sessionId, { bits: new Set(parsed.bits), plan: parsed.plan });
  while (lastLive.size > LAST_LIVE_MAX) lastLive.delete(lastLive.keys().next().value);
  if (!prior) return fresh;
  const changed = parsed.bits.filter((b) => !prior.bits.has(b));
  const planMoved = parsed.plan !== prior.plan;
  const head = changed.length
    ? `LIVE UPDATE (changed since your last turn; everything else in the last update stands): ${changed.join('; ')}.`
    : `LIVE UPDATE: nothing has changed since your last turn${planMoved ? '' : ', his program and your cards included'}.`;
  return planMoved ? `${head}\nHis program or your cards changed; as they stand now:\n${parsed.plan}` : head;
}

// Should this session be rolled over? Its size comes from the CLI's own
// per-call usage while this server has seen it, else from the CLI's journal.
export async function rollReason(vaultPath, sessionId, { now = Date.now(), footprint } = {}) {
  let size = sessionContextTokens(sessionId);
  let lastAt = size?.at ?? null;
  let tokens = size?.tokens ?? null;
  if (tokens == null || lastAt == null) {
    const read = footprint || (await import('./agentSessions.js')).sessionFootprint;
    const fp = await read(vaultPath, sessionId).catch(() => null);
    if (fp) { tokens = tokens ?? fp.tokens; lastAt = lastAt ?? fp.lastAt; }
  }
  if (Number.isFinite(tokens) && tokens >= ROLL_TOKENS) return { tokens, why: `${tokens} tokens` };
  if (Number.isFinite(lastAt) && now - lastAt >= ROLL_IDLE_MS) return { tokens, why: `idle ${Math.round((now - lastAt) / 3600_000)} h` };
  return null;
}

// The code-written line carried into the session that replaces a rolled one.
export async function carryLine(vaultPath, sessionId, rolled, { tail } = {}) {
  const read = tail || (await import('./agentSessions.js')).sessionTail;
  const t = await read(vaultPath, sessionId, { maxTurns: 6, maxChars: 240 }).catch(() => null);
  const size = Number.isFinite(rolled?.tokens) ? `about ${Math.round(rolled.tokens / 1000)}k tokens` : rolled?.why || 'its limit';
  if (!t?.turns?.length) return `CARRIED OVER (code closed your previous conversation with him at ${size}; nothing from it could be read back, so ask him where you were if it matters).`;
  return `CARRIED OVER (code closed your previous conversation with him at ${size} and opened this one with the full picture above; its last exchanges, in order): ${t.turns.map((x) => `${x.role === 'user' ? 'Hayden' : 'You'}: ${x.text}`).join(' | ')}`;
}

// ------------------------------ who answers ---------------------------------
// THE LOCAL COACH (27 Oct 2026, his call: a Coach that reads his training and
// answers on the Mac, and sends anything that would CHANGE his program to
// Claude). With the coach lane on this Mac (modelPrefs providerFor, local
// first by default), a question code does not read as an order to change
// something is answered by lib/localCoach.js; if that turn fails before any
// text, or the model hands it up (an ESCALATE line, a PROPOSE), Claude's Coach
// answers on the SAME job id through askDispatch's bridge, labelled
// `provider: 'claude', escalated: true, reason`. Everything else is today's
// path, untouched: a change request (wantsChange), a consult (another agent
// asking: its answer may file cards), and the planner's step (`claudeOnly`, a
// full written review).
function remember(jobId, sessionId, question) {
  // a Claude answer on a conversation this Mac also answered in is kept in
  // the local session memory, so the next local turn joins it in order
  const until = Date.now() + 10 * 60_000;
  const tick = setInterval(() => {
    const j = getMessageJob(jobId);
    if (!j || j.status === 'error' || Date.now() > until) { clearInterval(tick); return; }
    if (j.status === 'ready' && j.result?.text) {
      clearInterval(tick);
      recordAskTurn(j.result.sessionId || sessionId, { q: question, a: j.result.text, provider: 'claude' }).catch(() => {});
    }
  }, 1000);
  tick.unref?.();
}

// What Claude must be told about a conversation the model on this Mac took
// part in: a session it OPENED is one Claude has never seen (start fresh,
// carrying what was said); a Claude session it answered in since Claude last
// did gets those turns as plumbing in front of the question.
function withLocalHistory(opts) {
  const sid = opts.sessionId || null;
  if (!sid) return opts;
  if (isLocalOnlySession(sid)) {
    const said = transcriptOf(sessionTurns(sid));
    return { ...opts, sessionId: null, carried: said ? `CARRIED OVER (this conversation was answered on the small model on his Mac until now; what was said, in order): ${said}` : '' };
  }
  const missed = localTurnsSinceClaude(sid);
  if (!missed.length) return opts;
  return { ...opts, carried: `Since your last turn the small model on his Mac answered him here: ${transcriptOf(missed, { maxChars: 1200 })}` };
}

async function escalateCoach(carrier, vaultPath, opts, localError, reason) {
  const firstWhy = /^the model on this Mac could not answer/.test(reason)
    ? `The model on this Mac could not answer first: ${localError}.`
    : `The model on this Mac handed this to Claude (${reason}).`;
  console.log(`coach: ${reason}; Claude answers on the same job`);
  carrier.partial = 'Handing this to Claude…';
  let claudeJob = null;
  try {
    claudeJob = getMessageJob(await startClaudeCoachTurn(vaultPath, withLocalHistory(opts)));
  } catch (e) {
    failCarrier(carrier, `${e.message} ${firstWhy}`);
    return;
  }
  if (!claudeJob) { failCarrier(carrier, `Claude could not be asked. ${firstWhy}`); return; }
  becomeViewOf(carrier, claudeJob, {
    reason,
    firstWhy,
    onReady: (cj) => recordAskTurn(cj.result.sessionId, { q: opts.question, a: cj.result.text, provider: 'claude' }).catch(() => {}),
  });
}

// Returns the job id of the Coach's answer, whoever gives it.
export async function startCoachTurn(vaultPath, opts = {}) {
  const { question, consulted = null, claudeOnly = false } = opts;
  if (!consulted && !claudeOnly && providerFor('coach') === 'local' && !wantsChange(question)) {
    // the lane guard, as Claude's path has it: another lane's id is never the Coach's
    let sessionId = opts.sessionId || null;
    if (sessionId) {
      const g = sessionOwnerGuard(sessionId, 'coach');
      if (g.reason) { console.log(`coach: fresh session — ${g.reason}`); sessionId = null; }
    }
    const local = { ...opts, sessionId };
    const jobId = startCoachLocal(vaultPath, { question, sessionId, liveSession: opts.liveSession || null, where: opts.where || null, spoken: opts.spoken === true });
    const job = getMessageJob(jobId);
    if (job) holdForEscalation(job, { lane: 'coach', escalate: (carrier, localError, reason) => escalateCoach(carrier, vaultPath, local, localError, reason) });
    return jobId;
  }
  const claudeOpts = consulted ? opts : withLocalHistory(opts);
  const jobId = await startClaudeCoachTurn(vaultPath, claudeOpts);
  if (!consulted && opts.sessionId && sessionTurns(opts.sessionId).length) remember(jobId, opts.sessionId, question);
  return jobId;
}

// Claude's Coach. A resumed conversation gets the volatile picture as a live
// line; a new one gets the full assembly.
// `consulted` (lib/consult.js): another agent is asking — a fresh session with
// the same full picture, answering that agent, stamping nothing on his behalf.
// `carried`: what the model on this Mac said in this conversation
// (withLocalHistory above), so Claude never answers blind to it.
async function startClaudeCoachTurn(vaultPath, { question, sessionId = null, liveSession = null, consulted = null, where = null, spoken = false, carried = '' } = {}) {
  const { liveSessionContext, coachLiveLine } = await import('./coach.js');
  const live = liveSessionContext(liveSession);
  // WHERE HE IS (lib/register.js): the gym's one-sentence register, or the
  // car's two; '' for the desk and the phone. A consult never carries it.
  const { whereLine } = await import('./register.js');
  const placeLine = consulted ? '' : whereLine(where?.place);
  // a consult is another agent asking, never a spoken turn of his
  const speakFirst = consulted ? '' : speakFirstLine(spoken);
  // DEPTH FOLLOWS THE QUESTION (his call, 18 Oct 2026: "prioritise depth when
  // necessary and needed for answers, unless they are simple changes or quick
  // responses"). Anything but a simple change or a quick fact thinks at the
  // deep effort (claudeCode.js DEEP_EFFORT); intentRouter.js coachDepth.
  const deep = !consulted && coachDepth(question) !== 'quick';
  // THE LANE GUARD (lib/askSession.js): an id recorded for Nova or the
  // Leader is never resumed as the Coach's. Fresh session, full picture.
  if (sessionId && !consulted) {
    const g = sessionOwnerGuard(sessionId, 'coach');
    if (g.reason) { console.log(`coach: fresh session — ${g.reason}`); sessionId = null; }
  }
  let rolled = null;
  let carry = '';
  if (sessionId && !consulted) {
    rolled = await rollReason(vaultPath, sessionId).catch(() => null);
    if (rolled) {
      console.log(`coach: session rolled (${rolled.why})`);
      carry = await carryLine(vaultPath, sessionId, rolled).catch(() => '');
      lastLive.delete(sessionId);
      sessionId = null;
    }
  }
  if (sessionId) {
    const fresh = await coachLiveLine(vaultPath).catch(() => '');
    const preamble = [liveDelta(sessionId, fresh), live ? `[${live}]` : '', carried ? `[${carried}]` : '', placeLine, speakFirst].filter(Boolean).join('\n');
    const q = preamble ? `${preamble}\n\n${question}` : question;
    // `asked` is his question alone — the text his cards carry, never the preamble
    return startAskCoach(vaultPath, { question: q, asked: question, sessionId, deep });
  }
  // A CONSULTED COACH REUSES ITS ONE CONSULT SESSION (claudeCode.js
  // claimConsultSession): a resumed consult carries the live changes and the
  // question, never the 88k-character assembly again.
  const claim = consulted ? claimConsultSession('consult-coach') : null;
  if (claim?.resume) {
    const fresh = await coachLiveLine(vaultPath).catch(() => '');
    const preamble = [liveDelta(claim.sessionId, fresh), live ? `[${live}]` : ''].filter(Boolean).join('\n');
    return startAskCoach(vaultPath, { question: preamble ? `${preamble}\n\n${question}` : question, asked: question, consulted: { ...consulted, claim } });
  }
  // computed beside the assembly, so the consult session's first turn costs
  // no extra wait to remember what it was shown
  const consultLive = claim ? coachLiveLine(vaultPath).catch(() => '') : null;
      const parts = [];
      const failures = []; // a vanished section must be NAMED, never silent
      if (live) parts.push(live);
      try {
        parts.push(await profileContext(vaultPath)); // who he is, first
      } catch { failures.push('profile'); }
      try {
        // WHERE HE STANDS (bodyComp.js): body fat and the phase verdict,
        // steps, sleep, HRV, weight, all code-computed from 28 days
        const { standingContext: whereHeStands } = await import('./bodyComp.js');
        const standing = await whereHeStands(vaultPath);
        parts.push(standing);
        if (/STRATEGY: He is /.test(standing)) parts.push(STRATEGY_RAISE_RULE);
      } catch { failures.push('standing'); }
      try {
        const { protocolsContext } = await import('./protocols.js');
        parts.push(await protocolsContext(vaultPath));
      } catch { failures.push('protocols'); }
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
      } catch { failures.push('recent sessions'); }
      try {
        // LIFT TRENDS (coach.js liftTrendsContext): every lift trained in the
        // last 12 weeks, weekly best e1RM, the 4-week change and a code-written
        // verdict. Replaced the 12-session estimateE1RMs line (18 Oct 2026),
        // which sent a trend question to Grep the raw logs. loadSessions has
        // no date filter; liftTrends drops everything older than the window.
        const { liftTrendsContext } = await import('./coach.js');
        const trends = liftTrendsContext(await loadSessions(vaultPath), { today: localDateISO() });
        if (trends) parts.push(trends);
      } catch { failures.push('lift trends'); }
      try {
        const { exercises } = await loadExerciseLibrary(vaultPath);
        const { routines, schedule } = await loadRoutines(vaultPath, exercises);
        const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
        const keys = Object.keys(progressions);
        // the full listing (every exercise, in order, with its muscle), and
        // Coach's cards — the same two blocks every resumed turn carries
        try {
          const { programContext, coachCardsContext } = await import('./coach.js');
          parts.push(await programContext(vaultPath));
          parts.push(await coachCardsContext());
        } catch {
          parts.push(`Routines: ${routines.map((r) => r.name).join(', ') || 'none'}. Schedule: ${JSON.stringify(schedule)}.`);
        }
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
      // ANATOMY — his instruction, 8 Sep 2026: the Coach must have intricate
      // expertise of the muscles, and it must be the SAME anatomy the 3D model
      // is built from, so anything named here he can see highlighted on the
      // figure. Narrowed to what the question is about; the whole atlas would
      // crowd out his own history, which matters more.
      try {
        const { anatomyContext, focusFor } = await import('./anatomy.js');
        const focus = focusFor(`${question || ''} ${liveSession ? JSON.stringify(liveSession).slice(0, 400) : ''}`);
        if (focus.length) parts.push(anatomyContext(focus));
      } catch { failures.push('anatomy'); }
      try {
        const { makeupContext } = await import('./makeupDay.js');
        const mk = await makeupContext();
        if (mk) parts.push(mk);
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
      // THE RESEARCH HE DELEGATED, WITH ITS REPORT. His ask, 21 Sep: go
      // "directly back to coach and have it summarise the data and information
      // and results from its actions and work", then make the changes. The
      // Coach can only do that if the report is in front of it.
      try {
        const { plansContext } = await import('./planFollowUp.js');
        const plans = await plansContext();
        if (plans) parts.push(plans);
      } catch { failures.push('his plans'); }
      // documents already filed to Outputs/Nova (lib/artifacts.js) — so a
      // revision he asks for lands on the real id, never an invented one
      try {
        const { recentArtifactsContext } = await import('./artifacts.js');
        const docs = await recentArtifactsContext(vaultPath);
        if (docs) parts.push(docs);
      } catch { failures.push('his documents'); }

      if (failures.length) {
        // Silent context loss made the Coach blame his logging for a code
        // failure ("if history is thin, say what to log"). Name what's gone —
        // in the fleet's one wording (lib/contextSections.js), which this
        // lane donated.
        const { ABSENT_NOTE } = await import('./contextSections.js');
        parts.push(ABSENT_NOTE(failures.map((label) => ({ label }))));
      }
      if (consulted) {
        // the consult session's first turn: record its live line as sent, so
        // the next consult carries only what changed
        if (claim) liveDelta(claim.sessionId, await consultLive);
        return startAskCoach(vaultPath, { question, context: parts.join('\n\n'), consulted: { ...consulted, claim } });
      }
      if (carry) parts.push(carry);
      if (carried) parts.push(carried);
      if (placeLine) parts.push(placeLine);
      if (speakFirst) parts.push(speakFirst);
      return startAskCoach(vaultPath, { question, context: parts.join('\n\n'), onReady: markRaised || undefined, deep, rolled });
}

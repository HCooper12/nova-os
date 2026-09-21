// A MULTI-STEP GOAL, as an object — the primitive Nova was missing.
//
// His ask: "if I want Nova to watch a video and analyse and research it as
// well as compare it against other empirical research and data online, then I
// want to be able to just go to the Nova chat and ask." That is four agents
// and a synthesis. Until now a request resolved to exactly one lane and the
// rest of the sentence was discarded silently.
//
// The division of labour is the one the platform runs on everywhere else:
// THE MODEL DECOMPOSES, TESTED CODE DECIDES WHETHER THE RESULT MAY RUN.
// Turning a messy sentence into steps is genuinely interpretive. Deciding
// that a step names a real agent, that its dependencies exist, that the whole
// thing cannot cost more than he agreed — none of that is.
//
// Everything here is pure. The validator is the component that makes "I'd
// need a new agent for that" an honest sentence rather than a polite guess,
// so it is the part that must never be wrong, and the part that is easiest to
// get subtly wrong. Hence: no I/O, no model, and a test per rule.

import { CAPABILITIES, DELEGABLE_IDS, ceilingFor } from './capabilities.js';

// HIS DECISIONS, 4 Sep. Both are ceilings he agreed to before seeing a plan,
// so both are enforced here rather than trusted to the planner's prompt — a
// prompt is a request, and this is a limit.
export const MAX_STEPS = 6;

// $6, NOT the $3 I recommended to him. I proposed $3 before summing the real
// per-lane ceilings, and the arithmetic then killed his own headline example:
// the video request is Watcher ($3) + Researcher ($1) + Researcher ($1) = $5,
// which $3 rejects outright. A limit that forbids the exact thing he asked
// for is a number I got wrong, not a constraint he chose.
//
// $6 admits that plan and watch + research + study ($5.50), and still refuses
// a book ($25) — which stays deliberately un-plannable and has to be asked for
// on its own.
//
// The figure is a SUM OF WORST CASES, not an estimate: each lane contributes
// its own budget cap, so a real run almost always costs less. That is the
// right direction to be wrong in when the number is shown to him for approval
// — the plan cannot exceed what he agreed to.
//
// SINCE 21 SEP 2026 THIS IS A SOFT LINE, NOT A REFUSAL. See validatePlan.
export const MAX_PLAN_USD = 6;

// A plan is PROPOSED and waits for him. His decision: a plan spends real
// money across several agents, so it never runs on Nova's own say-so. The
// trust ladder that governs every other lane was built for exactly this, and
// this lane starts at the bottom of it.
export const PLAN_STATUSES = ['proposed', 'approved', 'running', 'done', 'failed', 'rejected'];

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Validate a proposed plan. Returns { ok, errors, ceilingUsd }.
//
// `errors` are sentences meant for HIM, not for a log. When Nova cannot do
// something, what he asked for is to be told what is missing — so the message
// has to name the thing, not the rule number.
export function validatePlan(plan) {
  const errors = [];
  const steps = Array.isArray(plan?.steps) ? plan.steps : null;

  if (!steps || steps.length === 0) {
    return { ok: false, errors: ['there is nothing to run — no steps were proposed'], ceilingUsd: 0 };
  }
  if (steps.length > MAX_STEPS) {
    errors.push(`that needs ${steps.length} steps and the ceiling is ${MAX_STEPS} — narrow it down or split it in two`);
  }

  const seen = new Set();
  for (const [i, s] of steps.entries()) {
    const where = s?.id ? `step "${s.id}"` : `step ${i + 1}`;
    if (!isPlainObject(s)) { errors.push(`${where} is not a step`); continue; }
    if (!s.id || typeof s.id !== 'string') { errors.push(`${where} has no id`); continue; }
    if (seen.has(s.id)) errors.push(`two steps share the id "${s.id}"`);
    seen.add(s.id);

    if (!s.capability) {
      errors.push(`${where} does not say which agent should do it`);
    } else if (!Object.hasOwn(CAPABILITIES, s.capability)) {
      // THE SENTENCE HE ASKED FOR. Not "invalid capability" — what is missing.
      errors.push(`nothing here can "${s.capability}" — that would need a new agent`);
    } else if (!DELEGABLE_IDS.includes(s.capability)) {
      const c = CAPABILITIES[s.capability];
      errors.push(`${c.agent} is yours to ask directly — Nova does not put work on it as part of a plan`);
    }
  }

  // dependencies must exist, must not be self-referential, and must not cycle
  const ids = new Set(steps.map((s) => s?.id).filter(Boolean));
  for (const s of steps) {
    const needs = Array.isArray(s?.needs) ? s.needs : [];
    for (const n of needs) {
      if (n === s.id) errors.push(`step "${s.id}" waits on itself`);
      else if (!ids.has(n)) errors.push(`step "${s.id}" waits on "${n}", which is not in the plan`);
    }
  }
  if (!errors.some((e) => /waits on/.test(e)) && hasCycle(steps)) {
    errors.push('the steps depend on each other in a loop, so none of them could start');
  }

  const ceilingUsd = ceilingFor(steps.map((s) => s?.capability).filter(Boolean));
  // COST NEVER REFUSES A PLAN. His instruction, 21 Sep 2026: "I don't want
  // any caps for usage when it comes to things like researching." The number
  // is still computed and still shown before he approves — that is what the
  // yes is for — and a plan above the soft line says so in its own words so
  // he approves it knowing. What he pays for is his decision; a validator
  // that vetoed it was making a decision that was never Nova's to make.
  // (The book stays un-plannable for a different reason: it is a $25 job of
  // its own kind, and capabilities.js says so. The ceiling here is honest.)
  const overSoftCap = ceilingUsd > MAX_PLAN_USD;

  return { ok: errors.length === 0, errors, ceilingUsd, overSoftCap };
}

// The line the plan card shows about money. Plain, and different above the
// soft line — "this is more than usual" is information, not a refusal.
export function costLine(ceilingUsd, overSoftCap = ceilingUsd > MAX_PLAN_USD) {
  const n = `US$${Number(ceilingUsd || 0).toFixed(2)}`;
  return overSoftCap
    ? `Up to ${n} — above the usual $${MAX_PLAN_USD.toFixed(2)} for one plan, so this is your call. Worst case, every agent at its own ceiling; a step that reaches its own ceiling pauses and asks before spending more.`
    : `Up to ${n} — worst case, every agent at its own ceiling. A step that reaches its ceiling pauses and asks before spending more.`;
}

function hasCycle(steps) {
  const needs = new Map(steps.map((s) => [s?.id, Array.isArray(s?.needs) ? s.needs : []]));
  const state = new Map(); // undefined = unvisited, 1 = in progress, 2 = settled
  const walk = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const n of needs.get(id) || []) if (needs.has(n) && walk(n)) return true;
    state.set(id, 2);
    return false;
  };
  for (const id of needs.keys()) if (walk(id)) return true;
  return false;
}

// Execution order, in WAVES. Each wave is the set of steps whose dependencies
// are all satisfied, so a plan with two independent research steps runs them
// together instead of pointlessly in sequence — his video example has three
// steps that can all start the moment the transcript exists.
//
// Returns [] for a plan with a cycle; validatePlan rejects those first, and
// returning an empty schedule rather than looping forever is the safe way to
// fail if it is ever called on an unvalidated plan.
export function schedule(steps = []) {
  const remaining = new Map(steps.map((s) => [s.id, s]));
  const done = new Set();
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((s) =>
      (Array.isArray(s.needs) ? s.needs : []).every((n) => done.has(n)));
    if (!ready.length) return []; // cyclic or unsatisfiable — never spin
    waves.push(ready.map((s) => s.id));
    for (const s of ready) { done.add(s.id); remaining.delete(s.id); }
  }
  return waves;
}

// What he sees before approving. Deliberately plain: the agent, what it will
// do, and what it is waiting for — not a JSON dump with a confirm button.
export function describePlan(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  return steps.map((s, i) => {
    const c = CAPABILITIES[s.capability];
    const waits = (Array.isArray(s.needs) ? s.needs : []).length
      ? ` (after ${s.needs.join(', ')})` : '';
    return `${i + 1}. ${c ? c.agent : s.capability}${waits} — ${s.what || c?.summary || ''}`;
  });
}

// WHAT A STEP NEEDED AND DID NOT GET. Before this, a step whose dependency
// failed was dispatched anyway: handoffFor filtered the missing output out and
// interpolate left the raw "{{s2}}" sitting in the instruction, so the agent
// was asked to summarise a document nobody had written. It answered — they
// always answer — and the next step built on that, and the report counted all
// three as completed. A hole two layers down, presented as coverage.
//
// So a step is SKIPPED when something it declared it needed produced nothing.
// Skipped is settled (it is not coming back) but it is not completed, and the
// report is told which dependency took it down.
export function unmetNeeds(step, outputs = {}) {
  const needs = Array.isArray(step?.needs) ? step.needs : [];
  return needs.filter((id) => !outputs[id]);
}

export function skipReason(ids = []) {
  if (!ids.length) return '';
  return ids.length === 1
    ? `it needed ${ids[0]}, which produced nothing`
    : `it needed ${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}, which produced nothing`;
}

// A plan is finished when every step has settled. A plan whose steps all ran
// but whose REPORT failed is not done — the report is the deliverable, and
// four fragments are what he already had.
//
// PARTIAL COMPLETION IS A FIRST-CLASS OUTCOME. He walks away; a step fails;
// what actually ran must still reach him, and must be counted honestly. Three
// settled states, and only one of them is completion:
//   done    — it ran and produced something
//   failed  — it ran and did not
//   skipped — it never ran, because what it needed failed
// Coverage used to read `total - failed`, which counted a skipped step and a
// step still waiting as completed. It now counts DONE, which is the only
// number that survives being checked.
export function planProgress(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const of = (st) => steps.filter((s) => s.status === st);
  const done = of('done');
  const failed = of('failed');
  const skipped = of('skipped');
  const settled = done.length + failed.length + skipped.length;
  const lost = [
    failed.length ? `${failed.length} failed` : '',
    skipped.length ? `${skipped.length} skipped for want of them` : '',
  ].filter(Boolean).join(', ');
  return {
    total: steps.length,
    settled,
    done: done.map((s) => s.id),
    failed: failed.map((s) => s.id),
    skipped: skipped.map((s) => s.id),
    allSettled: steps.length > 0 && settled === steps.length,
    // Nothing got through at all is a different answer from a partial one, and
    // a report that opens "here is what I found" on top of it would be fiction.
    empty: steps.length > 0 && done.length === 0,
    partial: done.length > 0 && done.length < steps.length,
    // Coverage is a FINDING, never a footnote — the Study lane's rule, applied
    // to plans. A report built on three of four steps must say so in its first
    // line rather than present a fraction as a whole.
    coverage: steps.length
      ? `${done.length} of ${steps.length} steps completed${lost ? ` (${lost})` : ''}`
      : 'nothing ran',
  };
}

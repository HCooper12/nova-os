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
  if (ceilingUsd > MAX_PLAN_USD) {
    // Name the expensive step. "Too expensive" is not actionable; "the book
    // is $25 on its own" tells him what to drop or approve separately.
    const worst = [...steps].filter((s) => CAPABILITIES[s?.capability])
      .sort((a, b) => CAPABILITIES[b.capability].costUsd - CAPABILITIES[a.capability].costUsd)[0];
    const w = worst ? CAPABILITIES[worst.capability] : null;
    errors.push(
      `that could cost up to $${ceilingUsd.toFixed(2)} and the ceiling for one plan is $${MAX_PLAN_USD.toFixed(2)}`
      + (w && w.costUsd > MAX_PLAN_USD ? ` — ${w.agent} alone is $${w.costUsd.toFixed(2)}, so ask for that one on its own` : ''),
    );
  }

  return { ok: errors.length === 0, errors, ceilingUsd };
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

// A plan is finished when every step has settled. A plan whose steps all ran
// but whose REPORT failed is not done — the report is the deliverable, and
// four fragments are what he already had.
export function planProgress(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const settled = steps.filter((s) => s.status === 'done' || s.status === 'failed');
  const failed = steps.filter((s) => s.status === 'failed');
  return {
    total: steps.length,
    settled: settled.length,
    failed: failed.map((s) => s.id),
    allSettled: steps.length > 0 && settled.length === steps.length,
    // Coverage is a FINDING, never a footnote — the Study lane's rule, applied
    // to plans. A report built on three of four steps must say so in its first
    // line rather than present a fraction as a whole.
    coverage: steps.length ? `${steps.length - failed.length} of ${steps.length} steps completed` : 'nothing ran',
  };
}

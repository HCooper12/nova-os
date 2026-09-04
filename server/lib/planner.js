// NOVA AS CHIEF OF STAFF — decompose a goal, put agents on the parts, gather
// what comes back, and write the answer.
//
// His framing: "Nova is performing as the CEO who would delegate tasks like
// research and analysing to specific agents. Once their tasks are done Nova
// should collect all of it and either delegate more tasks, or do that itself,
// to present to me as the final outcome and report."
//
// The model does exactly two things here: DECOMPOSE (a goal into steps) and
// REPORT (several outputs into one answer). Both are interpretation. Every
// decision with consequences — may this run, what will it cost, in what
// order, did it actually finish — is in plan.js and is pure and tested.
//
// A plan never runs on Nova's own say-so. His decision, 4 Sep: a plan spends
// real money across several agents, so it is proposed and waits. The trust
// ladder that governs every other lane was built for exactly this case.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord, getRecord } from './inboxStore.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';
import { describeForPlanner, CAPABILITIES } from './capabilities.js';
import { validatePlan, schedule, planProgress, describePlan, MAX_STEPS, MAX_PLAN_USD } from './plan.js';
import { salvageJson } from './jsonSalvage.js';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';           // the PLANNING call only — the steps carry their own
const STEP_TIMEOUT_MS = 25 * 60_000;    // a step that never settles must not hold the plan forever
const POLL_MS = 5_000;

// The planner's brief. The capability list is GENERATED (capabilities.js), never
// written out here — a planner told about an agent that does not exist is the
// single most likely way this feature embarrasses itself.
export function buildPlannerPrompt(goal) {
  return `You are Nova, planning work for Hayden. Break his request into steps and hand each one to an agent.

HIS REQUEST:
${goal}

THE AGENTS YOU CAN USE — no others exist:
${describeForPlanner()}

RULES
- YOUR OWN SESSION BUDGET IS IRRELEVANT HERE. You are not paying for this work — you are deciding who should do it, and each agent runs later under its own separate budget. Never refuse a plan because you think you cannot afford it.
- At most ${MAX_STEPS} steps. The whole plan must stay under $${MAX_PLAN_USD} using the ceilings above.
- Use the FEWEST steps that genuinely answer him. Two research steps that ask the same question are one step.
- A step that needs another step's output lists it in "needs". Steps with no dependency run together, so do not chain things that could run side by side.
- If part of his request needs something no agent above can do, DO NOT invent a step for it. Put it in "cannot" and say what would be needed.
- If none of it can be done, return an empty steps array and explain in "cannot".

Reply with ONLY this JSON:
{
  "steps": [
    { "id": "s1", "capability": "<one of the agent ids above>", "what": "<what this step does, one line, in plain English>", "input": "<exactly what to hand the agent>", "needs": [] }
  ],
  "cannot": "<empty string, or what you could not cover and what it would need>",
  "report": "<one line: what the final report should answer for him>"
}`;
}

// Pure: model text in, a plan-shaped object out (or null). Exported so the
// parse is testable without spawning anything.
export function parsePlan(text) {
  // Balanced-object extraction plus post-failure repair — the same treatment
  // plan-today needed after seven identical parse failures. A planner that
  // dies on one unescaped quote would refuse work it could plainly do.
  const { value: parsed } = salvageJson(text);
  if (!parsed || typeof parsed !== 'object') return null;
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  return {
    steps: steps.map((s, i) => ({
      id: String(s?.id || `s${i + 1}`),
      capability: String(s?.capability || ''),
      what: String(s?.what || '').trim(),
      input: String(s?.input || '').trim(),
      needs: Array.isArray(s?.needs) ? s.needs.map(String) : [],
      status: 'waiting',
      recordId: null,
      output: null,
    })),
    cannot: String(parsed.cannot || '').trim(),
    report: String(parsed.report || '').trim(),
  };
}

export async function startPlan(vaultPath, goal, { model } = {}) {
  const g = String(goal || '').trim();
  if (!g) throw new Error('a goal is required');
  if (!laneEnabled('planner')) throw laneOffError('planner');

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'plan',
    text: `Plan: ${g}`,
    source: 'planner',
    mode: 'draft',
    status: 'classifying',
    createdAt: new Date().toISOString(),
    goal: g,
    model: model || null,
  });
  planGoal(vaultPath, record.id, g, model);
  return record;
}

function planGoal(vaultPath, recordId, goal, model) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildPlannerPrompt(goal),
    '--permission-mode', 'bypassPermissions',
    // Planning is pure reasoning — it reads the capability list in its prompt
    // and returns JSON. Nothing it could touch would help it, and a planner
    // with tools is a planner that can act before he has approved anything.
    ...boundaryArgs(''),
    '--output-format', 'json',
    '--model', model || modelFor('planner'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  settleWatchdog(child, { label: 'the plan', minutes: 5 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.on('close', async () => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'planning failed');
      const proposed = parsePlan(outer.result);
      if (!proposed) throw new Error('the plan came back unreadable');

      const verdict = validatePlan(proposed);
      // A plan that cannot run is not an error — it is an ANSWER. He asked to
      // be told when something needs work that does not exist yet, so the
      // record lands pending with the shortfall in his words, not in a log.
      // The record has to READ as a plan on the ordinary inbox card — steps,
      // what it could cost, and what it cannot cover. A pending record whose
      // body is a JSON blob is a decision he cannot make.
      const lines = describePlan(proposed);
      const body = verdict.ok
        ? [
          ...lines,
          '',
          `Up to US$${verdict.ceilingUsd.toFixed(2)} — worst case, every agent at its own ceiling.`,
          proposed.cannot ? `\nNot covered: ${proposed.cannot}` : '',
        ].filter(Boolean).join('\n')
        : [
          "I can't run that as it stands:",
          ...verdict.errors.map((e) => `- ${e}`),
          proposed.cannot ? `\nAlso: ${proposed.cannot}` : '',
        ].filter(Boolean).join('\n');

      await updateRecord(recordId, {
        status: 'pending',
        plan: proposed,
        ceilingUsd: verdict.ceilingUsd,
        planOk: verdict.ok,
        blockers: verdict.errors,
        cannot: proposed.cannot || null,
        decision: {
          title: verdict.ok
            ? `Plan: ${goal.slice(0, 60)}${goal.length > 60 ? '…' : ''}`
            : `Can't plan: ${goal.slice(0, 55)}${goal.length > 55 ? '…' : ''}`,
          body,
        },
      });
    } catch (e) {
      await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
    }
  });
  child.on('error', async (err) => {
    await updateRecord(recordId, { status: 'error', error: err.message }).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// RUNNING AN APPROVED PLAN
// ---------------------------------------------------------------------------

// Each step dispatches into the lane that already exists — the Watcher, the
// Researcher, the Study lane — under its own budget, its own boundary and its
// own record. This layer never re-implements an agent; it decides who and
// when, then waits.
async function dispatchStep(vaultPath, step, priorOutputs) {
  const input = interpolate(step.input, priorOutputs);
  if (step.capability === 'watch') {
    const { startVideoWatch } = await import('./watcher.js');
    return startVideoWatch(vaultPath, extractFirstUrl(input) || input, step.what);
  }
  if (step.capability === 'research') {
    const { startResearch } = await import('./researcher.js');
    return startResearch(vaultPath, clampQuestion(input || step.what));
  }
  if (step.capability === 'study') {
    const { startStudy } = await import('./studyLane.js');
    return startStudy(vaultPath, { urls: [extractFirstUrl(input)].filter(Boolean), prose: step.what });
  }
  if (step.capability === 'book') {
    const { startIngest } = await import('./ingest.js');
    const meta = parseTitleAuthor(input);
    if (!meta) throw new Error('could not read a title and author for the Librarian');
    return { id: startIngest(vaultPath)(null, undefined, meta) };
  }
  throw new Error(`no dispatcher for "${step.capability}"`);
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;
export function extractFirstUrl(s) { return (String(s || '').match(URL_RE) || [])[0] || null; }
export function clampQuestion(s) { return String(s || '').trim().slice(0, 500); }
export function parseTitleAuthor(s) {
  const m = /^(.+?)\s+by\s+(.+?)$/i.exec(String(s || '').trim());
  return m ? { title: m[1].trim(), author: m[2].trim() } : null;
}

// A step's input may name an earlier step ("the claims from s1"). Substituting
// the real output keeps the agents ignorant of the plan — each one still
// receives a plain instruction, which is why no lane needed changing.
export function interpolate(input, outputs = {}) {
  return String(input || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, id) => (outputs[id] ? outputs[id] : whole));
}

// Wait for a dispatched record to settle. A step that never finishes must not
// hold the plan open forever — it fails with a reason, and the report says so.
async function awaitRecord(id, { timeoutMs = STEP_TIMEOUT_MS } = {}) {
  const started = Date.now();
  for (;;) {
    const r = await getRecord(id).catch(() => null);
    if (!r) return { ok: false, why: 'the record vanished' };
    if (r.status === 'error') return { ok: false, why: r.error || 'the agent failed' };
    if (r.status === 'pending' || r.status === 'resolved' || r.status === 'filed') {
      return { ok: true, output: summarise(r) };
    }
    if (Date.now() - started > timeoutMs) return { ok: false, why: 'it did not finish in time' };
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

// What one agent hands the next, and eventually the report. Deliberately the
// record's own words — no re-summarising, which is where detail goes to die.
function summarise(record) {
  const d = record.decision || {};
  return [d.title, d.body || d.summary, record.text].filter(Boolean).join('\n').slice(0, 6000);
}

export async function runPlan(vaultPath, recordId) {
  const record = await getRecord(recordId);
  if (!record?.plan) throw new Error('that plan has nothing to run');
  if (!record.planOk) throw new Error('that plan did not pass its checks');
  const plan = record.plan;
  const waves = schedule(plan.steps);
  await updateRecord(recordId, { status: 'classifying', startedAt: new Date().toISOString() });

  const outputs = {};
  for (const wave of waves) {
    // a wave runs together — his video example checks claims and
    // counter-evidence side by side rather than one after the other
    await Promise.all(wave.map(async (stepId) => {
      const step = plan.steps.find((s) => s.id === stepId);
      try {
        const created = await dispatchStep(vaultPath, step, outputs);
        step.recordId = created?.id || null;
        step.status = 'running';
        await updateRecord(recordId, { plan });
        const settled = await awaitRecord(step.recordId);
        step.status = settled.ok ? 'done' : 'failed';
        step.output = settled.ok ? settled.output : null;
        step.error = settled.ok ? null : settled.why;
        if (settled.ok) outputs[step.id] = settled.output;
      } catch (e) {
        step.status = 'failed';
        step.error = e.message;
      }
      await updateRecord(recordId, { plan });
    }));
  }

  const progress = planProgress(plan);
  await updateRecord(recordId, { plan, coverage: progress.coverage });
  return writeReport(vaultPath, recordId, record.goal, plan, progress);
}

// THE REPORT. A plan without one is just several jobs — this is the step that
// makes it a delegation rather than a dispatch.
export function buildReportPrompt(goal, plan, progress) {
  const parts = plan.steps.map((s) => {
    const c = CAPABILITIES[s.capability];
    if (s.status === 'failed') return `### ${c?.agent || s.capability} — ${s.what}\nFAILED: ${s.error}`;
    return `### ${c?.agent || s.capability} — ${s.what}\n${s.output || '(no output)'}`;
  }).join('\n\n');
  return `You are Nova, reporting back to Hayden on work you delegated.

WHAT HE ASKED FOR:
${goal}

WHAT THE REPORT SHOULD ANSWER:
${plan.report || 'answer his request directly'}

WHAT YOUR AGENTS CAME BACK WITH:
${parts}

RULES
- Open with the answer, not with a description of what you did.
- COVERAGE IS A FINDING, NOT A FOOTNOTE: ${progress.coverage}. If any step failed, say so in the first two lines and say what is therefore unknown — never present a partial answer as a whole one.
- Where the sources disagree, say so and say which is better evidenced.
- Cite what came from where. Do not add claims no agent gave you.
- Plain English. No headings-for-the-sake-of-headings.`;
}

function writeReport(vaultPath, recordId, goal, plan, progress) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', buildReportPrompt(goal, plan, progress),
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(''), // synthesis only — everything it needs is in the prompt
      '--output-format', 'json',
      '--model', modelFor('planner'),
      '--max-budget-usd', '1.0',
      '--session-id', randomUUID(),
    ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    settleWatchdog(child, { label: 'the plan report', minutes: 10 });
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', async () => {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'the report failed');
        await updateRecord(recordId, {
          status: 'pending',
          decision: { title: `Report: ${goal.slice(0, 70)}`, body: String(outer.result || '').trim() },
          finishedAt: new Date().toISOString(),
        });
        resolve({ ok: true });
      } catch (e) {
        // The steps ran and their records exist — losing the synthesis must
        // not lose the work, so the plan stays pending with the reason.
        await updateRecord(recordId, { status: 'pending', error: `the report failed: ${e.message}` }).catch(() => {});
        resolve({ ok: false, error: e.message });
      }
    });
    child.on('error', async (err) => {
      await updateRecord(recordId, { status: 'pending', error: `the report failed: ${err.message}` }).catch(() => {});
      resolve({ ok: false, error: err.message });
    });
  });
}

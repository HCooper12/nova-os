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
import { describeForPlanner, CAPABILITIES } from './capabilities.js';
import { validatePlan, schedule, planProgress, describePlan, unmetNeeds, skipReason, costLine, MAX_STEPS, MAX_PLAN_USD } from './plan.js';
import { salvageJson } from './jsonSalvage.js';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const POLL_MS = 5_000; // how often the plan checks on a step it is waiting for — never how long it waits

// The planner's brief. The capability list is GENERATED (capabilities.js), never
// written out here — a planner told about an agent that does not exist is the
// single most likely way this feature embarrasses itself.
export function buildPlannerPrompt(goal, { inherited = [] } = {}) {
  const held = (inherited || []).filter((m) => m && m.output);
  const material = held.length
    ? `\nMATERIAL ALREADY IN HAND — from work that has ALREADY RUN (do not commission it again; it is handed automatically to every step you write, so steps may build on it):\n${held.map((m, i) => `${i + 1}. ${m.label}: ${String(m.output).slice(0, 700).replace(/\s+/g, ' ')}…`).join('\n')}\n`
    : '';
  return `You are Nova, planning work for Hayden. Break his request into steps and hand each one to an agent.

HIS REQUEST:
${goal}
${material}
THE AGENTS YOU CAN USE — no others exist:
${describeForPlanner()}

RULES
- YOUR OWN SESSION BUDGET IS IRRELEVANT HERE. You are not paying for this work — you are deciding who should do it, and each agent runs later under its own separate budget. Never refuse a plan because you think you cannot afford it, and never trim a plan to save money — he decides what it is worth when he sees the ceiling.
- At most ${MAX_STEPS} steps. Anything above $${MAX_PLAN_USD} is fine; it is shown to him and he decides.
- HIS OWN DATA FIRST. If the request is about HIS program, HIS training, HIS nutrition, HIS numbers, HIS history: the first step is the program dossier (free, instant, it reads the vault), and the Coach is the step that judges anything against it. ALWAYS include a fresh dossier step even when an older dossier is in the material above — it is free, and his program changes between runs (a follow-on plan on 21 Sep reasoned from a stale one). A Researcher never sees his data unless a step hands it over; put the dossier in "needs" of every step that must know his program.
- Use the FEWEST steps that genuinely answer him. Two research steps that ask the same question are one step.
- A step that needs another step's output lists it in "needs". Steps with no dependency run together, so do not chain things that could run side by side.
- END WITH JUDGEMENT WHEN HE ASKED FOR A VERDICT. "Review my program", "what should I change", "is X too much for me" — the last step is the Coach, needing the dossier and every research step, so the report can name concrete changes to HIS program rather than general findings.
- If part of his request needs something no agent above can do, DO NOT invent a step for it. Put it in "cannot" and say what would be needed. Reading his own data is never in "cannot" — the dossier and the Coach do that.
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

// WHAT A FINISHED PLAN HANDS TO THE NEXT ONE. Every step that produced
// something, labelled by agent and task, so a follow-on plan ("now check
// that against my program") builds on the work instead of paying for it
// twice. Pure.
export function inheritedFrom(record) {
  const steps = Array.isArray(record?.plan?.steps) ? record.plan.steps : [];
  const out = steps.filter((s) => s.status === 'done' && s.output).map((s) => ({
    label: `${CAPABILITIES[s.capability]?.agent || s.capability} — ${s.what}`,
    output: String(s.output),
  }));
  const report = String(record?.decision?.payload?.body || '').trim();
  if (record?.finishedAt && report) out.push({ label: `Nova's report on "${String(record.goal || '').slice(0, 80)}"`, output: report });
  return out;
}

export async function startPlan(vaultPath, goal, { model, buildsOn = null, inherited = null, amends = null } = {}) {
  const g = String(goal || '').trim();
  if (!g) throw new Error('a goal is required');
  if (!laneEnabled('planner')) throw laneOffError('planner');

  // a follow-on plan inherits the finished work it names
  let held = Array.isArray(inherited) ? inherited : [];
  if (buildsOn && !held.length) {
    const prior = await getRecord(String(buildsOn)).catch(() => null);
    if (prior?.kind === 'plan') held = inheritedFrom(prior);
  }

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
    buildsOn: buildsOn || null,
    amends: amends || null,
    inherited: held.length ? held.map((m) => ({ label: m.label, output: String(m.output).slice(0, 8000) })) : null,
  });
  planGoal(vaultPath, record.id, g, model, held);
  return record;
}

// HIS CORRECTION TO A PLAN. The old plan is retired, the new one is planned
// from his request PLUS his words, and anything the old plan had already
// produced travels with it. Deterministic — nothing here interprets what he
// meant; the planner does, with the correction in front of it.
export async function amendPlan(vaultPath, recordId, note) {
  const prior = await getRecord(recordId);
  if (!prior || prior.kind !== 'plan') throw new Error('that is not a plan');
  const correction = String(note || '').trim();
  if (!correction) throw new Error('an amendment needs his words');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const goal = `${String(prior.goal || prior.text || '').replace(/^Plan:\s*/, '')}\n\nHIS CORRECTION (${stamp} UTC), which overrides anything above that conflicts with it: ${correction}`;
  const next = await startPlan(vaultPath, goal, { model: prior.model || undefined, inherited: inheritedFrom(prior), amends: prior.id });
  // a proposal he has not run is retired; a plan that ran keeps its record
  // and its report, and simply points at what replaced it
  const ran = prior.finishedAt || (prior.plan?.steps || []).some((s) => s.status && s.status !== 'waiting');
  await updateRecord(prior.id, ran
    ? { supersededBy: next.id }
    : { status: 'discarded', discardedAt: new Date().toISOString(), supersededBy: next.id, declineReason: 'replaced by the amended plan', error: null });
  return next;
}

function planGoal(vaultPath, recordId, goal, model, inherited = []) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildPlannerPrompt(goal, { inherited }),
    '--permission-mode', 'bypassPermissions',
    // Planning is pure reasoning — it reads the capability list in its prompt
    // and returns JSON. Nothing it could touch would help it, and a planner
    // with tools is a planner that can act before he has approved anything.
    ...boundaryArgs(''),
    '--output-format', 'json',
    '--model', model || modelFor('planner'),
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
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
          costLine(verdict.ceilingUsd, verdict.overSoftCap),
          proposed.cannot ? `\nNot covered: ${proposed.cannot}` : '',
          '',
          'Approve = run it. You can correct it first by simply saying so; the plan is re-drawn with your words. The report comes back to this conversation.',
        ].filter((l) => l !== null && l !== undefined && l !== false).join('\n')
        : [
          "I can't run that as it stands:",
          ...verdict.errors.map((e) => `- ${e}`),
          proposed.cannot ? `\nAlso: ${proposed.cannot}` : '',
        ].filter(Boolean).join('\n');

      await updateRecord(recordId, {
        status: 'pending',
        plan: proposed,
        ceilingUsd: verdict.ceilingUsd,
        overSoftCap: !!verdict.overSoftCap,
        planOk: verdict.ok,
        blockers: verdict.errors,
        cannot: proposed.cannot || null,
        decision: {
          title: verdict.ok
            ? `Plan: ${goal.replace(/\n[\s\S]*$/, '').slice(0, 60)}${goal.length > 60 ? '…' : ''}`
            : `Can't plan: ${goal.slice(0, 55)}${goal.length > 55 ? '…' : ''}`,
          reason: verdict.ok ? 'Approve = run the plan (it costs money; the ceiling is stated). Discard = drop it.' : 'Approve = file this as read.',
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
// Material a plan INHERITED (from the plan it amends or builds on) travels to
// every step that takes context, after the step's own handoff. Pure.
export function inheritedText(record) {
  const held = Array.isArray(record?.inherited) ? record.inherited : [];
  return held.filter((m) => m?.output).map((m) => `FROM EARLIER WORK — ${m.label}:\n${m.output}`).join('\n\n');
}

async function dispatchStep(vaultPath, step, priorOutputs, record = null) {
  const input = interpolate(step.input, priorOutputs);
  const parentPlanId = record?.id || null;
  const inherited = inheritedText(record);
  const missing = missingInputsNote(step, record?.plan);
  const withInherited = (handoff) => [missing, handoff, inherited].filter(Boolean).join('\n\n') || undefined;
  if (step.capability === 'watch') {
    const { startVideoWatch } = await import('./watcher.js');
    // a Watcher needs a URL, which interpolation supplies; its question is
    // capped at 500 chars, so no prior verdict is folded into it
    return startVideoWatch(vaultPath, extractFirstUrl(input) || input, step.what);
  }
  if (step.capability === 'research') {
    const { startResearch } = await import('./researcher.js');
    // The question stays short and re-runnable; EVERYTHING this step depends
    // on travels as context. Interpolating a 4k verdict into a 500-char
    // question was how plan 7bf8cee7 lost the Watcher's claims on the way.
    return startResearch(vaultPath, clampQuestion(stripPlaceholders(step.input) || step.what), {
      context: withInherited(handoffFor(step, priorOutputs, { all: true })),
      parentPlanId,
    });
  }
  if (step.capability === 'program') {
    // HIS PROGRAM, BY CODE. Instant, free, and filed as an auto receipt rather
    // than a decision — a dossier is derived data, not something he approves.
    const { buildProgramDossier } = await import('./programDossier.js');
    const d = await buildProgramDossier(vaultPath);
    const now = new Date().toISOString();
    return createRecord({
      id: randomUUID().slice(0, 8),
      kind: 'program',
      text: d.title,
      source: 'nova',
      mode: 'auto',
      status: 'filed',
      auto: true,
      createdAt: now,
      filedAt: now,
      parentPlanId,
      decision: { route: 'note', confidence: 'high', title: d.title, reason: 'Read from the vault by code for a plan step; nothing was written.', payload: { title: d.title, body: d.body } },
    });
  }
  if (step.capability === 'coach') {
    // THE COACH AS A STEP. A fresh session — the plan's question must not
    // land in the middle of his own ongoing Coach chat — with everything the
    // earlier steps produced as material. The Coach's answer files as a
    // record the plan can await; any program change it proposes lands on
    // the rails exactly as it does from its own room.
    const { startCoachTurn } = await import('./coachTurn.js');
    const { getMessageJob } = await import('./claudeCode.js');
    const handoff = withInherited(handoffFor(step, priorOutputs, { all: true }));
    const question = [
      `[You are answering as one step of a plan Hayden set. Write a full, structured review — this is a report he will read, not a chat turn: no length cap, headings allowed. Ground every judgement in HIS data below; where the material's evidence does not apply to him, say so. End with a numbered list of the concrete changes you recommend, each with the evidence for it.]`,
      stripPlaceholders(step.input) || step.what,
      handoff ? `MATERIAL FROM EARLIER STEPS (research briefs, his program dossier — weigh it against his real data):\n${handoff}` : '',
    ].filter(Boolean).join('\n\n');
    const created = await createRecord({
      id: randomUUID().slice(0, 8),
      kind: 'coach-review',
      text: `Coach review: ${step.what}`,
      source: 'coach',
      mode: 'draft',
      status: 'classifying',
      createdAt: new Date().toISOString(),
      parentPlanId,
    });
    const jobId = await startCoachTurn(vaultPath, { question, sessionId: null });
    // the Coach answers as a job; this turns it into the record the plan waits on
    (async () => {
      for (;;) {
        const job = getMessageJob(jobId);
        if (!job) { await updateRecord(created.id, { status: 'error', error: 'the Coach job vanished' }); return; }
        if (job.status === 'ready') {
          const text = String(job.result?.text || '').trim();
          const title = `Coach review — ${step.what.slice(0, 70)}`;
          await updateRecord(created.id, {
            status: 'pending',
            coachProposal: job.result?.proposal || null,
            decision: {
              route: 'note', confidence: 'high', title,
              reason: 'Approve = keep the Coach\'s review in your vault as a note. Discard = drop it. Any program change it proposed is its own card.',
              payload: { title, body: text || '(the Coach returned nothing)' },
            },
          });
          return;
        }
        if (job.status === 'error') { await updateRecord(created.id, { status: 'error', error: job.error || 'the Coach failed' }); return; }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    })().catch(() => {});
    return created;
  }
  if (step.capability === 'study') {
    const { startStudy } = await import('./studyLane.js');
    const handoff = withInherited(handoffFor(step, priorOutputs));
    return startStudy(vaultPath, { urls: [extractFirstUrl(input)].filter(Boolean), prose: [step.what, handoff].filter(Boolean).join('\n\n') });
  }
  if (step.capability === 'book') {
    const { startIngest } = await import('./ingest.js');
    const meta = parseTitleAuthor(input);
    if (!meta) throw new Error('could not read a title and author for the Librarian');
    return { id: startIngest(vaultPath)(null, undefined, meta) };
  }
  if (step.capability === 'build') {
    const { startBuild } = await import('./builder.js');
    // The brief carries everything: the step's own words plus whatever the
    // steps it depends on came back with, because the Builder has no path into
    // the vault and cannot go looking for the material itself.
    const handoff = withInherited(handoffFor(step, priorOutputs, { all: true }));
    return { id: startBuild([stripPlaceholders(step.input) || step.what, handoff].filter(Boolean).join('\n\n'), { name: step.what }) };
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

// What a step INHERITS from the steps it declared it needs. The model writing
// the plan may or may not remember the {{s1}} placeholder — plan 7bf8cee7 on
// 5 Sep wrote "using the list of claims from the Watcher's verdict" in prose,
// so interpolate had nothing to do and the Researcher was told to check claims
// it did not hold. A declared dependency is honoured by CODE: every output a
// step `needs` (or names) and did not already interpolate is handed over here.
// `all` hands over the named ones too, for lanes that take context separately
// from the instruction (the Researcher) rather than inline.
export function handoffFor(step, outputs = {}, { all = false } = {}) {
  const raw = String(step?.input || '');
  const named = [...raw.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  const needs = Array.isArray(step?.needs) ? step.needs : [];
  const ids = [...new Set([...needs, ...named])].filter((id) => outputs[id]);
  const wanted = all ? ids : ids.filter((id) => !named.includes(id));
  return wanted.map((id) => `FROM ${String(id).toUpperCase()}:\n${outputs[id]}`).join('\n\n');
}

// The instruction with its placeholders removed — for a lane that receives
// the referenced material through its own context channel instead.
export function stripPlaceholders(s) {
  return String(s || '').replace(/\{\{\s*\w+\s*\}\}/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

// Wait for a dispatched record to settle. No working-session cap: a step
// takes as long as it genuinely needs, and the plan waits for it — it never
// gives up on a step that is still honestly working.
async function awaitRecord(id) {
  for (;;) {
    const r = await getRecord(id).catch(() => null);
    if (!r) return { ok: false, why: 'the record vanished' };
    if (r.status === 'error') return { ok: false, why: r.error || 'the agent failed' };
    if (r.status === 'discarded') return { ok: false, why: r.declineReason ? `he stopped it — ${r.declineReason}` : 'he stopped it' };
    if (r.status === 'pending' || r.status === 'resolved' || r.status === 'filed') {
      return { ok: true, output: summarise(r) };
    }
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

// What one agent hands the next, and eventually the report. Deliberately the
// record's own words — no re-summarising, which is where detail goes to die.
export function summarise(record) {
  const d = record?.decision || {};
  // Every lane files its substance under payload.body (the Watcher's verdict,
  // the Researcher's brief, the Study note). Reading d.body — which no lane
  // sets — is how the first real plan handed on a title and nothing else.
  const body = d.payload?.body || d.body || d.summary || '';
  // NOTHING A STEP PRODUCED IS CLIPPED SHORT OF ITS SOURCES. The first two
  // real runs (7f3212b7, 640ca3d2) cut the dossier mid-word through the
  // audit's summary, then cut the Coach's review mid-sentence before its
  // proposal list and both briefs before their Sources — so the report could
  // vouch for ten of forty citations. Four steps at this cap is ~20k tokens
  // for the report call, which it can carry. The cap exists only so a
  // runaway output cannot be a megabyte.
  const cap = 24000;
  return [d.title, body || record?.text].filter(Boolean).join('\n').slice(0, cap);
}

// WHAT A STEP IS TOLD ABOUT INPUTS THAT NEVER ARRIVED. Pure. The plan's
// first real run (7f3212b7, 21 Sep): the Researcher failed its citation
// gate, and the Coach — holding the program dossier and three finished
// briefs — was skipped "for want of s2". A step with SOME of what it needs
// runs on what it has and is told what is missing, so the review he asked
// for happens and says its own gap. A step with NONE of what it needs still
// skips: that is the hole the rule exists for.
export function missingInputsNote(step, plan) {
  const ids = Array.isArray(step?.missing) ? step.missing : [];
  if (!ids.length) return '';
  const lines = ids.map((id) => {
    const s = (plan?.steps || []).find((x) => x.id === id);
    const agent = s ? (CAPABILITIES[s.capability]?.agent || s.capability) : id;
    const why = s?.status === 'failed' ? `FAILED — ${s.error || 'no reason'}` : s?.status === 'skipped' ? `did not run — ${s.error || ''}` : 'produced nothing';
    return `- ${id} (${agent}${s?.what ? `: ${s.what}` : ''}) ${why}`;
  });
  return `INPUTS THAT DID NOT ARRIVE — work with what you have, and say plainly what is therefore unknown; never write round these as though they were settled:\n${lines.join('\n')}`;
}

// One plan runs in one place at a time. A step that pauses and a step that
// finishes can both try to wake the plan in the same second.
const plansRunning = new Set();

export async function runPlan(vaultPath, recordId) {
  const record = await getRecord(recordId);
  if (!record?.plan) throw new Error('that plan has nothing to run');
  if (!record.planOk) throw new Error('that plan did not pass its checks');
  await updateRecord(recordId, { status: 'classifying', startedAt: record.startedAt || new Date().toISOString(), pausedOn: null });
  return resumePlan(vaultPath, recordId);
}

// RESUMABLE, ON PURPOSE. The loop reads the record's own step states and does
// only what is left: a step already done is carried, a step already
// dispatched is awaited (never re-dispatched — that would pay twice), a
// paused step parks the whole plan until he answers its card, and a plan
// woken after that answer walks straight back to where it stopped. This is
// what lets "pause and ask" be honest rather than "fail and restart".
export async function resumePlan(vaultPath, recordId) {
  if (plansRunning.has(recordId)) return { ok: false, error: 'already running' };
  plansRunning.add(recordId);
  try {
    const record = await getRecord(recordId);
    if (!record?.plan) throw new Error('that plan has nothing to run');
    if (record.finishedAt) return { ok: true, already: true };
    const plan = record.plan;
    const waves = schedule(plan.steps);
    if (record.pausedOn) await updateRecord(recordId, { pausedOn: null, status: 'classifying' });

    const outputs = {};
    for (const s of plan.steps) if (s.status === 'done' && s.output) outputs[s.id] = s.output;

    for (const wave of waves) {
      let paused = false;
      // a wave runs together — his video example checks claims and
      // counter-evidence side by side rather than one after the other
      await Promise.all(wave.map(async (stepId) => {
        const step = plan.steps.find((s) => s.id === stepId);
        if (step.status === 'done' || step.status === 'failed' || step.status === 'skipped') return;
        // A STEP DOES NOT RUN ON A HOLE. Its wave came up because the steps it
        // needed all SETTLED — settled is not the same as succeeded. Dispatching
        // anyway hands the agent an instruction with a raw {{s2}} still in it
        // and gets back a confident answer about nothing.
        const unmet = unmetNeeds(step, outputs);
        const needs = Array.isArray(step.needs) ? step.needs : [];
        const hasSomething = needs.length > unmet.length || (record.inherited || []).length > 0;
        if (unmet.length && !hasSomething) {
          step.status = 'skipped';
          step.error = skipReason(unmet);
          await updateRecord(recordId, { plan });
          return;
        }
        // PARTIAL INPUTS RUN, AND ARE NAMED. See missingInputsNote.
        if (unmet.length) step.missing = unmet;
        try {
          if (!step.recordId) {
            const created = await dispatchStep(vaultPath, step, outputs, record);
            step.recordId = created?.id || null;
            step.status = 'running';
            step.error = null;
            await updateRecord(recordId, { plan });
          }
          const settled = await awaitRecord(step.recordId);
          if (settled.paused) {
            step.status = 'paused';
            step.error = `paused at its budget — approve its card in your Inbox to continue, or discard it to stop`;
            paused = true;
            await updateRecord(recordId, { plan });
            return;
          }
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
      if (paused) {
        // PARKED, NOT FAILED. The plan stays live; the startup reaper leaves
        // it alone; the step's own card is what he answers.
        const on = plan.steps.filter((s) => s.status === 'paused').map((s) => s.id).join(', ');
        await updateRecord(recordId, { plan, pausedOn: on, status: 'classifying' });
        return { ok: false, paused: on };
      }
    }

    const progress = planProgress(plan);
    await updateRecord(recordId, { plan, coverage: progress.coverage, pausedOn: null });
    // NOTHING GOT THROUGH IS NOT A REPORT. Asking a model to write him a summary
    // of four failures costs a dollar and invites it to write round the hole —
    // the one thing the coverage rule exists to prevent. Code says what happened.
    if (progress.empty) {
      await finishWith(recordId, record.goal, plan, progress, 'no step produced anything');
      return { ok: false, error: progress.coverage };
    }
    return await writeReport(vaultPath, recordId, record.goal, plan, progress);
  } finally {
    plansRunning.delete(recordId);
  }
}

// THE REPORT. A plan without one is just several jobs — this is the step that
// makes it a delegation rather than a dispatch.
export function buildReportPrompt(goal, plan, progress) {
  const parts = plan.steps.map((s) => {
    const c = CAPABILITIES[s.capability];
    if (s.status === 'failed') return `### ${c?.agent || s.capability} — ${s.what}\nFAILED: ${s.error}`;
    // a skipped step produced nothing because it never ran — saying "(no
    // output)" would read as "it ran and found nothing", which is a claim
    if (s.status === 'skipped') return `### ${c?.agent || s.capability} — ${s.what}\nDID NOT RUN: ${s.error}`;
    if (s.status !== 'done') return `### ${c?.agent || s.capability} — ${s.what}\nDID NOT FINISH.`;
    const partial = Array.isArray(s.missing) && s.missing.length ? ` (ran WITHOUT ${s.missing.join(', ')}, which failed — its gaps are its own)` : '';
    return `### ${c?.agent || s.capability} — ${s.what}${partial}\n${s.output || '(no output)'}`;
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
- COVERAGE IS A FINDING, NOT A FOOTNOTE: ${progress.coverage}. If any step failed or did not run, say so in the first two lines and say what is therefore unknown — never present a partial answer as a whole one. A step that DID NOT RUN found nothing because nobody looked; do not write round it as though its subject were settled.
- Where the sources disagree, say so and say which is better evidenced.
- Cite what came from where. Do not add claims no agent gave you.
- IF A PROGRAM DOSSIER OR A COACH REVIEW IS AMONG THE OUTPUTS, THE REPORT IS ABOUT HIM: name his actual routines, his actual sets, his actual numbers. General findings are only worth stating for what they mean for his program.
- END WITH "## What I would change" — a numbered list of every concrete change worth making, most valuable first, each one specific enough to act on (which routine, which exercise, which number) and each tied to the evidence behind it. Include the changes NOT worth making that he might expect, with why. Then one line: he can say "make change 2", "make all of them" or "argue with number 3" — the Coach applies program changes, and Nova will research anything further.
- Plain English. Headings only where they carry the structure above.`;
}

// The report is the plan's artefact, and approving the finished plan FILES
// it — so the decision has to be one the inbox filer understands (route +
// payload), not a bare title/body. Before 6 Sep 2026 it was bare, and
// approving a finished plan re-ran the plan instead: another ~US$4 and a
// second set of records. Normalising here (and in approveRecord for records
// written before this) closes that.
// The title becomes the vault filename, so the goal's URL comes out of it —
// the first filed report was named after a YouTube address.
export function reportTitle(goal) {
  const clean = String(goal || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').replace(/^[\s—–\-:·]+/, '').trim();
  return `Report: ${(clean || 'plan').slice(0, 70).trim()}`;
}

export function reportDecision(goal, body) {
  const title = reportTitle(goal);
  return {
    route: 'note',
    confidence: 'high',
    title,
    // WHAT APPROVE DOES, and what it does not gate. His report, 21 Sep: the
    // Inbox was the only place the work surfaced, approving it was opaque, and
    // there was no way back into the conversation.
    reason: 'Approve = keep this report in your vault as a note. Discard = drop it. Either way it is already in Nova\'s and the Coach\'s context — ask either to walk you through it, then say which changes to make.',
    payload: { title, body: String(body || '').trim() },
  };
}

// WHAT HE GETS WHEN THE SYNTHESIS DOES NOT ARRIVE.
//
// The old failure path said the right thing in a comment — "losing the
// synthesis must not lose the work" — and then did not do it: the record was
// left pending with an error, no decision, no finishedAt. The steps HAD run.
// Their output was sitting in the record. He walked away for an hour and came
// back to an error message and a Home screen with nothing on it.
//
// So the plan always ends with something he can read. Assembled by code from
// what the steps actually returned: no model, no cost, nothing invented, and
// honest about being the fallback it is.
export function fallbackReport(goal, plan, progress, why) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const lines = [
    progress.empty
      ? 'None of this came back, sir. Nothing below is an answer — it is the record of what was attempted and why each part stopped.'
      : `I could not write up the summary for this one${why ? ` (${why})` : ''}, so here is what the agents came back with, unedited.`,
    '',
    `Coverage: ${progress.coverage}.`,
    '',
  ];
  for (const s of steps) {
    const c = CAPABILITIES[s.capability];
    const head = `## ${c?.agent || s.capability} — ${s.what || 'a step'}`;
    if (s.status === 'done') lines.push(head, s.output || '(it finished but returned nothing)', '');
    else if (s.status === 'failed') lines.push(head, `Failed: ${s.error || 'no reason given'}`, '');
    else if (s.status === 'skipped') lines.push(head, `Did not run — ${s.error || 'what it needed was missing'}`, '');
    else lines.push(head, 'Did not finish.', '');
  }
  return lines.join('\n').trim();
}

function writeReport(vaultPath, recordId, goal, plan, progress) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', buildReportPrompt(goal, plan, progress),
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(''), // synthesis only — everything it needs is in the prompt
      '--output-format', 'json',
      '--model', modelFor('planner'),
      '--session-id', randomUUID(),
    ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', async () => {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'the report failed');
        await updateRecord(recordId, {
          status: 'pending',
          decision: reportDecision(goal, String(outer.result || '').trim()),
          finishedAt: new Date().toISOString(),
        });
        resolve({ ok: true });
      } catch (e) {
        // The steps ran and their records exist — losing the synthesis must
        // not lose the work, so he gets the parts, assembled by code.
        await finishWith(recordId, goal, plan, progress, e.message);
        resolve({ ok: false, error: e.message });
      }
    });
    child.on('error', async (err) => {
      await finishWith(recordId, goal, plan, progress, err.message);
      resolve({ ok: false, error: err.message });
    });
  });
}

// A plan that has stopped is FINISHED, however it stopped. finishedAt is what
// Home reads to know the work is back and waiting — withholding it because the
// summary failed hid the whole plan from the one surface built to show it.
async function finishWith(recordId, goal, plan, progress, why) {
  await updateRecord(recordId, {
    status: 'pending',
    decision: reportDecision(goal, fallbackReport(goal, plan, progress, why)),
    coverage: progress.coverage,
    error: `the report failed: ${why}`,
    finishedAt: new Date().toISOString(),
  }).catch(() => {});
}

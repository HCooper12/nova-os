// A PROJECT JOB, RUN (Projects phase 3, 1 Nov 2026; PROJECTS-PLAN §5).
//
// One job from a project's queue (projectKernel.enqueueJob), run while he is
// not watching. Four kinds, each behind its own allowance:
//   research  the project Researcher (projectResearch.js), unchanged
//   draft     a model writes documents into deliverables/
//   code      a model writes code in the project folder, then code runs the
//             project's own checks, hands failures back, and the Breaker reads
//             the diff (the Code lane's loop, claudeCode.startMessage)
//   test      the project's own checks, no model at all
//
// The rules, kept by code:
//   - THE TOOLS COME FROM THE ALLOWANCES and are blocked at the CLI
//     (--disallowedTools), never asked for in the prompt. No job has push,
//     commit, or any git that rewrites history; code commits, and only when
//     Commit is on.
//   - EVERY MODEL RUN IS BEHIND THE SANDBOX (sandbox.js): writes outside the
//     project folder fail in the kernel. No sandbox, no draft or code job.
//   - A protected folder (Science Atlas, its Mission Control, Wren) is refused
//     before anything spawns.
//   - FABLE ALWAYS ASKS: a project whose model is Fable files a model-choice
//     card and the job waits.
//   - STOP AND ASK: a model that reaches a choice only he can make ends with a
//     NEEDS YOU line; code files the card and the job waits for his answer.
//   - The sandbox lets nothing write outside the folder, so no CLI session is
//     kept. A fix round, and the run after his answer, are FRESH runs handed
//     the task, the answer and the folder as it stands.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { denyAllExcept } from './spawnBoundary.js';
import { modelFor, effortArgs, laneEnabled, laneOffError } from './modelPrefs.js';
import { sandboxed, sandboxAvailable, sandboxUnavailable } from './sandbox.js';
import { isProtectedPath } from './protectedRoots.js';
import { assertWritable } from './projectKernel.js';
import { registerJobMap } from './jobRegistry.js';
import { NOVA_LENS } from './lens.js';

const CLAUDE_BIN = () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

// what is running right now, so a reload waits for it (reload-server.mjs)
const running = registerJobMap('projectJobs', new Map());

export const LANE_FOR = { draft: 'project-draft', code: 'project-build' };
export const FIX_ROUNDS = 2;

// Never a job's, whatever its allowances: history, the network's write verbs,
// the Mac itself. Code makes the commit; nothing here ever pushes.
const SHELL_BLOCKS = [
  'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git reset:*)', 'Bash(git rebase:*)', 'Bash(git checkout:*)',
  'Bash(git restore:*)', 'Bash(git clean:*)', 'Bash(git stash:*)', 'Bash(git switch:*)', 'Bash(git branch -D:*)',
  'Bash(git remote:*)', 'Bash(gh:*)', 'Bash(rm -rf:*)', 'Bash(sudo:*)', 'Bash(launchctl:*)',
  'Bash(curl -X POST:*)', 'Bash(curl -X PUT:*)', 'Bash(curl -X DELETE:*)', 'Bash(npm publish:*)',
];

function refuse(message, code = 'job') { const e = new Error(message); e.code = code; return e; }

/**
 * The tools a job may use, from its kind and the project's allowances. Pure.
 * { allowed, disallowed, shell } — `disallowed` is everything not allowed
 * (spawnBoundary's rule) plus the shell blocks.
 */
export function jobTools(kind, allowances = {}, { shell = true } = {}) {
  if (kind !== 'draft' && kind !== 'code') throw refuse(`a ${kind} job runs no model`);
  const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];
  const withShell = kind === 'code' && shell;
  if (withShell) tools.push('Bash');
  if (allowances.research) tools.push('WebSearch', 'WebFetch');
  const allowed = tools.join(',');
  return { allowed, disallowed: [denyAllExcept(allowed), ...SHELL_BLOCKS].join(','), shell: withShell };
}

/** The model a job runs on, or { ask } when it would be Fable. Pure apart from lane prefs. */
export function jobModel(kind, project, { lanePick = modelFor, fableOk = false } = {}) {
  const lane = LANE_FOR[kind];
  const model = project?.modelOverride || lanePick(lane);
  if (/fable/i.test(String(model)) && !fableOk) return { lane, model, ask: true };
  return { lane, model, ask: false };
}

// THE ASK LINE. The one shape code reads; anything else is an ordinary reply.
const NEEDS_RE = /^\s*NEEDS YOU:\s*(.+?)\s*\|\s*MY PICK:\s*(.+?)\s*$/im;
export function parseNeedsYou(text) {
  const m = NEEDS_RE.exec(String(text || ''));
  if (!m) return null;
  return { question: m[1].slice(0, 400), pick: m[2].slice(0, 400) };
}
export const withoutNeedsLine = (text) => String(text || '').replace(NEEDS_RE, '').trim();

/** What the model is told. Pure. */
export function jobPrompt(project, job, { shell = true, context = '', him = '', fix = null } = {}) {
  const where = job.kind === 'draft'
    ? 'Write what you make as Markdown files in deliverables/ (one file per document, a plain name). Do not change BRIEF.md, LOG.md, DECISIONS.md or research/.'
    : 'Write the code in build/ unless the folder already keeps it elsewhere. Do not change BRIEF.md, LOG.md, DECISIONS.md or research/.';
  const tools = job.kind === 'draft'
    ? 'You have Read, Write, Edit, Glob and Grep, and no shell.'
    : shell
      ? 'You have Read, Write, Edit, Glob, Grep and a shell. Run what you make. Your shell can write only inside this folder (the operating system enforces it); a command that touches anything outside fails, and that is expected.'
      : `You have Read, Write, Edit, Glob and Grep, and no shell (${sandboxUnavailable()}). Write source he can run.`;
  return `You are working on Hayden's project "${project.name}", unattended. He is not watching and cannot answer mid-run.

${NOVA_LENS}

${him ? `${him}\n\n` : ''}THE PROJECT
Goal: ${project.goal}
Done when: ${project.done}
Your working directory is the project's folder. BRIEF.md holds the brief; research/SYNTHESIS.md, when it exists, holds what the research found, with sources. Use them, and name the research file for anything you take from it. Never invent a fact, a price, a measurement or a source.
${context ? `\n${context}\n` : ''}
THIS JOB (${job.kind})
${job.input}
${job.answer ? `\nYou stopped earlier to ask him: "${job.ask?.question || ''}". His answer: "${job.answer}". The folder already holds what you made before; run \`ls\` and read it, and carry on from there.\n` : ''}${fix ? `\n${fix}\n` : ''}
HOW TO WORK
- ${where}
- ${tools}
- Do not commit, push or touch git history. Nova commits by code when he has allowed it.
- If you reach a choice only he can make (his taste, his money, anything that cannot be undone), stop there, leave what you made, and end your reply with exactly one line:
  NEEDS YOU: <the question, plainly> | MY PICK: <your pick, and why in a few words>
  Make every smaller call yourself and write it down.
- Finish with a short reply: what you made (the files), what you checked, and anything still uncertain. Plain words.`;
}

// ---- the run ---------------------------------------------------------------

let deps = null;
export function _setJobDepsForTest(d) { deps = d || null; }

/** One sandboxed CLI run in the folder. Resolves { text, envelope }. */
function cliRun(folder, argv) {
  return new Promise((resolve, reject) => {
    const run = sandboxed(CLAUDE_BIN(), argv, folder);
    const child = spawn(run.cmd, run.args, { cwd: folder, env: run.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      let env = null;
      try { env = JSON.parse(out); } catch { /* not an envelope */ }
      if (env?.is_error) return reject(new Error(String(env.result || 'the run failed').slice(0, 400)));
      if (!env && code !== 0) return reject(new Error((err.trim() || `the run exited with code ${code}`).slice(0, 400)));
      resolve({ text: String(env?.result ?? out).trim(), envelope: env });
    });
  });
}

const D = () => ({
  run: cliRun,
  gates: async (cwd) => {
    const g = await import('./builderGate.js');
    return { gatesFor: g.gatesFor, runGates: g.runGates, causedFailures: g.causedFailures, failureBrief: g.failureBrief, receipt: g.receipt, diffText: g.diffText };
  },
  breaker: async (cwd, ask, diff) => (await import('./claudeCode.js')).breakerPass(cwd, ask, diff),
  research: async (vaultPath, projectId, question) => (await import('./projectResearch.js')).startProjectResearchJob(vaultPath, projectId, question),
  context: async (vaultPath, projectId) => (await import('./projectContext.js')).projectContextSection(vaultPath, projectId).catch(() => ''),
  him: async (vaultPath) => {
    try { return await (await import('./profile.js')).profileContext(vaultPath); } catch (e) { return `ABOUT HAYDEN: (his profile page could not be read: ${e.message})`; }
  },
  spend: async (lane, envelope) => {
    if (!envelope) return;
    const { recordRun, fromEnvelope } = await import('./modelSpend.js');
    recordRun(lane, fromEnvelope(envelope));
  },
  sandbox: sandboxAvailable,
  ...(deps || {}),
});

// where a code job's checks live: build/ when it carries a package.json
function checksDir(folder) {
  const b = path.join(folder, 'build');
  return existsSync(path.join(b, 'package.json')) ? b : folder;
}

const KIND_WORD = { research: 'Research', draft: 'Draft', code: 'Code', test: 'Checks' };

/**
 * Run one job. The caller (projectScheduler) has marked it running.
 * Returns { recordId, done } where `done` resolves to the settled job state:
 * { status:'done'|'failed'|'waiting', error?, ask?, recordId }.
 */
export async function runProjectJob(vaultPath, kernel, projectId, job) {
  const d = D();
  const project = assertWritable(kernel.getProject(projectId));
  if (isProtectedPath(project.folder)) throw refuse('Nova never writes to Science Atlas, its Mission Control or Wren', 'protected');
  if (!project.allowances?.[job.kind]) throw refuse(`${project.name} no longer allows ${job.kind} on its own`, 'allowance');

  if (job.kind === 'research') {
    const question = job.answer ? `${job.input} (his answer to the earlier question: ${job.answer})` : job.input;
    const { record, done } = await d.research(vaultPath, project.id, question);
    const settled = done.then(async () => {
      const { getRecord } = await import('./inboxStore.js');
      const r = await getRecord(record.id);
      return r?.status === 'filed' ? { status: 'done', recordId: record.id } : { status: 'failed', error: r?.error || 'the research did not file', recordId: record.id };
    });
    return { recordId: record.id, done: settled };
  }

  const { createRecord, updateRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8), kind: 'project-job', source: 'nova', mode: 'auto', status: 'classifying',
    text: `${KIND_WORD[job.kind]}: ${job.input.slice(0, 160)}`, createdAt: new Date().toISOString(),
    projectId: project.id, jobId: job.id, jobKind: job.kind, stage: 'Starting',
  });
  const track = { id: record.id, status: 'running', projectId: project.id, jobId: job.id };
  running.set(record.id, track);
  const stage = (s) => updateRecord(record.id, { stage: s }).catch(() => {});

  const done = (async () => {
    if (job.kind === 'test') return runChecksJob(d, kernel, project, job, record, stage);
    return runModelJob(vaultPath, d, kernel, project, job, record, stage);
  })().then(async (out) => {
    track.status = out.status === 'failed' ? 'error' : 'done';
    return { ...out, recordId: record.id };
  }, async (e) => {
    track.status = 'error';
    await updateRecord(record.id, { status: 'error', error: e.message, stage: null }).catch(() => {});
    try { kernel.appendLog(project, `${job.kind} job ${job.id} FAILED: ${e.message}`, { action: 'job' }); } catch { /* the record says it */ }
    return { status: 'failed', error: e.message, recordId: record.id };
  });
  return { recordId: record.id, done };
}

async function runChecksJob(d, kernel, project, job, record, stage) {
  const g = await d.gates();
  const cwd = checksDir(project.folder);
  const gates = g.gatesFor(cwd);
  const { updateRecord } = await import('./inboxStore.js');
  if (!gates.length) {
    await file(updateRecord, record, project, job, { title: `${project.name}: no checks to run`, body: 'The folder has no lint, build or test scripts, so nothing ran.', files: [], commit: null, model: null, costUsd: null });
    kernel.appendLog(project, `test job ${job.id}: no checks to run`, { action: 'job' });
    return { status: 'done' };
  }
  await stage('Running the checks');
  const results = await g.runGates(cwd, { gates, onStage: (s) => stage(s) });
  const failed = results.filter((r) => !r.ok);
  const line = g.receipt({ results, rounds: 0 });
  await file(updateRecord, record, project, job, {
    title: failed.length ? `${project.name}: ${failed.length} check${failed.length === 1 ? '' : 's'} failing` : `${project.name}: every check passed`,
    body: line, files: [], commit: null, model: null, costUsd: null,
    checks: results.map(({ tail, ...r }) => r),
  });
  kernel.appendLog(project, `test job ${job.id}: ${failed.length ? `${failed.map((r) => r.name).join(', ')} failing` : 'all checks passed'}`, { action: 'job' });
  return { status: 'done' };
}

async function runModelJob(vaultPath, d, kernel, project, job, record, stage) {
  const { updateRecord, createRecord } = await import('./inboxStore.js');
  const lane = LANE_FOR[job.kind];
  if (!laneEnabled(lane)) throw laneOffError(lane);
  if (!d.sandbox()) throw refuse(`no ${job.kind} job runs without the sandbox: ${sandboxUnavailable()}`, 'sandbox');
  const pick = jobModel(job.kind, project, { fableOk: job.fableOk === true });
  if (pick.ask) {
    // FABLE ALWAYS ASKS (his rule). The job waits; Approve is his yes to Fable
    // for this one job, and nothing else answers it.
    const ask = { question: `Run this ${job.kind} job on Fable (${pick.model}), as ${project.name} is set to?`, pick: `your call: Fable costs the most; I would use ${modelFor(lane)} unless the job needs Fable's depth. Approve runs it on Fable`, fable: true };
    await updateRecord(record.id, { status: 'filed', filedAt: new Date().toISOString(), auto: true, stage: null, destination: `${project.name}: waiting on your model choice`, decision: { route: 'note', confidence: 'high', title: `${project.name}: waiting on a model choice`, reason: 'Nova never starts Fable on its own.', payload: { projectId: project.id, jobId: job.id } } });
    await fileNeedsYou(createRecord, project, job, ask);
    kernel.appendLog(project, `${job.kind} job ${job.id} waits: Fable needs his yes`, { action: 'job' });
    return { status: 'waiting', ask };
  }
  const tools = jobTools(job.kind, project.allowances, { shell: true });
  const [context, him] = await Promise.all([d.context(vaultPath, project.id), d.him(vaultPath)]);
  const argvFor = (prompt) => [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', tools.allowed, '--disallowedTools', tools.disallowed, '--strict-mcp-config',
    '--output-format', 'json',
    '--model', pick.model, ...effortArgs(lane),
    '--no-session-persistence',
  ];
  let cost = 0;
  const once = async (fix) => {
    const r = await d.run(project.folder, argvFor(jobPrompt(project, job, { shell: tools.shell, context, him, fix })));
    if (r.envelope) { cost += Number(r.envelope.total_cost_usd) || 0; await d.spend(lane, r.envelope); }
    return r.text;
  };

  const before = kernel.changeSnapshot(project);
  await stage(job.kind === 'draft' ? 'Writing the draft' : 'Writing the code');
  let reply = await once(null);
  let checks = null;
  let breakerLine = null;
  let ask = parseNeedsYou(reply);

  if (job.kind === 'code' && !ask) {
    const g = await d.gates();
    const cwd = checksDir(project.folder);
    const gates = g.gatesFor(cwd);
    if (gates.length) {
      await stage('Running the checks');
      let results = await g.runGates(cwd, { gates, onStage: (s) => stage(s) });
      let rounds = 0;
      while (g.causedFailures(results).length && rounds < FIX_ROUNDS) {
        rounds += 1;
        await stage(`Fixing what failed (round ${rounds} of ${FIX_ROUNDS})`);
        reply = await once(`THE CHECKS FAILED after your last run. The folder holds your change.\n${g.failureBrief(results, rounds, FIX_ROUNDS)}`);
        results = await g.runGates(cwd, { gates, onStage: (s) => stage(s) });
      }
      if (!g.causedFailures(results).length) {
        await stage('The Breaker is reading the change');
        const findings = await d.breaker(project.folder, job.input, await g.diffText(project.folder));
        if (findings === null) breakerLine = 'Breaker: the review could not run, so this was not pressure-tested.';
        else if (!findings.found) breakerLine = 'Breaker: found nothing to fix.';
        else {
          await stage('Fixing what the Breaker found');
          reply = await once(`A read-only reviewer read your change against the job and reported:\n${findings.text}\nFix every finding that is real; for one you judge wrong, say why in one line.`);
          results = await g.runGates(cwd, { gates, onStage: (s) => stage(s) });
          breakerLine = `Breaker: found ${findings.count === 1 ? 'one issue' : `${findings.count} issues`}; answered, and the checks ran again.`;
        }
      }
      checks = { results: results.map(({ tail, ...r }) => r), rounds, line: g.receipt({ results, rounds, breaker: breakerLine }) };
    } else checks = { results: [], rounds: 0, line: 'No checks: the folder has no lint, build or test scripts.' };
    ask = parseNeedsYou(reply);
  }

  // code's commit, never the model's, and only with Commit on
  const kept = kernel.commitJob(project, job, { allowed: !!project.allowances?.commit, before });
  const costUsd = cost ? Math.round(cost * 100) / 100 : null;
  const said = withoutNeedsLine(reply);
  const body = [said, checks?.line].filter(Boolean).join('\n\n');
  await file(updateRecord, record, project, job, {
    title: ask ? `${project.name}: ${job.kind} stopped to ask you` : `${project.name}: ${job.kind} done`,
    body, files: kept.files, commit: kept.commit, uncommitted: kept.commit ? null : kept.reason, model: pick.model, costUsd, checks: checks?.results || null,
  });
  if (ask) {
    await fileNeedsYou(createRecord, project, job, ask);
    kernel.appendLog(project, `${job.kind} job ${job.id} stopped to ask: ${ask.question}`, { action: 'job' });
    return { status: 'waiting', ask };
  }
  kernel.appendLog(project, `${job.kind} job ${job.id} done (${pick.model}${costUsd != null ? `, $${costUsd.toFixed(2)}` : ''})`, { action: 'job' });
  return { status: 'done' };
}

// the receipt, written by code from what happened
async function file(updateRecord, record, project, job, { title, body, files, commit, uncommitted = null, model, costUsd, checks = null }) {
  const where = commit ? `committed ${commit.slice(0, 8)}` : files.length ? `${files.length} file${files.length === 1 ? '' : 's'}, not committed (${uncommitted})` : 'nothing changed in the folder';
  await updateRecord(record.id, {
    status: 'filed', filedAt: new Date().toISOString(), auto: true, stage: null,
    destination: `${project.name}: ${where}`,
    decision: {
      route: 'project-job', confidence: 'high', title,
      reason: `${KIND_WORD[job.kind]} job for ${project.name}: ${where}.${model ? ` Ran on ${model}.` : ''}${costUsd != null ? ` $${costUsd.toFixed(2)}.` : ''}`,
      payload: { projectId: project.id, jobId: job.id, kind: job.kind, files, commit, model, costUsd, checks, body },
    },
    undoData: files.length ? { route: 'project-job', projectId: project.id, jobId: job.id, commit, files: commit ? [] : files } : null,
    costUsd, model,
  });
}

/** THE STOP-AND-ASK CARD: the question, Nova's pick; Approve goes with the pick. */
async function fileNeedsYou(createRecord, project, job, ask) {
  return createRecord({
    id: randomUUID().slice(0, 8), kind: 'project-needs-you', source: 'nova', mode: 'draft', status: 'pending',
    text: `${project.name}: ${ask.question}`, createdAt: new Date().toISOString(),
    projectId: project.id, jobId: job.id,
    decision: {
      route: 'project-answer', confidence: 'medium',
      title: `${project.name} needs you: ${ask.question}`,
      reason: ask.fable
        ? `Nova never starts Fable on its own. ${ask.pick[0].toUpperCase()}${ask.pick.slice(1)}; to use another model, change the project's model in its Controls and discard this. The job waits until you do.`
        : `My pick: ${ask.pick}. Approve to go with it, or tell me your answer in the project's conversation. The ${job.kind} job waits until you do.`,
      payload: { projectId: project.id, jobId: job.id, question: ask.question, pick: ask.pick, answer: ask.pick, fable: ask.fable === true },
    },
  });
}

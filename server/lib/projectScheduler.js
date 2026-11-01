// WHEN A PROJECT'S QUEUE RUNS (Projects phase 3; PROJECTS-PLAN §5 and the
// phase 3 settlement of 1 Nov 2026).
//
// His three answers, kept here by code:
//   1. On its own, a project works only OVERNIGHT, inside its window (`quiet`,
//      default 22:00–07:00 Melbourne). He can start the queue any time: the
//      project page's button, a spoken command, Telegram, and
//      POST /api/projects/queue/run (which another host such as Wren may call).
//   2. A job still running when the window closes is LET FINISH. Nothing here
//      ever stops a job; the window only decides what may START.
//   3. A DRY-RUN project never starts queued work on its own; only his press
//      or his spoken yes runs it.
// And the plan's own rules: at most TWO projects working at once (his Mac
// reached load 21 with one heavy job on 19 Oct), one job per project at a
// time, and no automatic start while a conversation turn is in flight (a
// Coach answer, Ask Nova, a Code turn: the claudeCode job map). The Mac's load
// is written down at every start so a week of receipts can say whether two
// can be raised.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inWindow, runnableJobs } from './projectKernel.js';
import { melbourneMinutes } from './quietHours.js';
import { isProtectedPath } from './protectedRoots.js';

export const MAX_WORKING = 2;
export const TICK_MS = 10 * 60_000;
// a job a restart cut off gets one more go, then stays failed and says so
export const MAX_ATTEMPTS = 2;
const WORKING_STAGES = new Set(['idea', 'planning', 'active']);

let deps = null;
export function _setSchedulerDepsForTest(d) { deps = d || null; }

const D = () => ({
  kernel: async (vaultPath) => (await import('./novaProjects.js')).novaKernel(vaultPath),
  runJob: async (vaultPath, k, projectId, job) => (await import('./projectJobs.js')).runProjectJob(vaultPath, k, projectId, job),
  busy: async () => {
    const { activeJobs } = await import('./jobRegistry.js');
    const { byLane } = activeJobs();
    return (byLane.claudeCode || 0) + (byLane.coachPlan || 0) > 0;
  },
  minutes: (at) => melbourneMinutes(at),
  load: () => os.loadavg()[0],
  dataDir: async () => (await import('./novaProjects.js')).dataRoot(),
  ...(deps || {}),
});

/**
 * Which jobs start now. Pure. `projects` with their `queue`s; `force` is his
 * press (window and dry run do not apply); `only` limits it to one project.
 * Returns { start:[{project, job}], held:[{project, why}] }.
 */
export function pickJobs(projects, { minutes, force = false, only = null, max = MAX_WORKING } = {}) {
  const start = [];
  const held = [];
  const live = (projects || []).filter((p) => p && !p.linked && p.status !== 'undone');
  let working = live.filter((p) => (p.queue?.jobs || []).some((j) => j.status === 'running')).length;
  for (const p of live) {
    if (only && p.id !== only) continue;
    const ready = runnableJobs(p.queue);
    if (!ready.length) continue;
    if (!WORKING_STAGES.has(p.stage)) { held.push({ project: p, why: `it is ${p.stage}` }); continue; }
    if (isProtectedPath(p.folder)) { held.push({ project: p, why: 'Nova never writes to Science Atlas, its Mission Control or Wren' }); continue; }
    if ((p.queue.jobs || []).some((j) => j.status === 'running')) { held.push({ project: p, why: 'a job of its own is already running' }); continue; }
    if (!force && p.dryRun) { held.push({ project: p, why: 'it is in dry run: queued work waits for your press' }); continue; }
    if (!force && !inWindow(p.quiet, minutes)) { held.push({ project: p, why: `outside its window (${p.quiet?.from || '22:00'} to ${p.quiet?.to || '07:00'})` }); continue; }
    if (working >= max) { held.push({ project: p, why: `${max} projects are already working` }); continue; }
    start.push({ project: p, job: ready[0] });
    working += 1;
  }
  return { start, held };
}

function loadLog(dataDir, entry) {
  try {
    mkdirSync(path.join(dataDir, 'projects'), { recursive: true });
    appendFileSync(path.join(dataDir, 'projects', 'load.jsonl'), `${JSON.stringify(entry)}\n`);
  } catch { /* a receipt, never a reason to hold work */ }
}

/** The load receipts, newest last: { at, load, working, projectId, jobId }. */
export async function loadReceipts() {
  const d = D();
  try {
    return readFileSync(path.join(await d.dataDir(), 'projects', 'load.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

// settle a job from what its run said
function settle(k, projectId, jobId, out) {
  try {
    const patch = { endedAt: new Date().toISOString(), recordId: out.recordId || null };
    if (out.status === 'waiting') k.updateJob(projectId, jobId, { ...patch, status: 'waiting', ask: out.ask || null, endedAt: null });
    else if (out.status === 'done') k.updateJob(projectId, jobId, { ...patch, status: 'done', error: null });
    else k.updateJob(projectId, jobId, { ...patch, status: 'failed', error: out.error || 'it failed' });
  } catch (e) { console.error(`project job ${jobId} could not be settled: ${e.message}`); }
}

/**
 * One pass. `force` is his press; `projectId` limits it to one project.
 * Returns { started:[{projectId, name, jobId, kind}], held:[{projectId, name, why}], busy }.
 */
export async function runProjectQueues(vaultPath, { force = false, projectId = null, now = new Date() } = {}) {
  const d = D();
  const k = await d.kernel(vaultPath);
  if (!force && await d.busy()) return { started: [], held: [], busy: true };
  const projects = k.listProjects().map((p) => ({ ...p, queue: k.readQueue(p) }));
  const { start, held } = pickJobs(projects, { minutes: d.minutes(now), force, only: projectId });
  const dataDir = await d.dataDir();
  const working = projects.filter((p) => (p.queue?.jobs || []).some((j) => j.status === 'running')).length;
  const started = [];
  for (const { project, job } of start) {
    try {
      k.updateJob(project.id, job.id, { status: 'running', startedAt: now.toISOString(), attempts: (job.attempts || 0) + 1, error: null });
      k.appendLog(project.id, `started ${job.kind} job ${job.id}${force ? ' (his press)' : ' (overnight)'}`, { action: 'job' });
      loadLog(dataDir, { at: now.toISOString(), load: Math.round(d.load() * 100) / 100, working: working + started.length + 1, projectId: project.id, jobId: job.id, kind: job.kind });
      const { recordId, done } = await d.runJob(vaultPath, k, project.id, { ...job, status: 'running' });
      k.updateJob(project.id, job.id, { recordId });
      done.then((out) => settle(k, project.id, job.id, { recordId, ...out }), (e) => settle(k, project.id, job.id, { recordId, status: 'failed', error: e.message }));
      started.push({ projectId: project.id, name: project.name, jobId: job.id, kind: job.kind });
    } catch (e) {
      settle(k, project.id, job.id, { status: 'failed', error: e.message });
      held.push({ project, why: `it could not start: ${e.message}` });
    }
  }
  return {
    started,
    held: held.map((h) => ({ projectId: h.project.id, name: h.project.name, why: h.why })),
    busy: false,
  };
}

/**
 * After a restart: a job marked running has lost its process. Its record says
 * whether it finished; otherwise it goes back in the queue once, then fails
 * plainly. Returns how many were put back and how many failed.
 */
export async function reconcileProjectJobs(vaultPath) {
  const d = D();
  const k = await d.kernel(vaultPath);
  const { getRecord, updateRecord } = await import('./inboxStore.js');
  const out = { requeued: 0, failed: 0, settled: 0 };
  for (const p of k.listProjects()) {
    for (const j of k.readQueue(p).jobs.filter((x) => x.status === 'running')) {
      const r = j.recordId ? await getRecord(j.recordId).catch(() => null) : null;
      if (r && (r.status === 'filed' || r.status === 'pending')) { settle(k, p.id, j.id, { status: 'done', recordId: r.id }); out.settled++; continue; }
      if (r && r.status === 'classifying') await updateRecord(r.id, { status: 'error', error: 'a server restart cut this run off', stage: null }).catch(() => {});
      if ((j.attempts || 1) < MAX_ATTEMPTS) {
        k.updateJob(p.id, j.id, { status: 'queued', error: 'a server restart cut the last run off; it runs again', startedAt: null });
        k.appendLog(p.id, `${j.kind} job ${j.id} cut off by a restart; queued again`, { action: 'job' });
        out.requeued++;
      } else {
        settle(k, p.id, j.id, { status: 'failed', error: 'a server restart cut it off twice; Retry runs it again', recordId: j.recordId });
        out.failed++;
      }
    }
  }
  return out;
}

/** Counted, for the morning: what the projects did since `since`. Null when nothing. */
export async function projectsMorningLine(vaultPath, { since = Date.now() - 12 * 3600e3 } = {}) {
  const d = D();
  let k;
  try { k = await d.kernel(vaultPath); } catch { return null; }
  const bits = [];
  for (const p of k.listProjects()) {
    const jobs = k.readQueue(p).jobs;
    const ended = jobs.filter((j) => j.endedAt && new Date(j.endedAt).getTime() > since);
    const done = ended.filter((j) => j.status === 'done').length;
    const failed = ended.filter((j) => j.status === 'failed').length;
    const waiting = jobs.filter((j) => j.status === 'waiting').length;
    if (!done && !failed && !waiting) continue;
    const parts = [];
    if (done) parts.push(`${done} job${done === 1 ? '' : 's'} finished`);
    if (failed) parts.push(`${failed} failed`);
    if (waiting) parts.push(`${waiting} waiting on you`);
    bits.push(`${p.name}: ${parts.join(', ')}`);
  }
  return bits.length ? `**Projects.** ${bits.join('; ')}.` : null;
}

export function startProjectScheduler(vaultPath) {
  const tick = async () => {
    try {
      const { beat } = await import('./heartbeat.js');
      beat('projects');
    } catch { /* the beat is a convenience */ }
    try {
      const r = await runProjectQueues(vaultPath);
      if (r.started.length) console.log(`project queues: started ${r.started.map((s) => `${s.name}/${s.kind}`).join(', ')}`);
    } catch (e) {
      console.error('project queue tick failed:', e.message);
    }
  };
  reconcileProjectJobs(vaultPath)
    .then((r) => { if (r.requeued || r.failed || r.settled) console.log(`project jobs after restart: ${r.settled} settled, ${r.requeued} queued again, ${r.failed} failed`); })
    .catch((e) => console.error('project job reconcile failed:', e.message))
    .finally(() => { tick(); setInterval(tick, TICK_MS); });
}

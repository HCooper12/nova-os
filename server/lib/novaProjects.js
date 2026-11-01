// NOVA AS A PROJECT HOST (Projects phase 1, 29 Oct 2026; PROJECTS-PLAN §10b).
//
// The kernel (projectKernel.js) is the machinery and knows nothing of Nova.
// This file is Nova's side of it: the host object, the inbox filers that turn
// his yes on a card into a kernel call (with undoData for the rails), the
// stage and settings cards, and the dry-run lift proposal. Every project
// action rides the inbox: kind, status, undoData.

import { isProtectedPath } from './protectedRoots.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeKernel, DRY_RUN_PROJECTS, LENSES, lensOf, assertWritable, vaultName } from './projectKernel.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PROJECTS_ROOT } from './projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');

export function novaKernel(vaultPath = process.env.VAULT_PATH) {
  return makeKernel({ name: 'Nova', projectsRoot: PROJECTS_ROOT(), dataDir: dataRoot(), vaultRoot: vaultPath || null, isProtected: isProtectedPath });
}

const newId = () => randomUUID().replace(/-/g, '').slice(0, 8);

// ---- the filers, reached only from fileDecision (his yes) ------------------

async function fileCreate(vaultPath, payload) {
  const k = novaKernel(vaultPath);
  const { project, files } = k.createProject(payload?.brief);
  let workspace = null;
  if (project.kind === 'build') {
    try {
      const { addProjectWorkspace } = await import('./codeWorkspaces.js');
      const w = await addProjectWorkspace({ slug: project.slug, title: project.name, path: path.join(project.folder, 'build') });
      workspace = w.added ? w.key : null;
      k.updateProject(project.id, { workspace: w.key });
    } catch { workspace = null; }
  }
  proposeDryRunLift(project.id, { vaultPath }).catch(() => {});
  return {
    destination: `Project — ${project.name} (~/Projects/${path.relative(PROJECTS_ROOT(), project.folder)}${project.page ? ` + ${project.page}` : ''})${project.dryRun ? ' · dry run' : ''}`,
    undo: { route: 'project-create', id: project.id, files, ...(workspace ? { workspace } : {}) },
    projectId: project.id,
  };
}

async function fileStage(vaultPath, payload) {
  const k = novaKernel(vaultPath);
  const { project, from } = k.applyStage(payload.id, payload.to);
  proposeDryRunLift(project.id, { vaultPath }).catch(() => {});
  return { destination: `${project.name} — ${from} → ${project.stage}`, undo: { route: 'project-stage', id: project.id, from }, projectId: project.id };
}

async function fileSettings(vaultPath, payload) {
  const k = novaKernel(vaultPath);
  const { project, before } = k.applySettings(payload.id, payload.settings);
  proposeDryRunLift(project.id, { vaultPath }).catch(() => {});
  return { destination: `${project.name} — settings: ${Object.keys(payload.settings || {}).join(', ')}`, undo: { route: 'project-settings', id: project.id, before }, projectId: project.id };
}

// HIS ANSWER to a job that stopped to ask (phase 3): the job goes back in the
// queue with it and starts now, because he is here (his press, window and dry
// run do not apply; the cap of two still does).
async function fileAnswer(vaultPath, payload) {
  const k = novaKernel(vaultPath);
  const p = assertWritable(k.getProject(payload.projectId));
  const job = k.answerJob(p, payload.jobId, payload.answer || payload.pick, { fableOk: payload.fable === true });
  const { runProjectQueues } = await import('./projectScheduler.js');
  const run = await runProjectQueues(vaultPath, { force: true, projectId: p.id }).catch(() => null);
  const startedNow = run?.started?.some((s) => s.jobId === job.id);
  return {
    destination: `${p.name}: ${payload.fable ? 'runs on Fable' : `answered "${String(job.answer || '').slice(0, 80)}"`}; ${startedNow ? 'the job is running again' : 'the job is back in the queue'}`,
    undo: { route: 'project-answer', projectId: p.id, jobId: job.id },
  };
}

export async function fileProjectDecision(vaultPath, route, payload) {
  if (route === 'project-watch-note') return fileProjectWatchNote(vaultPath, payload);
  if (route === 'project-create') return fileCreate(vaultPath, payload);
  if (route === 'project-stage') return fileStage(vaultPath, payload);
  if (route === 'project-settings') return fileSettings(vaultPath, payload);
  if (route === 'project-answer') return fileAnswer(vaultPath, payload);
  throw new Error(`unknown project route ${route}`);
}

export async function undoProjectDecision(vaultPath, undo) {
  const k = novaKernel(vaultPath);
  if (undo.route === 'project-watch-note') {
    const p = assertWritable(k.getProject(undo.projectId));
    // a copy first, the vault's own rule for anything Nova takes away
    const { backupFile } = await import('./backup.js');
    for (const f of undo.files || []) {
      const full = path.join(vaultPath, f.relPath);
      if (existsSync(full) && createHash('sha256').update(await readFile(full, 'utf8')).digest('hex') === f.hash) await backupFile(full);
    }
    const n = k.removeProjectVaultFiles(p, undo.files || [], { line: `watch note undone: ${(undo.files || []).map((f) => f.relPath.split('/').slice(-2).join('/')).join(', ')}` });
    return `removed ${p.name}'s source page${n > 1 ? ' and its transcript' : ''}`;
  }
  if (undo.route === 'project-research') {
    const p = assertWritable(k.getProject(undo.projectId));
    return k.undoResearch(p, undo);
  }
  if (undo.route === 'project-create') {
    const said = k.undoCreate(undo.id, { files: undo.files || [] });
    if (undo.workspace) {
      const { removeProjectWorkspace } = await import('./codeWorkspaces.js');
      await removeProjectWorkspace(undo.workspace).catch(() => {});
    }
    return said;
  }
  if (undo.route === 'project-stage') {
    const p = k.revertStage(undo.id, undo.from);
    return `${p.name} is back at ${p.stage}`;
  }
  if (undo.route === 'project-settings') {
    const { project } = k.applySettings(undo.id, undo.before || {});
    return `${project.name}'s settings are back as they were`;
  }
  if (undo.route === 'project-job') {
    const p = assertWritable(k.getProject(undo.projectId));
    return k.undoJob(p, undo);
  }
  if (undo.route === 'project-answer') {
    // only while the job has not started again: a running job cannot be un-answered
    const p = assertWritable(k.getProject(undo.projectId));
    const job = k.readQueue(p).jobs.find((j) => j.id === undo.jobId);
    if (!job || job.status !== 'queued') throw new Error(`that job is ${job ? job.status : 'gone'}; the answer has already been used`);
    k.updateJob(p, job.id, { status: 'waiting', answer: null, fableOk: false });
    return `${p.name}'s job is waiting on you again`;
  }
  throw new Error(`unknown project undo ${undo.route}`);
}

// ---- THE PROJECT WATCHER (phase 2, PROJECTS-PLAN §2) -----------------------

function refuse(message, code) { const e = new Error(message); e.code = code; return e; }

const urlOfRecord = (r) => r?.decision?.payload?.url || (String(r?.text || '').match(/^Watch:\s*(\S+)/) || [])[1] || '';
const LIVE = (r) => !['error', 'undone', 'discarded', 'withdrawn', 'failed'].includes(r.status);

/**
 * Before a project watch starts: the project is his, writable and live, the
 * lens is one of three, and this video is not already in it (the second watch
 * of one link is refused, naming the first). Returns { id, name, lens }.
 */
export async function prepareProjectWatch(vaultPath, projectId, url, lens, { retryOf = null } = {}) {
  const { LINKED_IDS } = await import('./projectLinks.js');
  if (LINKED_IDS.includes(projectId)) throw refuse('that is a linked project: Nova only reads about it and never files anything into it', 'linked');
  const k = novaKernel(vaultPath);
  const p = k.getProject(projectId);
  if (!p) throw refuse('no such project', 'missing');
  assertWritable(p);
  if (p.stage === 'archived') throw refuse(`${p.name} is archived; bring it back before sending it videos`, 'stage');
  if (lens != null && !LENSES.includes(lens)) throw refuse(`lens must be one of ${LENSES.join(', ')}`, 'lens');
  const { videoLinkKey, findExistingVideoPages } = await import('./ingest.js');
  const key = videoLinkKey(url);
  if (key) {
    const { listRecords } = await import('./inboxStore.js');
    const prior = (await listRecords()).find((r) => r.id !== retryOf && r.projectId === p.id && r.kind === 'video' && LIVE(r) && videoLinkKey(urlOfRecord(r)) === key);
    if (prior) {
      const when = String(prior.createdAt || '').slice(0, 10);
      const what = prior.decision?.title ? `“${prior.decision.title}”` : 'it';
      throw refuse(`${p.name} already has this video: ${what}, sent ${when}${prior.status === 'classifying' ? ' and still being watched' : ''}. Nova will not watch it twice.`, 'duplicate');
    }
    if (vaultPath) {
      const dir = k.projectVaultDir(p);
      const pages = await findExistingVideoPages(vaultPath, url, { dirs: [`${dir}/Sources`, `${dir}/Raw`] });
      if (pages.pages.length) throw refuse(`${p.name} already has this video at ${pages.pages[0]}. Nova will not watch it twice.`, 'duplicate');
    }
  }
  return { id: p.id, name: p.name, lens: lens || lensOf(p) };
}

/**
 * The project-watch-note filer: Projects/<Name>/Sources/<Title>.md and
 * Projects/<Name>/Raw/<Title> (Transcript).md, through the kernel's contained
 * writer. Never Wiki/Sources, never Raw/, never the weave. If the vault page
 * was deleted the folder is made again, but only for a project whose record
 * exists and is writable (the kernel's guard runs first).
 */
async function fileProjectWatchNote(vaultPath, payload) {
  const k = novaKernel(vaultPath);
  const p = k.getProject(payload?.projectId);
  if (!p) throw refuse('the project this video was for no longer exists', 'missing');
  assertWritable(p);
  const dir = k.projectVaultDir(p);
  if (payload.url) {
    const { findExistingVideoPages } = await import('./ingest.js');
    const prior = await findExistingVideoPages(vaultPath, payload.url, { dirs: [`${dir}/Sources`, `${dir}/Raw`] });
    if (prior.pages.length) throw refuse(`this video is already in ${p.name} at ${prior.pages[0]}`, 'duplicate');
  }
  const base = vaultName(payload.title) || 'Watched video';
  const suffix = existsSync(path.join(vaultPath, dir, 'Sources', `${base}.md`)) ? ` ${Date.now() % 10000}` : '';
  let transcript = null;
  if (payload.transcriptRef && /^[0-9a-f-]{1,40}\.txt$/.test(payload.transcriptRef)) {
    transcript = await readFile(path.join(dataRoot(), 'watch', payload.transcriptRef), 'utf8').catch(() => null);
  }
  const rawBase = `${base}${suffix} (Transcript)`;
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // his day, not UTC's
  const matter = (await import('gray-matter')).default;
  const front = {
    type: 'source',
    ...(transcript ? { raw: `[[${dir}/Raw/${rawBase}]]` } : {}),
    ...(payload.url ? { url: payload.url } : {}),
    tags: ['video', 'project'],
    project: p.id,
    lens: payload.lens || 'reference',
    created: date,
    updated: date,
  };
  const files = [{ rel: `Sources/${base}${suffix}.md`, content: matter.stringify(`# ${payload.title}\n\n${payload.body}\n`, front) }];
  if (transcript) {
    files.push({ rel: `Raw/${rawBase}.md`, content: `Verbatim video transcript fetched by Nova's Watcher for the project ${p.name}, received ${date}.\nSource URL: ${payload.url || '(unknown)'}\nSource page: [[${dir}/Sources/${base}${suffix}]]\n\n---\n\n${transcript}` });
  }
  const written = k.writeProjectVaultFiles(p, files, { line: `watched “${String(payload.title).slice(0, 80)}” (${payload.lens || 'reference'} lens) → ${dir}/Sources/${base}${suffix}.md${transcript ? ' + Raw transcript' : ''}`, action: 'watch' });
  return {
    destination: `${p.name} — Sources/${base}${suffix}.md${transcript ? ' (+ transcript in its Raw/)' : ' (no transcript)'}`,
    undo: { route: 'project-watch-note', projectId: p.id, files: written },
    projectId: p.id,
  };
}

/**
 * HIS TAP ONLY: "Also file to my library". The ordinary watch-note filing of
 * the same note and stored transcript into Wiki/Sources + Raw, as its own
 * filed record with its own undo. The ingest weave is NOT started (Deep weave
 * on that record is his separate ask). The project's copy stays.
 */
export async function fileProjectWatchToLibrary(vaultPath, recordId) {
  const { getRecord, createRecord, updateRecord } = await import('./inboxStore.js');
  const r = await getRecord(recordId);
  if (!r || r.kind !== 'video' || !r.projectId || r.decision?.route !== 'project-watch-note') throw refuse('that is not a project watch', 'missing');
  if (r.status !== 'filed') throw refuse('only a filed project note can also go to your library', 'stage');
  if (r.libraryWorthy?.yes !== true) throw refuse('Nova did not flag this one for your library', 'stage');
  if (r.libraryRecordId) {
    const prev = await getRecord(r.libraryRecordId);
    if (prev && prev.status === 'filed') throw refuse(`already in your library: ${prev.destination || 'filed'}`, 'duplicate');
  }
  const pl = r.decision.payload || {};
  const p = novaKernel(vaultPath).getProject(r.projectId);
  const decision = {
    route: 'watch-note', confidence: 'high', title: pl.title,
    reason: `Filed to your library from ${p?.name || 'a project'}, on your tap. Undo removes the library page and its transcript; the project's own copy stays.`,
    payload: { title: pl.title, body: pl.body, url: pl.url, lane: 'reference', transcriptRef: pl.transcriptRef || null },
  };
  const { fileDecision } = await import('./inbox.js');
  const filed = await fileDecision(vaultPath, decision);
  const at = new Date().toISOString();
  const lib = await createRecord({
    id: newId(), kind: 'video', source: 'watcher', mode: 'draft', status: 'filed',
    text: `Watch: ${pl.url || ''}`, createdAt: at, filedAt: at, auto: false,
    decision, destination: filed.destination, undoData: filed.undo,
    parentId: r.id, fromProjectId: r.projectId,
  });
  await updateRecord(r.id, { libraryRecordId: lib.id });
  return { record: lib };
}

// ---- cards Nova files (pending; nothing applies until his yes) -------------

async function pendingFor(projectId, kind) {
  const { listRecords } = await import('./inboxStore.js');
  return (await listRecords()).filter((r) => r.projectId === projectId && r.kind === kind && r.status === 'pending');
}

/** A stage move, proposed. Refused moves are refused here, not filed. */
export async function fileStageCard(projectId, to, reason = '', { vaultPath } = {}) {
  const k = novaKernel(vaultPath);
  const p = k.getProject(projectId);
  const prop = k.proposeStage(p || projectId, to, reason);
  if (!prop.ok) { const e = new Error(prop.error); e.code = 'stage'; throw e; }
  if ((await pendingFor(projectId, 'project-stage')).length) { const e = new Error('a stage card for this project is already waiting'); e.code = 'stage'; throw e; }
  const { createRecord } = await import('./inboxStore.js');
  return createRecord({
    id: newId(), kind: 'project-stage', source: 'nova', mode: 'draft', status: 'pending',
    text: `${p.name}: ${prop.from} → ${to}`, createdAt: new Date().toISOString(),
    projectId, dryRun: !!p.dryRun,
    decision: { route: 'project-stage', confidence: 'high', title: `Move ${p.name} to ${to}`, reason: prop.reason || `from ${prop.from}`, payload: { id: projectId, from: prop.from, to } },
  });
}

/**
 * After three clean create / stage / settings actions in LOG.md, propose
 * lifting dry-run (PROJECTS-PLAN §1.4). Nova proposes; he decides. Returns the
 * card, or null with nothing filed.
 */
export async function proposeDryRunLift(projectId, { vaultPath } = {}) {
  const k = novaKernel(vaultPath);
  const p = k.getProject(projectId);
  if (!p || p.linked || !p.dryRun || p.status === 'undone') return null;
  const clean = k.cleanActions(p);
  if (clean < 3) return null;
  if ((await pendingFor(projectId, 'project-settings')).some((r) => r.decision?.payload?.settings?.dryRun === false)) return null;
  const { createRecord } = await import('./inboxStore.js');
  return createRecord({
    id: newId(), kind: 'project-settings', source: 'nova', mode: 'draft', status: 'pending',
    text: `${p.name}: lift dry run`, createdAt: new Date().toISOString(), projectId, dryRun: true,
    decision: {
      route: 'project-settings', confidence: 'high', title: `Let ${p.name} act for real`,
      reason: `${clean} clean actions in its log while in dry run (the first ${DRY_RUN_PROJECTS} projects start in dry run).`,
      payload: { id: projectId, settings: { dryRun: false } },
    },
  });
}

/** Everything the screen lists: his projects, then the linked three. */
export async function allProjects({ vaultPath, repoRoot } = {}) {
  const { linkedProjects } = await import('./projectLinks.js');
  const mine = novaKernel(vaultPath).listProjects();
  return [...mine, ...(await linkedProjects({ repoRoot }))];
}

// ---- PHASE 3: the queue from Nova's side ------------------------------------

/**
 * Retry on a failed project job's record: the job goes back in the queue and
 * starts now (his press). Each run files its own record, so this one is
 * withdrawn with a note saying where the next run is.
 */
/** A failed job back in the queue, started now (his press). Any kind. */
export async function retryJob(vaultPath, projectId, jobId) {
  const k = novaKernel(vaultPath);
  const p = assertWritable(k.getProject(projectId));
  const job = k.readQueue(p).jobs.find((j) => j.id === jobId);
  if (!job) throw refuse('that job is no longer in the project\'s queue', 'missing');
  if (job.status !== 'failed') throw refuse(`that job is ${job.status}, not failed`, 'job');
  k.updateJob(p, job.id, { status: 'queued', error: null, attempts: 0, endedAt: null });
  k.appendLog(p, `${job.kind} job ${job.id} queued again (Retry)`, { action: 'queue' });
  const { runProjectQueues } = await import('./projectScheduler.js');
  const run = await runProjectQueues(vaultPath, { force: true, projectId: p.id });
  return { project: p, job, run, started: run.started.some((s) => s.jobId === job.id) };
}

export async function retryProjectJob(vaultPath, record) {
  const { project: p, run, started } = await retryJob(vaultPath, record.projectId, record.jobId);
  const { updateRecord } = await import('./inboxStore.js');
  const again = started;
  return updateRecord(record.id, { status: 'withdrawn', withdrawnAt: new Date().toISOString(), destination: again ? 'Running again: the new run files its own card' : `Back in ${p.name}'s queue (${run.held[0]?.why || 'it starts when there is room'})` });
}

/**
 * Queue a job for an attached or named project, and start it now when `now`
 * (his spoken yes or his press). Returns { job, started, held }.
 */
export async function queueProjectJob(vaultPath, projectId, { kind, input, needs = [], origin = 'nova', now = false } = {}) {
  const k = novaKernel(vaultPath);
  const p = assertWritable(k.getProject(projectId));
  if (isProtectedPath(p.folder)) throw refuse('Nova never writes to Science Atlas, its Mission Control or Wren', 'protected');
  const job = k.enqueueJob(p, { kind, input, needs, origin });
  if (!now) return { job, started: false, held: null };
  const { runProjectQueues } = await import('./projectScheduler.js');
  const run = await runProjectQueues(vaultPath, { force: true, projectId: p.id });
  const started = run.started.some((s) => s.jobId === job.id);
  return { job: k.readQueue(p).jobs.find((j) => j.id === job.id), started, held: started ? null : (run.held.find((h) => h.projectId === p.id)?.why || 'another job of this project goes first') };
}

/** What a sentence about the queue's state says, from the queue itself. */
export function queueLine(project, queue) {
  const jobs = queue?.jobs || [];
  const n = (s) => jobs.filter((j) => j.status === s).length;
  const parts = [];
  if (n('running')) parts.push(`${n('running')} running`);
  if (n('queued')) parts.push(`${n('queued')} queued`);
  if (n('waiting')) parts.push(`${n('waiting')} waiting on you`);
  if (!parts.length) return `${project.name} has nothing queued.`;
  return `${project.name}: ${parts.join(', ')}.${project.dryRun ? ' It is in dry run, so queued work waits for your press.' : ` Queued work runs overnight, ${project.quiet?.from || '22:00'} to ${project.quiet?.to || '07:00'}.`}`;
}

/**
 * HIS OWN ANSWER (spoken, or typed on the project page) to a job waiting on
 * him: the job goes back with it and starts now, and the pending card is
 * settled so it is not answered twice.
 */
export async function answerWaitingJob(vaultPath, projectId, jobId, answer) {
  const k = novaKernel(vaultPath);
  const p = assertWritable(k.getProject(projectId));
  const job = k.answerJob(p, jobId, answer);
  const { listRecords, updateRecord } = await import('./inboxStore.js');
  for (const r of (await listRecords()).filter((x) => x.kind === 'project-needs-you' && x.status === 'pending' && x.jobId === jobId)) {
    await updateRecord(r.id, { status: 'filed', filedAt: new Date().toISOString(), auto: false, destination: `Answered: "${job.answer.slice(0, 80)}"` }).catch(() => {});
  }
  const { runProjectQueues } = await import('./projectScheduler.js');
  const run = await runProjectQueues(vaultPath, { force: true, projectId: p.id }).catch(() => null);
  return { job, started: !!run?.started?.some((s) => s.jobId === job.id) };
}

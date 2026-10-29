// NOVA AS A PROJECT HOST (Projects phase 1, 29 Oct 2026; PROJECTS-PLAN §10b).
//
// The kernel (projectKernel.js) is the machinery and knows nothing of Nova.
// This file is Nova's side of it: the host object, the inbox filers that turn
// his yes on a card into a kernel call (with undoData for the rails), the
// stage and settings cards, and the dry-run lift proposal. Every project
// action rides the inbox: kind, status, undoData.

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeKernel, DRY_RUN_PROJECTS } from './projectKernel.js';
import { PROJECTS_ROOT } from './projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');

export function novaKernel(vaultPath = process.env.VAULT_PATH) {
  return makeKernel({ name: 'Nova', projectsRoot: PROJECTS_ROOT(), dataDir: dataRoot(), vaultRoot: vaultPath || null });
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

export async function fileProjectDecision(vaultPath, route, payload) {
  if (route === 'project-create') return fileCreate(vaultPath, payload);
  if (route === 'project-stage') return fileStage(vaultPath, payload);
  if (route === 'project-settings') return fileSettings(vaultPath, payload);
  throw new Error(`unknown project route ${route}`);
}

export async function undoProjectDecision(vaultPath, undo) {
  const k = novaKernel(vaultPath);
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
  throw new Error(`unknown project undo ${undo.route}`);
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

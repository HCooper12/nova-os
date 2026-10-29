// /api/projects and the project cards (no model, no real vault, no real data):
// intake reply → BRIEF parsed → validated → pending card → his yes → folder,
// first commit, vault page → undo takes both back. Plus the HTTP routes.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-projflow-'));
const dataDir = path.join(base, 'data');
const vault = path.join(base, 'vault');
const projectsDir = path.join(base, 'Projects');
mkdirSync(dataDir, { recursive: true });
mkdirSync(vault, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_PROJECTS_DIR = projectsDir;
process.env.TELEGRAM_BOT_TOKEN = '';

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { novaKernel, proposeDryRunLift } = await import('../lib/novaProjects.js');
const { projectsRouter } = await import('../routes/projects.js');
const { WRITE_SLICE_MAP } = await import('../lib/writeSlices.js');

const BRIEF = { name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'Furniture ordered', deadline: null,
  phases: [{ name: 'Measure', what: 'the room', first: 'tape' }, { name: 'Choose', what: 'pieces', first: 'shortlist' }],
  reads: ['Wiki/Home.md'], allowances: { research: true, draft: true }, limit: { discussAbove: null, agreed: null }, firstMoves: ['find videos'] };


test('dry-run lift is proposed after three clean actions, once', async () => {
  const k = novaKernel(vault);
  const { project } = k.createProject({ ...BRIEF, name: 'Lift test' });
  assert.equal(await proposeDryRunLift(project.id, { vaultPath: vault }), null, 'one action is not enough');
  k.applySettings(project.id, { quiet: { from: '21:00', to: '07:00' } });
  k.applyStage(project.id, 'active');
  const card = await proposeDryRunLift(project.id, { vaultPath: vault });
  assert.equal(card.kind, 'project-settings');
  assert.deepEqual(card.decision.payload.settings, { dryRun: false });
  assert.equal(await proposeDryRunLift(project.id, { vaultPath: vault }), null, 'never twice');
  await approveRecord(vault, card.id);
  assert.equal(k.getProject(project.id).dryRun, false);
  await undoRecord(vault, card.id);
  assert.equal(k.getProject(project.id).dryRun, true);
});

test('a write under /api/projects refetches only projects and inbox', () => {
  const hit = WRITE_SLICE_MAP.find((m) => m.test.test('/projects/abc/settings'));
  assert.deepEqual(hit.slices, ['projects', 'inbox']);
});

test('HTTP: list incl. linked, read, stage files a card, settings validated, linked refused', async (t) => {
  writeFileSync(path.join(dataDir, 'code-workspaces.json'), JSON.stringify({ workspaces: [{ key: 'atlas', title: 'Science Atlas', path: path.join(base, 'atlas') }] }));
  mkdirSync(path.join(base, 'atlas'), { recursive: true });
  const app = express();
  app.use(express.json());
  app.use('/api', projectsRouter({ vaultPath: vault, repoRoot: path.join(base, 'repo'), sessions: async () => ({ groups: [] }) }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => srv.close());
  const url = (p) => `http://127.0.0.1:${srv.address().port}/api${p}`;
  const post = (p, body) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const k = novaKernel(vault);
  const { project } = k.createProject({ ...BRIEF, name: 'Http test' });
  const list = await (await fetch(url('/projects'))).json();
  assert.ok(list.projects.some((p) => p.id === project.id));
  assert.ok(list.projects.some((p) => p.id === 'atlas' && p.linked));

  const one = await (await fetch(url(`/projects/${project.id}`))).json();
  assert.ok(one.files.some((f) => f.path === 'BRIEF.md'));
  assert.match(one.page, /type: project/);
  assert.deepEqual(one.cost, { usd: 0, costKnown: false });

  const st = await post(`/projects/${project.id}/stage`, { to: 'active' });
  assert.equal(st.status, 200);
  assert.equal(k.getProject(project.id).stage, 'planning', 'a stage route never applies');
  const rec = (await st.json()).record;
  assert.equal(rec.kind, 'project-stage');
  assert.equal(rec.projectId, project.id);
  const one2 = await (await fetch(url(`/projects/${project.id}`))).json();
  assert.equal(one2.cards.length, 1);

  assert.equal((await post(`/projects/${project.id}/settings`, { quiet: { from: '99:00', to: '1' } })).status, 400);
  assert.equal((await post(`/projects/${project.id}/settings`, { dryRun: false })).status, 200);
  assert.equal((await post('/projects/atlas/settings', { dryRun: true })).status, 403);
  assert.equal((await post('/projects/atlas/stage', { to: 'paused' })).status, 403);
  assert.equal((await post('/projects/atlas/archive', {})).status, 403);
  assert.equal((await post('/projects/nope/settings', {})).status, 404);
  assert.equal((await post(`/projects/${project.id}/log`, { line: 'x' })).status, 404, 'no route writes the log');
  rmSync(path.join(base, 'atlas'), { recursive: true, force: true });
});

test('the settings route proposes lifting dry run after the third clean action', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api', projectsRouter({ vaultPath: vault, repoRoot: path.join(base, 'repo'), sessions: async () => ({ groups: [] }) }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => srv.close());
  const k = novaKernel(vault);
  const { project } = k.createProject({ ...BRIEF, name: 'Route lift' });
  const post = (body) => fetch(`http://127.0.0.1:${srv.address().port}/api/projects/${project.id}/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await post({ quiet: { from: '21:00', to: '06:00' } });
  const { listRecords } = await import('../lib/inboxStore.js');
  const lifts = async () => (await listRecords()).filter((r) => r.projectId === project.id && r.kind === 'project-settings');
  assert.equal((await lifts()).length, 0, 'two actions: nothing yet');
  await post({ quiet: { from: '22:00', to: '07:00' } });
  assert.equal((await lifts()).length, 1);
  assert.match(readFileSync(path.join(project.folder, 'LOG.md'), 'utf8'), /DRY RUN · settings · /);
});


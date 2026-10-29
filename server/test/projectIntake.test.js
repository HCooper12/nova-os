// PROJECT INTAKE, END TO END (no model, no real vault, no real data):
// intake reply → BRIEF parsed → validated → pending card → his yes → folder,
// first commit, vault page → undo takes both back. Plus the HTTP routes.
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
const { parseBriefLine, settleIntakeReply, startIntake, buildIntakePrompt, _resetIntake } = await import('../lib/projectIntake.js');
const { listRecords, getRecord } = await import('../lib/inboxStore.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { LANES, modelFor } = await import('../lib/modelPrefs.js');

const BRIEF = { name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'Furniture ordered', deadline: null,
  phases: [{ name: 'Measure', what: 'the room', first: 'tape' }, { name: 'Choose', what: 'pieces', first: 'shortlist' }],
  reads: ['Wiki/Home.md'], allowances: { research: true, draft: true }, limit: { discussAbove: null, agreed: null }, firstMoves: ['find videos'] };

const job = () => ({ id: 'j1', status: 'running', result: null });

test('the lane exists, sonnet high, in the conversation group', () => {
  const lane = LANES.find((l) => l.id === 'project-intake');
  assert.equal(lane.def, 'sonnet');
  assert.equal(lane.defEffort, 'high');
  assert.ok(modelFor('project-intake'));
});

test('parseBriefLine is strict: one line, JSON, nothing trusted beyond it', () => {
  const r = parseBriefLine(`I have enough.\nBRIEF ${JSON.stringify(BRIEF)}`);
  assert.equal(r.cleanText, 'I have enough.');
  assert.equal(r.brief.name, 'Room redesign');
  assert.equal(parseBriefLine('What is the deadline?').brief, null);
  assert.match(parseBriefLine('BRIEF {not json}').parseError, /JSON/);
  assert.equal(parseBriefLine('the BRIEF {"a":1} inline').brief, null);
});

test('the prompt carries the lens, the intake block and TURN_TAKING last before his words; a long paste gets the echo note', async () => {
  const p = await buildIntakePrompt(vault, 'x'.repeat(500));
  assert.match(p, /YOU ARE STARTING A PROJECT/);
  assert.match(p, /HE PASTED A LONG PROMPT/);
  assert.ok(p.indexOf('HOW YOU TAKE A TURN') < p.indexOf('HIS WORDS:'));
  assert.ok(p.indexOf('YOU ARE STARTING A PROJECT') < p.indexOf('HOW YOU TAKE A TURN'));
  assert.doesNotMatch(await buildIntakePrompt(vault, 'a room'), /PASTED/);
});

test('a question is just a turn; nothing is filed', async () => {
  const j = job();
  await settleIntakeReply('What does done look like?', j, () => assert.fail('no retry'), 's1');
  assert.equal(j.status, 'ready');
  assert.equal(j.result.stage, 'asking');
  assert.equal((await listRecords()).length, 0);
});

test('an invalid brief goes back to the same session, twice, then files as an error', async () => {
  _resetIntake();
  const sent = [];
  const bad = `BRIEF ${JSON.stringify({ ...BRIEF, phases: [], kind: 'party' })}`;
  const j = job();
  assert.equal(await settleIntakeReply(bad, j, (t) => sent.push(t), 's2'), null);
  assert.equal(await settleIntakeReply(bad, j, (t) => sent.push(t), 's2'), null);
  assert.equal(sent.length, 2);
  assert.match(sent[0], /The brief was missing: .*kind.*phases|The brief was missing: .*phases/);
  await settleIntakeReply(bad, j, (t) => sent.push(t), 's2');
  assert.equal(sent.length, 2);
  const err = (await listRecords()).find((r) => r.kind === 'project-brief' && r.status === 'error');
  assert.ok(err);
  assert.match(err.error, /phases/);
  assert.ok(!existsSync(projectsDir) || !existsSync(path.join(projectsDir, 'room-redesign')));
});

test('a good brief files a pending card; approve creates; undo removes both', async () => {
  _resetIntake();
  const j = job();
  await settleIntakeReply(`Enough.\nBRIEF ${JSON.stringify(BRIEF)}`, j, () => assert.fail(), 's3');
  assert.equal(j.result.stage, 'filed');
  const card = await getRecord(j.result.recordId);
  assert.equal(card.status, 'pending');
  assert.equal(card.kind, 'project-brief');
  assert.equal(card.decision.route, 'project-create');
  assert.equal(card.dryRun, true);
  assert.equal(existsSync(path.join(projectsDir, 'room-redesign')), false, 'nothing on disk before his yes');

  const filed = await approveRecord(vault, card.id);
  assert.equal(filed.status, 'filed');
  assert.match(filed.projectId, /^[0-9a-f]{8}$/);
  const dir = path.join(projectsDir, 'room-redesign');
  assert.ok(existsSync(path.join(dir, 'BRIEF.md')));
  assert.ok(existsSync(path.join(dir, '.git')));
  assert.ok(existsSync(path.join(vault, 'Projects/Room redesign/Room redesign.md')));
  assert.match(readFileSync(path.join(dir, 'LOG.md'), 'utf8'), /DRY RUN · create · /);

  const undone = await undoRecord(vault, card.id);
  assert.equal(undone.status, 'undone');
  assert.equal(existsSync(dir), false);
  assert.ok(existsSync(path.join(projectsDir, '.undone')));
  assert.equal(existsSync(path.join(vault, 'Projects/Room redesign/Room redesign.md')), false);
});

test('a build project registers its build/ folder as a p-<slug> workspace, and undo removes it', async () => {
  const b = { ...BRIEF, name: 'Tiny site', kind: 'build' };
  const j = job();
  await settleIntakeReply(`BRIEF ${JSON.stringify(b)}`, j, () => {}, 's4');
  await approveRecord(vault, j.result.recordId);
  const ws = JSON.parse(readFileSync(path.join(dataDir, 'code-workspaces.json'), 'utf8')).workspaces;
  assert.ok(ws.some((w) => w.key === 'p-tiny-site' && w.path.endsWith(path.join('tiny-site', 'build'))));
  assert.ok(ws.some((w) => w.key === 'atlas'), 'his seeded workspaces stay');
  await undoRecord(vault, j.result.recordId);
  const after = JSON.parse(readFileSync(path.join(dataDir, 'code-workspaces.json'), 'utf8')).workspaces;
  assert.equal(after.some((w) => w.key === 'p-tiny-site'), false);
});

test('startIntake runs the injected turn with the full prompt first, then his words alone', async () => {
  const calls = [];
  const runTurn = (cwd, o) => { calls.push(o); return { jobId: 'x', sessionId: o.sessionId || '00000000-0000-0000-0000-000000000000' }; };
  await startIntake(vault, { text: 'a room redesign' }, { runTurn });
  await startIntake(vault, { text: 'by Christmas', sessionId: '00000000-0000-0000-0000-000000000000' }, { runTurn });
  assert.match(calls[0].text, /YOU ARE STARTING A PROJECT/);
  assert.equal(calls[1].text, 'by Christmas');
  await assert.rejects(() => startIntake(vault, { text: '  ' }, { runTurn }), /say what/);
});

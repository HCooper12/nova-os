// A PROJECT TURN (Projects T7): the PROJECT section code hands Nova, the
// conversation record read back by projectId, and no change at all to a turn
// that names no project.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-projctx-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
mkdirSync(process.env.NOVA_DATA_DIR, { recursive: true });
const vault = path.join(base, 'vault');
mkdirSync(path.join(vault, 'Wiki'), { recursive: true });
writeFileSync(path.join(vault, 'Wiki', 'Home.md'), '# Home\n\nThe bedroom faces east.\n');

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { renderProjectSection, projectContextSection, CAPS } = await import('../lib/projectContext.js');
const { novaKernel } = await import('../lib/novaProjects.js');
const { appendTurns, readTurns } = await import('../lib/conversationLog.js');

const BRIEF = { name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'Furniture ordered',
  phases: [{ name: 'Measure', what: 'the room' }, { name: 'Choose' }], reads: ['Wiki/Home.md', 'Wiki/Gone.md'], allowances: {}, limit: {} };

test('the section carries the brief, the phases, the log tail and the read pages; a missing page is named', async () => {
  const k = novaKernel(vault);
  const { project } = k.createProject(BRIEF);
  for (let i = 0; i < 30; i++) k.appendLog(project.id, `line ${i}`, { action: 'note' });
  const s = await projectContextSection(vault, project.id, { kernel: k });
  assert.match(s, /^PROJECT — Room redesign/);
  assert.match(s, /1\. \[ \] Measure — the room/);
  assert.match(s, /THE BRIEF \(BRIEF\.md\):\n# Room redesign/);
  assert.match(s, /line 29/);
  assert.doesNotMatch(s, /line 9\b/, 'only the last 20 log lines');
  assert.match(s, /PAGE Wiki\/Home\.md[^\n]*\n# Home\n\nThe bedroom faces east\./);
  assert.match(s, /NOTE — these context sections FAILED to load[^\n]*the project's page Wiki\/Gone\.md/);
  assert.equal(await projectContextSection(vault, 'deadbeef', { kernel: k }), '', 'an unknown id adds nothing');
});

test('caps: a long page is cut, and pages past the budget are left out by name', () => {
  const long = 'x'.repeat(CAPS.page + 500);
  const s = renderProjectSection({
    project: { name: 'P', kind: 'life', stage: 'active', phases: [] },
    pages: Array.from({ length: 6 }, (_, i) => ({ rel: `Wiki/P${i}.md`, text: long })),
  });
  assert.match(s, /\[…cut at 3000 characters\]/);
  assert.match(s, /PAGE Wiki\/P5\.md: \[left out — the pages budget/);
  assert.ok(s.length < CAPS.pages + 2000);
});

test('a linked project gets its commits, no brief and no reads', () => {
  const s = renderProjectSection({ project: { name: 'Science Atlas', kind: 'build', stage: 'active', linked: { path: '/a' } }, commits: [{ at: '2026-10-28T10:00:00Z', subject: 'feat: x' }] });
  assert.match(s, /LINKED: Nova only reads about it/);
  assert.match(s, /- 2026-10-28 feat: x/);
  assert.doesNotMatch(s, /BRIEF|PAGE /);
});

test('the conversation record reads a project thread back by projectId, newest last', async () => {
  await appendTurns([
    { who: 'you', text: 'general question', at: '2026-10-29T01:00:00Z' },
    { who: 'you', text: 'about the room', at: '2026-10-29T02:00:00Z', projectId: 'a1b2c3d4' },
    { who: 'nova', text: 'east light, so', at: '2026-10-29T02:01:00Z', projectId: 'a1b2c3d4' },
    { who: 'you', text: 'bad id', at: '2026-10-29T03:00:00Z', projectId: '../x' },
  ], { now: new Date('2026-10-29T04:00:00Z') });
  const mine = await readTurns({ projectId: 'a1b2c3d4' });
  assert.deepEqual(mine.map((r) => r.text), ['about the room', 'east light, so']);
  const all = await readTurns({});
  assert.equal(all.length, 4);
  assert.equal(all.find((r) => r.text === 'bad id').projectId, undefined, 'a malformed id is dropped, never stored');
});

test('a turn without projectId gets exactly today\'s context; with one, the section is appended', async () => {
  const { buildAskContext } = await import('../lib/askContext.js');
  const k = novaKernel(vault);
  const { project } = k.createProject({ ...BRIEF, name: 'Ctx test', reads: [] });
  const plain = await buildAskContext(vault, null);
  assert.equal(await buildAskContext(vault, null, {}), plain);
  assert.equal(await buildAskContext(vault, null, { projectId: null }), plain);
  const withP = await buildAskContext(vault, null, { projectId: project.id });
  assert.ok(withP.startsWith(`${plain}\n\nPROJECT — Ctx test`), 'base first, byte for byte, then the project');
  assert.equal(await buildAskContext(vault, 'a-session', { projectId: project.id }), '', 'a resumed turn still carries nothing');
});

// "TELL ME" (Projects phase 2, T3): a project card's document is handed to
// Nova after the PROJECT section, only when the turn names it (docRef). A
// turn without docRef is byte-for-byte what it was. Temp dirs before imports.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const base = mkdtempSync(path.join(tmpdir(), 'nova-tellme-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
process.env.TELEGRAM_BOT_TOKEN = '';
mkdirSync(process.env.NOVA_DATA_DIR, { recursive: true });
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { buildAskContext } = await import('../lib/askContext.js');
const { projectDocSection, DOC_CAP } = await import('../lib/projectContext.js');
const { ABSENT_NOTE } = await import('../lib/contextSections.js');
const { novaKernel } = await import('../lib/novaProjects.js');
const { createRecord } = await import('../lib/inboxStore.js');

const sha = (s) => createHash('sha256').update(s).digest('hex');
const k = novaKernel(vault);
const brief = (name) => ({ name, kind: 'life', goal: 'A calmer bedroom', done: 'Chosen', phases: [{ name: 'Look' }], reads: [], allowances: {}, limit: {} });
const { project } = k.createProject(brief('Room redesign'));
const { project: other } = k.createProject(brief('Garden'));

const SYN = '# Room redesign · research synthesis\n\n- Pale oak calms a small room ([2026-11-01 guide](<2026-11-01 guide.md>))\n';
const w = k.writeResearch(project.id, { sources: [{ name: '2026-11-01 guide.md', content: 'x' }], synthesisFor: () => SYN });
const research = await createRecord({
  id: 'a1a1a1a1', kind: 'project-research', status: 'filed', projectId: project.id, text: 'Research: oak or ash?', createdAt: new Date().toISOString(),
  decision: { route: 'project-research', title: 'Oak or ash', payload: { synthesis: [{ claim: 'Pale oak calms a small room', sources: ['https://e.com'] }], sourceList: [{ title: 'Guide', url: 'https://e.com' }] } },
  undoData: { route: 'project-research', projectId: project.id, ...w },
});
const files = k.writeProjectVaultFiles(project.id, [{ rel: 'Sources/Japandi tour.md', content: '---\ntype: source\n---\n# Japandi tour\n\nLow bed, linen, [0:42] the wardrobe.\n' }]);
const watch = await createRecord({
  id: 'b2b2b2b2', kind: 'video', status: 'filed', projectId: project.id, text: 'Watch: https://youtu.be/x', createdAt: new Date().toISOString(),
  decision: { route: 'project-watch-note', title: 'Japandi tour', payload: { body: 'the note' } }, undoData: { route: 'project-watch-note', projectId: project.id, files },
});
const elsewhere = await createRecord({ id: 'c3c3c3c3', kind: 'project-research', status: 'filed', projectId: other.id, text: 'Research: x', createdAt: new Date().toISOString(), decision: { title: 'x' } });

test('without docRef the turn is byte-identical; with it, the document follows the PROJECT section', async () => {
  const plain = await buildAskContext(vault, null);
  const withP = await buildAskContext(vault, null, { projectId: project.id });
  assert.equal(await buildAskContext(vault, null, { projectId: project.id, docRef: null }), withP);
  assert.equal(await buildAskContext(vault, null, { projectId: project.id, docRef: undefined }), withP);
  assert.equal(await buildAskContext(vault, null, {}), plain, 'no project, no change');
  const withDoc = await buildAskContext(vault, null, { projectId: project.id, docRef: research.id });
  assert.ok(withDoc.startsWith(`${withP}\n\nTHE DOCUMENT HE ASKED ABOUT — Oak or ash`), 'project first, byte for byte, then the document');
  assert.ok(withDoc.includes(SYN.trim()));
  assert.equal(await buildAskContext(vault, 'a-session', { projectId: project.id, docRef: research.id }), '', 'a resumed turn still carries nothing');
});

test('a watch card hands in its own Source page', async () => {
  const s = await projectDocSection(vault, project.id, watch.id);
  assert.match(s, /^THE DOCUMENT HE ASKED ABOUT — Japandi tour \(a video watched for the project for Room redesign\)/);
  assert.match(s, /\[0:42\] the wardrobe/);
});

test('a document that cannot be read is named, never silently dropped: missing, wrong project, bad id', async () => {
  const absent = (id) => ABSENT_NOTE([{ label: `the document he asked about (${id})` }]);
  assert.equal(await projectDocSection(vault, project.id, 'deadbeef'), absent('deadbeef'));
  assert.equal(await projectDocSection(vault, project.id, elsewhere.id), absent(elsewhere.id), "another project's card is not this project's document");
  assert.equal(await projectDocSection(vault, project.id, '../x'), absent('../x'));
});

test('a synthesis rewritten since falls back to what that research found, and says so; the body is capped', async () => {
  k.writeResearch(project.id, { sources: [], synthesisFor: () => `# later\n\n${'word '.repeat(3000)}` });
  const s = await projectDocSection(vault, project.id, research.id);
  assert.match(s, /SYNTHESIS\.md has changed since; this is what this research found/);
  assert.match(s, /Pale oak calms a small room/);
  writeFileSync(path.join(project.folder, 'research', 'SYNTHESIS.md'), 'z'.repeat(DOC_CAP * 2));
  const big = await projectDocSection(vault, project.id, research.id, { getRecord: async () => ({ ...research, undoData: { synthesis: { hash: sha('z'.repeat(DOC_CAP * 2)) } } }) });
  assert.match(big, new RegExp(`\\[…cut at ${DOC_CAP} characters\\]$`));
});

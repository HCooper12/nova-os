// PROJECT RESEARCH (Projects phase 2, PROJECTS-PLAN §2): the Researcher's
// panel for one project, its answer checked by code claim by claim, written
// into the project's own research/ folder with an undo. Temp dirs BEFORE any
// import; the panel is stood in for (no CLI, no web).
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-presearch-'));
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
process.env.NOVA_PROTECTED_ROOTS = path.join(base, 'Atomic_Hub');
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.CLAUDE_BIN = path.join(base, 'no-such-claude');

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const pr = await import('../lib/projectResearch.js');
const { novaKernel } = await import('../lib/novaProjects.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { undoRecord, approveRecord } = await import('../lib/inbox.js');
const { projectsRouter } = await import('../routes/projects.js');

const k = novaKernel(vault);
const brief = (name) => ({ name, kind: 'life', goal: 'A calmer bedroom', done: 'Chosen', phases: [{ name: 'Look' }], reads: ['Wiki/Home.md'], allowances: { research: true }, limit: {}, firstMoves: [] });
const { project } = k.createProject(brief('Room redesign'));

const A = 'https://example.com/japandi-guide';
const B = 'https://example.org/oak-vs-ash';
const answer = (over = {}) => ({
  title: 'Japandi for a small bedroom',
  synthesis: [
    { claim: 'Japandi pairs low furniture with pale oak.', sources: [A] },
    { claim: 'Ash is harder than oak.', sources: [B, A] },
    { claim: 'Everyone loves it.', sources: [] },
    { claim: 'Cited to nothing real.', sources: ['https://made-up.example/x'] },
    { claim: 'The room faces west.', sources: ['[[Wiki/Home]]'] },
  ],
  sources: [
    { url: A, title: 'A Japandi guide', fetched: '2026-10-30', said: 'Low beds, pale woods, linen.' },
    { url: B, title: 'Oak vs ash', fetched: 'yesterday', said: 'Ash scores higher on Janka.' },
    { title: 'No link at all', said: 'x' },
  ],
  candidates: [
    { url: 'https://www.youtube.com/watch?v=jpd00001', why: 'a full room tour' },
    { url: 'https://example.com/not-a-video', why: 'a blog' },
  ],
  ...over,
});

let lastShape = null;
function stub(raw, { fail = null } = {}) {
  return pr._setResearchDepsForTest({
    runPanel: async (vaultPath, recordId, q, { shape, context }) => {
      lastShape = { shape, context, prompt: shape.synthesisPrompt(q, [{ name: 'Direct', findings: [{ claim: 'c', url: A }] }]) };
      if (fail) throw new Error(fail);
      shape.tally.usd += 0.42;
      return { ...shape.normalize(raw), mergeModel: 'sonnet', workerModel: 'sonnet' };
    },
  });
}
const research = async (q, raw, opts) => {
  const restore = stub(raw, opts);
  const { record, done } = await pr.startProjectResearchJob(vault, project.id, q);
  await done;
  restore();
  return getRecord(record.id);
};
const researchDir = path.join(project.folder, 'research');
const ls = () => readdirSync(researchDir).filter((f) => !f.startsWith('.')).sort();

test('validator: a claim without a source is dropped and counted; a source without a url is dropped', () => {
  const v = pr.validateProjectResearch(answer(), { reads: ['Wiki/Home.md'], isVideo: (u) => /youtube/.test(u), today: '2026-11-01' });
  assert.deepEqual(v.synthesis.map((c) => c.claim), ['Japandi pairs low furniture with pale oak.', 'Ash is harder than oak.', 'The room faces west.']);
  assert.equal(v.dropped.claims, 2);
  assert.equal(v.dropped.sources, 1);
  assert.equal(v.sources.length, 2);
  assert.equal(v.sources[1].fetched, '2026-11-01', 'a non-date "fetched" becomes the day it was read');
  assert.deepEqual(v.synthesis[2].sources, ['[[Wiki/Home]]'], "a claim may cite one of the project's own pages");
  assert.deepEqual(v.candidates, [{ url: 'https://www.youtube.com/watch?v=jpd00001', why: 'a full room tour' }]);
  assert.equal(v.dropped.candidates, 1);
  // a page the project may not read is not a source
  assert.equal(pr.validateProjectResearch(answer(), { reads: [] }).synthesis.length, 2);
  // garbage in, nothing out
  const none = pr.validateProjectResearch('nope');
  assert.deepEqual([none.synthesis, none.sources, none.candidates], [[], [], []]);
  // at most five candidates
  const many = Array.from({ length: 8 }, (_, i) => ({ url: `https://youtu.be/vid${i}xxxx`, why: 'x' }));
  assert.equal(pr.validateProjectResearch({ candidates: many }, { isVideo: () => true }).candidates.length, 5);
});

test('a research run writes one file per source and SYNTHESIS.md, each line citing its file; one filed card', async () => {
  const r = await research('Japandi or Scandinavian for a small bedroom?', answer());
  assert.equal(r.status, 'filed', r.error);
  assert.equal(r.kind, 'project-research');
  assert.equal(r.projectId, project.id);
  const files = ls();
  assert.equal(files.filter((f) => /^\d{4}-\d{2}-\d{2} /.test(f)).length, 2);
  assert.ok(files.includes('SYNTHESIS.md'));
  const syn = readFileSync(path.join(researchDir, 'SYNTHESIS.md'), 'utf8');
  const claimLines = syn.split('\n').filter((l) => l.startsWith('- ') && !l.includes(' · fetched '));
  assert.equal(claimLines.length, 3);
  for (const l of claimLines) assert.match(l, /\((\[[^\]]+\]\(<[^>]+\.md>\)|\[\[Wiki\/Home\]\])/, `cites a file: ${l}`);
  assert.match(syn, /2 claims left out: no source\./);
  assert.doesNotMatch(syn, /Everyone loves it/);
  const src = readFileSync(path.join(researchDir, files.find((f) => /a-japandi-guide/.test(f))), 'utf8');
  assert.match(src, /^- url: https:\/\/example\.com\/japandi-guide$/m);
  assert.match(src, /^- fetched: 2026-10-30$/m);
  assert.match(src, /^- means: web$/m);
  assert.match(src, /Low beds, pale woods, linen\./);
  assert.match(r.decision.reason, /^3 claims from 2 sources · 2 claims left out: no source\./);
  assert.equal(r.droppedClaims, 2);
  assert.equal(r.costUsd, 0.42);
  assert.equal(r.model, 'sonnet');
  assert.match(k.readLog(project.id), /research “Japandi or Scandinavian/);
  assert.match(lastShape.context, /PROJECT — Room redesign/, "the project's own section is handed in");
  assert.match(lastShape.prompt, /for ONE of Hayden's projects: "Room redesign"/);
  assert.equal(lastShape.shape.lane, 'project-research');
});

test('found videos become ONE pending card; nothing starts; Watch them runs each in turn into the project', async () => {
  const cards = (await listRecords()).filter((x) => x.kind === 'project-watch-candidates' && x.projectId === project.id);
  assert.equal(cards.length, 1);
  const card = cards[0];
  assert.equal(card.status, 'pending');
  assert.equal(card.decision.payload.items.length, 1);
  assert.match(card.decision.reason, /up to ~\$3\.00 each, the Watcher's ceiling/);
  const started = [];
  const restore = pr._setResearchDepsForTest({
    startWatch: async (vp, url, q, opts) => { started.push({ url, opts }); return { record: { id: 'w0000001' }, done: Promise.resolve() }; },
  });
  await assert.rejects(() => pr.watchCandidates(vault, card.id, []), /no videos picked/);
  const filed = await approveRecord(vault, card.id);
  assert.equal(filed.status, 'filed');
  await new Promise((r) => setTimeout(r, 30));
  restore();
  assert.deepEqual(started.map((s) => s.url), ['https://www.youtube.com/watch?v=jpd00001']);
  assert.deepEqual(started[0].opts, { project: { id: project.id } });
  await assert.rejects(() => pr.watchCandidates(vault, card.id, null), /already been answered/);
});

test('a second run keeps the first synthesis in .history; undo puts it back and removes only its own files', async () => {
  const first = readFileSync(path.join(researchDir, 'SYNTHESIS.md'), 'utf8');
  const before = ls();
  const r = await research('Which wood for the bed?', answer({ title: 'Wood', candidates: [], sources: [{ url: 'https://example.net/woods', title: 'Woods compared', said: 'Oak is stable.' }], synthesis: [{ claim: 'Oak is stable.', sources: ['https://example.net/woods'] }] }));
  assert.equal(r.status, 'filed', r.error);
  const hist = readdirSync(path.join(researchDir, '.history'));
  assert.equal(hist.length, 1);
  assert.equal(readFileSync(path.join(researchDir, '.history', hist[0]), 'utf8'), first, 'nothing lost');
  const added = ls().filter((f) => !before.includes(f));
  assert.deepEqual(added.length, 1);
  await undoRecord(vault, r.id);
  assert.equal(readFileSync(path.join(researchDir, 'SYNTHESIS.md'), 'utf8'), first, 'the previous synthesis is back');
  assert.deepEqual(ls(), before, 'exactly its own file went, nothing else');
  assert.deepEqual(readdirSync(path.join(researchDir, '.history')), []);
});

test('undo is refused while a later run owns SYNTHESIS.md', async () => {
  const r1 = await research('Q one?', answer({ candidates: [] }));
  const r2 = await research('Q two?', answer({ candidates: [], title: 'Two' }));
  await assert.rejects(() => undoRecord(vault, r1.id), /undo the later one first/);
  await undoRecord(vault, r2.id);
  await undoRecord(vault, r1.id);
});

test('every claim without a source: an error card, nothing written', async () => {
  const before = ls();
  const r = await research('Unsourced?', { title: 'x', synthesis: [{ claim: 'trust me', sources: [] }], sources: [] });
  assert.equal(r.status, 'error');
  assert.match(r.error, /no claim came back with a source.*\(1 left out\).*Nothing was written/);
  assert.deepEqual(ls(), before);
});

test('a failed panel is an error card, nothing written; it can be retried in place', async () => {
  const before = ls();
  const r = await research('Will fail?', answer(), { fail: 'all 4 researchers failed — usage' });
  assert.equal(r.status, 'error');
  assert.deepEqual(ls(), before);
  const restore = stub(answer({ candidates: [] }));
  await pr.retryProjectResearch(vault, r);
  await new Promise((res) => setTimeout(res, 50));
  restore();
  assert.equal((await getRecord(r.id)).status, 'filed');
});

test('refused before anything starts: linked, missing, archived, empty question, protected folder', async () => {
  await assert.rejects(() => pr.startProjectResearch(vault, 'atlas', 'q'), (e) => e.code === 'linked');
  await assert.rejects(() => pr.startProjectResearch(vault, 'deadbeef', 'q'), (e) => e.code === 'missing');
  await assert.rejects(() => pr.startProjectResearch(vault, project.id, '  '), (e) => e.code === 'question');
  const { project: arch } = k.createProject(brief('Old room'));
  k.archiveProject(arch.id);
  await assert.rejects(() => pr.startProjectResearch(vault, arch.id, 'q'), (e) => e.code === 'stage');
  const protectedVault = path.join(base, 'Atomic_Hub', 'vault');
  mkdirSync(protectedVault, { recursive: true });
  await assert.rejects(() => pr.startProjectResearch(protectedVault, project.id, 'q'), (e) => e.code === 'protected');
});

test('the kernel research writer refuses a protected folder and a name that is a path', async () => {
  const { makeKernel } = await import('../lib/projectKernel.js');
  const guarded = makeKernel({ name: 'Nova', projectsRoot: path.join(base, 'P2'), dataDir: path.join(base, 'data2'), vaultRoot: null, isProtected: (p) => p.includes(`${path.sep}research`) });
  const { project: g } = guarded.createProject({ ...brief('Guarded'), reads: [] });
  assert.throws(() => guarded.writeResearch(g.id, { sources: [], synthesisFor: () => 'y' }), (e) => e.code === 'protected');
  assert.throws(() => k.writeResearch(project.id, { sources: [{ name: '../escape.md', content: 'x' }], synthesisFor: () => 'y' }), /not a research file name/);
  assert.throws(() => k.writeResearch(project.id, { sources: [{ name: 'SYNTHESIS.md', content: 'x' }], synthesisFor: () => 'y' }), /not a research file name/);
});

test('HTTP: research on a linked project is 403 and writes nothing; on his project it returns a jobId', async (t) => {
  writeFileSync(path.join(process.env.NOVA_DATA_DIR, 'code-workspaces.json'), JSON.stringify({ workspaces: [{ key: 'atlas', title: 'Science Atlas', path: path.join(base, 'atlas') }] }));
  mkdirSync(path.join(base, 'atlas'), { recursive: true });
  const app = express();
  app.use(express.json());
  app.use('/api', projectsRouter({ vaultPath: vault, repoRoot: path.join(base, 'repo'), sessions: async () => ({ groups: [] }) }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => srv.close());
  const post = (p, body) => fetch(`http://127.0.0.1:${srv.address().port}/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const recsBefore = (await listRecords()).length;
  const linked = await post('/projects/atlas/research', { question: 'anything' });
  assert.equal(linked.status, 403);
  assert.deepEqual(readdirSync(path.join(base, 'atlas')), [], 'nothing written in the linked folder');
  assert.equal((await listRecords()).length, recsBefore, 'no card either');
  const restore = stub(answer({ candidates: [] }));
  const ok = await post(`/projects/${project.id}/research`, { question: 'Which rug?' });
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.match(body.jobId, /^[0-9a-f]{8}$/);
  await new Promise((r) => setTimeout(r, 50));
  restore();
  assert.equal((await getRecord(body.jobId)).status, 'filed');
  const watchLinked = await post('/projects/atlas/watch', { url: 'https://youtu.be/abcdefgh' });
  assert.equal(watchLinked.status, 403);
});

test.after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 3 }); void existsSync; });

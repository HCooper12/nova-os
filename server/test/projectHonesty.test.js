// Projects phase 2, the failure modes over HTTP and across jobs (T5): a
// duplicate is refused naming the first, a candidates run says per link what
// happened, the library door refuses what Nova did not flag, and a retried
// project watch is still a project watch. Temp dirs first; no CLI, no web.
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-phonest-'));
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.CLAUDE_BIN = path.join(base, 'no-such-claude');

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const watcher = await import('../lib/watcher.js');
const pr = await import('../lib/projectResearch.js');
const { novaKernel } = await import('../lib/novaProjects.js');
const { createRecord, getRecord, updateRecord } = await import('../lib/inboxStore.js');
const { retryRecord } = await import('../lib/inbox.js');
const { projectsRouter } = await import('../routes/projects.js');
const { inboxRouter } = await import('../routes/inbox.js').catch(() => ({}));

const k = novaKernel(vault);
const { project } = k.createProject({ name: 'Room redesign', kind: 'life', goal: 'g', done: 'd', phases: [{ name: 'Look' }], reads: [], allowances: {}, limit: {} });
const words = { title: 'Tour', uploader: 'S', duration: '1:00', transcriptSource: 'captions', transcript: '[00:01] hello', frames: [] };
const reply = (over = {}) => JSON.stringify({ lane: 'reference', title: 'Tour', verdict: 'v', body: 'b', libraryWorthy: { yes: false, reason: '' }, ...over });
let calls = [];
const restore = watcher._setWatchDepsForTest({
  fetchReport: async (url, wd, opts) => { calls.push({ url, opts }); return words; },
  fetchCarousel: async () => null,
  runClaude: async (cwd, prompt, opts) => { calls.push({ lane: opts.lane }); return reply({ title: `Tour ${calls.length}` }); },
});
test.after(() => { restore(); rmSync(base, { recursive: true, force: true, maxRetries: 3 }); });

async function server(t) {
  const app = express();
  app.use(express.json());
  app.use('/api', projectsRouter({ vaultPath: vault, repoRoot: path.join(base, 'repo'), sessions: async () => ({ groups: [] }) }));
  if (inboxRouter) app.use('/api', inboxRouter(vault));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => srv.close());
  return (p, body) => fetch(`http://127.0.0.1:${srv.address().port}/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
}
const settle = async (id) => { for (let i = 0; i < 100; i++) { const r = await getRecord(id); if (r.status !== 'classifying') return r; await new Promise((x) => setTimeout(x, 10)); } return getRecord(id); };

test('HTTP: a video for the project starts; the same link again is 409 and names the first; not a video is 400', async (t) => {
  const post = await server(t);
  const one = await post(`/projects/${project.id}/watch`, { url: 'https://www.youtube.com/watch?v=dup00001', lens: 'claims' });
  assert.equal(one.status, 200);
  const { recordId } = await one.json();
  const first = await settle(recordId);
  assert.equal(first.status, 'filed', first.error);
  assert.equal(first.lens, 'claims');
  const again = await post(`/projects/${project.id}/watch`, { url: 'https://youtu.be/dup00001' });
  assert.equal(again.status, 409);
  assert.match((await again.json()).error, /Room redesign already has this video: “Tour \d+”/);
  assert.equal((await post(`/projects/${project.id}/watch`, { url: 'https://example.com/a-blog' })).status, 400);
  assert.equal((await post(`/projects/${project.id}/watch`, { url: 'https://youtu.be/zzzzzzzz', lens: 'vibes' })).status, 400);
});

test('candidates: each link says what happened; one already in the project is an error naming the first, the rest are watched', async () => {
  await watcher.startVideoWatchJob(vault, 'https://www.youtube.com/watch?v=had00001', '', { project: { id: project.id } }).then((j) => j.done);
  const card = await createRecord({
    id: 'cafecafe', kind: 'project-watch-candidates', projectId: project.id, status: 'pending', createdAt: new Date().toISOString(), text: '2 videos',
    decision: { route: 'project-watch-candidates', title: '2', payload: { items: [{ url: 'https://www.youtube.com/watch?v=had00001', why: 'x' }, { url: 'https://www.youtube.com/watch?v=new00001', why: 'y' }] } },
  });
  await pr.watchCandidates(vault, card.id, null);
  let r;
  for (let i = 0; i < 200; i++) { r = await getRecord(card.id); if (r.watching.every((w) => w.status === 'filed' || w.status === 'error')) break; await new Promise((x) => setTimeout(x, 10)); }
  assert.equal(r.status, 'filed');
  assert.equal(r.watching[0].status, 'error');
  assert.match(r.watching[0].error, /already has this video/);
  assert.equal(r.watching[1].status, 'filed');
  assert.equal(r.undoData, undefined, 'the card itself wrote nothing, so it has no undo; each watch has its own');
});

test('the library door: 404 for an unknown record, 400 for a note Nova did not flag, and nothing written', async (t) => {
  if (!inboxRouter) return t.skip('inbox router not importable here');
  const post = await server(t);
  assert.equal((await post('/inbox/deadbeef/file-to-library')).status, 404);
  const { record, done } = await watcher.startVideoWatchJob(vault, 'https://www.youtube.com/watch?v=lib00001', '', { project: { id: project.id } });
  await done;
  const res = await post(`/inbox/${record.id}/file-to-library`);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /did not flag/);
  assert.equal(existsSync(path.join(vault, 'Wiki')), false);
});

test('a failed project watch retries as a project watch, with its lens, into the project only', async () => {
  const { record, done } = await watcher.startVideoWatchJob(vault, 'https://www.youtube.com/watch?v=ret00001', '', { project: { id: project.id }, lens: 'claims' });
  await done;
  // make it look failed, then retry through the Inbox's own door
  await updateRecord(record.id, { status: 'error', error: 'network', decision: null, undoData: null });
  rmSync(path.join(vault, 'Projects/Room redesign/Sources'), { recursive: true, force: true });
  rmSync(path.join(vault, 'Projects/Room redesign/Raw'), { recursive: true, force: true });
  calls = [];
  await retryRecord(vault, record.id);
  const after = await settle(record.id);
  assert.equal(after.status, 'filed', after.error);
  assert.equal(after.decision.route, 'project-watch-note');
  assert.equal(after.lens, 'claims');
  assert.ok(after.undoData.files.every((f) => f.relPath.startsWith('Projects/Room redesign/')));
  assert.equal(existsSync(path.join(vault, 'Wiki')), false);
});

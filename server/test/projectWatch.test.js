// THE PROJECT WATCHER (Projects phase 2, PROJECTS-PLAN §2): a video sent to a
// project lands ONLY in Projects/<Name>/Sources + Raw, through the project's
// lens, and goes to his library only on his tap. Every directory is a temp
// one, set BEFORE any import; the watch script, the carousel reader and the
// model are stood in for (no python, no network, no CLI).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-pwatch-'));
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
process.env.NOVA_PROTECTED_ROOTS = path.join(base, 'Atomic_Hub');
process.env.VAULT_PATH = vault;
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.CLAUDE_BIN = path.join(base, 'no-such-claude');

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const watcher = await import('../lib/watcher.js');
const { novaKernel, fileProjectWatchToLibrary } = await import('../lib/novaProjects.js');
const { getRecord, updateRecord } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');

const brief = (over = {}) => ({
  name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'Furniture chosen',
  phases: [{ name: 'Look' }, { name: 'Choose' }], reads: [], allowances: { research: true }, limit: {}, firstMoves: [], ...over,
});

// every file under the vault, relative, so a test can say what a run added
function tree(dir = vault, rel = '') {
  const out = [];
  for (const n of readdirSync(dir)) {
    const full = path.join(dir, n);
    const r = rel ? `${rel}/${n}` : n;
    if (statSync(full).isDirectory()) out.push(...tree(full, r)); else out.push(r);
  }
  return out;
}
const added = (before) => tree().filter((f) => !before.includes(f));

let calls = [];
const verdict = (over = {}) => JSON.stringify({ lane: 'reference', title: 'Japandi bedroom tour', verdict: 'Worth it for the storage.', body: 'Low bed, oak, linen. [0:42] the wardrobe.', libraryWorthy: { yes: false, reason: '' }, ...over });
function stub({ report, reply = verdict(), design = null, throwFetch = null } = {}) {
  calls = [];
  return watcher._setWatchDepsForTest({
    fetchReport: async (url, workDir, opts) => {
      calls.push({ fetch: opts });
      if (throwFetch) throw new Error(throwFetch);
      return typeof report === 'function' ? report(workDir, opts) : report;
    },
    fetchCarousel: async () => null,
    runClaude: async (cwd, prompt, opts) => {
      calls.push({ cwd, prompt, opts });
      return opts.lane === 'watcher-design' ? (design ?? verdict({ lane: 'design', framesRead: 3 })) : reply;
    },
  });
}
const words = { title: 'Japandi bedroom tour', uploader: 'Studio', duration: '8:02', transcriptSource: 'captions', transcript: '[00:01] welcome to the room\n[00:42] the wardrobe', frames: [] };
// frames on disk, the way watch.py leaves them
function withFrames(workDir) {
  const dir = path.join(workDir, 'frames');
  mkdirSync(dir, { recursive: true });
  const frames = [1, 2, 3].map((i) => { const p = path.join(dir, `frame_000${i}.jpg`); writeFileSync(p, 'jpg'); return { path: p, t: `00:0${i}` }; });
  return { ...words, frames };
}

let n = 0;
const url = () => `https://www.youtube.com/watch?v=room${String(++n).padStart(4, '0')}`;
async function watch(projectId, link, opts = {}) {
  const { record, done } = await watcher.startVideoWatchJob(vault, link, '', { project: { id: projectId }, ...opts });
  await done;
  return getRecord(record.id);
}

const k = novaKernel(vault);
const { project } = k.createProject(brief());
const dir = 'Projects/Room redesign';

test('a project watch writes only under Projects/<Name>/, never the library, never the weave', async () => {
  const restore = stub({ report: words });
  const before = tree();
  const r = await watch(project.id, url());
  restore();
  assert.equal(r.status, 'filed', r.error);
  assert.equal(r.projectId, project.id);
  assert.equal(r.decision.route, 'project-watch-note');
  const now = added(before);
  assert.deepEqual(now.sort(), [`${dir}/Raw/Japandi bedroom tour (Transcript).md`, `${dir}/Sources/Japandi bedroom tour.md`]);
  assert.ok(now.every((f) => f.startsWith(`${dir}/`)), now.join());
  assert.equal(existsSync(path.join(vault, 'Wiki')), false, 'no Wiki/ was made');
  assert.equal(existsSync(path.join(vault, 'Raw')), false, 'no vault Raw/ was made');
  assert.equal(existsSync(path.join(process.env.NOVA_DATA_DIR, 'ingest')), false, 'the ingest weave never started');
  const page = readFileSync(path.join(vault, dir, 'Sources/Japandi bedroom tour.md'), 'utf8');
  assert.match(page, /^type: source$/m);
  assert.match(page, new RegExp(`^project: ${project.id}$`, 'm'));
  assert.match(page, /^lens: reference$/m);
  assert.match(page, /\*\*Read by:\*\* sonnet · reference lens/, 'the model is named on the note');
  // the model ran in the job's temp folder with Read only, not in the vault
  const run = calls.find((c) => c.opts);
  assert.notEqual(run.cwd, vault);
  assert.equal(run.opts.allowedTools, 'Read');
  for (const t of ['Edit', 'Write', 'Bash', 'Grep']) assert.ok(run.opts.disallowed.split(',').includes(t), t);
  assert.match(k.readLog(project.id), /watched “Japandi bedroom tour” \(reference lens\)/);
});

test('the design lens looks at the frames from inside their folder with Read and nothing else', async () => {
  const restore = stub({ report: (wd) => withFrames(wd) });
  const r = await watch(project.id, url(), { lens: 'design' });
  restore();
  assert.equal(r.status, 'filed', r.error);
  assert.equal(calls[0].fetch.frames, true, 'frames were asked of the watch script');
  const run = calls.find((c) => c.opts?.lane === 'watcher-design');
  assert.ok(run, 'the design lane ran');
  assert.equal(path.basename(run.cwd), 'frames');
  assert.equal(run.opts.cwd, run.cwd);
  assert.equal(run.opts.allowedTools, 'Read');
  const deny = run.opts.disallowed.split(',');
  for (const t of ['Edit', 'Write', 'Bash', 'WebFetch', 'WebSearch', 'Grep', 'Glob']) assert.ok(deny.includes(t), t);
  assert.ok(!deny.includes('Read'));
  assert.match(run.prompt, /frame_0001\.jpg \(t=00:01\)/);
  assert.equal(r.lensUsed, 'design');
  assert.match(r.decision.payload.body, /\*\*Read by:\*\* sonnet · design lens · 3 of 3 frames looked at/);
  assert.doesNotMatch(r.decision.payload.body, /Design lens unavailable/);
});

test('no frames on this Mac: the design lens falls back to reference and the note says so first', async () => {
  const restore = stub({ report: words });
  const r = await watch(project.id, url(), { lens: 'design' });
  restore();
  assert.equal(r.status, 'filed', r.error);
  assert.equal(r.lensUsed, 'reference');
  assert.ok(!calls.some((c) => c.opts?.lane === 'watcher-design'), 'no design pass without frames');
  const page = readFileSync(path.join(vault, r.undoData.files[0].relPath), 'utf8');
  const firstLine = page.split('\n---\n')[1].split('\n').filter((l) => l.trim() && !l.startsWith('# '))[0];
  assert.match(firstLine, /^\*\*Design lens unavailable:\*\* no frames came out of the video on this Mac/);
});

test('frames the model could not open (framesRead 0) also fall back, honestly', async () => {
  const restore = stub({ report: (wd) => withFrames(wd), design: verdict({ lane: 'design', framesRead: 0 }) });
  const r = await watch(project.id, url(), { lens: 'design' });
  restore();
  assert.equal(r.lensUsed, 'reference');
  assert.match(r.decision.payload.body, /^\*\*Design lens unavailable:\*\* the model reported it could not open any of the frames/);
});

test('no transcript and no frames: an error card, and nothing written', async () => {
  const restore = stub({ report: { ...words, transcript: null, frames: [] } });
  const before = tree();
  const r = await watch(project.id, url(), { lens: 'design' });
  restore();
  assert.equal(r.status, 'error');
  assert.match(r.error, /nothing to read/i);
  assert.match(r.error, /Nothing was written/);
  assert.deepEqual(added(before), []);
});

test('the same URL twice in one project: the second is refused, naming the first', async () => {
  const restore = stub({ report: words });
  const link = url();
  await watch(project.id, link);
  await assert.rejects(() => watcher.startVideoWatch(vault, `${link}&si=abc`, '', { project: { id: project.id } }), (e) => e.code === 'duplicate' && /already has this video: “Japandi bedroom tour”/.test(e.message));
  restore();
});

test('a linked project, an unknown lens and a lens with no project are refused before anything starts', async () => {
  await assert.rejects(() => watcher.startVideoWatch(vault, url(), '', { project: { id: 'atlas' } }), (e) => e.code === 'linked');
  await assert.rejects(() => watcher.startVideoWatch(vault, url(), '', { project: { id: project.id }, lens: 'vibes' }), (e) => e.code === 'lens');
  await assert.rejects(() => watcher.startVideoWatch(vault, url(), '', { lens: 'design' }), /lens belongs to a project/);
});

test('a project whose vault page was deleted still files, into a recreated Sources/', async () => {
  const { project: p2 } = k.createProject(brief({ name: 'Study nook' }));
  rmSync(path.join(vault, 'Projects/Study nook'), { recursive: true, force: true });
  const restore = stub({ report: words });
  const r = await watch(p2.id, url());
  restore();
  assert.equal(r.status, 'filed', r.error);
  assert.ok(existsSync(path.join(vault, 'Projects/Study nook/Sources/Japandi bedroom tour.md')));
});

test('a project that cannot be written (undone after the watch began) ends as an error card, nothing written', async () => {
  const { project: p3 } = k.createProject(brief({ name: 'Hallway' }));
  const before = tree();
  const restore = stub({
    report: () => { k.undoCreate(p3.id); return words; }, // the project goes away mid-run
  });
  const r = await watch(p3.id, url());
  restore();
  assert.equal(r.status, 'error');
  assert.match(r.error, /not filed: .*undone/);
  assert.deepEqual(added(before).filter((f) => !f.startsWith('Projects/Hallway/')), []);
  assert.ok(!existsSync(path.join(vault, 'Projects/Hallway/Sources/Japandi bedroom tour.md')));
});

test('undo of a project watch removes exactly its two files and nothing else', async () => {
  const restore = stub({ report: words });
  const r = await watch(project.id, url(), { lens: 'claims' });
  restore();
  const before = tree();
  const files = r.undoData.files.map((f) => f.relPath);
  assert.equal(files.length, 2);
  await undoRecord(vault, r.id);
  const after = tree();
  assert.deepEqual(before.filter((f) => !after.includes(f)).sort(), files.sort());
  assert.deepEqual(after.filter((f) => !before.includes(f)).filter((f) => !f.includes('.nova-backups')), []);
});

test('the claims lens may use the web; reference may not', async () => {
  const restore = stub({ report: words });
  await watch(project.id, url(), { lens: 'claims' });
  restore();
  const run = calls.find((c) => c.opts);
  assert.equal(run.opts.allowedTools, 'Read WebSearch WebFetch');
  assert.match(run.prompt, /LENS "claims"/);
});

test('library flag: strictly validated, and only HIS tap files it to Wiki/Sources + Raw, with its own undo', async () => {
  assert.deepEqual(watcher.normalizeLibraryWorthy({ yes: 'yes', reason: 'x' }), { yes: false, reason: '' });
  assert.deepEqual(watcher.normalizeLibraryWorthy({ yes: true, reason: '  ' }), { yes: false, reason: '' });
  assert.deepEqual(watcher.normalizeLibraryWorthy(undefined), { yes: false, reason: '' });
  assert.deepEqual(watcher.normalizeLibraryWorthy({ yes: true, reason: 'A general idea on light.' }), { yes: true, reason: 'A general idea on light.' });

  const restore = stub({ report: words, reply: verdict({ title: 'Light and sleep', libraryWorthy: { yes: true, reason: 'It is about sleep, not just this room.' } }) });
  const r = await watch(project.id, url());
  restore();
  assert.deepEqual(r.libraryWorthy, { yes: true, reason: 'It is about sleep, not just this room.' });
  assert.equal(existsSync(path.join(vault, 'Wiki')), false, 'nothing in the library before his tap');
  const before = tree();
  const { record: lib } = await fileProjectWatchToLibrary(vault, r.id);
  const now = added(before).sort();
  assert.deepEqual(now, ['Raw/Light and sleep (Transcript).md', 'Wiki/Sources/Light and sleep.md']);
  assert.equal(lib.status, 'filed');
  assert.equal(lib.projectId, undefined, 'the library copy is not a project record');
  assert.equal((await getRecord(r.id)).libraryRecordId, lib.id);
  assert.equal(existsSync(path.join(process.env.NOVA_DATA_DIR, 'ingest')), false, 'no weave');
  await assert.rejects(() => fileProjectWatchToLibrary(vault, r.id), /already in your library/);
  // its own undo takes back the library copy; the project's copy stays
  await undoRecord(vault, lib.id);
  assert.equal(existsSync(path.join(vault, 'Wiki/Sources/Light and sleep.md')), false);
  assert.ok(existsSync(path.join(vault, dir, 'Sources/Light and sleep.md')));
});

test('no library action on a note Nova did not flag', async () => {
  const restore = stub({ report: words });
  const r = await watch(project.id, url());
  restore();
  await assert.rejects(() => fileProjectWatchToLibrary(vault, r.id), /did not flag/);
});

test('the kernel vault writer refuses a path outside the project and a symlinked Sources', () => {
  assert.throws(() => k.writeProjectVaultFiles(project.id, [{ rel: '../Other/x.md', content: 'x' }]), /not a path inside the project/);
  assert.throws(() => k.writeProjectVaultFiles(project.id, [{ rel: '/etc/x.md', content: 'x' }]), /not a path inside the project/);
  const { project: p4 } = k.createProject(brief({ name: 'Porch' }));
  const out = path.join(base, 'elsewhere');
  mkdirSync(out, { recursive: true });
  rmSync(path.join(vault, 'Projects/Porch/Sources'), { recursive: true, force: true });
  symlinkSync(out, path.join(vault, 'Projects/Porch/Sources'));
  assert.throws(() => k.writeProjectVaultFiles(p4.id, [{ rel: 'Sources/x.md', content: 'x' }]), /resolves outside/);
  assert.deepEqual(readdirSync(out), []);
});

test('the Watcher refuses to run its model in a protected folder', async () => {
  const atlas = path.join(base, 'Atomic_Hub', 'frames');
  mkdirSync(atlas, { recursive: true });
  const frames = [{ path: path.join(atlas, 'frame_0001.jpg'), t: '00:01' }];
  writeFileSync(frames[0].path, 'jpg');
  const restore = stub({ report: { ...words, frames } });
  const r = await watch(project.id, url(), { lens: 'design' });
  restore();
  assert.ok(!calls.some((c) => c.cwd && c.cwd.startsWith(path.join(base, 'Atomic_Hub'))), 'no model ran in the protected folder');
  assert.equal(r.lensUsed, 'reference');
  assert.match(r.decision.payload.body, /Design lens unavailable:\*\* the frames could not be read \(Nova never writes to Science Atlas/);
});

test('the project lens is a validated setting, default reference', () => {
  const { project: p5 } = k.createProject(brief({ name: 'Garden' }));
  assert.equal(p5.lens, 'reference');
  assert.throws(() => k.applySettings(p5.id, { lens: 'vibes' }), /lens/);
  assert.equal(k.applySettings(p5.id, { lens: 'design' }).project.lens, 'design');
});

test.after(() => { rmSync(base, { recursive: true, force: true, maxRetries: 3 }); void updateRecord; });

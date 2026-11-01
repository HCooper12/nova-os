// A SPEC PER BUILD (1 Nov 2026, Wren parity: lib/spec.mjs + lib/jobs.mjs).
// Before a build spawns, code writes server/data/builds/<jobId>.spec.md from
// his brief (ask, paths, acceptance check, suites), the Builder's prompt
// carries it verbatim, and the job's result carries spec: { path, check }.
// A brief with no stated check says 'none stated'; none is invented.
//
// Everything temporary: NOVA_DATA_DIR and the projects root are mkdtemp
// folders set BEFORE any import, and the claude CLI is a stub that reports
// whether the spec file was already on disk when it was spawned.
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'nova-build-spec-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_PROJECTS_DIR = mkdtempSync(path.join(tmpdir(), 'nova-build-spec-projects-'));

// One stub for both lanes. One-shot (builder.js): the prompt is -p. Warm
// (the Code screen): each stdin line is one user message of text blocks.
// Either way it finds the spec's path in what it was handed and says whether
// that file existed the moment it looked.
const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-build-spec-cli-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const look = (text) => {
  const m = /it is on disk at (\\S+?\\.spec\\.md)\\)/.exec(text);
  return m ? (fs.existsSync(m[1]) ? 'SPEC ON DISK ' + m[1] : 'SPEC MISSING ' + m[1]) : 'NO SPEC';
};
if (!args.includes('--input-format')) {
  const prompt = args[args.indexOf('-p') + 1] || '';
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: look(prompt) + ' | ' + JSON.stringify(prompt) }));
  process.exit(0);
}
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const blocks = JSON.parse(line).message.content.map((c) => c.text);
  const said = look(blocks.join('\\n')) + ' | ' + JSON.stringify(blocks);
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: said }) + '\\n');
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const { test, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { statedCheck, namedPaths, specFromBrief, specText, writeSpec, NONE_STATED, BUILDS_DIR } = await import('../lib/buildSpec.js');
const { startBuild, getBuildJob, buildPrompt } = await import('../lib/builder.js');
const { startMessage, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');

after(() => {
  _dropAllWarm();
  for (const d of [dataDir, process.env.NOVA_PROJECTS_DIR, stubDir]) rmSync(d, { recursive: true, force: true });
});

const waitFor = async (pred, ms = 20_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = pred();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
};

/* ------------------------------------------------------------ the words -- */

test('the acceptance check is his own sentence when he states one, and only then', () => {
  assert.equal(statedCheck('Add a rest timer to the workout card. Done when the timer starts as I rack the bar.'), 'Done when the timer starts as I rack the bar.');
  assert.equal(statedCheck('Build a landing page.\nAcceptance: it loads at 375px with no horizontal scroll'), 'Acceptance: it loads at 375px with no horizontal scroll');
  assert.equal(statedCheck('Rename the slot. Make sure every reader of the old name still passes its tests.'), 'Make sure every reader of the old name still passes its tests.');
  assert.equal(statedCheck("You'll know it works when the Fuel ring fills after a log."), "You'll know it works when the Fuel ring fills after a log.");
  // a check mentioned in passing is not his acceptance test
  assert.equal(statedCheck('Check the README and tidy the intro.'), null);
  assert.equal(statedCheck('Build me a pixel-perfect website from that mockup.'), null);
  assert.equal(statedCheck(''), null);
});

test('the paths the brief names, and never a URL', () => {
  assert.deepEqual(namedPaths('Fix src/App.jsx and server/lib/alerts.js, then update README.md. See https://example.com/a/b.'), ['src/App.jsx', 'server/lib/alerts.js', 'README.md']);
  assert.deepEqual(namedPaths('Make it nicer.'), []);
});

test('a brief without a stated check gets "none stated", never an invented one', () => {
  const spec = specFromBrief({ jobId: 'abc12345', brief: 'Build me a recipe site.', lane: 'project', dir: '/tmp/x/recipe-site', shell: true, now: new Date('2026-11-01T00:00:00Z') });
  assert.equal(spec.check, NONE_STATED);
  assert.equal(spec.stated, false);
  const text = specText(spec);
  assert.match(text, /^# Spec for build abc12345\n/);
  assert.match(text, /## Ask\n\nBuild me a recipe site\.\n/);
  assert.match(text, /## Paths it may touch\n\n- \/tmp\/x\/recipe-site \(a new, empty project folder/);
  assert.match(text, /## Acceptance check\n\nnone stated\. He gave no check, so none is invented here\./);
  assert.match(text, /## Suites to run\n\nnone yet: the folder starts empty\./);
  assert.match(text, /No model wrote this\./);
});

test('the Code lane lists the workspace\'s own suites, the ones Nova runs after the turn', () => {
  const ws = mkdtempSync(path.join(tmpdir(), 'nova-build-spec-ws-'));
  writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ scripts: { lint: 'x', build: 'y', test: 'z' } }));
  try {
    const spec = specFromBrief({ jobId: 'j1', brief: 'Tidy src/a.js. Verify that npm test passes.', lane: 'code', cwd: ws });
    assert.deepEqual(spec.suites, ['Lint: npm run lint', 'Build: npm run build', 'Tests: npm test']);
    assert.equal(spec.check, 'Verify that npm test passes.');
    assert.deepEqual(spec.named, ['src/a.js']);
    assert.equal(specFromBrief({ jobId: 'j2', brief: 'x', lane: 'code', cwd: ws, verify: false }).suites.length, 0);
    const written = writeSpec(spec);
    assert.equal(written.path, path.join(BUILDS_DIR(), 'j1.spec.md'));
    assert.equal(readFileSync(written.path, 'utf8'), specText(spec));
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

/* ------------------------------------------- builder.js: a new project -- */

test('startBuild: the spec is on disk before the spawn, the prompt carries it verbatim, the result names it', async () => {
  const brief = 'Build a one-page timer site. Done when the start button counts down from 60.';
  const jobId = startBuild(brief, { name: 'spec timer' });
  const specPath = path.join(BUILDS_DIR(), `${jobId}.spec.md`);
  assert.ok(existsSync(specPath), 'written before startBuild returned (the spawn follows it)');
  const job = await waitFor(() => { const j = getBuildJob(jobId); return j && j.status !== 'running' ? j : null; });
  assert.equal(job.status, 'done', job.error);
  assert.deepEqual(job.result.spec, { path: specPath, check: 'Done when the start button counts down from 60.' });
  const [seen, promptJson] = job.result.summary.split(' | ');
  assert.equal(seen, `SPEC ON DISK ${specPath}`, 'the Builder found the spec already written');
  const prompt = JSON.parse(promptJson);
  assert.ok(prompt.startsWith('You are building something for Hayden'));
  assert.ok(prompt.includes(readFileSync(specPath, 'utf8')), 'the spec, verbatim');
  assert.ok(prompt.indexOf(brief) < prompt.indexOf('THE SPEC FOR THIS BUILD'), 'after his words');
  // the prompt builder without a spec is the prompt it always was
  assert.ok(!buildPrompt(brief, 'x', { shell: true }).includes('THE SPEC'));
});

/* ----------------------------------- claudeCode.js: the Code screen -- */

test('the Code Builder: the spec rides the first turn beside his words; the result carries it', async () => {
  const ws = mkdtempSync(path.join(tmpdir(), 'nova-build-spec-code-'));
  try {
    const jobId = startMessage(ws, { text: 'Add a footer to index.html.' });
    const specPath = path.join(BUILDS_DIR(), `${jobId}.spec.md`);
    assert.ok(existsSync(specPath), 'written before the turn spawned');
    const job = await waitFor(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
    assert.equal(job.status, 'ready', job.error);
    const [seen, blocksJson] = job.result.text.split(' | ');
    assert.equal(seen, `SPEC ON DISK ${specPath}`);
    const blocks = JSON.parse(blocksJson);
    assert.equal(blocks[0], 'Add a footer to index.html.', 'his words are their own block, first and unchanged');
    assert.ok(blocks[1].includes(readFileSync(specPath, 'utf8')), 'the spec, verbatim, in the next block');
    assert.deepEqual(job.result.spec, { path: specPath, check: NONE_STATED });
    const text = readFileSync(specPath, 'utf8');
    assert.match(text, /The brief names: index\.html/);
    assert.match(text, new RegExp(`files inside ${ws.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('a read-only turn (the vault lane) is not a build and writes no spec', async () => {
  const ws = mkdtempSync(path.join(tmpdir(), 'nova-build-spec-ro-'));
  try {
    const jobId = startMessage(ws, { text: 'What is in here?', readOnly: true });
    assert.ok(!existsSync(path.join(BUILDS_DIR(), `${jobId}.spec.md`)));
    const job = await waitFor(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
    assert.equal(job.result.spec, undefined);
    assert.match(job.result.text, /^NO SPEC/);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

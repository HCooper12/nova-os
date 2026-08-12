// Point the module at a temp dir BEFORE importing it — tests must never
// touch the real data directory or spawn a real (expensive) build.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-forge-'));
const forgeDir = await mkdtemp(path.join(tmpdir(), 'nova-forge-root-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_FORGE_DIR = forgeDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  slugify, describeToolUse, readStreamEvent, buildForgePrompt, parseBuiltLine,
  discardForgeArtifacts, listJobs,
} = await import('../lib/forge.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(forgeDir, { recursive: true, force: true });
});

test('slugify makes a safe directory name from a spoken sentence', async () => {
  assert.equal(slugify('Build me a retro snake game!'), 'build-me-a-retro-snake-game');
  assert.equal(slugify('   '), 'job', 'never an empty path segment');
  assert.ok(slugify('x'.repeat(200)).length <= 40, 'bounded so the path stays sane');
  assert.ok(!slugify('../../etc/passwd').includes('/'), 'no path separators survive');
  assert.ok(!slugify('../../etc/passwd').includes('..'), 'no traversal survives');
});

test('tool events become plain English for the watch, never JSON', async () => {
  assert.equal(describeToolUse('Bash', { command: 'npm  install\n' }), 'Running npm install');
  assert.equal(describeToolUse('Write', { file_path: '/tmp/a/index.html' }), 'Writing index.html');
  assert.equal(describeToolUse('Edit', { file_path: '/tmp/a/game.js' }), 'Editing game.js');
  assert.equal(describeToolUse('Glob', { pattern: '*.html' }), 'Searching for *.html');
  assert.equal(describeToolUse('SomethingNew', {}), 'Using SomethingNew', 'an unknown tool still reads honestly');
  assert.equal(describeToolUse(null), null);
  const long = describeToolUse('Bash', { command: 'x'.repeat(500) });
  assert.ok(long.length < 100, 'a huge command is truncated, not streamed onto a watch face');
});

test('readStreamEvent pulls the live status line out of a real assistant event', async () => {
  const ev = {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }] },
  };
  assert.deepEqual(readStreamEvent(ev), { kind: 'tool', line: 'Running ls -la' });
});

test('readStreamEvent reports the result honestly, including cost and failure', async () => {
  const ok = readStreamEvent({ type: 'result', is_error: false, result: 'BUILT the snake game is ready', total_cost_usd: 0.42 });
  assert.equal(ok.kind, 'result');
  assert.equal(ok.isError, false);
  assert.equal(ok.costUsd, 0.42);

  const bad = readStreamEvent({ type: 'result', is_error: true, result: 'budget exceeded', total_cost_usd: 4 });
  assert.equal(bad.isError, true, 'a failure is never read as a success');
  assert.equal(bad.costUsd, 4, 'and the cost is still recorded — it was really spent');

  assert.equal(readStreamEvent({ type: 'result', is_error: false, result: 'x' }).costUsd, null,
    'a missing cost is null, never a guessed number');
});

test('readStreamEvent ignores noise without throwing', async () => {
  assert.equal(readStreamEvent(null), null);
  assert.equal(readStreamEvent({ type: 'system' }), null);
  assert.equal(readStreamEvent({ type: 'assistant', message: {} }), null);
  assert.equal(readStreamEvent({ type: 'assistant', message: { content: [] } }), null);
});

test('the prompt contract: builds without asking, one entry point, stays in its sandbox', async () => {
  const p = buildForgePrompt({ prompt: 'a snake game', dir: '/tmp/forge/snake' });
  assert.match(p, /a snake game/);
  assert.match(p, /\/tmp\/forge\/snake/);
  assert.match(p, /Don't ask clarifying questions/i, 'he is not at a keyboard');
  assert.match(p, /index\.html/, 'so Nova knows what to open for the proof shot');
  assert.match(p, /Stay inside this directory/i, 'the sandbox IS the containment');
  assert.match(p, /^BUILT /m, 'the spoken confirmation line is demanded');
  assert.match(p, /no markdown/i, 'because the line gets read aloud');
});

test('the BUILT line is the model\'s own words, parsed off the reply', async () => {
  const { summary, cleanText } = parseBuiltLine('Made the thing.\nSome detail.\nBUILT Your snake game is ready to play.');
  assert.equal(summary, 'Your snake game is ready to play.');
  assert.ok(!cleanText.includes('BUILT'), 'the directive never reaches him');
  assert.match(cleanText, /Made the thing/);
});

test('a reply with no BUILT line degrades honestly rather than inventing success', async () => {
  const { summary, cleanText } = parseBuiltLine('I could not finish this.');
  assert.equal(summary, null, 'no fabricated confirmation');
  assert.equal(cleanText, 'I could not finish this.');
});

test('artifact cleanup refuses to delete anything outside the forge root', async () => {
  const outside = await mkdtemp(path.join(tmpdir(), 'not-forge-'));
  await writeFile(path.join(outside, 'precious.txt'), 'do not delete', 'utf8');
  assert.equal(await discardForgeArtifacts(outside), false, 'a path outside the sandbox root is refused');
  assert.equal(await discardForgeArtifacts('/'), false);
  assert.equal(await discardForgeArtifacts(''), false);
  assert.equal(await discardForgeArtifacts(null), false);

  const inside = path.join(forgeDir, 'a-job-abc123');
  await mkdir(inside, { recursive: true });
  assert.equal(await discardForgeArtifacts(inside), true, 'its own disposable dir is fair game');
  await rm(outside, { recursive: true, force: true });
});

test('listJobs is empty and does not throw before anything has ever been forged', async () => {
  assert.deepEqual(await listJobs(), []);
});

// The Builder's work is checked by code (13 Oct 2026). Every command here is
// faked: the suite never runs lint, a build or the real tests from inside a test.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatesFor, failingTests, runGates, causedFailures, failureBrief, receipt } from '../lib/builderGate.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_FAIL = `✖ failing tests:\n\ntest at test/rotationV2.test.js:63:1\n✖ options\n  AssertionError\ntest at test/exerciseAtlas.test.js:101:1\n✖ atlas\nℹ tests 3541\nℹ pass 3539\nℹ fail 2\n`;

test('Nova OS carries its own gates: lint, build, server tests, the phone guard', () => {
  assert.deepEqual(gatesFor(repo).map((g) => g.id), ['lint', 'build', 'server-test', 'guard']);
});

test('failing tests are read from node --test\'s own report, once each', () => {
  assert.deepEqual(failingTests(OUT_FAIL + OUT_FAIL).map((t) => `${t.file}:${t.line}`), ['test/rotationV2.test.js:63', 'test/exerciseAtlas.test.js:101']);
});

const fakeRun = (map) => async (cmd, args, { cwd }) => {
  const key = `${path.basename(cwd)} ${args.join(' ')}`;
  return map[key] || { code: 0, out: 'ok\nℹ tests 10\nℹ pass 10\nℹ fail 0\n', ms: 5 };
};

test('a failure that was already on HEAD is reported but is not the Builder\'s to fix', async () => {
  const gates = gatesFor(repo).filter((g) => g.id === 'server-test');
  const run = fakeRun({ 'server test': { code: 1, out: OUT_FAIL.replace(/test at test\/rotationV2[^\n]*\n/, ''), ms: 9 } });
  const results = await runGates(repo, { gates, run, headCheck: async () => new Set(['test/exerciseAtlas.test.js']) });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].caused, false, 'only a pre-existing failure');
  assert.equal(causedFailures(results).length, 0);
  assert.match(receipt({ results, rounds: 0 }), /Server tests 3539\/3541; 1 failing before this change too ✓/);
});

test('a failure the change caused goes back to the Builder with the test names and the output', async () => {
  const gates = gatesFor(repo).filter((g) => g.id === 'server-test');
  const run = fakeRun({ 'server test': { code: 1, out: OUT_FAIL, ms: 9 } });
  const results = await runGates(repo, { gates, run, headCheck: async () => new Set(['test/exerciseAtlas.test.js']) });
  assert.equal(causedFailures(results).length, 1);
  const brief = failureBrief(results, 1, 3);
  assert.match(brief, /round 1 of 3/);
  assert.match(brief, /test\/rotationV2\.test\.js:63/);
  assert.doesNotMatch(brief.split('Last of its output')[0], /exerciseAtlas/, 'the pre-existing one is not blamed on it');
  assert.match(receipt({ results, rounds: 3 }), /Still failing:.*Server tests.*Do not commit/);
});

test('a lint or build failure has no test list and is always the change\'s', async () => {
  const gates = gatesFor(repo).filter((g) => g.id === 'lint');
  const results = await runGates(repo, { gates, run: async () => ({ code: 1, out: 'src/x.js: error', ms: 1 }), headCheck: async () => new Set() });
  assert.equal(causedFailures(results).length, 1);
});

test('the Builder runs with a shell, and what is his stays blocked', async () => {
  const cc = await import('../lib/claudeCode.js');
  assert.match(cc.BUILDER_BRIEF, /blocked/);
  const src = (await import('node:fs')).readFileSync(path.join(repo, 'server/lib/claudeCode.js'), 'utf8');
  const block = src.slice(src.indexOf('const BUILDER_DISALLOWED'), src.indexOf("].join(',');", src.indexOf('const BUILDER_DISALLOWED')));
  for (const p of ['git commit', 'git push', 'git reset', 'git checkout', 'git stash', 'launchctl', 'reload-server.mjs']) assert.ok(block.includes(p), `${p} must stay his`);
  assert.match(src, /const BUILDER_ALLOWED = '[^']*\bBash\b/);
});

// The Agent World costs no tokens to look at (AGENT-WORLD-PLAN.md §5a, his
// question of 24 Sep: "will this use up additional Claude tokens?"). That is
// only true while nothing the map draws with can reach a model, so this test
// reads every file the map is built from and fails on any path to one: the
// CLI spawn, the local model, the API client, a network call, or an app
// action that is not on the short list of things a picture may do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Directories are walked; single files are checked when they exist, because
// the map is built in stages and a stage not yet written has nothing to check.
const SCOPE = [
  'src/agentWorld',
  'src/orgmap',
  'src/vals/valsOrgMap.js',
  'server/lib/orgMap.js',
];

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (!(await exists(abs))) return [];
  if (!(await stat(abs)).isDirectory()) return [rel];
  const out = [];
  for (const e of await readdir(abs, { withFileTypes: true })) {
    const child = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...await walk(child));
    else if (/\.(m?js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(child);
  }
  return out;
}

// Comments are allowed to talk about models ("no model here"); code is not.
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const FORBIDDEN = [
  [/spawnBoundary|boundaryArgs/, 'the Claude CLI boundary'],
  [/localModel|completeLocal/, 'the local model'],
  [/child_process|execFile|\bspawn\s*\(/, 'a spawned process'],
  [/anthropic/i, 'an Anthropic client'],
  [/['"`]claude['"`]/, 'the claude command'],
  [/lens\.js|NOVA_LENS/, 'the agent lens (a prompt)'],
  [/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource/, 'a network call'],
  [/from\s+['"][^'"]*\/api(\.js)?['"]/, 'the API client'],
  [/['"`]\/api\//, 'an API route'],
];

// What a picture of the org may do: go somewhere, open a being, and use the
// Inbox's own approve and discard (undoable, and no model behind them).
const APP_ALLOWED = new Set(['navigate', 'inboxAction', 'toggleOpsAgent', 'setState']);

test('the map and its beings have files to check', async () => {
  const files = (await Promise.all(SCOPE.map(walk))).flat();
  assert.ok(files.length >= 1, 'no Agent World files found; the scope list has drifted from the code');
});

test('nothing the map is drawn with can reach a model or the network', async () => {
  const files = (await Promise.all(SCOPE.map(walk))).flat();
  const faults = [];
  for (const rel of files) {
    const code = codeOnly(await readFile(path.join(ROOT, rel), 'utf8'));
    for (const [re, what] of FORBIDDEN) {
      const m = code.match(re);
      if (m) faults.push(`${rel}: ${what} (${m[0]})`);
    }
    for (const m of code.matchAll(/\bapp\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (!APP_ALLOWED.has(m[1])) faults.push(`${rel}: app.${m[1]}() is not something the map may do`);
    }
  }
  assert.deepEqual(faults, [], `the map must cost no tokens:\n${faults.join('\n')}`);
});

test('the guard itself catches what it claims to', () => {
  const caught = (src) => FORBIDDEN.some(([re]) => re.test(codeOnly(src)));
  assert.ok(caught("import { boundaryArgs } from './spawnBoundary.js';"));
  assert.ok(caught("const r = await fetch('/api/ask');"));
  assert.ok(caught("import { api } from '../api.js';"));
  assert.ok(caught("execFn('claude', ['-p', prompt])"));
  // a comment that names a model is not a call to one
  assert.ok(!caught('// no model, no network: this only draws'));
  assert.ok(!caught("const lens = new T.Mesh(geo, lensMat); // the Researcher's lens"));
});

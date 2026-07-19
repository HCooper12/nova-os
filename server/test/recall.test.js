// Recall search — temp vault BEFORE imports.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-recall-vault-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { searchVault, tokenize, _resetRecallCache } = await import('../lib/recall.js');

await mkdir(path.join(vault, 'Wiki/Concepts'), { recursive: true });
const page = (name, body, type = 'concept') => writeFile(
  path.join(vault, 'Wiki/Concepts', `${name}.md`),
  matter.stringify(`# ${name}\n\n${body}\n`, { type, created: '2026-07-01', updated: '2026-07-01' }), 'utf8');

await page('Progressive Overload', 'Add weight or reps steadily. The double progression method drives hypertrophy without stalling.');
await page('Identity as Behavior', 'You become what you repeatedly do. Identity follows behavior, not narrative.');
await page('Protein Timing', 'Total daily protein beats timing. Progression in the gym still depends on eating enough.');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

test('tokenize drops stopwords and short tokens', () => {
  assert.deepEqual(tokenize('The Progression of a Method'), ['progression', 'method']);
});

test('multi-term queries rank pages matching more distinct terms first; prefix matching works', async () => {
  _resetRecallCache();
  const results = await searchVault(vault, 'progression method');
  assert.equal(results[0].title, 'Progressive Overload'); // matches both terms (prefix: progression→progressive? no — body has "progression" and "method")
  assert.ok(results[0].snippet.includes('double progression'));

  // prefix: "prog" finds progression/progressive pages
  const prefix = await searchVault(vault, 'prog');
  assert.ok(prefix.length >= 2);
  assert.ok(prefix.some((r) => r.title === 'Progressive Overload'));
  assert.ok(prefix.some((r) => r.title === 'Protein Timing'));

  // title terms outweigh body terms
  const identity = await searchVault(vault, 'identity');
  assert.equal(identity[0].title, 'Identity as Behavior');

  assert.deepEqual(await searchVault(vault, 'the of and'), [], 'stopword-only queries return nothing');
  assert.deepEqual(await searchVault(vault, 'zzzunfindable'), []);
});

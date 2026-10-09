// NEVER "/null" OR "NaN" ON HOME (9 Oct 2026, the break-ui worst-case pass
// on the motion build): the protein tile printed `/${proteinTarget}G` even
// with no target, and String(Math.round(NaN)) for a broken macro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the protein tile guards its target, its number and its sign', async () => {
  const src = await readFile(path.join(ROOT, 'src', 'vals', 'valsMission.js'), 'utf8');
  assert.match(src, /small: proteinTarget != null \? `\/\$\{proteinTarget\}G` : 'G',/);
  assert.match(src, /!Number\.isFinite\(proteinCurrent\)/);
  assert.match(src, /value: String\(Math\.max\(0, Math\.round\(proteinCurrent\)\)\)/);
  assert.match(src, /const eatenP = Math\.max\(0, Math\.round\(f\.eaten\?\.p \|\| 0\)\);/);
  assert.doesNotMatch(src, /small: `\/\$\{proteinTarget\}G`,/);
});

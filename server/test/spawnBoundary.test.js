// The spawn boundary — the deny-list is the only real gate (see
// lib/spawnBoundary.js), so this suite guards both halves: that the helper
// denies what it should, and that NO spawn site in the codebase ever ships
// an allow-list without enforcement again. The August 2026 audit found 14
// sites in exactly that state; the sweep below is what stops the 15th.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { denyAllExcept, boundaryArgs, TOOL_UNIVERSE } = await import('../lib/spawnBoundary.js');
const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');

test('denyAllExcept: a lane gets exactly the complement of what it asks for', () => {
  const deny = denyAllExcept('Read Grep Glob').split(',');
  assert.ok(!deny.includes('Read'));
  assert.ok(!deny.includes('Grep'));
  assert.ok(deny.includes('Bash'));
  assert.ok(deny.includes('Write'));
  assert.ok(deny.includes('WebFetch'));
  // both separators the codebase uses must parse
  assert.equal(denyAllExcept('Read,Write'), denyAllExcept('Read Write'));
});

test('denyAllExcept: asking for nothing denies the entire universe', () => {
  assert.equal(denyAllExcept('').split(',').length, TOOL_UNIVERSE.length);
  assert.equal(denyAllExcept(null), denyAllExcept(''));
  // the three lanes the audit caught: they asked for no tools and got no gate
  assert.ok(denyAllExcept('').includes('Bash'));
  assert.ok(denyAllExcept('').includes('Write'));
});

test('boundaryArgs: allow-list and its enforcement can never travel apart', () => {
  const args = boundaryArgs('Read');
  assert.equal(args[0], '--allowedTools');
  assert.equal(args[1], 'Read');
  assert.equal(args[2], '--disallowedTools');
  assert.ok(args[3].includes('Bash'));
  assert.ok(!args[3].split(',').includes('Read'));
  assert.ok(args.includes('--strict-mcp-config'));
});

test('every spawned CLI lane in server/lib has a real boundary', async () => {
  const files = (await readdir(LIB)).filter((f) => f.endsWith('.js'));
  const unguarded = [];
  for (const f of files) {
    const lines = (await readFile(path.join(LIB, f), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (!line.includes("'--permission-mode'")) return;
      // the spawn's argument array — generous window, these are ~20 lines
      const win = lines.slice(Math.max(0, i - 30), i + 30).join('\n');
      if (!win.includes('boundaryArgs(') && !win.includes("'--disallowedTools'")) {
        unguarded.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(unguarded, [], `spawn sites with an unenforced tool boundary: ${unguarded.join(', ')}`);
});

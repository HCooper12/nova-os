// The odometer's columns are keyed from the right (src/NumberRoll.jsx), so a
// number that grows a digit keeps its units column instead of every digit
// jumping to a new place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NumberRoll.jsx carries JSX; the pure part is copied out of the source text
// and evaluated, so this test needs no JSX transform and cannot drift from it
const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'NumberRoll.jsx'), 'utf8');
const body = src.slice(src.indexOf('export function rollCells'), src.indexOf('\n}\n', src.indexOf('export function rollCells')) + 2).replace('export ', '');
const rollCells = new Function(`${body}; return rollCells;`)();

test('99 → 100 keeps the units and tens columns and adds one on the left', () => {
  const a = rollCells('99').map((c) => c.key);
  const b = rollCells('100').map((c) => c.key);
  assert.deepEqual(a, ['d1', 'd0']);
  assert.deepEqual(b, ['d2', 'd1', 'd0']);
});

test('separators and units are their own cells, digits carry their place', () => {
  const cells = rollCells('1,250 g');
  assert.deepEqual(cells.map((c) => c.digit ?? c.text), [1, ',', 2, 5, 0, ' ', 'g']);
  assert.equal(cells[0].place, 6);
});

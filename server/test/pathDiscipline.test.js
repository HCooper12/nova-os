// PATH DISCIPLINE, pinned at the source. Two lessons the platform has paid
// for more than once: every store under server/data must honor NOVA_DATA_DIR
// (or tests with the override write the REAL data dir), and nothing may
// resolve a file from process.cwd() (under launchd the cwd is nova-os/server,
// not the repo root — the study lane's inventory read was empty in production
// for exactly that reason). An item-by-item audit found two hard-coded data
// paths; this scan found three. The scan stays so the class cannot come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
// comments explaining the rule may name the pattern — only code is scanned
const codeOnly = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const libFiles = () => readdirSync(LIB).filter((f) => f.endsWith('.js')).map((f) => [f, codeOnly(readFileSync(path.join(LIB, f), 'utf8'))]);

test('every lib module that builds a server/data path honors NOVA_DATA_DIR', () => {
  const offenders = libFiles()
    .filter(([, src]) => src.includes("'..', 'data'") && !src.includes('NOVA_DATA_DIR'))
    .map(([f]) => f);
  assert.deepEqual(offenders, [], `hard-coded data path (tests would write the real data dir): ${offenders.join(', ')}`);
});

const ROUTES = path.join(LIB, '..', 'routes');
const serverFiles = () => [
  ...libFiles(),
  ...readdirSync(ROUTES).filter((f) => f.endsWith('.js')).map((f) => [`routes/${f}`, codeOnly(readFileSync(path.join(ROUTES, f), 'utf8'))]),
  ['index.js', codeOnly(readFileSync(path.join(LIB, '..', 'index.js'), 'utf8'))],
];

test('no server module resolves a path from process.cwd()', () => {
  const offenders = serverFiles().filter(([, src]) => src.includes('process.cwd()')).map(([f]) => f);
  assert.deepEqual(offenders, [], `cwd-relative path (launchd runs from nova-os/server): ${offenders.join(', ')}`);
});

test("the study lane's capability inventory resolves from any working directory", async () => {
  const { INVENTORY_PATH } = await import('../lib/studyLane.js');
  const before = process.cwd();
  try {
    process.chdir(os.tmpdir()); // the launchd shape: not the repo root
    assert.ok(path.isAbsolute(INVENTORY_PATH));
    assert.ok(existsSync(INVENTORY_PATH), `inventory not found at ${INVENTORY_PATH}`);
    assert.match(readFileSync(INVENTORY_PATH, 'utf8'), /\S/, 'and it has content to hand the model');
  } finally { process.chdir(before); }
});

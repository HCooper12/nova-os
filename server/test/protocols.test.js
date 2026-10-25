// The Protocols page: seeded once, never overwritten, and read into context
// with the rules that stop an agent calling Nova's summary "the book".
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-protocols-data-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-protocols-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';
const { ensureProtocolsPage, protocolsContext, PROTOCOLS_SEED, PROTOCOLS_REL } = await import('../lib/protocols.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

test('seeds the page once, with its provenance and the place for the book', async () => {
  assert.deepEqual(await ensureProtocolsPage(vault), { seeded: true });
  const page = await readFile(path.join(vault, PROTOCOLS_REL), 'utf8');
  assert.equal(page, PROTOCOLS_SEED);
  assert.match(page, /It is NOT the Protocols book/);
  assert.match(page, /## His own additions/);
  assert.deepEqual(await ensureProtocolsPage(vault), { seeded: false });
});

test('an edited page is never overwritten', async () => {
  const full = path.join(vault, PROTOCOLS_REL);
  await writeFile(full, '# Protocols\n\n## His own additions\n- Morning walk, p. 41\n', 'utf8');
  await ensureProtocolsPage(vault);
  await protocolsContext(vault);
  assert.equal(await readFile(full, 'utf8'), '# Protocols\n\n## His own additions\n- Morning walk, p. 41\n');
});

test('context carries the heading and the never-the-book rule, seeding lazily', async () => {
  const fresh = await mkdtemp(path.join(tmpdir(), 'nova-protocols-vault2-'));
  try {
    const ctx = await protocolsContext(fresh);
    assert.match(ctx, /^PROTOCOLS \(his page, Wiki\/Health\/Protocols\.md;/);
    assert.match(ctx, /never call it the book unless the line is under "His own additions"/);
    assert.match(ctx, /match protocols to what WHERE HE STANDS shows, never list them/);
    assert.match(ctx, /## Sleep \(Toolkit for Sleep\)/);
    const short = await protocolsContext(fresh, { budget: 600 });
    assert.match(short, /page continues/);
    assert.ok(short.length < 1100);
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
});

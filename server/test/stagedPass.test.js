// The staged pass — the one apply/undo shape under distill, the deep-weave
// ingest and Coach's plan changes. Its failure modes are the point: a moved
// file refuses the whole apply, a write that dies mid-way leaves the vault as
// it was, and undo puts every prior back verbatim. All on a scratch vault.
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const { stampPriors, checkDrift, applyChanges, undoChanges } = await import('../lib/stagedPass.js');

async function scratch() {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-staged-'));
  await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Inbox/A.md'), '# A\n\noriginal a\n', 'utf8');
  await writeFile(path.join(vault, 'Wiki/Inbox/B.md'), '# B\n\noriginal b\n', 'utf8');
  return vault;
}
const changesFor = (vault) => stampPriors(vault, [
  { path: 'Wiki/Inbox/A.md', kind: 'updated', content: '# A\n\nwoven a\n' },
  { path: 'Wiki/Concepts/New.md', kind: 'new', content: '# New\n' },
  { path: 'Wiki/Inbox/B.md', kind: 'updated', content: '# B\n\nwoven b\n' },
]);

test('stampPriors: an updated file carries its exact live bytes, a new file carries null', async () => {
  const vault = await scratch();
  try {
    const [a, n] = changesFor(vault);
    assert.equal(a.prior, '# A\n\noriginal a\n');
    assert.equal(n.prior, null);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('drift refusal names the moved file and blocks the whole apply before any write', async () => {
  const vault = await scratch();
  try {
    const changes = changesFor(vault);
    await checkDrift(vault, changes); // clean → passes

    // he edits B in Obsidian after the diff — the FIRST file (A) must not be written either
    await writeFile(path.join(vault, 'Wiki/Inbox/B.md'), '# B\n\nhis newer edit\n', 'utf8');
    await assert.rejects(
      () => applyChanges(vault, changes, { what: 'this weave', remedy: 'run it again' }),
      /vault moved under this weave \(Wiki\/Inbox\/B\.md changed since the diff\) — run it again/,
    );
    assert.equal(await readFile(path.join(vault, 'Wiki/Inbox/A.md'), 'utf8'), '# A\n\noriginal a\n', 'nothing written');
    assert.ok(!existsSync(path.join(vault, 'Wiki/Concepts/New.md')));

    // a "new" file that now exists is drift too
    await writeFile(path.join(vault, 'Wiki/Inbox/B.md'), '# B\n\noriginal b\n', 'utf8');
    await mkdir(path.join(vault, 'Wiki/Concepts'), { recursive: true });
    await writeFile(path.join(vault, 'Wiki/Concepts/New.md'), 'he made it first\n', 'utf8');
    await assert.rejects(() => checkDrift(vault, changes), /Wiki\/Concepts\/New\.md now exists/);

    // an unstamped change is a programming error, never a silent clobber
    await assert.rejects(() => checkDrift(vault, [{ path: 'Wiki/Inbox/A.md', kind: 'updated', content: 'x' }]), /never stamped/);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('apply writes every file snapshot-first; undo puts every prior back and removes what was created', async () => {
  const vault = await scratch();
  try {
    const changes = changesFor(vault);
    assert.deepEqual(await applyChanges(vault, changes), { applied: 3 });
    assert.equal(await readFile(path.join(vault, 'Wiki/Inbox/A.md'), 'utf8'), '# A\n\nwoven a\n');
    assert.equal(await readFile(path.join(vault, 'Wiki/Concepts/New.md'), 'utf8'), '# New\n');
    const baks = await readdir(path.join(vault, 'Wiki/Inbox/.nova-backups'));
    assert.ok(baks.some((f) => f.startsWith('A.md.')), 'A was snapshotted before the write');

    assert.deepEqual(await undoChanges(vault, changes), { restored: 3 });
    assert.equal(await readFile(path.join(vault, 'Wiki/Inbox/A.md'), 'utf8'), '# A\n\noriginal a\n');
    assert.equal(await readFile(path.join(vault, 'Wiki/Inbox/B.md'), 'utf8'), '# B\n\noriginal b\n');
    assert.ok(!existsSync(path.join(vault, 'Wiki/Concepts/New.md')), 'created file removed');
    const conceptBaks = await readdir(path.join(vault, 'Wiki/Concepts/.nova-backups'));
    assert.ok(conceptBaks.some((f) => f.startsWith('New.md.')), 'even the removal snapshotted first');
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('a write that dies mid-apply rolls the earlier files back — the vault is as it was', async () => {
  const vault = await scratch();
  try {
    // the second target's parent is a FILE, so mkdir fails with ENOTDIR
    await writeFile(path.join(vault, 'Wiki/Blocker'), 'not a directory\n', 'utf8');
    const changes = stampPriors(vault, [
      { path: 'Wiki/Inbox/A.md', kind: 'updated', content: '# A\n\nwoven a\n' },
      { path: 'Wiki/Blocker/x.md', kind: 'new', content: 'never lands\n' },
      { path: 'Wiki/Inbox/B.md', kind: 'updated', content: '# B\n\nwoven b\n' },
    ]);
    await assert.rejects(
      () => applyChanges(vault, changes),
      /writing Wiki\/Blocker\/x\.md failed .* — the 1 file already written was put back; the vault is as it was/,
    );
    assert.equal(await readFile(path.join(vault, 'Wiki/Inbox/A.md'), 'utf8'), '# A\n\noriginal a\n', 'A rolled back byte-exact');
    assert.equal(await readFile(path.join(vault, 'Wiki/Inbox/B.md'), 'utf8'), '# B\n\noriginal b\n', 'B never written');
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('a custom writer is used for every write — apply, rollback and undo alike', async () => {
  const vault = await scratch();
  try {
    const log = [];
    const write = async (v, rel, content) => {
      log.push(`${rel}=${content.split('\n')[2] || content.trim()}`);
      if (rel === 'Wiki/Inbox/B.md' && content.includes('woven')) throw new Error('disk said no');
      await writeFile(path.join(v, rel), content, 'utf8');
    };
    const changes = stampPriors(vault, [
      { path: 'Wiki/Inbox/A.md', kind: 'updated', content: '# A\n\nwoven a\n' },
      { path: 'Wiki/Inbox/B.md', kind: 'updated', content: '# B\n\nwoven b\n' },
    ]);
    await assert.rejects(() => applyChanges(vault, changes, { write }), /disk said no/);
    assert.deepEqual(log, ['Wiki/Inbox/A.md=woven a', 'Wiki/Inbox/B.md=woven b', 'Wiki/Inbox/A.md=original a'], 'rollback went through the writer too');

    log.length = 0;
    await applyChanges(vault, changes.filter((c) => c.path.endsWith('A.md')), { write });
    await undoChanges(vault, changes.filter((c) => c.path.endsWith('A.md')), { write });
    assert.deepEqual(log, ['Wiki/Inbox/A.md=woven a', 'Wiki/Inbox/A.md=original a']);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

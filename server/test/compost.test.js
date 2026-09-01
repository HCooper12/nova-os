// Compost's dismissal memory: a no holds for 90 days, then the proposal may
// return — naming the history — instead of expiring by displacement from a
// 200-key slice. The old undated key list migrates on first load.
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-compost-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const DAY = 86_400_000;
const { runCompost, dismissProposal } = await import('../lib/compost.js');

async function vaultWithStaleCapture() {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-compost-vault-'));
  await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true });
  const f = path.join(vault, 'Wiki/Inbox/Old Capture.md');
  await writeFile(f, '# Old Capture\n\nA thought from a month ago.\n', 'utf8');
  const monthAgo = new Date(Date.now() - 30 * DAY);
  await utimes(f, monthAgo, monthAgo);
  return vault;
}
const staleOf = (r) => r.proposals.find((p) => p.key === 'stale:Wiki/Inbox/Old Capture.md');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('a dismissed proposal stays dismissed for 90 days, then returns once naming the history', async () => {
  const vault = await vaultWithStaleCapture();
  try {
    const first = await runCompost(vault);
    const p = staleOf(first);
    assert.ok(p, 'the stale capture is proposed');
    assert.equal(p.returned, undefined);

    await dismissProposal(p.id);
    assert.equal(staleOf(await runCompost(vault)), undefined, 'a no holds');
    assert.equal(staleOf(await runCompost(vault, { now: Date.now() + 89 * DAY })), undefined, 'still holds on day 89');

    const back = staleOf(await runCompost(vault, { now: Date.now() + 91 * DAY }));
    assert.ok(back, 'the no has had its say — the proposal may return');
    assert.equal(back.returned, true);
    assert.match(back.detail, /\(You passed on this on \d{1,2} \w{3,4}\.\)$/);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('the old undated dismissedKeys list migrates: the no is honoured and dated from the last run', async () => {
  const fresh = await mkdtemp(path.join(tmpdir(), 'nova-compost-data2-'));
  const vault = await vaultWithStaleCapture();
  const prev = process.env.NOVA_DATA_DIR;
  try {
    await writeFile(path.join(fresh, 'compost.json'), JSON.stringify({
      lastRunAt: new Date(Date.now() - 10 * DAY).toISOString(),
      proposals: [],
      dismissedKeys: ['stale:Wiki/Inbox/Old Capture.md'],
    }), 'utf8');
    process.env.NOVA_DATA_DIR = fresh;
    // a fresh module instance, so the cache reads the planted file
    const mod = await import('../lib/compost.js?migration');
    const r = await runCompost === mod.runCompost ? null : await mod.runCompost(vault);
    assert.equal(staleOf(r), undefined, 'the migrated no still holds (dismissed 10 days ago by the last run\'s date)');
    const store = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(fresh, 'compost.json'), 'utf8'));
    assert.equal(store.dismissedKeys, undefined, 'the undated list is gone');
    assert.ok(store.dismissed['stale:Wiki/Inbox/Old Capture.md'], 'and each key now carries its date');
    const later = await mod.runCompost(vault, { now: Date.now() + 85 * DAY });
    assert.ok(staleOf(later), '95 days after the migrated date, it may return');
  } finally {
    process.env.NOVA_DATA_DIR = prev;
    await rm(fresh, { recursive: true, force: true });
    await rm(vault, { recursive: true, force: true });
  }
});

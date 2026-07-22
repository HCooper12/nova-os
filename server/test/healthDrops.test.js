// Store-and-forward health ingestion — the phone saves a JSON file to iCloud;
// the watcher drains it into the health store whenever the Mac is awake.
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-drops-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-drops-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { scanHealthDrops, DROPS_DIR_REL } = await import('../lib/healthDrops.js');
const { loadDay, readPushLog } = await import('../lib/healthData.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('drains dropped files into day records, archives them, and keeps receipts', async () => {
  const dir = path.join(vault, DROPS_DIR_REL);
  await mkdir(dir, { recursive: true });
  // the flat single-day shape the Shortcut writes
  await writeFile(path.join(dir, 'health-2026-07-22.json'), JSON.stringify({ date: '2026-07-22', steps: 14876, hrv: 71.2 }), 'utf8');
  // a multi-day backfill array also works
  await writeFile(path.join(dir, 'backfill.json'), JSON.stringify([
    { date: '2026-07-17', steps: 9200 },
    { date: '2026-07-18', steps: 12250 },
  ]), 'utf8');
  // rubbish gets quarantined, never retried forever
  await writeFile(path.join(dir, 'noise.json'), 'not json at all', 'utf8');
  // iCloud placeholder must be skipped, not crashed on
  await writeFile(path.join(dir, '.health-x.json.icloud'), '', 'utf8');

  const { ingested } = await scanHealthDrops(vault);
  assert.equal(ingested, 3, 'three day-records ingested');

  assert.equal((await loadDay('2026-07-22')).steps, 14876);
  assert.equal((await loadDay('2026-07-22')).hrv, 71.2);
  assert.equal((await loadDay('2026-07-17')).steps, 9200);
  assert.equal((await loadDay('2026-07-18')).steps, 12250);

  const remaining = (await readdir(dir)).filter((f) => !f.startsWith('.') && f.endsWith('.json'));
  assert.equal(remaining.length, 0, 'all real files archived out of the drop folder');
  const processed = await readdir(path.join(vault, DROPS_DIR_REL, 'Processed'));
  assert.ok(processed.some((f) => f.includes('health-2026-07-22')));
  assert.ok(processed.some((f) => f.startsWith('bad-noise')), 'unparseable file quarantined with a bad- prefix');

  const log = await readPushLog();
  const drops = log.filter((a) => a.source === 'drop');
  assert.equal(drops.filter((a) => a.ok).length, 3, 'a receipt per ingested record');
  assert.equal(drops.filter((a) => !a.ok).length, 1, 'the bad file left a failure receipt');

  // second scan is a clean no-op
  assert.deepEqual(await scanHealthDrops(vault), { ingested: 0 });
});

test('re-delivery upserts the same day instead of duplicating (URL push + file both landing is safe)', async () => {
  const dir = path.join(vault, DROPS_DIR_REL);
  await writeFile(path.join(dir, 'again.json'), JSON.stringify({ date: '2026-07-22', steps: 14876 }), 'utf8');
  await scanHealthDrops(vault);
  const day = await loadDay('2026-07-22');
  assert.equal(day.steps, 14876);
  assert.equal(day.hrv, 71.2, 'upsert preserved the other metrics');
});

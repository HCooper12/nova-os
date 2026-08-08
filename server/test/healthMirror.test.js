// The vault health mirror — pure page builder + idempotent writer.
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-mirror-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-mirror-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildMirrorPage, writeMirror, MIRROR_DIR_REL } = await import('../lib/healthMirror.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('page builder: real values, dashes for absence, partial marker, no future rows', () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const d1 = `${monthKey}-01`;
  const page = buildMirrorPage(monthKey,
    [{ date: d1, steps: 12345, stepsComplete: true, hrv: 61.4, restingHeartRate: 59, weightKg: 82.7, sleepAsleepMinutes: 432 },
     { date: `${monthKey}-02`, steps: 400, stepsComplete: false }],
    [{ date: d1, p: 142, kcal: 2100, floorMet: false }]);
  assert.match(page, /type: health-log/);
  assert.match(page, new RegExp(`\\| ${d1} \\| 12,345 \\| 7h12 \\| 61 \\| 59 \\| 82\\.7 \\| 2100 \\| 142 \\| ✗ \\|`));
  assert.match(page, /\| 400\* \|/); // partial capture marked
  assert.match(page, /— \| — \| ✓|—/); // dashes exist for absent values
  // no rows beyond today
  const lastRow = page.trim().split('\n').filter((l) => l.startsWith(`| ${monthKey}`)).pop();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.ok(lastRow.slice(2, 12) <= today);
});

test('writeMirror creates the page, then skips an unchanged rewrite', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const first = await writeMirror(vault, monthKey);
  assert.equal(first.unchanged, false);
  assert.ok(existsSync(path.join(vault, MIRROR_DIR_REL, `${monthKey}.md`)));
  const again = await writeMirror(vault, monthKey);
  assert.equal(again.unchanged, true); // no backup churn on identical data
  const raw = await readFile(path.join(vault, MIRROR_DIR_REL, `${monthKey}.md`), 'utf8');
  assert.match(raw, /regenerated/i); // the page states its own contract
});

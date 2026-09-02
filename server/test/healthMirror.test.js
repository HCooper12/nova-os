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

const pad2 = (n) => String(n).padStart(2, '0');
const monthOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

// Rendering is asserted against a COMPLETED month so every seeded row is
// renderable whatever today's date is. This test used to seed day 2 of the
// CURRENT month and assert it rendered, which made it fail on the 1st of
// every month — the builder is right to drop a day that hasn't happened, and
// a test that only passes 30 days out of 31 blocks the deploy on the 31st.
test('page builder: real values, dashes for absence, partial marker', () => {
  const now = new Date();
  const monthKey = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const d1 = `${monthKey}-01`;
  const page = buildMirrorPage(monthKey,
    [{ date: d1, steps: 12345, stepsComplete: true, hrv: 61.4, restingHeartRate: 59, weightKg: 82.7, sleepAsleepMinutes: 432 },
     { date: `${monthKey}-02`, steps: 400, stepsComplete: false }],
    [{ date: d1, p: 142, kcal: 2100, floorMet: false }]);
  assert.match(page, /type: health-log/);
  assert.match(page, new RegExp(`\\| ${d1} \\| 12,345 \\| 7h12 \\| 61 \\| 59 \\| 82\\.7 \\| 2100 \\| 142 \\| ✗ \\|`));
  assert.match(page, /\| 400\* \|/); // partial capture marked
  assert.match(page, /— \| — \| ✓|—/); // dashes exist for absent values
});

// The rule the case above cannot test (it has no future to drop): a day that
// has not happened yet is never a row, however much data is handed in.
test('page builder: the future is not data, on any day of the month', () => {
  const now = new Date();
  const monthKey = monthOf(now);
  const today = `${monthKey}-${pad2(now.getDate())}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const page = buildMirrorPage(monthKey,
    [{ date: today, steps: 5000, stepsComplete: false },
     // same month or not, a future day must never render
     { date: `${monthOf(tomorrow)}-${pad2(tomorrow.getDate())}`, steps: 9999, stepsComplete: true }],
    []);
  assert.match(page, /\| 5,000\* \|/, "today's partial count is real data");
  assert.doesNotMatch(page, /9,999/, 'tomorrow never renders');
  const rows = page.trim().split('\n').filter((l) => l.startsWith(`| ${monthKey}-`));
  assert.ok(rows.at(-1).slice(2, 12) <= today, 'no row past today');
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

// ---- audit [40]: a correction on an old month reaches that month's page ----

test('daysBackTo reaches the first of any month, never less than the old 62', async () => {
  const { daysBackTo } = await import('../lib/healthMirror.js');
  const now = new Date(2026, 8, 3);
  assert.equal(daysBackTo('2026-09', now), 62);
  assert.ok(daysBackTo('2026-07', now) >= 66, 'July from 3 September needs more than two months of files');
});

test('an old-month write is noted, drained on the next tick, and lands on that month\'s page', async () => {
  const { noteHealthWrite, pendingMirrorMonths, drainPendingMirrors } = await import('../lib/healthMirror.js');
  const now = new Date(2026, 8, 3);
  assert.equal(noteHealthWrite('2026-09-02', now), false, 'this month is mirrored anyway');
  assert.equal(noteHealthWrite('garbage', now), false);
  assert.equal(noteHealthWrite('2026-07-15', now), true);
  assert.deepEqual(pendingMirrorMonths(), ['2026-07']);

  // the real writer queues it by itself — no caller has to remember
  const { saveDay } = await import('../lib/healthData.js');
  await saveDay('2026-06-20', { steps: 9876 });
  await new Promise((r) => setTimeout(r, 50)); // the note rides a dynamic import
  assert.deepEqual(pendingMirrorMonths(), ['2026-06', '2026-07']);

  const drained = await drainPendingMirrors(vault, now);
  assert.deepEqual(drained.map((d) => d.monthKey), ['2026-06', '2026-07']);
  assert.ok(drained.every((d) => !d.error), JSON.stringify(drained));
  assert.deepEqual(pendingMirrorMonths(), [], 'drained');
  const june = await readFile(path.join(vault, MIRROR_DIR_REL, '2026-06.md'), 'utf8');
  assert.match(june, /\| 2026-06-20 \| 9,876/, 'the corrected day is on the June page');
});

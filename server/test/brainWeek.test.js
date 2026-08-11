// Brain Week — deterministic "what entered the second brain this week".
// Temp data dir + temp vault BEFORE imports.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-brainweek-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-brainweek-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { collectWeekAdditions, composeBrainWeek, weekKey, runBrainWeek } = await import('../lib/brainWeek.js');
const { getRecord } = await import('../lib/inboxStore.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const day = (offset) => {
  const d = new Date(Date.now() - offset * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const page = (created, body = 'x') => `---\ntype: source\ncreated: ${created}\n---\n\n${body}\n`;

test('brain week: collects only this week, per knowledge folder, To-Do excluded', async () => {
  await mkdir(path.join(vault, 'Wiki/Sources'), { recursive: true });
  await mkdir(path.join(vault, 'Wiki/Concepts'), { recursive: true });
  await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true });
  await mkdir(path.join(vault, 'Raw'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Sources/New Pod.md'), page(day(2)));
  await writeFile(path.join(vault, 'Wiki/Sources/Old Pod.md'), page(day(30)));
  await writeFile(path.join(vault, 'Wiki/Concepts/Fresh Concept.md'), page(day(0)));
  await writeFile(path.join(vault, 'Wiki/Inbox/To-Do.md'), page(day(0)));
  await writeFile(path.join(vault, 'Raw/New Pod (Transcript).md'), 'no frontmatter — mtime counts\n');

  const groups = await collectWeekAdditions(vault);
  const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.titles]));
  assert.deepEqual(byLabel.Sources, ['New Pod'], 'old page excluded');
  assert.deepEqual(byLabel.Concepts, ['Fresh Concept']);
  assert.ok(!byLabel['Notes & captures'], 'To-Do.md never counts as knowledge');
  assert.deepEqual(byLabel['Raw originals'], ['New Pod (Transcript)'], 'frontmatter-less file falls back to mtime');
});

test('brain week: compose links every page, Raw with its folder prefix; empty week is null', () => {
  const text = composeBrainWeek([
    { label: 'Sources', titles: ['New Pod'] },
    { label: 'Raw originals', titles: ['New Pod (Transcript)'] },
  ]);
  assert.match(text, /2 pages entered the second brain/);
  assert.match(text, /\[\[New Pod\]\]/);
  assert.match(text, /\[\[Raw\/New Pod \(Transcript\)\]\]/, 'Raw pages need the folder prefix to resolve');
  assert.equal(composeBrainWeek([]), null, 'an empty week files nothing');
});

test('brain week: files one pending journal draft per week, dedupes, force re-runs', async () => {
  const first = await runBrainWeek(vault);
  assert.ok(first.recordId);
  const rec = await getRecord(first.recordId);
  assert.equal(rec.status, 'pending');
  assert.equal(rec.kind, 'brain-week');
  assert.equal(rec.decision.route, 'journal');
  assert.match(rec.decision.payload.text, /\[\[New Pod\]\]/);
  assert.equal(rec.weekKey, weekKey());

  const second = await runBrainWeek(vault);
  assert.equal(second.skipped, true, 'same week composes once');
  assert.equal(second.recordId, first.recordId);

  const forced = await runBrainWeek(vault, { force: true });
  assert.ok(forced.recordId && forced.recordId !== first.recordId, 'force mints a fresh draft');
});

test('brain week: weekKey is stable within a week and ISO-shaped', () => {
  assert.match(weekKey(new Date('2026-08-11T10:00:00')), /^2026-W\d{2}$/);
  assert.equal(weekKey(new Date('2026-08-10T00:30:00')), weekKey(new Date('2026-08-16T23:30:00')), 'Mon and Sun share a key');
  assert.notEqual(weekKey(new Date('2026-08-10T00:30:00')), weekKey(new Date('2026-08-17T00:30:00')), 'next Monday rolls over');
});

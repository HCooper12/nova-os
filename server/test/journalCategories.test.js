// Journal categories — personal reflections stay separable from training
// receipts and system briefs, and the category survives the write→parse
// round-trip in the human-readable heading ("## 21:30 · training — …").
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-journalcat-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { addEntry, removeEntry, listEntries, JOURNAL_CATEGORIES } = await import('../lib/journal.js');

test.after(async () => { await rm(vault, { recursive: true, force: true }); });

test('categories + labels round-trip through the vault file and stay hand-readable', async () => {
  assert.deepEqual(JOURNAL_CATEGORIES, ['personal', 'training', 'system']);

  const personal = await addEntry(vault, { text: 'Felt sharp today. Grateful for the morning walk.' });
  assert.equal(personal.category, 'personal', 'hand-written entries default to personal');

  const review = await addEntry(vault, { text: 'Recovery led the day; protein closed late.', category: 'personal', label: 'Daily review reflection' });
  const training = await addEntry(vault, { text: 'Pull logged — 5 exercises, 16 sets.', category: 'training', label: 'Session receipt' });
  const brief = await addEntry(vault, { text: 'Morning brief body.', category: 'system', label: 'Morning dispatch' });
  const junk = await addEntry(vault, { text: 'Bad category coerces safely.', category: 'nonsense' });
  assert.equal(junk.category, 'personal', 'unknown categories coerce to personal, never crash');

  // the raw file stays human-readable with the marker in the heading
  const raw = await readFile(path.join(vault, 'Wiki/Journal', `${personal.date}.md`), 'utf8');
  assert.match(raw, new RegExp(`## ${review.time} · personal — Daily review reflection`));
  assert.match(raw, new RegExp(`## ${training.time} · training — Session receipt`));
  assert.match(raw, new RegExp(`## ${brief.time} · system — Morning dispatch`));

  // parse-back carries the category + heading
  const [day] = await listEntries(vault, { limit: 1 });
  const cats = day.sections.map((s) => s.category);
  assert.deepEqual(cats, ['personal', 'personal', 'training', 'system', 'personal']);
  assert.equal(day.sections[1].heading, 'Daily review reflection');

  // undo still matches by time+text and preserves the other sections' categories
  const removed = await removeEntry(vault, { date: training.date, time: training.time, text: 'Pull logged — 5 exercises, 16 sets.' });
  assert.equal(removed, true);
  const [after] = await listEntries(vault, { limit: 1 });
  assert.deepEqual(after.sections.map((s) => s.category), ['personal', 'personal', 'system', 'personal'], 'categories intact after a removal rewrite');
});

test('legacy headings without a marker parse as uncategorized, not mislabelled', async () => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(path.join(vault, 'Wiki/Journal'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Journal/2026-01-05.md'),
    '---\ntype: journal\ntags: []\ncreated: 2026-01-05\nupdated: 2026-01-05\n---\n# 2026-01-05\n\n## 09:15\n\nOld entry, pre-categories.\n\n## 21:00 — Reflection on [[Focus]]\n\nOld concept reflection.\n', 'utf8');
  const days = await listEntries(vault);
  const legacy = days.find((d) => d.date === '2026-01-05');
  assert.equal(legacy.sections[0].category, null, 'no marker → honestly uncategorized');
  assert.equal(legacy.sections[1].category, null);
  assert.equal(legacy.sections[1].heading, 'Reflection on [[Focus]]', 'legacy headings preserved');
});

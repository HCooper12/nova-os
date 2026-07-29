// Topic Pulse — interests page contract, item validation (no URL no item),
// cache round-trip with an injected runner, and the honest empty states.
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-pulse-vault-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-pulse-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { ensureInterestsFile, loadInterests, normalizePulseItems, refreshPulseTopic, refreshAllPulses, getPulse, pulseMorningLine, INTERESTS_REL } = await import('../lib/pulse.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

test('interests: seeded once, his edits honoured, capped honestly', async () => {
  assert.equal(await ensureInterestsFile(vault), true);
  const topics = await loadInterests(vault);
  assert.equal(topics.length, 3, 'seed carries three starters');
  assert.match(topics[0], /Hypertrophy/);

  const full = path.join(vault, INTERESTS_REL);
  await writeFile(full, (await readFile(full, 'utf8')) + '- Espresso gear\n', 'utf8');
  assert.ok((await loadInterests(vault)).includes('Espresso gear'));
});

test('normalize: no URL no item, junk rejected, caps applied', () => {
  const items = normalizePulseItems({ items: [
    { title: 'Real study', url: 'https://example.com/study', source: 'Example', note: 'matters' },
    { title: 'Constructed link', url: 'not-a-url', note: 'nope' },
    { title: '', url: 'https://example.com/no-title' },
    { title: 'No source given', url: 'https://sub.journal.org/x' },
  ] });
  assert.equal(items.length, 2);
  assert.equal(items[1].source, 'sub.journal.org', 'source falls back to hostname, never invented');
});

test('refresh round-trip with injected runner; failures keep the previous cache', async () => {
  const good = async () => ({ items: [{ title: 'Zone 2 meta-analysis', url: 'https://pubmed.gov/x1', source: 'PubMed', note: 'new data' }] });
  await refreshPulseTopic('Hypertrophy and strength training research', { runner: good });

  let entry = (await getPulse('hypertrophy'))[0];
  assert.equal(entry.items[0].title, 'Zone 2 meta-analysis');

  const summary = await refreshAllPulses(vault, { runner: async (p) => {
    if (p.includes('Hypertrophy')) throw new Error('web down');
    return { items: [{ title: 'Fresh item', url: 'https://ex.com/a', source: 'Ex' }] };
  } });
  assert.equal(summary.failed, 1);
  assert.equal(summary.refreshed, 3, 'the other topics (incl. his Espresso addition) refreshed');
  entry = (await getPulse('hypertrophy'))[0];
  assert.equal(entry.items[0].title, 'Zone 2 meta-analysis', 'failure kept the previous cache — stale beats gone');

  const line = await pulseMorningLine();
  assert.match(line, /^\*\*Pulse\.\*\*/);
  assert.match(line, /Fresh item|Zone 2/);
});

test('the pulse panel renders only the cache and says so when empty', async () => {
  const { buildPanel } = await import('../lib/panels.js');
  const panel = await buildPanel(vault, { panel: 'pulse', topic: 'espresso' });
  assert.equal(panel.data.items[0].title, 'Fresh item');
  assert.match(panel.data.ageLabel, /fresh|\dh old/);
  await assert.rejects(() => buildPanel(vault, { panel: 'pulse', topic: 'quantum knitting' }), /no pulse cached.*offer to RESEARCH/s);
});

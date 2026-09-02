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

// ---- audit [38]: novelty memory, the named cap, the late catch-up ----------

test('novelty memory: a reprint is not news — items carry over marked seen, and the prompt names the exclusions', async () => {
  const { buildPulsePrompt } = await import('../lib/pulse.js');
  const before = (await getPulse('espresso'))[0];
  assert.equal(before.items[0].url, 'https://ex.com/a');

  let promptSeen = '';
  const reprint = async (p) => { promptSeen = p; return { items: [{ title: 'Fresh item (again)', url: 'https://ex.com/a', source: 'Ex' }] }; };
  const entry = await refreshPulseTopic('Espresso gear', { runner: reprint });
  assert.match(promptSeen, /ALREADY SHOWN[\s\S]*https:\/\/ex\.com\/a/, 'the exclude list rode the prompt');
  assert.equal(entry.newCount, 0);
  assert.equal(entry.items.length, 1, "yesterday's item stays rather than vanishing");
  assert.equal(entry.items[0].seen, true);
  assert.equal(entry.items[0].title, 'Fresh item', 'the ORIGINAL item, not the reprint wearing a new title');
  assert.equal(entry.lastNewAt, before.at, 'last-new points at the run that actually found it');

  const line = await pulseMorningLine();
  assert.match(line, /Espresso gear: nothing new since \d{4}-\d{2}-\d{2}/);

  const { buildPanel } = await import('../lib/panels.js');
  const panel = await buildPanel(vault, { panel: 'pulse', topic: 'espresso' });
  assert.match(panel.data.freshness, /^nothing new — last items from \d{4}-\d{2}-\d{2}$/);

  // one genuinely new URL among the old: only the new one is today's
  const mixed = async () => ({ items: [
    { title: 'Fresh item', url: 'https://ex.com/a', source: 'Ex' },
    { title: 'New grinder study', url: 'https://ex.com/b', source: 'Ex' },
  ] });
  const next = await refreshPulseTopic('Espresso gear', { runner: mixed });
  assert.equal(next.newCount, 1);
  assert.deepEqual(next.items.map((i) => i.title), ['New grinder study']);
  assert.ok(next.seen.includes('https://ex.com/a'), 'the memory keeps growing');
  const panel2 = await buildPanel(vault, { panel: 'pulse', topic: 'espresso' });
  assert.equal(panel2.data.freshness, null);
  assert.equal(buildPulsePrompt('x').includes('ALREADY SHOWN'), false, 'no memory, no exclusion block');
});

test('the cap is named where it bites: over-cap topics are listed, never refreshed, and the panel says why', async () => {
  const { loadInterestsReport, MAX_TOPICS } = await import('../lib/pulse.js');
  const full = path.join(vault, INTERESTS_REL);
  const extra = ['Sourdough', 'Sim racing', 'Bonsai', 'Fountain pens'];
  await writeFile(full, (await readFile(full, 'utf8')) + extra.map((t) => `- ${t}\n`).join(''), 'utf8');
  const report = await loadInterestsReport(vault);
  assert.equal(report.topics.length, MAX_TOPICS);
  assert.deepEqual(report.overCap, ['Bonsai', 'Fountain pens']);

  const ran = [];
  const summary = await refreshAllPulses(vault, { runner: async (p) => { ran.push(p); return { items: [] }; } });
  assert.equal(summary.overCap, 2);
  assert.equal(summary.refreshed, MAX_TOPICS);
  assert.ok(!ran.some((p) => p.includes('Bonsai')), 'the over-cap topic never spent a run');

  const entries = await getPulse();
  const bonsai = entries.find((e) => e.topic === 'Bonsai');
  assert.equal(bonsai.overCap, true);
  assert.equal(bonsai.at, null);
  const { buildPanel } = await import('../lib/panels.js');
  await assert.rejects(() => buildPanel(vault, { panel: 'pulse', topic: 'bonsai' }), /past the 6-topic limit/);
  // the topic-less panel skips over-cap entries rather than failing on one
  const first = await buildPanel(vault, { panel: 'pulse' });
  assert.ok(!first.data.topic.includes('Bonsai'));
});

test('run window: overnight once, a late catch-up after 09:00, never twice a day', async () => {
  const { pulseRunDue, localDay } = await import('../lib/pulse.js');
  const d = (h, m) => new Date(2026, 8, 3, h, m);
  assert.equal(pulseRunDue(d(3, 29), null), false);
  assert.equal(pulseRunDue(d(3, 30), null), true);
  assert.equal(pulseRunDue(d(6, 29), null), true);
  assert.equal(pulseRunDue(d(6, 30), null), false, 'between the window and the catch-up: wait');
  assert.equal(pulseRunDue(d(8, 59), null), false);
  assert.equal(pulseRunDue(d(9, 0), null), true, 'the catch-up');
  assert.equal(pulseRunDue(d(15, 0), null), true);
  assert.equal(pulseRunDue(d(15, 0), localDay(d(15, 0))), false, 'already ran today — from the cache file, so a restart cannot double it');
  assert.equal(pulseRunDue(d(4, 0), '2026-09-02'), true, "yesterday's run does not count");
});

test('a failed refresh is legible: the budget subtype becomes words, the cache remembers it, the panel says it', async () => {
  const { describeRunFailure, runReceipt } = await import('../lib/pulse.js');
  const envelope = { is_error: true, subtype: 'error_max_budget_usd', total_cost_usd: 0.5012, modelUsage: { 'claude-haiku-4-5': { webSearchRequests: 11 } } };
  assert.equal(describeRunFailure(envelope, 1), 'budget of $0.5 exhausted after $0.50 and 11 searches — the run was cut off before it answered');
  assert.equal(describeRunFailure({ subtype: 'error_max_turns', total_cost_usd: 0.2 }, 1), 'turn limit hit after $0.20');
  assert.equal(describeRunFailure({}, 1, ''), 'exited 1');
  assert.equal(describeRunFailure({ result: 'API down' }, 1), 'API down');
  assert.deepEqual(runReceipt({ total_cost_usd: 1.064, duration_ms: 267400, modelUsage: { a: { webSearchRequests: 20 } } }), { costUsd: 1.064, searches: 20, seconds: 267 });

  await assert.rejects(() => refreshPulseTopic('Espresso gear', { runner: async () => { throw new Error('budget of $0.5 exhausted after $0.50 and 9 searches — the run was cut off before it answered'); } }), /budget/);
  const entry = (await getPulse('espresso'))[0];
  assert.equal(entry.items.length, 1, 'the previous items survive the failure');
  assert.match(entry.lastError.message, /budget of \$0\.5 exhausted/);
  const { buildPanel } = await import('../lib/panels.js');
  const panel = await buildPanel(vault, { panel: 'pulse', topic: 'espresso' });
  assert.match(panel.data.freshness, /^last refresh failed: budget of/);

  // a later success clears the failure and carries the run receipt
  const ok = await refreshPulseTopic('Espresso gear', { runner: async () => ({ items: [{ title: 'Brand new', url: 'https://ex.com/c', source: 'Ex' }], __run: { costUsd: 0.41, searches: 6, seconds: 90 } }) });
  assert.equal(ok.lastError, undefined);
  assert.deepEqual(ok.run, { costUsd: 0.41, searches: 6, seconds: 90 });
  assert.match((await import('../lib/pulse.js')).buildPulsePrompt('x'), /at most 8 web searches/);
});

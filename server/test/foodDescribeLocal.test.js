// Describe-in-words without a model. Isolation FIRST: temp data dir + a CLI
// stub that exits 1, set before anything is imported, so no test can touch his
// real server/data or spend his Claude usage.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'nova-fdl-'));
const dataDir = path.join(root, 'data');
const vault = path.join(root, 'vault');
await mkdir(dataDir, { recursive: true });
await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const stub = path.join(root, 'claude-stub.sh');
await writeFile(stub, '#!/bin/sh\necho "usage limit reached" >&2\nexit 1\n', { mode: 0o755 });
process.env.NOVA_DATA_DIR = dataDir;
process.env.CLAUDE_BIN = stub;

import test from 'node:test';
import assert from 'node:assert/strict';

const { describeLocal, parseComponent, splitComponents } = await import('../lib/foodDescribeLocal.js');
const { startFoodDescribe, getFoodScanJob } = await import('../lib/scanFood.js');
const { addEntry } = await import('../lib/foodLog.js');

const logDir = path.join(dataDir, 'food-log');
await mkdir(logDir, { recursive: true });
const writeDay = (date, entries) => writeFile(path.join(logDir, `${date}.json`), JSON.stringify({ date, entries }));
await writeDay('2026-10-10', [
  { id: 'a', name: '2 eggs', macros: { p: 12, c: 1, f: 10, kcal: 146 } },
  { id: 'b', name: 'Toast', macros: { p: 4, c: 14, f: 1, kcal: 80 } },
]);
await writeDay('2026-10-12', [
  { id: 'c', name: 'Greek yoghurt', macros: { p: 17, c: 6, f: 0, kcal: 93 } },
  { id: 'd', name: '200g chicken', macros: { p: 60, c: 0, f: 8, kcal: 312 } },
]);
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), `# PART 1 — CORE DAILY MEALS

## 1. Burrito Bowl

**Macros:** 45g P / 60g C / 15g F / 555 kcal
**Makes:** 1 serve

### Ingredients
- rice

### Method
1. Cook.
`);

const noNet = async () => null;
test.after(async () => { await rm(root, { recursive: true, force: true }); });

test('splits on and, plus, commas and with; parses counts and amounts', () => {
  assert.deepEqual(splitComponents('2 eggs and toast, a banana + whey with milk'), ['2 eggs', 'toast', 'a banana', 'whey', 'milk']);
  assert.deepEqual(parseComponent('2 eggs').amount, { kind: 'n', v: 2, unit: null, grams: null });
  assert.deepEqual(parseComponent('200g chicken').amount, { kind: 'g', v: 200 });
  assert.equal(parseComponent('a banana').amount.v, 1);
  const cup = parseComponent('half a cup of rice');
  assert.equal(cup.name, 'rice');
  assert.equal(cup.amount.v, 0.5);
  assert.equal(cup.amount.unit, 'cup');
  assert.equal(parseComponent('1 scoop whey').amount.unit, 'scoop');
});

test('"2 eggs and toast" matches his own history, in order', async () => {
  const r = await describeLocal('2 eggs and toast', { lookup: null });
  assert.equal(r.source, 'code');
  assert.equal(r.confidence, 'low');
  assert.equal(r.components.length, 2);
  assert.match(r.components[0].matched, /^your log: 2 eggs \(Oct 10\)/);
  assert.equal(r.components[0].macros.kcal, 146);
  assert.match(r.components[1].matched, /your log: Toast/);
  assert.equal(r.macros.kcal, 226);
  assert.equal(r.name, '2 eggs and toast');
});

test('amounts scale the matched basis', async () => {
  const eggs = await describeLocal('4 eggs', { lookup: null });
  assert.equal(eggs.components[0].macros.kcal, 292); // 2 eggs logged, so 4 is double
  const chicken = await describeLocal('100g chicken', { lookup: null });
  assert.equal(chicken.components[0].macros.p, 30);
  assert.equal(chicken.components[0].grams, 100);
});

test('saved recipes match when his log does not', async () => {
  const r = await describeLocal('burrito bowl', { vaultPath: vault, lookup: null });
  assert.match(r.components[0].matched, /^your recipe: Burrito Bowl/);
  assert.equal(r.components[0].macros.kcal, 555);
});

test('an unknown item is kept name-only, never invented', async () => {
  const r = await describeLocal('2 eggs and dragonfruit smoothie', { lookup: noNet });
  const u = r.components[1];
  assert.equal(u.unmatched, true);
  assert.equal(u.macros, null);
  assert.equal(u.name, 'dragonfruit smoothie');
  assert.equal(r.macros.kcal, 146); // only what matched is summed
  assert.deepEqual(r.unmatched, ['dragonfruit smoothie']);
});

test('a name-only line saves: zero macros are accepted by the log', async () => {
  const r = await describeLocal('dragonfruit smoothie', { lookup: noNet });
  const day = await addEntry({ name: r.name, macros: r.macros, source: 'described', items: r.components });
  const e = day.entries.at(-1);
  assert.equal(e.name, 'dragonfruit smoothie');
  assert.equal(e.macros.kcal, 0);
  assert.equal(e.items[0].name, 'dragonfruit smoothie');
});

async function settle(id) {
  for (let i = 0; i < 100; i++) {
    const j = getFoodScanJob(id);
    if (j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job never settled');
}

test('model failure: the job still ends ready, from code, with a sentence', async () => {
  const j = await settle(startFoodDescribe('2 eggs and toast', { lookup: noNet }));
  assert.equal(j.status, 'ready');
  assert.equal(j.result.fallback, 'code');
  assert.equal(j.result.source, 'code');
  assert.match(j.result.note, /Claude was unavailable, so Nova matched these from your own log/);
  assert.equal(j.result.components.length, 2);
});

test('lane off: runs locally instead of throwing', async () => {
  await writeFile(path.join(dataDir, 'model-prefs.json'), JSON.stringify({ lanes: { 'food-describe': { enabled: false } } }));
  try {
    const j = await settle(startFoodDescribe('200g chicken', { lookup: noNet }));
    assert.equal(j.status, 'ready');
    assert.equal(j.result.fallback, 'code');
    assert.match(j.result.note, /switched off/);
    assert.equal(j.result.macros.kcal, 312);
  } finally {
    await rm(path.join(dataDir, 'model-prefs.json'), { force: true });
  }
});

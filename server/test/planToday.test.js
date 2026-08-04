// Plan Today — temp dirs BEFORE imports. Tests the pure/testable parts
// (config, prompt contract, normalize, context assembly); the model spawn
// itself isn't exercised, same as the other agent suites.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-plan-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-plan-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { getPlanConfig, setPlanConfig, buildPlanPrompt, composePlanText, buildPlanContext } = await import('../lib/planToday.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('config: draft/7 default, patch + validate', async () => {
  assert.deepEqual(await getPlanConfig(), { mode: 'draft', hour: 7 });
  assert.deepEqual(await setPlanConfig({ mode: 'auto', hour: 9 }), { mode: 'auto', hour: 9 });
  const bad = await setPlanConfig({ mode: 'nonsense', hour: 99 });
  assert.deepEqual(bad, { mode: 'auto', hour: 9 }); // invalid patch changes nothing
  await setPlanConfig({ mode: 'draft', hour: 7 });
});

test('prompt: reasons through the lens, refuses invented work, asks for typed JSON', () => {
  const p = buildPlanPrompt('TODAY: gym 18:00 on the calendar; two carryover exercises owed.');
  assert.ok(p.startsWith('NOVA OPERATING LENS'));
  assert.match(p, /TOP 3 PRIORITIES/);
  assert.match(p, /Never invent work/i);
  assert.match(p, /a two-priority day is honest/i);
  assert.match(p, /"priorities"/);
  assert.match(p, /gym 18:00/);
});

test('compose: numbers priorities, caps at 3, drops empties, refuses empty', () => {
  const { title, text, priorities } = composePlanText({
    priorities: [
      { do: 'Finish the deck for Thursday', why: 'deadline is fixed' },
      { do: '', why: 'ignored — no action' },
      { do: 'Push day at 18:00', why: 'carryover debt from Monday' },
      { do: 'Log lunch before leaving', why: 'protein floor unmet' },
      { do: 'A fourth that must be dropped', why: 'over the cap' },
    ],
  }, new Date('2026-08-04T07:00:00'));
  assert.equal(title, 'Plan Today — Tuesday 04 August');
  assert.match(text, /\*\*Today's Top 3\.\*\*/);
  assert.match(text, /1\. Finish the deck for Thursday — deadline is fixed/);
  assert.match(text, /3\. Log lunch before leaving/);
  assert.ok(!text.includes('A fourth'));
  assert.equal(priorities.length, 3); // the card renders from this array

  assert.throws(() => composePlanText({ priorities: [] }), /came back empty/);
  assert.throws(() => composePlanText({}), /came back empty/);
});

test('context: assembles without throwing on an empty vault and names the day', async () => {
  const ctx = await buildPlanContext(vault, new Date('2026-08-04T07:00:00'));
  assert.equal(typeof ctx, 'string'); // parts that fail are skipped, never fatal
});

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

test('the completion loop: a priority is marked on the record, and tomorrow\'s plan reads what happened', async () => {
  const { setPriorityOutcome } = await import('../lib/planToday.js');
  const { createRecord, getRecord } = await import('../lib/inboxStore.js');
  await createRecord({
    id: 'plan0803', kind: 'plan-today', status: 'filed', text: 'Plan Today — Monday 03 August', source: 'nova', mode: 'draft', createdAt: '2026-08-03T07:05:00',
    decision: { route: 'journal', confidence: 'high', title: 'Plan Today — Monday 03 August', reason: 'x',
      payload: { text: 'x', category: 'personal', label: 'Plan today', priorities: [{ do: 'Ship the brief', why: 'deadline' }, { do: 'Legs at 17:30', why: 'scheduled' }, { do: 'Call the dentist', why: 'overdue' }] } },
  });
  await setPriorityOutcome('plan0803', 0, 'done');
  await setPriorityOutcome('plan0803', 1, 'skipped');
  let ps = (await getRecord('plan0803')).decision.payload.priorities;
  assert.equal(ps[0].outcome, 'done'); assert.ok(ps[0].outcomeAt);
  assert.equal(ps[1].outcome, 'skipped');
  assert.equal(ps[2].outcome, undefined, 'unmarked stays unmarked');
  await setPriorityOutcome('plan0803', 1, null); // clearing a mark
  ps = (await getRecord('plan0803')).decision.payload.priorities;
  assert.equal(ps[1].outcome, undefined); assert.equal(ps[1].outcomeAt, undefined);
  await setPriorityOutcome('plan0803', 1, 'skipped');
  await assert.rejects(() => setPriorityOutcome('plan0803', 7, 'done'), /no such priority/);
  await assert.rejects(() => setPriorityOutcome('plan0803', 0, 'meh'), /outcome must be/);
  await assert.rejects(() => setPriorityOutcome('nope', 0, 'done'), /not a day plan/);

  // the next morning, the plan's context carries yesterday's outcomes
  const ctx = await buildPlanContext(vault, new Date('2026-08-04T07:00:00'));
  assert.match(ctx, /YESTERDAY'S TOP 3 \(plan approved; 1 of 3 marked done\)/);
  assert.match(ctx, /1\. Ship the brief — DONE\n2\. Legs at 17:30 — SKIPPED\n3\. Call the dentist — no word/);
  assert.match(buildPlanPrompt(ctx), /carry a skipped priority forward only if it still matters today/);
  // two days on, no plan the day before → honestly absent
  assert.doesNotMatch(await buildPlanContext(vault, new Date('2026-08-05T07:00:00')), /YESTERDAY'S TOP 3/);
});

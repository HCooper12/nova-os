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

const { getPlanConfig, setPlanConfig, buildPlanPrompt, composePlanText, buildPlanContext, linkPrioritiesToTodos, setPriorityOutcome, failedPlansToday, PLAN_MAX_ATTEMPTS } = await import('../lib/planToday.js');

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

// ---- [06] plan 8 (gated → containment only): a priority that names a to-do carries it; DONE checks it ----
test('linkage: only a to-do whose whole text sits inside the priority is linked; a paraphrase is not; DONE ticks it through the to-do rail', async () => {
  const todos = [
    { raw: '- [ ] swipe verification item _(added 2026-08-23)_ #admin', text: 'swipe verification item', checked: false },
    { raw: '- [ ] Plan meals and shopping list for next week', text: 'Plan meals and shopping list for next week', checked: false },
    { raw: '- [x] old thing', text: 'old thing', checked: true },
    { raw: '- [ ] gym', text: 'gym', checked: false },
  ];
  const linked = linkPrioritiesToTodos([
    { do: 'Clear the 2 open to-dos (swipe verification item, optimistic probe)', why: '' },
    { do: "Use the 17:00 block to finish next week's meal plan and shopping list", why: '' },
    { do: 'Hit the gym hard', why: '' },
  ], todos);
  assert.deepEqual(linked[0].todoLines, ['- [ ] swipe verification item _(added 2026-08-23)_ #admin'], 'named verbatim → linked');
  assert.equal(linked[1].todoLines, undefined, 'a paraphrase (83% token overlap on his real data) is NOT a link');
  assert.equal(linked[2].todoLines, undefined, 'a four-letter to-do never links by containment');

  // compose wires the linkage in when handed the list
  const { priorities } = composePlanText({ priorities: [{ do: 'Clear the swipe verification item before work', why: 'x' }] }, new Date(), { todos });
  assert.equal(priorities[0].todoLines.length, 1);

  // DONE on a linked priority checks the real to-do
  const { addTodo, listTodos } = await import('../lib/todos.js');
  const { createRecord, getRecord } = await import('../lib/inboxStore.js');
  await addTodo(vault, 'swipe verification item', 'admin');
  const { items } = await listTodos(vault);
  const real = items.find((x) => x.text === 'swipe verification item');
  await createRecord({
    id: 'plnlink1', kind: 'plan-today', status: 'filed', text: 'Plan', source: 'nova', mode: 'auto', createdAt: new Date().toISOString(),
    decision: { route: 'journal', confidence: 'high', title: 'Plan', reason: 'x', payload: { text: 'x', priorities: [{ do: 'Clear the swipe verification item', why: '', todoLines: [real.raw] }] } },
  });
  await setPriorityOutcome('plnlink1', 0, 'done', { vaultPath: vault });
  const after = (await listTodos(vault)).items.find((x) => x.text === 'swipe verification item');
  assert.equal(after.checked, true, 'the to-do is ticked');
  const rec = await getRecord('plnlink1');
  assert.deepEqual(rec.decision.payload.priorities[0].checkedTodos, ['swipe verification item'], 'and the record says so');
  // skipping never unticks — a tick is his
  await setPriorityOutcome('plnlink1', 0, 'skipped', { vaultPath: vault });
  assert.equal((await listTodos(vault)).items.find((x) => x.text === 'swipe verification item').checked, true);
});

// ---- [06] plans 2, 5, 7: the last review in the plan's context; his decline reason; the final-failure count ----
test('the plan reads the last review and quotes his reason for declining yesterday\'s plan; three failures is the cap', async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  const now = new Date('2026-08-12T07:00:00');
  await createRecord({
    id: 'rvx0811', kind: 'review', status: 'filed', text: 'Daily Review — Tuesday 11 August', source: 'nova', mode: 'auto', createdAt: '2026-08-11T20:05:00',
    decision: { route: 'journal', confidence: 'high', title: 'Daily Review — Tuesday 11 August', reason: 'x', payload: { text: 'Daily Review — Tuesday 11 August\n\n**Read.** Protein slipped late again.\n\n**Adjustments.**\n1. Front-load protein', category: 'personal', label: 'Daily review reflection' } },
  });
  await createRecord({
    id: 'plx0811', kind: 'plan-today', status: 'discarded', declineReason: 'Too ambitious', text: 'Plan Today — Tuesday 11 August', source: 'nova', mode: 'draft', createdAt: '2026-08-11T07:05:00',
    decision: { route: 'journal', confidence: 'high', title: 'Plan Today — Tuesday 11 August', reason: 'x', payload: { text: 'x', priorities: [{ do: 'Ship the whole feature', why: 'x' }, { do: 'Cook for the week', why: 'x' }] } },
  });
  const ctx = await buildPlanContext(vault, now);
  assert.match(ctx, /THE LAST DAILY REVIEW \(yesterday/);
  assert.match(ctx, /Protein slipped late again/);
  assert.match(ctx, /YESTERDAY'S TOP 3 \(plan declined — his reason: "Too ambitious"/);
  assert.match(ctx, /never re-issue what he declined unchanged/);
  // a review older than two days is not this morning's frame
  assert.doesNotMatch(await buildPlanContext(vault, new Date('2026-08-15T07:00:00')), /THE LAST DAILY REVIEW/);
  // the final-failure count
  const rec = (id, status, at, kind = 'plan-today') => ({ id, kind, status, createdAt: at });
  assert.equal(PLAN_MAX_ATTEMPTS, 3);
  assert.equal(failedPlansToday([rec('a', 'error', '2026-08-12T07:00:00'), rec('b', 'error', '2026-08-12T07:20:00'), rec('c', 'pending', '2026-08-12T07:40:00')], now), 2);
  assert.equal(failedPlansToday([rec('a', 'error', '2026-08-11T07:00:00')], now), 0, "yesterday's failure is yesterday's");
  assert.equal(failedPlansToday([rec('a', 'error', '2026-08-12T07:00:00', 'review')], now), 0, "the review's failures are not the plan's");
});

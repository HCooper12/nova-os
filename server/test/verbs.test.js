// The Verbs: a strict grammar for the high-frequency state changes, a
// registry the model addresses with ACT, name resolution that never guesses,
// and every act receipted on the rails with a working undo.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-verbs-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-verbs-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { parseCommand, matchName, runVerb, tryCommand, parseActDirective, describeForModel, VERB_IDS } = await import('../lib/verbs.js');
const { addTodo, listTodos } = await import('../lib/todos.js');
const { addItemsDirect, loadShoppingList } = await import('../lib/shoppingList.js');
const { addRecipe, loadRecipes } = await import('../lib/recipes.js');
const { loadRotation, setRotationSlot } = await import('../lib/rotation.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { getRecord, createRecord } = await import('../lib/inboxStore.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

test('grammar: the sure commands parse; questions and prose do not', () => {
  assert.deepEqual(parseCommand('Nova, I bought milk'), { verb: 'shopping.done', args: { item: 'milk' } });
  assert.deepEqual(parseCommand('had lunch'), { verb: 'meal.eaten', args: { slot: 'lunch' } });
  assert.deepEqual(parseCommand('move dentist to errands'), { verb: 'todo.move', args: { text: 'dentist', category: 'errands' } });
  assert.deepEqual(parseCommand('set eggs to 12'), { verb: 'shopping.qty', args: { item: 'eggs', qty: 12 } });
  assert.deepEqual(parseCommand('clear my shopping list'), { verb: 'shopping.clear', args: {} });
  assert.deepEqual(parseCommand('run the plan'), { verb: 'plan.run', args: {} });
  assert.deepEqual(parseCommand('untick milk on the shopping list'), { verb: 'shopping.undone', args: { item: 'milk' } });
  // two domains fit — the grammar hands over candidates, never a guess
  assert.ok(Array.isArray(parseCommand('tick off buy eggs').any));
  assert.equal(parseCommand('why are my steps low'), null);
  assert.equal(parseCommand('what should I eat for lunch'), null);
  assert.equal(parseCommand('remind me to call mum'), null);
});

test('names: exact beats prefix beats tokens; a tie is an ambiguity, not a coin toss', () => {
  const pool = [{ name: 'Buy eggs' }, { name: 'Buy egg cartons' }, { name: 'Book the dentist' }];
  assert.equal(matchName(pool, 'buy eggs').hit.name, 'Buy eggs');
  assert.equal(matchName(pool, 'the dentist').hit.name, 'Book the dentist');
  assert.equal(matchName(pool, 'dentist').hit.name, 'Book the dentist');
  const amb = matchName([{ name: 'Milk' }, { name: 'Oat milk' }], 'milk');
  assert.equal(amb.hit.name, 'Milk'); // exact wins outright
  const tie = matchName([{ name: 'Call John' }, { name: 'Call Jane' }], 'call');
  assert.equal(tie.hit, null);
  assert.match(tie.why, /which one/);
  assert.match(matchName(pool, 'unicorn').why, /nothing called/);
});

test('todo: tick by voice lands a filed receipt with undo, and undo reopens it', async () => {
  await addTodo(vault, 'Buy eggs', 'errands');
  await addTodo(vault, 'Call the dentist', 'personal');
  const out = await runVerb(vault, 'tick off the eggs', { verb: 'todo.done', args: { text: 'eggs' } });
  assert.ok(out.acted.recordId);
  assert.match(out.acted.said, /Buy eggs/);
  let { items } = await listTodos(vault);
  assert.equal(items.find((t) => t.text === 'Buy eggs').checked, true);
  const rec = await getRecord(out.acted.recordId);
  assert.equal(rec.status, 'filed');
  assert.equal(rec.kind, 'act');
  assert.equal(rec.undoData.route, 'act');
  const undone = await undoRecord(vault, out.acted.recordId);
  assert.equal(undone.status, 'undone');
  ({ items } = await listTodos(vault));
  assert.equal(items.find((t) => t.text === 'Buy eggs').checked, false);
  // already open → honest refusal, nothing written
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'todo.reopen', args: { text: 'eggs' } }), /no ticked to-do/);
  // move + undo
  const mv = await runVerb(vault, 'q', { verb: 'todo.move', args: { text: 'dentist', category: 'work' } });
  ({ items } = await listTodos(vault));
  assert.equal(items.find((t) => t.text === 'Call the dentist').category, 'work');
  await undoRecord(vault, mv.acted.recordId);
  ({ items } = await listTodos(vault));
  assert.equal(items.find((t) => t.text === 'Call the dentist').category, 'personal');
});

test('shopping: tick, quantity, and the confirm-first clear through approve + undo', async () => {
  await addItemsDirect(vault, [{ name: 'Milk', category: 'Dairy & Eggs' }, { name: 'Oat milk', category: 'Dairy & Eggs' }, { name: 'Eggs', category: 'Dairy & Eggs', qty: 6 }]);
  const tick = await runVerb(vault, 'q', { verb: 'shopping.done', args: { item: 'milk' } });
  let { items } = await loadShoppingList(vault);
  assert.equal(items.find((i) => i.name === 'Milk').checked, true);
  assert.equal(items.find((i) => i.name === 'Oat milk').checked, false);
  await undoRecord(vault, tick.acted.recordId);
  ({ items } = await loadShoppingList(vault));
  assert.equal(items.find((i) => i.name === 'Milk').checked, false);
  const qty = await runVerb(vault, 'q', { verb: 'shopping.qty', args: { item: 'eggs', qty: 12 } });
  ({ items } = await loadShoppingList(vault));
  assert.equal(items.find((i) => i.name === 'Eggs').qty, 12);
  await undoRecord(vault, qty.acted.recordId);
  ({ items } = await loadShoppingList(vault));
  assert.equal(items.find((i) => i.name === 'Eggs').qty, 6);
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'shopping.qty', args: { item: 'eggs', qty: 500 } }), /1 to 99/);
  // clear is confirm-first: pending record, nothing cleared until approve
  const clr = await runVerb(vault, 'clear the list', { verb: 'shopping.clear', args: {} });
  assert.ok(clr.proposal.recordId);
  ({ items } = await loadShoppingList(vault));
  assert.equal(items.length, 3);
  await approveRecord(vault, clr.proposal.recordId);
  ({ items } = await loadShoppingList(vault));
  assert.equal(items.length, 0);
  await undoRecord(vault, clr.proposal.recordId);
  ({ items } = await loadShoppingList(vault));
  assert.equal(items.length, 3);
});

test('meals: eaten by voice against today\'s real rotation, honest when already marked, undo clears', async () => {
  await addRecipe(vault, { name: 'Works Burger', category: 'CORE DAILY MEALS', macros: { p: 54, c: 60, f: 30, kcal: 725 }, ingredients: ['bun'], method: ['grill'] });
  const recipes = await loadRecipes(vault);
  const burger = recipes.find((r) => r.name === 'Works Burger');
  await setRotationSlot(vault, recipes, 'lunch', burger.id);
  const out = await runVerb(vault, 'had lunch', { verb: 'meal.eaten', args: { slot: 'lunch' } });
  assert.match(out.acted.said, /Works Burger/);
  assert.equal((await loadRotation(vault, recipes)).slots.lunch.consumed, true);
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'meal.eaten', args: { slot: 'lunch' } }), /already marked eaten/);
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'meal.eaten', args: { slot: 'dinner' } }), /no recipe/);
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'meal.eaten', args: { slot: 'brunch' } }), /isn't a meal slot/);
  await undoRecord(vault, out.acted.recordId);
  assert.equal((await loadRotation(vault, recipes)).slots.lunch.consumed, false);
});

test('plan priorities: resolved against today\'s plan, marked, undone', async () => {
  await createRecord({
    id: 'plan0001', kind: 'plan-today', status: 'pending', source: 'plan-today', mode: 'draft', createdAt: new Date().toISOString(),
    decision: { route: 'plan-note', title: 'Today', payload: { priorities: [{ text: 'Finish the science outline' }, { text: 'Gym — push day' }] } },
  });
  const out = await runVerb(vault, 'q', { verb: 'plan.priority', args: { priority: 'science outline', outcome: 'done' } });
  assert.match(out.acted.said, /science outline/);
  assert.equal((await getRecord('plan0001')).decision.payload.priorities[0].outcome, 'done');
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'plan.priority', args: { priority: 'science outline', outcome: 'done' } }), /already done/);
  await undoRecord(vault, out.acted.recordId);
  assert.equal((await getRecord('plan0001')).decision.payload.priorities[0].outcome, undefined);
});

test('the fast path: a sure command runs without a model; two-domain words resolve against real data', async () => {
  const r = await tryCommand(vault, 'tick off the eggs');
  // "eggs" is both an open to-do ("Buy eggs") and a shopping item — nothing runs
  assert.equal(r.miss, true);
  assert.match(r.text, /which one/i);
  const r2 = await tryCommand(vault, 'tick off the dentist');
  assert.equal(r2.matched, 'todo.done');
  assert.ok(r2.acted.recordId);
  await undoRecord(vault, r2.acted.recordId);
  const r3 = await tryCommand(vault, 'I bought oat milk');
  assert.equal(r3.matched, 'shopping.done');
  const miss = await tryCommand(vault, 'tick off the unicorn');
  assert.equal(miss.miss, true);
  assert.match(miss.text, /couldn't find/);
  assert.equal(await tryCommand(vault, 'how many steps today'), null);
});

test('the ACT line: parsed off the reply; prose and bad JSON are named, not swallowed', () => {
  const p = parseActDirective('Ticking it off.\nACT {"verb":"todo.done","args":{"text":"eggs"}}');
  assert.equal(p.cleanText, 'Ticking it off.');
  assert.deepEqual(p.act, { verb: 'todo.done', args: { text: 'eggs' } });
  assert.match(parseActDirective('Sure.\nACT tick off eggs').parseError, /prose/);
  assert.match(parseActDirective('Sure.\nACT {not json}').parseError, /JSON/);
  assert.equal(parseActDirective('plain answer').act, null);
});

test('the catalogue the model reads is generated from the registry', () => {
  const text = describeForModel();
  for (const id of VERB_IDS) assert.ok(text.includes(`"verb":"${id}"`), id);
  assert.match(text, /shopping\.clear.*lands pending/);
  assert.rejects(() => runVerb(vault, 'q', { verb: 'wire.money', args: {} }), /don't have a verb/);
  assert.rejects(() => runVerb(vault, 'q', { verb: 'todo.done', args: {} }), /needs text/);
});

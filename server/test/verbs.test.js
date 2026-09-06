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
  // "remind me …" is handed over as a CANDIDATE (7 Sep): it becomes a verb
  // only when the time reads, and a timeless one falls through to the
  // capture classifier — proven in the reminders test below
  assert.ok(parseCommand('remind me to call mum').any);
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

test('the first hand: a Shortcut runs only by its resolved exact name, confirm-first, immediate once he lists it', async () => {
  const hands = await import('../lib/hands.js');
  const calls = [];
  hands._setRunnerForTests(async (bin, args) => {
    calls.push(args);
    if (args[0] === 'list') return { stdout: 'Goodnight\nTurn on my bedroom lights\nCool my room 1\nHeat my room 1\n' };
    if (args[0] === 'run') { const out = args[args.indexOf('--output-path') + 1]; await writeFile(out, 'lights on', 'utf8'); return { stdout: '', stderr: '' }; }
    throw new Error('unexpected');
  });
  try {
    // the grammar: the whole utterance IS a Shortcut → the verb; a partial fit is not
    await hands.listShortcuts({ force: true });
    assert.deepEqual(parseCommand('goodnight'), { verb: 'shortcut.run', args: { name: 'Goodnight' } });
    assert.deepEqual(parseCommand('turn on my bedroom lights'), { verb: 'shortcut.run', args: { name: 'Turn on my bedroom lights' } });
    assert.equal(parseCommand('my room is too warm'), null);
    // "run X" that names no Shortcut is NOT a command — it falls through to the model
    assert.equal(await tryCommand(vault, 'run the numbers on my protein'), null);
    // confirm-first by default: a pending record, nothing run
    const r = await tryCommand(vault, 'run cool my room');
    assert.ok(r.proposal?.recordId, 'lands pending');
    assert.match(r.text, /Cool my room 1/);
    assert.equal(calls.filter((a) => a[0] === 'run').length, 0);
    // his yes runs it, and the receipt says there is no undo
    await approveRecord(vault, r.proposal.recordId);
    assert.equal(calls.filter((a) => a[0] === 'run').length, 1);
    assert.equal(calls.find((a) => a[0] === 'run')[1], 'Cool my room 1');
    const rec = await getRecord(r.proposal.recordId);
    assert.equal(rec.status, 'filed');
    assert.equal(rec.undoData, null);
    await assert.rejects(() => undoRecord(vault, r.proposal.recordId), /only filed captures can be undone/);
    // a tie asks, and nothing runs
    const tie = await tryCommand(vault, 'run my room');
    assert.equal(tie.miss, true);
    assert.match(tie.text, /which one/);
    // ACT from the model with an inexact name resolves the same way
    const via = await runVerb(vault, 'q', { verb: 'shortcut.run', args: { name: 'bedroom lights' } });
    assert.match(via.proposal.title, /Turn on my bedroom lights/);
    // immediate once he lists it: runs at once, output spoken
    await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
    await writeFile(path.join(process.env.NOVA_DATA_DIR, 'hands.json'), JSON.stringify({ immediate: ['Turn on my bedroom lights'] }), 'utf8');
    const now = await runVerb(vault, 'q', { verb: 'shortcut.run', args: { name: 'turn on my bedroom lights' } });
    assert.ok(now.acted, 'ran immediately');
    assert.match(now.acted.said, /lights on/);
    assert.equal(now.acted.undoable, false);
  } finally {
    hands._setRunnerForTests(null);
  }
});

test('phase 2: add a to-do, set a slot, journal a line, stash a link, refile a transaction — each undone', async () => {
  // to-do
  assert.deepEqual(parseCommand('make lunch works burger'), { verb: 'recipe.slot', args: { slot: 'lunch', recipe: 'works burger' } });
  const add = await runVerb(vault, 'q', { verb: 'todo.add', args: { text: 'Renew passport', category: 'errands' } });
  let { items } = await listTodos(vault);
  assert.ok(items.find((t) => t.text === 'Renew passport' && t.category === 'errands'));
  await undoRecord(vault, add.acted.recordId);
  ({ items } = await listTodos(vault));
  assert.ok(!items.find((t) => t.text === 'Renew passport'));
  // rotation slot (Works Burger exists from the meals test)
  const recipes = await loadRecipes(vault);
  const slot = await runVerb(vault, 'q', { verb: 'recipe.slot', args: { slot: 'dinner', recipe: 'works burger' } });
  assert.match(slot.acted.said, /Dinner is now Works Burger/);
  assert.equal((await loadRotation(vault, recipes)).slots.dinner.name, 'Works Burger');
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'recipe.slot', args: { slot: 'dinner', recipe: 'works burger' } }), /already/);
  await undoRecord(vault, slot.acted.recordId);
  assert.equal((await loadRotation(vault, recipes)).slots.dinner, null);
  // journal
  const j = await runVerb(vault, 'q', { verb: 'journal.add', args: { text: 'Slept badly, felt it in the session' } });
  const { listEntries } = await import('../lib/journal.js');
  assert.ok((await listEntries(vault, { limit: 5 })).some((e) => /Slept badly/.test(e.text || e.summary || JSON.stringify(e))));
  await undoRecord(vault, j.acted.recordId);
  // stash: needs a category page
  const { addStashItem, loadStash } = await import('../lib/stash.js');
  await addStashItem(vault, { category: 'Skincare', name: 'seed', url: 'https://example.com/seed' });
  const st = await runVerb(vault, 'q', { verb: 'stash.add', args: { url: 'https://example.com/serum', name: 'the serum', category: 'skin care' } });
  assert.match(st.acted.said, /Skincare/);
  assert.ok((await loadStash(vault)).categories.find((c) => c.name === 'Skincare').items.some((i) => i.url === 'https://example.com/serum'));
  await undoRecord(vault, st.acted.recordId);
  assert.ok(!(await loadStash(vault)).categories.find((c) => c.name === 'Skincare').items.some((i) => i.url === 'https://example.com/serum'));
  await assert.rejects(() => runVerb(vault, 'q', { verb: 'stash.add', args: { url: 'https://x.y', name: 'x', category: 'unicorns' } }), /no Stash category/);
  // money
  const { addTransactions, listTransactions } = await import('../lib/money.js');
  await addTransactions([{ date: new Date().toISOString().slice(0, 10), merchant: 'UBER EATS', amount: -32.5, description: 'UBER *EATS' }], 'test');
  const before = (await listTransactions({ sinceMonths: 1 })).find((t) => t.merchant === 'UBER EATS');
  const mc = await runVerb(vault, 'q', { verb: 'money.category', args: { merchant: 'uber eats', category: 'transport' } });
  assert.match(mc.acted.said, /Transport/);
  assert.equal((await listTransactions({ sinceMonths: 1 })).find((t) => t.id === before.id).category, 'Transport');
  await undoRecord(vault, mc.acted.recordId);
  assert.equal((await listTransactions({ sinceMonths: 1 })).find((t) => t.id === before.id).category, before.category);
});

test('reminders by voice: the time is read deterministically, or the sentence is left to the classifier', async () => {
  const { parseWhen } = await import('../lib/whenParser.js');
  const now = new Date(2026, 8, 7, 10, 30);
  assert.equal(parseWhen('call the bank at 6', now).when.getHours(), 18);
  assert.equal(parseWhen('call mum in 20 minutes', now).when.getMinutes(), 50);
  assert.equal(parseWhen('stretch tomorrow at 7', now).when.getDate(), 8);
  assert.equal(parseWhen('pay rent on monday', now).getDay?.() ?? parseWhen('pay rent on monday', now).when.getDay(), 1);
  assert.equal(parseWhen('call mum in 20 minutes', now).text, 'call mum');
  assert.equal(parseWhen('water the plants', now), null);
  // the grammar hands it over only as a candidate; a timeless sentence is not a command
  assert.ok(parseCommand('remind me to call the bank at 6').any);
  assert.equal(await tryCommand(vault, 'remind me to water the plants'), null);
  const r = await tryCommand(vault, 'remind me to call the bank in 2 hours');
  assert.equal(r.matched, 'reminder.set');
  assert.match(r.text, /I'll remind you/);
  const { listReminders } = await import('../lib/reminders.js');
  assert.ok((await listReminders()).some((x) => /call the bank/.test(x.text)));
  await undoRecord(vault, r.acted.recordId);
  assert.ok(!(await listReminders()).some((x) => /call the bank/.test(x.text)));
});

test('the browser hand: its report is built from the model’s JSON, and a missing report is said, not invented', async () => {
  const { parseBrowseResult, describeBrowse, buildBrowsePrompt } = await import('../lib/browse.js');
  const good = parseBrowseResult('Here is what I found.\nBROWSE {"done":true,"summary":"The court is free at 5pm.","steps":["opened the booking page","filtered to today"],"stoppedBefore":"the Confirm booking button","cannot":null}');
  assert.equal(good.done, true);
  assert.equal(good.steps.length, 2);
  assert.equal(good.stoppedBefore, 'the Confirm booking button');
  const body = describeBrowse({ task: 'book a court', result: good, shots: 3 });
  assert.match(body, /The court is free at 5pm/);
  assert.match(body, /Stopped before: the Confirm booking button — that one is yours to press/);
  assert.match(body, /3 screenshots saved/);
  // no report at all: the record says so rather than inventing an outcome
  assert.equal(parseBrowseResult('I had a look around.'), null);
  const empty = describeBrowse({ task: 'x', result: null, shots: 0 });
  assert.match(empty, /without a readable report/);
  assert.match(empty, /No screenshots were taken/);
  // the prompt carries the stop rule and the shot directory
  const p = buildBrowsePrompt('book a court', '/tmp/shots');
  assert.match(p, /BUYS, PAYS, BOOKS, SENDS, POSTS, APPLIES, SUBMITS/);
  assert.match(p, /Never type a password/);
  assert.match(p, /\/tmp\/shots\/shot-N\.png/);
});

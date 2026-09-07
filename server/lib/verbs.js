// THE VERBS — Nova's action registry, and the front door's fast path.
//
// His brief (6 Sep 2026, the Astra reel): every feature reachable by one
// natural sentence, spoken or typed, with delegation invisible and no
// awkward waiting. Speech already reached capture, dispatch and coaching
// edits; it did not reach the ordinary state changes he makes with his
// thumb fifty times a day — ticking a to-do, checking off the eggs, marking
// lunch eaten, marking a priority done. This file is where those become
// words.
//
// The doctrine holds exactly as it does everywhere else:
//   models decide, code acts — the model (or the grammar below) NAMES a verb
//     and its arguments; only the tested `run` here writes;
//   everything writeable is undoable — every act lands a receipt on the
//     inbox rails with undoData, so the strip's Undo and the Inbox's undo
//     are the same rail;
//   honest degradation — a name that matches nothing, or two things, is
//     said back to him; nothing is guessed.
//
// Two ways in, one registry:
//   1. parseCommand(text) — a strict deterministic grammar for the
//      high-frequency verbs. A hit runs in well under a second and the
//      model is never spawned (the Reflex Layer's rule, applied to doing).
//   2. ACT {"verb":…,"args":{…}} — the conversational model's directive for
//      everything the grammar is too strict to catch. Same validation, same
//      resolution, same receipt.
//
// Tiers: 'act' verbs run immediately (reversible, cheap, his intent is
// plain). 'confirm' verbs land PENDING and take his yes — the same spoken
// yes that approves a proposal.

import { randomUUID } from 'node:crypto';

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'extra'];
const TODO_CATS = ['personal', 'work', 'fitness', 'errands', 'later'];

// ---------------------------------------------------------------- names

// Spoken names are approximate. Score every candidate against the query,
// keep the best; a tie between two DIFFERENT things is an ambiguity he
// resolves, never a coin toss.
export function normaliseName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[“”"'’]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|my|some|of|off|to|please|pls)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchName(candidates, query, { label = (c) => c.name } = {}) {
  const q = normaliseName(query);
  if (!q) return { hit: null, why: 'no name given' };
  const qTokens = q.split(' ').filter(Boolean);
  const scored = candidates.map((c) => {
    const name = normaliseName(label(c));
    if (!name) return { c, score: 0 };
    if (name === q) return { c, score: 4 };
    const nTokens = name.split(' ');
    if (name.startsWith(q) || name.endsWith(q)) return { c, score: 3 };
    if (qTokens.every((t) => nTokens.includes(t))) return { c, score: 2.5 };
    if (qTokens.every((t) => name.includes(t))) return { c, score: 2 };
    if (nTokens.every((t) => qTokens.includes(t))) return { c, score: 1.5 };
    // every real word he said must be in the name — "call mum" must never
    // match "Call the dentist" just because they share a verb
    const real = qTokens.filter((t) => t.length > 2);
    return { c, score: real.length && real.every((t) => nTokens.includes(t)) ? 1 : 0 };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { hit: null, why: `nothing called "${query}"` };
  const top = scored[0].score;
  const tied = scored.filter((s) => s.score === top);
  if (tied.length > 1 && top < 4) {
    return { hit: null, ambiguous: tied.map((s) => label(s.c)), why: `"${query}" could be ${tied.map((s) => `"${label(s.c)}"`).join(' or ')} — which one?` };
  }
  return { hit: tied[0].c, score: top };
}

const say = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// -------------------------------------------------------------- registry

// Each verb: id · what it is for (the model reads this) · args (the model's
// contract) · tier · run(vaultPath, args) → { destination, undo, said }
// · undo(vaultPath, undo) → summary. `run` resolves names itself and throws
// in his words when it cannot.
const VERBS = {};
function verb(def) { VERBS[def.id] = def; }

async function todoLib() { return import('./todos.js'); }
async function shopLib() { return import('./shoppingList.js'); }
async function rotationLibs() {
  const [{ loadRecipeData }, rot] = await Promise.all([import('./recipes.js'), import('./rotation.js')]);
  return { loadRecipeData, ...rot };
}

async function openTodo(vaultPath, text, { wantChecked = false } = {}) {
  const { listTodos } = await todoLib();
  const { items } = await listTodos(vaultPath);
  const pool = items.filter((t) => !!t.checked === wantChecked);
  const m = matchName(pool, text, { label: (t) => t.text });
  if (!m.hit) throw new Error(m.ambiguous ? m.why : `there's no ${wantChecked ? 'ticked' : 'open'} to-do called "${say(text)}"`);
  return m.hit;
}

verb({
  id: 'todo.done', tier: 'act',
  describe: 'tick a to-do off his list', args: { text: 'the to-do, in his words' },
  async run(vaultPath, args) {
    const { toggleTodo } = await todoLib();
    const item = await openTodo(vaultPath, args.text, { wantChecked: false });
    const after = await toggleTodo(vaultPath, item.raw);
    const now = after.items.find((t) => t.text === item.text && t.checked);
    return { destination: `To-Do — ticked "${item.text}"`, said: `Ticked off "${item.text}".`, undo: { verb: 'todo.done', raw: now?.raw || null, text: item.text } };
  },
  async undo(vaultPath, u) {
    const { listTodos, toggleTodo } = await todoLib();
    const { items } = await listTodos(vaultPath);
    const item = items.find((t) => t.raw === u.raw) || items.find((t) => t.text === u.text && t.checked);
    if (!item) throw new Error(`"${u.text}" is no longer ticked`);
    await toggleTodo(vaultPath, item.raw);
    return `put "${u.text}" back on the list`;
  },
});

verb({
  id: 'todo.reopen', tier: 'act',
  describe: 'put a ticked to-do back on the list', args: { text: 'the to-do, in his words' },
  async run(vaultPath, args) {
    const { toggleTodo } = await todoLib();
    const item = await openTodo(vaultPath, args.text, { wantChecked: true });
    const after = await toggleTodo(vaultPath, item.raw);
    const now = after.items.find((t) => t.text === item.text && !t.checked);
    return { destination: `To-Do — reopened "${item.text}"`, said: `"${item.text}" is back on the list.`, undo: { verb: 'todo.reopen', raw: now?.raw || null, text: item.text } };
  },
  async undo(vaultPath, u) {
    const { listTodos, toggleTodo } = await todoLib();
    const { items } = await listTodos(vaultPath);
    const item = items.find((t) => t.raw === u.raw) || items.find((t) => t.text === u.text && !t.checked);
    if (!item) throw new Error(`"${u.text}" is not open any more`);
    await toggleTodo(vaultPath, item.raw);
    return `ticked "${u.text}" off again`;
  },
});

verb({
  id: 'todo.move', tier: 'act',
  describe: 'move a to-do to another category', args: { text: 'the to-do, in his words', category: TODO_CATS.join('|') },
  async run(vaultPath, args) {
    const cat = String(args.category || '').toLowerCase().replace(/s$/, '').replace(/^errand$/, 'errands');
    if (!TODO_CATS.includes(cat)) throw new Error(`"${args.category}" isn't a to-do category (${TODO_CATS.join(', ')})`);
    const { setTodoCategory } = await todoLib();
    const item = await openTodo(vaultPath, args.text);
    if (item.category === cat) throw new Error(`"${item.text}" is already under ${cat}`);
    const after = await setTodoCategory(vaultPath, item.raw, cat);
    const now = after.items.find((t) => t.text === item.text);
    return { destination: `To-Do — "${item.text}" → ${cat}`, said: `Moved "${item.text}" to ${cat}.`, undo: { verb: 'todo.move', raw: now?.raw || null, text: item.text, prior: item.category } };
  },
  async undo(vaultPath, u) {
    const { listTodos, setTodoCategory } = await todoLib();
    const { items } = await listTodos(vaultPath);
    const item = items.find((t) => t.raw === u.raw) || items.find((t) => t.text === u.text);
    if (!item) throw new Error(`"${u.text}" is no longer on the list`);
    await setTodoCategory(vaultPath, item.raw, u.prior);
    return `moved "${u.text}" back to ${u.prior}`;
  },
});

async function shoppingItem(vaultPath, name, { wantChecked = null } = {}) {
  const { loadShoppingList } = await shopLib();
  const { items } = await loadShoppingList(vaultPath);
  const pool = wantChecked == null ? items : items.filter((i) => !!i.checked === wantChecked);
  const m = matchName(pool, name);
  if (!m.hit) {
    if (m.ambiguous) throw new Error(m.why);
    const state = wantChecked == null ? '' : wantChecked ? 'ticked ' : 'unticked ';
    throw new Error(`there's no ${state}"${say(name)}" on the shopping list`);
  }
  return m.hit;
}

verb({
  id: 'shopping.done', tier: 'act',
  describe: 'tick an item off the shopping list', args: { item: 'the item, in his words' },
  async run(vaultPath, args) {
    const { toggleItem } = await shopLib();
    const it = await shoppingItem(vaultPath, args.item, { wantChecked: false });
    await toggleItem(vaultPath, it.id, true);
    return { destination: `Shopping — ticked ${it.name}`, said: `Ticked off ${it.name}.`, undo: { verb: 'shopping.done', id: it.id, name: it.name } };
  },
  async undo(vaultPath, u) { const { toggleItem } = await shopLib(); await toggleItem(vaultPath, u.id, false); return `unticked ${u.name}`; },
});

verb({
  id: 'shopping.undone', tier: 'act',
  describe: 'untick a shopping item', args: { item: 'the item, in his words' },
  async run(vaultPath, args) {
    const { toggleItem } = await shopLib();
    const it = await shoppingItem(vaultPath, args.item, { wantChecked: true });
    await toggleItem(vaultPath, it.id, false);
    return { destination: `Shopping — unticked ${it.name}`, said: `${it.name} is back on the list.`, undo: { verb: 'shopping.undone', id: it.id, name: it.name } };
  },
  async undo(vaultPath, u) { const { toggleItem } = await shopLib(); await toggleItem(vaultPath, u.id, true); return `ticked ${u.name} again`; },
});

verb({
  id: 'shopping.qty', tier: 'act',
  describe: 'set how many of a shopping item', args: { item: 'the item, in his words', qty: '1-99' },
  async run(vaultPath, args) {
    const { setItemQty, normalizeQty, MAX_QTY } = await shopLib();
    const qty = Number(args.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error(`the quantity has to be 1 to ${MAX_QTY}`);
    const it = await shoppingItem(vaultPath, args.item);
    const prior = normalizeQty(it.qty);
    await setItemQty(vaultPath, it.id, qty);
    return { destination: `Shopping — ${it.name} × ${qty}`, said: `${it.name}: ${qty}.`, undo: { verb: 'shopping.qty', id: it.id, name: it.name, prior } };
  },
  async undo(vaultPath, u) { const { setItemQty } = await shopLib(); await setItemQty(vaultPath, u.id, u.prior); return `${u.name} back to ${u.prior}`; },
});

verb({
  id: 'shopping.clear', tier: 'confirm',
  describe: 'clear the whole shopping list (asks first)', args: {},
  async run(vaultPath) {
    const { clearAll } = await shopLib();
    const cleared = await clearAll(vaultPath);
    if (!cleared.length) throw new Error('the shopping list is already empty');
    return { destination: `Shopping — cleared ${cleared.length} item${cleared.length === 1 ? '' : 's'}`, said: `Cleared the list — ${cleared.length} item${cleared.length === 1 ? '' : 's'}.`, undo: { verb: 'shopping.clear', items: cleared } };
  },
  async undo(vaultPath, u) { const { restoreItems } = await shopLib(); await restoreItems(vaultPath, u.items); return `restored ${u.items.length} item${u.items.length === 1 ? '' : 's'}`; },
});

// A spoken slot resolves against the day's real slots — the standard five
// AND any extra meal he has added (rotation v2), by key or by label.
function resolveSlot(rotation, slotRaw) {
  const want = String(slotRaw || '').toLowerCase().trim();
  if (!want) throw new Error('which meal?');
  const keys = rotation.order || SLOTS;
  if (keys.includes(want)) return want;
  const m = matchName(keys.map((k) => ({ key: k, name: rotation.labels?.[k] || k })), want);
  if (!m.hit) throw new Error(m.ambiguous ? m.why : `"${slotRaw}" isn't a meal slot (${keys.map((k) => rotation.labels?.[k] || k).join(', ')})`);
  return m.hit.key;
}

async function setEaten(vaultPath, slotRaw, flag) {
  const { loadRecipeData, loadRotation, setSlotConsumed } = await rotationLibs();
  const { recipes } = await loadRecipeData(vaultPath);
  const before = await loadRotation(vaultPath, recipes);
  const slot = resolveSlot(before, slotRaw);
  const s = before.slots?.[slot];
  if (!s) throw new Error(`${slot} has no recipe in today's rotation`);
  const prior = !!s.consumed;
  if (prior === flag) throw new Error(`${slot} (${s.name}) is already marked ${flag ? 'eaten' : 'not eaten'}`);
  await setSlotConsumed(vaultPath, recipes, slot, flag);
  return { slot, name: s.name, prior };
}

verb({
  id: 'meal.eaten', tier: 'act',
  describe: "mark one of today's rotation meals as eaten", args: { slot: SLOTS.join('|') },
  async run(vaultPath, args) {
    const r = await setEaten(vaultPath, args.slot, true);
    return { destination: `Rotation — ${r.slot} eaten (${r.name})`, said: `${r.slot[0].toUpperCase()}${r.slot.slice(1)} logged as eaten — ${r.name}.`, undo: { verb: 'meal.eaten', slot: r.slot, name: r.name } };
  },
  async undo(vaultPath, u) { await setEaten(vaultPath, u.slot, false); return `${u.slot} is not eaten again`; },
});

verb({
  id: 'meal.uneaten', tier: 'act',
  describe: "un-mark a meal that was marked eaten by mistake", args: { slot: SLOTS.join('|') },
  async run(vaultPath, args) {
    const r = await setEaten(vaultPath, args.slot, false);
    return { destination: `Rotation — ${r.slot} not eaten (${r.name})`, said: `${r.slot} unmarked.`, undo: { verb: 'meal.uneaten', slot: r.slot, name: r.name } };
  },
  async undo(vaultPath, u) { await setEaten(vaultPath, u.slot, true); return `${u.slot} marked eaten again`; },
});

async function todaysPlan() {
  const { listRecords } = await import('./inboxStore.js');
  const { localDate } = await import('./localDate.js').catch(() => ({ localDate: null }));
  const today = localDate ? localDate(new Date()) : new Date().toISOString().slice(0, 10);
  const plans = (await listRecords())
    .filter((r) => r.kind === 'plan-today' && Array.isArray(r.decision?.payload?.priorities) && String(r.createdAt || '').slice(0, 10) === today)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return plans[0] || null;
}

verb({
  id: 'plan.priority', tier: 'act',
  describe: "mark one of today's plan priorities done or skipped", args: { priority: 'the priority, in his words', outcome: 'done|skipped' },
  async run(vaultPath, args) {
    const outcome = String(args.outcome || '').toLowerCase().replace(/^skip$/, 'skipped');
    if (!['done', 'skipped'].includes(outcome)) throw new Error('a priority is marked done or skipped');
    const plan = await todaysPlan();
    if (!plan) throw new Error("there's no plan for today to mark against");
    const priorities = plan.decision.payload.priorities;
    const m = matchName(priorities.map((p, i) => ({ i, name: p.text || p.title || p.label || String(p) })), args.priority);
    if (!m.hit) throw new Error(m.ambiguous ? m.why : `today's plan has no priority like "${say(args.priority)}"`);
    const prior = priorities[m.hit.i].outcome || null;
    if (prior === outcome) throw new Error(`"${m.hit.name}" is already ${outcome}`);
    const { setPriorityOutcome } = await import('./planToday.js');
    await setPriorityOutcome(plan.id, m.hit.i, outcome, { vaultPath });
    return { destination: `Today's plan — "${m.hit.name}" ${outcome}`, said: `"${m.hit.name}" marked ${outcome}.`, undo: { verb: 'plan.priority', recordId: plan.id, index: m.hit.i, name: m.hit.name, prior } };
  },
  async undo(vaultPath, u) {
    const { setPriorityOutcome } = await import('./planToday.js');
    await setPriorityOutcome(u.recordId, u.index, u.prior, { vaultPath });
    return `"${u.name}" back to ${u.prior || 'open'}`;
  },
});

verb({
  id: 'plan.run', tier: 'act',
  describe: 'approve and run the plan Nova proposed (the one waiting in the Inbox)', args: {},
  async run(vaultPath) {
    const { listRecords } = await import('./inboxStore.js');
    const plans = (await listRecords()).filter((r) => r.kind === 'plan' && r.status === 'pending')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const plan = plans[0];
    if (!plan) throw new Error("there's no plan waiting for your approval");
    if (!plan.planOk) throw new Error(`that plan can't run as it stands: ${(plan.blockers || []).join('; ') || 'see the Inbox'}`);
    const { approveRecord } = await import('./inbox.js');
    await approveRecord(vaultPath, plan.id);
    return { destination: `Plan — running "${plan.decision?.title || plan.id}"`, said: 'Running the plan now — one report when it lands.', undo: null };
  },
});

// ---- phase 2: the rest of the read-model state ----

verb({
  id: 'todo.add', tier: 'act',
  describe: 'add a to-do to his list', args: { text: 'the to-do, in his words', category: 'optional: ' + TODO_CATS.join('|') },
  async run(vaultPath, args) {
    const { addTodo } = await todoLib();
    const cat = args.category ? String(args.category).toLowerCase().replace(/^errand$/, 'errands') : undefined;
    if (cat && !TODO_CATS.includes(cat)) throw new Error(`"${args.category}" isn't a to-do category (${TODO_CATS.join(', ')})`);
    const after = await addTodo(vaultPath, args.text, cat);
    const clean = String(args.text).trim().replace(/\s+/g, ' ');
    const item = after.items.find((t) => t.text === clean && !t.checked);
    return { destination: `To-Do — added "${clean}" (${item?.category || cat || 'personal'})`, said: `Added "${clean}" to ${item?.category || 'your list'}.`, undo: { verb: 'todo.add', raw: item?.raw || null, text: clean } };
  },
  async undo(vaultPath, u) {
    const { listTodos } = await todoLib();
    const { withTodoLock, TODO_REL } = await import('./todoLine.js');
    const { readFile, writeFile } = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const { items } = await listTodos(vaultPath);
    const item = items.find((t) => t.raw === u.raw) || items.find((t) => t.text === u.text);
    if (!item) throw new Error(`"${u.text}" is no longer on the list`);
    return withTodoLock(async () => {
      const full = pathMod.join(vaultPath, TODO_REL);
      const raw = await readFile(full, 'utf8');
      if (!raw.includes(item.raw)) throw new Error('that line changed since');
      await writeFile(full, raw.includes(item.raw + '\n') ? raw.replace(item.raw + '\n', '') : raw.replace(item.raw, ''), 'utf8');
      return `removed "${u.text}" again`;
    });
  },
});

verb({
  id: 'recipe.slot', tier: 'act',
  describe: "put one of his recipes into a rotation slot for today's plan", args: { slot: SLOTS.join('|'), recipe: 'the recipe, in his words' },
  async run(vaultPath, args) {
    const { loadRecipeData, loadRotation, setRotationSlot } = await rotationLibs();
    const { recipes } = await loadRecipeData(vaultPath);
    const m = matchName(recipes, args.recipe);
    if (!m.hit) throw new Error(m.ambiguous ? m.why : `there's no recipe called "${say(args.recipe)}"`);
    const before = await loadRotation(vaultPath, recipes);
    const slot = resolveSlot(before, args.slot);
    const prior = before.slots?.[slot]?.id || null;
    if (prior === m.hit.id) throw new Error(`${slot} is already ${m.hit.name}`);
    await setRotationSlot(vaultPath, recipes, slot, m.hit.id);
    return { destination: `Rotation — ${slot}: ${m.hit.name}`, said: `${slot[0].toUpperCase()}${slot.slice(1)} is now ${m.hit.name}.`, undo: { verb: 'recipe.slot', slot, prior, priorName: before.slots?.[slot]?.name || null, name: m.hit.name } };
  },
  async undo(vaultPath, u) {
    const { loadRecipeData, setRotationSlot } = await rotationLibs();
    const { recipes } = await loadRecipeData(vaultPath);
    await setRotationSlot(vaultPath, recipes, u.slot, u.prior);
    return u.prior ? `${u.slot} back to ${u.priorName}` : `${u.slot} cleared again`;
  },
});

// COOKED PORTIONS (rotation v2, 7 Sep): "I cooked eight burrito bowls" adds
// to what is in the fridge; "six burrito bowls left" sets it. Ticking a meal
// eaten takes one off (rotation.js); undo puts the count back as it was.
async function portionTarget(vaultPath, recipeRaw) {
  const { loadRecipeData } = await rotationLibs();
  const { recipes } = await loadRecipeData(vaultPath);
  const m = matchName(recipes, recipeRaw);
  if (!m.hit) throw new Error(m.ambiguous ? m.why : `there's no recipe called "${say(recipeRaw)}"`);
  return m.hit;
}
verb({
  id: 'meal.cooked', tier: 'act',
  describe: 'add cooked portions of a recipe to what is in the fridge', args: { recipe: 'the recipe, in his words', portions: 'how many, 1-500' },
  async run(vaultPath, args) {
    const n = Number(args.portions);
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error('how many portions? (1 to 500)');
    const r = await portionTarget(vaultPath, args.recipe);
    const { adjustPortions } = await import('./portions.js');
    const out = await adjustPortions(vaultPath, r.id, n, { name: r.name, why: 'cooked' });
    return { destination: `Portions — ${r.name}: ${out.prior ?? 0} → ${out.count}`, said: `${out.count} ${r.name} in the fridge${out.prior ? ` (was ${out.prior})` : ''}.`, undo: { verb: 'meal.cooked', recipeId: r.id, name: r.name, prior: out.prior } };
  },
  async undo(vaultPath, u) {
    const { setPortions, clearPortions } = await import('./portions.js');
    if (u.prior == null) { await clearPortions(vaultPath, u.recipeId); return `${u.name} is uncounted again`; }
    await setPortions(vaultPath, u.recipeId, u.prior); return `${u.name} back to ${u.prior}`;
  },
});
verb({
  id: 'meal.portions', tier: 'act',
  describe: 'set how many portions of a recipe are left', args: { recipe: 'the recipe, in his words', count: '0-500' },
  async run(vaultPath, args) {
    const n = Number(args.count);
    if (!Number.isInteger(n) || n < 0 || n > 500) throw new Error('how many are left? (0 to 500)');
    const r = await portionTarget(vaultPath, args.recipe);
    const { setPortions } = await import('./portions.js');
    const out = await setPortions(vaultPath, r.id, n, { name: r.name });
    return { destination: `Portions — ${r.name}: ${n} left`, said: n === 0 ? `${r.name} is out — the rotation shows it red until you cook more.` : `${n} ${r.name} left.`, undo: { verb: 'meal.portions', recipeId: r.id, name: r.name, prior: out.prior } };
  },
  async undo(vaultPath, u) {
    const { setPortions, clearPortions } = await import('./portions.js');
    if (u.prior == null) { await clearPortions(vaultPath, u.recipeId); return `${u.name} is uncounted again`; }
    await setPortions(vaultPath, u.recipeId, u.prior); return `${u.name} back to ${u.prior}`;
  },
});

verb({
  id: 'journal.add', tier: 'act',
  describe: "write a line into today's journal", args: { text: 'the entry, in his words' },
  async run(vaultPath, args) {
    const { addEntry } = await import('./journal.js');
    const text = String(args.text).trim();
    await addEntry(vaultPath, { text, category: 'personal', label: 'Said to Nova' });
    return { destination: `Journal — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`, said: 'In your journal.', undo: { verb: 'journal.add', text, date: new Date().toISOString().slice(0, 10) } };
  },
  async undo(vaultPath, u) {
    const { removeEntry } = await import('./journal.js');
    await removeEntry(vaultPath, { date: u.date, text: u.text });
    return 'removed it from the journal';
  },
});

verb({
  id: 'stash.add', tier: 'act',
  describe: 'stash a link under one of his Stash categories', args: { url: 'the link', name: 'what it is, a few words', category: 'the Stash category, in his words' },
  async run(vaultPath, args) {
    const { loadStash, addStashItem } = await import('./stash.js');
    const { categories } = await loadStash(vaultPath);
    const m = matchName(categories, args.category);
    if (!m.hit) throw new Error(m.ambiguous ? m.why : `there's no Stash category called "${say(args.category)}"${categories.length ? ` (you have ${categories.map((c) => c.name).join(', ')})` : ''}`);
    const url = String(args.url).trim();
    await addStashItem(vaultPath, { category: m.hit.name, name: args.name, url });
    const after = await loadStash(vaultPath);
    const item = (after.categories.find((c) => c.name === m.hit.name)?.items || []).find((i) => i.url === url);
    return { destination: `Stash — ${m.hit.name}: ${args.name}`, said: `Stashed under ${m.hit.name}.`, undo: item?.raw ? { verb: 'stash.add', raw: item.raw, name: String(args.name) } : null };
  },
  async undo(vaultPath, u) {
    const { removeStashItem } = await import('./stash.js');
    await removeStashItem(vaultPath, u.raw);
    return `took "${u.name}" back out of the Stash`;
  },
});

verb({
  id: 'money.category', tier: 'act',
  describe: 'file a recent transaction under a different category (and remember the merchant)', args: { merchant: 'the transaction, by merchant or words', category: 'Groceries|Eating Out|Transport|Health & Fitness|Subscriptions|Utilities & Bills|Shopping|Entertainment|Income|Other' },
  async run(vaultPath, args) {
    const { listTransactions, setTransactionCategory, CATEGORIES } = await import('./money.js');
    const cat = CATEGORIES.find((c) => c.toLowerCase() === String(args.category || '').toLowerCase().trim());
    if (!cat) throw new Error(`"${args.category}" isn't a money category (${CATEGORIES.join(', ')})`);
    const recent = await listTransactions({ sinceMonths: 2 });
    const m = matchName(recent, args.merchant, { label: (t) => t.merchant || t.description || '' });
    if (!m.hit) throw new Error(m.ambiguous ? m.why : `no recent transaction looks like "${say(args.merchant)}"`);
    if (m.hit.category === cat) throw new Error(`${m.hit.merchant || 'that'} is already under ${cat}`);
    const prior = m.hit.category;
    await setTransactionCategory(m.hit.id, cat);
    return { destination: `Money — ${m.hit.merchant || m.hit.description}: ${prior} → ${cat}`, said: `${m.hit.merchant || 'Done'} filed under ${cat} — and remembered.`, undo: { verb: 'money.category', id: m.hit.id, prior, merchant: m.hit.merchant || '' } };
  },
  async undo(vaultPath, u) {
    const { setTransactionCategory } = await import('./money.js');
    await setTransactionCategory(u.id, u.prior);
    return `${u.merchant || 'it'} back under ${u.prior}`;
  },
});

verb({
  id: 'reminder.set', tier: 'act',
  describe: 'set a reminder at a time (it fires on his phone and watch via iCloud when configured, and as a push here)',
  args: { text: 'what to remind him of', when: 'when, in his words — "in 20 minutes", "at 6", "tomorrow at 7", "friday 9am"' },
  async run(vaultPath, args) {
    const { parseWhen } = await import('./whenParser.js');
    const { createReminder } = await import('./reminders.js');
    const read = parseWhen(String(args.when));
    if (!read) throw new Error(`I couldn't read "${say(args.when)}" as a time — try "in 20 minutes", "at 6", or "tomorrow at 7"`);
    const text = String(args.text).trim().replace(/^to\s+/i, '');
    if (!text) throw new Error('a reminder needs something to remind you of');
    const entry = await createReminder({ text, whenISO: read.when.toISOString() });
    const when = read.when.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return {
      destination: `Reminder — "${text}" at ${when}`,
      said: `I'll remind you at ${when}${entry?.apple ? '' : entry?.appleError ? ' — here, though iCloud refused it' : ''}.`,
      undo: { verb: 'reminder.set', id: entry.id, text },
    };
  },
  async undo(vaultPath, u) {
    const { removeReminder } = await import('./reminders.js');
    await removeReminder(u.id);
    return `cancelled the reminder for "${u.text}"`;
  },
});

// THE FIRST HAND — his own Shortcuts (lib/hands.js). Confirm-first unless
// he has listed the name as immediate; no undo Nova can do, said plainly.
let handsMod = null;
const hands = () => handsMod;
import('./hands.js').then((m) => { handsMod = m; m.listShortcuts().catch(() => {}); }).catch(() => {});
verb({
  id: 'shortcut.run', tier: 'confirm',
  describe: 'run one of his Shortcuts on the Mac (Messages, HomeKit, Music, Maps — whatever that Shortcut does)',
  args: { name: 'the Shortcut, exact name from the list', input: 'optional text input, or omit' },
  tierFor(args) { return hands()?.immediateShortcuts().includes(String(args.name || '')) ? 'act' : 'confirm'; },
  async resolve(args) {
    const { listShortcuts } = await import('./hands.js');
    const names = await listShortcuts();
    if (!names.length) throw new Error('no Shortcuts are available on the Mac');
    const m = matchName(names.map((n) => ({ name: n })), args.name);
    if (!m.hit) throw new Error(m.ambiguous ? m.why : `there's no Shortcut called "${say(args.name)}"`);
    return { ...args, name: m.hit.name };
  },
  async run(vaultPath, args) {
    const { runShortcut } = await import('./hands.js');
    const r = await runShortcut(args.name, { input: args.input });
    const said = r.output ? `Ran "${r.name}" — it says: ${r.output.slice(0, 160)}` : `Ran "${r.name}".`;
    return { destination: `Shortcut — ran "${r.name}"${r.output ? ` → ${r.output.slice(0, 80)}` : ''}`, said, undo: null };
  },
});

export const VERB_IDS = Object.keys(VERBS);
export const verbFor = (id) => VERBS[id] || null;

// The model's view of the catalogue — one line per verb, the contract
// generated from the registry so the prompt cannot drift from the code.
export function describeForModel() {
  const names = hands()?.knownShortcuts() || [];
  const shortcuts = names.length ? `\n  His Shortcuts on the Mac (use the exact name): ${names.slice(0, 90).join(' · ')}` : '';
  return VERB_IDS.map((id) => {
    const v = VERBS[id];
    const args = Object.keys(v.args).length
      ? `,"args":{${Object.entries(v.args).map(([k, d]) => `"${k}":"<${d}>"`).join(',')}}`
      : '';
    return `  ACT {"verb":"${id}"${args}} — ${v.describe}${v.tier === 'confirm' ? ' (lands pending; his yes runs it)' : ''}`;
  }).join('\n') + shortcuts;
}

// --------------------------------------------------------------- execute

// Runs a verb and lands its receipt: an 'act' verb executes now and files
// a DONE record with undoData; a 'confirm' verb files a PENDING record the
// existing approve rail runs (fileDecision route 'act' → execute()).
export async function runVerb(vaultPath, question, raw, { source = 'voice' } = {}) {
  const id = String(raw?.verb || '').trim();
  const v = VERBS[id];
  if (!v) throw new Error(`I don't have a verb called "${raw?.verb}"`);
  let args = raw?.args && typeof raw.args === 'object' ? raw.args : {};
  for (const k of Object.keys(v.args)) {
    if (/optional/i.test(v.args[k])) continue;
    if (args[k] == null || String(args[k]).trim() === '') throw new Error(`"${id}" needs ${k}`);
  }
  if (v.resolve) args = await v.resolve(args);
  const tier = v.tierFor ? v.tierFor(args) : v.tier;
  const { createRecord } = await import('./inboxStore.js');
  const base = {
    id: randomUUID().slice(0, 8),
    text: String(question || '').slice(0, 300),
    source,
    kind: 'act',
    createdAt: new Date().toISOString(),
  };
  if (tier === 'confirm') {
    const title = id === 'shortcut.run' ? `Run the Shortcut "${args.name}"` : `${v.describe[0].toUpperCase()}${v.describe.slice(1)}`;
    const record = {
      ...base,
      mode: 'review-all',
      status: 'pending',
      decision: { route: 'act', confidence: 'high', title, reason: id === 'shortcut.run' ? 'a Shortcut is your own code — a yes runs it; there is no undo Nova can do' : 'asked in conversation — a yes does it, and undo puts it back', payload: { verb: id, args } },
    };
    await createRecord(record);
    return { proposal: { recordId: record.id, title: record.decision.title, route: 'act' } };
  }
  const out = await execute(vaultPath, { verb: id, args });
  const record = {
    ...base,
    mode: 'auto',
    status: 'filed',
    filedAt: base.createdAt,
    auto: true,
    destination: out.destination,
    decision: { route: 'act', confidence: 'high', title: out.destination, reason: 'done by voice', payload: { verb: id, args } },
    undoData: out.undo ? { route: 'act', ...out.undo } : null,
  };
  await createRecord(record);
  await broadcastFor(id);
  return { acted: { recordId: record.id, title: out.destination, said: out.said, undoable: !!out.undo } };
}

// The filer's half: run the verb, hand back the rails' { destination, undo }.
export async function execute(vaultPath, payload) {
  const v = VERBS[payload?.verb];
  if (!v) throw new Error(`unknown verb "${payload?.verb}"`);
  const out = await v.run(vaultPath, payload.args || {});
  await broadcastFor(payload.verb);
  return { destination: out.destination, said: out.said, undo: out.undo ? { verb: payload.verb, ...out.undo } : null };
}

export async function undoVerb(vaultPath, undo) {
  const v = VERBS[undo?.verb];
  if (!v?.undo) throw new Error(`"${undo?.verb}" can't be undone`);
  const summary = await v.undo(vaultPath, undo);
  await broadcastFor(undo.verb);
  return summary;
}

async function broadcastFor(id) {
  const kind = id.startsWith('todo.') ? 'todos' : id.startsWith('shopping.') ? 'shopping' : id.startsWith('meal.') ? 'rotation' : 'inbox';
  try { (await import('./events.js')).broadcast(kind); } catch { /* the stream is a convenience */ }
}

// -------------------------------------------------------------- the ACT line

export function parseActDirective(text) {
  const m = (text || '').match(/^\s*ACT\s+(\{.*\})\s*$/m);
  if (!m) {
    const prose = (text || '').match(/^\s*ACT\b.*$/m);
    if (prose) return { cleanText: text.replace(prose[0], '').replace(/\n{3,}/g, '\n\n').trim(), act: null, parseError: 'the ACT line was prose, not the typed JSON form' };
    return { cleanText: text, act: null };
  }
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try { return { cleanText, act: JSON.parse(m[1]) }; } catch { return { cleanText, act: null, parseError: 'the ACT block was not valid JSON' }; }
}

// ------------------------------------------------------ the fast grammar

function norm(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/^(hey|hi|ok|okay)?[,\s]*(nova|jarvis)[,\s]*/i, '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DOMAIN_SUFFIX = /\s+(?:on|from|in|off)\s+(?:the\s+|my\s+)?(shopping(?:\s+list)?|list|to-?dos?(?:\s+list)?|todo list|plan)$/;
const MEAL = `(${SLOTS.join('|')})`;

// Returns null for anything the grammar is not sure about — that goes to the
// model, which may still ACT with the same verbs. A hit is
// { verb, args } or, where the same words fit two domains, { any: [...] }
// which resolveAny() settles against his real data.
export function parseCommand(text) {
  const q = norm(text);
  if (!q || q.length > 140) return null;
  let m;

  if ((m = q.match(/^(?:run|approve|go ahead with|start|launch)\s+(?:the\s+|that\s+)?plan$/))) return { verb: 'plan.run', args: {} };

  if ((m = q.match(/^(?:run|trigger|fire|launch)\s+(?:the\s+|my\s+)?(?:shortcut\s+)?(.+?)(?:\s+shortcut)?$/))) {
    return { any: [{ verb: 'shortcut.run', args: { name: m[1] } }], fallthrough: true };
  }

  if ((m = q.match(new RegExp(`^(?:(?:i(?:'ve| have|'m)?\\s+)?(?:had|ate|eaten|finished|done with|done)\\s+(?:my\\s+|the\\s+)?${MEAL}|(?:mark|log|tick)\\s+${MEAL}\\s+(?:as\\s+)?(?:eaten|done|had))$`)))) {
    return { verb: 'meal.eaten', args: { slot: m[1] || m[2] } };
  }
  if ((m = q.match(new RegExp(`^(?:un-?mark|unmark|undo|untick)\\s+(?:my\\s+)?${MEAL}(?:\\s+(?:as\\s+)?(?:eaten|done))?$`)))) return { verb: 'meal.uneaten', args: { slot: m[1] } };

  if ((m = q.match(/^(?:clear|empty|wipe)\s+(?:the\s+|my\s+)?(?:whole\s+|entire\s+)?(?:shopping\s+)?list$/))) return { verb: 'shopping.clear', args: {} };

  // "remind me to X at 6" — the deterministic path in front of the capture
  // classifier: it only claims the sentence when the TIME is certain.
  if ((m = q.match(/^remind me (?:to |about |that )?(.+)$/))) {
    const rest = m[1];
    return { any: [{ verb: 'reminder.set', args: { text: rest, when: rest } }], fallthrough: true };
  }

  if ((m = q.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+)?(?:to-?dos?|to-?do list|todo list|list of to-?dos)$/)) || (m = q.match(/^(?:to-?do|todo):\s*(.+)$/))) {
    return { verb: 'todo.add', args: { text: m[1] } };
  }
  // the fridge: "I cooked 8 burrito bowls" · "made 6 chilli beef" · "4 works burgers left"
  if ((m = q.match(/^(?:i(?:'ve| have|'ve just| just)?\s+)?(?:cooked|made|prepped|batch[- ]cooked)\s+(\d{1,3})\s+(?:portions?\s+(?:of\s+)?|more\s+|x\s+)?(.+?)(?:\s+(?:portions?|meals?|serves?|servings?))?$/))) {
    return { verb: 'meal.cooked', args: { recipe: m[2], portions: Number(m[1]) } };
  }
  if ((m = q.match(/^(\d{1,3})\s+(?:portions?\s+(?:of\s+)?)?(.+?)\s+(?:left|remaining|in the fridge)$/)) || (m = q.match(/^(?:set\s+)?(.+?)\s+portions?\s+(?:to|=)\s+(\d{1,3})(?:\s+left)?$/))) {
    const count = Number(m[1]) >= 0 && /^\d/.test(m[1]) ? Number(m[1]) : Number(m[2]);
    const recipe = /^\d/.test(m[1]) ? m[2] : m[1];
    return { any: [{ verb: 'meal.portions', args: { recipe, count } }], fallthrough: true };
  }
  if ((m = q.match(/^(?:journal|diary):\s*(.+)$/)) || (m = q.match(/^(?:write|put|note)\s+(?:in|into)\s+(?:my\s+)?journal:?\s+(.+)$/))) {
    return { verb: 'journal.add', args: { text: m[1] } };
  }
  if ((m = q.match(new RegExp(`^(?:make|set|put|swap|change)\\s+${MEAL}\\s+(?:(?:to|as|=)\\s+)?(.+)$`))) || (m = q.match(new RegExp(`^(?:put|use)\\s+(.+?)\\s+(?:in|for|as)\\s+${MEAL}$`)))) {
    const slot = SLOTS.includes(m[1]) ? m[1] : m[2];
    const recipe = SLOTS.includes(m[1]) ? m[2] : m[1];
    return { verb: 'recipe.slot', args: { slot, recipe } };
  }
  if ((m = q.match(/^(?:move|put|file|recategori[sz]e|change)\s+(.+?)\s+(?:to|into|under)\s+(personal|work|fitness|errands?|later)$/))) {
    return { verb: 'todo.move', args: { text: m[1], category: m[2] } };
  }

  if ((m = q.match(/^(?:set|change|make)\s+(.+?)\s+(?:(?:qty|quantity)\s+)?(?:to|=)\s+(\d{1,2})$/))) return { verb: 'shopping.qty', args: { item: m[1], qty: Number(m[2]) } };
  if ((m = q.match(/^(\d{1,2})\s*(?:x|×)\s+(.+)$/))) return { verb: 'shopping.qty', args: { item: m[2], qty: Number(m[1]) } };

  if ((m = q.match(/^(?:un-?tick|untick|uncheck|reopen|re-?open|put back)\s+(.+)$/))) {
    const body = stripDomain(m[1]);
    return body.domain === 'shopping' ? { verb: 'shopping.undone', args: { item: body.text } }
      : body.domain === 'todo' ? { verb: 'todo.reopen', args: { text: body.text } }
        : { any: [{ verb: 'todo.reopen', args: { text: body.text } }, { verb: 'shopping.undone', args: { item: body.text } }] };
  }

  if ((m = q.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(done|skipped|skip)$/))) {
    const body = stripDomain(m[1]);
    const outcome = m[2] === 'skip' ? 'skipped' : m[2];
    if (body.domain === 'plan' || outcome === 'skipped') return { verb: 'plan.priority', args: { priority: body.text, outcome } };
    if (body.domain === 'todo') return { verb: 'todo.done', args: { text: body.text } };
    if (body.domain === 'shopping') return { verb: 'shopping.done', args: { item: body.text } };
    return { any: [{ verb: 'plan.priority', args: { priority: body.text, outcome } }, { verb: 'todo.done', args: { text: body.text } }, { verb: 'shopping.done', args: { item: body.text } }] };
  }

  if ((m = q.match(/^(?:tick|check|cross|complete|finish|finished|done with|done|got|bought|i (?:got|bought|did|finished|completed))\s+(?:off\s+)?(.+)$/))) {
    let body = m[1].replace(/\s+(?:off|as done|done|as complete|complete)$/, '');
    const d = stripDomain(body);
    body = d.text;
    const boughtish = /^(?:got|bought|i (?:got|bought))/.test(q);
    if (d.domain === 'shopping' || (boughtish && !d.domain)) return { verb: 'shopping.done', args: { item: body } };
    if (d.domain === 'todo') return { verb: 'todo.done', args: { text: body } };
    if (d.domain === 'plan') return { verb: 'plan.priority', args: { priority: body, outcome: 'done' } };
    return { any: [{ verb: 'todo.done', args: { text: body } }, { verb: 'shopping.done', args: { item: body } }, { verb: 'plan.priority', args: { priority: body, outcome: 'done' } }] };
  }
  // the words ARE one of his Shortcuts — "goodnight", "turn on my bedroom
  // lights", "I'm off to gym". Only an exact or prefix fit counts; anything
  // short of that goes to the model.
  const names = hands()?.knownShortcuts() || [];
  if (names.length && q.length >= 4) {
    const hit = matchName(names.map((n) => ({ name: n })), q);
    if (hit.hit && hit.score >= 3) return { verb: 'shortcut.run', args: { name: hit.hit.name } };
  }
  return null;
}

function stripDomain(s) {
  const m = s.match(DOMAIN_SUFFIX);
  if (!m) return { text: s, domain: null };
  const d = m[1];
  const domain = /shopping/.test(d) ? 'shopping' : /plan/.test(d) ? 'plan' : /to-?do/.test(d) ? 'todo' : 'shopping';
  return { text: s.replace(DOMAIN_SUFFIX, ''), domain: d === 'list' ? 'shopping' : domain };
}

// Words that fit two domains: try each against his real data. Exactly one
// resolves → that one runs. None → the first honest reason. More than one →
// ask him, listing what matched where; nothing runs.
async function probe(vaultPath, cand) {
  try {
    if (cand.verb === 'todo.done') { const t = await openTodo(vaultPath, cand.args.text, { wantChecked: false }); return { ok: true, label: `the to-do "${t.text}"` }; }
    if (cand.verb === 'todo.reopen') { const t = await openTodo(vaultPath, cand.args.text, { wantChecked: true }); return { ok: true, label: `the to-do "${t.text}"` }; }
    if (cand.verb === 'shopping.done') { const i = await shoppingItem(vaultPath, cand.args.item, { wantChecked: false }); return { ok: true, label: `${i.name} on the shopping list` }; }
    if (cand.verb === 'shopping.undone') { const i = await shoppingItem(vaultPath, cand.args.item, { wantChecked: true }); return { ok: true, label: `${i.name} on the shopping list` }; }
    if (cand.verb === 'meal.portions') {
      const { loadRecipeData } = await rotationLibs();
      const { recipes } = await loadRecipeData(vaultPath);
      const m = matchName(recipes, cand.args.recipe);
      return m.hit ? { ok: true, label: `the portions of ${m.hit.name}` } : { ok: false, why: m.why };
    }
    if (cand.verb === 'reminder.set') {
      const { parseWhen } = await import('./whenParser.js');
      const read = parseWhen(String(cand.args.when || ''));
      if (!read) return { ok: false, why: 'no time in it' };
      cand.args.text = read.text || cand.args.text;
      cand.args.when = String(cand.args.when);
      return { ok: true, label: 'a reminder' };
    }
    if (cand.verb === 'shortcut.run') {
      const { listShortcuts } = await import('./hands.js');
      const m = matchName((await listShortcuts()).map((n) => ({ name: n })), cand.args.name);
      return m.hit ? { ok: true, label: `the Shortcut "${m.hit.name}"` } : { ok: false, why: m.why };
    }
    if (cand.verb === 'plan.priority') {
      const plan = await todaysPlan(); if (!plan) return { ok: false, why: 'no plan today' };
      const m = matchName(plan.decision.payload.priorities.map((p, i) => ({ i, name: p.text || p.title || p.label || String(p) })), cand.args.priority);
      return m.hit ? { ok: true, label: `today's priority "${m.hit.name}"` } : { ok: false, why: m.why };
    }
    return { ok: false, why: 'unknown' };
  } catch (e) { return { ok: false, why: e.message }; }
}

export async function resolveAny(vaultPath, parsed) {
  if (!parsed?.any) return parsed;
  const results = await Promise.all(parsed.any.map(async (c) => ({ c, r: await probe(vaultPath, c) })));
  const hits = results.filter((x) => x.r.ok);
  if (hits.length === 1) return hits[0].c;
  if (hits.length > 1) throw new Error(`that could be ${hits.map((h) => h.r.label).join(', or ')} — which one?`);
  const ambiguous = results.find((x) => /which one/.test(x.r.why));
  // a fallthrough candidate that fit NOTHING was never a command; one that
  // fit two things is still his to settle
  if (!hits.length && parsed.fallthrough && !ambiguous) return null;
  throw new Error(ambiguous ? ambiguous.r.why : `I couldn't find "${parsed.any[0].args.text || parsed.any[0].args.item || parsed.any[0].args.priority}" on your to-dos, shopping list or today's plan`);
}

// The front door's fast path: a command the grammar is sure about runs
// here, no model. Returns null when the words are not a command; a
// { text, acted?, proposal? } when they are — including the honest "which
// one?" when his words fit two things.
export async function tryCommand(vaultPath, question) {
  const parsed = parseCommand(question);
  if (!parsed) return null;
  try {
    const cmd = await resolveAny(vaultPath, parsed);
    if (!cmd) return null; // the words fit no real thing — not a command after all
    const out = await runVerb(vaultPath, question, cmd, { source: 'voice' });
    if (out.acted) return { matched: cmd.verb, text: out.acted.said, acted: out.acted };
    return { matched: cmd.verb, text: `${out.proposal.title} — say yes and it's done.`, proposal: out.proposal };
  } catch (e) {
    return { matched: 'command-miss', text: `${e.message[0].toUpperCase()}${e.message.slice(1)}${/[.?!]$/.test(e.message) ? '' : '.'}`, miss: true };
  }
}

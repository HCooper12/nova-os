// To-Do page API — temp vault BEFORE imports (ESM hoisting).
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-todos-vault-'));
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN; // queueTodoistSync must be a no-op here

import test from 'node:test';
import assert from 'node:assert/strict';

const { listTodos, addTodo, toggleTodo, setTodoCategory, TODO_REL } = await import('../lib/todos.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

test('add creates the page in the shared format with a category tag; list parses it back', async () => {
  const { items } = await addTodo(vault, '  Buy   stamps ');
  assert.equal(items.length, 1);
  assert.deepEqual({ text: items[0].text, checked: items[0].checked, category: items[0].category }, { text: 'Buy stamps', checked: false, category: 'errands' }); // "buy" → errands guess
  assert.match(items[0].added, /^\d{4}-\d{2}-\d{2}$/);

  // exact line format the inbox filer and Todoist sync both speak
  const raw = await readFile(path.join(vault, TODO_REL), 'utf8');
  assert.match(raw, /^- \[ \] Buy stamps _\(added \d{4}-\d{2}-\d{2}\)_ #errands$/m);
  assert.match(raw, /tags:\n {2}- inbox/);

  // explicit category wins over the guess; unknown falls back to the guess
  const withCat = await addTodo(vault, 'Prep gym bag', 'fitness');
  assert.equal(withCat.items.find((t) => t.text === 'Prep gym bag').category, 'fitness');
});

test('duplicates and empties are rejected; toggle flips by exact line and detects drift', async () => {
  await assert.rejects(() => addTodo(vault, 'Buy stamps'), /already on the list/);
  await assert.rejects(() => addTodo(vault, '   '), /required/);

  const { items } = await listTodos(vault);
  const toggled = await toggleTodo(vault, items[0].raw);
  assert.equal(toggled.items[0].checked, true);

  // a checked duplicate no longer blocks re-adding
  const readd = await addTodo(vault, 'Buy stamps');
  assert.equal(readd.items.filter((t) => t.text === 'Buy stamps').length, 2);

  // stale raw line (the unchecked original) no longer matches
  await assert.rejects(() => toggleTodo(vault, items[0].raw.replace('- [ ]', '- [?]')), /not a to-do/);
  await assert.rejects(() => toggleTodo(vault, '- [ ] Never existed _(added 2026-01-01)_'), /changed since/);

  // untoggle works too
  const back = await toggleTodo(vault, toggled.items[0].raw);
  assert.equal(back.items[0].checked, false);
});

test('re-categorising rewrites the tag and keeps the line parseable', async () => {
  const { items } = await listTodos(vault);
  const target = items.find((t) => t.text === 'Prep gym bag');
  const updated = await setTodoCategory(vault, target.raw, 'later');
  const after = updated.items.find((t) => t.text === 'Prep gym bag');
  assert.equal(after.category, 'later');
  assert.match(after.raw, /#later$/);
  await assert.rejects(() => setTodoCategory(vault, target.raw, 'later'), /changed since/); // old raw is stale now
  await assert.rejects(() => setTodoCategory(vault, after.raw, 'nonsense'), /unknown category/);
});

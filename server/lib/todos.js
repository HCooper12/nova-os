import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';
import { queueTodoistSync } from './todoistSync.js';

function notifyChange() {
  import('./events.js').then(({ broadcast }) => broadcast('todos')).catch(() => {});
}

// The To-Do surface. One source of truth: the vault page Wiki/Inbox/To-Do.md
// — the same page the inbox 'todo' route files into, Obsidian edits, the
// compost sweep tidies, and the Todoist sync mirrors. This module is just a
// safe read/write API over that page for the To-Do screen; every write
// snapshots first and nudges the Todoist reconcile after.

// Line format, categories, and the shared write lock live in todoLine.js —
// the ONE contract for this page's four writers. Re-exported for callers.
import { TODO_REL, TODO_CATEGORIES, parseTodoLine, formatTodoLine, flipTodoLine, withTodoLock } from './todoLine.js';
export { TODO_REL, TODO_CATEGORIES };
export const TODO_CATEGORY_LABELS = { personal: 'Personal', work: 'Work', fitness: 'Fitness', errands: 'Errands', later: 'Later / Ideas' };

// Deterministic guess for direct adds — the classifier does better for
// captures; one tap on the tab fixes either.
const CATEGORY_HINTS = [
  ['fitness', ['gym', 'workout', 'train', 'run ', 'protein', 'stretch', 'physio', 'exercise', 'weights']],
  ['work', ['work', 'email', 'meeting', 'client', 'boss', 'report', 'deadline', 'invoice', 'presentation']],
  ['errands', ['buy', 'pick up', 'drop off', 'post ', 'bank', 'appointment', 'book ', 'renew', 'pay ', 'return']],
  ['later', ['idea', 'someday', 'maybe', 'one day', 'eventually', 'look into', 'research', 'explore']],
];

export function guessTodoCategory(text) {
  const t = ` ${(text || '').toLowerCase()} `;
  for (const [cat, words] of CATEGORY_HINTS) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return 'personal';
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function ensurePage(vaultPath) {
  const full = path.join(vaultPath, TODO_REL);
  if (existsSync(full)) return full;
  await mkdir(path.dirname(full), { recursive: true });
  const date = todayISO();
  await writeFile(full, matter.stringify('# To-Do\n', { type: 'raw', tags: ['inbox'], created: date, updated: date }), 'utf8');
  return full;
}

export async function listTodos(vaultPath) {
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) return { items: [], categories: TODO_CATEGORIES };
  const raw = await readFile(full, 'utf8');
  const items = [];
  for (const line of raw.split('\n')) {
    const parsed = parseTodoLine(line);
    if (parsed) items.push({ raw: line, ...parsed });
  }
  return { items, categories: TODO_CATEGORIES };
}

export async function addTodo(vaultPath, text, category) {
  const clean = (text || '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('to-do text is required');
  if (clean.length > 300) throw new Error('keep a to-do under 300 characters');
  const cat = TODO_CATEGORIES.includes(category) ? category : guessTodoCategory(clean);
  return withTodoLock(async () => {
    const { items } = await listTodos(vaultPath);
    if (items.some((t) => !t.checked && t.text === clean)) throw new Error('that to-do is already on the list');
    const full = await ensurePage(vaultPath);
    await backupFile(full);
    const raw = await readFile(full, 'utf8');
    await writeFile(full, raw.replace(/\s*$/, '\n') + formatTodoLine({ text: clean, added: todayISO(), category: cat }) + '\n', 'utf8');
    queueTodoistSync(vaultPath);
    notifyChange();
    return listTodos(vaultPath);
  });
}

// Re-categorise by exact raw line — same identity contract as toggle.
export async function setTodoCategory(vaultPath, rawLine, category) {
  if (!TODO_CATEGORIES.includes(category)) throw new Error('unknown category');
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) throw new Error('the To-Do page no longer exists');
  if (!parseTodoLine(rawLine)) throw new Error('that line is not a to-do');
  return withTodoLock(async () => {
    await backupFile(full);
    const raw = await readFile(full, 'utf8');
    if (!raw.includes(rawLine)) throw new Error('that line changed since you loaded — refreshing');
    const stripped = rawLine.replace(/\s*#[a-z-]+\s*$/, '');
    await writeFile(full, raw.replace(rawLine, `${stripped} #${category}`), 'utf8');
    queueTodoistSync(vaultPath);
    notifyChange();
    return listTodos(vaultPath);
  });
}

// Toggle by the line's exact raw text — same identity the undo path uses, so
// a page edited in Obsidian since the screen loaded fails honestly instead
// of toggling the wrong line.
export async function toggleTodo(vaultPath, rawLine) {
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) throw new Error('the To-Do page no longer exists');
  const parsed = parseTodoLine(rawLine);
  if (!parsed) throw new Error('that line is not a to-do');
  return withTodoLock(async () => {
    await backupFile(full);
    const raw = await readFile(full, 'utf8');
    if (!raw.includes(rawLine)) throw new Error('that line changed since you loaded — refreshing');
    // flipTodoLine tolerates the hand-typed capital-X variant the old string
    // replace silently failed on
    await writeFile(full, raw.replace(rawLine, flipTodoLine(rawLine, !parsed.checked)), 'utf8');
    queueTodoistSync(vaultPath);
    notifyChange();
    return listTodos(vaultPath);
  });
}

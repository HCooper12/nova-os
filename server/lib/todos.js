import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';
import { queueTodoistSync } from './todoistSync.js';

// The To-Do surface. One source of truth: the vault page Wiki/Inbox/To-Do.md
// — the same page the inbox 'todo' route files into, Obsidian edits, the
// compost sweep tidies, and the Todoist sync mirrors. This module is just a
// safe read/write API over that page for the To-Do screen; every write
// snapshots first and nudges the Todoist reconcile after.

export const TODO_REL = 'Wiki/Inbox/To-Do.md';
const LINE_RE = /^- \[( |x)\] (.*?)(?:\s*_\(added ([^)]*)\)_)?\s*$/;

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
  if (!existsSync(full)) return { items: [] };
  const raw = await readFile(full, 'utf8');
  const items = [];
  for (const line of raw.split('\n')) {
    const m = line.match(LINE_RE);
    if (m) items.push({ raw: line, checked: m[1] === 'x', text: m[2].trim(), added: m[3] || null });
  }
  return { items };
}

export async function addTodo(vaultPath, text) {
  const clean = (text || '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('to-do text is required');
  if (clean.length > 300) throw new Error('keep a to-do under 300 characters');
  const { items } = await listTodos(vaultPath);
  if (items.some((t) => !t.checked && t.text === clean)) throw new Error('that to-do is already on the list');
  const full = await ensurePage(vaultPath);
  await backupFile(full);
  const raw = await readFile(full, 'utf8');
  await writeFile(full, raw.replace(/\s*$/, '\n') + `- [ ] ${clean} _(added ${todayISO()})_\n`, 'utf8');
  queueTodoistSync(vaultPath);
  return listTodos(vaultPath);
}

// Toggle by the line's exact raw text — same identity the undo path uses, so
// a page edited in Obsidian since the screen loaded fails honestly instead
// of toggling the wrong line.
export async function toggleTodo(vaultPath, rawLine) {
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) throw new Error('the To-Do page no longer exists');
  const m = (rawLine || '').match(LINE_RE);
  if (!m) throw new Error('that line is not a to-do');
  await backupFile(full);
  const raw = await readFile(full, 'utf8');
  if (!raw.includes(rawLine)) throw new Error('that line changed since you loaded — refreshing');
  const flipped = m[1] === 'x' ? rawLine.replace('- [x]', '- [ ]') : rawLine.replace('- [ ]', '- [x]');
  await writeFile(full, raw.replace(rawLine, flipped), 'utf8');
  queueTodoistSync(vaultPath);
  return listTodos(vaultPath);
}

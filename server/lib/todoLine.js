// THE To-Do line contract — one regex, one category list, one formatter, one
// write lock. Four modules write Wiki/Inbox/To-Do.md (todos.js, the inbox
// 'todo' route, todoistSync, compost); before this file each carried its own
// hand-copied parser "kept in lockstep by comment", the category vocabulary
// existed twice, a hand-typed "- [X]" (capital) was invisible to two parsers
// while compost swept it, and concurrent writers could lose updates. Change
// the line format HERE or nowhere.

export const TODO_REL = 'Wiki/Inbox/To-Do.md';
export const TODO_CATEGORIES = ['personal', 'work', 'fitness', 'errands', 'later'];

// Case-insensitive checkbox: Obsidian hand-edits produce '- [X]' too.
export const TODO_LINE_RE = /^- \[( |x|X)\] (.*?)(?:\s*_\(added ([^)]*)\)_)?(?:\s*#([a-z-]+))?\s*$/;

export function parseTodoLine(line) {
  const m = (line || '').match(TODO_LINE_RE);
  if (!m) return null;
  return {
    checked: m[1].toLowerCase() === 'x',
    text: m[2].trim(),
    added: m[3] || null,
    category: TODO_CATEGORIES.includes(m[4]) ? m[4] : null,
  };
}

export function formatTodoLine({ text, category = null, added = null, checked = false }) {
  return `- [${checked ? 'x' : ' '}] ${text}${added ? ` _(added ${added})_` : ''}${category ? ` #${category}` : ''}`;
}

// Flip a raw line's checkbox in place, tolerating the capital-X variant.
export function flipTodoLine(rawLine, toChecked) {
  return rawLine.replace(/^- \[( |x|X)\]/, toChecked ? '- [x]' : '- [ ]');
}

// One write lock across every module that read-modify-writes the page — a
// concurrent Todoist pull vs a UI toggle was a real lost-update window.
let lock = Promise.resolve();
export function withTodoLock(fn) {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

// The To-Do line contract — one regex/formatter/lock for the page's four
// writers (sweep D3: three hand-copied parsers had already drifted on
// capital-X handling, and concurrent writers could lose updates).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTodoLine, formatTodoLine, flipTodoLine, withTodoLock, TODO_CATEGORIES } from '../lib/todoLine.js';

test('parse/format round-trip, including the hand-typed capital-X variant', () => {
  const line = formatTodoLine({ text: 'Buy protein', added: '2026-07-22', category: 'errands' });
  assert.equal(line, '- [ ] Buy protein _(added 2026-07-22)_ #errands');
  assert.deepEqual(parseTodoLine(line), { checked: false, text: 'Buy protein', added: '2026-07-22', category: 'errands' });

  // capital X — Obsidian hand-edits produce it; two of the three old parsers
  // couldn't see these lines at all while compost swept them
  const capital = '- [X] Old done thing _(added 2026-07-01)_ #work';
  const parsed = parseTodoLine(capital);
  assert.equal(parsed.checked, true, 'capital X reads as checked');
  assert.equal(parsed.text, 'Old done thing');

  // flip tolerates every checkbox variant
  assert.equal(flipTodoLine(capital, false), '- [ ] Old done thing _(added 2026-07-01)_ #work');
  assert.equal(flipTodoLine('- [ ] thing', true), '- [x] thing');

  // bare/legacy shapes
  assert.deepEqual(parseTodoLine('- [ ] just text'), { checked: false, text: 'just text', added: null, category: null });
  assert.equal(parseTodoLine('not a todo'), null);
  assert.equal(parseTodoLine('- [x] done #nonsense').category, null, 'unknown categories read as none');
  assert.ok(TODO_CATEGORIES.includes('fitness'));
});

test('withTodoLock serializes read-modify-write windows (no lost updates)', async () => {
  // simulate the race the lock exists for: two writers read the same state,
  // then write — unserialized, the second write clobbers the first
  let file = '';
  const writer = (line) => withTodoLock(async () => {
    const snapshot = file;
    await new Promise((r) => setTimeout(r, 10)); // hold the read window open
    file = snapshot + line + '\n';
  });
  await Promise.all([writer('- [ ] from the UI'), writer('- [ ] from the Todoist pull')]);
  assert.ok(file.includes('from the UI') && file.includes('from the Todoist pull'), 'both writes survive');
  assert.equal(file.split('\n').filter(Boolean).length, 2);
});

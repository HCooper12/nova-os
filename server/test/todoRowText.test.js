// EVERY TO-DO ROW SHOWS ITS WORDS. Todos.jsx draws `t.display` (and titles a
// link with `t.isLink`); the view model had stopped building either field, so
// every open and done to-do rendered as a blank row (found 5 Oct 2026 by the
// redesign audit 13-lists). Drives valsTodos with a fake app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valsTodos } from '../../src/vals/valsTodos.js';

const app = (items) => ({ state: { screen: 'todos', liveTodos: { items, categories: [] } }, setState() {} });

test('an open and a done to-do both carry their words for the row', () => {
  const v = valsTodos(app([
    { raw: 'a', text: 'Book the dentist', checked: false, category: 'personal' },
    { raw: 'b', text: 'Return the parcel', checked: true },
  ]), { demoMode: false, isOffline: false });
  const open = v.todosOpenGroups.flatMap((g) => g.items);
  assert.equal(open[0].display, 'Book the dentist');
  assert.equal(open[0].isLink, false);
  assert.equal(v.todosDone[0].display, 'Return the parcel');
});

test('a bare URL shows where it goes, and the row knows it is a link', () => {
  const v = valsTodos(app([{ raw: 'c', text: 'Watch https://www.youtube.com/watch?v=x&si=abc', checked: false }]), { demoMode: false, isOffline: false });
  const row = v.todosOpenGroups[0].items[0];
  assert.equal(row.display, 'Watch youtube.com ↗');
  assert.equal(row.isLink, true);
});

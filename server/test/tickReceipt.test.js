// THE TICK RECEIPT (9 Oct 2026, his call: "a pill with Undo on every tick").
//
// Every one-tap tick raises one island pill with an Undo (src/receipt.js).
// What these pin: every tick handler goes through it; Undo calls each tick's
// reverse path and only that; rapid ticks fold into one pill that changes
// its words in place instead of dropping a card per tap; a tick in demo mode
// never reaches the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createReceipts, receiptWords, foldTick, RECEIPT_MS, RECEIPT_IDLE } from '../../src/receipt.js';
import { arrival, normalizeNotice } from '../../src/islandCore.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, `missing ${a} or ${b}`); return s.slice(i, j); };

function rig() {
  const posts = [];
  const dismissed = [];
  let t = 1000;
  const r = createReceipts({ post: (n) => posts.push(n), dismiss: (id) => dismissed.push(id), now: () => t, schedule: (fn) => fn() });
  return { r, posts, dismissed, advance: (ms) => { t += ms; }, last: () => posts[posts.length - 1] };
}

test('one tick: one pill, one line, with Undo, replacing itself by id', () => {
  const { r, last } = rig();
  r.tickReceipt({ key: 'todo:Milk', label: 'Milk', done: true, undo: () => {} });
  const n = last();
  assert.equal(n.title, 'Ticked Milk');
  assert.equal(n.replace, true, 'a second tick changes this card rather than queueing a new one');
  assert.equal(n.oneLine, true, 'a long name ends in an ellipsis, never a taller pill');
  assert.equal(n.action.label, 'Undo');
  assert.equal(n.duration, RECEIPT_MS);
  assert.equal(n.tone, 'done');
});

test('twenty ticks in two seconds are one pill that counts, never twenty cards', () => {
  const { r, posts } = rig();
  const ids = new Set();
  for (let i = 0; i < 20; i += 1) {
    ids.add(r.tickReceipt({ key: `shop:${i}`, label: `Item ${i}`, done: true, undo: () => {} }));
  }
  assert.equal(ids.size, 1, 'every tick names the same pill');
  assert.equal(posts.at(-1).title, '20 ticked');
  assert.ok(posts.every((n) => n.id === posts[0].id));
});

test('Undo calls every reverse path the pill counts, newest first, once each', () => {
  const { r, last } = rig();
  const calls = [];
  for (const k of ['a', 'b', 'c']) r.tickReceipt({ key: k, label: k, done: true, undo: () => calls.push(k) });
  assert.equal(last().title, '3 ticked');
  last().action.run();
  assert.deepEqual(calls, ['c', 'b', 'a']);
  last().action.run();
  assert.deepEqual(calls, ['c', 'b', 'a'], 'a second press undoes nothing twice');
  // the next tick starts a new pill
  r.tickReceipt({ key: 'd', label: 'd', undo: () => {} });
  assert.equal(last().title, 'Ticked d');
});

test('a reverse path that throws does not strand the others', () => {
  const { r, last } = rig();
  const calls = [];
  r.tickReceipt({ key: 'a', label: 'a', undo: () => calls.push('a') });
  r.tickReceipt({ key: 'b', label: 'b', undo: () => { throw new Error('gone'); } });
  last().action.run();
  assert.deepEqual(calls, ['a']);
});

test('ticked then unticked inside one pill cancels out; an empty pill leaves', () => {
  const { r, last, dismissed } = rig();
  r.tickReceipt({ key: 'x', label: 'Eggs', done: true, undo: () => {} });
  r.tickReceipt({ key: 'y', label: 'Milk', done: true, undo: () => {} });
  r.tickReceipt({ key: 'x', label: 'Eggs', done: false, undo: () => {} });
  assert.equal(last().title, 'Ticked Milk');
  r.tickReceipt({ key: 'y', label: 'Milk', done: false, undo: () => {} });
  assert.equal(dismissed.length, 1, 'nothing left to undo: the pill goes');
  assert.deepEqual(r.pending(), []);
});

test('the batch closes when the pill leaves, or after a quiet spell', () => {
  const { r, last, advance } = rig();
  r.tickReceipt({ key: 'a', label: 'a', undo: () => {} });
  const first = last().id;
  last().onClose();
  r.tickReceipt({ key: 'b', label: 'b', undo: () => {} });
  assert.notEqual(last().id, first, 'a pill that left is not updated');
  assert.equal(last().title, 'Ticked b');
  advance(RECEIPT_IDLE + 1);
  r.tickReceipt({ key: 'c', label: 'c', undo: () => {} });
  assert.equal(last().title, 'Ticked c', 'a quiet spell longer than the pill starts afresh');
  advance(RECEIPT_MS - 500);
  r.tickReceipt({ key: 'd', label: 'd', undo: () => {} });
  assert.equal(last().title, '2 ticked', 'inside the life of the pill, it counts on');
});

test('the pill is posted after the tick has painted, once per frame however many ticks', () => {
  const posts = [];
  const queue = [];
  const r = createReceipts({ post: (n) => posts.push(n), dismiss: () => {}, now: () => 0, schedule: (fn) => queue.push(fn) });
  r.tickReceipt({ key: 'a', label: 'a', undo: () => {} });
  r.tickReceipt({ key: 'b', label: 'b', undo: () => {} });
  r.tickReceipt({ key: 'c', label: 'c', undo: () => {} });
  assert.equal(posts.length, 0, 'nothing rides in the tick\'s own frame');
  assert.equal(queue.length, 1, 'three ticks in one frame schedule one post');
  queue.shift()();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, '3 ticked', 'with the latest words');
  r.tickReceipt({ key: 'd', label: 'd', undo: () => {} });
  queue.shift()();
  assert.equal(posts.at(-1).title, '4 ticked');
  assert.match(read('src/receipt.js'), /requestAnimationFrame\(\(\) => setTimeout\(fn, 0\)\)/);
});

test('the words: mixed, all unticked, and the caller\'s own title for one', () => {
  assert.equal(receiptWords([]), null);
  assert.equal(receiptWords([{ label: 'Bench, set 2', done: false }]), 'Unticked Bench, set 2');
  assert.equal(receiptWords([{ label: 'x', title: 'Got Milk' }]), 'Got Milk');
  assert.equal(receiptWords([{ done: true }, { done: false }]), '2 changed');
  assert.equal(receiptWords([{ done: false }, { done: false }]), '2 unticked');
  assert.deepEqual(foldTick([{ key: 'a', done: true, undo: 1 }], { key: 'a', done: true, undo: 2 }).map((e) => e.undo), [1], 'the first reverse path restores what was there before the pill');
});

test('the island changes the words of the card on screen instead of dropping another', () => {
  const cur = normalizeNotice({ id: 'tick-receipt-1', title: 'Ticked Milk', replace: true });
  const next = normalizeNotice({ id: 'tick-receipt-1', title: '2 ticked', replace: true });
  assert.equal(arrival({ current: cur, queue: [], next }).kind, 'update');
  const other = normalizeNotice({ id: 'n9', title: 'Saved' });
  assert.equal(arrival({ current: cur, queue: [], next: other }).kind, 'queue', 'any other notice still queues');
  // behind another card, a newer count replaces the waiting one, never stacks
  const q = arrival({ current: other, queue: [cur], next }).queue;
  assert.equal(q.length, 1);
  assert.equal(q[0].title, '2 ticked');
  // and a notice dropped from a full queue is reported, so its batch closes
  const full = [1, 2, 3].map((i) => normalizeNotice({ id: `q${i}`, title: `Q${i}` }));
  assert.equal(arrival({ current: other, queue: full, next }).dropped.length, 1);
  const island = read('src/DynamicIsland.jsx');
  assert.match(island, /call\.kind === 'update'/);
  assert.match(island, /closed\(s\.current\)/, 'a card that leaves calls its onClose');
  assert.match(island, /if \(updating\) s\.paint\?\.\(\);\s*else s\.start\(\);/, 'an update never replays the drop');
});

// THE SOURCE CONTRACT: every one-tap tick routes through the shared receipt,
// its Undo is its own reverse path with the receipt off (or Undo would raise
// a pill of its own), and with no connection it never reaches the server.
const TICKS = [
  ['toggleTodoItem(rawLine', 'undoTodoTick('],
  ['toggleShoppingItem(id, checked', 'confirmShoppingCompletion('],
  ['markPractice(outcome', 'answerTechnique('],
  ['setRotationReceipt(r) {', 'undoRotationReceipt('],
  ['toggleSessionSetDone(exIdx, setIdx', 'addSessionSet('],
  ['setPlanOutcome(id, index, outcome', 'refreshInbox() {'],
];

test('every tick handler raises the shared receipt', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import \{ tickReceipt \} from '\.\/receipt\.js';/);
  for (const [start, end] of TICKS) {
    const fn = between(app, `  ${start}`, `  ${end}`);
    assert.match(fn, /tickReceipt\(\{/, `${start} raises the receipt`);
  }
  // nothing else in Nova raises its own tick pill
  assert.ok(!/rot-receipt:/.test(app), 'the rotation tick no longer posts its own toast');
});

test('each Undo is the tick\'s own reverse path, with the receipt off', () => {
  const app = read('src/App.jsx');
  const fn = (a, b) => between(app, `  ${a}`, `  ${b}`);
  assert.match(fn('undoTodoTick(', 'setInboxInput('), /this\.toggleTodoItem\(now\.raw, \{ receipt: false \}\)/);
  assert.match(fn('toggleShoppingItem(id, checked', 'confirmShoppingCompletion('), /undo: \(\) => this\.toggleShoppingItem\(id, !checked, \{ receipt: false \}\)/);
  assert.match(fn('markPractice(outcome', 'answerTechnique('), /undo: \(\) => this\.markPractice\(was, '', \{ receipt: false \}\)/);
  assert.match(fn('undoRotationReceipt(', 'removeFoodLogRow('), /receipt: false/);
  assert.match(fn('toggleSessionSetDone(exIdx, setIdx', 'addSessionSet('), /this\.toggleSessionSetDone\(exIdx, setIdx, \{ receipt: false \}\)/);
  assert.match(fn('setPlanOutcome(id, index, outcome', 'refreshInbox() {'), /undo: \(\) => this\.setPlanOutcome\(id, index, was, \{ receipt: false \}\)/);
  // an Undo of something changed elsewhere says so rather than flipping a stranger
  assert.match(fn('undoTodoTick(', 'setInboxInput('), /nothing to undo/);
  assert.match(fn('toggleSessionSetDone(exIdx, setIdx', 'addSessionSet('), /nothing to undo/);
  // the plan rows hand over what was there, so Undo restores it exactly
  assert.match(read('src/vals/valsMission.js'), /\{ was: p\.outcome \|\| null, label: p\.do \|\| '' \}/);
  assert.match(read('src/vals/valsInbox.js'), /\{ was: a\.outcome \|\| null, label: a\.do \|\| '' \}/);
  // the session's own undos (voice "undo", a removed set put back) raise no pill
  const sum = read('src/vals/valsSessionSummary.js');
  assert.equal((sum.match(/toggleSessionSetDone\([^)]*\{ receipt: false \}\)/g) || []).length, 2);
  // Wrap the day's answer is not a tick
  assert.match(fn('answerTechnique(', 'dismissWrap('), /this\.markPractice\('skipped', note, \{ receipt: false \}\)/);
});

test('a tick in demo mode changes the screen and raises the pill, never the server', () => {
  const app = read('src/App.jsx');
  for (const [start, end, call] of [
    ['toggleTodoItem(rawLine', 'undoTodoTick(', 'api.todoToggle'],
    ['toggleShoppingItem(id, checked', 'confirmShoppingCompletion(', 'api.toggleShoppingItem'],
    ['markPractice(outcome', 'answerTechnique(', 'api.repertoirePractice'],
  ]) {
    const fn = between(app, `  ${start}`, `  ${end}`);
    const guard = fn.indexOf('if (!conn) { leave(); return; }');
    assert.ok(guard > 0, `${start}: a demo tick stops before the server`);
    assert.ok(guard < fn.indexOf(call), `${start}: the guard comes before ${call}`);
  }
  // the set tick is local state: no api call at all
  assert.ok(!/api\./.test(between(app, '  toggleSessionSetDone(exIdx, setIdx', '  addSessionSet(')));
});

test('the figures a tick moves count to their new values', () => {
  assert.match(read('src/screens/Todos.jsx'), /<CountUp value=\{v\.todosCounts\.open\} \/> open · <CountUp value=\{v\.todosCounts\.done\} \/> done/);
  assert.match(read('src/screens/Shopping.jsx'), /<CountUp value=\{v\.shoppingCheckedCount\} \/> collected/);
  assert.match(read('src/screens/MissionSummary.jsx'), /<CountUp value=\{t\.streak\} fromZero \/>-day streak/);
});

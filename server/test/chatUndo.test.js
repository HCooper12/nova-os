// UNDOING "NEW CHAT".
//
// 9 Sep 2026: he tapped New chat by accident and lost a comms log that had
// been running since the night before. "This seems too easy of a feature to
// accidentally click." The transcript was recoverable from the Claude CLI
// session on his Mac — but needing that is not an undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stashOf, usableUndo, undoLabel, UNDO_TTL_MS } from '../../src/chatUndo.js';

const chat = (n) => Array.from({ length: n }, (_, i) => ({ who: i % 2 ? 'nova' : 'you', text: `t${i}` }));

test('THE REPORT: clearing a real conversation leaves something to press', () => {
  const s = stashOf(chat(63), 'sess-1', 1000);
  assert.equal(s.turns, 63);
  assert.equal(s.sessionId, 'sess-1', 'the SESSION comes back too — restoring words alone would leave Nova with no memory of them');
  assert.ok(usableUndo(s, 2000));
});

test('clearing an empty log is not an event worth undoing', () => {
  assert.equal(stashOf([], 'x'), null);
  assert.equal(stashOf(null, 'x'), null);
});

test('it survives a reload but not a fortnight', () => {
  const s = stashOf(chat(4), 's', 0);
  assert.ok(usableUndo(s, UNDO_TTL_MS - 1), 'still there the next morning');
  assert.equal(usableUndo(s, UNDO_TTL_MS + 1), null, 'not three weeks later, over a conversation he is now having');
});

test('a corrupt stash restores nothing rather than something wrong', () => {
  for (const junk of [null, {}, { chat: [] }, { chat: chat(2) }, { chat: chat(2), at: 'soon' }]) {
    assert.equal(usableUndo(junk, 5000), null);
  }
});

test('the button says how much comes back', () => {
  assert.equal(undoLabel(stashOf(chat(63), 's', 0)), 'Undo · 63 turns');
  assert.equal(undoLabel(stashOf(chat(1), 's', 0)), 'Undo · 1 turn');
  assert.equal(undoLabel(null), 'Undo');
});

test('a very long log keeps its tail, which is the part he was reading', () => {
  const s = stashOf(chat(500), 's', 0);
  assert.equal(s.chat.length, 200);
  assert.equal(s.turns, 500, 'and still reports the true size');
  assert.equal(s.chat[s.chat.length - 1].text, 't499');
});

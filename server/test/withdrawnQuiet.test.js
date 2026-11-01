// A CARD THE COACH TAKES BACK IS NEVER READ ALOUD. Pinned against recording
// a, 31 Oct 2026 23:4x UTC: after the Coach's answer finished, Nova said
// "Taken off the coach tab, spider curl, remove from pull three sets. You have
// flagged your own form on barbell bench press two times across your recent
// sessions…": the receipt line, carrying two withdrawn cards' whole bodies,
// was appended to the reply text and spoken with it. The Coach had already
// said, in its own words, that it was taking both back.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-withdrawn-quiet-data-'));
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { receiptLines, withdrawnNote } = await import('../lib/coachProposals.js');
const { receiptNote } = await import('../../src/conversationSync.js');

// his two real cards (inbox cee5d04d, bf402d91), titled as cardTitle reads them
const back = [
  { id: 'cee5d04d', ok: true, title: 'Coach: Spider Curl: remove from Pull (3 sets).' },
  { id: 'bf402d91', ok: true, title: 'Coach: You have flagged your own form on Barbell Bench Press 2 times across your recent sessions — "Trying to focus on improving form with dropping closer to the chest" and "Longer rest for final set."' },
];

test('his own Coach chat: the withdrawn cards are not in what he hears', () => {
  const lines = receiptLines({ withdrawn: back });
  assert.deepEqual(lines, [], 'nothing about the withdrawn cards joins the spoken reply');
});

test('they are a short quiet receipt instead, cut so a card body never shows whole', () => {
  const note = withdrawnNote(back);
  assert.match(note, /^took back 2 cards: Spider Curl: remove from Pull \(3 sets\); You have flagged your own form on…$/);
  assert.ok(note.length < 100, note);
  assert.equal(withdrawnNote([{ id: 'x', ok: false, title: 'not taken back' }]), null);
  assert.equal(receiptNote({ receipt: note }), note);
  assert.equal(receiptNote({ text: 'an ordinary reply' }), null);
});

test('a CONSULTED Coach still tells the agent that asked, which cannot see the Coach tab', () => {
  const lines = receiptLines({ withdrawn: back, announce: true });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Taken off the Coach tab: Spider Curl/);
});

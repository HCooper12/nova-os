// THE CODE SCREEN'S ARITHMETIC (round 3, mockup 89): every sentence and
// count it shows is computed in src/codeModel.js from real records. These
// pin the rules the build checklist names: a file another session changed
// arrives unticked, the 8-character rule, the quiet bar against 12 hours,
// the Breaker's findings counted from its own numbered list, and no model
// version typed by hand anywhere in the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reviewFiles, reviewTotals, ruleOf, quietOf, findingsOf, textBlocks, newsLine, chipsFor, leftOutLine,
  lineHead, unansweredBreaker, projectKeyOf, sessionLine, STALE_MS,
} from '../../src/codeModel.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const files = [
  { path: 'src/a.jsx', name: 'a.jsx', added: 71, removed: 0, other: null },
  { path: 'src/b.jsx', name: 'b.jsx', added: 46, removed: 22, other: null },
  { path: 'src/lanterns.js', name: 'lanterns.js', added: 3, removed: 1, other: { sessionId: 'x' } },
];

test('a file another session changed arrives unticked; his own tick wins either way', () => {
  const rows = reviewFiles(files);
  assert.deepEqual(rows.map((f) => f.ticked), [true, true, false]);
  assert.equal(rows[2].note, 'Changed by another session, left out');
  assert.deepEqual(reviewTotals(rows), { files: 2, added: 117, removed: 22 });
  const mine = reviewFiles(files, { 'src/lanterns.js': true, 'src/a.jsx': false });
  assert.deepEqual(mine.map((f) => f.ticked), [false, true, true]);
  assert.equal(rows[0].width, 100);
  assert.equal(rows[1].count, '+46 −22');
});

test('the 8-character rule lights one tick per character and ignores spaces at the ends', () => {
  assert.deepEqual(ruleOf(''), { lit: 0, met: false });
  assert.deepEqual(ruleOf('  Tide  '), { lit: 4, met: false });
  assert.deepEqual(ruleOf('1234567'), { lit: 7, met: false });
  assert.deepEqual(ruleOf('Tide sheet asks first'), { lit: 8, met: true });
});

test('the quiet bar measures against 12 hours and says so in words', () => {
  assert.deepEqual(quietOf({ state: 'working' }), { live: true, words: 'talking now' });
  const six = quietOf({ state: 'waiting', quietMs: 6 * 60_000 });
  assert.equal(six.words, '6 min quiet');
  assert.ok(six.q > 0 && six.q < 0.05);
  const fourteen = quietOf({ state: 'left-open', quietMs: 14 * 3600_000 });
  assert.equal(fourteen.words, '14 h quiet');
  assert.equal(fourteen.q, 1);
  assert.equal(fourteen.over, true);
  assert.equal(quietOf({ state: 'waiting', quietMs: 3 * 24 * 3600_000 }).words, '3 days quiet');
  assert.equal(STALE_MS, 12 * 3600_000);
  assert.equal(sessionLine({ state: 'working', startedAgo: 'about 40 minutes ago', plain: 'Working now.' }), 'Working now. Started about 40 minutes ago.');
});

test('the Breaker\'s findings are counted from its own numbered list, and answered findings stop waiting', () => {
  const text = 'Two things.\n1. An empty value still clears.\n2) Undo is lost on close.';
  assert.equal(findingsOf(text), 2);
  assert.deepEqual(textBlocks(text).map((b) => b.type), ['p', 'ol']);
  assert.deepEqual(textBlocks(text)[1].items, ['An empty value still clears.', 'Undo is lost on close.']);
  const brk = { who: 'breaker', text };
  assert.equal(unansweredBreaker([{ who: 'you', text: 'x' }, brk]), brk);
  assert.equal(unansweredBreaker([brk, { who: 'you', text: 'Fix both.' }]), null);
});

test('the news line is written from the records, never a stock sentence', () => {
  assert.equal(newsLine({ waiting: ['Wren'], ready: [{ title: 'Nova OS', n: 3 }] }), 'Wren is waiting on you, and Nova OS has three files ready to commit.');
  assert.equal(newsLine({ waiting: ['Nova OS'], ready: [{ title: 'Nova OS', n: 1 }] }), 'Nova OS is waiting on you and has one file ready to commit.');
  assert.equal(newsLine({ nothing: true }), 'Nothing is running, and everything is committed.');
  assert.match(newsLine({ away: true }), /isn’t answering/);
  assert.equal(newsLine({ working: 'Vault' }), 'The Builder is working in Vault.');
});

test('chips and the left-out line count real states, with singular and plural right', () => {
  const ss = [{ state: 'working' }, { state: 'waiting' }, { state: 'left-open' }];
  assert.deepEqual(chipsFor(ss, { ready: 3, doneToday: 1 }).map((c) => c.text), ['Working', 'Waiting for you', '3 to commit', 'Done today 1', '1 left open']);
  assert.deepEqual(chipsFor([]), []);
  const left = leftOutLine(['src/lanterns.js'], reviewFiles(files));
  assert.equal(left.lead + left.names + left.tail, '1 file left out: lanterns.js, changed by another session. It stays uncommitted.');
  assert.equal(leftOutLine([], []), null);
});

test('projects come from the folders Nova knows; any other folder is its own tile', () => {
  assert.equal(projectKeyOf({ key: 'nova-os' }), 'nova');
  assert.equal(projectKeyOf({ key: 'Atomic_Hub' }), 'atlas');
  assert.equal(projectKeyOf({ key: 'atlas-partner' }), 'wren');
  assert.equal(projectKeyOf({ key: 'Claude' }), 'p:Claude');
});

test('the Builder line names the model by the board\'s label, never a typed version', async () => {
  const h = lineHead({ who: 'claude', model: 'fable', startedAt: 0, endedAt: 4 * 60_000, files: 3 }, { modelLabel: (v) => ({ fable: 'Fable (from the board)' }[v]) });
  assert.equal(h.detail, 'Fable (from the board) · 4 min · 3 files');
  for (const f of ['src/screens/ClaudeCode.jsx', 'src/vals/valsCode.js', 'src/codeModel.js', 'src/codeActions.js']) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /\b(?:Sonnet|Opus|Fable|Haiku) \d/, `${f} types a model version by hand`);
  }
});

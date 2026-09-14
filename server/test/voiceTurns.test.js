// THE TURN RECEIPT. He said, driving on cellular, that Nova decided he had
// finished talking while he was still mid-ramble — and there was no way to
// tell which of three separate faults had done it. This store is the answer
// to that: one line per held turn, saying why it ended. These tests pin the
// two things that make it trustworthy — it never grows without bound, and it
// never stores a reason nobody can read.
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-voiceturns-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { appendTurn, readTurns, turnRecord, MAX_TURNS, END_REASONS } = await import('../lib/voiceTurns.js');
const { endReason } = await import('../../src/turnEnd.js');

const turnsFile = path.join(dataDir, 'voice', 'turns.json');

test('the first receipt creates the directory and the file', async () => {
  assert.deepEqual(readTurns(), [], 'nothing written yet is an empty log, not a crash');
  await appendTurn({ reason: 'hold', ms: 4200, restarts: 1, heard: true, surface: 'voice', preset: 'natural' }, 'iPhone');
  const saved = JSON.parse(await readFile(turnsFile, 'utf8'));
  assert.equal(saved.turns.length, 1);
  assert.equal(saved.turns[0].reason, 'hold');
  assert.equal(saved.turns[0].heard, true);
  assert.equal(saved.turns[0].surface, 'voice');
  assert.ok(saved.turns[0].at, 'a receipt with no time cannot be read back against a memory');
});

test('turns append in order and the log keeps only the last 500', async () => {
  await rm(turnsFile, { force: true });
  for (let i = 0; i < MAX_TURNS + 20; i++) {
    await appendTurn({ reason: 'lead', ms: i, restarts: 0, heard: false, surface: 'presence' });
  }
  const kept = readTurns();
  assert.equal(kept.length, MAX_TURNS);
  assert.equal(kept[0].ms, 20, 'the oldest 20 fell off the front');
  assert.equal(kept[kept.length - 1].ms, MAX_TURNS + 19, 'the newest is last');
});

test('a reason nobody recognises is stored as unknown, never as whatever arrived', async () => {
  const r = turnRecord({ reason: 'because-i-said-so', ms: 10, surface: 'nope' });
  assert.equal(r.reason, 'unknown');
  assert.equal(r.surface, 'voice');
});

test('junk from a browser cannot make a receipt enormous or negative', () => {
  const r = turnRecord({ reason: 'hold', ms: -5, restarts: -3, preset: 'x'.repeat(400), ua: 'u'.repeat(9000) });
  assert.equal(r.ms, 0);
  assert.equal(r.restarts, 0);
  assert.ok(r.preset.length <= 24);
  assert.ok(r.ua.length <= 200);
});

test('a corrupt log reads as empty instead of taking the endpoint down', async () => {
  await mkdir(path.dirname(turnsFile), { recursive: true });
  await writeFile(turnsFile, '{ "turns": [ {', 'utf8');
  assert.deepEqual(readTurns(), []);
});

// The two vocabularies must not drift: turnEnd.js decides the reason and this
// store is the only thing that writes it down.
test('every reason turnEnd.js can produce is one this log accepts', () => {
  const produced = new Set([
    endReason(null, 1, {}),                                                        // engine / caller stopped
    endReason({ startedAt: 0, lastHeardAt: 1000, engineIdle: false, restarts: 0 }, 9000, { holdMs: 2000, leadMs: 7000 }),      // hold
    endReason({ startedAt: 0, lastHeardAt: null, engineIdle: false, restarts: 0 }, 9000, { holdMs: 2000, leadMs: 7000 }),      // lead
    endReason({ startedAt: 0, lastHeardAt: 119000, engineIdle: false, restarts: 0 }, 125000, { holdMs: 2000, leadMs: 7000 }),  // cap-idle
    endReason({ startedAt: 0, lastHeardAt: 899900, engineIdle: false, restarts: 0 }, 900000, { holdMs: 2000, leadMs: 7000 }),  // cap-absolute
    endReason({ startedAt: 0, lastHeardAt: 100, engineIdle: true, restarts: 40 }, 600, { holdMs: 2000, leadMs: 7000 }),        // restart-limit
  ]);
  assert.equal(produced.size, 6, 'each case produced a distinct reason');
  for (const r of produced) assert.ok(END_REASONS.has(r), `${r} would be logged as unknown`);
});

test.after(() => rm(dataDir, { recursive: true, force: true }));

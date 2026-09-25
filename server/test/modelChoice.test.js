// The model-choice gate: the pure question/parse helpers, the interactive
// lanes' per-run override validation, and the scheduled-lane half (Pattern
// Scout / Distill raise an Inbox card instead of running, and answering it
// is what actually runs the week's job).
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-modelchoice-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-modelchoice-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

// A stub CLI that always answers "no proposals" (a valid, empty Pattern
// Scout response) and logs its own argv, so the test can prove the chosen
// model actually reached --model rather than trusting the plumbing blindly.
const argvLog = path.join(dataDir, 'argv.log');
const stub = path.join(dataDir, 'claude-stub.js');
await writeFile(stub, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log(JSON.stringify({ result: JSON.stringify({ proposals: [] }) }));
`, 'utf8');
await chmod(stub, 0o755);
process.env.CLAUDE_BIN = stub;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  GATE_LANES, gateQuestion, isGateModel, parseSpokenGateReply,
  raiseWeeklyModelChoice, resolveWeeklyModelChoice,
  gateFor, needsGate, modelGates, KEEP,
} = await import('../lib/modelChoice.js');
const { setLanePref, resetLanePref } = await import('../lib/modelPrefs.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');

test.after(async () => {
  await new Promise((res) => setTimeout(res, 250)); // let a trailing spawn's writes settle (see inboxRetry.test.js)
  for (const dir of [dataDir, vault]) {
    for (let i = 0; i < 4; i++) {
      try { await rm(dir, { recursive: true, force: true }); break; }
      catch { await new Promise((res) => setTimeout(res, 200)); }
    }
  }
});

test('isGateModel accepts only the two the gate actually offers', () => {
  assert.equal(isGateModel('opus'), true);
  assert.equal(isGateModel('sonnet'), true);
  assert.equal(isGateModel('haiku'), false);
  assert.equal(isGateModel('claude-opus-5'), false, 'the gate offers two options, not the whole model board');
  assert.equal(isGateModel(undefined), false);
});

test('gateQuestion is defined for every lane, names what "keep it" runs, and refuses an unknown one', () => {
  for (const lane of Object.keys(GATE_LANES)) {
    const q = gateQuestion(lane);
    assert.match(q, /Opus/);
    assert.match(q, /Sonnet 5 fine\?$/, 'on an untouched board every gated lane runs Sonnet, and the question says which one');
  }
  assert.throws(() => gateQuestion('no-such-lane'), /unknown gate lane/);
});

// THE 25 SEP FAULT: his board had the Researcher on Opus, the gate still
// asked "Opus, or is Sonnet fine?", and "fine" ran it on Sonnet.
test('a lane his board already runs on Opus (or Fable) is never asked about', async () => {
  try {
    assert.equal(needsGate('research'), true, 'untouched board: researcher runs sonnet, so Opus is a real choice');
    await setLanePref('researcher', { model: 'opus' });
    assert.equal(needsGate('research'), false);
    assert.equal(gateFor('research').label, 'Opus 5.5');
    await setLanePref('researcher', { model: 'claude-fable-5-1' });
    assert.equal(needsGate('research'), false, 'Fable is past Opus: offering Opus would be a downgrade');
    await setLanePref('watcher-verdict', { model: 'haiku' });
    assert.equal(needsGate('watch'), true);
    assert.match(gateQuestion('watch'), /or is Haiku 4\.5 fine\?$/, '"keep it" is named as what it really runs');
    // study's run cannot carry a per-run model, so asking would be theatre
    assert.equal(needsGate('study'), false);
    const gates = modelGates();
    assert.deepEqual(Object.keys(gates).sort(), ['book', 'research', 'scout', 'study', 'watch']);
    assert.equal(gates.research.ask, false);
    assert.equal(gates.watch.keepLabel, 'Haiku 4.5');
  } finally {
    await resetLanePref();
  }
});

test('parseSpokenGateReply reads a spoken answer, or says so honestly when it can\'t', () => {
  assert.equal(parseSpokenGateReply('opus please'), 'opus');
  assert.equal(parseSpokenGateReply('go deeper on this one'), 'opus');
  // "fine" keeps the BOARD's model — never a literal 'sonnet' under his setting
  assert.equal(parseSpokenGateReply('sonnet is fine'), KEEP);
  assert.equal(parseSpokenGateReply('no, keep it normal'), KEEP);
  assert.equal(parseSpokenGateReply('what time is it'), null, 'genuinely unrelated speech is ambiguous, not a guess');
  assert.equal(parseSpokenGateReply(''), null);
});

test('raiseWeeklyModelChoice creates one pending card, and re-ticking is a no-op while it stands', async () => {
  const { record } = await raiseWeeklyModelChoice('pattern-scout');
  assert.equal(record.kind, 'model-choice');
  assert.equal(record.status, 'pending');
  assert.equal(record.decision.payload.lane, 'pattern-scout');
  assert.match(record.decision.reason, /Opus/); // the gate question itself
  assert.equal(record.decision.payload.keepLabel, 'Sonnet 5', 'the card can name what its second button runs');

  const again = await raiseWeeklyModelChoice('pattern-scout');
  assert.equal(again.skipped, true, 'a second tick this week must not spam a second card');

  const records = await listRecords();
  const cards = records.filter((r) => r.kind === 'model-choice' && r.decision?.payload?.lane === 'pattern-scout');
  assert.equal(cards.length, 1);
});

test('raiseWeeklyModelChoice refuses an unknown lane', async () => {
  await assert.rejects(() => raiseWeeklyModelChoice('no-such-lane'), /unknown gate lane/);
});

test('resolveWeeklyModelChoice validates before touching anything', async () => {
  const { record } = await raiseWeeklyModelChoice('distill');
  await assert.rejects(() => resolveWeeklyModelChoice(vault, record.id, 'haiku'), /must be 'opus', 'sonnet' or 'keep'/);
  await assert.rejects(() => resolveWeeklyModelChoice(vault, 'no-such-id', 'opus'), /not found/);
  const stillPending = await getRecord(record.id);
  assert.equal(stillPending.status, 'pending', 'a rejected attempt must not touch the card');
});

test('resolveWeeklyModelChoice runs the real lane on the chosen model and files the card', async () => {
  const { record } = await raiseWeeklyModelChoice('pattern-scout');
  const { record: filed } = await resolveWeeklyModelChoice(vault, record.id, 'opus');
  assert.equal(filed.status, 'filed');
  assert.equal(filed.id, record.id);

  // The underlying job is fire-and-forget (runPatternScout returns right
  // after spawning, same as it always has), so the child's own write to
  // argv.log lands on its own time — poll rather than a fixed sleep. A busy
  // machine slowing the spawn down is not a broken gate (same reasoning as
  // inboxRetry.test.js's waitForSettle).
  const { readFile } = await import('node:fs/promises');
  const start = Date.now();
  let lines = [];
  while (Date.now() - start < 10_000) {
    try {
      lines = (await readFile(argvLog, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      if (lines.length) break;
    } catch { /* not written yet */ }
    await new Promise((res) => setTimeout(res, 100));
  }
  const scoutCall = lines.find((argv) => argv.includes('--model'));
  assert.ok(scoutCall, 'the stub was invoked with a --model flag');
  assert.equal(scoutCall[scoutCall.indexOf('--model') + 1], 'opus');

  // answering the SAME card twice is refused — it already ran
  await assert.rejects(() => resolveWeeklyModelChoice(vault, record.id, 'sonnet'), /already answered/);
});

test('resolveWeeklyModelChoice rejects a record that exists but is not a model-choice card', async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  const capture = await createRecord({ id: 'mc-wrong-kind', kind: 'capture', text: 'x', source: 'text', mode: 'auto-high', status: 'pending', createdAt: new Date().toISOString() });
  await assert.rejects(() => resolveWeeklyModelChoice(vault, capture.id, 'opus'), /model-choice record not found/);
});

test('"keep it" on the weekly card runs the lane on the board\'s own model', async () => {
  const { readFile } = await import('node:fs/promises');
  const count = async () => { try { return (await readFile(argvLog, 'utf8')).trim().split('\n').filter(Boolean).length; } catch { return 0; } };
  const before = await count();
  // a fresh pattern-scout card (the lane whose run is proven to spawn above);
  // raising again this week would be a no-op by design, so it is made directly
  const { createRecord } = await import('../lib/inboxStore.js');
  const card = await createRecord({
    id: 'mc-keep-board', kind: 'model-choice', text: 'Model choice', source: 'model-choice', mode: 'draft',
    status: 'pending', createdAt: new Date().toISOString(),
    decision: { route: 'model-choice', confidence: 'n/a', title: 'Pick a model', reason: 'x', payload: { lane: 'pattern-scout' } },
  });
  try {
    await setLanePref(card.decision.payload.lane, { model: 'haiku' });
    const { record: filed } = await resolveWeeklyModelChoice(vault, card.id, KEEP);
    assert.equal(filed.status, 'filed');
    const start = Date.now();
    let lines = [];
    while (Date.now() - start < 10_000) {
      lines = (await readFile(argvLog, 'utf8')).trim().split('\n').filter(Boolean).slice(before).map((l) => JSON.parse(l));
      if (lines.length) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    const call = lines.find((argv) => argv.includes('--model'));
    assert.ok(call, 'the lane ran');
    assert.equal(call[call.indexOf('--model') + 1], 'haiku', 'keep = the board, not a hard-coded sonnet');
  } finally {
    await resetLanePref();
  }
});

// Apple's on-device model as the third local backend (1 Nov 2026): backend
// selection, the stand-in rule (Ollama has no room → a short call runs on
// Apple), the window check, the no-tools refusal, labels, the model list,
// his Settings pick, and errors passed through as plain text. Every call
// goes to a Node stub speaking the helper's JSON lines
// (fixtures/apple-llm-stub.mjs), never the real Swift helper or Apple
// Intelligence, and never the real Ollama (NODE_TEST_CONTEXT closes it).
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'nova-apple-llm-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_OLLAMA_NO_SPAWN = '1';
delete process.env.NOVA_LOCAL_LLM_BACKEND;
delete process.env.NOVA_LOCAL_LLM_MODEL;

const STUB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'apple-llm-stub.mjs');
process.env.NOVA_APPLE_LLM_BIN = STUB;

import test from 'node:test';
import assert from 'node:assert/strict';

const lm = await import('../lib/localModel.js');
const {
  APPLE_MODEL_ID, localBackend, defaultModel, setPreferredModel, modelFitsBackend, localModelName, localModelLabel,
  completeLocal, chatLocal, listLocalModels, memoryHeadroom, _setHeadroomForTests, stopLocalModel,
  fitsAppleWindow, backendForCall, unfenceJson, localModelConfigured, appleConfigured,
} = lm;

const NO_ROOM = () => ({ ok: false, freeMB: 900, needMB: 3500, swapFreeMB: null, reason: 'this Mac has only 900 MB of memory free' });
const ROOM = () => ({ ok: true, freeMB: 9000, needMB: 3500, swapFreeMB: null, reason: null });

// every test starts from the default: Ollama preferred, no pick, the stub
// available, a fresh helper
test.beforeEach(() => {
  delete process.env.NOVA_LOCAL_LLM_BACKEND;
  delete process.env.NOVA_LOCAL_LLM_MODEL;
  delete process.env.APPLE_STUB_UNAVAILABLE;
  delete process.env.APPLE_STUB_LOG;
  process.env.NOVA_APPLE_LLM_BIN = STUB;
  setPreferredModel(null);
  _setHeadroomForTests(null);
});
test.afterEach(async () => {
  _setHeadroomForTests(null);
  await stopLocalModel();
});

test('backend selection: Ollama by default; the env pin, an env-pinned model and his pick each say apple; an explicit backend wins', () => {
  assert.equal(localBackend(), 'ollama');
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  assert.equal(localBackend(), 'apple');
  assert.equal(defaultModel(), APPLE_MODEL_ID);
  delete process.env.NOVA_LOCAL_LLM_BACKEND;
  process.env.NOVA_LOCAL_LLM_MODEL = APPLE_MODEL_ID;
  assert.equal(localBackend(), 'apple', 'the eval pins the model; that alone selects the backend');
  delete process.env.NOVA_LOCAL_LLM_MODEL;
  setPreferredModel(APPLE_MODEL_ID);
  assert.equal(localBackend(), 'apple', 'his Settings pick');
  assert.equal(defaultModel(), APPLE_MODEL_ID);
  process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
  assert.equal(localBackend(), 'ollama', 'an explicit backend beats the pick');
  assert.notEqual(defaultModel(), APPLE_MODEL_ID, 'and the pick does not leak into Ollama as a model name');
  process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
  assert.equal(localBackend(), 'mlx');
});

test('Apple\'s id fits only its own backend, and nothing else fits Apple', () => {
  assert.equal(modelFitsBackend(APPLE_MODEL_ID, 'apple'), true);
  assert.equal(modelFitsBackend(APPLE_MODEL_ID, 'ollama'), false);
  assert.equal(modelFitsBackend(APPLE_MODEL_ID, 'mlx'), false);
  assert.equal(modelFitsBackend('qwen3.5:4b', 'apple'), false);
  assert.equal(modelFitsBackend('qwen3.5:4b', 'ollama'), true);
});

test('labels: the pill and the ledger say Apple\'s model, never the Qwen name', () => {
  assert.equal(localModelName(APPLE_MODEL_ID), "Apple's on-device model");
  assert.equal(localModelLabel(APPLE_MODEL_ID), "Apple's on-device model on this Mac");
});

test('configured = the helper exists; a missing binary is not configured', () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  assert.equal(localModelConfigured(), true);
  process.env.NOVA_APPLE_LLM_BIN = path.join(dataDir, 'no-such-helper');
  assert.equal(appleConfigured(), false);
  assert.equal(localModelConfigured(), false);
});

test('headroom on the Apple backend is always ok: Apple manages that memory', () => {
  const r = memoryHeadroom({ backend: 'apple' });
  assert.equal(r.ok, true);
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  assert.equal(memoryHeadroom().ok, true);
});

test('completeLocal pinned to Apple: the helper answers, the model reads apple:on-device, system/json/maxTokens reach it', async () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  const log = path.join(dataDir, 'stub-log-1.txt');
  process.env.APPLE_STUB_LOG = log;
  const out = await completeLocal('sort this', { system: 'be brief', json: false, maxTokens: 64 });
  assert.equal(out.text, 'apple says: sort this');
  assert.equal(out.model, APPLE_MODEL_ID);
  assert.ok(Number.isFinite(out.ms));
  const sent = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => !r.op);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].system, 'be brief');
  assert.equal(sent[0].maxTokens, 64);
  assert.equal(sent[0].json, undefined);
});

test('a JSON reply in a markdown fence is unwrapped by code', async () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  const out = await completeLocal('FENCE please', { json: true });
  assert.equal(out.text, '{"route": "todo"}');
  assert.equal(unfenceJson('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(unfenceJson('{"a":1}'), '{"a":1}');
});

test('errors pass through as plain text: the helper\'s reason, an unavailable model, a crash, a hang', async () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  await assert.rejects(
    () => completeLocal('FAIL:Content contains 4176 tokens, which exceeds the maximum allowed context size of 4096.'),
    /Apple's on-device model: Content contains 4176 tokens/,
  );
  await assert.rejects(() => completeLocal('DIE now'), /Apple's model helper stopped/);
  // the next call starts a fresh helper
  assert.equal((await completeLocal('after the crash')).text, 'apple says: after the crash');
  await assert.rejects(() => completeLocal('HANG', { timeoutMs: 300 }), /did not answer within/);
  assert.equal((await completeLocal('after the hang')).text, 'apple says: after the hang');
  await stopLocalModel();
  process.env.APPLE_STUB_UNAVAILABLE = '1';
  await assert.rejects(() => completeLocal('hello'), /not available: unavailable: appleIntelligenceNotEnabled/);
});

test('chatLocal on Apple: tools are refused with a 400 (never faked); a plain chat answers', async () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  const tools = [{ type: 'function', function: { name: 'vault_search', parameters: { type: 'object', properties: {} } } }];
  await assert.rejects(
    () => chatLocal([{ role: 'user', content: 'what did I log?' }], { tools }),
    (e) => e.status === 400 && /takes no tools/.test(e.message),
  );
  const out = await chatLocal([{ role: 'system', content: 'You are Nova.' }, { role: 'user', content: 'hi' }]);
  assert.equal(out.model, APPLE_MODEL_ID);
  assert.deepEqual(out.message, { role: 'assistant', content: 'apple says: hi' });
});

test('the stand-in rule: Ollama preferred and no room → a short call runs on Apple, labelled so', async () => {
  _setHeadroomForTests(NO_ROOM);
  const out = await completeLocal('Sort this capture: "buy eggs"', { maxTokens: 700, json: true, system: 'JSON only' });
  assert.equal(out.model, APPLE_MODEL_ID);
  assert.equal(out.text, 'apple says: Sort this capture: "buy eggs"');
  const chat = await chatLocal([{ role: 'user', content: 'hello' }], { maxTokens: 200 });
  assert.equal(chat.model, APPLE_MODEL_ID);
});

test('the stand-in rule does not apply: room to load, a call too long for the window, tools, or no helper', async () => {
  // room: Ollama's path (closed in tests), so it fails as Ollama, not Apple
  _setHeadroomForTests(ROOM);
  assert.equal(backendForCall({ prompt: 'short', maxTokens: 100 }), 'ollama');
  await assert.rejects(() => completeLocal('short'), (e) => !/Apple/.test(e.message));

  _setHeadroomForTests(NO_ROOM);
  // ~3,750 tokens of prompt by the chars/4 estimate: over the 3,500 budget
  const long = 'x'.repeat(15_000);
  assert.equal(fitsAppleWindow({ prompt: long, maxTokens: 0 }), false);
  assert.equal(backendForCall({ prompt: long, maxTokens: 100 }), 'ollama');
  // the answer's budget counts too
  assert.equal(fitsAppleWindow({ prompt: 'x'.repeat(8_000), maxTokens: 1600 }), false);
  assert.equal(fitsAppleWindow({ prompt: 'x'.repeat(8_000), maxTokens: 700 }), true);
  await assert.rejects(() => completeLocal(long, { maxTokens: 100 }), (e) => !/Apple/.test(e.message));

  const tools = [{ type: 'function', function: { name: 't', parameters: { type: 'object', properties: {} } } }];
  assert.equal(backendForCall({ prompt: 'short', tools }), 'ollama');
  await assert.rejects(() => chatLocal([{ role: 'user', content: 'hi' }], { tools, waitForBoot: false }), (e) => e.status !== 400);

  process.env.NOVA_APPLE_LLM_BIN = path.join(dataDir, 'no-such-helper');
  assert.equal(backendForCall({ prompt: 'short' }), 'ollama');

  // his off switch for the stand-in
  process.env.NOVA_APPLE_LLM_BIN = STUB;
  assert.equal(backendForCall({ prompt: 'short' }), 'apple');
  process.env.NOVA_LOCAL_APPLE_STANDIN = '0';
  try { assert.equal(backendForCall({ prompt: 'short' }), 'ollama'); } finally { delete process.env.NOVA_LOCAL_APPLE_STANDIN; }
});

test('listLocalModels names Apple\'s model when available, with no size; not when unavailable or not built', async () => {
  let list = await listLocalModels();
  assert.deepEqual(list.find((m) => m.id === APPLE_MODEL_ID), { id: APPLE_MODEL_ID, name: "Apple's on-device model", sizeGB: null });
  await stopLocalModel();
  process.env.APPLE_STUB_UNAVAILABLE = '1';
  list = await listLocalModels();
  assert.equal(list.some((m) => m.id === APPLE_MODEL_ID), false);
  delete process.env.APPLE_STUB_UNAVAILABLE;
  process.env.NOVA_APPLE_LLM_BIN = path.join(dataDir, 'no-such-helper');
  list = await listLocalModels();
  assert.equal(list.some((m) => m.id === APPLE_MODEL_ID), false);
  process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
  assert.deepEqual(await listLocalModels(), []);
});

test('setLocalPrefs: Apple\'s model is a valid pick when built and available; the board says appleAvailable; switching back works', async () => {
  const { setLocalPrefs, localBoard } = await import('../lib/modelPrefs.js');
  let board = await setLocalPrefs({ model: APPLE_MODEL_ID });
  assert.equal(board.local.preferredModel, APPLE_MODEL_ID);
  assert.equal(board.local.model, APPLE_MODEL_ID);
  assert.equal(board.local.backend, 'apple');
  assert.equal(board.local.label, "Apple's on-device model on this Mac");
  assert.equal(board.local.appleAvailable, true);
  assert.equal(localBackend(), 'apple');
  // back to a Qwen model: judged against Ollama, not against Apple-as-current
  board = await setLocalPrefs({ model: 'qwen3.5:4b' });
  assert.equal(board.local.model, 'qwen3.5:4b');
  assert.equal(localBackend(), 'ollama');
  assert.equal(localBoard().appleAvailable, true, 'still available as the stand-in');

  await stopLocalModel();
  process.env.APPLE_STUB_UNAVAILABLE = '1';
  await assert.rejects(() => setLocalPrefs({ model: APPLE_MODEL_ID }), /not available on this Mac: unavailable/);
  delete process.env.APPLE_STUB_UNAVAILABLE;
  process.env.NOVA_APPLE_LLM_BIN = path.join(dataDir, 'no-such-helper');
  await assert.rejects(() => setLocalPrefs({ model: APPLE_MODEL_ID }), /helper is not built/);
  assert.equal(localBoard().appleAvailable, false);
  await setLocalPrefs({ model: null });
});

test('a text lane pinned to Apple: answered here, and the ledger row names apple:on-device', async () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  const { runTextLane } = await import('../lib/textLane.js');
  const { _flushSpend } = await import('../lib/modelSpend.js');
  const out = await runTextLane('note-summary', 'summarise this note', { maxTokens: 100 });
  assert.equal(out.provider, 'local');
  assert.equal(out.model, APPLE_MODEL_ID);
  assert.equal(out.text, 'apple says: summarise this note');
  await _flushSpend();
  const ledger = path.join(dataDir, 'model-spend.json');
  assert.ok(existsSync(ledger));
  const rows = JSON.parse(readFileSync(ledger, 'utf8')).lanes['note-summary'];
  assert.equal(rows.at(-1).model, `local:${APPLE_MODEL_ID}`);
});

test('a text lane pinned to Apple with no helper built escalates with a plain reason', async () => {
  process.env.NOVA_LOCAL_LLM_BACKEND = 'apple';
  process.env.NOVA_APPLE_LLM_BIN = path.join(dataDir, 'no-such-helper');
  // a Claude stand-in that answers, so the escalation's reason is what we read
  const fakeClaude = path.join(dataDir, 'claude-ok.sh');
  writeFileSync(fakeClaude, '#!/bin/sh\necho \'{"type":"result","result":"from claude","duration_ms":5}\'\n', { mode: 0o755 });
  const had = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = fakeClaude;
  try {
    const { runTextLane } = await import('../lib/textLane.js');
    const out = await runTextLane('note-summary', 'summarise', { maxTokens: 50 });
    assert.equal(out.escalated, true);
    assert.match(out.reason, /Apple's model helper is not built on this Mac/);
  } finally {
    if (had === undefined) delete process.env.CLAUDE_BIN; else process.env.CLAUDE_BIN = had;
  }
});

/* --------------- a model per lane (3 Nov 2026, his call) --------------- */

test('callTarget: no model is the board; Apple\'s id is Apple; an Ollama tag is Ollama even under an Apple board pick; an eval pin wins', () => {
  const { callTarget } = lm;
  assert.deepEqual(callTarget(), { backend: 'ollama', model: defaultModel() });
  assert.deepEqual(callTarget(APPLE_MODEL_ID), { backend: 'apple', model: APPLE_MODEL_ID });
  assert.deepEqual(callTarget('qwen3.5:9b'), { backend: 'ollama', model: 'qwen3.5:9b' });
  setPreferredModel(APPLE_MODEL_ID);
  assert.deepEqual(callTarget('qwen3.5:9b'), { backend: 'ollama', model: 'qwen3.5:9b' }, 'the lane was measured on the 9B');
  assert.deepEqual(callTarget(), { backend: 'apple', model: APPLE_MODEL_ID });
  setPreferredModel(null);
  assert.deepEqual(callTarget('mlx-community/Qwen3-4B'), { backend: 'ollama', model: defaultModel() }, 'a tag Ollama cannot run is ignored');
  process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:4b';
  assert.deepEqual(callTarget('qwen3.5:9b'), { backend: 'ollama', model: 'qwen3.5:4b' }, 'the eval run means what it pinned');
  delete process.env.NOVA_LOCAL_LLM_MODEL;
  process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
  assert.equal(callTarget('qwen3.5:9b').backend, 'mlx', 'MLX serves one model per process');
});

test('completeLocal with a lane model of Apple runs on Apple while the board is Ollama, with room to spare', async () => {
  _setHeadroomForTests(ROOM);
  const out = await completeLocal('hello', { maxTokens: 50, model: APPLE_MODEL_ID });
  assert.equal(out.model, APPLE_MODEL_ID);
});

test('the stand-in rule holds for a lane on its own model: the 9B lane with no room runs a short call on Apple, labelled so', async () => {
  _setHeadroomForTests(NO_ROOM);
  // Ollama reads as installed (a binary exists; never run: NO_SPAWN), so the
  // lane is configured and the stand-in rule, not "not installed", decides
  const bin = path.join(dataDir, 'ollama-bin');
  writeFileSync(bin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const had = process.env.NOVA_OLLAMA_BIN;
  process.env.NOVA_OLLAMA_BIN = bin;
  try {
    const { runTextLane } = await import('../lib/textLane.js');
    const { localModelFor } = await import('../lib/modelPrefs.js');
    assert.equal(localModelFor('session-debrief'), 'qwen3.5:9b');
    const out = await runTextLane('session-debrief', 'react to this set', { maxTokens: 100 });
    assert.equal(out.provider, 'local');
    assert.equal(out.model, APPLE_MODEL_ID, "Apple's words are never credited to the 9B");
  } finally {
    if (had === undefined) delete process.env.NOVA_OLLAMA_BIN; else process.env.NOVA_OLLAMA_BIN = had;
  }
});

test('a lane he pins to Apple on the board answers there; clearing it puts the lane default back', async () => {
  const { setLanePref, localModelFor, getModelPrefs } = await import('../lib/modelPrefs.js');
  await setLanePref('plan-today', { localModel: APPLE_MODEL_ID });
  assert.equal(localModelFor('plan-today'), APPLE_MODEL_ID);
  const { runTextLane } = await import('../lib/textLane.js');
  const out = await runTextLane('plan-today', 'plan my day', { maxTokens: 50 });
  assert.equal(out.model, APPLE_MODEL_ID);
  const board = await setLanePref('plan-today', { localModel: null });
  assert.equal(board.lanes.find((l) => l.id === 'plan-today').localModelResolved, 'qwen3.5:9b');
  assert.equal(getModelPrefs().lanes.find((l) => l.id === 'plan-today').localModel, null);
});

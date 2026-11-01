// WHICH BRAIN BY VOICE (2 Nov 2026): the three brain verbs on a scratch
// board. NOVA_DATA_DIR is set before any lib import, so the board file is a
// temp one and his live preferences are never touched.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-brainverbs-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-brainverbs-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const hands = await import('../lib/hands.js');
hands._setRunnerForTests(async () => ({ stdout: '', stderr: '' }));
const prefs = await import('../lib/modelPrefs.js');
const { describeForModel, runVerb, parseCommand, verbFor, undoVerb } = await import('../lib/verbs.js');

const said = (r) => (r.acted || r).said;

test('describeForModel lists all three brain verbs by name', () => {
  const d = describeForModel();
  for (const id of ['brain.local', 'brain.claude', 'brain.which']) assert.match(d, new RegExp(`"verb":"${id.replace('.', '\\.')}"`));
  assert.match(d, /go local/);
  assert.match(d, /back to Claude/);
});

test('the grammar claims exact phrasings only', () => {
  assert.equal(parseCommand('switch to your local brain').verb, 'brain.local');
  assert.equal(parseCommand('go local').verb, 'brain.local');
  assert.equal(parseCommand('use the Mac').verb, 'brain.local');
  assert.equal(parseCommand('switch to Claude').verb, 'brain.claude');
  assert.equal(parseCommand('back to Claude').verb, 'brain.claude');
  assert.equal(parseCommand("which brain are you on").verb, 'brain.which');
  assert.equal(parseCommand('who is answering').verb, 'brain.which');
  assert.equal(parseCommand('go local with the shopping list'), null);
});

test('brain.claude turns local-first off, and its undo turns it back on', async () => {
  await prefs.setLocalPrefs({ first: true });
  const r = await runVerb(vault, 'back to claude', { verb: 'brain.claude', args: {} });
  assert.equal(said(r), 'Back on Claude, sir.');
  assert.equal(prefs.localFirst(), false);
  assert.equal(prefs.providerFor('ask-nova'), 'claude');
  await verbFor('brain.claude').undo(vault, r.acted ? { was: true } : {});
  assert.equal(prefs.localFirst(), true);
});

test('brain.which reads the resolved providers and changes nothing', async () => {
  await prefs.setLocalPrefs({ first: false });
  const r = await runVerb(vault, 'which brain are you on', { verb: 'brain.which', args: {} });
  assert.match(said(r), /Claude/);
  assert.match(said(r), /(loaded|not loaded|No local model)/);
  assert.equal(prefs.localFirst(), false);
  assert.equal(r.acted.recordId, null);
});

// a stand-in "binary" that exists, so the board reads as configured
const withBin = async (bin, fn) => {
  const old = process.env.NOVA_OLLAMA_BIN;
  if (bin) process.env.NOVA_OLLAMA_BIN = bin; else delete process.env.NOVA_OLLAMA_BIN;
  try { await fn(); } finally { if (old === undefined) delete process.env.NOVA_OLLAMA_BIN; else process.env.NOVA_OLLAMA_BIN = old; }
};

test('brain.local with a model set up switches first on, clears the conversation pins, names the model, and undoes', () => withBin(process.execPath, async () => {
  assert.equal(prefs.localBoard().configured, true);
  await prefs.setLocalPrefs({ first: false });
  await prefs.setLanePref('ask-nova', { provider: 'claude' });
  await prefs.setLanePref('greeting', { provider: 'claude' });
  const r = await runVerb(vault, 'go local', { verb: 'brain.local', args: {} });
  assert.match(said(r), /^On this Mac now, sir: .+\. Claude only when I cannot answer\.$/);
  assert.doesNotMatch(said(r), /on this Mac\./);
  assert.equal(prefs.localFirst(), true);
  assert.equal(prefs.providerFor('ask-nova'), 'local');
  assert.equal(prefs.providerFor('greeting'), 'local');
  assert.equal(r.acted.undoable, true);
  const { listRecords } = await import('../lib/inboxStore.js');
  const rec = (await listRecords()).find((x) => x.id === r.acted.recordId);
  assert.ok(rec?.undoData, 'the receipt carries undoData');
  await undoVerb(vault, rec.undoData);
  assert.equal(prefs.localFirst(), false);
  assert.equal(prefs.providerFor('ask-nova'), 'claude');
  const which = await runVerb(vault, 'which brain', { verb: 'brain.which', args: {} });
  assert.match(said(which), /Claude/);
}));

test('brain.local with no local model says so and switches nothing', () => withBin(null, async () => {
  assert.equal(prefs.localBoard().configured, false);
  await prefs.setLocalPrefs({ first: false });
  const r = await runVerb(vault, 'go local', { verb: 'brain.local', args: {} });
  assert.match(said(r), /can.t go local, sir: there.s no local model/);
  assert.equal(prefs.localFirst(), false);
}));

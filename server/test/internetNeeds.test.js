// lib/internetNeeds.js — the honest list reflects the board and the code's
// own switches. A scratch NOVA_DATA_DIR, set before any import: the board
// file written here must never be his.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-internetneeds-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_WHISPER_ENV = path.join(dataDir, 'no-such-watch.env');

import test from 'node:test';
import assert from 'node:assert/strict';
import { internetNeeds, laneNeeds, serviceNeeds, stillNeedsInternet, registerNeed, _clearRegisteredNeeds } from '../lib/internetNeeds.js';
import { setLanePref, resetLanePref } from '../lib/modelPrefs.js';

test.after(() => rm(dataDir, { recursive: true, force: true }));

const entry = (list, feature) => list.find((e) => e.feature === feature);

test('a lane pinned to Claude in the board reads as needing Claude; back to local reads none', async () => {
  const before = entry(await internetNeeds(), 'Capture classifier');
  assert.equal(before.needs, 'none');
  assert.match(before.state, /on this Mac/);

  await setLanePref('inbox-classify', { provider: 'claude' });
  const pinned = entry(await internetNeeds(), 'Capture classifier');
  assert.equal(pinned.needs, 'claude');
  assert.match(pinned.state, /Claude/);
  assert.match(pinned.why, /pinned to Claude/);

  await resetLanePref('inbox-classify');
  assert.equal(entry(await internetNeeds(), 'Capture classifier').needs, 'none');
});

test('a Claude-only lane says so; a switched-off lane is left out of "still needs"', () => {
  const list = laneNeeds([
    { id: 'coach-program-check', label: 'Program check', provider: 'claude', enabled: true, canRunLocal: false },
    { id: 'pulse', label: 'Pulse', provider: 'claude', enabled: false, canRunLocal: false },
    { id: 'researcher', label: 'Researcher', provider: 'claude', enabled: true, canRunLocal: false },
  ]);
  assert.match(entry(list, 'Program check').why, /Claude only/);
  assert.equal(entry(list, 'Pulse').off, true);
  assert.match(entry(list, 'Researcher').why, /web/);
  assert.deepEqual(stillNeedsInternet(list).map((e) => e.feature), ['Program check', 'Researcher']);
});

test('ears, voice and web read from the facts, in plain words', () => {
  const groq = serviceNeeds({ ears: 'groq', voice: 'local', braveKey: true });
  assert.equal(entry(groq, 'Ears (speech to text)').state, 'Groq (internet)');
  assert.equal(entry(groq, 'Ears (speech to text)').needs, 'internet');
  assert.equal(entry(groq, 'Voice (text to speech)').state, 'Kokoro on this Mac');
  assert.equal(entry(groq, 'Voice (text to speech)').needs, 'none');
  assert.match(entry(groq, 'Web lookups').state, /Brave/);

  const local = serviceNeeds({ ears: 'mlx-whisper', voice: 'elevenlabs' });
  assert.equal(entry(local, 'Ears (speech to text)').needs, 'none');
  assert.equal(entry(local, 'Voice (text to speech)').needs, 'internet');

  const bare = serviceNeeds({});
  assert.equal(entry(bare, 'Telegram bridge').configured, false);
  assert.ok(!stillNeedsInternet(bare).some((e) => e.feature === 'Telegram bridge'), 'an unconfigured service is not listed as needed');
});

test('the live gather in a scratch dir: no whisper key file means ears not configured', async () => {
  const list = await internetNeeds();
  assert.equal(entry(list, 'Ears (speech to text)').configured, false);
  assert.ok(list.length > 60, 'every lane is listed');
});

test('a module can register its own entry, with a state read per call', async () => {
  let n = 0;
  registerNeed({ feature: 'Test feed', needs: 'internet', why: 'a test', state: () => `read ${++n}` });
  assert.equal(entry(await internetNeeds(), 'Test feed').state, 'read 1');
  assert.equal(entry(await internetNeeds(), 'Test feed').state, 'read 2');
  assert.throws(() => registerNeed({ feature: 'x', needs: 'maybe' }));
  _clearRegisteredNeeds();
  assert.equal(entry(await internetNeeds(), 'Test feed'), undefined);
});

// NEVER A FALSE COUNT (his rule, 7 Oct 2026): "7 agents live" was a constant
// over a list where every agent was `on: true`, shown on his phone's Index,
// both Homes and the Mac sidebar. Every count now comes from work actually
// in flight, and the surfaces read one source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentsWorkingLabels, workingAgentNames } from '../../src/vals/agentsWorking.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const live = { demoMode: false, isOffline: false };

test('nothing in flight counts nobody, and says nothing on the eyebrow', () => {
  const l = agentsWorkingLabels({ liveInbox: { items: [{ kind: 'coach', status: 'pending' }] } }, live);
  assert.equal(l.count, 0);
  assert.equal(l.eyebrow, '');
  assert.equal(l.index, '');
  assert.equal(l.group, 'AGENTS · NONE WORKING');
});

test('a local job and a classifying record each count their agent once', () => {
  const st = { coachBusy: true, liveInbox: { items: [
    { kind: 'research', status: 'classifying' },
    { kind: 'coach', status: 'classifying' },
    { kind: 'money', status: 'filed' },
  ] } };
  assert.deepEqual(workingAgentNames(st).sort(), ['Coach', 'Researcher']);
  const l = agentsWorkingLabels(st, live);
  assert.equal(l.eyebrow, '2 AGENTS WORKING');
  assert.equal(l.index, '2 agents working');
  assert.equal(agentsWorkingLabels({ guardianBusy: true }, live).eyebrow, '1 AGENT WORKING');
});

test('demo and offline make no claim at all', () => {
  for (const ctx of [{ demoMode: true, isOffline: false }, { demoMode: false, isOffline: true }]) {
    const l = agentsWorkingLabels({ coachBusy: true }, ctx);
    assert.equal(l.count, null);
    assert.equal(l.eyebrow, '');
    assert.equal(l.index, '');
  }
});

test('no surface counts the roster list any more', async () => {
  for (const f of ['src/vals/valsMission.js', 'src/vals/valsChrome.js', 'src/vals/valsIndex.js']) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /AGENTS\.filter\(\(a\) => a\.on\)/, `${f} counts the roster`);
    assert.doesNotMatch(src, /AGENTS LIVE|OF \$\{AGENTS\.length\}/, `${f} still claims a live count`);
  }
});

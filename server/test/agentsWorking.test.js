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

const now = new Date().toISOString();
test('a local job and a classifying record each count their agent once', () => {
  const st = { coachBusy: true, liveInbox: { items: [
    { kind: 'research', status: 'classifying', createdAt: now },
    { kind: 'coach', status: 'classifying', createdAt: now },
    { kind: 'money', status: 'filed', createdAt: now },
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

test('the same ten agents and rules as the Org map: Meal Prep is its own agent, and a record stuck past 30 minutes is not working', () => {
  const old = new Date(Date.now() - 31 * 60e3).toISOString();
  const fresh = new Date().toISOString();
  assert.deepEqual(workingAgentNames({ liveInbox: { items: [{ kind: 'meal-prep', status: 'classifying', createdAt: fresh }] } }), ['Meal Prep']);
  assert.deepEqual(workingAgentNames({ liveInbox: { items: [{ kind: 'coach', status: 'classifying', createdAt: old }] } }), []);
  assert.deepEqual(workingAgentNames({ leaderBusy: true, practiceScene: { slug: 'x' } }), ['Leader', 'Practice']);
  assert.deepEqual(workingAgentNames({ liveInbox: { items: [{ kind: 'read-next', status: 'classifying', createdAt: fresh }] } }), ['Librarian']);
});

test('the roster is the Org map\'s ten', async () => {
  const { AGENTS } = await import('../../src/vals/shared.js');
  const { BEINGS } = await import('../lib/orgMap.js');
  assert.deepEqual(AGENTS.map((a) => a.id), BEINGS.map((b) => b.id));
});

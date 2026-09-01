// Nova Operations — assembled from records + heartbeats only, honest about
// what has never run. Temp data dir BEFORE imports.
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-ops-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { composeOps, agentReceipts, AGENT_DEPARTMENTS, AGENT_RECORD_KINDS } = await import('../lib/ops.js');
const { createRecord } = await import('../lib/inboxStore.js');
const { loadSkills } = await import('../lib/skills.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test('ops: pending gate, stream, heartbeat freshness, never-run honesty', async () => {
  await createRecord({ id: 'op111111', text: 'buy milk', source: 'voice', mode: 'review-all', status: 'pending', createdAt: new Date().toISOString(), decision: { route: 'shopping', title: 'Buy milk', confidence: 'high', payload: {} } });
  await createRecord({ id: 'op222222', kind: 'research', text: 'Research: creatine', source: 'researcher', mode: 'draft', status: 'filed', createdAt: new Date(Date.now() - 3600e3).toISOString(), filedAt: new Date().toISOString(), destination: 'Notes — Creatine', decision: { route: 'note', title: 'Creatine Brief', confidence: 'high', payload: {} } });

  await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
  await writeFile(path.join(process.env.NOVA_DATA_DIR, 'heartbeat.json'), JSON.stringify({
    dispatch: new Date().toISOString(),
    guardian: new Date(Date.now() - 5 * 24 * 3600e3).toISOString(),
  }), 'utf8');

  const ops = await composeOps();
  assert.equal(ops.pending, 1);
  assert.equal(ops.filedToday, 1);
  assert.equal(ops.stream[0].title, 'Creatine Brief', 'filed-now sorts first');
  assert.equal(ops.stream[0].status, 'filed');

  const byId = Object.fromEntries(ops.agents.map((a) => [a.id, a]));
  assert.equal(byId.dispatch.state, 'today');
  assert.equal(byId.guardian.state, 'stale');
  assert.match(byId.guardian.stateLabel, /5d ago/);
  assert.equal(byId.review.state, 'never', 'no beat = never run, said plainly');
  assert.equal(byId.review.label, 'Daily Review', 'freshness must not clobber the display name');

  const voice = ops.conversational.find((a) => a.id === 'voice');
  assert.equal(voice.last.title, 'Buy milk');
  const researcher = ops.conversational.find((a) => a.id === 'researcher');
  assert.equal(researcher.last.title, 'Creatine Brief');

  // the map drawn — every agent row carries departments + receipts
  assert.deepEqual(byId.review.departments, ['Mind']);
  assert.deepEqual(byId.reminders.departments, [], 'unmapped agent says so, no guessed list');
  assert.equal(byId.telegram.receipts, null, 'no record kinds = leaves no inbox records, not "none yet"');
  assert.deepEqual(byId.dispatch.receipts, [], 'kind mapped but nothing filed = honestly empty');
  assert.equal(researcher.receipts.length, 1);
  assert.equal(researcher.receipts[0].title, 'Creatine Brief');
  assert.equal(researcher.receipts[0].status, 'filed');
  assert.deepEqual(voice.departments, AGENT_DEPARTMENTS.voice);
});

test('ops: agentReceipts is pure — kind match, cap at 5, newest kept, null when recordless', () => {
  const mk = (i, kind, extra = {}) => ({
    id: `r${i}`, kind, status: 'filed',
    createdAt: new Date(Date.now() - i * 3600e3).toISOString(),
    decision: { title: `Review ${i}` }, ...extra,
  });
  const sorted = [0, 1, 2, 3, 4, 5, 6].map((i) => mk(i, 'review'));
  const got = agentReceipts(sorted, { id: 'review' });
  assert.equal(got.length, 5, 'capped at 5');
  assert.equal(got[0].title, 'Review 0', 'newest-first order preserved');
  assert.equal(got[4].title, 'Review 4');

  assert.deepEqual(agentReceipts(sorted, { id: 'guardian' }), [], 'mapped kind, no matches');
  assert.equal(agentReceipts(sorted, { id: 'telegram' }), null, 'recordless agent is null');

  const viaMatch = agentReceipts([mk(0, 'capture', { source: 'coach', decision: null, text: 'set logged' })],
    { id: 'coach', match: (r) => r.source === 'coach' });
  assert.equal(viaMatch[0].title, 'set logged', 'conversational match fn + text fallback title');
});

test('ops: every mapped department exists in the skill registry seed (shared contract)', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-ops-vault-'));
  try {
    const departments = new Set((await loadSkills(vault)).map((d) => d.name));
    for (const [agent, depts] of Object.entries(AGENT_DEPARTMENTS)) {
      for (const d of depts) assert.ok(departments.has(d), `${agent} -> "${d}" is not a department in the registry seed`);
    }
    for (const agent of Object.keys(AGENT_RECORD_KINDS)) {
      assert.ok(AGENT_DEPARTMENTS[agent], `${agent} files records but has no department mapping`);
    }
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test('fleet roster context: the real architecture, honestly stated', async () => {
  const { fleetRosterContext } = await import('../lib/ops.js');
  const ctx = fleetRosterContext();
  assert.match(ctx, /HOW NOVA WORKS/);
  assert.match(ctx, /Dispatch \(/);
  assert.match(ctx, /Distiller \(/);
  assert.match(ctx, /Watcher \(/, 'conversational roster derives from the real array');
  assert.match(ctx, /ONLY tested deterministic code writes/);
  assert.match(ctx, /never self-granted/);
});

// THE REGISTRY CONTRACT — the fleet roster in ops.js is the single list the
// ring, Nova's self-knowledge, and the Guardian's staleness watch all read.
// Guardian used to keep its own map of 13 loops beside a roster of 29, so
// sixteen agents could stop ticking with nothing to notice. These tests are
// what stop that list splitting in two again.
test('every scheduled agent is watched, with a real cadence', async () => {
  const { scheduledFleet, loopCadenceHours } = await import('../lib/ops.js');
  const fleet = scheduledFleet();
  const cadences = loopCadenceHours();

  assert.ok(fleet.length >= 29, 'the roster should not shrink silently');
  for (const agent of fleet) {
    assert.ok(Number.isFinite(agent.cadenceHours) && agent.cadenceHours > 0,
      `${agent.id} needs a cadence — an unwatched loop is one that can die quietly`);
    assert.equal(cadences[agent.id], agent.cadenceHours, `${agent.id} must watch at its own cadence`);
  }
  assert.equal(Object.keys(cadences).length, fleet.length, 'the watch covers the roster exactly — no more, no less');
});

test('every heartbeat a scheduler actually stamps is on the roster', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { scheduledFleet } = await import('../lib/ops.js');
  const libDir = new URL('../lib/', import.meta.url);
  const known = new Set(scheduledFleet().map((a) => a.id));

  const stamped = new Set();
  for (const f of await readdir(libDir)) {
    if (!f.endsWith('.js')) continue;
    const src = await readFile(new URL(f, libDir), 'utf8');
    for (const m of src.matchAll(/\bbeat\('([a-z-]+)'\)/g)) stamped.add(m[1]);
  }

  const unwatched = [...stamped].filter((id) => !known.has(id));
  assert.deepEqual(unwatched, [],
    `these loops beat but no one watches them: ${unwatched.join(', ')} — add them to SCHEDULED in ops.js`);
});

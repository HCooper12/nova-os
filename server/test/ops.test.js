// Nova Operations — assembled from records + heartbeats only, honest about
// what has never run. Temp data dir BEFORE imports.
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-ops-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { composeOps } = await import('../lib/ops.js');
const { createRecord } = await import('../lib/inboxStore.js');

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
});

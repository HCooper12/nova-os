// LOOK DEEPER (27 Sep 2026, the summary Inbox): a research asked FROM a card
// is that card's child. Pinned here: the route starts the real Researcher
// rails with the card's own question, the research record carries parentId,
// GET /inbox returns it (so the card can find its report), a double tap
// returns the running look instead of sending a second Researcher, and a
// missing or already-decided card is refused. A stub CLAUDE_BIN stands in
// for the CLI, so nothing here spends money or touches the network.
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-deeper-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-deeper-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

// Every prompt gets the same cited brief, a little slowly, so the record is
// still running when the route is asked a second time.
const stub = path.join(dataDir, 'claude-stub.js');
const brief = { title: 'Why the chest-supported row', body: 'The pad takes the lower back out of it [1].\n\n## Sources\n[1] A guide — https://example.com/rows' };
await writeFile(stub, `#!/usr/bin/env node
setTimeout(() => console.log(JSON.stringify({ result: ${JSON.stringify(JSON.stringify(brief))} })), 700);
`, 'utf8');
await chmod(stub, 0o755);
process.env.CLAUDE_BIN = stub;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { inboxRouter } = await import('../routes/inbox.js');
const { createRecord, getRecord } = await import('../lib/inboxStore.js');
const { deeperQuestion, deeperContext, DEEPER_QUESTION_MAX } = await import('../lib/inboxDeeper.js');

function startServer() {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api', inboxRouter(vault));
    const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/api` }));
  });
}

async function waitForSettle(id, timeoutMs = 30_000) {
  const start = Date.now();
  for (;;) {
    const r = await getRecord(id);
    if (r && r.status !== 'classifying') return r;
    if (Date.now() - start > timeoutMs) throw new Error(`record ${id} never settled`);
    await new Promise((res) => setTimeout(res, 100));
  }
}

test.after(async () => {
  await new Promise((res) => setTimeout(res, 300));
  for (const dir of [dataDir, vault]) {
    for (let i = 0; i < 4; i++) {
      try { await rm(dir, { recursive: true, force: true }); break; } catch { await new Promise((res) => setTimeout(res, 200)); }
    }
  }
});

const card = {
  id: 'card-1', kind: null, source: 'voice', status: 'pending', createdAt: '2026-09-27T09:40:00.000Z',
  text: 'Rows were rough on my lower back on Tuesday. Swap them for something kinder on Pull Day, and keep the sets.',
  decision: { route: 'routine-edit', confidence: 'high', title: 'Swap Barbell Row for Chest-Supported Row on Pull Day', reason: 'Your lower back', payload: { action: 'swap', removeName: 'Barbell Row', addName: 'Chest-Supported Row', routineName: 'Pull Day' } },
};

test('the question is the card\'s own, and never over the Researcher\'s limit', () => {
  const q = deeperQuestion(card);
  assert.match(q, /^Look deeper into this: Swap Barbell Row/);
  assert.match(q, /what he captured: "Rows were rough/);
  assert.match(q, /the reasoning for the proposed filing or change, and what the sources say\.$/);
  const long = deeperQuestion({ ...card, text: 'word '.repeat(400) });
  assert.ok(long.length <= DEEPER_QUESTION_MAX, `clamped to ${DEEPER_QUESTION_MAX}, got ${long.length}`);
  assert.match(long, /…\. Give the reasoning/, 'clamped on a word, and says so');
  const ctx = deeperContext(card);
  assert.match(ctx, /"routine-edit" route/);
  assert.match(ctx, /Chest-Supported Row/);
});

test('POST /inbox/:id/deeper starts the Researcher with parentId, and the list returns it', async (t) => {
  const { srv, base } = await startServer();
  t.after(() => srv.close());
  await createRecord({ ...card });

  const r = await fetch(`${base}/inbox/${card.id}/deeper`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.already, false);
  assert.equal(out.jobId, out.record.id, 'the job id is the research record, polled like any research');
  assert.equal(out.record.kind, 'research');
  assert.equal(out.record.parentId, card.id);
  assert.equal(out.record.status, 'classifying');
  assert.match(out.record.text, /^Research: Look deeper into this: Swap Barbell Row/);

  // a second tap while it runs gets the same look back, not a second Researcher
  const again = await (await fetch(`${base}/inbox/${card.id}/deeper`, { method: 'POST' })).json();
  assert.equal(again.already, true);
  assert.equal(again.record.id, out.record.id);

  const list = await (await fetch(`${base}/inbox`)).json();
  const children = list.items.filter((x) => x.parentId === card.id);
  assert.equal(children.length, 1, 'exactly one child in the list');

  // the report lands pending, on the same record, still carrying its parent
  const done = await waitForSettle(out.record.id);
  assert.equal(done.status, 'pending', `landed pending (error: ${done.error || 'none'})`);
  assert.equal(done.parentId, card.id);
  assert.equal(done.decision.payload.title, 'Why the chest-supported row');
  // and nothing about the card itself changed
  assert.equal((await getRecord(card.id)).status, 'pending');
});

test('a missing card is a 404, a decided one is refused, and plain research carries no parentId', async (t) => {
  const { srv, base } = await startServer();
  t.after(() => srv.close());
  const missing = await fetch(`${base}/inbox/nope/deeper`, { method: 'POST' });
  assert.equal(missing.status, 404);

  await createRecord({ ...card, id: 'card-filed', status: 'filed' });
  const filed = await fetch(`${base}/inbox/card-filed/deeper`, { method: 'POST' });
  assert.equal(filed.status, 409);

  const plain = await (await fetch(`${base}/research`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'creatine timing evidence' }) })).json();
  assert.equal('parentId' in plain.record, false, 'the shared record format is unchanged for ordinary research');
  await waitForSettle(plain.record.id);
});

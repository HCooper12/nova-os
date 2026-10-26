// GET /api/model-spend — the model board's spend, over the wire. The board
// itself (GET /api/model-prefs) already folds a 7-day spend summary into
// each lane via getModelPrefs(); this route exposes spendSummary() directly
// so a caller can ask for a different window.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-modelprefsroute-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { modelPrefsRouter } from '../routes/modelPrefs.js';
import { recordRun } from '../lib/modelSpend.js';

const SPEND = path.join(dataDir, 'model-spend.json');
const clean = () => rm(SPEND, { force: true });
test.afterEach(clean);

function startServer() {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api', modelPrefsRouter());
    const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

test('GET /api/model-spend returns spendSummary() over the default 7-day window', async (t) => {
  await clean();
  const { srv, port } = await startServer();
  t.after(() => srv.close());

  await recordRun('coach', { usd: 1.5, ms: 2000, model: 'claude-sonnet-5' });
  await recordRun('coach', { usd: 0.5, ms: 1000, model: 'claude-sonnet-5' });
  await recordRun('pulse', { usd: 0.02, ms: 500, limited: true });

  const r = await fetch(`http://127.0.0.1:${port}/api/model-spend`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.coach.runs, 2);
  assert.equal(body.coach.usd, 2);
  assert.equal(body.pulse.runs, 1);
  assert.equal(body.pulse.limitHits, 1);
});

test('GET /api/model-spend?days=N respects a custom window', async (t) => {
  await clean();
  const { srv, port } = await startServer();
  t.after(() => srv.close());

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  await recordRun('coach', { usd: 1, now: now - 10 * day }); // outside a 1-day window
  await recordRun('coach', { usd: 2, now });

  const wide = await (await fetch(`http://127.0.0.1:${port}/api/model-spend?days=30`)).json();
  assert.equal(wide.coach.runs, 2);
  assert.equal(wide.coach.usd, 3);

  const narrow = await (await fetch(`http://127.0.0.1:${port}/api/model-spend?days=1`)).json();
  assert.equal(narrow.coach.runs, 1);
  assert.equal(narrow.coach.usd, 2);
});

test('GET /api/model-spend with a junk days value falls back to the default window rather than erroring', async (t) => {
  await clean();
  const { srv, port } = await startServer();
  t.after(() => srv.close());

  await recordRun('coach', { usd: 1 });
  const r = await fetch(`http://127.0.0.1:${port}/api/model-spend?days=not-a-number`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.coach.runs, 1);
});

test('GET /api/model-prefs still folds the same spend numbers into each lane', async (t) => {
  await clean();
  const { srv, port } = await startServer();
  t.after(() => srv.close());

  await recordRun('coach', { usd: 0.75, model: 'claude-sonnet-5' });
  const r = await fetch(`http://127.0.0.1:${port}/api/model-prefs`);
  assert.equal(r.status, 200);
  const board = await r.json();
  const coach = board.lanes.find((l) => l.id === 'coach');
  assert.equal(coach.spend.runs, 1);
  assert.equal(coach.spend.usd, 0.75);
});

// PUT /api/model-prefs/local (27 Oct 2026): local first and the model pick
test('PUT /api/model-prefs/local sets local first and the model, returns the board, and refuses junk with a 400', async (t) => {
  const { rm: rmFile } = await import('node:fs/promises');
  const PREFS = path.join(dataDir, 'model-prefs.json');
  await rmFile(PREFS, { force: true });
  const { srv, port } = await startServer();
  t.after(() => srv.close());
  const put = (body) => fetch(`http://127.0.0.1:${port}/api/model-prefs/local`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  let r = await put({ first: false });
  assert.equal(r.status, 200);
  let board = await r.json();
  assert.equal(board.local.first, false);
  assert.equal(board.lanes.find((l) => l.id === 'inbox-classify').provider, 'claude');

  r = await put({ first: true, model: 'qwen3.5:4b' });
  board = await r.json();
  assert.equal(board.local.first, true);
  assert.equal(board.local.preferredModel, 'qwen3.5:4b');
  assert.equal(board.lanes.find((l) => l.id === 'inbox-classify').provider, 'local');

  r = await put({});
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /send first, model, or both/);
  r = await put({ first: 'sometimes' });
  assert.equal(r.status, 400);
  r = await put({ model: '../../etc/passwd' });
  assert.equal(r.status, 400);

  await put({ model: null });
  await rmFile(PREFS, { force: true });
});

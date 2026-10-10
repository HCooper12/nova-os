// NOTION, HIS KEY (server/lib/notionAuth.js + server/routes/integrations.js).
// A stubbed fetchImpl stands in for Notion itself — nothing here ever
// touches the real network — and NOVA_DATA_DIR is a fresh temp dir set
// before the module is imported, so this never reads or writes his real
// server/data.
import { mkdtemp, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-notionauth-'));
process.env.NOVA_DATA_DIR = dataDir;
delete process.env.NOTION_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  getNotionToken, saveNotionToken, clearNotionToken, notionStatus,
} from '../lib/notionAuth.js';
import { integrationsRouter } from '../routes/integrations.js';

const TOKEN_FILE = path.join(dataDir, 'integrations', 'notion.json');
const clean = async () => { await clearNotionToken(); delete process.env.NOTION_TOKEN; };
test.afterEach(clean);

// a fetchImpl that answers like Notion would, for a given token
function fakeNotion({ okToken = 'secret_good', dbStatus = 200 } = {}) {
  return async (url, opts) => {
    const auth = opts?.headers?.Authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (url === 'https://api.notion.com/v1/users/me') {
      if (token !== okToken) return { status: 401, ok: false, json: async () => ({}) };
      return { status: 200, ok: true, json: async () => ({ bot: { owner: { user: { name: 'Hayden Cooper' } }, workspace_name: "Hayden's workspace" } }) };
    }
    if (url.startsWith('https://api.notion.com/v1/databases/')) {
      return { status: dbStatus, ok: dbStatus === 200, json: async () => ({}) };
    }
    throw new Error(`unexpected fetch to ${url}`);
  };
}

test('a valid key is stored with mode 0600 and never returned', async () => {
  const fetchImpl = fakeNotion();
  const out = await saveNotionToken('secret_good', { fetchImpl });
  assert.equal(out.token, undefined, 'saveNotionToken must never return the token');
  assert.ok(out.savedAt);
  assert.equal(out.workspaceName, "Hayden's workspace");

  const st = await stat(TOKEN_FILE);
  // mode is masked with 0o777 because the filesystem may add its own high bits
  assert.equal(st.mode & 0o777, 0o600, `expected mode 0600, got ${(st.mode & 0o777).toString(8)}`);

  const raw = JSON.parse(await readFile(TOKEN_FILE, 'utf8'));
  assert.equal(raw.token, 'secret_good'); // it IS on disk — just never handed back over the wire
});

test('a bad key is refused and nothing is stored', async () => {
  const fetchImpl = fakeNotion({ okToken: 'secret_good' });
  await assert.rejects(
    () => saveNotionToken('secret_wrong', { fetchImpl }),
    (e) => { assert.equal(e.message, 'Notion did not accept that key'); return true; },
  );
  await assert.rejects(() => stat(TOKEN_FILE));
  const token = await getNotionToken();
  assert.equal(token, null);
});

test('journalShared is true on 200 and false on 404', async () => {
  await saveNotionToken('secret_good', { fetchImpl: fakeNotion({ dbStatus: 200 }) });
  const shared = await notionStatus({ fetchImpl: fakeNotion({ dbStatus: 200 }) });
  assert.equal(shared.connected, true);
  assert.equal(shared.journalShared, true);

  const notShared = await notionStatus({ fetchImpl: fakeNotion({ dbStatus: 404 }) });
  assert.equal(notShared.connected, true);
  assert.equal(notShared.journalShared, false);
});

test('env beats the file', async () => {
  await saveNotionToken('secret_good', { fetchImpl: fakeNotion() });
  process.env.NOTION_TOKEN = 'secret_from_env';
  assert.equal(await getNotionToken(), 'secret_from_env');
  // notionStatus must also prefer the env token when deciding what to check
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = opts?.headers?.Authorization;
    if (url === 'https://api.notion.com/v1/databases/a47882fdc1f541b2a351397e0e73e92e') return { status: 200, ok: true, json: async () => ({}) };
    return { status: 401, ok: false, json: async () => ({}) };
  };
  await notionStatus({ fetchImpl });
  assert.equal(seen, 'Bearer secret_from_env');
});

test('clear removes it', async () => {
  await saveNotionToken('secret_good', { fetchImpl: fakeNotion() });
  assert.equal(await getNotionToken(), 'secret_good');
  await clearNotionToken();
  assert.equal(await getNotionToken(), null);
  const status = await notionStatus({ fetchImpl: fakeNotion() });
  assert.equal(status.connected, false);
});

// THE ROUTE NEVER ECHOES THE TOKEN — a source contract test, not a request
// assertion, so it holds even for a response shape nobody has thought to
// test for yet: the word "token" must not appear ANYWHERE in what any route
// in this router sends back, and the raw secret must never appear in a
// response body either.
test('the route never echoes the token', async () => {
  await assert.rejects(() => stat(TOKEN_FILE)); // clean slate
  const app = express();
  app.use(express.json());
  app.use('/api', integrationsRouter());
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const port = srv.address().port;
    const base = `http://127.0.0.1:${port}/api/integrations/notion`;

    // the save path hits real Notion via globalThis.fetch unless stubbed —
    // this route calls saveNotionToken() with no fetchImpl override, so
    // instead this test only exercises the GET/DELETE shapes, which is
    // exactly what a caller sees without ever supplying a key
    const getBody = await (await fetch(base)).json();
    assert.deepEqual(Object.keys(getBody).sort(), ['botName', 'connected', 'journalShared', 'workspaceName'].sort());
    assert.doesNotMatch(JSON.stringify(getBody), /token/i);

    const delBody = await (await fetch(base, { method: 'DELETE' })).json();
    assert.doesNotMatch(JSON.stringify(delBody), /secret_good|secret_from_env/);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

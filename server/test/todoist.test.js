// Todoist sync — stub API server + temp dirs BEFORE imports (ESM hoisting).
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-td-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-td-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
process.env.TODOIST_TOKEN = 'test-token';

// In-memory Todoist: active tasks + a call log the assertions read.
const stub = {
  tasks: [], // {id, content}
  nextId: 100,
  calls: [],
  // what GET /tasks/:id says about a task that left the active list — the
  // real API answers 200 for completed AND deleted tasks (probed 2 Sep 2026)
  fates: {}, // id -> { checked, is_deleted }
};
const server = http.createServer((req, res) => {
  stub.calls.push(`${req.method} ${req.url}`);
  if (req.headers.authorization !== 'Bearer test-token') {
    res.writeHead(401).end(JSON.stringify({ error: 'bad token' }));
    return;
  }
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body)); };
  // unified-v1 shapes: list endpoints wrap results and paginate by cursor
  if (req.method === 'GET' && req.url === '/projects') return send(200, { results: [{ id: 'p1', name: 'Inbox', inbox_project: true }], next_cursor: null });
  if (req.method === 'GET' && req.url.startsWith('/tasks?')) return send(200, { results: stub.tasks.map((t) => ({ ...t, checked: false })), next_cursor: null });
  if (req.method === 'POST' && req.url === '/tasks') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { content } = JSON.parse(body);
      const task = { id: String(stub.nextId++), content };
      stub.tasks.push(task);
      send(200, task);
    });
    return;
  }
  const close = req.url.match(/^\/tasks\/([^/]+)\/close$/);
  if (req.method === 'POST' && close) {
    stub.tasks = stub.tasks.filter((t) => String(t.id) !== close[1]);
    return send(204);
  }
  const byId = req.url.match(/^\/tasks\/([^/?]+)$/);
  if (req.method === 'GET' && byId) {
    const live = stub.tasks.find((t) => String(t.id) === byId[1]);
    if (live) return send(200, { ...live, checked: false, is_deleted: false });
    const fate = stub.fates[byId[1]];
    return fate ? send(200, { id: byId[1], content: '?', ...fate }) : send(404, { error: 'not found' });
  }
  send(404, { error: 'unknown ' + req.url });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.NOVA_TODOIST_API = `http://127.0.0.1:${server.address().port}`;

import test from 'node:test';
import assert from 'node:assert/strict';

const { syncTodoist, getTodoistStatus, todoistConfigured } = await import('../lib/todoistSync.js');

const TODO_PATH = path.join(vault, 'Wiki/Inbox/To-Do.md');

test.after(async () => {
  server.close();
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('first sync: pushes vault items, pulls todoist items, links identical ones without duplicating', async () => {
  await mkdir(path.dirname(TODO_PATH), { recursive: true });
  await writeFile(TODO_PATH, [
    '---', 'type: raw', '---', '# To-Do', '',
    '- [ ] Book dentist _(added 2026-07-10)_',
    '- [ ] Buy stamps _(added 2026-07-12)_',
    '- [x] Old done thing _(added 2026-07-01)_',
    '',
  ].join('\n'), 'utf8');
  stub.tasks = [
    { id: 't1', content: 'Buy stamps' }, // identical on both sides — must link, not duplicate
    { id: 't2', content: 'Call the bank' }, // todoist-only — must land in the vault
  ];

  const result = await syncTodoist(vault);
  assert.equal(result.configured, true);
  assert.equal(result.error, null);
  assert.equal(result.pushed, 1); // Book dentist
  assert.equal(result.pulled, 1); // Call the bank

  const raw = await readFile(TODO_PATH, 'utf8');
  assert.match(raw, /- \[ \] Call the bank _\(added /);
  assert.equal(stub.tasks.filter((t) => t.content === 'Buy stamps').length, 1, 'no duplicate created');
  assert.ok(stub.tasks.some((t) => t.content === 'Book dentist'));

  const status = await getTodoistStatus();
  assert.equal(status.configured, true);
  assert.equal(status.linkCount, 3);
});

test('completing in Todoist checks the vault line; checking in the vault closes the task', async () => {
  // complete "Buy stamps" in Todoist (task vanishes from active; reads back checked)
  stub.tasks = stub.tasks.filter((t) => t.content !== 'Buy stamps');
  stub.fates.t1 = { checked: true, is_deleted: false };
  // check off "Call the bank" in the vault
  let raw = await readFile(TODO_PATH, 'utf8');
  raw = raw.replace('- [ ] Call the bank', '- [x] Call the bank');
  await writeFile(TODO_PATH, raw, 'utf8');

  const result = await syncTodoist(vault);
  assert.equal(result.error, null);
  assert.equal(result.checkedInVault, 1);
  assert.equal(result.closedInTodoist, 1);

  raw = await readFile(TODO_PATH, 'utf8');
  assert.match(raw, /- \[x\] Buy stamps/);
  assert.ok(!stub.tasks.some((t) => t.content === 'Call the bank'), 'closed in Todoist');
  assert.ok(stub.tasks.some((t) => t.content === 'Book dentist'), 'untouched pair survives');

  // resolved pairs drop their links; only Book dentist remains linked
  const status = await getTodoistStatus();
  assert.equal(status.linkCount, 1);
});

test('a vault line that vanishes (undo) closes its task instead of deleting anything', async () => {
  let raw = await readFile(TODO_PATH, 'utf8');
  raw = raw.split('\n').filter((l) => !l.includes('Book dentist')).join('\n');
  await writeFile(TODO_PATH, raw, 'utf8');

  const result = await syncTodoist(vault);
  assert.equal(result.closedInTodoist, 1);
  assert.equal((await getTodoistStatus()).linkCount, 0);
});

test('without a token the sync is a clean no-op', async () => {
  const saved = process.env.TODOIST_TOKEN;
  process.env.TODOIST_TOKEN = '';
  const before = stub.calls.length;
  assert.equal(todoistConfigured(), false);
  assert.deepEqual(await syncTodoist(vault), { configured: false });
  assert.equal(stub.calls.length, before, 'no network traffic');
  process.env.TODOIST_TOKEN = saved;
});

// ---- audit [42]: deleted is not completed -----------------------------------

test('a task HE DELETED in Todoist leaves its vault line open, is not pushed back, and is named in the result', async () => {
  await writeFile(TODO_PATH, [
    '---', 'type: raw', '---', '# To-Do', '',
    '- [ ] Renew passport _(added 2026-08-30)_',
    '- [ ] Fix the gate _(added 2026-08-30)_',
    '',
  ].join('\n'), 'utf8');
  stub.tasks = [];
  stub.fates = {};
  let r = await syncTodoist(vault);
  assert.equal(r.pushed, 2);
  const passport = stub.tasks.find((t) => t.content === 'Renew passport');
  const gate = stub.tasks.find((t) => t.content === 'Fix the gate');

  // he deletes one in Todoist and completes the other
  stub.tasks = [];
  stub.fates[passport.id] = { checked: false, is_deleted: true };
  stub.fates[gate.id] = { checked: true, is_deleted: false };
  r = await syncTodoist(vault);
  assert.equal(r.error, null);
  assert.equal(r.deletedInTodoist, 1);
  assert.equal(r.checkedInVault, 1, 'the completed one is checked as before');
  assert.equal(r.pushed, 0, 'the deleted one is NOT pushed straight back');
  assert.equal(r.note, '1 task deleted in Todoist — its line stays open in the vault');
  let raw = await readFile(TODO_PATH, 'utf8');
  assert.match(raw, /- \[ \] Renew passport/, 'his deletion is not a completion');
  assert.match(raw, /- \[x\] Fix the gate/);
  assert.equal((await getTodoistStatus()).heldBackCount, 1);

  // and it stays held back on the next pass too — deleting a task once must
  // not turn into a daily fight with the sync
  const postsBefore = stub.calls.filter((c) => c === 'POST /tasks').length;
  r = await syncTodoist(vault);
  assert.equal(r.pushed, 0);
  assert.equal(stub.calls.filter((c) => c === 'POST /tasks').length, postsBefore);
  assert.ok(!stub.tasks.some((t) => t.content === 'Renew passport'));

  // checking the line off in the vault releases the hold
  raw = raw.replace('- [ ] Renew passport', '- [x] Renew passport');
  await writeFile(TODO_PATH, raw, 'utf8');
  r = await syncTodoist(vault);
  assert.equal((await getTodoistStatus()).heldBackCount, 0);
  assert.equal(r.note, null);
});

test('a task MOVED to another project keeps its pair: the line is neither checked nor duplicated', async () => {
  await writeFile(TODO_PATH, ['---', 'type: raw', '---', '# To-Do', '', '- [ ] Plan the trip _(added 2026-09-01)_', ''].join('\n'), 'utf8');
  stub.tasks = [];
  stub.fates = {};
  let r = await syncTodoist(vault);
  assert.equal(r.pushed, 1);
  const trip = stub.tasks.find((t) => t.content === 'Plan the trip');
  // moved out of the Inbox: not in the project's active list, but alive
  stub.tasks = [];
  stub.fates[trip.id] = { checked: false, is_deleted: false };
  r = await syncTodoist(vault);
  assert.equal(r.movedInTodoist, 1);
  assert.equal(r.pushed, 0, 'not duplicated back into the Inbox');
  assert.equal(r.checkedInVault, 0);
  assert.match(await readFile(TODO_PATH, 'utf8'), /- \[ \] Plan the trip/);
  assert.equal((await getTodoistStatus()).linkCount, 1, 'the pair survives');
});

test('when the API cannot say, the old behaviour stands: the line is checked', async () => {
  await writeFile(TODO_PATH, ['---', 'type: raw', '---', '# To-Do', '', '- [ ] Water the ferns _(added 2026-09-01)_', ''].join('\n'), 'utf8');
  stub.tasks = [];
  stub.fates = {};
  await syncTodoist(vault);
  stub.tasks = []; // vanished, and GET /tasks/:id answers 404
  const r = await syncTodoist(vault);
  assert.equal(r.checkedInVault, 1);
  assert.equal(r.deletedInTodoist, 0);
});

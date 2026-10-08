// THE LEADER'S KEPT CONVERSATION AND ITS SEEN MARK — Blend 1, 9 Oct 2026.
// His rule: "Unread replies from the leader should jump to the top." The
// page needs a reply that knows whether he has opened it, kept server-side
// so it survives a reload; one write, idempotent, no model. Also pinned: the
// whole picture the strip draws, the open question, Still open on the rails.
//
// NOVA_DATA_DIR is a temp dir, set BEFORE any import (memory:
// nova-test-data-isolation).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'nova-leader-thread-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { appendThread, readThread, markReplySeen, newestReply, threadEntry } = await import('../lib/leaderThread.js');
const { applyLeaderReflection, undoLeaderReflection, readLeaderState, situationOf, openQuestion } = await import('../lib/leader.js');
const { leaderRouter } = await import('../routes/leader.js');
const { listRecords, createRecord } = await import('../lib/inboxStore.js');

const app = express();
app.use(express.json());
app.use('/api', leaderRouter(dataDir));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
test.after(() => server.close());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a turn is kept: his line with the item he quoted, the reply unread', async () => {
  const mine = await appendThread({ who: 'you', text: 'How do I do that?', sessionId: 's1', quote: { kind: 'idea', title: 'Close the loop', label: "today's idea" } });
  const reply = await appendThread({ who: 'leader', text: 'Make the read-back someone else’s job.', sessionId: 's1', consult: [{ agent: 'librarian', question: 'q', ms: 5000, ok: true, answer: 'a' }] });
  assert.equal(mine.quote.title, 'Close the loop');
  assert.equal(mine.quote.label, "today's idea");
  assert.equal('seenAt' in mine, false, 'his own line is never unread');
  assert.equal(reply.seenAt, null);
  assert.equal(reply.consult[0].agent, 'librarian');
  const items = await readThread();
  assert.equal(items.length, 2);
  assert.equal(newestReply(items).id, reply.id);
});

test('the seen mark is one write, and a second mark writes nothing', async () => {
  const reply = newestReply(await readThread());
  const first = await markReplySeen(reply.id, new Date('2026-10-09T08:00:00Z'));
  assert.equal(first.wrote, true);
  assert.equal(first.entry.seenAt, '2026-10-09T08:00:00.000Z');
  const second = await markReplySeen(reply.id, new Date('2026-10-09T09:00:00Z'));
  assert.equal(second.wrote, false);
  assert.equal(second.entry.seenAt, '2026-10-09T08:00:00.000Z', 'the first stamp stands');
  // and it is a receipt, not a decision: nothing reached the Inbox
  assert.equal((await listRecords()).filter((r) => /seen/i.test(r.kind || '')).length, 0);
});

test('only a Leader reply can be marked seen; an unknown id is a 404', async () => {
  const mine = (await readThread()).find((x) => x.who === 'you');
  await assert.rejects(markReplySeen(mine.id), /only a Leader reply/);
  const r = await post('/leader/seen', { id: 'nope' });
  assert.equal(r.status, 404);
  assert.equal((await post('/leader/seen', {})).status, 400);
});

test('POST /leader/seen is idempotent over the wire', async () => {
  const reply = await appendThread({ who: 'leader', text: 'Second reply.', sessionId: 's1' });
  const a = await (await post('/leader/seen', { id: reply.id })).json();
  const b = await (await post('/leader/seen', { id: reply.id })).json();
  assert.equal(a.wrote, true);
  assert.equal(b.wrote, false);
  assert.equal(a.seenAt, b.seenAt);
});

test('a turn needs words and a speaker', () => {
  assert.throws(() => threadEntry({ who: 'nova', text: 'x' }));
  assert.throws(() => threadEntry({ who: 'you', text: '   ' }));
});

test('set down returns what it did and the receipt that undoes it', async () => {
  await applyLeaderReflection({ struggles: ['Two leads disagree about the booking process', 'The rota is mine alone'], working: ['Decisions in writing'] });
  const out = await applyLeaderReflection({ resolved: ['Two leads disagree'] });
  assert.deepEqual(out.added.resolved, ['Two leads disagree about the booking process']);
  assert.ok(out.receiptId, 'a receipt id comes back');
  const rec = (await listRecords()).find((r) => r.id === out.receiptId);
  assert.equal(rec.kind, 'leader-reflect');
  assert.equal(rec.undoData.route, 'leader-reflect');
  assert.ok(Array.isArray(out.struggles), 'the profile is still there for old readers');
});

test('Still open stamps checkedAt on the rails, counts as word from him, and undoes exactly', async () => {
  const before = (await readLeaderState()).profile.struggles.find((s) => s.text === 'The rota is mine alone');
  assert.equal(before.checkedAt, undefined);
  const out = await applyLeaderReflection({ checked: ['The rota is mine alone'] });
  assert.equal(out.added.checked.length, 1);
  assert.equal(out.added.checked[0].prev, null);
  const rec = (await listRecords()).find((r) => r.id === out.receiptId);
  assert.match(rec.text, /still open/);
  const s = await readLeaderState();
  const hit = s.profile.struggles.find((x) => x.text === 'The rota is mine alone');
  assert.ok(hit.checkedAt);
  // a check today is word from him: the picture is no longer quiet
  const sit = situationOf(s, new Date(new Date(hit.checkedAt).getTime() + 60_000));
  assert.equal(sit.daysSinceUpdate, 0);
  await undoLeaderReflection(out.added);
  const after = (await readLeaderState()).profile.struggles.find((x) => x.text === 'The rota is mine alone');
  assert.equal(after.checkedAt, undefined, 'the undo puts back what was there');
});

test('the open question: the pending follow-up first, answered once he answers after it', async () => {
  const state = await readLeaderState();
  const asked = { id: 'fu1', kind: 'leader-followup', status: 'pending', createdAt: '2026-10-03T08:00:00.000Z', text: 'Where does this stand now — "The rota is mine alone"?' };
  const q = openQuestion(state, [asked]);
  assert.equal(q.source, 'followup');
  assert.equal(q.open, true);
  assert.equal(q.about, 'The rota is mine alone', 'the thing it names, when code can tell');
  const answered = openQuestion({ ...state, lastAnswer: { at: '2026-10-04T08:00:00.000Z' } }, [asked]);
  assert.equal(answered.open, false);
  // an answer from before it was asked does not answer it
  assert.equal(openQuestion({ ...state, lastAnswer: { at: '2026-10-01T08:00:00.000Z' } }, [asked]).open, true);
  // a filed or discarded follow-up is not waiting
  assert.equal(openQuestion({ ...state, daily: [] }, [{ ...asked, status: 'discarded' }]), null);
  // a model question names nothing code can find: no bead is lit
  assert.equal(openQuestion(state, [{ ...asked, text: 'How did the week go?' }]).about, null);
});

test('GET /leader sends the whole picture, the question and the kept thread', async () => {
  for (let i = 0; i < 9; i++) await applyLeaderReflection({ struggles: [`Open thing number ${i}`] });
  await createRecord({ id: 'fu2', kind: 'leader-followup', status: 'pending', createdAt: new Date().toISOString(), text: 'Where does it stand?', source: 'nova', mode: 'draft' });
  const L = await (await fetch(base + '/leader')).json();
  const open = (await readLeaderState()).profile.struggles.filter((s) => !s.resolvedAt).length;
  assert.equal(L.picture.open.length, open, 'every open thing, not the newest eight');
  assert.ok(open > 8);
  assert.equal(L.profile.struggles.length, 8, 'the old shape is unchanged for its readers');
  assert.equal(L.picture.resolvedCount, 1);
  assert.equal(L.picture.resolved[0].text, 'Two leads disagree about the booking process');
  assert.equal(L.picture.lastToldDays, 0);
  assert.equal(L.question.text, 'Where does it stand?');
  assert.equal(L.question.open, true);
  assert.ok(L.thread.some((x) => x.who === 'leader' && x.seenAt), 'a seen reply carries its stamp');
  assert.ok(L.thread.some((x) => x.who === 'you' && x.quote), 'his line keeps the item he quoted');
});

test('POST /leader/reflect returns its receipt and keeps the old profile key', async () => {
  const r = await (await post('/leader/reflect', { checked: ['Open thing number 3'] })).json();
  assert.equal(r.ok, true);
  assert.ok(r.receiptId);
  assert.equal(r.added.checked[0].text, 'Open thing number 3');
  assert.ok(Array.isArray(r.profile.struggles));
});

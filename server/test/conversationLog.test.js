// The conversation record: every spoken exchange with Nova, from every door.
// The contract his 25 Sep ask set: what he says is never lost from the
// record, an edited line never duplicates, and Nova can read it back.
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-conversation-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { normaliseTurn, appendTurns, readTurns, recentConversationBlock } = await import('../lib/conversationLog.js');

const DIR = path.join(dataDir, 'conversation');
test.afterEach(() => rm(DIR, { recursive: true, force: true }));

const NOW = new Date('2026-09-25T04:30:00Z');

test('normaliseTurn keeps what was said and refuses what was not', () => {
  const ok = normaliseTurn({ id: 'mac-1727238000000-you', at: '2026-09-25T04:22:00Z', who: 'you', text: '  how did I sleep  ', via: 'presence', device: 'iPhone' }, NOW);
  assert.deepEqual(ok, { id: 'mac-1727238000000-you', at: '2026-09-25T04:22:00.000Z', who: 'you', text: 'how did I sleep', via: 'presence', device: 'iPhone' });
  assert.equal(normaliseTurn({ who: 'you', text: '   ' }, NOW), null, 'nothing said is not a turn');
  assert.equal(normaliseTurn({ who: 'robot', text: 'hi' }, NOW), null, 'only you / nova / system');
  assert.equal(normaliseTurn(null, NOW), null);
  // a missing or unusable id is minted, never dropped: the words matter more
  assert.match(normaliseTurn({ who: 'you', text: 'hi', id: 'x' }, NOW).id, /^srv-/);
  // a clock a year ahead is corrected to now; a bad via becomes 'app'
  const odd = normaliseTurn({ who: 'nova', text: 'ok', at: '2027-09-25T00:00:00Z', via: 'DROP TABLE' }, NOW);
  assert.equal(odd.at, NOW.toISOString());
  assert.equal(odd.via, 'app');
});

test('appended turns read back oldest first, across months', async () => {
  await appendTurns([
    { id: 'dev-aaaaaa-1', at: '2026-08-31T23:59:00Z', who: 'you', text: 'august question' },
    { id: 'dev-aaaaaa-2', at: '2026-09-01T00:01:00Z', who: 'nova', text: 'september answer' },
  ], { now: NOW });
  const files = (await import('node:fs/promises')).readdir(DIR);
  assert.deepEqual((await files).sort(), ['2026-08.jsonl', '2026-09.jsonl']);
  const rows = await readTurns({ limit: 10 });
  assert.deepEqual(rows.map((r) => r.text), ['august question', 'september answer']);
});

test('an edited line keeps its place and never duplicates', async () => {
  await appendTurns([{ id: 'dev-bbbbbb-1', at: '2026-09-25T04:00:00Z', who: 'nova', text: 'Researching now…' }], { now: NOW });
  await appendTurns([{ id: 'dev-bbbbbb-2', at: '2026-09-25T04:01:00Z', who: 'you', text: 'thanks' }], { now: NOW });
  // the same id again, later, with the settled text (and a later clock)
  await appendTurns([{ id: 'dev-bbbbbb-1', at: '2026-09-25T04:05:00Z', who: 'nova', text: 'Understood — answering it instead.' }], { now: NOW });
  const rows = await readTurns({ limit: 10 });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.text), ['Understood — answering it instead.', 'thanks']);
  assert.equal(rows[0].at, '2026-09-25T04:00:00.000Z', 'kept at the first version\'s time');
});

test('concurrent writers never lose a line', async () => {
  const writes = Array.from({ length: 30 }, (_, i) => appendTurns([{ id: `dev-cccccc-${i}`, at: new Date(NOW.getTime() - (30 - i) * 1000).toISOString(), who: i % 2 ? 'nova' : 'you', text: `line ${i}` }], { now: NOW }));
  await Promise.all(writes);
  const rows = await readTurns({ limit: 100 });
  assert.equal(rows.length, 30);
});

test('a torn line costs one row, never the record', async () => {
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, '2026-09.jsonl'),
    `${JSON.stringify({ id: 'dev-dddddd-1', at: '2026-09-25T01:00:00Z', who: 'you', text: 'first' })}\n{"id":"dev-dd\n${JSON.stringify({ id: 'dev-dddddd-3', at: '2026-09-25T01:02:00Z', who: 'nova', text: 'third' })}\n`);
  const rows = await readTurns({ limit: 10 });
  assert.deepEqual(rows.map((r) => r.text), ['first', 'third']);
});

test('since, before and limit bound the read', async () => {
  await appendTurns(Array.from({ length: 6 }, (_, i) => ({ id: `dev-eeeeee-${i}`, at: `2026-09-2${i}T10:00:00Z`, who: 'you', text: `day ${i}` })), { now: NOW });
  assert.deepEqual((await readTurns({ limit: 2 })).map((r) => r.text), ['day 4', 'day 5']);
  assert.deepEqual((await readTurns({ limit: 10, since: '2026-09-23T00:00:00Z' })).map((r) => r.text), ['day 3', 'day 4', 'day 5']);
  assert.deepEqual((await readTurns({ limit: 10, before: '2026-09-22T00:00:00Z' })).map((r) => r.text), ['day 0', 'day 1']);
});

test('the context block names who said what, where, and keeps the newest under the budget', async () => {
  await appendTurns([
    { id: 'dev-ffffff-1', at: '2026-09-24T11:00:00Z', who: 'you', text: 'what should I eat before push day', via: 'siri' },
    { id: 'dev-ffffff-2', at: '2026-09-24T11:00:05Z', who: 'nova', text: 'Rice and chicken two hours out.', via: 'siri' },
    { id: 'dev-ffffff-3', at: '2026-09-25T04:22:00Z', who: 'system', text: "That didn't get an answer: timed out", via: 'presence', device: 'iPhone' },
  ], { now: NOW });
  const block = await recentConversationBlock({ now: NOW });
  assert.match(block, /FROM THE RECORD/);
  assert.match(block, /Siri\] He: what should I eat before push day/);
  assert.match(block, /Siri\] You: Rice and chicken/);
  assert.match(block, /the Nova icon, iPhone\] System: That didn't get an answer/);
  // a tiny budget keeps the newest line, not the oldest
  const tight = await recentConversationBlock({ now: NOW, maxChars: 120 });
  assert.match(tight, /System: That didn't get an answer/);
  assert.doesNotMatch(tight, /what should I eat/);
  // a week back and nothing said: no section at all, never an empty header
  await rm(DIR, { recursive: true, force: true });
  assert.equal(await recentConversationBlock({ now: NOW }), null);
});

test('the file on disk is append-only JSON lines', async () => {
  await appendTurns([{ id: 'dev-gggggg-1', at: '2026-09-25T02:00:00Z', who: 'you', text: 'one' }], { now: NOW });
  await appendTurns([{ id: 'dev-gggggg-1', at: '2026-09-25T02:00:00Z', who: 'you', text: 'one, edited' }], { now: NOW });
  const raw = (await readFile(path.join(DIR, '2026-09.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(raw.length, 2, 'the edit is a new line; nothing is rewritten');
});

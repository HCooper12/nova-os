// The voice chat <-> the conversation record (src/conversationSync.js).
// His 25 Sep ask: what he says to Nova always appears in the voice chat as a
// record. These pin the two directions: every settled line goes up exactly
// once per wording, and the record's lines come down without disturbing the
// ones the chat already holds.
import test from 'node:test';
import assert from 'node:assert/strict';

const { deviceName, deviceId, cidOf, textKey, pendingTurns, mergeRecord, whereLabel } = await import('../../src/conversationSync.js');

const DEV = 'abc12345';

test('deviceName reads the four real user agents', () => {
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15'), 'iPhone');
  assert.equal(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'), 'Mac');
  assert.equal(deviceName('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'iPad');
  assert.equal(deviceName(''), '');
});

test('deviceId is made once and kept', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const a = deviceId(storage);
  assert.match(a, /^[a-z0-9]{6,16}$/);
  assert.equal(deviceId(storage), a);
  // storage that throws (private mode) still yields an id, never a crash
  assert.equal(deviceId({ getItem: () => { throw new Error('denied'); } }), 'nostore0');
});

test('his question is pending the moment it is in the chat; a streaming reply is not', () => {
  const chat = [
    { at: 1000, who: 'you', text: 'how did I sleep', via: 'presence' },
    { at: 1001, who: 'nova', text: 'Seven', streaming: true },
    { at: 1002, who: 'nova', text: '', typing: true },
    { who: 'nova', text: 'demo line with no clock' },
  ];
  const up = pendingTurns(chat, {}, { dev: DEV, device: 'iPhone' });
  assert.equal(up.length, 1);
  assert.deepEqual(up[0], { id: `${DEV}-1000-you`, at: new Date(1000).toISOString(), who: 'you', text: 'how did I sleep', via: 'presence', device: 'iPhone' });
});

test('a line goes up once per wording: sent is remembered, an edit goes again', () => {
  const chat = [{ at: 2000, who: 'nova', text: 'Researching now…' }];
  const first = pendingTurns(chat, {}, { dev: DEV });
  assert.equal(first.length, 1);
  assert.equal(first[0].via, 'voice', 'a line with no door named came from the Voice screen');
  const synced = { [first[0].id]: textKey('Researching now…') };
  assert.equal(pendingTurns(chat, synced, { dev: DEV }).length, 0);
  const edited = [{ at: 2000, who: 'nova', text: 'Understood — answering it instead.' }];
  const again = pendingTurns(edited, synced, { dev: DEV });
  assert.equal(again.length, 1);
  assert.equal(again[0].id, first[0].id, 'same line, same id: the record collapses it');
});

test('the record merges in what the chat lacks, in time order, and leaves its own lines alone', () => {
  const local = [
    { at: 1000, who: 'you', text: 'local question', panel: { kind: 'x' } },
    { at: 3000, who: 'nova', text: 'local answer' },
  ];
  const turns = [
    { id: `${DEV}-1000-you`, at: new Date(1000).toISOString(), who: 'you', text: 'local question' }, // already here
    { id: 'other-2000-you', at: new Date(2000).toISOString(), who: 'you', text: 'said to Siri', via: 'siri' },
    { id: 'other-4000-nova', at: new Date(4000).toISOString(), who: 'nova', text: 'from the Mac', device: 'Mac' },
    { id: 'bad', at: 'not a date', who: 'you', text: 'x' },
  ];
  const merged = mergeRecord(local, turns, { dev: DEV });
  assert.deepEqual(merged.map((m) => m.text), ['local question', 'said to Siri', 'local answer', 'from the Mac']);
  assert.equal(merged[0].panel.kind, 'x', 'the local line with its panel is kept, not replaced by the plain record copy');
  assert.equal(merged[1].cid, 'other-2000-you');
  // merged lines are never sent back up: their id is their record id
  const synced = Object.fromEntries(merged.filter((m) => m.fromRecord).map((m) => [cidOf(m, DEV), textKey(m.text)]));
  assert.deepEqual(pendingTurns(merged.filter((m) => m.fromRecord), synced, { dev: DEV }), []);
  // nothing new: the same array comes back, so no state change and no re-render
  assert.equal(mergeRecord(local, [], { dev: DEV }), local);
});

test('whereLabel names another door or device, and stays quiet for his own screen', () => {
  assert.equal(whereLabel({ via: 'siri' }, { device: 'iPhone' }), 'Siri');
  assert.equal(whereLabel({ via: 'action-button' }, { device: 'iPhone' }), 'Action Button');
  assert.equal(whereLabel({ fromRecord: true, device: 'Mac' }, { device: 'iPhone' }), 'on your Mac');
  assert.equal(whereLabel({ fromRecord: true, device: 'iPhone' }, { device: 'iPhone' }), null);
  assert.equal(whereLabel({ via: 'presence' }, { device: 'iPhone' }), null);
});

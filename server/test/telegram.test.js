// The Telegram bridge's pure decision layer — routing, authorization, and
// the human-gate keyboard. The network loop is deliberately not tested;
// everything it decides with lives here.
import test from 'node:test';
import assert from 'node:assert/strict';

const { routeIncoming, proposalKeyboard, telegramConfigured } = await import('../lib/telegram.js');

test('routeIncoming: authorization is the outer wall, commands inside it', () => {
  assert.equal(routeIncoming('what is my protein floor?', { authorized: false }).type, 'unauthorized');
  assert.equal(routeIncoming('', { authorized: true }).type, 'ignore');
  assert.equal(routeIncoming('/start', { authorized: true }).type, 'start');
  assert.equal(routeIncoming('/brief', { authorized: true }).type, 'brief');
  assert.equal(routeIncoming('/new', { authorized: true }).type, 'new');
  assert.equal(routeIncoming('x'.repeat(1001), { authorized: true }).type, 'too-long');
  const ask = routeIncoming('add a to-do to call the dentist', { authorized: true });
  assert.equal(ask.type, 'ask');
  assert.equal(ask.question, 'add a to-do to call the dentist');
});

test('proposal keyboard carries the record id to the same approve/discard rails', () => {
  const kb = proposalKeyboard('abc12345');
  assert.equal(kb.inline_keyboard[0][0].callback_data, 'ap:abc12345');
  assert.equal(kb.inline_keyboard[0][1].callback_data, 'ds:abc12345');
});

test('without a token the bridge is dormant', () => {
  const prev = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal(telegramConfigured(), false);
  if (prev) process.env.TELEGRAM_BOT_TOKEN = prev;
});


test('a non-text message gets one honest line naming what it was — never silence, never a guess', async () => {
  const { nonTextReply } = await import('../lib/telegram.js');
  assert.equal(nonTextReply({ photo: [{ file_id: 'x' }] }), null, 'a photo is scanned, not answered here');
  assert.match(nonTextReply({ voice: { file_id: 'x' } }), /Text and photos here, sir — a voice note doesn't reach Nova yet/);
  assert.match(nonTextReply({ document: { file_id: 'x' } }), /a file doesn't reach Nova yet/);
  assert.equal(nonTextReply({ text: 'hello' }), null, 'text is routed, not answered here');
  assert.equal(nonTextReply({ new_chat_members: [] }), null, 'a service message is not answered at all');
});


test('a photo becomes a pending food-log capture on the food rail — the largest size, honest confidence, nothing logged until he taps', async () => {
  const { pickLargestPhoto, foodRecordFromScan } = await import('../lib/telegram.js');
  const sizes = [{ file_id: 's', file_size: 1200, width: 90, height: 90 }, { file_id: 'l', file_size: 88000, width: 1280, height: 960 }, { file_id: 'm', file_size: 20000, width: 320, height: 240 }];
  assert.equal(pickLargestPhoto(sizes).file_id, 'l');
  assert.equal(pickLargestPhoto([]), null);
  const rec = foodRecordFromScan({ name: 'Chicken Caesar Pasta', macros: { p: 41.6, c: 55.2, f: 18.4, kcal: 470.9 }, confidence: 'low', question: 'Was that a full bowl?' }, 'lunch');
  assert.equal(rec.status, 'pending', 'pending → it announces with Yes / Leave; approving is what logs it');
  assert.equal(rec.decision.route, 'food');
  assert.deepEqual(rec.decision.payload, { name: 'Chicken Caesar Pasta', macros: { p: 42, c: 55, f: 18, kcal: 471 } });
  assert.equal(rec.decision.confidence, 'low');
  assert.match(rec.decision.title, /^Log Chicken Caesar Pasta — 42P · 55C · 18F · 471 kcal$/);
  assert.match(rec.decision.reason, /LOW confidence.*Was that a full bowl\?/);
  assert.equal(rec.text, 'Photo — Chicken Caesar Pasta (lunch)');
  assert.equal(foodRecordFromScan({ name: '', macros: {} }, '').decision.payload.name, 'photographed food', 'never a blank name');
});

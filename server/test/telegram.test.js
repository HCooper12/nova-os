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

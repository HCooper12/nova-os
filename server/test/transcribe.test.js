// Speech to text: the key store and the preference order mirror the watch
// toolchain (Groq first, OpenAI second); the network call itself needs a real
// voice note and is not exercised here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvKeys, pickBackend } from '../lib/transcribe.js';

test('the env file parses like a shell would read it: quotes off, comments and blanks ignored', () => {
  const env = parseEnvKeys('# keys\nGROQ_API_KEY="gsk_abc"\n\nOPENAI_API_KEY=sk-def\nBROKEN LINE\n=nokey\n');
  assert.deepEqual(env, { GROQ_API_KEY: 'gsk_abc', OPENAI_API_KEY: 'sk-def' });
});

test('Groq is preferred, OpenAI is the fallback, and no key is an honest null', () => {
  const both = pickBackend({ GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' });
  assert.equal(both.backend, 'groq');
  assert.equal(both.model, 'whisper-large-v3');
  const openai = pickBackend({ OPENAI_API_KEY: 'o' });
  assert.equal(openai.backend, 'openai');
  assert.equal(openai.model, 'whisper-1');
  assert.equal(pickBackend({}), null);
  assert.equal(pickBackend(null), null);
});

// 29 Oct 2026: a live clip of room noise sent with X-Vad: heard came back as
// "." and was kept as his words; the mid-turn read always sends heard.
test('a transcript with no letter or digit is never his words, heard or not', async () => {
  const { heardText } = await import('../lib/transcribe.js');
  assert.equal(heardText('.', { spoke: true }), '');
  assert.equal(heardText(' … ', { spoke: true }), '');
  assert.equal(heardText('', { spoke: true }), '');
  assert.equal(heardText('.', { spoke: false }), '');
  // the meter heard him: a bare thanks is his
  assert.equal(heardText('Thank you.', { spoke: true }), 'Thank you.');
  // the meter heard nothing: the silence line goes
  assert.equal(heardText('Thank you.', { spoke: false }), '');
  assert.equal(heardText('How many steps today?', { spoke: false }), 'How many steps today?');
  assert.equal(heardText('5.', { spoke: true }), '5.');
});

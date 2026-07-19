// Ask Nova prompt contract + ElevenLabs proxy — stub API BEFORE imports.
import http from 'node:http';

process.env.ELEVENLABS_API_KEY = 'test-el-key';

const stub = { calls: [] };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    stub.calls.push({ method: req.method, url: req.url, key: req.headers['xi-api-key'], body });
    if (req.method === 'GET' && req.url === '/v1/voices') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ voices: [{ voice_id: 'v-jarvis', name: 'Jarvis', category: 'cloned' }, { voice_id: 'v-alt', name: 'Alt' }] }));
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/v1/text-to-speech/')) {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end(Buffer.from('ID3-fake-mp3-bytes'));
      return;
    }
    res.writeHead(404).end('{}');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.NOVA_ELEVENLABS_API = `http://127.0.0.1:${server.address().port}`;

import test from 'node:test';
import assert from 'node:assert/strict';

const { ttsConfigured, listVoices, synthesize, _resetTtsCache } = await import('../lib/tts.js');
const { buildAskPrompt } = await import('../lib/claudeCode.js');

test.after(() => server.close());

test('ask prompt: grounds in vault, carries live context and trimmed history, stays spoken-register', () => {
  const prompt = buildAskPrompt({
    question: 'How did training go this week?',
    context: 'Morning Dispatch — X\n**Training.** Leg Day is scheduled.',
    history: [
      { who: 'you', text: 'earliest question' },
      { who: 'nova', text: 'earliest answer' },
      { who: 'you', text: 'q1' }, { who: 'nova', text: 'a1' },
      { who: 'you', text: 'q2' }, { who: 'nova', text: 'a2' },
      { who: 'you', text: 'q3' }, { who: 'nova', text: 'a3' },
    ],
  });
  assert.match(prompt, /read-only/i);
  assert.match(prompt, /never invent/);
  assert.match(prompt, /Leg Day is scheduled/);
  assert.match(prompt, /Hayden asks: How did training go this week\?/);
  assert.match(prompt, /Hayden: q1/); // last 6 turns kept…
  assert.doesNotMatch(prompt, /earliest question/); // …older ones dropped
  const noHistory = buildAskPrompt({ question: 'Hi', context: '' });
  assert.match(noHistory, /\(unavailable\)/);
  assert.doesNotMatch(noHistory, /Conversation so far/);
});

test('voices list hits the API with the key and caches', async () => {
  _resetTtsCache();
  assert.equal(ttsConfigured(), true);
  const voices = await listVoices();
  assert.deepEqual(voices[0], { id: 'v-jarvis', name: 'Jarvis', category: 'cloned' });
  const callsAfterFirst = stub.calls.length;
  await listVoices(); // cached — no second request
  assert.equal(stub.calls.length, callsAfterFirst);
  assert.equal(stub.calls[0].key, 'test-el-key');
});

test('synthesize posts the text to the chosen voice and returns audio bytes', async () => {
  const audio = await synthesize('Good evening, Hayden.', 'v-alt');
  assert.ok(Buffer.isBuffer(audio));
  assert.ok(audio.length > 0);
  const call = stub.calls.at(-1);
  assert.match(call.url, /\/v1\/text-to-speech\/v-alt\?output_format=mp3_44100_128/);
  assert.match(call.body, /"Good evening, Hayden\."/);
  assert.match(call.body, /eleven_turbo_v2_5/);

  // default voice: first account voice when none chosen and no env override
  await synthesize('Testing default voice.');
  assert.match(stub.calls.at(-1).url, /v-jarvis/);
});

test('without a key everything degrades honestly', async () => {
  const saved = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = '';
  assert.equal(ttsConfigured(), false);
  assert.deepEqual(await listVoices(), []);
  await assert.rejects(() => synthesize('hello'), /not configured/);
  process.env.ELEVENLABS_API_KEY = saved;
});

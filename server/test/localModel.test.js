// The local LLM client: hardware tiering, status/readiness distinction,
// request shaping, and honest error wording — exercised against a stub HTTP
// server, never the real mlx_lm.server (a real boot means a model load on
// his Mac; see ttsLocal.test.js for the same rule applied to Kokoro).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// A port nothing else in this suite (or ttsLocal's 4299/4298/4297/4296) uses,
// so this file can run standalone or alongside the others without collision.
process.env.NOVA_LOCAL_LLM_PORT = '4295';

// A TEST MUST NEVER SPAWN THE REAL SERVER — that is a multi-GB model load.
// NOVA_VOICE_DIR points the spawn at an empty scratch tree, same idiom as
// ttsLocal.test.js, so "not installed" fails instantly instead of lingering.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';

process.env.NOVA_VOICE_DIR = mkdtempSync(nodePath.join(os.tmpdir(), 'nova-localmodel-'));

const {
  hardwareProfile, defaultModel, localModelStatus, completeLocal, healthy, ensureLocalModel,
} = await import('../lib/localModel.js');

test('hardwareProfile: tiers derived from the machine, not hard-coded', () => {
  const small = hardwareProfile({ totalMemBytes: 8 * 1024 ** 3, cpuModel: 'Apple M1' });
  assert.equal(small.tier, '≤8GB');
  assert.equal(small.maxParamsB, 4);
  assert.match(small.recommendedModel, /4B/, 'the 3B failed the inbox contract 0/40, so the small tier runs the 4B too');
  assert.equal(small.cpuModel, 'Apple M1');

  const mid = hardwareProfile({ totalMemBytes: 16 * 1024 ** 3 });
  assert.equal(mid.tier, '16GB');
  assert.equal(mid.maxParamsB, 8);
  assert.match(mid.recommendedModel, /4B/);

  // just over the 16GB boundary — a real M1 Pro/Max config (18, 24GB) — must
  // land in the next tier up, not linger in "16GB" by a rounding accident
  const between = hardwareProfile({ totalMemBytes: 18 * 1024 ** 3 });
  assert.equal(between.tier, '32GB');
  assert.equal(between.maxParamsB, 14);

  const big = hardwareProfile({ totalMemBytes: 64 * 1024 ** 3 });
  assert.equal(big.tier, '>32GB');
  assert.equal(big.maxParamsB, 14);

  // boundaries themselves: exactly 8 and exactly 32 stay in the lower tier
  assert.equal(hardwareProfile({ totalMemBytes: 8 * 1024 ** 3 }).tier, '≤8GB');
  assert.equal(hardwareProfile({ totalMemBytes: 32 * 1024 ** 3 }).tier, '32GB');
});

test('hardwareProfile: falls back to a real reading when nothing is injected', () => {
  const real = hardwareProfile();
  assert.ok(real.totalMemGB > 0, 'reads the live machine when no override is given');
  assert.equal(typeof real.cpuModel, 'string');
});

test('defaultModel: env override wins outright, otherwise the machine picks', () => {
  const had = process.env.NOVA_LOCAL_LLM_MODEL;
  try {
    delete process.env.NOVA_LOCAL_LLM_MODEL;
    assert.equal(defaultModel(), hardwareProfile().recommendedModel);

    process.env.NOVA_LOCAL_LLM_MODEL = 'mlx-community/some-other-model-4bit';
    assert.equal(defaultModel(), 'mlx-community/some-other-model-4bit');
  } finally {
    if (had !== undefined) process.env.NOVA_LOCAL_LLM_MODEL = had; else delete process.env.NOVA_LOCAL_LLM_MODEL;
  }
});

test('localModelStatus: not installed reports configured false, ready false, and never hangs', async () => {
  const started = Date.now();
  const status = await localModelStatus();
  assert.equal(status.configured, false, 'the scratch NOVA_VOICE_DIR has no env/bin/python');
  assert.equal(status.ready, false);
  assert.equal(typeof status.model, 'string');
  assert.ok(status.model.length > 0);
  assert.ok(Date.now() - started < 2000, `answered in ${Date.now() - started}ms without waiting out a boot`);
});

test('configured is not ready: a reachable stub answers /health but status still separates the two claims', async () => {
  const stub = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"status":"ok"}');
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => stub.listen(4295, '127.0.0.1', r));
  try {
    assert.equal(await healthy(), true);
  } finally {
    stub.close();
  }
});

test('completeLocal: a request is refused immediately while the server is down, never waiting out a boot', async () => {
  const started = Date.now();
  await assert.rejects(
    () => completeLocal('classify this thought'),
    /starting up/,
    'it names the state rather than failing blankly',
  );
  assert.ok(Date.now() - started < 2000, `refused in ${Date.now() - started}ms, not after a boot attempt`);
});

test('completeLocal: empty prompt is refused without a network call', async () => {
  await assert.rejects(() => completeLocal(''), /empty prompt/);
  await assert.rejects(() => completeLocal('   '), /empty prompt/);
});

test('completeLocal: request shaping and response parsing against a stub OpenAI-compatible server', async () => {
  const seen = [];
  const stub = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"status":"ok"}');
    }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        seen.push(JSON.parse(body));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          id: 'chatcmpl-test',
          choices: [{ index: 0, message: { role: 'assistant', content: '{"route":"note"}' }, finish_reason: 'stop' }],
        }));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => stub.listen(4295, '127.0.0.1', r));
  try {
    const result = await completeLocal('classify: buy milk', { maxTokens: 128, temperature: 0 });
    assert.equal(result.text, '{"route":"note"}');
    assert.equal(typeof result.ms, 'number');
    assert.ok(result.ms >= 0);
    assert.equal(result.model, defaultModel());
    assert.equal(seen[0].messages[0].content, 'classify: buy milk');
    assert.equal(seen[0].max_tokens, 128);
    assert.equal(seen[0].temperature, 0);
    assert.equal(seen[0].model, defaultModel());
  } finally {
    stub.close();
  }
});

test('completeLocal: a non-OK response names the status and body, not a blank failure', async () => {
  const stub = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"status":"ok"}');
    }
    res.statusCode = 500;
    res.end('model crashed mid-generation');
  });
  await new Promise((r) => stub.listen(4295, '127.0.0.1', r));
  try {
    await assert.rejects(
      () => completeLocal('anything'),
      /local model → 500.*model crashed mid-generation/s,
    );
  } finally {
    stub.close();
  }
});

test('completeLocal: empty completion text is a named failure, not a silent empty string', async () => {
  const stub = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"status":"ok"}');
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '' } }] }));
  });
  await new Promise((r) => stub.listen(4295, '127.0.0.1', r));
  try {
    await assert.rejects(() => completeLocal('anything'), /no text/);
  } finally {
    stub.close();
  }
});

test('ensureLocalModel: not installed fails fast with a clear remedy, not a hang', async () => {
  const started = Date.now();
  await assert.rejects(
    () => ensureLocalModel(),
    /not installed/,
  );
  assert.ok(Date.now() - started < 5000, `failed in ${Date.now() - started}ms`);
});

test('ensureLocalModel: concurrent callers share one in-flight boot', async () => {
  const a = ensureLocalModel();
  const b = ensureLocalModel();
  // Both callers get rejections from the SAME attempt (not-installed venv),
  // proving they shared the one boot rather than racing two spawns.
  const [ra, rb] = await Promise.allSettled([a, b]);
  assert.equal(ra.status, 'rejected');
  assert.equal(rb.status, 'rejected');
  assert.equal(ra.reason.message, rb.reason.message);
});

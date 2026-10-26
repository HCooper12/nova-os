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

// The tests down to the Ollama section exercise the MLX backend (the
// original, 25 Sep); the Ollama section (27 Oct) switches per test and
// points at its own stub. Every test here sets NOVA_OLLAMA_NO_SPAWN, so
// `ollama serve` is never started either.
process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
process.env.NOVA_OLLAMA_NO_SPAWN = '1';

// A TEST MUST NEVER SPAWN THE REAL SERVER — that is a multi-GB model load.
// NOVA_VOICE_DIR points the spawn at an empty scratch tree, same idiom as
// ttsLocal.test.js, so "not installed" fails instantly instead of lingering.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';

process.env.NOVA_VOICE_DIR = mkdtempSync(nodePath.join(os.tmpdir(), 'nova-localmodel-'));

const {
  hardwareProfile, defaultModel, localModelStatus, completeLocal, healthy, ensureLocalModel,
  stopLocalModel, localModelPid,
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

/* ---------------------- memory headroom, waitForBoot, system (19 Oct) ---------------------- */

test('memoryHeadroom: the 19 Oct reading (460 MB swap free) is not enough to load the model', async () => {
  const { memoryHeadroom, parseSwapUsage } = await import('../lib/localModel.js');
  const line = 'total = 21504.00M  used = 21043.25M  free = 460.75M  (encrypted)';
  assert.deepEqual(parseSwapUsage(line), { totalMB: 21504, freeMB: 460.75 });
  const low = memoryHeadroom({ read: () => line, platform: 'darwin', minFreeMB: 1500 });
  assert.equal(low.ok, false);
  assert.equal(low.swapFreeMB, 461);
  assert.match(low.reason, /only 461 MB of swap free/);

  const roomy = memoryHeadroom({ read: () => 'total = 4096.00M  used = 1024.00M  free = 3072.00M  (encrypted)', platform: 'darwin', minFreeMB: 1500 });
  assert.equal(roomy.ok, true);
  assert.equal(roomy.swapFreeMB, 3072);
  // macOS grows swap on demand: no swap in use yet is room, not "0 MB free"
  assert.equal(memoryHeadroom({ read: () => 'total = 0.00M  used = 0.00M  free = 0.00M  (encrypted)', platform: 'darwin' }).ok, true);
  // gigabyte units
  assert.equal(parseSwapUsage('total = 2.00G  used = 1.50G  free = 0.50G').freeMB, 512);
  // not macOS, or an unreadable reading: never blocked on a guess
  assert.equal(memoryHeadroom({ read: () => line, platform: 'linux' }).ok, true);
  assert.equal(memoryHeadroom({ read: () => 'garbage', platform: 'darwin' }).ok, true);
  assert.equal(memoryHeadroom({ read: () => { throw new Error('no sysctl'); }, platform: 'darwin' }).ok, true);
});

test('localModelStatus reports the headroom alongside configured and ready', async () => {
  const { _setHeadroomForTests } = await import('../lib/localModel.js');
  _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 460, reason: 'low' }));
  try {
    const s = await localModelStatus();
    assert.deepEqual(s.headroom, { ok: false, swapFreeMB: 460, reason: 'low' });
  } finally {
    _setHeadroomForTests(null);
  }
});

function chatStub(seen) {
  return http.createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"status":"ok"}'); }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        seen.push(JSON.parse(body));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
}

test('completeLocal: `system` is sent as a system message ahead of the prompt', async () => {
  const seen = [];
  const stub = chatStub(seen);
  await new Promise((r) => stub.listen(4295, '127.0.0.1', r));
  try {
    await completeLocal('the prompt', { system: 'answer in JSON' });
    assert.deepEqual(seen[0].messages, [{ role: 'system', content: 'answer in JSON' }, { role: 'user', content: 'the prompt' }]);
    await completeLocal('no system');
    assert.deepEqual(seen[1].messages, [{ role: 'user', content: 'no system' }]);
  } finally {
    // drop the keep-alive sockets too, or the next test's /health is answered
    // by this closed server over a pooled connection
    stub.closeAllConnections();
    stub.close();
  }
});

test('completeLocal waitForBoot: waits for the load instead of refusing, and fails plainly when the load cannot happen', async () => {
  const { _setHeadroomForTests } = await import('../lib/localModel.js');
  // the server is down and this test env is not installed: the boot fails at
  // once and the call says why, rather than "still starting up"
  await assert.rejects(() => completeLocal('x', { waitForBoot: true }), /not installed/);

  // the server comes up while the call waits: the answer arrives
  const seen = [];
  const stub = chatStub(seen);
  const had = process.env.NOVA_VOICE_DIR;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const fake = mkdtempSync(nodePath.join(os.tmpdir(), 'nova-localmodel-wait-'));
  mkdirSync(nodePath.join(fake, 'env', 'bin'), { recursive: true });
  // a "python" that stays alive without doing anything, so the boot loop
  // polls /health until the stub answers
  writeFileSync(nodePath.join(fake, 'env', 'bin', 'python'), '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
  process.env.NOVA_VOICE_DIR = fake;
  _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
  let upLater = null;
  try {
    upLater = setTimeout(() => stub.listen(4295, '127.0.0.1'), 300);
    const out = await completeLocal('after the load', { waitForBoot: true });
    assert.equal(out.text, 'ok');
    assert.equal(seen.length, 1);
  } finally {
    clearTimeout(upLater);
    stopLocalModel();
    stub.closeAllConnections();
    stub.close();
    process.env.NOVA_VOICE_DIR = had;
    _setHeadroomForTests(null);
  }
});

test('ensureLocalModel refuses to load when the Mac has no memory to spare', async () => {
  const { _setHeadroomForTests } = await import('../lib/localModel.js');
  const had = process.env.NOVA_VOICE_DIR;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const fake = mkdtempSync(nodePath.join(os.tmpdir(), 'nova-localmodel-room-'));
  mkdirSync(nodePath.join(fake, 'env', 'bin'), { recursive: true });
  writeFileSync(nodePath.join(fake, 'env', 'bin', 'python'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  process.env.NOVA_VOICE_DIR = fake;
  _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 460, reason: 'this Mac has only 460 MB of swap free' }));
  try {
    await assert.rejects(() => ensureLocalModel(), (e) => e.noHeadroom === true && /460 MB of swap free/.test(e.message));
    assert.equal(localModelPid(), null, 'nothing was spawned');
  } finally {
    process.env.NOVA_VOICE_DIR = had;
    _setHeadroomForTests(null);
  }
});

/* ------------------------------ Ollama (27 Oct) ------------------------------ */

// A stub Ollama on a free port: /api/tags, /api/ps, /api/chat, /api/generate.
// `chatReply` is what /api/chat answers next; `loaded` is what /api/ps lists.
function ollamaStub({ chatReply = null, loaded = [], tags = null } = {}) {
  const seen = { chat: [], generate: [] };
  const state = { chatReply, loaded: [...loaded] };
  const models = tags || [
    { name: 'qwen3.5:4b', size: 3324173934, capabilities: ['completion', 'tools', 'thinking', 'vision'] },
    { name: 'nomic-embed-text:latest', size: 274302450, capabilities: ['embedding'] },
  ];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models }));
      if (req.url === '/api/ps') return res.end(JSON.stringify({ models: state.loaded.map((name) => ({ name, model: name })) }));
      if (req.url === '/api/generate' && req.method === 'POST') {
        const b = JSON.parse(body);
        seen.generate.push(b);
        if (b.keep_alive === 0) state.loaded = state.loaded.filter((m) => m !== b.model);
        else if (!state.loaded.includes(b.model)) state.loaded.push(b.model);
        return res.end(JSON.stringify({ model: b.model, response: '', done: true, done_reason: 'load' }));
      }
      if (req.url === '/api/chat' && req.method === 'POST') {
        const b = JSON.parse(body);
        seen.chat.push(b);
        if (!state.loaded.includes(b.model)) state.loaded.push(b.model);
        const reply = typeof state.chatReply === 'function' ? state.chatReply(b) : state.chatReply;
        return res.end(JSON.stringify(reply || { model: b.model, message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop', prompt_eval_count: 12, eval_count: 3 }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  return {
    seen,
    state,
    async start() { await new Promise((r) => srv.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${srv.address().port}`; },
    async stop() { srv.closeAllConnections(); await new Promise((r) => srv.close(r)); },
  };
}

// Run `fn` on the Ollama backend against a stub (or a closed port), then put
// the MLX defaults this file runs on back.
async function onOllama(stubOpts, fn) {
  const stub = stubOpts ? ollamaStub(stubOpts) : null;
  const had = { backend: process.env.NOVA_LOCAL_LLM_BACKEND, url: process.env.NOVA_OLLAMA_URL, model: process.env.NOVA_LOCAL_LLM_MODEL };
  process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
  process.env.NOVA_OLLAMA_URL = stub ? await stub.start() : 'http://127.0.0.1:9';
  process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:4b';
  const lm = await import('../lib/localModel.js');
  try {
    await lm.refreshOllama();
    return await fn(lm, stub);
  } finally {
    if (stub) await stub.stop();
    for (const [k, env] of [['backend', 'NOVA_LOCAL_LLM_BACKEND'], ['url', 'NOVA_OLLAMA_URL'], ['model', 'NOVA_LOCAL_LLM_MODEL']]) {
      if (had[k] === undefined) delete process.env[env]; else process.env[env] = had[k];
    }
    await lm.refreshOllama();
    lm._setHeadroomForTests(null);
  }
}

test('backend: Ollama by default, MLX on request; the tiers follow the backend', async () => {
  const { localBackend } = await import('../lib/localModel.js');
  const had = process.env.NOVA_LOCAL_LLM_BACKEND;
  try {
    delete process.env.NOVA_LOCAL_LLM_BACKEND;
    assert.equal(localBackend(), 'ollama');
    process.env.NOVA_LOCAL_LLM_BACKEND = 'MLX';
    assert.equal(localBackend(), 'mlx');
    process.env.NOVA_LOCAL_LLM_BACKEND = 'anything else';
    assert.equal(localBackend(), 'ollama');
  } finally {
    process.env.NOVA_LOCAL_LLM_BACKEND = had;
  }
  const GB = 1024 ** 3;
  const o = (gb) => hardwareProfile({ totalMemBytes: gb * GB, backend: 'ollama' });
  assert.equal(o(8).recommendedModel, 'qwen3.5:2b');
  assert.equal(o(16).recommendedModel, 'qwen3.5:4b', 'the 4B measured on his 16 GB M1 Pro, 27 Oct');
  assert.equal(o(18).recommendedModel, 'qwen3.5:9b');
  assert.equal(o(32).recommendedModel, 'qwen3.5:9b');
  assert.equal(o(64).recommendedModel, 'qwen3.5:9b');
  assert.equal(o(64).tier, '>32GB');
  assert.equal(hardwareProfile({ totalMemBytes: 16 * GB, backend: 'mlx' }).recommendedModel, 'mlx-community/Qwen3-4B-Instruct-2507-4bit');
});

test('defaultModel: env, then his pick on the board when it fits the backend, then the tier', async () => {
  const { setPreferredModel } = await import('../lib/localModel.js');
  const had = { m: process.env.NOVA_LOCAL_LLM_MODEL, b: process.env.NOVA_LOCAL_LLM_BACKEND };
  try {
    delete process.env.NOVA_LOCAL_LLM_MODEL;
    process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
    setPreferredModel('qwen3.5:9b');
    assert.equal(defaultModel(), 'qwen3.5:9b');
    process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
    assert.equal(defaultModel(), hardwareProfile().recommendedModel, 'an Ollama tag is not run on MLX');
    process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
    process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:2b';
    assert.equal(defaultModel(), 'qwen3.5:2b', 'the env still wins outright');
    setPreferredModel('not a model; rm -rf');
    delete process.env.NOVA_LOCAL_LLM_MODEL;
    assert.equal(defaultModel(), hardwareProfile().recommendedModel, 'a junk pick is ignored');
  } finally {
    setPreferredModel(null);
    if (had.m === undefined) delete process.env.NOVA_LOCAL_LLM_MODEL; else process.env.NOVA_LOCAL_LLM_MODEL = had.m;
    process.env.NOVA_LOCAL_LLM_BACKEND = had.b;
  }
});

test('parseVmStat: free + inactive + speculative pages, in MB, from the 27 Oct reading', async () => {
  const { parseVmStat } = await import('../lib/localModel.js');
  const text = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                    16365.
Pages active:                                 274479.
Pages inactive:                               317711.
Pages speculative:                              3111.
Pages throttled:                                   0.
Pages wired down:                             131498.`;
  assert.equal(parseVmStat(text), Math.round(((16365 + 317711 + 3111) * 16384) / (1024 * 1024)));
  assert.equal(parseVmStat('garbage'), null);
  assert.equal(parseVmStat('(page size of 4096 bytes)\nno pages here'), null);
  assert.equal(parseVmStat('(page size of 4096 bytes)\nPages free: 256.'), 1, 'inactive and speculative may be absent');
});

test('memoryHeadroom on Ollama: free memory against THIS model\'s need; a loaded model is always ok', async () => {
  const { memoryHeadroom, memoryNeedMB } = await import('../lib/localModel.js');
  const vm = (freePages) => () => `(page size of 16384 bytes)\nPages free: ${freePages}.\nPages inactive: 0.\nPages speculative: 0.`;
  const size4b = 3324173934;
  const need = memoryNeedMB('qwen3.5:4b', size4b);
  assert.equal(need, Math.round((size4b / (1024 * 1024)) * 1.15 + 512));
  // 1,000 MB free: not enough, and the reason names both numbers
  const low = memoryHeadroom({ backend: 'ollama', platform: 'darwin', model: 'qwen3.5:4b', sizeBytes: size4b, loaded: false, readVm: vm(64000) });
  assert.equal(low.ok, false);
  assert.equal(low.freeMB, 1000);
  assert.equal(low.needMB, need);
  assert.equal(low.swapFreeMB, null);
  assert.match(low.reason, new RegExp(`only 1000 MB of memory free \\(Qwen3\\.5 4B needs about ${need} MB`));
  // the same reading, model already loaded: nothing new loads, so it is ok
  assert.equal(memoryHeadroom({ backend: 'ollama', platform: 'darwin', model: 'qwen3.5:4b', sizeBytes: size4b, loaded: true, readVm: vm(64000) }).ok, true);
  // 9.6 GB free (the 27 Oct reading the swap guard refused): room
  const roomy = memoryHeadroom({ backend: 'ollama', platform: 'darwin', model: 'qwen3.5:4b', sizeBytes: size4b, loaded: false, readVm: vm(614400) });
  assert.equal(roomy.ok, true);
  assert.equal(roomy.freeMB, 9600);
  // before Ollama has listed the model: a floor by name
  assert.equal(memoryNeedMB('qwen3.5:2b'), 2000);
  assert.equal(memoryNeedMB('qwen3.5:4b'), 3500);
  assert.equal(memoryNeedMB('qwen3.5:9b'), 6000);
  assert.equal(memoryNeedMB('llama3'), 4000);
  // an unreadable reading, or not macOS, is never blocked on a guess
  assert.equal(memoryHeadroom({ backend: 'ollama', platform: 'darwin', model: 'qwen3.5:9b', loaded: false, readVm: () => { throw new Error('no vm_stat'); } }).ok, true);
  assert.equal(memoryHeadroom({ backend: 'ollama', platform: 'linux', model: 'qwen3.5:9b', loaded: false, readVm: vm(1) }).ok, true);
});

test('Ollama status: healthy is /api/tags, ready means THIS model is loaded, the list drops embedding models', async () => {
  await onOllama({ loaded: [] }, async (lm) => {
    assert.equal(await lm.healthy(), true);
    let s = await lm.localModelStatus();
    assert.equal(s.backend, 'ollama');
    assert.equal(s.configured, true, 'the server answered, so it is configured even with no binary found');
    assert.equal(s.ready, false, 'up, but the model is not loaded');
    assert.deepEqual(await lm.listLocalModels(), [{ id: 'qwen3.5:4b', sizeGB: 3.3, name: 'Qwen3.5 4B' }]);
  });
  await onOllama({ loaded: ['qwen3.5:4b'] }, async (lm) => {
    assert.equal((await lm.localModelStatus()).ready, true);
  });
  // nothing answering: an empty list, not ready, never a hang
  await onOllama(null, async (lm) => {
    assert.equal(await lm.healthy(), false);
    assert.deepEqual(await lm.listLocalModels(), []);
    assert.equal((await lm.localModelStatus()).ready, false);
  });
  // the MLX backend has no list
  assert.deepEqual(await (await import('../lib/localModel.js')).listLocalModels(), []);
});

test('Ollama completeLocal: native /api/chat with think off, JSON format, num_ctx and keep_alive', async () => {
  await onOllama({ loaded: ['qwen3.5:4b'], chatReply: { message: { role: 'assistant', content: '{"route":"shopping"}', thinking: 'hmm' }, done: true, done_reason: 'stop', prompt_eval_count: 40, eval_count: 9 } }, async (lm, stub) => {
    const out = await lm.completeLocal('classify: toothpaste', { json: true, maxTokens: 300, system: 'JSON only' });
    assert.equal(out.text, '{"route":"shopping"}');
    assert.equal(out.model, 'qwen3.5:4b');
    const b = stub.seen.chat[0];
    assert.equal(b.model, 'qwen3.5:4b');
    assert.equal(b.stream, false);
    assert.equal(b.think, false, 'thinking off unless asked: on, it ate the whole budget (27 Oct)');
    assert.equal(b.format, 'json');
    assert.equal(b.keep_alive, '30m');
    // one context size for every call: a different num_ctx makes Ollama reload the runner
    assert.deepEqual(b.options, { temperature: 0, num_predict: 300, num_ctx: 8192 });
    assert.deepEqual(b.messages, [{ role: 'system', content: 'JSON only' }, { role: 'user', content: 'classify: toothpaste' }]);
    await lm.completeLocal('plain', { think: true, numCtx: 2048 });
    assert.equal(stub.seen.chat[1].think, true);
    assert.equal(stub.seen.chat[1].format, undefined, 'no format unless the lane wants JSON');
    assert.equal(stub.seen.chat[1].options.num_ctx, 2048);
  });
});

test('Ollama: thinking that ate the budget is a plain error, never an empty answer', async () => {
  await onOllama({ loaded: ['qwen3.5:4b'], chatReply: { message: { role: 'assistant', content: '', thinking: 'toothpaste is... '.repeat(40) }, done: true, done_reason: 'length' } }, async (lm) => {
    await assert.rejects(() => lm.completeLocal('classify: toothpaste'), /spent its whole budget thinking and returned nothing/);
    await assert.rejects(() => lm.chatLocal([{ role: 'user', content: 'x' }]), /spent its whole budget thinking/);
  });
  await onOllama({ loaded: ['qwen3.5:4b'], chatReply: { message: { role: 'assistant', content: '  ' }, done: true, done_reason: 'stop' } }, async (lm) => {
    await assert.rejects(() => lm.completeLocal('x'), /returned no text/);
  });
});

test('Ollama chatLocal: a native tool call comes back in the OpenAI shape the callers read', async () => {
  const reply = { message: { role: 'assistant', content: '', thinking: 'secret', tool_calls: [{ function: { name: 'calendar_list', arguments: { date: 'tomorrow' } } }] }, done: true, done_reason: 'stop', prompt_eval_count: 2200, eval_count: 20 };
  await onOllama({ loaded: ['qwen3.5:4b'], chatReply: reply }, async (lm, stub) => {
    const tools = [{ type: 'function', function: { name: 'calendar_list', parameters: { type: 'object', properties: { date: { type: 'string' } } } } }];
    const out = await lm.chatLocal([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'what is on tomorrow?' },
      // an earlier round, in the OpenAI shape localAsk builds: arguments a STRING
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'vault_search', arguments: '{"query":"gym"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', name: 'vault_search', content: 'Gym.md' },
    ], { tools });
    assert.equal(out.message.content, '');
    assert.equal(out.message.thinking, undefined, 'thinking is the model\'s scratch, never passed on');
    assert.equal(out.message.tool_calls.length, 1);
    const tc = out.message.tool_calls[0];
    assert.match(tc.id, /^call_[0-9a-f]{8}$/);
    assert.equal(tc.type, 'function');
    assert.equal(tc.function.name, 'calendar_list');
    assert.equal(tc.function.arguments, '{"date":"tomorrow"}', 'a JSON string, as on /v1');
    assert.deepEqual(out.usage, { prompt_tokens: 2200, completion_tokens: 20 });
    const b = stub.seen.chat[0];
    assert.deepEqual(b.tools, tools);
    assert.equal(b.think, false);
    assert.equal(b.options.num_ctx, 8192, 'the chat turn asks for 8192: Ollama defaults to 4096');
    // going out, the earlier tool call's arguments are an OBJECT, and the tool result names its tool
    assert.deepEqual(b.messages[2].tool_calls[0].function, { name: 'vault_search', arguments: { query: 'gym' } });
    assert.equal(b.messages[3].role, 'tool');
    assert.equal(b.messages[3].tool_name, 'vault_search');
    const { readToolCalls } = await import('../lib/localAsk.js');
    assert.deepEqual(readToolCalls(out.message).calls.map((c) => ({ name: c.name, args: c.args })), [{ name: 'calendar_list', args: { date: 'tomorrow' } }]);
  });
});

test('Ollama: an HTTP refusal carries its status', async () => {
  const srv = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end('{"models":[{"name":"qwen3.5:4b","size":1}]}');
    if (req.url === '/api/ps') return res.end('{"models":[{"name":"qwen3.5:4b"}]}');
    res.statusCode = 400;
    res.end('{"error":"registry.ollama.ai/library/qwen3.5:4b does not support tools"}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const had = { b: process.env.NOVA_LOCAL_LLM_BACKEND, u: process.env.NOVA_OLLAMA_URL, m: process.env.NOVA_LOCAL_LLM_MODEL };
  process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
  process.env.NOVA_OLLAMA_URL = `http://127.0.0.1:${srv.address().port}`;
  process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:4b';
  try {
    const { chatLocal } = await import('../lib/localModel.js');
    await assert.rejects(() => chatLocal([{ role: 'user', content: 'x' }], { tools: [{ type: 'function', function: { name: 't' } }] }), (e) => e.status === 400 && /does not support tools/.test(e.message));
  } finally {
    process.env.NOVA_LOCAL_LLM_BACKEND = had.b;
    if (had.u === undefined) delete process.env.NOVA_OLLAMA_URL; else process.env.NOVA_OLLAMA_URL = had.u;
    if (had.m === undefined) delete process.env.NOVA_LOCAL_LLM_MODEL; else process.env.NOVA_LOCAL_LLM_MODEL = had.m;
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
  }
});

test('Ollama boot: an unloaded model is preloaded (same keep_alive and num_ctx) after the headroom check, and refused without room', async () => {
  await onOllama({ loaded: [] }, async (lm, stub) => {
    lm._setHeadroomForTests(() => ({ ok: false, freeMB: 900, needMB: 4300, swapFreeMB: null, reason: 'this Mac has only 900 MB of memory free (Qwen3.5 4B needs about 4300 MB to load without slowing everything else down)' }));
    await assert.rejects(() => lm.ensureLocalModel(), (e) => e.noHeadroom === true && /900 MB of memory free/.test(e.message));
    assert.equal(stub.seen.generate.length, 0, 'nothing was loaded');
    // the call that waits for a boot gets the same honest reason
    await assert.rejects(() => lm.completeLocal('x', { waitForBoot: true }), /900 MB of memory free/);
    assert.equal(stub.seen.chat.length, 0, 'and never reached /api/chat, which would have loaded it anyway');

    lm._setHeadroomForTests(() => ({ ok: true, freeMB: 9600, needMB: 4300, swapFreeMB: null, reason: null }));
    const out = await lm.completeLocal('after the load', { waitForBoot: true });
    assert.equal(out.text, 'ok');
    assert.equal(stub.seen.generate.length, 1);
    assert.deepEqual(stub.seen.generate[0], { model: 'qwen3.5:4b', prompt: '', keep_alive: '30m', options: { num_ctx: 8192 } });

    // stopping unloads it (keep_alive 0) even though we did not spawn the server
    await lm.stopLocalModel();
    assert.deepEqual(stub.seen.generate[1], { model: 'qwen3.5:4b', keep_alive: 0 });
    assert.equal((await lm.localModelStatus()).ready, false);
  });
});

test('Ollama boot: a model that is not pulled says so, with the command', async () => {
  await onOllama({ loaded: [] }, async (lm) => {
    process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:9b';
    lm._setHeadroomForTests(() => ({ ok: true, freeMB: 9600, needMB: 6000, swapFreeMB: null, reason: null }));
    await assert.rejects(() => lm.ensureLocalModel(), /qwen3\.5:9b is not on this Mac yet \(ollama pull qwen3\.5:9b\)/);
  });
});

test('Ollama with nothing answering and spawning forbidden: a plain reason, never a spawn', async () => {
  await onOllama(null, async (lm) => {
    const had = process.env.NOVA_OLLAMA_BIN;
    process.env.NOVA_OLLAMA_BIN = process.execPath; // a file that exists: "installed"
    try {
      assert.equal(lm.localModelConfigured(), true);
      await assert.rejects(() => lm.ensureLocalModel(), /Ollama is not answering at http:\/\/127\.0\.0\.1:9/);
      assert.equal(lm.localModelPid(), null);
    } finally {
      if (had === undefined) delete process.env.NOVA_OLLAMA_BIN; else process.env.NOVA_OLLAMA_BIN = had;
    }
    // and no binary at all, in a test run: not configured, not installed
    assert.equal(lm.localModelConfigured(), false);
    await assert.rejects(() => lm.ensureLocalModel(), /Ollama is not installed on this Mac/);
  });
});

test('localModelLabel: Ollama tags and MLX ids both read as a short name', async () => {
  const { localModelLabel, localModelName } = await import('../lib/localModel.js');
  assert.equal(localModelLabel('qwen3.5:4b'), 'Qwen3.5 4B on this Mac');
  assert.equal(localModelLabel('qwen3.5:9b'), 'Qwen3.5 9B on this Mac');
  assert.equal(localModelLabel('mlx-community/Qwen3-4B-Instruct-2507-4bit'), 'Qwen3 4B on this Mac');
  assert.equal(localModelName('llama3:latest'), 'Llama3');
  assert.equal(localModelName('qwen3.5:9b-q8_0'), 'Qwen3.5 9B');
});

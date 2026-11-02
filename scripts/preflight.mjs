#!/usr/bin/env node
// PREFLIGHT — every live chain, run for real, with a latency budget.
// (2 Nov 2026; design/LOCAL-NOVA-PLAN.md §1b: "real calls not mocks, exit
// non-zero on a failure, 'done' means preflight passed".)
//
//   node scripts/preflight.mjs
//
// Checks the running server on both roads (this Mac and the tailnet), the
// HTTPS serve URL, Ollama and whether the board's model is loaded, Apple's
// helper, a real local classify, a real Kokoro render (ElevenLabs is never
// called: it costs), the ears, the Inbox read, the vault, and the model board.
// Ends with:
//   LATENCY BUDGET: hear X s · think Y s · speak Z s · total T s
//   SUMMARY: N pass, N fail, N warn
//
// Read-only on his data. The classify runs IN THIS PROCESS (there is no
// write-free route that runs the local model) with NOVA_DATA_DIR pointed at a
// scratch folder and the board's model pick pinned, so it reaches the same
// Ollama / Apple helper the server would and writes nothing of his. The voice
// is rendered by the live server's /api/tts with a fresh sentence over 80
// characters (the disk cache skips those). His token is read in-process from
// server/.env and never printed (same rule as scripts/nova-api.mjs).

import { readFileSync, existsSync } from 'node:fs';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..', 'server');
const envText = readFileSync(path.join(serverDir, '.env'), 'utf8');
const envVal = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
const token = envVal('API_TOKEN');
if (!token) { console.error('API_TOKEN not set in server/.env'); process.exit(2); }
const PORT = Number(envVal('PORT')) || 4173;
const LOCAL = `http://127.0.0.1:${PORT}`;
const AUTH = { Authorization: `Bearer ${token}` };

const results = [];
const budget = { hear: null, think: null, speak: null };
const mark = { pass: '✓', fail: '✗', warn: '!', skip: '-' };

function report(status, name, ms, detail) {
  results.push({ status, name, ms, detail });
  const t = ms == null ? '' : ` (${ms} ms)`;
  console.log(`${mark[status]} ${status.toUpperCase().padEnd(4)} ${name}${t}${detail ? ` — ${detail}` : ''}`);
}

async function timed(fn) {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

async function getJson(url, { headers = {}, timeoutMs = 5000 } = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, body, text };
}

const run = (cmd, args, timeoutMs = 5000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
});

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

// ------------------------------------------------------------------ server
console.log('NOVA PREFLIGHT ' + new Date().toISOString());
console.log('');

try {
  const { value, ms } = await timed(() => getJson(`${LOCAL}/api/health`));
  if (value.ok && value.body?.ok) report('pass', 'server on this Mac', ms, `${LOCAL}/api/health`);
  else report('fail', 'server on this Mac', ms, `answered ${value.status}`);
} catch (e) {
  report('fail', 'server on this Mac', null, `no answer: ${e.cause?.code || e.message}`);
}

// ------------------------------------------------------------------ tailnet
let ts = null;
{
  const bin = existsSync('/usr/local/bin/tailscale') ? '/usr/local/bin/tailscale' : 'tailscale';
  const { value: r, ms } = await timed(() => run(bin, ['status', '--json']));
  if (r.err && !r.stdout) report('fail', 'Tailscale', ms, `could not ask it: ${r.err.code === 'ENOENT' ? 'the tailscale command is not installed' : r.err.message}`);
  else {
    try {
      ts = JSON.parse(r.stdout);
      if (ts.BackendState === 'Running') report('pass', 'Tailscale', ms, `BackendState Running, ${ts.Self?.TailscaleIPs?.[0] || 'no IPv4'}`);
      else report('fail', 'Tailscale', ms, `BackendState ${ts.BackendState}: his phone cannot reach the Mac`);
    } catch (e) {
      report('fail', 'Tailscale', ms, `status was not JSON: ${e.message}`);
    }
  }
}
const tsIp = ts?.Self?.TailscaleIPs?.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || null;
const tsName = String(ts?.Self?.DNSName || '').replace(/\.$/, '') || null;

if (tsIp) {
  try {
    const { value, ms } = await timed(() => getJson(`http://${tsIp}:${PORT}/api/health`));
    if (value.ok && value.body?.ok) report('pass', 'server on the tailnet address', ms, `http://${tsIp}:${PORT} (the Shortcuts road)`);
    else report('fail', 'server on the tailnet address', ms, `answered ${value.status}`);
  } catch (e) {
    report('fail', 'server on the tailnet address', null, `no answer on http://${tsIp}:${PORT}: ${e.cause?.code || e.message}`);
  }
} else report('skip', 'server on the tailnet address', null, 'no tailnet IPv4 to try');

if (tsName) {
  try {
    const { value, ms } = await timed(() => getJson(`https://${tsName}/api/health`, { timeoutMs: 8000 }));
    if (value.ok && value.body?.ok) report('pass', 'HTTPS serve URL', ms, `https://${tsName}`);
    else report('fail', 'HTTPS serve URL', ms, `answered ${value.status}`);
  } catch (e) {
    report('fail', 'HTTPS serve URL', null, `no answer from https://${tsName}: ${e.cause?.code || e.message}`);
  }
} else report('skip', 'HTTPS serve URL', null, 'no tailnet name to try');

// ------------------------------------------------------------------ board
let board = null;
try {
  const { value, ms } = await timed(() => getJson(`${LOCAL}/api/model-prefs`, { headers: AUTH, timeoutMs: 8000 }));
  if (!value.ok) report('fail', 'model board', ms, `answered ${value.status}`);
  else {
    board = value.body;
    const lanes = board.lanes || [];
    const on = lanes.filter((l) => l.enabled !== false);
    const local = on.filter((l) => l.provider === 'local').length;
    const claude = on.filter((l) => l.provider !== 'local').length;
    const off = lanes.length - on.length;
    report('pass', 'model board', ms, `${lanes.length} lanes: ${local} on this Mac, ${claude} on Claude, ${off} off; local first ${board.local?.first ? 'on' : 'off'}; local model ${board.local?.label || 'none'} (${board.local?.backend || '?'})`);
  }
} catch (e) {
  report('fail', 'model board', null, `could not read it: ${e.cause?.code || e.message}`);
}

// ------------------------------------------------------------------ ollama
const OLLAMA = (process.env.NOVA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const boardModel = board?.local?.model || null;
try {
  const { value, ms } = await timed(() => getJson(`${OLLAMA}/api/tags`, { timeoutMs: 3000 }));
  if (!value.ok) report('fail', 'Ollama', ms, `/api/tags answered ${value.status}`);
  else {
    const names = (value.body?.models || []).map((m) => m.name || m.model);
    const has = boardModel && boardModel !== 'apple:on-device' ? names.includes(boardModel) : true;
    report(has ? 'pass' : 'fail', 'Ollama', ms, `${names.length} model${names.length === 1 ? '' : 's'} pulled${boardModel && boardModel !== 'apple:on-device' ? (has ? `, including the board's ${boardModel}` : `; the board's ${boardModel} is NOT pulled`) : ''}`);
    try {
      const ps = await getJson(`${OLLAMA}/api/ps`, { timeoutMs: 3000 });
      const loaded = (ps.body?.models || []).map((m) => m.name || m.model);
      if (boardModel === 'apple:on-device') report('skip', 'board model loaded', null, "the board's pick is Apple's model, not an Ollama one");
      else if (boardModel && loaded.includes(boardModel)) report('pass', 'board model loaded', null, `${boardModel} is in memory now`);
      else report('warn', 'board model loaded', null, `${boardModel || 'the default'} is not in memory now (loaded: ${loaded.join(', ') || 'nothing'}); the first local call pays the load${board?.local?.headroom && board.local.headroom.ok === false ? `. Headroom: ${board.local.headroom.reason}` : ''}`);
    } catch (e) {
      report('warn', 'board model loaded', null, `/api/ps did not answer: ${e.message}`);
    }
  }
} catch (e) {
  report('fail', 'Ollama', null, `no answer at ${OLLAMA}: ${e.cause?.code || e.message}`);
}

// ------------------------------------------------------------------ apple
{
  const bin = path.join(serverDir, 'bin', 'nova-apple-llm');
  if (!existsSync(bin)) report('warn', "Apple's on-device model", null, 'the helper is not built (bash server/apple-llm/build.sh)');
  else {
    const t0 = Date.now();
    const reply = await new Promise((resolve) => {
      const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
      let buf = '';
      const done = (v) => { clearTimeout(timer); try { p.kill('SIGTERM'); } catch { /* gone */ } resolve(v); };
      const timer = setTimeout(() => done({ error: 'no answer within 15 s' }), 15_000);
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', (c) => {
        buf += c;
        const nl = buf.indexOf('\n');
        if (nl >= 0) { try { done(JSON.parse(buf.slice(0, nl))); } catch (e) { done({ error: `reply was not JSON: ${e.message}` }); } }
      });
      p.on('error', (e) => done({ error: e.message }));
      p.on('exit', (code) => done({ error: `the helper exited (code ${code}) before answering` }));
      p.stdin.on('error', () => {});
      p.stdin.write(`${JSON.stringify({ op: 'health', id: 'preflight' })}\n`);
    });
    const ms = Date.now() - t0;
    if (reply.error) report('fail', "Apple's on-device model", ms, reply.error);
    else if (reply.ok) report('pass', "Apple's on-device model", ms, `available (${reply.availability || 'available'})`);
    else report('warn', "Apple's on-device model", ms, `the helper answered, the model is not available: ${reply.availability || 'no reason given'}`);
  }
}

// ------------------------------------------------------------------ think
const scratch = await mkdtemp(path.join(tmpdir(), 'nova-preflight-'));
{
  process.env.NOVA_DATA_DIR = scratch;   // nothing of his is written by this process
  const pick = board?.local?.preferredModel;
  if (pick) process.env.NOVA_LOCAL_LLM_MODEL = pick;
  try {
    const { completeLocal } = await import('../server/lib/localModel.js');
    const t0 = Date.now();
    const r = await completeLocal('Classify this capture as one of: task, note, food, workout. Reply with JSON only, like {"kind":"task"}. Capture: "buy oat milk on the way home"', {
      json: true, maxTokens: 40, timeoutMs: 60_000, waitForBoot: true,
    });
    const ms = Date.now() - t0;
    let kind = null;
    try { kind = JSON.parse(String(r.text).replace(/^```(?:json)?\s*|\s*```$/g, '')).kind; } catch { /* not JSON */ }
    budget.think = ms;
    if (kind) report('pass', 'local classify', ms, `${r.model} said "${kind}"`);
    else report('fail', 'local classify', ms, `${r.model} answered, but not the JSON asked for: ${String(r.text).slice(0, 80)}`);
  } catch (e) {
    report('fail', 'local classify', null, e.message);
  }
}

// ------------------------------------------------------------------ speak
let clip = null;
let ttsSentence = null;
try {
  const st = await getJson(`${LOCAL}/api/tts/status`, { headers: AUTH, timeoutMs: 5000 });
  const engine = st.body?.engine || null;
  if (!st.body?.configured) report('warn', 'voice', null, 'no TTS engine is configured on the Mac (the phone uses its own browser voice)');
  else if (engine === 'elevenlabs') report('warn', 'voice', null, 'the engine is ElevenLabs; preflight does not call it (it costs)');
  else {
    const now = new Date();
    ttsSentence = `Standing by. This is the preflight, rendered fresh at ${now.getHours()} ${String(now.getMinutes()).padStart(2, '0')} and ${now.getSeconds()} seconds, so the voice is measured for real.`;
    const t0 = Date.now();
    const res = await fetch(`${LOCAL}/api/tts`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsSentence }),
      signal: AbortSignal.timeout(120_000),
    });
    const firstByte = Date.now() - t0;
    if (!res.ok) {
      const why = await res.text().catch(() => '');
      report('fail', 'voice (Kokoro)', firstByte, `/api/tts answered ${res.status}: ${why.slice(0, 120)}`);
    } else {
      clip = Buffer.from(await res.arrayBuffer());
      budget.speak = firstByte;
      report('pass', 'voice (Kokoro)', firstByte, `first byte in ${firstByte} ms, ${Math.round(clip.length / 1024)} KB of audio, engine ${engine}${st.body?.ready ? '' : ' (status said not ready before the render)'}`);
    }
  }
} catch (e) {
  report('fail', 'voice', null, `could not ask the server: ${e.cause?.code || e.message}`);
}

// ------------------------------------------------------------------ hear
try {
  const tr = await import('../server/lib/transcribe.js');
  const be = await tr.loadWhisperBackend();
  if (!be) report('warn', 'ears', null, 'no transcriber is configured on the Mac (~/.config/watch/.env has no key)');
  else if (be.backend === 'groq' || be.backend === 'openai') report('warn', 'ears', null, `${be.backend === 'groq' ? 'Groq' : 'OpenAI'} (internet), not exercised: no local transcriber is wired yet`);
  else if (!clip) report('warn', 'ears', null, `${be.backend} on this Mac, but there was no voice clip to hear`);
  else {
    const t0 = Date.now();
    const r = await tr.transcribeBuffer(clip, { mime: 'audio/mpeg', prompt: '' });
    const ms = Date.now() - t0;
    budget.hear = ms;
    const said = words(ttsSentence);
    const heard = new Set(words(r.text));
    const hit = said.filter((w) => heard.has(w)).length / Math.max(1, said.length);
    if (hit >= 0.8) report('pass', 'ears', ms, `the voice and the ears agree (${Math.round(hit * 100)}% of words): "${r.text}"`);
    else report('fail', 'ears', ms, `the ears heard ${Math.round(hit * 100)}% of the words: "${r.text}"`);
  }
} catch (e) {
  report('fail', 'ears', null, e.message);
}
await rm(scratch, { recursive: true, force: true }).catch(() => {});

// ------------------------------------------------------------------ inbox
try {
  const { value, ms } = await timed(() => getJson(`${LOCAL}/api/inbox`, { headers: AUTH, timeoutMs: 10_000 }));
  if (value.ok && Array.isArray(value.body?.items)) report('pass', 'Inbox read', ms, `${value.body.items.length} items, ${value.body.pendingCount ?? '?'} pending`);
  else report('fail', 'Inbox read', ms, `answered ${value.status}`);
} catch (e) {
  report('fail', 'Inbox read', null, e.cause?.code || e.message);
}

// ------------------------------------------------------------------ vault
{
  const vault = envVal('VAULT_PATH');
  if (!vault) report('fail', 'vault', null, 'VAULT_PATH is not set in server/.env');
  else {
    try {
      const { value, ms } = await timed(() => readdir(vault));
      report('pass', 'vault', ms, `"${path.basename(vault)}" is readable (${value.length} entries at the top)`);
    } catch (e) {
      report('fail', 'vault', null, `"${path.basename(vault)}" could not be read: ${e.code || e.message}`);
    }
  }
}

// ------------------------------------------------------------------ drill route
try {
  const { value, ms } = await timed(() => getJson(`${LOCAL}/api/drill/needs`, { headers: AUTH, timeoutMs: 10_000 }));
  if (value.status === 404) report('warn', 'drill route', ms, 'not on the live server yet: it needs a reload (scripts/reload-server.mjs)');
  else if (value.ok) report('pass', 'drill route', ms, `${value.body.stillNeeds.length} features still need the internet or Claude`);
  else report('fail', 'drill route', ms, `answered ${value.status}`);
} catch (e) {
  report('fail', 'drill route', null, e.cause?.code || e.message);
}

// ------------------------------------------------------------------ summary
const s = (ms) => (ms == null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);
const total = [budget.hear, budget.think, budget.speak].filter((v) => v != null).reduce((a, b) => a + b, 0);
const n = (st) => results.filter((r) => r.status === st).length;
console.log('');
console.log(`LATENCY BUDGET: hear ${s(budget.hear)} · think ${s(budget.think)} · speak ${s(budget.speak)} · total ${s(total)}${budget.hear == null ? ' (no local ears to time)' : ''}`);
console.log(`SUMMARY: ${n('pass')} pass, ${n('fail')} fail, ${n('warn')} warn${n('skip') ? `, ${n('skip')} not run` : ''}`);
process.exit(n('fail') ? 1 : 0);

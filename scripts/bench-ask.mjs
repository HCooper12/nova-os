#!/usr/bin/env node
// ASK NOVA, TIMED — an isolated server instance, a fixed set of real
// questions, the real pipeline (reflex → verbs → coach/leader/ask →
// Claude Code job → TTS). Built so a before/after speed change can be
// measured without writing one byte into his live server/data, his real
// inbox, or his real conversation record.
//
// It boots `node index.js` (cwd server/) as a CHILD process with its own
// PORT and NOVA_DATA_DIR (a fresh temp dir — every lib/*.js file that reads
// process.env.NOVA_DATA_DIR, which is most of them, writes there instead of
// server/data). VAULT_PATH is left pointing at the real vault, because Ask
// Nova is read-only Q&A over it — nothing in this script's question set
// writes to a note. The API_TOKEN is read from server/.env, exactly as
// scripts/nova-api.mjs does, and used only against this child process.
//
// This spends real Claude Code turns — one per question, `--n` times.
// Keep the set small.
//
//   node scripts/bench-ask.mjs                       # the 8 default questions, once
//   node scripts/bench-ask.mjs --n 1 --out /tmp/nova-before.json
//   node scripts/bench-ask.mjs --only coach --n 3
//   node scripts/bench-ask.mjs --keep                # leave the temp dir behind
//
// Flags: --n (repeat count, default 1) --only reflex|nova|coach|leader
//        --port (default: first free port from 4200 (never 4190: undici's fetch bans it as a bad port)) --out (json path)
//        --set (path to a JSON file of {lane,text} to replace the default 8)
//        --timeout (ms per question, default 240000) --keep

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);
const N = Number(flag('n', '1')) || 1;
const ONLY = flag('only', null); // reflex|nova|coach|leader
const TIMEOUT_MS = Number(flag('timeout', '240000')) || 240_000;
const KEEP = has('keep');
const SET_PATH = flag('set', null);
const OUT_PATH_ARG = flag('out', null);

// ---------- default question set ----------
const DEFAULT_QUESTIONS = [
  { lane: 'reflex', text: 'how many steps today' },
  { lane: 'reflex', text: "what's my HRV" },
  { lane: 'nova', text: 'what did I log for lunch on Tuesday and was it enough protein' },
  { lane: 'nova', text: 'summarise my week in training' },
  { lane: 'nova', text: 'what is on my calendar tomorrow and what should I prepare' },
  { lane: 'coach', text: 'should I deload next week given my last three sessions' },
  { lane: 'coach', text: 'is my bench progressing or stalling' },
  { lane: 'leader', text: 'how should I open a hard conversation with a teammate who keeps missing deadlines' },
];

function loadQuestions() {
  let qs = DEFAULT_QUESTIONS;
  if (SET_PATH) {
    const raw = JSON.parse(readFileSync(path.resolve(SET_PATH), 'utf8'));
    if (!Array.isArray(raw)) throw new Error('--set file must be a JSON array of {lane,text}');
    qs = raw;
  }
  if (ONLY) qs = qs.filter((q) => q.lane === ONLY);
  if (!qs.length) throw new Error(`no questions after filtering --only ${ONLY}`);
  return qs;
}

// ---------- safety ----------
function readEnvFile(p) {
  const raw = readFileSync(p, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const serverEnvPath = path.join(SERVER_DIR, '.env');
const baseEnv = readEnvFile(serverEnvPath);
if (!baseEnv.API_TOKEN) throw new Error('API_TOKEN not set in server/.env — cannot authenticate to the child');
if (!baseEnv.VAULT_PATH) throw new Error('VAULT_PATH not set in server/.env');

async function freePort(start) {
  for (let p = start; p < start + 200; p += 1) {
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.listen(p, '127.0.0.1', () => srv.close(() => resolve(true)));
    });
    if (ok) return p;
  }
  throw new Error('no free port found');
}

const requestedPort = flag('port', null);
const port = requestedPort ? Number(requestedPort) : await freePort(4200);
if (port === 4173) throw new Error('refusing to run on 4173 — that is his live server');
// The TTS sidecar (server/lib/ttsLocal.js) binds a hardcoded-default port
// (NOVA_TTS_PORT, default 4175) that the real, already-running Nova server
// owns. Without its own port the bench child's sidecar crash-loops forever
// (Address already in use) and never settles — observed to starve the
// child enough that it never answered /api/health.
const ttsPort = await freePort(4176);

const dataDir = mkdtempSync(path.join(tmpdir(), 'nova-bench-data-'));
const liveDataDir = path.resolve(SERVER_DIR, 'data');
if (path.resolve(dataDir).startsWith(liveDataDir)) throw new Error('refusing to run with NOVA_DATA_DIR inside the repo\'s server/data');
console.log(`bench temp data dir: ${dataDir}`);
console.log(`bench child port: ${port}`);

// ---------- boot the child ----------
const headSha = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); }
  catch { return null; }
})();

const childEnv = {
  ...process.env,
  ...baseEnv,
  PORT: String(port),
  HOST: '127.0.0.1',
  NOVA_DATA_DIR: dataDir,
  ALLOWED_ORIGINS: `http://localhost:${port}`,
  // A fresh NOVA_DATA_DIR has no recall-vectors.json, so the embedding
  // scheduler (server/lib/embeddings.js) would re-embed the whole vault
  // (734 pages, measured ~5 real minutes) before the server could answer
  // even /api/health. embedderStatus() degrades HONESTLY when Ollama is
  // unreachable — recall stays lexical, nothing crashes — so pointing
  // OLLAMA_HOST at a closed port makes that check fail fast (~4s) instead
  // of running the real reindex every single bench boot.
  OLLAMA_HOST: 'http://127.0.0.1:1',
  NOVA_TTS_PORT: String(ttsPort),
};
// TELEGRAM_BOT_TOKEN is the real bot's token — a second long-poller on it
// (the live server already holds one) just steals it back and forth
// ("Conflict: terminated by other getUpdates request"), observed in the
// child's own log. The bridge is dormant without a token (lib/telegram.js),
// so dropping it here keeps the bench child from touching his real bot at
// all, rather than merely tolerating the fight.
// '' not delete: the child's `import 'dotenv/config'` would re-read server/.env and
// restore a deleted key, but never overrides one that is already set.
childEnv.TELEGRAM_BOT_TOKEN = '';
childEnv.TELEGRAM_CHAT_ID = '';

const child = spawn('node', ['index.js'], { cwd: SERVER_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let stderrBuf = '';
let stdoutBuf = '';
child.stdout.on('data', (d) => { stdoutBuf += d.toString(); });
child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

let killed = false;
function killChild() {
  if (killed) return;
  killed = true;
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
  setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 3000);
  // the TTS sidecar is a grandchild (python) and outlives the server; it is
  // ours (own NOVA_TTS_PORT), so reap it by that port
  try {
    for (const pid of execFileSync('lsof', ['-nP', '-tiTCP:' + ttsPort, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n').filter(Boolean)) process.kill(Number(pid), 'SIGTERM');
  } catch { /* nothing listening */ }
}
process.on('exit', killChild);
process.on('SIGINT', () => { killChild(); process.exit(130); });

const base = `http://127.0.0.1:${port}`;
const authHeaders = { Authorization: `Bearer ${baseEnv.API_TOKEN}`, 'Content-Type': 'application/json' };

// A cold NOVA_DATA_DIR means every cache (brief, TTS, model-watch) starts
// empty, and several boot-time schedulers fire off real CLI/network calls
// to warm them (observed: ~2 real minutes before the event loop was free
// enough to answer a plain GET). 300s gives that room without hanging
// forever on a genuinely broken child.
async function waitForHealth(timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let lastReport = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`child exited early (code ${child.exitCode}) before health answered.\n--- stderr ---\n${stderrBuf.slice(-4000)}\n--- stdout ---\n${stdoutBuf.slice(-2000)}`);
    }
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000), headers: { connection: 'close' } });
      if (r.ok) return true;
    } catch { /* not listening/answering yet */ }
    if (Date.now() - lastReport > 15_000) {
      lastReport = Date.now();
      console.log(`  still waiting (${Math.round((Date.now() - (deadline - timeoutMs)) / 1000)}s elapsed) — cold boot is warming caches; see bench temp data dir for logs if this runs long`);
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`child never answered /api/health within ${timeoutMs}ms.\n--- stderr ---\n${stderrBuf.slice(-4000)}\n--- stdout ---\n${stdoutBuf.slice(-2000)}`);
}

console.log('waiting for child /api/health …');
await waitForHealth(300_000);
console.log('child is up.');

// a voice id, if the TTS engine offers one, so /api/ask carries one as the phone does
let voiceId;
try {
  const r = await fetch(`${base}/api/tts/status`, { headers: authHeaders });
  if (r.ok) { const j = await r.json(); voiceId = j?.voices?.[0]?.id; }
} catch { /* tts not configured — ask without one, like a fresh device */ }

// ---------- one question ----------
const SENTENCE_RE = /[.?!](?:\s|$)/;

async function pollJob(jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const t0 = Date.now();
  let tFirstText = null, tFirstSentence = null, tDone = null, finalText = '', consult = null, error = null, status = 'running';
  let seenAny = '';
  while (Date.now() < deadline) {
    const r = await fetch(`${base}/api/claude-code/message/${encodeURIComponent(jobId)}`, { headers: authHeaders });
    const j = await r.json().catch(() => ({}));
    status = j.status;
    const partialText = typeof j.partial === 'string' ? j.partial : '';
    const streamText = j.stageLine || partialText;
    if (streamText && streamText.length > seenAny.length) {
      seenAny = streamText;
      if (tFirstText === null) tFirstText = Date.now() - t0;
      if (tFirstSentence === null && SENTENCE_RE.test(partialText)) tFirstSentence = Date.now() - t0;
    }
    if (j.consult?.length) consult = j.consult.map((c) => c.who || c.agent || c);
    if (status === 'ready' || status === 'error') {
      tDone = Date.now() - t0;
      finalText = j.result?.text || '';
      if (tFirstSentence === null && SENTENCE_RE.test(finalText)) tFirstSentence = Math.min(tDone, (tFirstText ?? tDone));
      error = j.error || null;
      break;
    }
    await new Promise((res) => setTimeout(res, 150));
  }
  if (tDone === null) error = error || `timed out after ${timeoutMs}ms (last status: ${status})`;
  return { tFirstText, tFirstSentence, tDone, finalText, consult, error, status };
}

function firstSentenceOf(text) {
  const m = text.match(/^(.*?[.?!])(\s|$)/s);
  return m ? m[1] : text.slice(0, 160);
}

async function askOne(q) {
  const t0 = Date.now();
  const row = { question: q.text, lane: q.lane, ok: false };
  let res;
  try {
    const r = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ question: q.text, sessionId: null, device: 'other', spoken: true, ...(voiceId ? { voiceId } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    row.t_ask = Date.now() - t0;
    res = await r.json();
  } catch (e) {
    row.t_ask = Date.now() - t0;
    row.error = `POST /api/ask failed: ${e.message}`;
    return row;
  }
  row.ack = res.ack ? (res.ack.text || res.ack) : null;
  if (res.reflex) {
    // code answered in the /api/ask response itself — no job to poll
    row.t_firstText = row.t_ask;
    row.t_firstSentence = SENTENCE_RE.test(res.text || '') ? row.t_ask : null;
    row.t_done = row.t_ask;
    row.chars = (res.text || '').length;
    row.ok = true;
    var finalTextForTts = res.text || '';
  } else if (res.jobId) {
    const polled = await pollJob(res.jobId, TIMEOUT_MS);
    row.t_firstText = polled.tFirstText;
    row.t_firstSentence = polled.tFirstSentence;
    row.t_done = polled.tDone;
    row.chars = polled.finalText.length;
    row.consult = polled.consult;
    row.error = polled.error || null;
    row.ok = !polled.error && polled.status === 'ready';
    finalTextForTts = polled.finalText;
  } else if (res.error) {
    row.error = res.error;
    finalTextForTts = '';
  } else {
    row.error = 'no ack, jobId or error in /api/ask response';
    finalTextForTts = '';
  }
  // TTS of the first sentence, timed and cache-hinted
  const firstSentence = firstSentenceOf(finalTextForTts || row.ack || '');
  if (firstSentence) {
    const tTts0 = Date.now();
    try {
      const r = await fetch(`${base}/api/tts`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ text: firstSentence, ...(voiceId ? { voiceId } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      row.t_tts = Date.now() - tTts0;
      row.tts_ok = r.ok;
      row.tts_fast = row.t_tts < 300;
    } catch (e) {
      row.t_tts = Date.now() - tTts0;
      row.tts_ok = false;
      row.tts_error = e.message;
    }
  }
  return row;
}

// ---------- run ----------
const questions = loadQuestions();
const rows = [];
for (let rep = 0; rep < N; rep += 1) {
  for (const q of questions) {
    console.log(`asking [${q.lane}] (${rep + 1}/${N}): ${q.text}`);
    const row = await askOne(q);
    rows.push(row);
    console.log(`  -> ok=${row.ok} t_ask=${row.t_ask} t_firstText=${row.t_firstText} t_firstSentence=${row.t_firstSentence} t_tts=${row.t_tts} t_done=${row.t_done} chars=${row.chars}${row.error ? ` ERROR: ${row.error}` : ''}`);
  }
}

// ---------- report ----------
function median(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

const laneOrder = ['reflex', 'nova', 'coach', 'leader'];
console.log('\n--- results ---');
const header = ['lane', 'question', 'ack', 't_ask', 't_firstText', 't_firstSentence', 't_tts', 't_done', 'chars', 'ok'];
console.log(header.join(' | '));
for (const row of rows) {
  console.log([
    row.lane, row.question.slice(0, 40), row.ack ? 'yes' : 'no',
    row.t_ask, row.t_firstText, row.t_firstSentence, row.t_tts, row.t_done, row.chars, row.ok,
  ].join(' | '));
}
console.log('\n--- medians per lane ---');
for (const lane of laneOrder) {
  const ls = rows.filter((r) => r.lane === lane);
  if (!ls.length) continue;
  console.log(`${lane}: t_ask=${median(ls.map((r) => r.t_ask))} t_firstText=${median(ls.map((r) => r.t_firstText))} t_firstSentence=${median(ls.map((r) => r.t_firstSentence))} t_tts=${median(ls.map((r) => r.t_tts))} t_done=${median(ls.map((r) => r.t_done))}`);
}

const errored = rows.filter((r) => r.error);
if (errored.length) {
  console.log('\n--- errors ---');
  for (const r of errored) console.log(`[${r.lane}] ${r.question}: ${r.error}`);
}

const outPath = OUT_PATH_ARG
  ? path.resolve(OUT_PATH_ARG)
  : path.join(HERE, '..', `bench-nova-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), headSha, port, dataDir, n: N, only: ONLY, rows }, null, 2));
console.log(`\nwrote ${outPath}`);

killChild();
if (!KEEP) {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
} else {
  console.log(`--keep: left temp data dir at ${dataDir}`);
}

process.exitCode = errored.length ? 1 : 0;

#!/usr/bin/env node
// The bench for Ask Nova on the model on this Mac (lib/localAsk.js): his own
// last N questions to Nova, from the conversation record, each answered by
// the local model over his REAL vault, read-only. Writes
// <out>/local-ask-bench.json and <out>/local-ask-bench.md (question, local
// answer, the lookups it made, ms). `--with-claude` also asks Claude's Ask
// Nova each question for a side-by-side; that spends his usage, so it is off
// by default.
//
//   node server/scripts/benchLocalAsk.mjs --vault "$VAULT_PATH" --out /tmp/bench [--n 12] [--with-claude]
//
// WHAT IT NEVER DOES:
//   - write the conversation record. It is READ ONCE, before NOVA_DATA_DIR is
//     moved; after that every server module writes into a scratch copy of
//     server/data (the conversation folder is not even copied), and the run
//     ends by checking the real record's files were not touched (the mtime
//     check: a headless run once wrote into his real record).
//   - file, act or remember. Both lanes run `dryRun`: the reply comes back as
//     the model wrote it; no PROPOSE, ACT, SHOW, CARD or consult is run, and
//     the vault tools are read-only by construction.
// The local model must be running or loadable (memory headroom); a turn that
// cannot be answered is recorded with its error, never skipped.
import { cp, mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const N = Math.max(1, Math.min(100, Number(arg('n', 12)) || 12));
const OUT = arg('out');
const VAULT = arg('vault', process.env.VAULT_PATH || '');
const WITH_CLAUDE = flag('with-claude');
const REAL_DATA = arg('data', process.env.NOVA_DATA_DIR || path.join(SERVER_DIR, 'data'));
if (!OUT) { console.error('--out <dir> is required'); process.exit(2); }
if (!VAULT || !existsSync(VAULT)) { console.error('--vault <path> (or VAULT_PATH) must name his vault'); process.exit(2); }

// the conversation record's files and their mtimes, to prove it untouched
async function recordStamp() {
  const dir = path.join(REAL_DATA, 'conversation');
  const out = {};
  try {
    for (const f of await readdir(dir)) out[f] = (await stat(path.join(dir, f))).mtimeMs;
  } catch { /* no record */ }
  return out;
}

// 1. READ his questions, with the real data dir, before anything else loads
process.env.NOVA_DATA_DIR = REAL_DATA;
const before = await recordStamp();
const { readTurns } = await import('../lib/conversationLog.js');
const rows = await readTurns({ limit: 400 });
const questions = rows
  .filter((r) => r.who === 'you' && typeof r.text === 'string' && r.text.trim().length > 3)
  .map((r) => ({ at: r.at, via: r.via || null, q: r.text.trim() }))
  .slice(-N);
if (!questions.length) { console.error('no questions of his in the conversation record'); process.exit(1); }

// 2. MOVE every write to a scratch copy of server/data (no conversation folder)
const scratch = await mkdtemp(path.join(os.tmpdir(), 'nova-local-ask-bench-'));
await cp(REAL_DATA, scratch, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(REAL_DATA, src);
    return !(rel === 'conversation' || rel.startsWith(`conversation${path.sep}`) || rel === 'jobs' || rel.startsWith(`jobs${path.sep}`));
  },
}).catch((e) => console.log(`(copying server/data partly failed: ${e.message}; the bench runs on what copied)`));
process.env.NOVA_DATA_DIR = scratch;
process.env.VAULT_PATH = VAULT;

const { startAskLocal } = await import('../lib/localAsk.js');
const { getMessageJob, startAskNova, _dropAllWarm } = await import('../lib/claudeCode.js');

async function settle(jobId, ms = 180_000) {
  const t0 = Date.now();
  for (;;) {
    const j = getMessageJob(jobId);
    if (j && j.status !== 'running') return j;
    if (Date.now() - t0 > ms) return { status: 'error', error: 'the bench gave up waiting' };
    await new Promise((r) => setTimeout(r, 100));
  }
}

const results = [];
for (const [i, item] of questions.entries()) {
  console.log(`[${i + 1}/${questions.length}] ${item.q.slice(0, 80)}`);
  const t0 = Date.now();
  let local;
  try {
    local = await settle(startAskLocal(VAULT, { question: item.q }, { dryRun: true }));
  } catch (e) {
    local = { status: 'error', error: e.message };
  }
  const row = {
    question: item.q,
    at: item.at,
    via: item.via,
    local: local.status === 'ready' ? local.result.text : null,
    localError: local.status === 'ready' ? null : local.error,
    tools: local.result?.lookups || [],
    ms: Date.now() - t0,
  };
  if (WITH_CLAUDE) {
    const c0 = Date.now();
    try {
      const { buildAskContext } = await import('../lib/askContext.js');
      const context = await buildAskContext(VAULT, null, { fast: true }).catch(() => '');
      const claude = await settle(startAskNova(VAULT, { question: item.q, context, dryRun: true }));
      row.claude = claude.status === 'ready' ? claude.result.text : null;
      row.claudeError = claude.status === 'ready' ? null : claude.error;
    } catch (e) {
      row.claude = null;
      row.claudeError = e.message;
    }
    row.claudeMs = Date.now() - c0;
  }
  results.push(row);
}
_dropAllWarm();

// 3. WRITE the bench, and prove the record untouched
await mkdir(OUT, { recursive: true });
const after = await recordStamp();
const touched = Object.keys(after).filter((f) => before[f] !== after[f]);
const report = { at: new Date().toISOString(), vault: VAULT, n: results.length, withClaude: WITH_CLAUDE, scratch, recordTouched: touched, results };
await writeFile(path.join(OUT, 'local-ask-bench.json'), JSON.stringify(report, null, 2));
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').slice(0, 400);
const head = WITH_CLAUDE ? '| # | Question | Local answer | Tools | ms | Claude answer | ms |\n|---|---|---|---|---|---|---|' : '| # | Question | Local answer | Tools | ms |\n|---|---|---|---|---|';
const lines = results.map((r, i) => {
  const tools = r.tools.map((t) => `${t.name}(${cell(Object.values(t.args || {}).join(', '))})`).join('; ') || 'none';
  const local = r.local ?? `ERROR: ${r.localError}`;
  const base = `| ${i + 1} | ${cell(r.question)} | ${cell(local)} | ${cell(tools)} | ${r.ms} |`;
  return WITH_CLAUDE ? `${base} ${cell(r.claude ?? `ERROR: ${r.claudeError}`)} | ${r.claudeMs} |` : base;
});
const md = `# Ask Nova on this Mac: bench\n\n${report.at} · ${results.length} of his questions · vault ${VAULT}\n\nConversation record touched by the run: ${touched.length ? touched.join(', ') : 'no'}\n\n${head}\n${lines.join('\n')}\n`;
await writeFile(path.join(OUT, 'local-ask-bench.md'), md);
console.log(`wrote ${path.join(OUT, 'local-ask-bench.json')} and .md${touched.length ? ` — WARNING: the conversation record changed during the run: ${touched.join(', ')}` : ''}`);
process.exit(touched.length ? 1 : 0);

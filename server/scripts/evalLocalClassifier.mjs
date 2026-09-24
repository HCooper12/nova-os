#!/usr/bin/env node
// Measures a candidate local MLX model against Claude Haiku on the real
// inbox-classify task, before anything switches over to it. Groundwork for
// Nova's "private lane" (see design/audits/2026-09-25-local-model-eval.md).
//
// THE PROMPT PROBLEM, and how this script avoids it: lib/inbox.js's
// buildPrompt() — the exact text the inbox classifier sends the model — is
// a private (unexported) function, on purpose (it is not part of inbox.js's
// public surface, and this script must not fork a second copy of it that
// could drift from the real one). So this script never reconstructs that
// prompt itself. Instead it calls captureForReview() — the REAL exported
// entry point classify() runs behind — and, for the one call per item where
// that entry point spawns the `claude` CLI, substitutes CLAUDE_BIN for a
// transparent relay: a tiny script that (a) writes the exact args it was
// invoked with to a file, then (b) execs the real `claude` binary with
// those SAME args and relays its stdio straight through. classify()'s
// behaviour is completely unchanged; this only observes, once, the prompt
// text it was about to send — the runtime-generated prompt, read honestly,
// never a hand-copied guess at it.
//
// The same call gives us Haiku's real decision AND the real prompt in one
// shot, so Haiku is asked exactly once per item — the local model candidates
// are then measured against that single captured prompt+decision, however
// many candidates are tried. That is what keeps this under the ~60-call
// Claude budget for the whole session, not per model.
//
// NOVA_DATA_DIR is pointed at a scratch directory for the whole run, so
// captureForReview()'s pending records never touch his real
// server/data/inbox.json (that file is only ever READ here, never written).

import { readFile, writeFile, mkdir, mkdtemp, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(__dirname, '..');
const REAL_INBOX_JSON = path.join(SERVER_DIR, 'data', 'inbox.json');

// Real captures never leave server/ or the audit file, and this script never
// prints more than short excerpts — see the module docstring in
// design/audits/2026-09-25-local-model-eval.md for the reasoning.
function excerpt(text, n = 60) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ------------------------------- CLI args -------------------------------- */

function parseArgs(argv) {
  const out = { models: [], limit: 40 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') out.models.push(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]) || 40;
    else if (a === '--out') out.outDir = argv[++i];
  }
  return out;
}

/* -------------------------- output directory ------------------------------ */

// server/data is entirely gitignored (checked: .gitignore line 6), so raw
// per-item results land there. Falls back to the scratch tree only if that
// ever stops being true.
async function resolveOutDir(explicit) {
  if (explicit) { await mkdir(explicit, { recursive: true }); return explicit; }
  const gitignore = await readFile(path.join(REPO_ROOT, '.gitignore'), 'utf8').catch(() => '');
  const covered = gitignore.split('\n').some((l) => l.trim() === 'server/data');
  const dir = covered
    ? path.join(SERVER_DIR, 'data', 'local-eval')
    : path.join(os.tmpdir(), 'nova-local-eval');
  await mkdir(dir, { recursive: true });
  return dir;
}

/* --------------------------- candidate selection --------------------------- */

const CLASSIFY_MODES = new Set(['review-all', 'auto-high', 'auto-all']);

// Which records in his real inbox history are genuine inbox-classify
// captures (kind unset, made through startCapture/captureForReview — see
// inbox.js), vs. records other lanes (dispatch, coach, plan-today, …) write
// into the SAME store reusing a 'route' field of their own. Only the former
// have a decision.route that means what ROUTES means here, so only they
// carry a real "did he keep it" outcome for this classifier.
function isGenuineCapture(it) {
  return !it.kind && CLASSIFY_MODES.has(it.mode) && (it.source === 'text' || it.source === 'voice') && !!(it.text || '').trim();
}

function outcomeFor(it) {
  if (it.status === 'filed') return { known: true, accepted: true, route: it.decision?.route };
  if (it.status === 'discarded') return { known: true, accepted: false, route: it.decision?.route };
  return { known: false, accepted: null, route: null };
}

async function selectCandidates(limit) {
  const raw = JSON.parse(await readFile(REAL_INBOX_JSON, 'utf8'));
  const items = Array.isArray(raw.items) ? raw.items : [];
  const withText = items.filter((it) => (it.text || '').trim());

  const genuine = withText.filter(isGenuineCapture);
  const rest = withText.filter((it) => !isGenuineCapture(it))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const picked = [...genuine, ...rest].slice(0, limit);
  return picked.map((it) => {
    const genuineRecord = isGenuineCapture(it);
    const outcome = genuineRecord ? outcomeFor(it) : { known: false, accepted: null, route: null };
    return { id: it.id, text: it.text, genuineRecord, outcome };
  });
}

/* --------------------------- the CLAUDE_BIN relay --------------------------- */

// Writes a small Node relay script to a scratch dir and returns its path.
// It captures the exact args classify() invokes CLAUDE_BIN with (in
// particular the -p prompt) to NOVA_EVAL_PROMPT_CAPTURE, then execs the
// real claude binary with those same args, stdio inherited straight
// through — classify() sees no difference at all.
async function makeClaudeRelay() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-eval-relay-'));
  const relayPath = path.join(dir, 'claude-relay.mjs');
  const src = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const pIdx = args.indexOf('-p');
const prompt = pIdx >= 0 ? (args[pIdx + 1] || '') : '';
const capturePath = process.env.NOVA_EVAL_PROMPT_CAPTURE;
if (capturePath) writeFileSync(capturePath, prompt, 'utf8');
const real = process.env.NOVA_EVAL_REAL_CLAUDE_BIN;
const res = spawnSync(real, args, { stdio: 'inherit' });
process.exit(res.status == null ? 1 : res.status);
`;
  await writeFile(relayPath, src, 'utf8');
  await chmod(relayPath, 0o755);
  return relayPath;
}

function findRealClaudeBin() {
  const fromEnv = process.env.CLAUDE_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const homeDefault = path.join(os.homedir(), '.local', 'bin', 'claude');
  if (existsSync(homeDefault)) return homeDefault;
  try {
    const found = execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch { /* fall through */ }
  throw new Error('could not locate the real `claude` CLI binary (checked CLAUDE_BIN, ~/.local/bin/claude, `which claude`)');
}

/* ------------------------------ Haiku baseline ------------------------------ */

const MAX_HAIKU_CALLS = 60;

async function prepareHaikuBaseline(candidates, { captureForReview }) {
  if (candidates.length > MAX_HAIKU_CALLS) {
    throw new Error(`refusing to run ${candidates.length} Haiku calls — over the ${MAX_HAIKU_CALLS}-call session budget`);
  }
  // NOTE: inbox.js reads process.env.CLAUDE_BIN into a MODULE-LEVEL const at
  // import time, not per call — so the relay must already be in place and
  // CLAUDE_BIN already pointed at it BEFORE lib/inbox.js is first imported.
  // main() sets that up; this only sets the per-call capture path.
  const capturePath = path.join(os.tmpdir(), `nova-eval-prompt-${process.pid}.txt`);
  process.env.NOVA_EVAL_PROMPT_CAPTURE = capturePath;

  const prepared = [];
  try {
    for (const c of candidates) {
      const started = Date.now();
      try {
        const record = await captureForReview(null, { text: c.text, source: 'text' });
        const ms = Date.now() - started;
        const prompt = existsSync(capturePath) ? await readFile(capturePath, 'utf8') : null;
        prepared.push({
          ...c,
          prompt,
          haiku: { ok: true, route: record.decision?.route, decision: record.decision, ms, error: null },
        });
      } catch (e) {
        const ms = Date.now() - started;
        const prompt = existsSync(capturePath) ? await readFile(capturePath, 'utf8') : null;
        prepared.push({ ...c, prompt, haiku: { ok: false, route: null, decision: null, ms, error: e.message } });
      }
      process.stdout.write(`  haiku: ${excerpt(c.text, 40).padEnd(42)} → ${prepared.at(-1).haiku.route || 'PARSE FAIL'} (${prepared.at(-1).haiku.ms}ms)\n`);
    }
  } finally {
    delete process.env.NOVA_EVAL_PROMPT_CAPTURE;
  }
  return prepared;
}

/* -------------------------------- stats ------------------------------------- */

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(results) {
  const n = results.length;
  const parsedOk = results.filter((r) => r.local.parsedOk);
  const withHaiku = results.filter((r) => r.haiku.ok && r.local.parsedOk);
  const agreeHaiku = withHaiku.filter((r) => r.local.route === r.haiku.route);
  const knownOutcome = results.filter((r) => r.outcome.known && r.outcome.accepted === true);
  const agreeAccepted = knownOutcome.filter((r) => r.local.parsedOk && r.local.route === r.outcome.route);
  const localMs = results.map((r) => r.local.ms).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const haikuMs = results.map((r) => r.haiku.ms).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  return {
    n,
    parseRate: n ? parsedOk.length / n : 0,
    routeAgreement: withHaiku.length ? agreeHaiku.length / withHaiku.length : null,
    routeAgreementN: withHaiku.length,
    acceptedAgreement: knownOutcome.length ? agreeAccepted.length / knownOutcome.length : null,
    acceptedAgreementN: knownOutcome.length,
    localMsMedian: percentile(localMs, 50),
    localMsP90: percentile(localMs, 90),
    haikuMsMedian: percentile(haikuMs, 50),
    haikuMsP90: percentile(haikuMs, 90),
  };
}

/* ------------------------------ per-model run ------------------------------- */

// Samples RSS until `state.done` is set — driven by the item loop finishing,
// never a guessed duration, so this never outlives the work it's measuring.
async function measurePeakRssMB(pid, state, everyMs = 1000) {
  if (!pid) return null;
  let peakKB = 0;
  while (!state.done) {
    try {
      const out = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim();
      const kb = Number(out);
      if (Number.isFinite(kb)) peakKB = Math.max(peakKB, kb);
    } catch { break; } // process gone
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return peakKB ? Math.round(peakKB / 1024) : null;
}

async function runModelEval(modelId, prepared, lib) {
  const { ensureLocalModel, completeLocal, stopLocalModel, localModelPid } = lib;
  process.env.NOVA_LOCAL_LLM_MODEL = modelId;
  console.log(`\nbooting ${modelId} …`);
  const bootStarted = Date.now();
  await ensureLocalModel();
  console.log(`  ready in ${Date.now() - bootStarted}ms`);

  // sample RSS in the background across the whole eval run for this model —
  // stops the moment the item loop below finishes, never a guessed duration
  let peakRssMB = null;
  const pid = localModelPid();
  const rssState = { done: false };
  const rssWatch = pid ? measurePeakRssMB(pid, rssState, 1000).then((v) => { peakRssMB = v; }) : Promise.resolve();

  const results = [];
  for (const item of prepared) {
    if (!item.prompt) {
      results.push({ ...item, local: { ok: false, parsedOk: false, route: null, ms: null, error: 'no captured prompt' } });
      continue;
    }
    const started = Date.now();
    try {
      const { text } = await completeLocal(item.prompt, { maxTokens: 700, temperature: 0, timeoutMs: 60_000 });
      const ms = Date.now() - started;
      let route = null;
      let parsedOk = false;
      let error = null;
      try {
        const { firstBalancedObjectMatch, parseModelJson } = lib.jsonSalvage;
        const match = firstBalancedObjectMatch(text);
        if (!match) throw new Error('no JSON object in reply');
        const parsed = parseModelJson(match[0]);
        const normalized = lib.normalizeDecision(parsed);
        route = normalized.route;
        parsedOk = true;
      } catch (e) {
        error = e.message;
      }
      results.push({ ...item, local: { ok: true, parsedOk, route, ms, error, rawLen: text.length } });
      console.log(`  local: ${excerpt(item.text, 40).padEnd(42)} → ${route || 'PARSE FAIL'} (${ms}ms)${error ? `  [${error}]` : ''}`);
    } catch (e) {
      const ms = Date.now() - started;
      results.push({ ...item, local: { ok: false, parsedOk: false, route: null, ms, error: e.message } });
      console.log(`  local: ${excerpt(item.text, 40).padEnd(42)} → ERROR (${ms}ms) [${e.message}]`);
    }
  }

  rssState.done = true;
  await rssWatch;
  stopLocalModel();
  return { modelId, results, peakRssMB };
}

/* ---------------------------------- main ------------------------------------ */

async function main() {
  const { models, limit, outDir: outDirArg } = parseArgs(process.argv.slice(2));
  if (!models.length) {
    console.error('usage: evalLocalClassifier.mjs --model <mlx-model-id> [--model <another>] [--limit 40]');
    process.exit(1);
  }

  // Isolate every write this run makes from his real inbox history.
  const scratchData = await mkdtemp(path.join(os.tmpdir(), 'nova-eval-data-'));
  process.env.NOVA_DATA_DIR = scratchData;

  const outDir = await resolveOutDir(outDirArg);

  // inbox.js reads CLAUDE_BIN into a module-level const at import time, so
  // the relay has to exist and CLAUDE_BIN has to point at it BEFORE the
  // first `import('../lib/inbox.js')` anywhere in this process.
  const relayPath = await makeClaudeRelay();
  const realClaudeBin = findRealClaudeBin();
  process.env.CLAUDE_BIN = relayPath;
  process.env.NOVA_EVAL_REAL_CLAUDE_BIN = realClaudeBin;
  console.log(`relay in place: CLAUDE_BIN=${relayPath} → real claude at ${realClaudeBin}`);

  const inboxLib = await import('../lib/inbox.js');
  const localModelLib = await import('../lib/localModel.js');
  const jsonSalvageLib = await import('../lib/jsonSalvage.js');

  console.log(`selecting up to ${limit} real records from server/data/inbox.json …`);
  const candidates = await selectCandidates(limit);
  const genuineCount = candidates.filter((c) => c.genuineRecord).length;
  console.log(`  ${candidates.length} selected (${genuineCount} genuine inbox-classify captures with a known outcome pool, ${candidates.length - genuineCount} other real captured text used to reach the requested count)`);

  console.log(`\nrunning Haiku baseline (${candidates.length} calls, budget ${MAX_HAIKU_CALLS}) …`);
  const prepared = await prepareHaikuBaseline(candidates, inboxLib);
  await writeFile(path.join(outDir, 'prepared-haiku-baseline.json'), JSON.stringify(prepared, null, 2), 'utf8');

  const allSummaries = [];
  for (const modelId of models) {
    const { results, peakRssMB } = await runModelEval(modelId, prepared, {
      ensureLocalModel: localModelLib.ensureLocalModel,
      completeLocal: localModelLib.completeLocal,
      stopLocalModel: localModelLib.stopLocalModel,
      localModelPid: localModelLib.localModelPid,
      normalizeDecision: inboxLib.normalizeDecision,
      jsonSalvage: jsonSalvageLib,
    });
    const stats = summarize(results);
    const slug = modelId.replace(/[^a-zA-Z0-9]+/g, '-');
    await writeFile(path.join(outDir, `${slug}.json`), JSON.stringify({ modelId, stats, peakRssMB, results }, null, 2), 'utf8');
    allSummaries.push({ modelId, ...stats, peakRssMB });
    console.log(`\n=== ${modelId} ===`);
    console.log(JSON.stringify({ ...stats, peakRssMB }, null, 2));
  }

  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(allSummaries, null, 2), 'utf8');
  console.log(`\nraw results written to ${outDir}`);
  console.log(JSON.stringify(allSummaries, null, 2));
}

main().catch((e) => {
  console.error('eval failed:', e.stack || e.message);
  process.exit(1);
});

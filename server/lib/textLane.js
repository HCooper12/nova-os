import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {
  modelFor, effortArgs, laneEnabled, laneOffError, providerFor, laneCanRunLocal, fallbackEnabled, refreshLocalStatus, laneThinks,
} from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope, recordRun } from './modelSpend.js';
import { completeLocal, localModelConfigured, localBackend } from './localModel.js';

// THE TEXT-LANE RUNNER (19 Oct 2026). The one-shot lanes that are pure text
// in, text out (no tools, no vault reads: boundaryArgs('')) all had the same
// fifteen lines: spawn the CLI, collect stdout, parseEnvelope, read
// `result`. This is those fifteen lines once, plus the one thing they could
// not do on their own: answer on the small model on this Mac
// (lib/localModel.js) when he chose that for the lane, or when Claude is at
// the account's usage limit, or fails before any answer (offline, a CLI
// that cannot start), and the board's fallback is on.
//
// Each lane keeps its own prompt and its own parsing; this returns the raw
// text and who wrote it. The model only ever produces text here; the lane's
// own tested code decides what, if anything, is written.
//
// Honest by construction: a local failure is an error with its reason, never
// an empty string, and a limit that could not be covered is the limit error
// itself (err.limited stays true, so every lane's existing honest handling
// still applies), with the reason the local model could not stand in added.
//
// LOCAL FIRST, CLAUDE AS THE ESCALATION (27 Oct 2026). Since local-first is
// the board's default (lib/modelPrefs.js localFirst), a `local: true` lane
// runs here first, and when this Mac cannot answer for ANY reason before a
// word exists (nothing installed, no memory to load, a load that timed out,
// an HTTP refusal, an empty reply, thinking that ate the budget) Claude
// answers instead, and the result says so: `escalated: true` and a plain
// `reason`. Both runs are on the ledger: the local failure with its error,
// Claude's as an ordinary run. The other direction (a lane pinned to Claude
// that hits the limit, answered here) is unchanged.

const CLAUDE_BIN_DEFAULT = () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

// For a lane whose answer must be JSON: the small model is told so plainly,
// because it is likelier than Claude to wrap the JSON in prose or fences.
const JSON_SYSTEM = 'Reply with only the JSON the request asks for: no prose, no markdown, no code fences.';

function isEnvelope(stdout) {
  try { const o = JSON.parse(stdout); return !!o && typeof o === 'object'; } catch { return false; }
}

function spawnClaude(lane, prompt, spawnImpl) {
  return new Promise((resolve, reject) => {
    const spawn = spawnImpl || nodeSpawn;
    const CLAUDE_BIN = CLAUDE_BIN_DEFAULT();
    const started = Date.now();
    // stdin closed: an open pipe makes the CLI wait 3 s for input (measured 18 Oct 2026)
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(''),
      '--output-format', 'json',
      // pinned from the model board (lib/modelPrefs.js); never the ambient default
      '--model', modelFor(lane),
      // --effort rides every spawn (lib/modelPrefs.js effortArgs; [] on a CLI
      // without the flag), so the account's ambient xhigh never reaches a lane
      ...effortArgs(lane),
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    // the CLI never ran (missing binary, no permission): nothing was said
    child.on('error', (e) => { e.beforeOutput = true; e.fallbackReason = 'Claude could not be started'; reject(e); });
    child.on('close', (code) => {
      try {
        // the envelope is read before the exit code, so a limit notice on a
        // non-zero exit is still recognised as the limit (parseEnvelope keeps
        // the non-zero-exit-is-a-failure rule for everything else)
        const outer = parseEnvelope(stdout, { lane, code, stderr });
        resolve({
          text: String(outer?.result ?? ''),
          provider: 'claude',
          model: modelFor(lane),
          ms: Number.isFinite(outer?.duration_ms) ? outer.duration_ms : Date.now() - started,
          fallback: false,
        });
      } catch (e) {
        // no envelope at all: the process failed before it produced an
        // answer (offline, crashed, killed), so a stand-in loses nothing
        if (!e.limited && !isEnvelope(stdout)) {
          e.beforeOutput = true;
          e.fallbackReason = 'Claude could not answer';
        }
        reject(e);
      }
    });
  });
}

async function runLocal(lane, prompt, { maxTokens, json, fallback, reason = null }) {
  const started = Date.now();
  try {
    const out = await completeLocal(prompt, {
      maxTokens,
      temperature: 0,
      waitForBoot: true,
      system: json ? JSON_SYSTEM : null,
      // Ollama constrains the output to JSON as well as being told to
      json,
      // off unless the lane is marked to reason (lib/modelPrefs.js laneThinks)
      think: laneThinks(lane),
    });
    recordRun(lane, {
      usd: 0, ms: out.ms, model: `local:${out.model}`, inputTokens: null, outputTokens: null, provider: 'local', fallback, reason,
    });
    return { text: out.text, provider: 'local', model: out.model, ms: out.ms, fallback, reason };
  } catch (e) {
    recordRun(lane, {
      usd: 0, ms: Date.now() - started, model: null, provider: 'local', fallback, reason, error: String(e.message || e).slice(0, 200),
    });
    throw new Error(`the local model could not answer: ${e.message}`);
  } finally {
    refreshLocalStatus().catch(() => {});
  }
}

/** The local half on its own, for a lane that keeps its own Claude path (the
 *  greeting streams through the warm pool) and only needs the model on this
 *  Mac when he chose it or Claude is at its limit. Same ledger row, same
 *  honest error. */
export function runLocalLane(lane, prompt, { maxTokens = 700, json = false, fallback = false } = {}) {
  if (!laneEnabled(lane)) return Promise.reject(laneOffError(lane));
  return runLocal(lane, prompt, { maxTokens, json, fallback });
}

const LOCAL_PREFIX = /^the local model could not answer: /;

// Claude answers what this Mac could not. Not async on purpose: the CLI is
// spawned inside this call, so a caller that reaches it before its own first
// await keeps the synchronous-spawn property below.
function escalate(lane, prompt, localWhy, spawnImpl) {
  const why = String(localWhy || 'it returned nothing').replace(LOCAL_PREFIX, '');
  const reason = `the model on this Mac could not answer: ${why}`;
  console.log(`textLane: ${lane} escalated to Claude (${why})`);
  return spawnClaude(lane, prompt, spawnImpl).then(
    (out) => ({ ...out, escalated: true, reason }),
    (e) => {
      // Claude's failure, said plainly, with why this Mac did not answer first
      e.message = `${e.message} The model on this Mac could not answer first: ${why}.`;
      e.localError = why;
      throw e;
    },
  );
}

/** Run one pure-text lane and return { text, provider, model, ms, fallback },
 *  plus `escalated` and `reason` when the lane ran here first and Claude
 *  answered instead.
 *  `spawnImpl` is a test seam for a lane that already has one (journalPrompt).
 *  When the lane runs on Claude at the lane's default effort, the CLI is
 *  spawned synchronously within this call (before its first await), which the
 *  journal prompt's "one call, at the tap" test depends on. That holds for an
 *  escalation that needs no local call too (nothing installed here). */
export async function runTextLane(lane, prompt, { maxTokens = 700, json = false, spawnImpl = null } = {}) {
  if (!laneEnabled(lane)) throw laneOffError(lane);

  if (providerFor(lane) === 'local') {
    // nothing to run here: a stat says so, so Claude is asked at once (and
    // synchronously) rather than after a boot that cannot happen
    if (!localModelConfigured()) {
      const why = localBackend() === 'ollama' ? 'Ollama is not installed on this Mac' : 'the local model is not installed';
      recordRun(lane, { usd: 0, ms: 0, model: null, provider: 'local', fallback: false, reason: null, error: why });
      return escalate(lane, prompt, why, spawnImpl);
    }
    try {
      return await runLocal(lane, prompt, { maxTokens, json, fallback: false });
    } catch (localErr) {
      // runLocal has already put the failed local run on the ledger
      return escalate(lane, prompt, localErr.message, spawnImpl);
    }
  }

  const run = spawnClaude(lane, prompt, spawnImpl);

  try {
    return await run;
  } catch (e) {
    // the same rule as Ask Nova's front door (lib/askDispatch.js): the
    // model on this Mac may stand in when Claude failed BEFORE any answer
    // existed (the usage limit, a CLI that could not start, a process that
    // died with no envelope, as when this Mac is offline). A run that
    // produced an envelope and failed on its own terms is not covered.
    if (!e?.limited && !e?.beforeOutput) throw e;
    if (!fallbackEnabled() || !laneCanRunLocal(lane) || !localModelConfigured()) throw e;
    const reason = e.limited ? 'Claude was at its usage limit' : (e.fallbackReason || 'Claude could not answer');
    try {
      const out = await runLocal(lane, prompt, { maxTokens, json, fallback: true, reason });
      console.log(`textLane: ${lane} fell back to the local model (Claude: ${e.message})`);
      return out;
    } catch (localErr) {
      // still Claude's failure, said plainly, with why the stand-in could not answer
      e.message = `${e.message} The model on this Mac could not stand in: ${localErr.message.replace(/^the local model could not answer: /, '')}.`;
      e.localError = localErr.message;
      throw e;
    }
  }
}

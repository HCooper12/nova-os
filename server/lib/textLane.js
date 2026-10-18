import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {
  modelFor, effortArgs, laneEnabled, laneOffError, providerFor, laneCanRunLocal, fallbackEnabled, refreshLocalStatus,
} from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope, recordRun } from './modelSpend.js';
import { completeLocal, localModelConfigured } from './localModel.js';

// THE TEXT-LANE RUNNER (19 Oct 2026). The one-shot lanes that are pure text
// in, text out (no tools, no vault reads: boundaryArgs('')) all had the same
// fifteen lines: spawn the CLI, collect stdout, parseEnvelope, read
// `result`. This is those fifteen lines once, plus the one thing they could
// not do on their own: answer on the small model on this Mac
// (lib/localModel.js) when he chose that for the lane, or when Claude is at
// the account's usage limit and the board's fallback is on.
//
// Each lane keeps its own prompt and its own parsing; this returns the raw
// text and who wrote it. The model only ever produces text here; the lane's
// own tested code decides what, if anything, is written.
//
// Honest by construction: a local failure is an error with its reason, never
// an empty string, and a limit that could not be covered is the limit error
// itself (err.limited stays true, so every lane's existing honest handling
// still applies), with the reason the local model could not stand in added.

const CLAUDE_BIN_DEFAULT = () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

// For a lane whose answer must be JSON: the small model is told so plainly,
// because it is likelier than Claude to wrap the JSON in prose or fences.
const JSON_SYSTEM = 'Reply with only the JSON the request asks for: no prose, no markdown, no code fences.';

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
    child.on('error', reject);
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
        reject(e);
      }
    });
  });
}

async function runLocal(lane, prompt, { maxTokens, json, fallback }) {
  const started = Date.now();
  try {
    const out = await completeLocal(prompt, {
      maxTokens,
      temperature: 0,
      waitForBoot: true,
      system: json ? JSON_SYSTEM : null,
    });
    recordRun(lane, {
      usd: 0, ms: out.ms, model: `local:${out.model}`, inputTokens: null, outputTokens: null, provider: 'local', fallback,
    });
    return { text: out.text, provider: 'local', model: out.model, ms: out.ms, fallback };
  } catch (e) {
    recordRun(lane, {
      usd: 0, ms: Date.now() - started, model: null, provider: 'local', fallback, error: String(e.message || e).slice(0, 200),
    });
    throw new Error(`the local model could not answer: ${e.message}`);
  } finally {
    refreshLocalStatus().catch(() => {});
  }
}

/** Run one pure-text lane and return { text, provider, model, ms, fallback }.
 *  `spawnImpl` is a test seam for a lane that already has one (journalPrompt).
 *  When the lane runs on Claude at the lane's default effort, the CLI is
 *  spawned synchronously within this call (before its first await), which the
 *  journal prompt's "one call, at the tap" test depends on. */
export async function runTextLane(lane, prompt, { maxTokens = 700, json = false, spawnImpl = null } = {}) {
  if (!laneEnabled(lane)) throw laneOffError(lane);

  if (providerFor(lane) === 'local') return runLocal(lane, prompt, { maxTokens, json, fallback: false });

  const run = spawnClaude(lane, prompt, spawnImpl);

  try {
    return await run;
  } catch (e) {
    if (!e?.limited) throw e;
    // the limit: may the model on this Mac stand in?
    if (!fallbackEnabled() || !laneCanRunLocal(lane) || !localModelConfigured()) throw e;
    try {
      const out = await runLocal(lane, prompt, { maxTokens, json, fallback: true });
      console.log(`textLane: ${lane} fell back to the local model (Claude: ${e.message})`);
      return out;
    } catch (localErr) {
      // still the limit, said plainly, with why the stand-in could not answer
      e.message = `${e.message} The model on this Mac could not stand in: ${localErr.message.replace(/^the local model could not answer: /, '')}.`;
      e.localError = localErr.message;
      throw e;
    }
  }
}

import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {
  modelFor, effortArgs, laneEnabled, laneOffError, providerFor, laneCanRunLocal, fallbackEnabled, refreshLocalStatus, laneThinks, LANES, localModelFor,
} from './modelPrefs.js';

// A lane marked `standIn: false` in LANES may run on this Mac when he picks
// it, but never stands in for a failed Claude (2 Nov 2026): the board's
// fallback list already left such lanes out, and this runner now obeys the
// same mark. The Phase B lanes that benched with a wrong answer carry it.
const laneStandsIn = (lane) => LANES.find((l) => l.id === lane)?.standIn !== false;
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope, recordRun } from './modelSpend.js';
import { completeLocal, localModelConfigured, callTarget } from './localModel.js';

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

// `tools` / `cwd` (2 Nov 2026, Phase B): the daily review and the plan let
// Claude Read his vault "for depth" when Claude is the one answering, so the
// lane names the tools it needs (boundaryArgs denies the rest) and the vault
// as the working directory. Every other lane passes neither: zero tools.
function spawnClaude(lane, prompt, spawnImpl, { tools = '', cwd = null } = {}) {
  return new Promise((resolve, reject) => {
    const spawn = spawnImpl || nodeSpawn;
    const CLAUDE_BIN = CLAUDE_BIN_DEFAULT();
    const started = Date.now();
    // stdin closed: an open pipe makes the CLI wait 3 s for input (measured 18 Oct 2026)
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(tools),
      '--output-format', 'json',
      // pinned from the model board (lib/modelPrefs.js); never the ambient default
      '--model', modelFor(lane),
      // --effort rides every spawn (lib/modelPrefs.js effortArgs; [] on a CLI
      // without the flag), so the account's ambient xhigh never reaches a lane
      ...effortArgs(lane),
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'], ...(cwd ? { cwd } : {}) });
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

// THE LANE'S OWN CHECK, ON THIS MAC'S ANSWER (2 Nov 2026, Phase B). A lane
// that writes something he reads (the review, the plan, the insight, the
// debrief) hands runTextLane a `validate(text)` that returns the parsed value
// or throws. A local answer that fails it is a FAILED local run, on the
// ledger with its reason, and never reaches him: local-first escalates to
// Claude, a stand-in gives Claude's failure back. Never fiction: an answer
// code cannot check is not an answer.
class Unusable extends Error {}

async function runLocal(lane, prompt, { maxTokens, json, fallback, reason = null, validate = null }) {
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
      // the lane's own model on this Mac (3 Nov 2026: the 9B on the lanes it
      // passed); the ledger row and laneVia name whatever actually ran
      model: localModelFor(lane),
    });
    let value;
    if (validate) {
      try { value = validate(out.text, { provider: 'local', model: out.model }); } catch (v) {
        throw Object.assign(new Unusable(`its answer could not be used (${String(v?.message || v).slice(0, 160)})`), { model: out.model, ms: out.ms });
      }
    }
    recordRun(lane, {
      usd: 0, ms: out.ms, model: `local:${out.model}`, inputTokens: null, outputTokens: null, provider: 'local', fallback, reason,
    });
    return { text: out.text, provider: 'local', model: out.model, ms: out.ms, fallback, reason, ...(validate ? { value } : {}) };
  } catch (e) {
    recordRun(lane, {
      usd: 0, ms: e instanceof Unusable ? e.ms : Date.now() - started, model: e instanceof Unusable ? `local:${e.model}` : null, provider: 'local', fallback, reason, error: String(e.message || e).slice(0, 200),
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

/** WHO WROTE IT, as the fields a lane stamps on the record it files (27 Oct
 *  2026): `provider` and `fallback` as before, `model` when this Mac answered (28 Oct 2026, so
 *  "Apple's model" can be named), and, only when this Mac could
 *  not answer and Claude did, `escalated: true` with `escalationReason` (the
 *  plain reason from escalate below). Not `reason`: an Inbox record already
 *  uses a top-level `reason` ('retried', lib/inbox.js retryRecord), so the
 *  escalation's why gets a name of its own. An ordinary Claude run, and a
 *  local one, carry exactly the keys they always did. The Inbox meta line
 *  reads these (src/vals/valsInbox.js inboxProviderNote). */
export function laneVia(out) {
  if (!out) return null;
  return {
    provider: out.provider,
    fallback: !!out.fallback,
    // which model on this Mac, only when this Mac answered ('apple:on-device'
    // or the Ollama tag), so the Inbox can name Apple's model; Claude's id is
    // never stamped, so an ordinary Claude sort writes no new key
    ...(out.provider === 'local' && typeof out.model === 'string' && out.model ? { model: out.model } : {}),
    ...(out.escalated === true ? { escalated: true, ...(out.reason ? { escalationReason: String(out.reason) } : {}) } : {}),
  };
}

// Claude answers what this Mac could not. Not async on purpose: the CLI is
// spawned inside this call, so a caller that reaches it before its own first
// await keeps the synchronous-spawn property below.
function escalate(lane, prompt, localWhy, spawnImpl, claudeOpts = {}, validate = null) {
  const why = String(localWhy || 'it returned nothing').replace(LOCAL_PREFIX, '');
  const reason = `the model on this Mac could not answer: ${why}`;
  console.log(`textLane: ${lane} escalated to Claude (${why})`);
  return spawnClaude(lane, prompt, spawnImpl, claudeOpts).then(
    // Claude's answer goes through the same check; a failure there is the
    // lane's own honest error, as it always was
    (out) => {
      if (!validate) return { ...out, escalated: true, reason };
      try {
        return { ...out, value: validate(out.text, { provider: 'claude' }), escalated: true, reason };
      } catch (e) {
        e.message = `${e.message} The model on this Mac could not answer first: ${why}.`;
        e.localError = why;
        throw e;
      }
    },
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
 *  answered instead, and `value` when the lane passed `validate`.
 *  Phase B options (2 Nov 2026):
 *    localPrompt — the compact variant for the small model; Claude always
 *                  gets `prompt`, the full one, whether it escalates or is
 *                  the lane's pick.
 *    validate    — (text, { provider }) => value, or throws; see runLocal
 *                  above. `provider` lets a lane hold this Mac's answer to
 *                  a stricter bar (the grounding check) than Claude's.
 *    claudeTools, cwd — what Claude may reach when it answers (spawnClaude).
 *  `spawnImpl` is a test seam for a lane that already has one (journalPrompt).
 *  When the lane runs on Claude at the lane's default effort, the CLI is
 *  spawned synchronously within this call (before its first await), which the
 *  journal prompt's "one call, at the tap" test depends on. That holds for an
 *  escalation that needs no local call too (nothing installed here). */
export async function runTextLane(lane, prompt, {
  maxTokens = 700, json = false, spawnImpl = null, localPrompt = null, validate = null, claudeTools = '', cwd = null,
} = {}) {
  if (!laneEnabled(lane)) throw laneOffError(lane);
  const claudeOpts = { tools: claudeTools, cwd };
  const smallPrompt = localPrompt || prompt;

  if (providerFor(lane) === 'local') {
    // nothing to run here: a stat says so, so Claude is asked at once (and
    // synchronously) rather than after a boot that cannot happen
    if (!localModelConfigured(localModelFor(lane))) {
      const b = callTarget(localModelFor(lane)).backend;
      const why = b === 'ollama' ? 'Ollama is not installed on this Mac'
        : b === 'apple' ? "Apple's model helper is not built on this Mac" : 'the local model is not installed';
      recordRun(lane, { usd: 0, ms: 0, model: null, provider: 'local', fallback: false, reason: null, error: why });
      return escalate(lane, prompt, why, spawnImpl, claudeOpts, validate);
    }
    try {
      return await runLocal(lane, smallPrompt, { maxTokens, json, fallback: false, validate });
    } catch (localErr) {
      // runLocal has already put the failed local run on the ledger
      return escalate(lane, prompt, localErr.message, spawnImpl, claudeOpts, validate);
    }
  }

  const run = spawnClaude(lane, prompt, spawnImpl, claudeOpts);

  try {
    const out = await run;
    return validate ? { ...out, value: validate(out.text, { provider: 'claude' }) } : out;
  } catch (e) {
    // the same rule as Ask Nova's front door (lib/askDispatch.js): the
    // model on this Mac may stand in when Claude failed BEFORE any answer
    // existed (the usage limit, a CLI that could not start, a process that
    // died with no envelope, as when this Mac is offline). A run that
    // produced an envelope and failed on its own terms is not covered.
    if (!e?.limited && !e?.beforeOutput) throw e;
    if (!fallbackEnabled() || !laneCanRunLocal(lane) || !laneStandsIn(lane) || !localModelConfigured(localModelFor(lane))) throw e;
    const reason = e.limited ? 'Claude was at its usage limit' : (e.fallbackReason || 'Claude could not answer');
    try {
      const out = await runLocal(lane, smallPrompt, { maxTokens, json, fallback: true, reason, validate });
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

// THE GROUNDING CHECK, AS CODE (2 Nov 2026, Phase B; the idiom is the local
// Coach bench's, scripts/benchLocalCoach.mjs). Every digit-string the answer
// says must appear in what the model was shown. It cannot tell a right number
// from a wrong one that happens to be in the context; it catches every
// invented one, which is the failure a 4B writing "up 9 %" from nothing
// commits. Thousands separators and a trailing ".0" are ignored, so "1,040"
// matches "1040" and "84.0" matches "84". Returns the numbers that are not
// grounded (empty when the answer is clean).
const NUM_RE = /\d+(?:[.,]\d+)*/g;
const numsOf = (s) => (String(s || '').match(NUM_RE) || [])
  .map((n) => n.replace(/,(?=\d{3}\b)/g, '').replace(/\.0+$/, ''));
export function ungroundedNumbers(answer, ...sources) {
  const seen = new Set(numsOf(sources.join('\n')));
  return [...new Set(numsOf(answer))].filter((n) => !seen.has(n));
}

/** A validate step for a lane's prose: throws when the answer says a number
 *  its prompt never gave it. */
export function assertGrounded(answer, prompt, what = 'the answer') {
  const loose = ungroundedNumbers(answer, prompt);
  if (loose.length) throw new Error(`${what} says ${loose.slice(0, 4).join(', ')}, which ${loose.length === 1 ? 'is' : 'are'} not in anything it was shown`);
  return true;
}

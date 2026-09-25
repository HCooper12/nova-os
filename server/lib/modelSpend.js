import { readFileSync, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// THE MODEL SPEND LEDGER — what every lane on the model board (modelPrefs.js)
// actually costs and how long it takes, plus whether the account's usage
// limit ate the run. Nothing here is vault truth: it's operational telemetry,
// the same tier as the rest of server/data/, so a lost or corrupt file just
// means a blank history — never a broken lane.
//
// Why this exists: the board lets Hayden CHOOSE a model per lane, but nothing
// ever measured what that choice costs. Only 8 of ~45 spawn sites even read
// total_cost_usd, and the account's usage limit was recognised on exactly one
// path (the conversational warm pool) — every one-shot lane threw the CLI's
// raw text instead, and nothing counted a limit hit. The server log showed 13
// of them, all in the pulse lane, invisible until someone went looking.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const SPEND_PATH = () => path.join(dataRoot(), 'model-spend.json');

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ROWS_PER_LANE = 500;

// ---------------------------------------------------------------------------
// The CLI's own words at the account's limit — the whole reply, and short.
// Seen for real on 25 Sep 2026: "You've hit your session limit · resets 11am
// (Australia/Melbourne)". Only a short reply that is nothing BUT the notice
// counts, so an answer that mentions a limit is never mistaken for one.
//
// Moved here unchanged from claudeCode.js (which now re-exports it) so every
// lane — the warm conversational pool AND every one-shot spawn — reads the
// account's limit state through the same function.
// ---------------------------------------------------------------------------
export function usageLimitNotice(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 240) return null;
  if (!/\b(?:hit your|reached your|usage limit|rate limit|session limit|weekly limit)\b/i.test(t) || !/\blimit\b/i.test(t)) return null;
  const resets = t.match(/\bresets?\s+(?:at\s+)?([^·\n]+?)\s*$/i)?.[1]?.replace(/\s*\(([^)]+)\)\s*$/, '').trim();
  return `Claude's usage limit is reached for now${resets ? `; it resets at ${resets}` : ''}. Nothing was answered and nothing was lost: ask again after that.`;
}

// ------------------------------- reading --------------------------------
// Same sync-read-cached-by-mtime pattern modelPrefs.js uses for its own
// store (loadRaw): getModelPrefs() must stay synchronous (it sits on a path
// about to spawn a process), so the spend file is read the same way.
let cache = null;
let cacheStamp = null;

function loadSpendRaw() {
  const file = SPEND_PATH();
  let stamp = null;
  try {
    stamp = existsSync(file) ? `${statSync(file).mtimeMs}:${file}` : `none:${file}`;
  } catch {
    stamp = `none:${file}`;
  }
  if (cache && cacheStamp === stamp) return cache;
  let parsed = { lanes: {} };
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      parsed = raw && typeof raw.lanes === 'object' && raw.lanes ? raw : { lanes: {} };
    } catch {
      parsed = { lanes: {} }; // a corrupt file degrades to an empty ledger, not a crash
    }
  }
  cache = parsed;
  cacheStamp = stamp;
  return cache;
}

function invalidateSpendCache() {
  cache = null;
  cacheStamp = null;
}

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ------------------------------- writing --------------------------------
// Writes are serialised through one module-level promise chain: many lanes
// finish concurrently, and a read-modify-write on the same file without this
// would lose rows. recordRun never throws into its caller — every failure is
// caught here, logged once, and swallowed; a telemetry write must never take
// a model run down with it.
let writeChain = Promise.resolve();

function buildRow(fields, now) {
  return {
    at: new Date(now).toISOString(),
    usd: numOrNull(fields.usd),
    ms: numOrNull(fields.ms),
    inputTokens: numOrNull(fields.inputTokens),
    outputTokens: numOrNull(fields.outputTokens),
    cacheReadTokens: numOrNull(fields.cacheReadTokens),
    cacheWriteTokens: numOrNull(fields.cacheWriteTokens),
    model: fields.model || null,
    limited: !!fields.limited,
    error: fields.error || null,
  };
}

async function appendRow(lane, row, now) {
  const file = SPEND_PATH();
  let data = { lanes: {} };
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      if (raw && typeof raw.lanes === 'object' && raw.lanes) data = raw;
    }
  } catch { /* a corrupt file starts fresh rather than blocking every future run */ }

  const rows = Array.isArray(data.lanes[lane]) ? data.lanes[lane] : [];
  rows.push(row);
  const cutoff = now - MAX_AGE_MS;
  const pruned = rows.filter((r) => {
    const t = Date.parse(r?.at);
    return Number.isFinite(t) ? t >= cutoff : true; // an unparseable stamp is kept, never silently dropped
  });
  data.lanes = { ...data.lanes, [lane]: pruned.slice(-MAX_ROWS_PER_LANE) };

  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, file);
  invalidateSpendCache();
}

/** Append one row for a model run. Fire-and-forget everywhere it's called —
 *  a lost row is a bug, so writes are serialised through one chain rather
 *  than raced against each other; a failure logs once and never throws into
 *  the caller. `now` is an escape hatch for tests (an injectable clock); real
 *  callers never pass it. */
export function recordRun(lane, fields = {}) {
  const now = Number.isFinite(fields.now) ? fields.now : Date.now();
  const row = buildRow(fields, now);
  writeChain = writeChain
    .then(() => appendRow(lane, row, now))
    .catch((e) => {
      console.error(`model-spend: failed to record a run for lane "${lane}": ${e.message}`);
    });
  return writeChain;
}

// ------------------------------- envelopes -------------------------------

/** Map a CLI JSON envelope — the single object from `--output-format json`,
 *  or the final `{"type":"result",...}` event of a stream-json run — to the
 *  fields recordRun wants. Missing fields become null, never NaN. */
export function fromEnvelope(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const usage = o.usage && typeof o.usage === 'object' ? o.usage : {};
  const modelUsage = o.modelUsage && typeof o.modelUsage === 'object' ? o.modelUsage : null;

  // The model that actually answered: the modelUsage entry with the most
  // output tokens (a run can touch more than one model — a sub-agent, a
  // fallback — and the one that wrote the reply is the one worth naming).
  let model = null;
  if (modelUsage) {
    let bestOutput = -Infinity;
    for (const [name, u] of Object.entries(modelUsage)) {
      const out = Number(u?.outputTokens);
      const val = Number.isFinite(out) ? out : -Infinity;
      if (val > bestOutput) { bestOutput = val; model = name; }
    }
  }

  return {
    usd: numOrNull(o.total_cost_usd),
    ms: numOrNull(o.duration_ms),
    inputTokens: numOrNull(usage.input_tokens),
    outputTokens: numOrNull(usage.output_tokens),
    cacheReadTokens: numOrNull(usage.cache_read_input_tokens),
    cacheWriteTokens: numOrNull(usage.cache_creation_input_tokens),
    model,
    limited: !!usageLimitNotice(o.result),
    error: o.is_error ? String(o.result || '').slice(0, 200) : null,
  };
}

/** Parse a one-shot `--output-format json` stdout, record the run
 *  fire-and-forget, and return the parsed envelope — or throw the one honest
 *  reason it can't: the account's usage limit (plain notice, `err.limited =
 *  true`), the model's own reported failure, or unreadable output (recorded
 *  as nothing, since there's no envelope to record). */
//
// `code` and `stderr` are optional. A site that passes `code` keeps the rule
// it had before this module: a non-zero exit is a failure even when the
// envelope does not say so. `stderr` is what a dead or logged-out CLI left
// behind, and is the reason given when there is no envelope to read; without
// it a crash read as "malformed output" with nothing to act on (25 Sep
// review of the ledger wiring).
export function parseEnvelope(stdout, { lane, code = null, stderr = '' } = {}) {
  const said = String(stderr || '').trim().slice(0, 300);
  const exited = code != null && code !== 0;
  let outer;
  try {
    outer = JSON.parse(stdout);
  } catch {
    throw new Error(said || (exited ? `claude exited with code ${code}` : 'malformed output from the model'));
  }
  recordRun(lane, fromEnvelope(outer));
  const limit = usageLimitNotice(outer?.result);
  if (limit) {
    const err = new Error(limit);
    err.limited = true;
    throw err;
  }
  // the model's own failure speaks for itself; a process that exited badly
  // after a clean-looking envelope is explained by its stderr or its code,
  // never by the reply text it happened to print
  if (outer?.is_error) throw new Error(outer.result || said || (exited ? `claude exited with code ${code}` : 'the model run failed'));
  if (exited) throw new Error(said || `claude exited with code ${code}`);
  return outer;
}

/** Per-lane spend over a trailing window: runs, total usd (4dp), median
 *  duration, the last model that answered, how many runs hit the account's
 *  usage limit, and how many errored. */
export function spendSummary({ days = 7, now = Date.now() } = {}) {
  const data = loadSpendRaw();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const out = {};
  for (const [lane, rows] of Object.entries(data.lanes || {})) {
    const inWindow = (Array.isArray(rows) ? rows : []).filter((r) => {
      const t = Date.parse(r?.at);
      return Number.isFinite(t) && t >= cutoff && t <= now;
    });
    if (!inWindow.length) continue;
    const usd = inWindow.reduce((sum, r) => sum + (typeof r.usd === 'number' ? r.usd : 0), 0);
    const durations = inWindow.map((r) => r.ms).filter((v) => typeof v === 'number').sort((a, b) => a - b);
    const medianMs = durations.length
      ? (durations.length % 2
        ? durations[(durations.length - 1) / 2]
        : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2)
      : null;
    // last model that answered — the most recent row that named one
    let lastModel = null;
    for (let i = inWindow.length - 1; i >= 0; i--) {
      if (inWindow[i].model) { lastModel = inWindow[i].model; break; }
    }
    out[lane] = {
      runs: inWindow.length,
      usd: Math.round(usd * 10000) / 10000,
      medianMs,
      lastModel,
      limitHits: inWindow.filter((r) => r.limited).length,
      errors: inWindow.filter((r) => r.error).length,
    };
  }
  return out;
}

/** Synchronous, mtime-cached read of the spend file — the same shape
 *  spendSummary reads from, exposed so modelPrefs.js's getModelPrefs() can
 *  build a `spend` field per lane without importing anything heavy or ever
 *  going async. */
export function readSpendSync() {
  return loadSpendRaw();
}

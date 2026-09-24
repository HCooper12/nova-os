// THE MODEL FAIL-SAFE — the model board (modelPrefs.js) trusts the CLI's own
// alias resolution ('opus' always means the newest Opus, per `claude --help`)
// but the LABELS shown to Hayden, and the exact ids offered as "pinned",
// were hand-written and rot the moment Anthropic ships a new release: this
// file is what caught 'Opus 5' still on screen after Opus 5.5 shipped, and
// 'Fable 5' after Fable 5.1.
//
// The fix is not another hand-written table — it is asking the CLI itself,
// cheaply, on a schedule, and writing down what it said. modelPrefs.js reads
// resolvedModels() to build its labels and pinned choices; nothing here
// decides what a lane RUNS (that is still the alias, resolved by the CLI at
// spawn time) — this only keeps what Hayden SEES honest, and tells him when
// the ground moved.

import { readFileSync, statSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { beat } from './heartbeat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const WATCH_PATH = () => path.join(dataRoot(), 'model-watch.json');

// launchd services don't inherit the interactive shell's PATH — use the
// absolute path (same rule, same fallback, as every other spawn site in
// server/lib/claudeCode.js and server/lib/pulse.js).
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

export const ALIASES = ['opus', 'sonnet', 'haiku', 'fable'];

// The fallback used before the first real probe ever lands, or once every
// probe for an alias has failed with nothing previously observed to fall
// back on. Measured live (see runModelWatch's real run, 25 Sep 2026) — keep
// this current by hand only as a LAST resort; the whole point of this file
// is that the probe is what should keep it honest from here on.
export const NEWEST_KNOWN = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5-20251001',
  fable: 'claude-fable-5-1',
};

// 'claude-opus-5-5' -> 'Opus 5.5'; 'claude-haiku-4-5-20251001' -> 'Haiku 4.5'
// (the trailing 8-digit date pin is dropped — it names a build, not a
// version he needs to read). A shape this doesn't recognise (a preview
// suffix, a non-Claude id) is returned as-is rather than mangled.
export function modelLabel(id) {
  if (typeof id !== 'string' || !id) return String(id ?? '');
  const m = id.match(/^claude-(opus|sonnet|haiku|fable)-(.+)$/);
  if (!m) return id;
  const [, family, rest] = m;
  const parts = rest.split('-');
  if (parts.length && /^\d{8}$/.test(parts[parts.length - 1])) parts.pop(); // the date build suffix
  if (!parts.length || !parts.every((p) => /^\d+$/.test(p))) return id; // unrecognised shape — don't guess
  const familyLabel = family[0].toUpperCase() + family.slice(1);
  return `${familyLabel} ${parts.join('.')}`;
}

// Which alias family an id (or an alias itself) belongs to, or null.
const CLAUDE_ID = /^claude-(?:opus|sonnet|haiku|fable)-\d+(?:-\d+)*$/;

export function familyOf(id) {
  if (typeof id !== 'string') return null;
  if (ALIASES.includes(id)) return id;
  const m = id.match(/^claude-(opus|sonnet|haiku|fable)-/);
  return m ? m[1] : null;
}

// ------------------------------- the probe ----------------------------------
// The measured-cheap invocation (haiku $0.003, fable $0.07, 25 Sep 2026):
// one turn, no tools, no session left behind, JSON out. The resolved model
// id is the key of `modelUsage` in the CLI's envelope — this is the CLI
// TELLING us what 'opus' meant today, not a guess from parsing its reply.
const PROBE_TIMEOUT_MS = 90_000;

function spawnProbe(alias) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', 'ok',
      '--model', alias,
      '--output-format', 'json',
      '--max-turns', '1',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--system-prompt', 'Reply with ok.',
      '--tools', '',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    // (review #8) a CLI that hangs (network stall, logged out) must not hold
    // the tick forever and leak a process every day after
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`probe for "${alias}" timed out`)); }, PROBE_TIMEOUT_MS);
    child.on('close', () => { clearTimeout(timer); resolve(stdout || stderr); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// Pure parse: the envelope -> the resolved model id, or a thrown error with
// a reason a person could read in a log. Exported so a test can pin the
// parsing contract without touching the shape of probeAlias itself.
export function parseProbeOutput(stdout, alias) {
  let outer;
  try {
    outer = JSON.parse(stdout);
  } catch {
    throw new Error(`probe for "${alias}": malformed output (not JSON)`);
  }
  if (outer?.is_error) {
    throw new Error(`probe for "${alias}": ${outer.result || 'the run reported an error'}`);
  }
  const usage = outer?.modelUsage;
  if (!usage || typeof usage !== 'object' || !Object.keys(usage).length) {
    throw new Error(`probe for "${alias}": no modelUsage in the response`);
  }
  // (review #9) never record another family's model under this alias — a
  // wrong label, a wrong pinned choice and a false "model moved" would follow
  const match = Object.keys(usage).find((id) => familyOf(id) === alias && CLAUDE_ID.test(id));
  if (!match) throw new Error(`probe for "${alias}": no ${alias} model in the response`);
  return match;
}

// alias -> the resolved model id. `run` is injected (alias) => Promise<stdout
// string>; tests pass one that never spawns anything. The real path spawns
// the CLI itself.
export async function probeAlias(alias, { run } = {}) {
  const doRun = run || spawnProbe;
  const stdout = await doRun(alias);
  return parseProbeOutput(stdout, alias);
}

// --------------------------------- store -------------------------------------
// Same shape of contract as modelPrefs.js: read synchronously, cached by the
// file's mtime, so `resolvedModels()` is free to call from a hot path (the
// Settings board render) without threading an async read through it.
let cache = null;
let cacheStamp = null;

function loadWatchRaw() {
  const file = WATCH_PATH();
  let stamp;
  try {
    stamp = existsSync(file) ? `${statSync(file).mtimeMs}:${file}` : `none:${file}`;
  } catch {
    stamp = `none:${file}`;
  }
  if (cache && cacheStamp === stamp) return cache;
  let parsed = { checkedAt: null, resolved: {}, changes: [] };
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      parsed = {
        checkedAt: raw?.checkedAt || null,
        resolved: raw?.resolved && typeof raw.resolved === 'object' ? raw.resolved : {},
        changes: Array.isArray(raw?.changes) ? raw.changes : [],
      };
    } catch {
      parsed = { checkedAt: null, resolved: {}, changes: [] }; // a corrupt file degrades to "never probed"
    }
  }
  cache = parsed;
  cacheStamp = stamp;
  return cache;
}

async function saveWatch(data) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = WATCH_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, WATCH_PATH());
  cache = null;
  cacheStamp = null;
}

// The board's read of "what does each alias mean right now": the last
// observed id where one exists, NEWEST_KNOWN where it doesn't (never probed,
// or every probe has failed). `observed` tells the caller which case it is.
export function resolvedModels() {
  const data = loadWatchRaw();
  const out = {};
  for (const alias of ALIASES) {
    const r = data.resolved?.[alias];
    if (r?.id && CLAUDE_ID.test(r.id) && familyOf(r.id) === alias) out[alias] = { id: r.id, label: modelLabel(r.id), observed: true };
    else out[alias] = { id: NEWEST_KNOWN[alias], label: modelLabel(NEWEST_KNOWN[alias]), observed: false };
  }
  return out;
}

export function lastCheckedAt() {
  return loadWatchRaw().checkedAt;
}

export function recentChanges() {
  return loadWatchRaw().changes || [];
}

const MAX_CHANGES = 20;

// Probe all four aliases, sequentially (four cheap calls, no reason to pay
// for parallel CLI boots), record what each resolved to, and tell `announce`
// about anything that actually MOVED since the last successful probe. A
// failed probe never throws out of the loop and never disturbs the last
// good value — it is recorded as an error and picked up again next run.
export async function runModelWatch({ run, announce, now = () => new Date() } = {}) {
  const data = loadWatchRaw();
  const resolved = { ...data.resolved };
  const changes = [...(data.changes || [])];
  const checkedAt = now().toISOString();
  const results = {};
  const errors = {};
  const fired = [];

  for (const alias of ALIASES) {
    try {
      const id = await probeAlias(alias, { run });
      const prev = resolved[alias];
      results[alias] = id;
      if (prev?.id && prev.id !== id) {
        const change = { alias, from: prev.id, to: id, at: checkedAt };
        changes.unshift(change);
        fired.push(change);
      }
      resolved[alias] = {
        id,
        since: prev?.id === id ? (prev.since || checkedAt) : checkedAt,
        checkedAt,
      };
    } catch (e) {
      errors[alias] = String(e?.message || e);
      // previous value (if any) is left exactly as it was — a failure must
      // never blank out or backdate what was last actually observed
    }
  }

  // A run where NOTHING resolved (the Mac offline, the CLI logged out) is not
  // a check: keep the old date so tomorrow's tick tries again instead of
  // going quiet for a week on the strength of a failure.
  const anyResolved = Object.keys(results).length > 0;
  await saveWatch({
    checkedAt: anyResolved ? checkedAt : data.checkedAt,
    resolved,
    changes: changes.slice(0, MAX_CHANGES),
    ...(anyResolved ? {} : { lastFailedAt: checkedAt, lastErrors: errors }),
  });

  // announce AFTER the write lands, so a crash mid-announce still leaves the
  // store correct for the next run to read.
  for (const change of fired) {
    try {
      await announce?.(change);
    } catch { /* a failed notification must not un-record a real change */ }
  }

  return { checkedAt, resolved: results, errors, changes: fired };
}

// -------------------------------- schedule -----------------------------------
const WEEK_MS = 7 * 24 * 3600_000;

// Pure, so the cadence is testable without a clock: due when never checked,
// or when the last check is more than a week old.
export function watchDue(checkedAt, now = new Date()) {
  if (!checkedAt) return true;
  const last = new Date(checkedAt);
  if (Number.isNaN(last.getTime())) return true;
  return (now - last) > WEEK_MS;
}

// 'Opus now runs Claude Opus 5.6 (was 5.5) — every lane on "opus" moved with
// it.' — one line, no ceremony, the same register as a Guardian alert.
export function formatChangeMessage({ alias, from, to }) {
  const familyLabel = alias[0].toUpperCase() + alias.slice(1);
  const toLabel = modelLabel(to);
  const fromLabel = modelLabel(from);
  const fromVersion = fromLabel.startsWith(familyLabel) ? fromLabel.slice(familyLabel.length).trim() : fromLabel;
  return `${familyLabel} now runs Claude ${toLabel} (was ${fromVersion || fromLabel}) — every lane on "${alias}" moved with it.`;
}

// The same dual channel Guardian uses for something worth interrupting him
// for (server/lib/guardian.js's worsened-check alert): a web push AND the
// Telegram thread he actually reads, since a push is easy to miss on a
// phone. Fire-and-forget on both — a failed notification is a shame, never
// a reason to lose the fact that the model moved (that's already on disk).
async function defaultAnnounce(change) {
  const message = formatChangeMessage(change);
  const [{ sendPush }, { sendTelegramText, telegramConfigured }] = await Promise.all([import('./push.js'), import('./telegram.js')]);
  await sendPush({ title: 'Nova — a model moved', body: message, tag: 'model-watch' }).catch(() => {});
  if (telegramConfigured()) await sendTelegramText(`◇ ${message}`).catch(() => {});
}

// Weekly, checked daily (same shape as patternsWeekly's hourly check of its
// own due-window) — and, because the first tick always runs immediately,
// a server that has never probed (or hasn't in 7+ days) catches up shortly
// after boot with no separate code path.
export function startModelWatchScheduler({ announce = defaultAnnounce } = {}) {
  // The tick is daily and stamps the heartbeat every time (ops.js roster
  // entry 'model-watch', 26h cadence) — it only PROBES when the last good
  // check is a week old, so Guardian watches the loop without a weekly bill.
  const tick = async () => {
    beat('model-watch');
    try {
      if (!watchDue(lastCheckedAt())) return;
      const report = await runModelWatch({ announce });
      const errs = Object.keys(report.errors);
      console.log(`model-watch: opus ${report.resolved.opus || '(failed)'} · sonnet ${report.resolved.sonnet || '(failed)'} · haiku ${report.resolved.haiku || '(failed)'} · fable ${report.resolved.fable || '(failed)'}${errs.length ? ` — errors: ${errs.map((a) => `${a}: ${report.errors[a]}`).join('; ')}` : ''}`);
    } catch (e) {
      console.error('model-watch tick failed:', e.message);
    }
  };
  tick();
  setInterval(tick, 24 * 3600_000);
}

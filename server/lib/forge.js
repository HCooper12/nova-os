import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRecord, updateRecord, getRecord } from './inboxStore.js';
import { broadcast } from './events.js';

// The Forge — Nova's build department.
//
// Every other model-based agent here PRODUCES A DOCUMENT for review: the
// Watcher drafts a note, the Researcher a brief, the Distiller a digest.
// The Forge is the first that produces a RUNNING THING — "build me a snake
// game and open it in my browser" — from one spoken sentence, from anywhere.
//
// It exists because dispatch is the missing half of Nova on the phone/watch:
// capture and Q&A already work hands-free, but starting real work did not.
//
// Structural boundaries, and why they are where they are:
//   - A job runs inside its OWN directory under ~/NovaForge/<slug>/ and is
//     given Bash. That is a real capability, so the containment is the
//     directory, not the toolset: nothing it builds is vault truth, and its
//     output is disposable derived data that can be deleted and rebuilt.
//   - It therefore never writes to the vault. Anything vault-bound goes back
//     through the pending-review rails like every other agent (the trust
//     ladder is not bypassed just because a job was useful).
//   - It rides the existing inbox rails, so a job in flight already pulses
//     the sidebar agent lights on every device, and the SSE broadcast already
//     reaches the phone. No new status plumbing was invented.
//
// Cost: `--max-budget-usd` is DELIBERATELY generous here and MUST be
// re-tuned from a measured run before being trusted (design/SESSION-HANDOFF
// DO NOT: two guessed caps cost ~$10 and an evening by killing real passes
// mid-flight). A killed job wastes the whole run, so the cap errs high and
// the receipt records what a job actually cost.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const FORGE_ROOT = process.env.NOVA_FORGE_DIR || path.join(os.homedir(), 'NovaForge');
// fileURLToPath, NEVER new URL(...).pathname — this repo's path contains a
// space, which stays percent-encoded and silently writes a parallel
// "Claude%20Projects" tree (four call sites once did exactly that).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const JOBS_DIR = path.join(DATA_ROOT, 'forge');
const MAX_BUDGET_USD = process.env.NOVA_FORGE_BUDGET || '4.00';
const MAX_PROMPT_CHARS = 2000;
const MAX_CONCURRENT_FORGE = 2;
const FORGE_MAX_MINUTES = 25; // the wall-clock backstop — a build that runs this long is stuck, not thorough
const FORGE_KEEP_JOBS = 20;
const FORGE_ARTIFACT_DAYS = 30;
const normPrompt = (p) => String(p || '').toLowerCase().replace(/\s+/g, ' ').trim();
// Pure: the running job with the same normalized prompt, if any.
export function duplicateRunning(runningJobs, prompt) {
  const n = normPrompt(prompt);
  for (const live of runningJobs) if (normPrompt(live?.job?.prompt) === n) return live.job;
  return null;
}

// The Forge is the ONE agent with Bash, so the disallowed list is the real
// safety boundary (--allowedTools is documentation only under
// bypassPermissions — verified empirically, see claudeCode.js). Everything
// that would let a job reach off this machine or into Nova's own control
// plane is blocked; file and shell work inside its sandbox is the point.
const FORGE_DISALLOWED = [
  'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
].join(',');

const running = new Map(); // recordId -> { child, startedAt }

export function slugify(text) {
  const s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'job';
}

// A one-line human summary of what the job is doing RIGHT NOW, built from the
// CLI's own tool events. This is the string the watch and the notch HUD show,
// so it must read as plain English, never as JSON.
export function describeToolUse(name, input = {}) {
  if (!name) return null;
  if (name === 'Bash') {
    const cmd = String(input.command || '').replace(/\s+/g, ' ').trim();
    return cmd ? `Running ${cmd.slice(0, 80)}` : 'Running a command';
  }
  if (name === 'Write') return `Writing ${path.basename(String(input.file_path || 'a file'))}`;
  if (name === 'Edit') return `Editing ${path.basename(String(input.file_path || 'a file'))}`;
  if (name === 'Read') return `Reading ${path.basename(String(input.file_path || 'a file'))}`;
  if (name === 'Glob' || name === 'Grep') return `Searching for ${String(input.pattern || '').slice(0, 40)}`;
  if (name === 'WebSearch') return `Searching the web for ${String(input.query || '').slice(0, 40)}`;
  if (name === 'WebFetch') return `Fetching ${String(input.url || '').slice(0, 50)}`;
  return `Using ${name}`;
}

// Parse one stream-json line into a status update. Split out from the process
// plumbing so the event shapes can be pinned by tests against captured
// fixtures rather than by spawning a real job (DO NOT: fixture-only tests for
// vault writers — the same reasoning applies to expensive model runs).
export function readStreamEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
    for (const block of ev.message.content) {
      if (block.type === 'tool_use') {
        const line = describeToolUse(block.name, block.input);
        if (line) return { kind: 'tool', line };
      }
    }
    const text = ev.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (text) return { kind: 'thinking', line: text.slice(0, 120) };
    return null;
  }
  if (ev.type === 'result') {
    return {
      kind: 'result',
      isError: !!ev.is_error,
      text: (ev.result || '').trim(),
      costUsd: Number.isFinite(Number(ev.total_cost_usd)) ? Number(ev.total_cost_usd) : null,
    };
  }
  return null;
}

export function buildForgePrompt({ prompt, dir }) {
  return `You are Nova's Forge — the department that BUILDS things for Hayden.

He asked for this, out loud, from his watch or phone:

"${prompt}"

Your working directory is ${dir}. It is yours: create whatever files the job needs.

How to work:
- Build the thing. Don't ask clarifying questions — he isn't at a keyboard and cannot answer. Make the sensible call and note any assumption at the end.
- Prefer ONE self-contained file when that is genuinely enough (a single .html with inline CSS/JS runs anywhere, needs no build step, and can be opened instantly). Reach for more files only when the job actually warrants it.
- Make it work end to end before making it clever. A plain thing that runs beats an elaborate thing that doesn't.
- If he asked for something to run in the browser, the entry point MUST be a file named index.html in this directory, so Nova can open it for him.
- Stay inside this directory. Do not modify anything elsewhere on his machine.

When you are done, end your reply with a single line of plain text:
BUILT <one sentence, spoken register, saying what he can now do>

Nothing after that line. He will hear it read aloud, so no markdown, no file listings, no code in that sentence.`;
}

// The spoken confirmation is the model's own last line, not a template —
// Hayden's standing rule is that nothing Nova says may be canned. A job that
// forgets the line still reports honestly rather than inventing success.
export function parseBuiltLine(text) {
  const m = String(text || '').match(/^BUILT\s+(.+)$/m);
  if (!m) return { summary: null, cleanText: String(text || '').trim() };
  return { summary: m[1].trim(), cleanText: String(text).replace(m[0], '').trim() };
}

// The completion ping. A build dispatched from his wrist is the one case
// where he walks away from the machine entirely, so the OUTCOME has to come
// to him — and that includes the failures, which is the gap this closes:
// a built job lands `pending` and the inbox rails already announce it, but a
// FAILED job lands `error`, which notifies nobody. Dispatch-and-never-hear
// is the worst possible behaviour for a surface whose whole point is that
// he isn't watching.
//
// Cost rides along because a forge job is the most expensive thing Nova
// does on his behalf without asking first (measured: $0.90 for a small
// game), and a number he can see is how that stays honest.
export function composeForgeAnnouncement(job) {
  const cost = Number.isFinite(job.costUsd) ? ` · $${job.costUsd.toFixed(2)}` : '';
  const mins = job.startedMs ? Math.max(1, Math.round((Date.now() - job.startedMs) / 60000)) : null;
  const took = mins ? ` · ${mins} min` : '';
  if (job.state === 'built') {
    return `⚒ Forge — built${took}${cost}\n\n${job.summary || 'It finished, but never said what it made.'}\n\n${job.dir}`;
  }
  if (job.state === 'stopped') return `⚒ Forge — stopped${took}${cost}\n\n"${job.prompt}"`;
  return `⚒ Forge — failed${took}${cost}\n\n"${job.prompt}"\n\n${String(job.error || 'no reason given').slice(0, 400)}`;
}

async function announceForge(job) {
  try {
    const { telegramConfigured, sendTelegramText } = await import('./telegram.js');
    if (!telegramConfigured()) return;
    await sendTelegramText(composeForgeAnnouncement(job));
  } catch { /* a missing ping must never be the thing that breaks a build */ }
}

async function persistJob(job) {
  try {
    await mkdir(JOBS_DIR, { recursive: true });
    await writeFile(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2), 'utf8');
  } catch { /* receipts are best-effort; never fail a build over one */ }
}

export async function readJob(id) {
  const f = path.join(JOBS_DIR, `${id}.json`);
  if (!existsSync(f)) return null;
  try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; }
}

export async function listJobs() {
  if (!existsSync(JOBS_DIR)) return [];
  const files = (await readdir(JOBS_DIR)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(path.join(JOBS_DIR, f), 'utf8'))); } catch { /* skip a corrupt receipt */ }
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

// Proof, not a claim. A finished job that produced an index.html gets opened
// and photographed, so what lands on his wrist is evidence the thing runs
// rather than the model's word for it. Honest degradation throughout: no
// artifact means no image and a receipt that says so — never a stale one.
async function captureProof(job) {
  const entry = path.join(job.dir, 'index.html');
  if (!existsSync(entry)) return { proof: null, proofNote: 'nothing to open — this job produced no index.html' };
  try {
    await new Promise((resolve) => {
      const p = spawn('open', ['-a', 'Google Chrome', entry], { stdio: 'ignore' });
      p.on('close', resolve); p.on('error', resolve);
    });
    await new Promise((r) => setTimeout(r, 2500)); // let it paint before photographing
    await mkdir(JOBS_DIR, { recursive: true });
    const png = path.join(JOBS_DIR, `${job.id}.png`);
    const ok = await new Promise((resolve) => {
      // -x silences the shutter; window capture needs Screen Recording
      // permission, so a refusal here is expected until it is granted once.
      const p = spawn('screencapture', ['-x', png], { stdio: 'ignore' });
      p.on('close', (code) => resolve(code === 0));
      p.on('error', () => resolve(false));
    });
    if (!ok || !existsSync(png)) return { proof: null, proofNote: 'could not capture the screen (Screen Recording permission may be needed)' };
    // the whole screen is in the picture — said, rather than implied to be the window alone
    return { proof: `${job.id}.png`, proofNote: 'full-screen capture — whatever else was on screen is in the picture' };
  } catch (e) {
    return { proof: null, proofNote: `proof capture failed: ${e.message}` };
  }
}

async function runForgeJob(job) {
  const args = [
    '-p', buildForgePrompt({ prompt: job.prompt, dir: job.dir }),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Write Edit Bash Glob Grep',
    '--disallowedTools', FORGE_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'stream-json',
    '--verbose',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ];
  // A job may name its own model (a Shortcut can pass one); otherwise the
  // lane's setting. Never the account's ambient default — see the 21-Aug
  // Coach fix in claudeCode.js.
  args.push('--model', job.model || modelFor('forge'));

  // stdio: stdin IGNORED, never inherited — a child that waits on stdin under
  // launchd hangs forever, and its "no stdin data received" warning has
  // already once been misread as the cause of a failure (DO NOT).
  const child = spawn(CLAUDE_BIN, args, { cwd: job.dir, stdio: ['ignore', 'pipe', 'pipe'] });
  // The LIVE job object goes in the map, not a copy: stopForge sets
  // `stopped` on it and the close handler below reads that same object, so a
  // deliberate stop is reported as a stop rather than as a crash.
  running.set(job.recordId, { child, startedAt: Date.now(), job });
  // the wall-clock backstop rides the same stopped path stopForge uses
  const backstop = setTimeout(() => {
    if (!running.has(job.recordId)) return;
    job.stopped = true;
    job.stoppedReason = `timed out after ${FORGE_MAX_MINUTES} minutes`;
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }, FORGE_MAX_MINUTES * 60_000);
  backstop.unref?.();

  let buf = '';
  let stderr = '';
  let finalText = '';
  let cost = null;
  let sawError = false;

  child.stdout.on('data', async (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      const update = readStreamEvent(ev);
      if (!update) continue;
      if (update.kind === 'result') {
        sawError = update.isError;
        finalText = update.text;
        cost = update.costUsd;
        continue;
      }
      // Live status on the rails: the record's own text carries what the job
      // is doing, so every surface that already renders records (phone, HUD,
      // sidebar lights) shows it without new plumbing.
      job.status = update.line;
      job.updatedAt = new Date().toISOString();
      try {
        await updateRecord(job.recordId, { forgeStatus: update.line, forgeElapsedMs: Date.now() - job.startedMs });
        broadcast('forge');
      } catch { /* a status update must never kill the build */ }
    }
  });
  child.stderr.on('data', (d) => { stderr += d; });

  const done = new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(-1));
  });
  const code = await done;
  running.delete(job.recordId);
  clearTimeout(backstop);

  // stdout BEFORE stderr: the real reason for a failure is in the result
  // event (is_error + total_cost_usd); stderr routinely carries harmless
  // warnings that have been misdiagnosed as causes before (DO NOT).
  if (job.stopped) {
    job.state = 'stopped';
    job.finishedAt = new Date().toISOString();
    job.costUsd = cost;
    await persistJob(job);
    await updateRecord(job.recordId, { status: 'error', error: job.stoppedReason || 'stopped by you', forgeStatus: null, forgeCostUsd: cost });
    broadcast('forge');
    await announceForge(job);
    return;
  }

  if (sawError || code !== 0 || !finalText) {
    const spent = Number.isFinite(cost) ? ` after $${cost.toFixed(2)}` : '';
    const reason = finalText || stderr.trim().slice(0, 300) || `the build exited with code ${code}${spent}`;
    job.state = 'error';
    job.error = reason;
    job.costUsd = cost;
    job.finishedAt = new Date().toISOString();
    await persistJob(job);
    await updateRecord(job.recordId, { status: 'error', error: reason, forgeStatus: null, forgeCostUsd: cost });
    broadcast('forge');
    // The important one: an `error` record notifies nobody through the rails,
    // so without this a build dispatched from his wrist could fail in silence.
    await announceForge(job);
    return;
  }

  const { summary, cleanText } = parseBuiltLine(finalText);
  const { proof, proofNote } = await captureProof(job);
  job.state = 'built';
  job.summary = summary;
  job.detail = cleanText;
  job.costUsd = cost;
  job.proof = proof;
  job.proofNote = proofNote;
  job.finishedAt = new Date().toISOString();
  await persistJob(job);

  // A built job lands PENDING, not filed: he still decides whether it was
  // what he wanted, and the artifact directory is disposable either way.
  await updateRecord(job.recordId, {
    status: 'pending',
    forgeStatus: null,
    forgeCostUsd: cost,
    forgeProof: proof,
    forgeProofNote: proofNote,
    forgeDir: job.dir,
    forgeSummary: summary,
    text: `Forge: ${job.prompt}${summary ? ` — ${summary}` : ''}`,
  });
  broadcast('forge');
  await announceForge(job);
}

export async function startForge(prompt, { model } = {}) {
  const p = String(prompt || '').trim();
  if (!p) throw new Error('a prompt is required — say what you want built');
  // Refused before the record and its working directory exist. Jobs already
  // running are deliberately left alone — stopping one is a separate act.
  if (!laneEnabled('forge')) throw laneOffError('forge');
  if (p.length > MAX_PROMPT_CHARS) throw new Error(`keep a spoken build request under ${MAX_PROMPT_CHARS} characters`);
  // the same build twice, or a third build on top of two, is refused with
  // the running jobs named — a stop is a separate, explicit act
  const dup = duplicateRunning(running.values(), p);
  if (dup) throw new Error(`that build is already going ("${dup.prompt.slice(0, 60)}") — say stop first if you want a fresh one`);
  if (running.size >= MAX_CONCURRENT_FORGE) throw new Error(`${running.size} builds are already running (${[...running.values()].map((l) => `"${String(l.job.prompt).slice(0, 40)}"`).join(', ')}) — wait for one to finish or stop it first`);

  const id = randomUUID().slice(0, 8);
  const dir = path.join(FORGE_ROOT, `${slugify(p)}-${id}`);
  await mkdir(dir, { recursive: true });

  const record = await createRecord({
    id,
    kind: 'forge-job',
    text: `Forge: ${p}`,
    source: 'forge',
    mode: 'draft',
    status: 'classifying', // in-flight on the rails: agent lights pulse everywhere
    createdAt: new Date().toISOString(),
    forgeStatus: 'Starting…',
    forgeDir: dir,
  });

  const job = {
    id, recordId: record.id, prompt: p, dir, model: model || null,
    state: 'running', status: 'Starting…', startedAt: new Date().toISOString(),
    startedMs: Date.now(), costUsd: null, proof: null,
  };
  await persistJob(job);
  broadcast('forge');
  // Deliberately NOT awaited: the caller (a Shortcut on his wrist) gets an
  // instant acknowledgment and the job reports through the rails.
  runForgeJob(job).catch(async (e) => {
    try {
      await updateRecord(record.id, { status: 'error', error: e.message, forgeStatus: null });
      broadcast('forge');
    } catch { /* nothing left to do */ }
  });
  return { id, recordId: record.id, dir };
}

export async function stopForge(recordId) {
  const live = running.get(recordId);
  if (!live) return { stopped: false, note: 'that job is not running' };
  // Mark the LIVE object BEFORE killing: the close handler races the signal,
  // and a stop that arrived after it would otherwise be reported as a crash.
  // (Reading the persisted receipt here instead would mutate a disk copy the
  // running job never sees — which is exactly the bug this comment replaces.)
  live.job.stopped = true;
  const rec = await getRecord(recordId);
  if (rec) await updateRecord(recordId, { forgeStatus: 'Stopping…' });
  try { live.child.kill('SIGTERM'); } catch { /* already gone */ }
  return { stopped: true };
}

export function _runningCount() { return running.size; }

// Disposable by design: the artifact directory is derived data, so clearing
// it is safe and needs no undo. Used when he discards a forge record.
export async function discardForgeArtifacts(dir) {
  if (!dir || !dir.startsWith(FORGE_ROOT)) return false; // never delete outside the sandbox root
  // the proof PNG goes with the artifacts — the job id is the dir's suffix
  const id = (path.basename(dir).match(/-([0-9a-f]{8})$/) || [])[1];
  if (id) await rm(path.join(JOBS_DIR, `${id}.png`), { force: true }).catch(() => {});
  try { await rm(dir, { recursive: true, force: true }); return true; } catch { return false; }
}

// RETENTION. Receipts and proof PNGs beyond the newest FORGE_KEEP_JOBS, and
// artifact directories older than FORGE_ARTIFACT_DAYS (running ones aside),
// are pruned at boot beside the platform's other pruners. Returns counts.
export async function pruneForge({ keepJobs = FORGE_KEEP_JOBS, artifactDays = FORGE_ARTIFACT_DAYS, now = Date.now(), jobsDir = JOBS_DIR, forgeRoot = FORGE_ROOT } = {}) {
  const { readdir, stat } = await import('node:fs/promises');
  let receipts = 0, artifacts = 0;
  try {
    const files = (await readdir(jobsDir)).filter((f) => /\.json$/.test(f));
    const dated = [];
    for (const f of files) { try { dated.push({ f, ms: (await stat(path.join(jobsDir, f))).mtimeMs }); } catch { /* gone */ } }
    dated.sort((a, b) => b.ms - a.ms);
    for (const { f } of dated.slice(keepJobs)) {
      const id = f.replace(/\.json$/, '');
      await rm(path.join(jobsDir, f), { force: true }).catch(() => {});
      await rm(path.join(jobsDir, `${id}.png`), { force: true }).catch(() => {});
      receipts++;
    }
  } catch { /* no receipts yet */ }
  try {
    const cutoff = now - artifactDays * 86_400_000;
    const runningDirs = new Set([...running.values()].map((l) => l.job.dir));
    for (const d of await readdir(forgeRoot)) {
      const full = path.join(forgeRoot, d);
      if (runningDirs.has(full)) continue;
      try { const st = await stat(full); if (st.isDirectory() && st.mtimeMs < cutoff) { await rm(full, { recursive: true, force: true }); artifacts++; } } catch { /* gone */ }
    }
  } catch { /* no artifacts yet */ }
  return { receipts, artifacts };
}

export { FORGE_ROOT, JOBS_DIR };

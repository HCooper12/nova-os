import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';

// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.5';

// Deliberately no Bash — this tab can read and edit real files (in the Nova OS
// repo or the vault, whichever workspace is selected) but can't run shell
// commands. Every other AI feature in Nova runs with zero tool access; this
// is the first one that can touch the filesystem, so it stays to the
// smallest capability that's still genuinely useful for "coding" — file
// read/write, not process execution.
//
// IMPORTANT: --allowedTools is NOT a hard restriction under
// --permission-mode bypassPermissions — verified empirically that Bash (and
// the full built-in toolset, plus any connected MCP servers) stays reachable
// even when only Read/Edit/Write/Grep/Glob are named there. --disallowedTools
// IS enforced as a real block regardless of permission mode, so that's the
// actual safety boundary — --allowedTools is kept only for documentation.
// --strict-mcp-config drops all MCP-provided tools (Slack, Notion, Gmail,
// etc.) since none of those were ever intended to be reachable from here.
// This exact combination was verified by asking Claude to exhaustively list
// its available tools and confirming the result was precisely
// Read/Edit/Write/Glob/Grep — nothing else.
const ALLOWED_TOOLS = 'Read Edit Write Grep Glob';
const DISALLOWED_TOOLS = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
].join(',');

const jobs = new Map();

// message: { text, sessionId?, model? } — sessionId absent means start a new
// conversation (a fresh session id is minted and returned for the caller to
// pass on the next turn); present means continue that conversation via
// --resume, preserving full context across turns.
export function startMessage(cwd, { text, sessionId, model }) {
  const jobId = randomUUID().slice(0, 8);
  const isNewSession = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    '-p', text,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', ALLOWED_TOOLS,
    '--disallowedTools', DISALLOWED_TOOLS,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
  ];
  args.push(isNewSession ? '--session-id' : '--resume', effectiveSessionId);
  if (model) args.push('--model', model);

  const child = spawn(CLAUDE_BIN, args, { cwd });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `claude exited with code ${code}`;
      return;
    }
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'Claude Code request failed');
      const replyText = (outer.result || '').trim();
      if (!replyText) throw new Error('Empty response');
      job.result = { text: replyText, sessionId: effectiveSessionId };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getMessageJob(jobId) {
  return jobs.get(jobId) || null;
}

// Ask Nova — the voice screen's brain. A READ-ONLY session over the vault
// (same structural boundary as the Breaker: Edit/Write disallowed) that
// answers questions from what's actually written there, in a spoken
// register. Exported separately so tests can check the prompt contract
// without spawning anything.
export function buildAskPrompt({ question, context = '' }) {
  return `${NOVA_LENS}

You are Nova — Hayden's personal OS and ongoing companion. This is a CONTINUING conversation: it resumes across days, so remember what he tells you here and build on it naturally, the way a sharp assistant who knows him would. Your working directory is his Obsidian vault — real notes, health pages, workout sessions, recipes, journal, money ledger context. Read whatever pages you need.

Ground rules:
- Ground answers in the vault, the live context below, and what he's told you in this conversation. If something isn't anywhere, say so plainly — never invent.
- Spoken register: conversational, direct, no markdown, no bullet lists. Lead with the answer. Under ~90 words unless the question genuinely needs more.
- Mention page titles naturally when useful ("your Rigour Protocols note says…").
- BE FAST. The live context below usually already holds the answer — reply straight from it. Only read the vault (Read/Grep/Glob) when the question genuinely needs a specific page you don't already have in front of you; don't search reflexively, it just adds delay.
- You are read-only. To CHANGE something, point at the surface that does it (capture in the Inbox, To-Do tab, Train, Money). If he asks you to remember something permanently, tell him to tap REMEMBER on your reply — that files it into the vault through the normal rails.
- Be a companion, not a search box: notice patterns across what he shares, connect it to his goals, and say the useful hard thing kindly when the data warrants it.

Live context (deterministic, computed at conversation start — trust it over stale pages for today's numbers):
${context || '(unavailable)'}

Hayden asks: ${question}`;
}

// Continuity: the first ask mints a session; later asks --resume it, so the
// conversation carries across turns AND days (same mechanism as the Code
// tab). The client persists the returned sessionId; NEW CHAT drops it.
export function startAskNova(cwd, { question, context, sessionId }) {
  const jobId = randomUUID().slice(0, 8);
  const isNewSession = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    '-p', isNewSession ? buildAskPrompt({ question, context }) : question,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    // Haiku for the voice line: the rich deterministic context is already
    // injected, so a fast model answers conversationally in a fraction of
    // the time while staying grounded. (Coach/Researcher keep the default.)
    '--model', 'haiku',
  ];
  args.push(isNewSession ? '--session-id' : '--resume', effectiveSessionId);

  const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const replyText = (outer.result || '').trim();
      if (!replyText) throw new Error('Empty response');
      job.result = { text: replyText, sessionId: effectiveSessionId };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = code !== 0 && !(stdout || '').trim() ? (stderr.trim() || `claude exited with code ${code}`) : e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

// Ask Coach — the Train screen's chat, made real. Same read-only structural
// boundary as Ask Nova, but a different persona: an evidence-based strength
// coach who knows Hayden's goals, history, and recovery data, and answers
// like a professional — principled, specific, honest about uncertainty.
export function buildCoachPrompt({ question, context = '' }) {
  return `${NOVA_LENS}

You are Nova's Coach — Hayden's personal strength & conditioning coach. This is a CONTINUING conversation that resumes across days — remember what he tells you and coach the long arc, not just today's question. You reason like an experienced, evidence-based practitioner: progressive overload, volume and intensity management, proximity to failure, recovery and sleep, protein targets, long-term adherence over heroics. You give the advice a great human coach would: specific to HIS data, decisive, and honest when evidence is mixed or his data is too thin to say.

Your working directory is Hayden's Obsidian vault — his real training sessions (Wiki/Health/Workouts/), fitness goals, exercise state, health pages, nutrition. Read what you need; never invent numbers that aren't there.

Ground rules:
- Anchor every recommendation in his actual goals and logged history below/in the vault. If history is too thin, say what to log so you can judge next time.
- Be concrete: exact exercises, sets × reps, loads (kg), rest, or habits — not generic advice.
- Cite the principle briefly when it matters ("two sessions topped your rep target — classic double-progression trigger") — teach, don't lecture.
- Safety: flag genuine red flags (pain vs soreness, sleep collapse) plainly; you are not a doctor and say so when it's medical.
- You are read-only: to CHANGE a routine, point him at the Train screen's editor; to log food, the Recipes/Inbox surfaces. Never claim you wrote anything.
- Plain text, conversational, tight. Lead with the answer.

Hayden's current picture (computed at conversation start — trust it over stale pages):
${context || '(unavailable)'}

Hayden asks: ${question}`;
}

export function startAskCoach(cwd, { question, context, sessionId }) {
  const jobId = randomUUID().slice(0, 8);
  const isNewSession = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    '-p', isNewSession ? buildCoachPrompt({ question, context }) : question,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
  ];
  args.push(isNewSession ? '--session-id' : '--resume', effectiveSessionId);
  const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const replyText = (outer.result || '').trim();
      if (!replyText) throw new Error('Empty response');
      job.result = { text: replyText, sessionId: effectiveSessionId };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = code !== 0 && !(stdout || '').trim() ? (stderr.trim() || `claude exited with code ${code}`) : e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

// Quick Session — the Coach designs a one-off, time-boxed workout for days
// outside the program. Same read-only boundary; the output is a typed JSON
// plan the client loads into the normal session editor, so logging, editing,
// receipts, and history all work exactly like a programmed session.
export function buildQuickSessionPrompt({ minutes, note, context = '' }) {
  return `${NOVA_LENS}

You are Nova's Coach designing an IMPROMPTU session for Hayden — a one-off workout for a day outside his normal program. He has ${minutes} minutes${note ? ` and says: "${note}"` : ''}.

Design rules (think like a real coach):
- Fit the time box honestly: warm-up included in the budget, ~2-3 min per working set with rests. ${minutes} minutes ≈ ${Math.max(3, Math.round(minutes / 8))}-${Math.max(4, Math.round(minutes / 6))} working exercises.
- Serve his stated goals and RESPECT the week's context below — don't hammer what yesterday's session hammered or steal tomorrow's scheduled work; fill the gap the program leaves.
- Prefer exercises FROM HIS LIBRARY (exact names below) so his history and prefills attach; only invent an exercise if the library truly lacks the pattern.
- Give concrete prescriptions: sets × reps and a weight hint from his logged numbers where the library has history ("~80kg — last time 80×8"), or "start light" where it doesn't.
- One line of rationale: why THIS session today, tied to goals/recovery/context.

Hayden's picture (computed just now):
${context || '(unavailable)'}

Output ONLY a JSON object: {"name": "Short Session Name", "rationale": "one sentence", "exercises": [{"name": "Exact Library Name or new name", "sets": 3, "reps": 10, "weightHint": "~80kg" }]}. No code fences, no commentary.`;
}

export function startQuickSession(cwd, { minutes, note, context }) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildQuickSessionPrompt({ minutes, note, context }),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in plan response');
      job.result = { plan: JSON.parse(jsonMatch[0]) };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = code !== 0 && !(stdout || '').trim() ? (stderr.trim() || `claude exited with code ${code}`) : e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

// The Sparring loop's Breaker: an isolated, READ-ONLY session that tries to
// break what the Builder (the normal chat) just shipped. Edit/Write join the
// disallowed list, so the separation of duties is structural — the Breaker
// proves weaknesses; only the Builder can fix them. Fresh session every time
// (no --resume): the Breaker judges the work cold, like a reviewer should.
const BREAKER_DISALLOWED = DISALLOWED_TOOLS + ',Edit,Write';

export function startBreaker(cwd, { focus }) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const prompt = `You are the BREAKER in a builder/breaker sparring loop over this workspace. Your job is adversarial review: find what is genuinely broken, fragile, or wrong — then STOP. You cannot edit anything (your tools are read-only by design); the builder is the only one who can fix what you find.

${focus ? `The builder says the recent work to attack is: ${focus}` : 'No specific focus was given — inspect the most recently modified files and attack the newest work.'}

Method: read the relevant code carefully. Hunt for concrete failures — logic errors, unhandled edge cases, broken contracts between modules, regressions, data-loss risks. Trace real inputs through the code rather than pattern-matching on style. Do not report style nits, hypotheticals you couldn't trace, or praise.

Report format: a short verdict line, then a numbered list of findings — each with the file:line, what breaks, and the concrete input/state that triggers it. If you genuinely find nothing after a real attempt, say exactly that and note what you checked. Plain text, no markdown headers.`;

  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(), // fresh session every time — the Breaker judges cold
  ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); // stdin closed — the CLI otherwise waits on the open pipe

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      // Prefer the CLI's own structured message even on a nonzero exit —
      // budget stops land there, with only noise on stderr.
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const replyText = (outer.result || '').trim();
      if (!replyText) throw new Error('Empty response');
      job.result = { text: replyText };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = code !== 0 && !(stdout || '').trim() ? (stderr.trim() || `claude exited with code ${code}`) : e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

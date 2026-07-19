import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

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
export function buildAskPrompt({ question, history = [], context = '' }) {
  const recent = history.slice(-6).map((m) => `${m.who === 'nova' ? 'Nova' : 'Hayden'}: ${m.text}`).join('\n');
  return `You are Nova, Hayden's personal OS, answering a spoken question. Your working directory is Hayden's Obsidian vault — their real notes, health pages, workout sessions, recipes, journal. Read whatever pages you need to answer.

Ground rules:
- Answer ONLY from the vault and the live context below. If it isn't there, say so plainly ("nothing in the vault on that") — never invent.
- This will be read aloud: conversational, direct, no markdown, no bullet lists, no headers. Lead with the answer.
- Keep it under ~90 words unless the question genuinely needs more.
- Mention page titles naturally when useful ("your Rigour Protocols note says…").
- You are read-only here. If asked to change something, say which Nova surface does it (capture in the Inbox, To-Do tab, Train) — you can't write from the voice line.

Live context (deterministic, computed just now — trust it over stale pages for today's numbers):
${context || '(unavailable)'}
${recent ? `\nConversation so far:\n${recent}\n` : ''}
Hayden asks: ${question}`;
}

export function startAskNova(cwd, { question, history, context }) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildAskPrompt({ question, history, context }),
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

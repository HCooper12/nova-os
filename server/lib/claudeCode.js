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

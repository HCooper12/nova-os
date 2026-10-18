import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EFFORT_PROBE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

// THE SPAWN BOUNDARY — the one place that decides what a spawned Claude CLI
// can actually touch.
//
// The load-bearing fact, verified empirically and recorded in three places
// before this file existed (claudeCode.js, scanFood.js, forge.js):
// **--allowedTools is NOT a restriction under --permission-mode
// bypassPermissions.** Naming only `Read` there does not stop the model
// reaching Bash, Write, the web, or any connected MCP server.
// --disallowedTools IS enforced regardless of permission mode. So a lane
// that passes an allow-list and no deny-list has no boundary at all — it
// only looks like it does, which is worse than looking open.
//
// The August 2026 audit swept every spawn site: 14 of them were in exactly
// that state, including three that pass `--allowedTools ''` (meaning "no
// tools please") while the model could in fact write files and run shell.
// Naming the deny-list by hand at each site is what let that happen, and
// the hand-copied lists had already drifted into three near-identical
// variants.
//
// The fix is to stop hand-maintaining deny-lists: a lane declares what it
// NEEDS, and this module denies the complement. --allowedTools becomes real
// by construction. A tool that is not named cannot be reached, and a new
// tool added to TOOL_UNIVERSE is denied everywhere at once by default —
// the safe direction to fail.
//
// Usage — replace the pair of args at the spawn site:
//   ...boundaryArgs('Read Grep Glob')     // needs to read the vault
//   ...boundaryArgs('')                   // pure reasoning, zero tools
//
// --strict-mcp-config rides along because MCP-provided tools (Slack, Notion,
// Gmail, …) can never be enumerated in a deny-list, so dropping them wholesale
// is the only honest way to keep them out. No Nova lane has ever wanted one.

// Every tool a spawned lane could reach. The deny-list is this MINUS what the
// lane asks for, so anything added here is denied by default everywhere.
//
// This list must be re-checked against the CLI after a Claude Code upgrade:
// a tool the CLI gains that is NOT named here is reachable by every lane.
// ListAgents and Workflow were absent from the hand-written lists this module
// replaced and are included here for that reason. Names that no longer exist
// are harmless to keep — denying an absent tool is a no-op, and dropping one
// is how a hole reopens.
//
// VERIFY FUNCTIONALLY, NEVER BY ASKING. A model's account of its own tools is
// unreliable: while this module was being written, the same prompt returned
// two different tool lists one minute apart, one of them naming "PowerShell".
// Use a canary instead — ask a sealed lane to write a file and check the
// filesystem (2026-09-01: old args wrote it, boundaryArgs('') did not):
//
//   claude -p "Write the text X to /tmp/probe.txt" --permission-mode \
//     bypassPermissions --allowedTools '' --disallowedTools "<the list below>" \
//     --strict-mcp-config --model haiku --no-session-persistence
//   test -f /tmp/probe.txt && echo STILL OPEN || echo ENFORCED
export const TOOL_UNIVERSE = [
  // file + search
  'Read', 'Edit', 'Write', 'Grep', 'Glob', 'NotebookEdit',
  // execution and delegation — never wanted from a Nova lane
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'Workflow', 'ListAgents',
  // the web
  'WebFetch', 'WebSearch',
  // orchestration, scheduling, and anything that reaches outside the box
  'ScheduleWakeup', 'ReportFindings', 'Artifact', 'SendMessage',
  'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate',
  'Monitor',
];

// Accepts either separator the codebase already uses: 'Read Grep Glob' and
// 'Read,Write,Edit' both appear at existing spawn sites.
function parseAllowed(allowed) {
  return new Set(String(allowed || '').split(/[\s,]+/).filter(Boolean));
}

// The enforced deny-list for a lane: everything it did not ask for.
export function denyAllExcept(allowed) {
  const keep = parseAllowed(allowed);
  return TOOL_UNIVERSE.filter((t) => !keep.has(t)).join(',');
}

// The three args that must always travel together. Spreading one call means
// an allow-list can never again ship without its matching enforcement.
export function boundaryArgs(allowed) {
  return [
    '--allowedTools', String(allowed || ''),
    '--disallowedTools', denyAllExcept(allowed),
    '--strict-mcp-config',
  ];
}

// ------------------------------- effort -------------------------------------
// --effort on every conversational spawn (lib/modelPrefs.js effortFor), so the
// account's ambient `effortLevel: "xhigh"` never reaches a lane. Older CLIs
// have no such flag and would refuse to start with it, so the installed one
// is asked once, at load (`claude --help`, 5 s: a read of a help page, never
// a model run), and the flag is dropped with one log line if it is missing.
// Until the answer lands the flag is sent: the CLI on his Mac has it
// (verified 18 Oct 2026, `claude --help`: "--effort <level> … low, medium,
// high, xhigh, max").
let effortSupported = null;
let probed = false;
// Lazy, on the first flag asked for — not at import. At import it ran in every
// test that loads modelPrefs.js, against whatever CLAUDE_BIN the test had
// stubbed in, and the stub's own log of that `--help` call raced the lane
// call the test was waiting for (CI run 39172535365, 19 Oct 2026).
function probeEffort() {
  if (probed) return;
  probed = true;
  try {
    // spawn's own `timeout` ends a help page that hangs; it is a read, never
    // a model run, so no turn is ever cut short by it
    const child = spawn(EFFORT_PROBE_BIN, ['--help'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const settle = (ok) => {
      if (effortSupported !== null) return;
      effortSupported = ok;
      if (!ok) console.log('claude: the installed CLI has no --effort flag, so every lane spawns without it and thinks at the account\'s level');
    };
    child.on('close', () => settle(/--effort\b/.test(out)));
    child.on('error', () => settle(false));
    child.unref?.();
    child.stdout.unref?.();
  } catch { effortSupported = false; }
}
export function effortFlag(level) {
  if (!level) return [];
  if (effortSupported === null) probeEffort();
  if (effortSupported === false) return [];
  return ['--effort', level];
}
export function _setEffortSupportedForTest(v) { effortSupported = v; probed = true; }

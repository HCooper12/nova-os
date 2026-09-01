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

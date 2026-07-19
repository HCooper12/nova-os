import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord } from './inboxStore.js';

// The Researcher — Nova's first agent that reaches OUTSIDE the vault. The
// boundaries are structural: it runs only on an explicit "research …" ask
// (never auto-triggered by a classifier), its tools are web-read-only
// (WebSearch/WebFetch/Read — no file writes, no shell), and its brief ALWAYS
// lands as a pending note in the Inbox. Nothing it produces files itself.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';

// Everything except the web-read tools and Read. Edit/Write matter most.
const RESEARCH_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write', 'Grep', 'Glob',
].join(',');

export function buildResearchPrompt(question) {
  return `You are Nova's Researcher, building a short web-research brief for Hayden's second brain (an Obsidian vault). Research the question below using web search, then write the brief.

Rules:
- EVERY factual claim carries a numbered citation like [1], and the Sources section lists each number with title and URL. No citation → don't claim it.
- Prefer primary and reputable sources; note disagreement between sources honestly instead of averaging it away.
- Say what you could NOT establish. An honest gap beats a confident guess.
- Keep it tight: a 2-3 sentence summary, then 3-6 key points, then the sources list. ~250-400 words total.
- This files into the vault as a note for review — write it timelessly (dates absolute, no "recently").

The question: ${question}

Output ONLY a JSON object: {"title": "Short Note Title", "body": "the full brief in markdown — summary, key points, ## Sources list"}. No code fences, no commentary.`;
}

export function normalizeResearch(parsed) {
  const title = String(parsed.title || '').trim().slice(0, 120);
  const body = String(parsed.body || '').trim();
  if (!title || !body) throw new Error('researcher returned an incomplete brief');
  if (!/\[\d+\]/.test(body) || !/sources/i.test(body)) throw new Error('brief is missing citations — refusing to file unsourced claims');
  return { title, body };
}

export async function startResearch(vaultPath, question) {
  const q = (question || '').trim();
  if (!q) throw new Error('a research question is required');
  if (q.length > 500) throw new Error('keep the research question under 500 characters');

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'research',
    text: `Research: ${q}`,
    source: 'researcher',
    mode: 'draft',
    status: 'classifying', // shows as in-flight in the queue
    createdAt: new Date().toISOString(),
  });

  const child = spawn(CLAUDE_BIN, [
    '-p', buildResearchPrompt(q),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'WebSearch WebFetch Read',
    '--disallowedTools', RESEARCH_DISALLOWED,
    '--strict-mcp-config', // MCP servers can't auth under launchd — drop them; WebSearch/WebFetch are built-ins
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in researcher response');
      const { title, body } = normalizeResearch(JSON.parse(jsonMatch[0]));
      // ALWAYS pending — web content never files itself
      await updateRecord(record.id, {
        status: 'pending',
        decision: {
          route: 'note',
          confidence: 'high',
          title,
          reason: 'Web-research brief — review the sources before it enters the vault.',
          payload: { title, body },
        },
      });
    } catch (e) {
      await updateRecord(record.id, { status: 'error', error: e.message }).catch(() => {});
    }
  });
  child.on('error', async (err) => {
    await updateRecord(record.id, { status: 'error', error: err.message }).catch(() => {});
  });

  return record;
}

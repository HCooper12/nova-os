import { spawn } from 'node:child_process';
import { firstBalancedObjectMatch } from './jsonSalvage.js';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord } from './inboxStore.js';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneOffError, laneEnabled } from './modelPrefs.js';
import { isGateModel } from './modelChoice.js';
import { settleWatchdog } from './settle.js';

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
  return `${NOVA_LENS}

You are Nova's Researcher, building a short web-research brief for Hayden's second brain (an Obsidian vault). Research the question below using web search, then write the brief.

Rules:
- EVERY factual claim carries a numbered citation like [1], and the Sources section lists each number with title and URL. No citation → don't claim it.
- Prefer primary and reputable sources; note disagreement between sources honestly instead of averaging it away.
- Say what you could NOT establish. An honest gap beats a confident guess.
- Keep it tight: a 2-3 sentence summary, then 3-6 key points, then the sources list. ~250-400 words total.
- This files into the vault as a note for review — write it timelessly (dates absolute, no "recently").

The question: ${question}

Output ONLY a JSON object: {"title": "Short Note Title", "body": "the full brief in markdown — summary, key points, ## Sources list"}. No code fences, no commentary.`;
}

// A conversation reply may end with one RESEARCH line — parsed off the text
// the same way as SHOW/PROPOSE. The boundary stays structural: the directive
// only fires when Hayden explicitly asked for research, and the brief still
// ALWAYS lands as a pending, citation-required note.
export function parseResearchDirective(text) {
  const m = (text || '').match(/^\s*RESEARCH\s+(\{.*\})\s*$/m);
  if (!m) return { cleanText: text, research: null };
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const parsed = JSON.parse(m[1]);
    const question = String(parsed.question || '').trim();
    if (!question) return { cleanText, research: null, parseError: 'the research directive had no question' };
    return { cleanText, research: { question, when: parsed.when === 'tonight' ? 'tonight' : 'now' } };
  } catch {
    return { cleanText, research: null, parseError: 'the research directive was not valid JSON' };
  }
}

// THE CITATION GATE CHECKS INTEGRITY, NOT PRESENCE. It used to pass any brief
// with one "[1]" anywhere and the word "sources" — six claims and one
// citation, numbers pointing at nothing, sources with no URL, all filed as
// "citation-required research". Now every number cited in the body must
// resolve to a Sources entry, and every entry must carry a URL. Pure.
export function checkCitations(body) {
  const text = String(body || '');
  const at = text.search(/^\s*#{0,3}\s*sources\b/im);
  const claims = at >= 0 ? text.slice(0, at) : text;
  const sourcesBlock = at >= 0 ? text.slice(at) : '';
  const cited = [...new Set([...claims.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
  const entries = new Map(); // number → has a URL
  for (const line of sourcesBlock.split('\n')) {
    const m = line.match(/^\s*(?:[-*]\s*)?(?:\[(\d+)\]|(\d+)[.)])\s*(.*)$/);
    if (!m) continue;
    entries.set(Number(m[1] || m[2]), /https?:\/\/\S+/i.test(m[3]));
  }
  const missing = cited.filter((n) => !entries.has(n));
  const withoutUrl = [...entries.entries()].filter(([, ok]) => !ok).map(([n]) => n);
  return { cited, entries: [...entries.keys()], missing, withoutUrl, ok: cited.length > 0 && !missing.length && !withoutUrl.length };
}

export function normalizeResearch(parsed) {
  const title = String(parsed.title || '').trim().slice(0, 120);
  const body = String(parsed.body || '').trim();
  if (!title || !body) throw new Error('researcher returned an incomplete brief');
  const c = checkCitations(body);
  if (!c.cited.length || !c.entries.length) throw new Error('brief is missing citations — refusing to file unsourced claims');
  if (c.missing.length) throw new Error(`brief cites [${c.missing.join('], [')}] but its Sources list has no such entr${c.missing.length === 1 ? 'y' : 'ies'} — refusing to file claims that point at nothing`);
  if (c.withoutUrl.length) throw new Error(`source${c.withoutUrl.length === 1 ? '' : 's'} [${c.withoutUrl.join('], [')}] carr${c.withoutUrl.length === 1 ? 'ies' : 'y'} no URL — a source he cannot open is not a source`);
  return { title, body };
}

// `model`: an explicit per-run override from the model-choice gate (the
// caller already asked "Opus or Sonnet?" before reaching here) — 'opus' or
// 'sonnet' only, never the full model board. Omitted, this run just uses
// the lane's standing default (modelFor('researcher')), same as always.
export async function startResearch(vaultPath, question, { model } = {}) {
  const q = (question || '').trim();
  if (!q) throw new Error('a research question is required');
  if (q.length > 500) throw new Error('keep the research question under 500 characters');
  if (model !== undefined && !isGateModel(model)) throw new Error("model must be 'opus' or 'sonnet'");
  // Refused before the record exists: a switched-off lane must not leave a
  // record sitting in 'classifying' that nothing will ever resolve.
  if (!laneEnabled('researcher')) throw laneOffError('researcher');

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'research',
    text: `Research: ${q}`,
    source: 'researcher',
    mode: 'draft',
    status: 'classifying', // shows as in-flight in the queue
    createdAt: new Date().toISOString(),
    // the gate's per-run answer rides the record so a RETRY runs on the model
    // he chose — it used to fall back to the lane default silently
    model: model || null,
  });
  runResearchJob(vaultPath, record.id, q, model);
  return record;
}

// A research record carries its whole input in its text, so a failed run can
// re-fire in place — same record, same question, fresh attempt.
export async function retryResearch(vaultPath, record) {
  const q = String(record.text || '').replace(/^Research:\s*/, '').trim();
  if (!q) throw new Error('this research record has no question to re-run');
  if (!laneEnabled('researcher')) throw laneOffError('researcher');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runResearchJob(vaultPath, record.id, q, record.model || undefined);
  return updated;
}

// The spawn-and-settle step, shared by first runs and retries.
function runResearchJob(vaultPath, recordId, q, model) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildResearchPrompt(q),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'WebSearch WebFetch Read',
    '--disallowedTools', RESEARCH_DISALLOWED,
    '--strict-mcp-config', // MCP servers can't auth under launchd — drop them; WebSearch/WebFetch are built-ins
    '--output-format', 'json',
    // named explicitly — an unpinned call silently inherits the account's
    // ambient default model, which cost him a Fable-5 usage-limit hit on a
    // totally unrelated lane (Coach) once that became the default. The pin
    // comes from the model board (lib/modelPrefs.js) so it is settable in
    // Settings, UNLESS the model-choice gate already asked and got an
    // explicit per-run answer — that answer wins for this one job only.
    '--model', model || modelFor('researcher'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: "the research", minutes: 20 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = firstBalancedObjectMatch(text);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in researcher response');
      const { title, body } = normalizeResearch(JSON.parse(jsonMatch[0]));
      // ALWAYS pending — web content never files itself
      await updateRecord(recordId, {
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
      await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
    }
  });
  child.on('error', async (err) => {
    await updateRecord(recordId, { status: 'error', error: err.message }).catch(() => {});
  });
}

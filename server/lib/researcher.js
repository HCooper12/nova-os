import { spawn } from 'node:child_process';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord } from './inboxStore.js';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneOffError, laneEnabled } from './modelPrefs.js';
import { isGateModel } from './modelChoice.js';
import { settleWatchdog } from './settle.js';
import {
  BRIEF_RULES, DECISION_RULES, FALLBACK_PANEL, buildPlannerPrompt, parsePanel,
  buildWorkerPrompt, parseFindings, buildSynthesisPrompt, panelProgress,
} from './researchPanel.js';

// The Researcher — Nova's first agent that reaches OUTSIDE the vault. The
// boundaries are structural: it runs only on an explicit "research …" ask
// (never auto-triggered by a classifier), its tools are web-read-only
// (WebSearch/WebFetch/Read — no file writes, no shell), and its brief ALWAYS
// lands as a pending note in the Inbox. Nothing it produces files itself.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';

// THE PANEL'S BUDGET, per child, not per question. Four workers plus a merge
// is five processes where there used to be one, so the caps are set so the
// WHOLE panel lands near the single-agent ceiling rather than five times it:
// 0.45 × 4 searching + 0.60 merging ≈ 2.4 worst case, against 1.0 before.
// That is the real price of the fan-out and it is written here rather than
// discovered on a bill. Measure a real pass before moving these.
const WORKER_BUDGET_USD = '0.45';
const SYNTH_BUDGET_USD = '0.60';
const PLANNER_BUDGET_USD = '0.10';

// TIERED BY TASK, per his cost rule. The workers search and extract — that is
// well-specified work and Sonnet does it. The MERGE is the judgment call (what
// disagrees, what outweighs what, and whether the answer is no), so it runs on
// whatever the lane is set to in Settings, which is where he controls it.
const WORKER_MODEL = 'sonnet';
const PLANNER_MODEL = 'sonnet';

// Everything except the web-read tools and Read. Edit/Write matter most.
const RESEARCH_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write', 'Grep', 'Glob',
].join(',');

export function buildResearchPrompt(question, context = '') {
  // MATERIAL: what an earlier agent found, when this brief is one step of a
  // plan. Plan 7bf8cee7 (5 Sep) asked the Researcher to check "the Watcher's
  // claims" and handed it none — the question is capped at 500 characters,
  // so a verdict can never travel inside it. It travels here instead.
  const material = String(context || '').trim();
  return `${NOVA_LENS}

You are Nova's Researcher, building a short web-research brief for Hayden's second brain (an Obsidian vault). Research the question below using web search, then write the brief.

Rules:
${BRIEF_RULES}

${DECISION_RULES}

The question: ${question}
${material ? `
MATERIAL FROM AN EARLIER AGENT — this is what the question refers to. Check THESE claims; do not go looking for a different list, and say so if the material does not actually contain what the question assumes:
${material.slice(0, 8000)}
` : ''}
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
export async function startResearch(vaultPath, question, { model, context } = {}) {
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
    // the plan's handoff rides the record too, so a RETRY checks the same material
    context: context ? String(context).slice(0, 8000) : null,
  });
  runResearchJob(vaultPath, record.id, q, model, context);
  return record;
}

// A research record carries its whole input in its text, so a failed run can
// re-fire in place — same record, same question, fresh attempt.
export async function retryResearch(vaultPath, record) {
  const q = String(record.text || '').replace(/^Research:\s*/, '').trim();
  if (!q) throw new Error('this research record has no question to re-run');
  if (!laneEnabled('researcher')) throw laneOffError('researcher');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runResearchJob(vaultPath, record.id, q, record.model || undefined, record.context || '');
  return updated;
}

// ONE CLAUDE, one prompt, one JSON answer. Every child in the panel goes
// through here so the tool boundary, the MCP drop and the model pin are
// stated once — a worker that quietly gained Write would be a hole in the
// "web-read-only" promise the whole agent rests on.
function askClaude(vaultPath, { prompt, model, budget, tools = 'WebSearch WebFetch Read', minutes = 12, label }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', tools,
        '--disallowedTools', RESEARCH_DISALLOWED,
        '--strict-mcp-config',
        '--output-format', 'json',
        '--model', model,
        '--max-budget-usd', budget,
        '--session-id', randomUUID(),
      ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { resolve({ error: e.message }); return; }

    let stdout = '';
    let stderr = '';
    settleWatchdog(child, { label, minutes });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ error: err.message }));
    child.on('close', (code) => {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
        resolve({ text: (outer.result || '').trim() });
      } catch (e) {
        resolve({ error: e.message || 'no answer' });
      }
    });
  });
}

// WHO SHOULD LOOK AT THIS. A cheap pass that names the panel for the question
// in hand; anything it gets wrong costs a fallback, never the run.
export async function planPanel(vaultPath, question) {
  // TWO GOES, THEN THE FALLBACK. Measured 18 Sep: this prompt succeeds on its
  // own three times out of three at ~$0.03, and failed once inside the first
  // real panel run — a transient, not a defect. One retry turns that into the
  // named panel he asked for; the alternative is a perfectly good brief
  // written by four angles called "Direct evidence" because the API blinked.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, error } = await askClaude(vaultPath, {
      prompt: buildPlannerPrompt(question),
      model: PLANNER_MODEL, budget: PLANNER_BUDGET_USD,
      tools: 'Read', minutes: 4, label: 'the research panel',
    });
    if (!error && text) {
      const match = text.match(/\[[\s\S]*\]/);
      const panel = parsePanel(match ? match[0] : text);
      if (panel) return { panel, planned: true };
    }
  }
  // Named for the question is better; named at all is what matters. The
  // fallback covers any question and always includes a dissenting angle.
  return { panel: FALLBACK_PANEL, planned: false };
}

// THE PANEL RUN. Workers go out together and their progress lands on the
// record as each returns, so the job tray can name who is still out — the
// whole point of the fan-out being visible rather than merely parallel.
async function runPanel(vaultPath, recordId, question, model, context) {
  const { panel, planned } = await planPanel(vaultPath, question);
  const workers = panel.map((w) => ({ name: w.name, status: 'working', found: 0 }));
  const publish = () => updateRecord(recordId, { panel: { ...panelProgress(workers), planned } }).catch(() => {});
  await publish();

  const reports = await Promise.all(panel.map(async (w, i) => {
    const { text, error } = await askClaude(vaultPath, {
      prompt: buildWorkerPrompt(question, w, context),
      model: WORKER_MODEL, budget: WORKER_BUDGET_USD,
      minutes: 12, label: `the ${w.name} researcher`,
    });
    if (error) {
      workers[i] = { ...workers[i], status: 'error', found: 0 };
      await publish();
      return { name: w.name, error };
    }
    const json = firstBalancedObjectMatch(text);
    const findings = json ? parseFindings(parseModelJson(json[0])) : [];
    workers[i] = { ...workers[i], status: 'done', found: findings.length };
    await publish();
    // A worker that ran and found nothing is NOT an error — an angle that
    // turns up empty is a finding, and the merge is told to report it.
    return { name: w.name, findings };
  }));

  // Every angle failed: there is nothing to merge and nothing honest to file.
  if (reports.every((r) => r.error)) {
    throw new Error(`all ${reports.length} researchers failed — ${reports[0].error}`);
  }
  await updateRecord(recordId, { panel: { ...panelProgress(workers), planned, merging: true } }).catch(() => {});

  const { text, error } = await askClaude(vaultPath, {
    prompt: buildSynthesisPrompt(question, reports, context),
    // NO WEB. The sources are chosen; a merge that searches on its own is a
    // fifth researcher nobody budgeted for, citing sources no angle vouched for.
    tools: 'Read',
    model: model || modelFor('researcher'),
    budget: SYNTH_BUDGET_USD, minutes: 10, label: 'the research merge',
  });
  if (error) throw new Error(`the merge failed — ${error}`);
  const json = firstBalancedObjectMatch(text);
  if (!json) throw new Error(text.slice(0, 200) || 'no JSON in the merge response');
  return normalizeResearch(parseModelJson(json[0]));
}

// The run, shared by first attempts and retries. A panel of named researchers
// goes out in parallel and one merge writes the brief — see researchPanel.js
// for why four different briefs beat four copies of the same agent.
//
// FAILURE IS STILL HONEST. A single angle coming back empty is a finding the
// merge reports; every angle failing is an error on the record, with the first
// reason attached, so a retry has something to act on rather than a shrug.
async function runResearchJob(vaultPath, recordId, q, model, context = '') {
  try {
    const { title, body } = await runPanel(vaultPath, recordId, q, model, context);
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
}

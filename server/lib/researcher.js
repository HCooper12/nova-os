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
// MEASURED, 21 Sep 2026, on his real question: three of four workers hit
// $0.45 mid-search ($0.50, $0.45, $0.45 spent) and each finished inside a
// $0.90 continuation; the fourth finished under $0.45 with eight findings.
// A full worker pass is therefore ~$0.9–1.3 on Sonnet. At $0.45 the pause
// fired on nearly every run, which turns "ask before spending more" into a
// tax on every plan. Set at roughly 2× the measured partial so the pause is
// the exception. The merge survived at $0.60 both times.
const WORKER_BUDGET_USD = '1.2';
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
export async function startResearch(vaultPath, question, { model, context, parentPlanId } = {}) {
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
    // the plan this is a step of, so a pause can wake it when he answers
    parentPlanId: parentPlanId || null,
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
// A BUDGET STOP IS ITS OWN ANSWER, NOT AN ERROR. Proved on 21 Sep 2026 by
// running the CLI against a deliberately tiny cap: it exits 1 with
// `is_error: true`, an EMPTY result, and `subtype: "error_max_budget_usd"`
// — and the same session id then RESUMES with a fresh budget and remembers
// everything it had done. Before this, that empty result was reported as a
// bare "claude exited with code 1", the worker was written off, and the
// plan's own report on 21 Sep said "8 of the 12 sub-angles failed outright"
// without anyone being able to say why. His rule the same day: "it should be
// able to pause the research or task (not just finish it) and ask me if I am
// happy for it to exceed the limit before concluding its task or proceeding
// further." So a stop is returned as a stop, with the session to resume.
export const BUDGET_STOP = 'error_max_budget_usd';

function askClaude(vaultPath, { prompt, model, budget, tools = 'WebSearch WebFetch Read', minutes = 12, label, resume = null }) {
  return new Promise((resolve) => {
    let child;
    const sessionId = resume || randomUUID();
    try {
      child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', tools,
        '--disallowedTools', RESEARCH_DISALLOWED,
        '--strict-mcp-config',
        '--output-format', 'json',
        '--model', model,
        '--max-budget-usd', String(budget),
        resume ? '--resume' : '--session-id', sessionId,
      ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { resolve({ error: e.message }); return; }

    let stdout = '';
    let stderr = '';
    settleWatchdog(child, { label, minutes });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ error: err.message }));
    child.on('close', (code) => {
      let outer = null;
      try { outer = JSON.parse(stdout); } catch { /* not JSON — fall through to the error path */ }
      if (outer?.subtype === BUDGET_STOP) {
        resolve({ budgetStop: true, sessionId, spent: Number(outer.total_cost_usd) || Number(budget) || 0, budget: Number(budget) || 0 });
        return;
      }
      if (!outer || outer.is_error || code !== 0) {
        resolve({ error: outer?.result || stderr.trim() || `claude exited with code ${code}` });
        return;
      }
      resolve({ text: (outer.result || '').trim(), sessionId, spent: Number(outer.total_cost_usd) || 0 });
    });
  });
}

// When a step pauses, the budget it is offered to continue with. Doubling is
// the honest shape: a worker that ran out at $0.45 mid-search needs room to
// finish, not the same cap it just hit.
export function continuationBudget(previous) {
  const p = Number(previous) || 0;
  return Math.max(0.5, Math.round(p * 2 * 100) / 100);
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
//
// RESUMABLE. `prior` is the state a paused run left behind: the workers that
// already reported (kept, never re-run — that would be paying twice) and the
// ones that stopped at their budget (resumed in their own session with more
// room). A first run has no prior. The return is one of three honest shapes:
//   { title, body }          — the brief
//   { paused: [...], ... }   — some part hit its budget; nothing was lost
//   throws                   — a real failure, with the first reason attached
async function runPanel(vaultPath, recordId, question, model, context, prior = null) {
  const first = !prior;
  const { panel, planned } = first ? await planPanel(vaultPath, question) : { panel: prior.panel, planned: prior.planned };
  const reportsByName = new Map((prior?.reports || []).map((r) => [r.name, r]));
  const pausedByName = new Map((prior?.paused || []).filter((p) => p.name !== 'merge').map((p) => [p.name, p]));
  const workers = panel.map((w) => {
    const done = reportsByName.get(w.name);
    return { name: w.name, status: done ? (done.error ? 'error' : 'done') : 'working', found: done?.findings?.length || 0 };
  });
  const publish = (extra = {}) => updateRecord(recordId, { panel: { ...panelProgress(workers), planned, ...extra } }).catch(() => {});
  await publish();

  const paused = [];
  const reports = await Promise.all(panel.map(async (w, i) => {
    const already = reportsByName.get(w.name);
    if (already) return already;   // reported before the pause — kept as is
    const resume = pausedByName.get(w.name);
    const budget = resume ? continuationBudget(resume.budget) : WORKER_BUDGET_USD;
    const out = await askClaude(vaultPath, {
      // a resumed session already holds its brief; it is told only to finish
      prompt: resume ? 'Continue exactly where you stopped and finish your findings. Output ONLY the JSON object.' : buildWorkerPrompt(question, w, context),
      model: WORKER_MODEL, budget,
      minutes: 12, label: `the ${w.name} researcher`,
      resume: resume?.sessionId || null,
    });
    if (out.budgetStop) {
      workers[i] = { ...workers[i], status: 'paused', found: 0 };
      await publish();
      paused.push({ name: w.name, brief: w.brief, sessionId: out.sessionId, spent: (resume?.spent || 0) + out.spent, budget: out.budget });
      return null;
    }
    if (out.error) {
      workers[i] = { ...workers[i], status: 'error', found: 0 };
      await publish();
      return { name: w.name, error: out.error };
    }
    const json = firstBalancedObjectMatch(out.text);
    const findings = json ? parseFindings(parseModelJson(json[0])) : [];
    workers[i] = { ...workers[i], status: 'done', found: findings.length };
    await publish();
    // A worker that ran and found nothing is NOT an error — an angle that
    // turns up empty is a finding, and the merge is told to report it.
    return { name: w.name, findings };
  }));
  const settledReports = reports.filter(Boolean);

  // A PAUSE IS NOT A FAILURE. The workers that stopped keep their sessions;
  // the ones that reported keep their findings; he is asked before another
  // dollar is spent. His rule, 21 Sep.
  if (paused.length) {
    await publish({ paused: paused.map((p) => p.name) });
    return { paused, reports: settledReports, panel, planned };
  }

  // Every angle failed: there is nothing to merge and nothing honest to file.
  if (settledReports.every((r) => r.error)) {
    throw new Error(`all ${settledReports.length} researchers failed — ${settledReports[0].error}`);
  }
  await publish({ merging: true });

  const mergeResume = (prior?.paused || []).find((p) => p.name === 'merge') || null;
  const out = await askClaude(vaultPath, {
    prompt: mergeResume ? 'Continue exactly where you stopped and finish the brief. Output ONLY the JSON object.' : buildSynthesisPrompt(question, settledReports, context),
    // NO WEB. The sources are chosen; a merge that searches on its own is a
    // fifth researcher nobody budgeted for, citing sources no angle vouched for.
    tools: 'Read',
    model: model || modelFor('researcher'),
    budget: mergeResume ? continuationBudget(mergeResume.budget) : SYNTH_BUDGET_USD,
    minutes: 10, label: 'the research merge',
    resume: mergeResume?.sessionId || null,
  });
  if (out.budgetStop) {
    await publish({ paused: ['merge'] });
    return { paused: [{ name: 'merge', sessionId: out.sessionId, spent: (mergeResume?.spent || 0) + out.spent, budget: out.budget }], reports: settledReports, panel, planned };
  }
  if (out.error) throw new Error(`the merge failed — ${out.error}`);
  const json = firstBalancedObjectMatch(out.text);
  if (!json) throw new Error(out.text.slice(0, 200) || 'no JSON in the merge response');
  try {
    return normalizeResearch(parseModelJson(json[0]));
  } catch (gateErr) {
    // ONE REPAIR PASS ON A BAD CITATION. The gate is right to refuse a brief
    // whose [19] points at nothing — but on 21 Sep that refusal threw away a
    // whole panel's work (four researchers, a merge, a continuation he had
    // said yes to) over one dangling number, and the Coach step behind it was
    // skipped. The merge session is resumed once and told exactly what
    // failed; a second failure is the real thing and is reported as such.
    if (!/cite|citation|Sources|URL/i.test(gateErr.message)) throw gateErr;
    await publish({ merging: true, repairing: true });
    const again = await askClaude(vaultPath, {
      prompt: `Your brief was refused by the citation check: ${gateErr.message}. Fix ONLY the citations — every [n] used in the body must have a matching numbered entry in the "## Sources" list with a URL, and every Sources entry must carry a URL; renumber if needed and drop any claim you cannot source. Keep the content otherwise unchanged. Output ONLY the JSON object {"title":…,"body":…}.`,
      tools: 'Read',
      model: model || modelFor('researcher'),
      budget: continuationBudget(SYNTH_BUDGET_USD), minutes: 8, label: 'the research merge (citation repair)',
      resume: out.sessionId,
    });
    if (again.budgetStop) {
      await publish({ paused: ['merge'] });
      return { paused: [{ name: 'merge', sessionId: again.sessionId, spent: again.spent, budget: again.budget }], reports: settledReports, panel, planned };
    }
    if (again.error) throw new Error(`the merge failed its citation check (${gateErr.message}) and the repair failed too — ${again.error}`);
    const fixed = firstBalancedObjectMatch(again.text);
    if (!fixed) throw new Error(`the merge failed its citation check (${gateErr.message}) and the repair returned no JSON`);
    return normalizeResearch(parseModelJson(fixed[0]));
  }
}

// WHAT HE SEES WHEN A RESEARCH STEP PAUSES. A decision he can make in one
// line: how much was spent, what stopped, what continuing would allow. The
// record keeps everything the run had (findings, sessions) so a yes costs
// only the rest, never a restart.
export function budgetPauseDecision({ question, paused, reports }) {
  const spent = paused.reduce((s, p) => s + (Number(p.spent) || 0), 0);
  const next = paused.reduce((s, p) => s + continuationBudget(p.budget), 0);
  const names = paused.map((p) => (p.name === 'merge' ? 'the merge' : `the ${p.name} researcher`));
  const back = (reports || []).filter((r) => !r.error).length;
  const title = `Research paused at its budget — continue?`;
  const body = [
    `${names.join(', ')} ${names.length === 1 ? 'reached its' : 'reached their'} spending limit mid-work (about US$${spent.toFixed(2)} spent on ${names.length === 1 ? 'it' : 'them'} so far).`,
    back ? `${back} of the panel ${back === 1 ? 'has' : 'have'} already reported and ${back === 1 ? 'is' : 'are'} kept.` : '',
    `Approve = let ${names.length === 1 ? 'it' : 'them'} continue from where ${names.length === 1 ? 'it' : 'they'} stopped, with up to US$${next.toFixed(2)} more. Discard = stop here; nothing is filed.`,
    '',
    `The question: ${String(question || '').slice(0, 300)}`,
  ].filter((l) => l !== '').join('\n');
  return {
    route: 'continue',
    confidence: 'high',
    title,
    reason: `Approve = continue with up to US$${next.toFixed(2)} more. Discard = stop here.`,
    payload: { title, body, spentUsd: spent, nextBudgetUsd: next },
  };
}

// The run, shared by first attempts, retries and continuations. A panel of
// named researchers goes out in parallel and one merge writes the brief — see
// researchPanel.js for why four different briefs beat four copies of the
// same agent.
//
// FAILURE IS STILL HONEST. A single angle coming back empty is a finding the
// merge reports; every angle failing is an error on the record, with the first
// reason attached, so a retry has something to act on rather than a shrug.
// A BUDGET STOP IS NEITHER: the record parks as a pending decision and waits.
async function runResearchJob(vaultPath, recordId, q, model, context = '', prior = null) {
  try {
    const out = await runPanel(vaultPath, recordId, q, model, context, prior);
    if (out.paused) {
      await updateRecord(recordId, {
        status: 'pending',
        budgetStop: { lane: 'research', question: q, model: model || null, context: context || '', panel: out.panel, planned: out.planned, reports: out.reports, paused: out.paused },
        decision: budgetPauseDecision({ question: q, paused: out.paused, reports: out.reports }),
      });
      await notifyParentPlan(vaultPath, recordId);
      return;
    }
    const { title, body } = out;
    // ALWAYS pending — web content never files itself
    await updateRecord(recordId, {
      status: 'pending',
      budgetStop: null,
      decision: {
        route: 'note',
        confidence: 'high',
        title,
        // WHAT APPROVE DOES, in his words — his report, 21 Sep: "I don't
        // actually know what will change or occur after I have clicked
        // approved on something in my inbox."
        reason: 'Approve = keep this brief in your vault as a note. Discard = drop it. Either way Nova has read it and can discuss it now.',
        payload: { title, body },
      },
    });
    await notifyParentPlan(vaultPath, recordId);
  } catch (e) {
    await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
    await notifyParentPlan(vaultPath, recordId);
  }
}

// A step of a plan tells the plan when it has settled, so a plan paused on
// a budget decision picks up the moment he answers it.
async function notifyParentPlan(vaultPath, recordId) {
  try {
    const { getRecord } = await import('./inboxStore.js');
    const r = await getRecord(recordId);
    if (!r?.parentPlanId) return;
    const { resumePlan } = await import('./planner.js');
    resumePlan(vaultPath, r.parentPlanId).catch(() => {});
  } catch { /* the plan polls as well; this only makes it prompt */ }
}

// HIS YES ON A PAUSED RESEARCH RECORD. Resumes exactly the sessions that
// stopped, with more room, and keeps every finding already in hand.
export async function continueResearch(vaultPath, record) {
  const bs = record?.budgetStop;
  if (!bs || bs.lane !== 'research') throw new Error('this research record is not paused at a budget');
  if (!laneEnabled('researcher')) throw laneOffError('researcher');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null, decision: null });
  runResearchJob(vaultPath, record.id, bs.question, bs.model || undefined, bs.context || '', bs);
  return updated;
}

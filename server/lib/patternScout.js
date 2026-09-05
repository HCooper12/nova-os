import { randomUUID } from 'node:crypto';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { localDateISO } from './localDate.js';
import { weeklyWindowOpen } from './cadence.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { NOVA_LENS } from './lens.js';
import { createRecord, updateRecord, listRecords } from './inboxStore.js';
import { declinedContext } from './respectTheNo.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { isGateModel } from './modelChoice.js';
import { settleWatchdog } from './settle.js';

// The pattern scout — skill proposals (agents plan, build 3): once a week a
// model reads what Hayden actually DID by hand — his captures, their routes,
// what he approved and discarded — against what Nova can already do, and
// proposes at most a couple of things worth automating. Everything it
// produces rides the rails as pending records: a standing rule (existing
// 'preference' filer) or a backlog entry on the skill registry page (new
// 'skill-backlog' filer). An empty week is the expected result — the bar
// for proposing is deliberately high; noticing nothing is not failure.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';
const SCOUT_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

const SCOUT_WEEKDAY = 6; // Saturday
const SCOUT_HOUR = 16;

/* ------------------------------- context --------------------------------- */

// Deterministic usage picture: what happened on the rails in the last 30
// days, aggregated (counts by route and kind, approve/discard fates) plus
// the most recent capture titles verbatim — enough for a model to see a
// repeated manual act without shipping his whole history into one prompt.
export async function buildScoutContext(vaultPath) {
  const parts = [];
  try {
    const records = await listRecords();
    const cutoff = Date.now() - 30 * 86400e3;
    const recent = records.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
    const captures = recent.filter((r) => !r.kind); // human captures, not agent drafts
    const counts = {};
    for (const r of captures) {
      const route = r.decision?.route || 'unclassified';
      counts[route] = counts[route] || { n: 0, filed: 0, discarded: 0 };
      counts[route].n++;
      if (r.status === 'filed') counts[route].filed++;
      if (r.status === 'discarded' || r.status === 'expired') counts[route].discarded++;
    }
    parts.push(`HIS CAPTURES, LAST 30 DAYS (${captures.length} total): ` +
      Object.entries(counts).map(([route, c]) => `${route} ×${c.n} (${c.filed} filed, ${c.discarded} discarded)`).join('; ') + '.');
    const titles = captures.slice(0, 40).map((r) => `- [${r.decision?.route || '?'}] ${(r.decision?.title || r.text || '').slice(0, 80)}`);
    if (titles.length) parts.push(`MOST RECENT CAPTURES (title per line — look for the same act repeated):\n${titles.join('\n')}`);
    const agentDrafts = recent.filter((r) => r.kind && r.status === 'discarded');
    if (agentDrafts.length) {
      // his stated WHY rides the signal — a standing-rule proposal aims at the
      // reason he gave, not the one inferred from a count
      const byKind = {};
      for (const r of agentDrafts) {
        const k = byKind[r.kind] || (byKind[r.kind] = { n: 0, reasons: {} });
        k.n += 1;
        if (r.declineReason) k.reasons[r.declineReason] = (k.reasons[r.declineReason] || 0) + 1;
      }
      const line = (kind, k) => {
        const reasons = Object.entries(k.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([why, n]) => `"${why}" ×${n}`);
        return `${kind} ×${k.n}${reasons.length ? ` — ${reasons.join(', ')}` : ''}`;
      };
      parts.push(`AGENT DRAFTS HE DISCARDED (a pattern of discards means an agent is drafting the wrong thing; where he said why, aim at that): ${Object.entries(byKind).map(([kind, k]) => line(kind, k)).join('; ')}.`);
    }
    // his no's to THIS lane — a declined proposal used to come back verbatim
    // the next week because nothing carried it into the context
    const declined = declinedContext(records, { kind: 'pattern', days: 90 });
    if (declined.length) {
      parts.push(`SCOUT PROPOSALS HE SAID NO TO (last 90 days) — do not re-propose these unless the counts behind them have materially grown since, and if you do, name that history:\n${declined.join('\n')}`);
    }
  } catch { /* usage picture optional */ }
  try {
    const { skillsContext } = await import('./skills.js');
    const skills = await skillsContext(vaultPath);
    if (skills) parts.push(skills);
  } catch { /* optional */ }
  try {
    const { parseBacklog } = await import('./skills.js');
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(path.join(vaultPath, 'Wiki/Library/Nova Skills.md'), 'utf8');
    const backlog = parseBacklog(raw);
    if (backlog.length) parts.push(`ALREADY ON THE BACKLOG (never re-propose these): ${backlog.map((b) => b.text).join('; ')}.`);
  } catch { /* optional */ }
  try {
    const { standingContext } = await import('./standing.js');
    const standing = await standingContext(vaultPath);
    if (standing) parts.push(standing);
  } catch { /* optional */ }
  return parts.join('\n\n');
}

/* ------------------------------- compose --------------------------------- */

export function buildScoutPrompt(context) {
  return `${NOVA_LENS}

You are Nova's pattern scout. Once a week you look at what Hayden did BY HAND on the rails and ask one question: is there a repeated manual act here that Nova should learn to do for him? You may read his vault for colour.

What counts as a real pattern:
- The SAME kind of capture appearing again and again (e.g. logging the same supplement most mornings; stashing links of one type; a recurring expense entered manually).
- An agent draft he keeps DISCARDING (the automation exists but drafts the wrong thing — propose the standing rule that would fix its aim).
- A correction he has made more than once in similar words.

What to propose (0 to 2 items, and ZERO is the normal, expected answer most weeks):
- {"type": "standing-rule", "text": "<one timeless sentence every agent will obey>", "why": "<the observed pattern, with rough counts>"} — when a rule would redirect existing behaviour.
- {"type": "skill-backlog", "text": "<the skill Nova should learn, one line, imperative>", "why": "<the observed pattern>"} — when it needs NEW machinery built.

Discipline:
- Only propose what the data below actually shows repeated — cite counts in the why. One occurrence is an anecdote, not a pattern.
- Never re-propose anything already on the backlog or in his standing instructions.
- Never invent usage that isn't in the picture below.

The picture:
${context || '(usage picture unavailable — output zero proposals)'}

Output ONLY a JSON object: {"proposals": [ ... ]} (empty array when nothing clears the bar). No code fences, no commentary.`;
}

export function normalizeScoutProposals(parsed) {
  const list = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
  return list
    .map((p) => ({
      type: p?.type === 'standing-rule' ? 'standing-rule' : p?.type === 'skill-backlog' ? 'skill-backlog' : null,
      text: String(p?.text || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      why: String(p?.why || '').trim().slice(0, 300),
    }))
    .filter((p) => p.type && p.text)
    .slice(0, 2);
}

/* ------------------------------ orchestration ---------------------------- */

async function thisWeekScoutRan() {
  const records = await listRecords();
  const cutoff = Date.now() - 6 * 86400e3;
  return records.some((r) => r.kind === 'pattern' && new Date(r.createdAt).getTime() >= cutoff);
}

async function fileProposals(proposals, marker) {
  // the run marker record keeps the weekly guard honest even when the scout
  // proposes nothing — silence must also be receipted, or it re-runs all day
  for (const p of proposals) {
    await createRecord({
      id: randomUUID().slice(0, 8),
      kind: 'pattern',
      text: p.why || p.text,
      source: 'scout',
      mode: 'review-all',
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: p.type === 'standing-rule'
        ? { route: 'preference', confidence: 'high', title: `Standing: ${p.text.slice(0, 70)}`, reason: p.why, payload: { rule: p.text, source: 'pattern-scout' } }
        : { route: 'skill-backlog', confidence: 'high', title: `Backlog: ${p.text.slice(0, 70)}`, reason: p.why, payload: { text: p.text } },
    });
  }
  await updateRecord(marker.id, {
    status: 'filed',
    destination: proposals.length ? `${proposals.length} proposal${proposals.length === 1 ? '' : 's'} drafted` : 'nothing cleared the bar this week',
    filedAt: new Date().toISOString(),
    auto: true,
  });
}

// `model`: the per-run override the model-choice gate already resolved
// (server/lib/modelChoice.js) — 'opus' or 'sonnet' only. Omitted, this run
// just uses the lane's standing default.
export async function runPatternScout(vaultPath, { force = false, model } = {}) {
  if (model !== undefined && !isGateModel(model)) throw new Error("model must be 'opus' or 'sonnet'");
  // Checked BEFORE the marker record is created: a lane that is off must
  // leave nothing behind, least of all a record stuck in 'classifying'.
  if (laneSkipped('pattern-scout', 'the weekly pattern scout')) return { skipped: true, laneOff: true };
  if (!force && await thisWeekScoutRan()) return { skipped: true };
  const marker = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'pattern',
    text: `Pattern scout — week of ${localDateISO()}`,
    source: 'scout',
    mode: 'auto',
    status: 'classifying',
    createdAt: new Date().toISOString(),
  });

  const context = await buildScoutContext(vaultPath);
  const child = spawn(CLAUDE_BIN, [
    '-p', buildScoutPrompt(context),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', SCOUT_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    // named explicitly — an unpinned call silently inherits the account's
    // ambient default model, which cost him a Fable-5 usage-limit hit on a
    // totally unrelated lane (Coach) once that became the default. The pin
    // now comes from the model board (lib/modelPrefs.js), settable in
    // Settings, defaulting to the 'sonnet' this lane has always run on —
    // UNLESS the model-choice gate already asked and got a per-run answer.
    '--model', model || modelFor('pattern-scout'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: "the pattern scout", minutes: 15 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = firstBalancedObjectMatch(text);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in scout response');
      await fileProposals(normalizeScoutProposals(parseModelJson(jsonMatch[0])), marker);
    } catch (e) {
      await updateRecord(marker.id, { status: 'error', error: e.message }).catch(() => {});
    }
  });
  child.on('error', async (err) => {
    await updateRecord(marker.id, { status: 'error', error: err.message }).catch(() => {});
  });
  return { record: marker };
}

// vaultPath: unused now that the gate raises a card instead of running
// directly — kept in the signature so every scheduler in index.js still
// takes the same shape.
export function startPatternScoutScheduler(_vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('pattern-scout');
    try {
      const now = new Date();
      // Saturday onward (the Distiller's shape) — a slept Saturday no longer skips the week
      if (!weeklyWindowOpen(now, { day: SCOUT_WEEKDAY, hour: SCOUT_HOUR })) return;
      // The model-choice gate raises an Inbox card instead of running
      // directly — this is exactly the connect-the-dots-across-the-vault
      // work he asked to be offered Opus for, and nobody is at the keyboard
      // when a weekly cron fires to answer a spoken question.
      const { raiseWeeklyModelChoice } = await import('./modelChoice.js');
      await raiseWeeklyModelChoice('pattern-scout');
    } catch (err) {
      console.error('pattern scout failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}

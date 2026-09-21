// THE CONVERSATION KNOWS ABOUT HIS PLANS.
//
// 21 Sep 2026, 11:32–11:34. Nova proposed a plan whose card said "None of the
// agents can read Hayden's vault or his actual training program". He replied,
// two minutes later, "The coach agent should be able to analyse and pull my
// current workout information? So don't say no agents are capable of doing
// that." That went to Ask Nova — whose session had never seen the plan,
// because the plan card is drawn by the client from the record, not spoken by
// the model — and Nova answered "You're right, sir … What do you want Coach
// to look at?" The plan kept running as written. He had not changed the
// subject; the platform had lost it.
//
// Two things here, both deterministic:
//   recentPlanContext — the plan he is most likely talking about right now
//     (proposed, running or just finished), so the /ask route can ACT on a
//     correction rather than chat about it, and so the model is handed the
//     plan when it does answer.
//   plansContext — the last two days of plans as a context block, with the
//     finished ones' reports in full, for Ask Nova and the Coach. A finished
//     plan used to file into the Inbox and vanish from every conversation.

import { listRecords } from './inboxStore.js';
import { CAPABILITIES } from './capabilities.js';

export const PLAN_FOLLOW_UP_WINDOW_MS = 20 * 60_000;
const CONTEXT_WINDOW_MS = 48 * 3600_000;

// Which phase a plan record is in, in words the route can branch on.
export function planPhase(r) {
  if (!r || r.kind !== 'plan') return null;
  if (r.status === 'error') return 'failed';
  if (r.status === 'discarded') return 'discarded';
  const ran = r.finishedAt || (r.plan?.steps || []).some((s) => s.status && s.status !== 'waiting');
  if (r.status === 'classifying') return r.pausedOn ? 'paused' : (r.plan ? 'running' : 'planning');
  if (r.status === 'pending') return ran ? 'finished' : (r.planOk === false ? 'refused' : 'proposed');
  if (r.status === 'filed' || r.status === 'approved') return 'finished';
  return 'unknown';
}

// A yes or a no is an answer to the card, not a correction of it. Kept
// deliberately narrow: anything with substance is a correction.
export function isAffirmativeOrNegative(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '');
  if (t.length > 40) return false;
  return /^(?:yes|yep|yeah|yup|ok(?:ay)?|sure|go|go ahead|do it|run it|approve|approved|start|proceed|please do|sounds good|fine|confirm|no|nope|nah|leave it|not now|cancel|stop|don'?t|skip|discard)(?:[,\s]+(?:please|nova|sir|thanks?|that'?s fine|do it|run it|go ahead|the plan))*$/.test(t)
    || /^(?:yes|ok(?:ay)?|sure|go ahead)[,\s]+(?:run|do|start|approve)\s+(?:it|the plan|that)$/.test(t);
}

// The plan he is most likely referring to right now: the newest plan record
// touched inside the window, whatever phase it is in. `now` and `records`
// are injectable for the tests.
export async function recentPlanContext({ now = Date.now(), records = null, windowMs = PLAN_FOLLOW_UP_WINDOW_MS } = {}) {
  const all = records || await listRecords().catch(() => []);
  const plans = all.filter((r) => r.kind === 'plan');
  const touched = (r) => Math.max(...[r.createdAt, r.approvedAt, r.finishedAt, r.updatedAt].filter(Boolean).map((t) => new Date(t).getTime() || 0), 0);
  const live = plans
    .map((r) => ({ r, at: touched(r), phase: planPhase(r) }))
    .filter((x) => x.at && now - x.at <= windowMs && ['proposed', 'running', 'paused', 'finished', 'planning'].includes(x.phase))
    .sort((a, b) => b.at - a.at)[0];
  return live ? { record: live.r, phase: live.phase, ageMs: now - live.at } : null;
}

function stepLine(s) {
  const agent = CAPABILITIES[s.capability]?.agent || s.capability;
  const status = s.status === 'done' ? 'done' : s.status === 'failed' ? `FAILED (${s.error || 'no reason'})` : s.status === 'skipped' ? `did not run (${s.error || ''})` : s.status === 'paused' ? 'PAUSED at its budget — waiting on his yes' : s.status === 'running' ? 'running' : 'waiting';
  return `  - ${agent}: ${s.what} — ${status}`;
}

// One plan, as the model should see it. The finished report rides in full
// (capped) for the newest plan, because "what did you find, and what should
// change" has to be answerable from here.
export function describePlanForModel(r, { reportChars = 6000 } = {}) {
  const phase = planPhase(r);
  const when = String(r.finishedAt || r.approvedAt || r.createdAt || '').slice(0, 16).replace('T', ' ');
  const steps = (r.plan?.steps || []).map(stepLine).join('\n');
  const head = `PLAN [${phase}${when ? `, ${when} UTC` : ''}] — his request: "${String(r.goal || r.text || '').replace(/^Plan:\s*/, '').slice(0, 400)}"`;
  const lines = [head];
  if (steps) lines.push(steps);
  if (r.cannot) lines.push(`  Not covered, per the plan: ${String(r.cannot).slice(0, 400)}`);
  if (r.pausedOn) lines.push(`  Paused on step ${r.pausedOn}: the research card in his Inbox needs his yes before more is spent.`);
  if (phase === 'finished') {
    const body = String(r.decision?.payload?.body || '').trim();
    if (body) lines.push(`  THE REPORT (Nova's own write-up of what the agents found — quote it, summarise it, act on it):\n${body.slice(0, reportChars)}${body.length > reportChars ? '\n  …(report continues in his Inbox)' : ''}`);
    else lines.push('  The report did not get written; the step outputs are on the record.');
  }
  if (r.supersededBy) lines.push(`  Superseded by plan ${r.supersededBy} after his correction.`);
  return lines.join('\n');
}

// The block Ask Nova and the Coach are handed: plans from the last two days,
// newest first, the newest finished report in full and older ones short.
export async function plansContext({ now = Date.now(), records = null } = {}) {
  const all = records || await listRecords().catch(() => []);
  const plans = all
    .filter((r) => r.kind === 'plan' && r.status !== 'discarded' && now - (new Date(r.finishedAt || r.createdAt).getTime() || 0) <= CONTEXT_WINDOW_MS)
    .sort((a, b) => String(b.finishedAt || b.createdAt).localeCompare(String(a.finishedAt || a.createdAt)))
    .slice(0, 4);
  if (!plans.length) return null;
  let fullGiven = false;
  const blocks = plans.map((r) => {
    const full = !fullGiven && planPhase(r) === 'finished';
    if (full) fullGiven = true;
    return describePlanForModel(r, { reportChars: full ? 6000 : 700 });
  });
  return `HIS PLANS — WORK HE DELEGATED TO NOVA'S AGENTS (newest first). A finished plan's report is HERE, in full: when he asks what it found, what he should change, or what to do next, answer FROM THE REPORT — summarise it in his terms, name the concrete changes, and offer to make them (the Coach applies program changes as proposals; more research is a PROPOSE plan). Never send him to the Inbox to find out what a plan concluded.\n${blocks.join('\n\n')}`;
}

// The one-line version for a resumed Coach turn's live line.
export async function latestReportLine({ now = Date.now(), records = null } = {}) {
  const all = records || await listRecords().catch(() => []);
  const r = all
    .filter((x) => x.kind === 'plan' && planPhase(x) === 'finished' && x.finishedAt && now - new Date(x.finishedAt).getTime() <= 24 * 3600_000)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0];
  if (!r) return null;
  const body = String(r.decision?.payload?.body || '').trim();
  return `a plan he set finished ${Math.max(1, Math.round((now - new Date(r.finishedAt).getTime()) / 60000))} min ago — "${String(r.goal || '').slice(0, 160)}". Its report: ${body.slice(0, 3500)}${body.length > 3500 ? ' …' : ''}`;
}

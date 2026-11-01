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
  if (r.status === 'classifying') return r.plan ? 'running' : 'planning';
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
// are injectable for the tests. `phases`: which phases count — a question
// about where the plan has got to also wants a plan that failed or was
// refused, because "it failed, and why" is the answer to it.
export const LIVE_PHASES = ['proposed', 'running', 'finished', 'planning'];
export const STATUS_PHASES = [...LIVE_PHASES, 'failed', 'refused'];
export async function recentPlanContext({ now = Date.now(), records = null, windowMs = PLAN_FOLLOW_UP_WINDOW_MS, phases = LIVE_PHASES } = {}) {
  const all = records || await listRecords().catch(() => []);
  const plans = all.filter((r) => r.kind === 'plan');
  const touched = (r) => Math.max(...[r.createdAt, r.approvedAt, r.finishedAt, r.updatedAt, r.retriedAt].filter(Boolean).map((t) => new Date(t).getTime() || 0), 0);
  const live = plans
    .map((r) => ({ r, at: touched(r), phase: planPhase(r) }))
    .filter((x) => x.at && now - x.at <= windowMs && phases.includes(x.phase))
    .sort((a, b) => b.at - a.at)[0];
  return live ? { record: live.r, phase: live.phase, ageMs: now - live.at } : null;
}

// A QUESTION ABOUT WHERE THE PLAN HAS GOT TO IS NOT A CORRECTION OF IT.
//
// 1 Nov 2026, 00:00–00:05 UTC. He corrected a proposed plan; the revised plan
// was drawn, but his phone had been asleep past the client's four-minute
// watch, so it never came up. He said "I still can't see the plan yet." The
// catcher below took that as his next correction, re-planned the plan WITH
// those words as an instruction, and answered with the identical line it had
// given five minutes earlier. A complaint about status is answered with the
// status, by code, from the record. Deterministic and deliberately narrow:
// short utterances only, because a long one carries substance and is the
// correction the catcher exists for.
const STATUS_PATTERNS = [
  // "I can't see it", "I still can't see the plan yet", "I don't see anything"
  /\b(?:can'?t|cannot|can not|couldn'?t|don'?t|do not|didn'?t|haven'?t|have not|still not|not)\s+(?:yet\s+)?(?:see|seen|find|found|get|got)\s+(?:it|that|this|them|anything|the\s+(?:revised\s+|new\s+|updated\s+|amended\s+)?(?:plan|card|report|mock-?up|result|results|answer))\b/,
  /\b(?:can'?t|cannot|don'?t|do not)\s+see\s+(?:it|anything)?\s*(?:yet|still|anywhere|on (?:the )?screen|here)?\s*$/,
  /\b(?:it'?s|it is|the plan is|plan'?s|nothing'?s|nothing is)\s+(?:still\s+)?not\s+(?:showing|there|here|up|on (?:the |my )?screen|appearing|coming up|loading)\b/,
  /\bnothing\s+(?:has\s+)?(?:come|came|shown|showed|appeared)\s+up\b/,
  // "where is it", "where's the plan"
  /\bwhere(?:'?s| is| are)\s+(?:it|that|they|the\s+(?:revised\s+|new\s+|updated\s+|amended\s+)?(?:plan|card|report|mock-?up|results?))\s*(?:now|then|at)?\s*$/,
  // "is it done", "has the plan finished", "is it still running"
  /\b(?:is|has|did|are)\s+(?:it|that|the\s+(?:plan|report|mock-?up|coach|builder))\s+(?:still\s+)?(?:done|ready|finished|finish|back|running|working|there|up|going|failed|fail|stuck|started|start|landed)\b/,
  /\bhow(?:'?s| is)\s+(?:it|that|the\s+(?:plan|report|mock-?up))\s+(?:going|coming along|looking)\b/,
  /\bhow\s+much\s+longer\b|\bhow\s+long\s+(?:will|until|till)\s+(?:it|that|the\s+(?:plan|report|mock-?up))\b/,
  /\b(?:what'?s|what is)\s+(?:the\s+)?(?:status|progress|hold-?up|holdup)\b/,
  /\b(?:status|progress)\s+(?:of|on)\s+(?:the\s+)?(?:plan|report|it)\b/,
  /^(?:any\s+)?(?:updates?|news|progress)(?:\s+(?:on|with)\s+(?:it|that|the\s+plan))?$/,
  /\bwhat\s+happened\s+(?:to|with)\s+(?:it|that|the\s+(?:plan|report|mock-?up))\b/,
  /\b(?:are you|is it|is nova|is (?:the )?coach)\s+still\s+(?:working|planning|going|on it|thinking)\b/,
];
export function isPlanStatusQuestion(text) {
  const t = String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 14) return false;
  return STATUS_PATTERNS.some((re) => re.test(t));
}

// "Retry" / "try it again" / "run the failed step again", said about a plan
// that finished with a step that failed.
export function isPlanRetryRequest(text) {
  const t = String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 12) return false;
  return /^(?:(?:ok(?:ay)?|yes|yeah|please|nova|sir)\s+)*(?:retry|try (?:it |that |the (?:failed )?(?:step|builder|mock-?up|build) )?again|run (?:it|that|the (?:failed )?(?:step|steps|builder|mock-?up|build)) again|redo (?:it|that|the (?:failed )?(?:step|builder|mock-?up))|go again|give it another go)(?:\s+(?:please|sir|nova|now))*$/.test(t);
}

const agentOf = (s) => CAPABILITIES[s?.capability]?.agent || s?.capability || 'a step';
const minsAgo = (iso, now) => {
  const m = Math.max(0, Math.round((now - (new Date(iso).getTime() || now)) / 60000));
  return m < 1 ? 'under a minute ago' : m === 1 ? 'a minute ago' : `${m} minutes ago`;
};

// THE PLAN'S REAL STATUS, AS ONE SPOKEN ANSWER, BY CODE. Pure. Every branch
// reads the record; nothing is a promise. `cause` turns a stored error into his
// words (lib/plainCause.js, injected so this file stays pure).
export function planStatusLine(r, { now = Date.now(), cause = (e) => String(e || '') } = {}) {
  const phase = planPhase(r);
  const steps = r?.plan?.steps || [];
  const failed = steps.filter((s) => s.status === 'failed' || s.status === 'skipped');
  const failedLine = failed.length
    ? failed.map((s) => `${agentOf(s)} ${s.status === 'skipped' ? 'did not run' : 'failed'}: ${cause(s.error || 'no reason was recorded')}`).join('. ')
    : '';
  if (phase === 'planning') {
    return `The plan is still being drawn, sir. I started it ${minsAgo(r.createdAt, now)}, and it comes up here the moment it is ready.`;
  }
  if (phase === 'proposed') {
    const who = [...new Set(steps.map(agentOf))].join(', ');
    return `It is ready, sir, and it is back on screen: ${steps.length} step${steps.length === 1 ? '' : 's'}${who ? `, ${who}` : ''}. Nothing runs until you say yes.`;
  }
  if (phase === 'refused') {
    const why = (r.blockers || []).slice(0, 2).join('; ') || 'it did not pass its checks';
    return `The planner could not make a plan that runs: ${why}.`;
  }
  if (phase === 'failed') {
    return `The plan stopped, sir: ${cause(r.error || 'no reason was recorded')}.`;
  }
  if (phase === 'running') {
    const done = steps.filter((s) => s.status === 'done').length;
    const on = steps.filter((s) => s.status === 'running');
    const onLine = on.length ? ` ${on.map(agentOf).join(' and ')} ${on.length === 1 ? 'is' : 'are'} working now.` : '';
    const started = r.startedAt || r.approvedAt;
    return `It is running, sir: ${done} of ${steps.length} step${steps.length === 1 ? '' : 's'} done${started ? `, started ${minsAgo(started, now)}` : ''}.${onLine}${failedLine ? ` ${failedLine}.` : ''}`;
  }
  if (phase === 'finished') {
    const head = `It finished ${minsAgo(r.finishedAt, now)}, sir, and the report is in this conversation.`;
    return failedLine ? `${head} ${failedLine}. Say retry and I will run ${failed.length === 1 ? 'that step' : 'those steps'} again.` : head;
  }
  return 'I cannot tell where that plan has got to from its record.';
}

// The line for HIS CORRECTION of a proposed plan. Never the same twice in a
// chain: `depth` is how many corrections the plan already carries.
export function amendReplyLine(depth = 0) {
  if (!depth) return 'Understood — re-planning with that. The revised plan is on its way; say yes when it is on screen.';
  return `Got it, that is change ${depth + 1} to this plan. I am re-drawing it with all of them, and it comes up here when it is ready.`;
}

function stepLine(s) {
  const agent = CAPABILITIES[s.capability]?.agent || s.capability;
  const status = s.status === 'done' ? 'done' : s.status === 'failed' ? `FAILED (${s.error || 'no reason'})` : s.status === 'skipped' ? `did not run (${s.error || ''})` : s.status === 'running' ? 'running' : 'waiting';
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

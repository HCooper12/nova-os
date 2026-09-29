// THE HANDS-FREE LINE AND A SLOW ASK (Siri, the Action Button).
//
// His words, 30 Sep 2026: "Let nova always ask the researcher. Ideally it
// would be helpful for a response saying that the researcher is being
// consulted so check back later, so I avoid Siri's response saying it took
// too long but I still know it's working."
//
// A Shortcut holds one request open and speaks one reply; past ~110 s the
// lane gave up and said "Nova took too long", even when the answer was only
// waiting on the Researcher, which takes minutes by design. Now:
//   - the moment a hands-free turn's consult includes a SLOW agent (the
//     registry's `slow` flag: the Researcher), the lane answers at once with
//     a code-written interim line naming who was asked and where the answer
//     will land;
//   - at the limit, a turn still waiting on ANY consult gets the same line,
//     never "took too long": that answer is still coming;
//   - the turn keeps running to completion in the background, and its
//     synthesis lands as Nova's line in the conversation record (by, from),
//     while the Researcher's brief lands on its own Inbox record as always.
// Code writes every word he hears about this; the model never claims it.

import { AGENTS } from './consult.js';

export const HANDS_FREE_LIMIT_MS = 110_000;

const labelOf = (id) => AGENTS[id]?.label || id;
function listWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Asks still under way on a job's roster; `slowOnly` keeps those whose agent
// is expected to outlast the line.
export function pendingAsks(roster, { slowOnly = false } = {}) {
  return (Array.isArray(roster) ? roster : []).filter((a) => a && a.state === 'asking' && (!slowOnly || AGENTS[a.agent]?.slow));
}

// The spoken interim, from the roster alone:
//   "I've asked the Researcher; it takes a few minutes. The answer will be in
//    your Nova thread and your Inbox."
export function interimLine(roster) {
  const asked = [];
  for (const a of Array.isArray(roster) ? roster : []) {
    if (a?.agent && !AGENTS[a.agent]?.code && !asked.includes(a.agent)) asked.push(a.agent);
  }
  const slow = asked.filter((id) => AGENTS[id]?.slow);
  const who = asked.length ? listWords(asked.map(labelOf)) : 'the other agents';
  const wait = slow.length
    ? (slow.length === asked.length
      ? (asked.length === 1 ? 'it takes a few minutes' : 'they take a few minutes')
      : `${listWords(slow.map(labelOf))} ${slow.length === 1 ? 'takes' : 'take'} a few minutes`)
    : (asked.length > 1 ? 'they are still working' : 'it is still working');
  // the Researcher's brief always lands in his Inbox; nothing else does
  const inbox = asked.includes('researcher') ? ' and your Inbox' : '';
  return `I've asked ${who}; ${wait}. The answer will be in your Nova thread${inbox}.`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait on a hands-free turn. Resolves one of:
//   { kind: 'ready', job }  { kind: 'error', job }  { kind: 'gone' }
//   { kind: 'interim', text, job }  (the turn keeps running)
//   { kind: 'timeout', job }        (no consult involved: the old honest line)
export async function awaitHandsFree(jobId, {
  getJob, limitMs = HANDS_FREE_LIMIT_MS, pollMs = 120, cancelled = () => false,
} = {}) {
  const deadline = Date.now() + limitMs;
  for (;;) {
    if (cancelled()) return { kind: 'gone' };
    const job = getJob(jobId);
    if (!job) return { kind: 'gone' };
    if (job.status === 'ready') return { kind: 'ready', job };
    if (job.status === 'error') return { kind: 'error', job };
    if (pendingAsks(job.consult, { slowOnly: true }).length) return { kind: 'interim', text: interimLine(job.consult), job };
    if (Date.now() >= deadline) {
      // a consult under way (asks out, or the answers back and the synthesis
      // being written) is an answer still coming, never "took too long"
      if (Array.isArray(job.consult) && job.consult.length) return { kind: 'interim', text: interimLine(job.consult), job };
      return { kind: 'timeout', job };
    }
    await sleep(pollMs);
  }
}

// After an interim: follow the turn to its end, with no timeout (his no-caps
// rule; the job map is the only thing that can end it), then hand the result
// on. A vanished job is a failure, said plainly.
export async function followThrough(jobId, { getJob, pollMs = 1000, onReady, onError }) {
  for (;;) {
    const job = getJob(jobId);
    if (!job) { await onError?.('the answer was lost before it finished', null); return; }
    if (job.status === 'ready') { await onReady?.(job); return; }
    if (job.status === 'error') { await onError?.(job.error || 'the answer failed', job); return; }
    await sleep(pollMs);
  }
}

// What the record says when a followed answer fails: who was being asked,
// and that it did not arrive.
export function lateFailureLine(roster, error) {
  const asked = [...new Set((Array.isArray(roster) ? roster : []).filter((a) => a?.agent && !AGENTS[a.agent]?.code).map((a) => a.agent))];
  return `${asked.length ? `The answer I was building with ${listWords(asked.map(labelOf))}` : 'The answer I was building'} did not arrive: ${error}.`;
}

// The words and the map for a consult in flight (src/motion/ConsultFlow.jsx).
// Pure, so the rules are tested on their own (server/test/consultFlowFacts.test.js).
//
// Read off the roster lib/consult.js keeps on the job: one entry per ask
// ({ agent, label, round, state: asking | done | failed }). An agent asked
// again in a second round is one node, standing as its latest ask stands.

import { FINDERS } from '../glassMarks.js';

// read by code, not asked (lib/consult.js AGENTS[id].code): the calendar,
// the CFO and the Stash are checked, never "asked"
const CODE_READ = new Set(['calendar', 'cfo', 'stash']);
export const MAX_NODES = 4;

const cap = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());
const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function consultNodes(roster) {
  if (!Array.isArray(roster) || !roster.length) return [];
  const by = new Map();
  for (const a of roster) {
    if (!a?.agent) continue;
    const prev = by.get(a.agent);
    if (prev && (prev.round || 1) > (a.round || 1)) continue;
    by.delete(a.agent); // re-asked: it moves to the end, the newest ask
    by.set(a.agent, a);
  }
  return [...by.values()].slice(-MAX_NODES).map((a) => {
    const f = FINDERS[a.agent];
    const label = a.label || f?.the || a.agent;
    return {
      agent: a.agent,
      name: f?.name || cap(String(label).replace(/^(the|your)\s+/i, '')),
      label,
      code: CODE_READ.has(a.agent),
      state: a.state === 'done' ? 'done' : a.state === 'failed' ? 'failed' : 'asking',
    };
  });
}

// One plain sentence, written by code: who is being asked, who answered,
// who could not, and what Coach does next.
export function consultCaption(nodes, who = 'Coach') {
  if (!nodes?.length) return '';
  const asking = nodes.filter((n) => n.state === 'asking');
  const done = nodes.filter((n) => n.state === 'done');
  const failed = nodes.filter((n) => n.state === 'failed');
  const doing = (list) => {
    const asked = list.filter((n) => !n.code).map((n) => n.label);
    const checked = list.filter((n) => n.code).map((n) => n.label);
    if (!asked.length) return `checking ${listWords(checked)}`;
    return `asking ${listWords(asked)}${checked.length ? ` and checking ${listWords(checked)}` : ''}`;
  };
  // an agent answers; a code-read source is checked
  const askedBack = done.filter((n) => !n.code).map((n) => n.label);
  const checkedBack = done.filter((n) => n.code).map((n) => n.label);
  const back = [
    askedBack.length ? `${cap(listWords(askedBack))} ${askedBack.length === 2 ? 'both answered' : 'answered'}.` : '',
    checkedBack.length ? `Checked ${listWords(checkedBack)}.` : '',
  ].filter(Boolean).join(' ');
  const lost = failed.length ? `${cap(listWords(failed.map((n) => n.label)))} could not answer.` : '';
  if (asking.length) {
    if (!done.length && !failed.length) return `${who} is ${doing(asking)}.`;
    return [back, lost, `Still ${doing(asking)}.`].filter(Boolean).join(' ');
  }
  return [back, lost, `${who} is writing to you${failed.length ? ' with what came back' : ''}.`].filter(Boolean).join(' ');
}

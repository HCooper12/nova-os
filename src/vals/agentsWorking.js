// WHICH AGENTS ARE WORKING RIGHT NOW: one answer for every surface that
// counts them (his standing rule, 7 Oct 2026: "only true actual live working
// agents at any time. Never false data"). The Home eyebrow, the Mac sidebar's
// group header, the Index's Ops row and the roster's pulsing dots all read
// this, so a count can never disagree with the lights beside it.
//
// An agent is working when this client has a job of its in flight, or when a
// record of one of its kinds is still classifying on the rails (server-side
// work, whoever started it, on any device). Nothing else counts: an agent
// that exists but is idle is not "live".

export const AGENT_KINDS = {
  Commander: ['dispatch', 'plan-today', 'review', 'followup'],
  Coach: ['coach', 'training-check', 'week-plan', 'weekly-debrief', 'meal-prep'],
  CFO: ['cfo', 'money'],
  Studio: ['studio', 'idea', 'idea-outline'],
  Researcher: ['research'],
  Watcher: ['video'],
  Guardian: ['guardian'],
};

export function localWork(st) {
  return {
    Commander: !!(st.calCmdBusy || st.dispatchBusy),
    Coach: !!(st.coachBusy || st.quickBusy || st.mealPrepBusy),
    CFO: !!(st.moneyBusy || st.moneyScanBusy),
    Studio: false,
    Researcher: (st.voiceChat || []).some((m) => m.research?.status === 'running'),
    // 'fetching' is the watch toolchain pulling a transcript for a
    // URL-only vault weave; the weave itself shows in its own overlay
    Watcher: st.ingestStatus === 'fetching',
    Guardian: !!st.guardianBusy,
  };
}

export function classifyingKinds(st) {
  return new Set((st.liveInbox?.items || []).filter((r) => r.status === 'classifying').map((r) => r.kind));
}

export function workingAgentNames(st) {
  const local = localWork(st);
  const active = classifyingKinds(st);
  return Object.keys(AGENT_KINDS).filter((name) => local[name] || AGENT_KINDS[name].some((k) => active.has(k)));
}

// The words. Demo and offline say nothing: demo has no agents, and an
// offline copy cannot know what is running now. Zero working says nothing
// on the eyebrow and the Index (silence is the honest "none"), and the
// roster's header says so in words.
export function agentsWorkingLabels(st, { demoMode, isOffline }) {
  if (demoMode || isOffline) return { count: null, eyebrow: '', group: 'AGENTS', index: '' };
  const n = workingAgentNames(st).length;
  return {
    count: n,
    eyebrow: n ? `${n} ${n === 1 ? 'AGENT' : 'AGENTS'} WORKING` : '',
    group: n ? `AGENTS · ${n} WORKING NOW` : 'AGENTS · NONE WORKING',
    index: n ? `${n} ${n === 1 ? 'agent' : 'agents'} working` : '',
  };
}

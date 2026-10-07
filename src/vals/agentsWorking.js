// WHICH AGENTS ARE WORKING RIGHT NOW: one answer for every surface that
// counts them (his standing rule, 7 Oct 2026: "only true actual live working
// agents at any time. Never false data"). The Home eyebrow, the Mac sidebar's
// group header, the Index's Ops row, the roster's pulsing dots and the Org
// map all agree, because the roster, the kind-to-agent table and the 30
// minute "stuck, not working" cutoff are the Org map's own
// (server/lib/orgMap.js, a pure module both sides import).
//
// An agent is working when a record of one of its kinds is classifying on
// the rails and started within WORKING_MS (server work, any device), or when
// this client has a job of its in flight. Nothing else counts: an agent that
// exists but is idle is not "live".
import { BEINGS, WORKING_MS, beingForRecord } from '../../server/lib/orgMap.js';

// this client's own in-flight work, by Org map being id
export function localWork(st) {
  return {
    commander: !!(st.calCmdBusy || st.dispatchBusy),
    coach: !!(st.coachBusy || st.quickBusy),
    mealprep: !!st.mealPrepBusy,
    cfo: !!(st.moneyBusy || st.moneyScanBusy),
    researcher: (st.voiceChat || []).some((m) => m.research?.status === 'running'),
    // 'fetching' is the watch toolchain pulling a transcript for a
    // URL-only vault weave; the weave itself shows in its own overlay
    watcher: st.ingestStatus === 'fetching',
    guardian: !!st.guardianBusy,
    leader: !!st.leaderBusy,
    // a live scene is Practice working (the Org map's 'scene' tell)
    practice: !!(st.practiceScene || st.practiceBusy),
  };
}

export function workingBeingIds(st, now = Date.now()) {
  const ids = new Set(Object.entries(localWork(st)).filter(([, on]) => on).map(([id]) => id));
  for (const r of st.liveInbox?.items || []) {
    if (r.status !== 'classifying' || !r.createdAt || now - new Date(r.createdAt).getTime() >= WORKING_MS) continue;
    const b = beingForRecord(r);
    if (BEINGS.some((x) => x.id === b)) ids.add(b);
  }
  return ids;
}

export function workingAgentNames(st, now = Date.now()) {
  const ids = workingBeingIds(st, now);
  return BEINGS.filter((b) => ids.has(b.id)).map((b) => b.name);
}

// The classifying record a working agent is on, for the roster's hover hint.
export function activeRecordOf(st, name, now = Date.now()) {
  const being = BEINGS.find((b) => b.name === name);
  if (!being) return null;
  return (st.liveInbox?.items || []).find((r) => r.status === 'classifying' && r.createdAt
    && now - new Date(r.createdAt).getTime() < WORKING_MS && beingForRecord(r) === being.id) || null;
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

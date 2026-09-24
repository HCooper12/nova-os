// WHAT IS RUNNING RIGHT NOW — the one answer a server restart needs first.
//
// 25 Sep 2026: a reload 23 seconds into his detailed Coach question killed
// the job, and his phone waited three minutes for an answer that no longer
// existed. Every AI job lives in an in-memory Map inside its own lib
// (Coach/Leader/Code in claudeCode.js, ingest, briefing, form check, scans…),
// so a restart forgets all of them at once, and nothing could say beforehand
// that any were in flight.
//
// Each lib registers its Map here with one line. `activeJobs()` counts every
// job not yet in a terminal state; GET /api/jobs/active serves it; and
// scripts/reload-server.mjs refuses to restart the server while it is above
// zero. That is the rule, for every session that ships to his Mac.

const maps = new Map(); // name → Map of jobs

const TERMINAL = new Set(['ready', 'error', 'done', 'failed', 'cancelled', 'canceled', 'applied', 'discarded', 'undone', 'filed', 'refused']);

export function registerJobMap(name, map) {
  maps.set(name, map);
  return map;
}

export function activeJobs() {
  const byLane = {};
  let active = 0;
  for (const [name, map] of maps) {
    let n = 0;
    for (const job of map.values()) {
      const status = typeof job?.status === 'string' ? job.status : '';
      if (status && !TERMINAL.has(status)) n += 1;
    }
    if (n) byLane[name] = n;
    active += n;
  }
  return { active, byLane };
}

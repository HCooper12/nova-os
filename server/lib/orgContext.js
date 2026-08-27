// THE ORG BLOCK — what every agent should know about the rest of the org.
//
// Nova's agents were each built well and wired individually, so every new
// one started blind and had to be connected by hand. That is why the Leader,
// three days old, had the same gaps as features from July: the Coach and the
// Leader mutually invisible, the health insight unreadable by the agent that
// wrote it, seven agents never seeing a standing instruction the prompt
// promises "EVERY agent reads".
//
// The fix is structural, not a list of wires: awareness becomes something an
// agent INHERITS, exactly as it already inherits NOVA_LENS. Prepend this and
// a new agent is connected the day it ships.
//
// Rules this file keeps:
//   - Deterministic. Code decides what an agent knows; no model chooses.
//   - Honest absence. A section with nothing real to say is omitted, never
//     padded — an agent must never infer activity from a placeholder.
//   - Cheap and non-blocking. Every section is individually guarded and
//     time-boxed; the org block must never be the reason a reply is slow or
//     an agent fails to answer at all.
//   - `self` is excluded, because an agent reading its own summary back as
//     "the org" is noise, and in the Leader's case actively confusing.

const SECTION_TIMEOUT_MS = 4000;

function withTimeout(promise, ms = SECTION_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null);
}

function ageHours(iso, now) {
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 3600e3));
}
function ageLine(h) {
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/* ------------------------------- sections -------------------------------- */

// The rules he has stated outright. The prompt tells him a correction lands
// once and every agent obeys it from then on; only five of twelve actually
// read this. That promise is the whole point of the feature.
async function standingSection(vaultPath) {
  const { standingContext } = await import('./standing.js');
  return standingContext(vaultPath);
}

// What the rest of the fleet has actually done lately, across every record
// kind an agent files.
async function fleetSection() {
  const { fleetContext } = await import('./fleetContext.js');
  return fleetContext();
}

// The siblings' live state, one line each. Not their transcripts — those are
// Ask Nova's business as the front door — but enough that any agent can say
// "the Leader has you working on X" instead of being blind to it.
async function siblingsSection(self, now) {
  const lines = [];

  if (self !== 'coach') {
    try {
      const { listRecords } = await import('./inboxStore.js');
      const open = (await listRecords()).filter(
        (r) => r.status === 'pending' && ['coach', 'coach-program', 'coach-audit', 'fuel-cross'].includes(r.kind),
      );
      if (open.length) {
        const newest = open.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        lines.push(`- Coach has ${open.length} open item${open.length === 1 ? '' : 's'} awaiting his yes; newest: "${String(newest.text || newest.decision?.title || '').slice(0, 110)}"`);
      }
    } catch { /* honest absence */ }
  }

  if (self !== 'leader') {
    try {
      const { readLeaderState, todayLead } = await import('./leader.js');
      const state = await readLeaderState();
      // todayLead takes a DATE, not a millisecond stamp — passing the number
      // threw getFullYear and the catch below turned a real, present idea
      // into a silent "nothing to say". A swallowed error that looks exactly
      // like honest absence is the worst kind, so it is spelled out here.
      const today = todayLead(state, new Date(now));
      const open = (state.profile?.struggles || []).filter((s) => !s.resolvedAt).slice(-3);
      if (today) lines.push(`- The Leader's idea for him today: "${today.title}" — ${today.line}`);
      if (open.length) lines.push(`- He has told the Leader he is working against: ${open.map((s) => `"${s.text}"`).join('; ')}`);
      const working = (state.profile?.working || []).slice(-2);
      if (working.length) lines.push(`- And that these are working for him: ${working.map((w) => `"${w.text}"`).join('; ')}`);
    } catch { /* honest absence */ }
  }

  // The health insight is written by a model twice a day and, until now, read
  // by a single UI tile — so the agent that wrote it could not discuss it.
  if (self !== 'health-insight') {
    try {
      // Shape is {morning:{insight,generatedAt,hasInsight}, evening:{…}} —
      // read from the real file, not assumed. Take whichever slot is newer,
      // and only when it still describes today-ish reality.
      const { getLatestInsight } = await import('./healthInsight.js');
      const cached = (await getLatestInsight()) || {};
      const slot = ['morning', 'evening']
        .map((k) => cached[k])
        .filter((s) => s?.hasInsight && s.insight && s.generatedAt)
        .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))[0];
      if (slot && ageHours(slot.generatedAt, now) < 36) {
        lines.push(`- Nova's health read (${ageLine(ageHours(slot.generatedAt, now))}): ${String(slot.insight).slice(0, 220)}`);
      }
    } catch { /* honest absence */ }
  }

  return lines.length ? `THE REST OF THE ORG RIGHT NOW:\n${lines.join('\n')}` : null;
}

/* --------------------------------- build --------------------------------- */

/**
 * @param {string} vaultPath
 * @param {string} self  the calling agent's own id — its section is skipped
 */
export async function orgContext(vaultPath, self = '') {
  const now = Date.now();
  const [standing, fleet, siblings] = await Promise.all([
    withTimeout(standingSection(vaultPath)),
    withTimeout(fleetSection()),
    withTimeout(siblingsSection(self, now)),
  ]);
  const parts = [standing, siblings, fleet].filter((p) => p && String(p).trim());
  if (!parts.length) return '';
  return `${parts.join('\n\n')}\n\nYou are one agent inside Nova. The block above is the rest of the platform — his standing rules, what your colleagues are doing, and what they are currently asking of him. Treat it as fact, use it when it bears on your work, and never read it back to him as a list.`;
}

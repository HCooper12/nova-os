import { listRecords } from './inboxStore.js';

// Open Loops — the follow-up-until-closed behaviour. Deterministic, no
// model: things that are WAITING and AGING are found and named, so nothing
// silently rots. Time-value drafts are excluded (expiry already handles
// them); this is for real content that deserves an answer — a research
// brief nobody read, a coach proposal nobody decided, training debt past
// its date. Surfaces: a line in the morning brief (which the bridge
// announces to his phone) and the Ask Nova context.

const EXCLUDED_KINDS = new Set(['dispatch', 'review', 'training-check', 'week-plan', 'plan-today', 'weekly-debrief', 'followup']);
const STALE_DAYS = 3;

export async function computeOpenLoops(vaultPath, now = new Date()) {
  const loops = [];
  const days = (iso) => Math.floor((now - new Date(iso)) / 86400e3);

  try {
    const records = await listRecords();
    for (const r of records) {
      if (r.status !== 'pending' || EXCLUDED_KINDS.has(r.kind)) continue;
      const age = days(r.createdAt);
      if (age < STALE_DAYS) continue;
      loops.push({
        type: 'stale-draft',
        id: r.id,
        ageDays: age,
        label: `"${(r.decision?.title || r.text || 'untitled').slice(0, 70)}" — waiting ${age}d in the Inbox`,
      });
    }
  } catch { /* records unavailable — report what we can */ }

  try {
    const { listCarryovers } = await import('./workoutCarryover.js');
    const carryovers = await listCarryovers();
    for (const c of carryovers) {
      const overdue = days(`${c.forDate}T23:59:59`);
      if (overdue < 1) continue;
      loops.push({
        type: 'carryover',
        id: c.id,
        ageDays: overdue,
        label: `${c.exercises.length} exercise${c.exercises.length === 1 ? '' : 's'} from ${c.sourceRoutineName} — promised for ${c.forDate}, ${overdue}d past`,
      });
    }
  } catch { /* optional */ }

  return loops.sort((a, b) => b.ageDays - a.ageDays).slice(0, 6);
}

// One honest line for the morning brief; empty string when nothing is aging
// (silence is the reward for a closed board, never filler).
export async function openLoopsLine(vaultPath) {
  const loops = await computeOpenLoops(vaultPath);
  if (!loops.length) return '';
  return `**Open loops.** ${loops.length} thing${loops.length === 1 ? '' : 's'} aging: ${loops.slice(0, 3).map((l) => l.label).join('; ')}${loops.length > 3 ? `; +${loops.length - 3} more in the Inbox` : ''}.`;
}

// Context block for conversations — so "what am I sitting on?" has a real answer.
export async function openLoopsContext(vaultPath) {
  const loops = await computeOpenLoops(vaultPath);
  if (!loops.length) return '';
  return `OPEN LOOPS (aging, waiting on him — raise ONE naturally if relevant, never lecture):\n- ${loops.map((l) => l.label).join('\n- ')}`;
}

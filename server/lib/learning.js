import { listRecords } from './inboxStore.js';
import { loadRecentDays as loadNutritionDays } from './nutritionLog.js';

// The learning loop — Nova's suggestions compound instead of resetting. It
// reads Hayden's REAL decisions (what he approved vs skipped on the inbox
// rails, how his logged behaviour actually runs) and derives honest "tends
// to" signals. These feed the model agents (the Daily Review and Ask Nova
// reason from what he actually does) and are shown back to him plainly.
//
// Deterministic and grounded, per the Nova Method: only real counts, and it
// degrades honestly below the evidence threshold rather than guessing a
// personality.

// WHAT HE REJECTS IS THE CLEAREST THING HE EVER SAYS. Of 332 records, 229
// were discarded — and this map decided which of those decisions became a
// "tends to". It covered 11 kinds and missed the busiest one on the board
// (plan-today, 31 decisions), so the loudest signal in the system was being
// dropped. A kind belongs here whenever accepting or rejecting it expresses
// a preference rather than a one-off fact.
const KIND_LABEL = {
  review: 'Daily Reviews', dispatch: 'morning briefs', 'meal-prep': 'meal-prep proposals',
  research: 'research briefs', video: 'video watches', studio: 'Studio outlines', cfo: 'CFO reports',
  // the sweep: decisions on these were never learned — two proposal loops
  // couldn't improve themselves
  'food-suggestion': 'food-to-recipe suggestions', 'training-check': 'training checks',
  calendar: 'calendar changes', coach: 'session receipts',
  'plan-today': "the day's top three", pattern: 'automation suggestions',
  'week-plan': 'week plans', 'coach-program': 'program-review findings',
  'fuel-cross': 'fuel × training findings', 'weekly-debrief': 'weekly debriefs',
  distill: 'distillations', 'brain-week': 'brain-week reports',
  study: 'study briefs', 'coach-audit': 'program audits',
  'read-next': 'read-next suggestions', scout: 'people researched',
  'leader-reflect': 'leadership reflections',
};
const MIN_DECISIONS = 3;

function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.getDay() === 0 || d.getDay() === 6;
}

// Returns { noticed: string[], enoughData: bool }.
export async function computePreferences(vaultPath) {
  const noticed = [];
  // THE SAME SIGNAL, STRUCTURED (23 Sep 2026). `noticed` stays exactly as it
  // is: it is prose, and the agents that read this to shape a suggestion want
  // prose. `lanes` is the decision history as numbers, so Settings can DRAW
  // the trust ladder instead of printing seventeen sentences — this is the
  // data that governs what Nova may do unasked, and it was the most literal
  // spreadsheet-as-prose in the app (review finding 10).
  const lanes = [];

  // 1) accept/skip tendencies per brief kind, from the inbox record history
  try {
    const records = await listRecords();
    const byKind = {};
    for (const r of records) {
      if (!KIND_LABEL[r.kind]) continue;
      if (!['filed', 'discarded', 'undone'].includes(r.status)) continue;
      const k = (byKind[r.kind] ||= { kept: 0, dropped: 0 });
      if (r.status === 'filed') k.kept++;
      else k.dropped++;
    }
    for (const [kind, c] of Object.entries(byKind)) {
      const total = c.kept + c.dropped;
      if (total < MIN_DECISIONS) continue;
      const label = KIND_LABEL[kind];
      const verdict = c.kept / total >= 0.7 ? 'acts' : c.dropped / total >= 0.7 ? 'skips' : 'mixed';
      if (verdict === 'acts') noticed.push(`Acts on ${label} — kept ${c.kept} of ${total}.`);
      else if (verdict === 'skips') noticed.push(`Tends to skip ${label} — dismissed ${c.dropped} of ${total}; worth easing off or turning down.`);
      else noticed.push(`Mixed on ${label} — kept ${c.kept} of ${total}.`);
      lanes.push({ kind, label, kept: c.kept, dropped: c.dropped, total, verdict });
    }
  } catch { /* inbox unavailable — skip this signal */ }

  // 2) protein-floor adherence: weekend vs weekday, from the nutrition archive
  try {
    const days = (await loadNutritionDays(28)).filter((d) => d.floorMet != null);
    if (days.length >= 6) {
      const wk = days.filter((d) => !isWeekend(d.date));
      const we = days.filter((d) => isWeekend(d.date));
      const rate = (list) => (list.length ? Math.round((list.filter((d) => d.floorMet).length / list.length) * 100) : null);
      const wkR = rate(wk);
      const weR = rate(we);
      if (wkR != null && weR != null && we.length >= 2 && wk.length >= 2 && wkR - weR >= 25) {
        noticed.push(`Protein floor slips on weekends — hit ${weR}% Sat/Sun vs ${wkR}% on weekdays.`);
      }
    }
  } catch { /* nutrition archive unavailable — skip */ }

  // The lanes he might want to TURN DOWN come first — they are the only ones
  // that ask anything of him — then the rest by how much evidence there is.
  const RANK = { skips: 0, mixed: 1, acts: 2 };
  lanes.sort((a, b) => (RANK[a.verdict] - RANK[b.verdict]) || (b.total - a.total));
  return { noticed, lanes, enoughData: noticed.length > 0 };
}

// Compact block for the top of the model agents' context.
export async function preferencesContext(vaultPath) {
  const { noticed, enoughData } = await computePreferences(vaultPath);
  if (!enoughData) return 'WHAT HAYDEN TENDS TO DO: not enough decisions logged yet to see patterns — reason from his data and don\'t assume habits.';
  return 'WHAT HAYDEN TENDS TO DO (observed from his real decisions — weight these, and adapt rather than repeat what he skips):\n' + noticed.map((n) => `- ${n}`).join('\n');
}

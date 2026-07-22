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

const KIND_LABEL = {
  review: 'Daily Reviews', dispatch: 'morning briefs', 'meal-prep': 'meal-prep proposals',
  research: 'research briefs', studio: 'Studio outlines', cfo: 'CFO reports',
  // the sweep: decisions on these were never learned — two proposal loops
  // couldn't improve themselves
  'food-suggestion': 'food-to-recipe suggestions', 'training-check': 'training checks',
  calendar: 'calendar changes', coach: 'session receipts',
};
const MIN_DECISIONS = 3;

function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.getDay() === 0 || d.getDay() === 6;
}

// Returns { noticed: string[], enoughData: bool }.
export async function computePreferences(vaultPath) {
  const noticed = [];

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
      if (c.kept / total >= 0.7) noticed.push(`Acts on ${label} — kept ${c.kept} of ${total}.`);
      else if (c.dropped / total >= 0.7) noticed.push(`Tends to skip ${label} — dismissed ${c.dropped} of ${total}; worth easing off or turning down.`);
      else noticed.push(`Mixed on ${label} — kept ${c.kept} of ${total}.`);
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

  return { noticed, enoughData: noticed.length > 0 };
}

// Compact block for the top of the model agents' context.
export async function preferencesContext(vaultPath) {
  const { noticed, enoughData } = await computePreferences(vaultPath);
  if (!enoughData) return 'WHAT HAYDEN TENDS TO DO: not enough decisions logged yet to see patterns — reason from his data and don\'t assume habits.';
  return 'WHAT HAYDEN TENDS TO DO (observed from his real decisions — weight these, and adapt rather than repeat what he skips):\n' + noticed.map((n) => `- ${n}`).join('\n');
}

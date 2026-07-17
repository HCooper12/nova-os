// Scripted keyword-matched replies for DEMO MODE ONLY. These are the "AI"
// behind the Voice orb, the mock workout Coach, and the mock recipe chat when
// no backend is connected — pure theatre, clearly badged as demo in the UI.
// None of these run when a real connection is configured.

export function orbReply(q) {
  const s = q.toLowerCase();
  if (/(lunch|eat|food|recipe|meal)/.test(s)) return 'From your vault: the burrito bowl — 52 g protein, 640 kcal, 25 minutes. It closes today’s protein gap. Shall I scale it to two servings?';
  if (/(gym|train|workout|push|run)/.test(s)) return 'Push day at 17:30 — six lifts, forty-two minutes. Coach flags bench for a PR attempt if bar speed holds. Zone-2 run is rescheduled to tomorrow, 7 am.';
  if (/(money|spend|budget|sub)/.test(s)) return 'CFO reports $1,284 spent this month — on plan. Two overlapping subscriptions were flagged; cancelling both recovers $23 per month.';
  if (/(brief|today|plan|morning)/.test(s)) return 'Briefing: deep work 09:00 on the video script — Studio’s cold-open is ready. Lunch 12:30, push day 17:30, reflection 20:00. Protein pace is 84 g short; the bowl covers it.';
  return 'Understood. I’ve noted that in the vault and routed it to the right agent — Commander will fold it into today’s plan.';
}

export function coachReply(q) {
  const s = q.toLowerCase();
  if (/(short|less|trim|time|quick)/.test(s)) return { text: 'Done — cutting cable fly, supersetting laterals with triceps. New estimate: 34 minutes, same chest stimulus. Written back to the vault.', mod: 'trim', note: 'Trimmed to 5 lifts · ~34 min · superset added' };
  if (/(hard|more|heavy|push|extra)/.test(s)) return { text: 'You’ve earned it — bench goes to 5 sets and we’ll chase the 87.5 kg single if velocity holds. Recovery cost is acceptable given last night’s HRV.', mod: 'hard', note: 'Bench 5 × 6 · PR single queued at 87.5 kg' };
  if (/(swap|replace|shoulder|knee|hurt|pain)/.test(s)) return { text: 'Swapped seated press for landmine press — friendlier angle, same overhead pattern. Flag any pain above 3/10 and I’ll deload the session.', mod: 'swap', note: 'Landmine press substituted · joint-friendly' };
  return { text: 'Noted. I’ll factor that into tonight’s session and adjust tomorrow’s plan — anything specific you want changed right now? Try “make it shorter” or “go harder”.', mod: null, note: null };
}

export function recipeReply(q, r) {
  const s = q.toLowerCase();
  if (/(swap|substitut|instead)/.test(s)) return 'Swap ideas for ' + r.name.toLowerCase() + ': chicken thigh → breast saves 6 g fat (−45 kcal); rice → cauliflower rice drops 38 g carbs. Both keep protein at ' + r.p + ' g. Want me to write a variant note to the vault?';
  if (/(scale|serving|two|double)/.test(s)) return 'Scaled — use the stepper on the left. Macros and every ingredient quantity update together; I’ll add the extra portion to tomorrow’s lunch slot.';
  if (/(cut|diet|lean|lower)/.test(s)) return 'Cutting version: hold protein at ' + r.p + ' g, drop rice to 50 g and skip cheese — that’s ' + Math.round(r.kcal * 0.75) + ' kcal. I’ve saved it as “' + r.name + ' · cut” in the vault.';
  return 'This one clears your leucine threshold per serving and fits today’s remaining macros. Ask me to swap ingredients, scale it, or build a cutting version.';
}

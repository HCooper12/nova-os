// RIGHT NOW (13 Oct 2026, mockup 101; his words: "there is still potential
// to add any more information that is more dynamic and changing as time goes
// on that can appear or suggest things that are most relevant to whatever the
// current situation is regarding my fuel intake").
//
// One card, one situation, worked out by code from what Nova already holds:
// the rotation (slots, the dish in focus, its swap, the fridge count), the
// plate against its targets, today's routine and the calendar's time for it.
// First rule that matches wins; nothing matching means no card at all
// (honest degradation: silence, never filler). Pure.
//
// Returns { key, line, why, proj?, actions: [{ kind, label, slot?, id? }] }
// or null. The view model maps each action kind to an existing app method.

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const hm2min = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
export const clockOf = (hm) => {
  const t = hm2min(hm); if (t == null) return '';
  const h = Math.floor(t / 60), m = t % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? ' am' : ' pm'}`;
};

// the calendar's time for today's routine: the same rule Home's hero uses
// (src/vals/valsMission.js, workoutEvent), kept as a twin so both agree
export function workoutEventFor(routineName, events) {
  if (!routineName || !Array.isArray(events)) return null;
  const word = String(routineName).replace(/[^\w\s]/g, ' ').trim().split(/\s+/)[0] || '';
  return events.find((e) => e && e.time && (
    (word.length > 2 && new RegExp(`\\b${word}\\b`, 'i').test(e.label || ''))
    || /\b(gym|workout|training|lift|session|push|pull|legs?|upper|lower|chest|back|shoulders?|cardio)\b/i.test(e.label || '')
  )) || null;
}

export function fuelNow({ nowMin = 0, slots = [], p = 0, proteinTarget = null, workout = null } = {}) {
  const filled = slots.filter((s) => s && s.focus);
  const pre = slots.find((s) => s && s.key === 'preworkout');
  const wTime = workout?.time ? hm2min(workout.time) : null;

  // 1. training later today and nothing planned to eat before it
  if (workout && !workout.done && pre && !pre.focus && (wTime == null ? nowMin < 14 * 60 : nowMin < wTime && nowMin >= wTime - 5 * 60)) {
    return {
      key: 'pre',
      line: `${workout.name} is ${wTime != null ? `at ${clockOf(workout.time)}` : 'today'} and the pre-workout slot is empty.`,
      why: wTime != null ? 'From your program and your calendar.' : 'From your program. Your calendar has no time for it.',
      actions: [{ kind: 'kitchen', label: 'Pick a pre-workout' }],
    };
  }

  // 2. the next thing to eat, in the rotation's own order
  const next = filled.find((s) => !s.eaten);
  if (next) {
    const d = next.focus;
    const alt = next.alt || null;
    const toGo = proteinTarget > 0 ? Math.max(0, Math.round(proteinTarget - num(p))) : null;
    const actions = [];
    if (!d.out) actions.push({ kind: 'tick', label: `Log ${d.name}`, slot: next.key, id: d.id });
    if (alt) actions.push({ kind: 'swap', label: `Swap to ${alt.name}`, slot: next.key });
    if (d.out) {
      return {
        key: 'out', line: `${next.label} is ${d.name}, and it's out.`,
        why: alt ? `The fridge count says none left. ${alt.name} is the other option.` : 'The fridge count says none left. Cook more, or plan another dish.',
        actions: alt ? actions : [{ kind: 'open', label: 'Open the recipe', id: d.id }],
      };
    }
    if (toGo != null && toGo > 0 && num(d.p) >= toGo) {
      return {
        key: 'covers', line: `${toGo} g of protein to go, and ${next.label} covers it.`,
        why: `${d.name}, ${Math.round(num(d.p))} g, lands you on ${Math.round(num(p) + num(d.p))} g.${d.portionsLeft != null ? ` ${d.portionsLeft} ${d.portionsLeft === 1 ? 'portion' : 'portions'} left.` : ''}`,
        proj: { now: Math.round(num(p)), add: Math.round(num(d.p)), target: proteinTarget },
        actions,
      };
    }
    const last = d.portionsLeft === 1;
    return {
      key: 'next',
      line: last ? `${next.label} is ${d.name}, and it's your last one in the fridge.` : `${next.label} is next: ${d.name}.`,
      why: `${Math.round(num(d.p))} g protein, ${Math.round(num(d.kcal)).toLocaleString('en-AU')} kcal${alt ? `. ${alt.name} is the other option.` : '.'}${toGo ? ` ${toGo} g of protein to go today.` : ''}`,
      actions: last ? [...actions, { kind: 'open', label: 'Open the recipe', id: d.id }] : actions,
    };
  }

  // 3. everything planned is eaten: what tomorrow needs from the fridge
  const empty = filled.filter((s) => s.focus.portionsLeft === 0 || s.focus.out);
  if (filled.length && empty.length) {
    const s = empty[0];
    return {
      key: 'restock', line: `Day done. Tomorrow's ${s.label} needs cooking.`,
      why: `${s.focus.name} is out of the fridge.${empty.length > 1 ? ` So ${empty.length > 2 ? 'are' : 'is'} ${empty.slice(1).map((x) => x.focus.name).join(' and ')}.` : ''}`,
      actions: [{ kind: 'open', label: 'Open the recipe', id: s.focus.id }],
    };
  }
  return null;
}

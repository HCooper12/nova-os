import { loadRecentDays } from './foodLog.js';
import { normalizeName } from './foodHistory.js';

// WHAT HE ACTUALLY EATS, OVER TIME.
//
// 45 days of item-level history — names, times, portions, macros — existed
// with exactly one consumer: recipe suggestions. Every agent saw today's
// totals and nothing else, so nobody could notice that he skips breakfast on
// training days, or that the protein gap has a shape rather than a size.
// Totals answer "did he hit the floor"; only the items answer "why not".
//
// Deterministic arithmetic, honest about thin data: below the evidence
// threshold it says so rather than inventing a habit from three entries.

const MIN_DAYS = 5;

function hourOf(entry) {
  const m = String(entry.time || '').match(/^(\d{1,2}):/);
  return m ? Number(m[1]) : null;
}

/**
 * @returns {{days:number, lines:string[]}} — `lines` is empty when the log is
 * too thin to say anything true.
 */
export async function computeFoodPatterns({ days = 21 } = {}) {
  const all = (await loadRecentDays(days)).filter((d) => (d.entries || []).length);
  if (all.length < MIN_DAYS) return { days: all.length, lines: [] };
  const lines = [];

  // 1) FIRST MEAL. A late first meal is the single most common reason a
  // protein floor is missed — the day starts already behind.
  const firsts = all.map((d) => {
    const hours = (d.entries || []).map(hourOf).filter((h) => h != null);
    return hours.length ? Math.min(...hours) : null;
  }).filter((h) => h != null);
  if (firsts.length >= MIN_DAYS) {
    const avg = firsts.reduce((s, h) => s + h, 0) / firsts.length;
    // a mean of hours is a TIME, not a decimal — "13.5:00" is not a clock
    const hh = Math.floor(avg);
    const mm = String(Math.round((avg - hh) * 60)).padStart(2, '0');
    const late = firsts.filter((h) => h >= 12).length;
    lines.push(`First meal averages ${hh}:${mm} across ${firsts.length} logged days${late ? `; ${late} of them started at midday or later` : ''}.`);
  }

  // 2) WHERE THE PROTEIN LANDS. Front-loaded vs back-loaded is actionable in
  // a way a daily total never is.
  const split = { early: 0, late: 0 };
  for (const d of all) {
    for (const e of d.entries || []) {
      const h = hourOf(e);
      const p = Number(e.macros?.p) || 0;
      if (h == null || !p) continue;
      if (h < 15) split.early += p; else split.late += p;
    }
  }
  const totalP = split.early + split.late;
  if (totalP > 0) {
    const latePct = Math.round((split.late / totalP) * 100);
    lines.push(`Protein timing: ${100 - latePct}% before 3pm, ${latePct}% after — ${latePct >= 60 ? 'back-loaded, so a missed evening meal costs him the floor outright' : 'reasonably spread across the day'}.`);
  }

  // 3) THE REPEATERS. What he genuinely eats, by his own log — grounding for
  // any suggestion, and the fastest honest answer to "what do I usually eat".
  const counts = new Map();
  for (const d of all) {
    for (const e of d.entries || []) {
      const key = normalizeName(e.name || '');
      if (!key) continue;
      const cur = counts.get(key) || { name: e.name, n: 0 };
      cur.n++;
      counts.set(key, cur);
    }
  }
  const top = [...counts.values()].filter((c) => c.n >= 3).sort((a, b) => b.n - a.n).slice(0, 6);
  if (top.length) lines.push(`Eats repeatedly: ${top.map((c) => `${c.name} (${c.n}×)`).join(', ')}.`);

  return { days: all.length, lines };
}

export async function foodPatternsContext({ days = 21 } = {}) {
  const { days: n, lines } = await computeFoodPatterns({ days });
  if (!lines.length) {
    return `HOW HE ACTUALLY EATS: only ${n} day${n === 1 ? '' : 's'} logged in the last ${days} — too thin to read a pattern. Say so rather than guessing at habits.`;
  }
  return `HOW HE ACTUALLY EATS (item-level, last ${n} logged days — his own log, not a plan):\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

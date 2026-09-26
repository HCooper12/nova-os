// REFINE AN ESTIMATE IN WORDS, AS MANY TIMES AS HE LIKES (26 Sep 2026).
//
// His report, with the plate photo: "It wouldn't let me refine it further
// after my initial answer as it claimed this photo was a beef rissole but it
// was vegetarian... I should be able to continue adding refinements if I have
// any before logging it."
//
// Two faults sat under that. A correction was only possible when the scan
// itself asked a question, so a confident wrong answer could not be argued
// with. And the one refine path there was re-uploaded every photo and re-ran
// the whole vision pass, which over mobile data failed before reaching the
// Mac ("Load failed") and took ~17 s even when it worked.
//
// So a refinement is TEXT: the plate as it stands plus his sentence. The
// model decides which lines his words change (a language judgement); this
// code does everything numeric:
//   - a line the model says to KEEP is copied from the previous estimate
//     verbatim — its numbers cannot drift because he mentioned something else;
//   - a NEW or CHANGED line is validated and its kcal DERIVED from the macros
//     (Atwater), never taken from the model;
//   - the total is the sum of the lines, and the diff he sees is computed by
//     comparing the two plates, not narrated by the model.

import { kcalFrom } from './nutritionFacts.js';

const MAX_LINES = 24;
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function buildRefinePrompt({ name, lines, correction, history = [] }) {
  const plate = lines.map((l, i) => `${i}. ${l.name}${l.grams ? ` (${l.grams} g)` : ''} — ${r1(l.macros.p)} g protein, ${r1(l.macros.c)} g carbs, ${r1(l.macros.f)} g fat`).join('\n');
  const said = history.length ? `\nWhat he already told you about this plate, oldest first:\n${history.map((h) => `- "${h}"`).join('\n')}\n` : '';
  return `You are refining a nutrition estimate of one plate of food Hayden ate. The current estimate${name ? ` ("${name}")` : ''} is these numbered lines:
${plate}
${said}
His correction now: "${correction}"

Revise the plate to reflect everything he has said. Rules:
- A line his words do not change: output {"keep": <its number>} and nothing else for it. Do not restate or adjust its numbers.
- A line his words change (a different food, a different amount, a different cooking method): output a replacement {"name", "grams", "p", "c", "f"} for it — realistic per-portion grams of protein, carbs and fat for that amount, from your knowledge of typical foods (a vegetarian rissole is not a beef rissole). Include "grams" as the portion weight.
- Something he says he did not eat: leave it out.
- Something he says he also ate: add a new line {"name", "grams", "p", "c", "f"}.
- Never output calories; they are computed from the macros.
- "name": a short name for the whole plate, updated if the correction changes what it is.
- "changes": one short plain sentence saying what you changed, e.g. "Swapped the beef rissole for a vegetable one." If nothing needed changing, say so.
- If his words are genuinely ambiguous about an amount, you may add "question": one short question. Otherwise "".

Output ONLY a JSON object: {"name": "...", "lines": [ ... ], "changes": "...", "question": ""}. No markdown, no commentary.`;
}

/** A model-proposed line, validated. Null when it cannot be a real portion. */
export function freshLine(raw) {
  const name = String(raw?.name || '').trim().slice(0, 80);
  const p = Number(raw?.p);
  const c = Number(raw?.c);
  const f = Number(raw?.f);
  if (!name || ![p, c, f].every((n) => Number.isFinite(n) && n >= 0)) return null;
  const grams = Number(raw?.grams);
  const g = Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null;
  // a portion cannot weigh less than the macros inside it
  if (g != null && p + c + f > g * 1.02) return null;
  const kcal = kcalFrom({ p, c, f });
  if (kcal <= 0) return null;
  return { name, ...(g ? { grams: g } : {}), macros: { p: r1(p), c: r1(c), f: r1(f), kcal } };
}

const sum = (lines) => {
  const t = lines.reduce((a, l) => ({ p: a.p + l.macros.p, c: a.c + l.macros.c, f: a.f + l.macros.f, kcal: a.kcal + l.macros.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });
  return { p: r1(t.p), c: r1(t.c), f: r1(t.f), kcal: Math.round(t.kcal) };
};

/**
 * Apply the model's revision to the previous plate. Pure.
 * Returns { name, lines, macros, diff: { removed, added, kept, kcalDelta }, changes, question }.
 * Throws when the answer cannot be trusted at all (no usable lines).
 */
export function applyRefine(previous, parsed) {
  const prev = previous.lines || [];
  const rawLines = Array.isArray(parsed?.lines) ? parsed.lines.slice(0, MAX_LINES) : null;
  if (!rawLines) throw new Error('the refinement came back without a plate');
  const used = new Set();
  const lines = [];
  const added = [];
  let skipped = 0;
  for (const raw of rawLines) {
    const k = raw && raw.keep != null ? Number(raw.keep) : null;
    if (k != null && Number.isInteger(k) && prev[k] && !used.has(k)) {
      used.add(k);
      lines.push({ ...prev[k], fresh: false });
      continue;
    }
    const line = freshLine(raw);
    if (line) { lines.push({ ...line, fresh: true }); added.push(line.name); }
    else skipped += 1;
  }
  if (!lines.length) throw new Error('the refinement left nothing on the plate — say it another way');
  const removed = prev.filter((_, i) => !used.has(i)).map((l) => l.name);
  const before = sum(prev);
  const macros = sum(lines);
  return {
    name: String(parsed?.name || previous.name || '').trim().slice(0, 120) || previous.name || 'Meal',
    lines,
    macros,
    diff: { removed, added, kept: used.size, kcalDelta: macros.kcal - before.kcal, skipped },
    changes: String(parsed?.changes || '').trim().slice(0, 240),
    question: String(parsed?.question || '').trim().slice(0, 200),
  };
}

/** The previous plate as the client sends it, normalised. Pure. */
export function previousPlate({ name, lines, macros }) {
  const clean = (Array.isArray(lines) ? lines : []).map((l) => {
    const m = l?.macros && typeof l.macros === 'object' ? l.macros : l || {};
    const out = { name: String(l?.name || '').trim().slice(0, 80), macros: { p: r1(m.p), c: r1(m.c), f: r1(m.f), kcal: Math.round(Number(m.kcal) || 0) } };
    const g = Number(l?.grams);
    if (Number.isFinite(g) && g > 0) out.grams = Math.round(g);
    return out;
  }).filter((l) => l.name).slice(0, MAX_LINES);
  // a single-line estimate (a label, a bar) still refines: it is one line
  if (!clean.length && name && macros) {
    clean.push({ name: String(name).trim().slice(0, 80), macros: { p: r1(macros.p), c: r1(macros.c), f: r1(macros.f), kcal: Math.round(Number(macros.kcal) || 0) } });
  }
  return { name: String(name || '').trim().slice(0, 120), lines: clean };
}

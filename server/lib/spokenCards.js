// SPOKEN CARDS — "let me put it on the glass."
//
// His 21-Aug reference (Instagram DcRlRlMsbdD): the assistant answers out
// loud and the SCREEN KEEPS UP — each spoken line puts its own card on the
// glass (a big figure with its caption, a small bar chart, a short list),
// the card changes as the narration moves on, and spent cards stack into a
// side rail as history. Nothing is tapped; the visuals simply track what is
// being said.
//
// Doctrine holds: these are DATA, built by code from figures the caller has
// already computed. A card can never say something the voice did not, and
// no model chooses one. A beat with nothing real to show gets no card —
// honest silence over decoration.

// A card is one of three shapes, all deliberately small:
//   metric — one number that matters, with its caption and fine print
//   bars   — a handful of comparable values
//   list   — a few named things, each with a note
export const CARD_KINDS = ['metric', 'bars', 'list'];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function metricCard({ label, value, unit, caption, foot, tone }) {
  if (value == null || value === '') return null;
  return {
    kind: 'metric',
    label: clean(label).toUpperCase(),
    value: String(value),
    unit: unit ? clean(unit) : null,
    caption: caption ? clean(caption) : null,
    foot: foot ? clean(foot) : null,
    tone: tone || 'cy',
  };
}

export function barsCard({ label, bars, caption, foot }) {
  const rows = (bars || [])
    .filter((b) => b && b.value != null && Number.isFinite(Number(b.value)))
    .map((b) => ({ name: clean(b.name).slice(0, 18), value: Number(b.value), tone: b.tone || null }));
  if (rows.length < 2) return null; // one bar is a number, not a chart
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return {
    kind: 'bars',
    label: clean(label).toUpperCase(),
    bars: rows.map((r) => ({ ...r, pct: Math.max(2, Math.round((r.value / max) * 100)) })),
    caption: caption ? clean(caption) : null,
    foot: foot ? clean(foot) : null,
  };
}

export function listCard({ label, items, foot }) {
  const rows = (items || [])
    .filter((i) => i && clean(i.name))
    .slice(0, 5)
    .map((i) => ({ name: clean(i.name).slice(0, 46), note: i.note ? clean(i.note).slice(0, 40) : null, tone: i.tone || null }));
  if (!rows.length) return null;
  return { kind: 'list', label: clean(label).toUpperCase(), items: rows, foot: foot ? clean(foot) : null };
}

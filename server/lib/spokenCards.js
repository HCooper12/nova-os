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

// ---------------------------------------------------------------------------
// THE CARD DIRECTIVE — how a spoken ANSWER gets onto the glass.
//
// His 21-Aug ask: the pop-up should appear "for anything I ask Nova verbally
// to do" — pulling up a video, naming the pyramid-shaped teaching hierarchy,
// anything. Those answers aren't metrics we already computed, so the model
// names the card and CODE builds it: the model may only restate, in
// structured fields, what it just said out loud. Every field is clamped
// here, an unknown kind is dropped, and a malformed directive degrades to
// no card at all — never to a card that says something new.
const CARD_RE = /^\s*CARD\s*(\{[\s\S]*\})\s*$/m;

export function parseCardDirective(text) {
  const raw = String(text ?? '');
  const m = raw.match(CARD_RE);
  if (!m) return { cleanText: raw, card: null };
  const cleanText = raw.replace(CARD_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const d = JSON.parse(m[1]);
    return { cleanText, card: cardFromDirective(d) };
  } catch {
    // a broken directive costs the card, never the answer
    return { cleanText, card: null, parseError: 'the card directive was not valid JSON' };
  }
}

export function cardFromDirective(d) {
  if (!d || typeof d !== 'object') return null;
  const label = String(d.label ?? '').slice(0, 42);
  if (!label.trim()) return null;
  if (Array.isArray(d.items) && d.items.length) {
    return listCard({ label, items: d.items.map((i) => (typeof i === 'string' ? { name: i } : i)), foot: d.foot });
  }
  if (Array.isArray(d.bars) && d.bars.length) {
    return barsCard({ label, bars: d.bars, caption: d.caption, foot: d.foot });
  }
  if (d.value != null && String(d.value).trim()) {
    return metricCard({
      label, value: String(d.value).slice(0, 28), unit: d.unit ? String(d.unit).slice(0, 8) : null,
      caption: d.caption, foot: d.foot, tone: ['cy', 'gold', 'warn', 'good', 'vi'].includes(d.tone) ? d.tone : 'cy',
    });
  }
  return null;
}

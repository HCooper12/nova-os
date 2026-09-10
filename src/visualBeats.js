// WHAT IS ON THE GLASS WHILE NOVA IS TALKING.
//
// His 9-Sep report: a Leader conversation full of research he did not want
// shortened, and no way to keep up with it by ear. "It would have been good
// if it would just present brief pop-ups to help explain things it was
// referring to." His references are the JARVIS lab walls in Iron Man 2 —
// many small labelled panels at once, one hero among them, a strip of spent
// ones along the edge, and things that move because something is happening.
//
// THE CONTRACT. A reply may carry, on its own line, a directive:
//
//   VIS {"kind":"media","label":"THE LEVERAGE IDEA","title":"Alex Hormozi — …"}
//
// and everything after it, until the next one, is the prose that visual
// accompanies. Directives are stripped here and never reach his eyes or
// ears. Same shape as the CARD/PROPOSE/REFLECT directives the agents already
// write, for the same reason: the model NAMES the visual, code BUILDS it.
// Nothing here invents a picture, and a card can still only restate what the
// voice is saying.
//
// Shared by both sides on purpose — the server reads it to know what media
// to go and fetch, the client reads it to know what to put up and when. One
// parser, so the two can never disagree about where a beat begins.
// (server/lib/panels.js already imports from src/ the same way.)
//
// STREAMING IS THE HARD PART. This runs on a half-arrived reply many times a
// second. A directive that is still being typed must be withheld WHOLE —
// leaking `VIS {"kind":"me` into the speech queue would have Nova read JSON
// out loud, which is the one failure that would make him turn this off.

export const VISUAL_KINDS = ['key', 'steps', 'image', 'media', 'metric', 'bars', 'list'];

// Kinds that need something fetched before they are whole. The others are
// typographic and land instantly — which is what lets a beat ALWAYS have its
// frame on the glass in context, with the picture filling in after.
export const FETCHED_KINDS = new Set(['image', 'media']);

const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Walk from an opening brace to its match, ignoring braces inside strings.
// Returns the index just past the closing brace, or -1 if it has not arrived.
export function balancedFrom(s, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

// READ WHAT THE MODEL MEANT, NOT WHAT THE CONTRACT ASKED FOR.
//
// 10 Sep 2026, from a real Leader turn: four directives, and every one of
// them said `title` where the contract says `label`, and two of them put
// `items` on a `kind:"key"`. All four were dropped for it, so he watched a
// long answer go by with an empty glass for the second time.
//
// The model's INTENT was never in doubt — a heading and some points. A
// parser that discards that because of a synonym is brittle, and models will
// keep varying. So the payload is trusted over the label put on it:
//   title / heading / name → label
//   text / summary / body  → caption
//   items on a "key"       → it is a list; draw it as one
// Every field is still clamped, an unknown shape still draws nothing, and a
// malformed directive still costs its panel rather than the reply.
const firstString = (d, keys) => {
  for (const k of keys) if (typeof d[k] === 'string' && d[k].trim()) return d[k];
  return '';
};

export function normaliseSpec(d) {
  if (!d || typeof d !== 'object') return null;
  let kind = String(d.kind ?? '').toLowerCase();
  const hasItems = Array.isArray(d.items) && d.items.length;
  if (!VISUAL_KINDS.includes(kind)) kind = hasItems ? 'list' : (d.value != null ? 'metric' : 'key');
  // a panel of points is a list however it was announced
  if (kind === 'key' && hasItems) kind = 'list';
  // A missing label used to drop the panel entirely. Caught on the first real
  // run: the model copied the per-kind examples, which omitted `label`, and
  // all three of its panels vanished — the directive cost its text and put
  // nothing on the glass, which is the worst of both. The heading is
  // decoration; the content is the substance. So the panel stands without one
  // rather than being lost, and StageCard simply omits the line.
  const label = clean(firstString(d, ['label', 'title', 'heading', 'name']), 42).toUpperCase();
  const base = { kind, label, caption: clean(firstString(d, ['caption', 'text', 'summary', 'body']), 140) || null };
  if (kind === 'key') return base.caption ? base : null;
  if (kind === 'steps' || kind === 'list') {
    const items = (Array.isArray(d.items) ? d.items : [])
      .map((i) => (typeof i === 'string' ? { name: i } : i))
      .filter((i) => i && clean(i.name, 60))
      .slice(0, 6)
      .map((i) => ({ name: clean(i.name, 60), note: clean(i.note, 48) || null }));
    return items.length ? { ...base, items } : null;
  }
  if (kind === 'image') {
    const query = clean(d.query, 120);
    return query ? { ...base, query } : null;
  }
  if (kind === 'media') {
    const title = clean(firstString(d, ['title', 'episode', 'name']), 120);
    const url = clean(d.url, 400);
    if (!title && !url) return null;
    return { ...base, title: title || null, url: url || null, moment: clean(d.moment, 80) || null };
  }
  if (kind === 'metric') {
    const value = clean(d.value, 28);
    return value ? { ...base, value, unit: clean(d.unit, 8) || null } : null;
  }
  if (kind === 'bars') {
    const bars = (Array.isArray(d.bars) ? d.bars : [])
      .filter((b) => b && b.value != null && Number.isFinite(Number(b.value)))
      .slice(0, 6)
      .map((b) => ({ name: clean(b.name, 18), value: Number(b.value) }));
    return bars.length >= 2 ? { ...base, bars } : null;   // one bar is a number, not a chart
  }
  return null;
}

// A stable name for one visual, so the server can cache a fetch and the
// client can tell "the same panel, now resolved" from "a new panel".
export function keyOfSpec(spec, i) {
  const bits = [spec.kind, spec.label, spec.query || '', spec.title || '', spec.url || ''];
  let h = 5381;
  const s = bits.join('|');
  for (let j = 0; j < s.length; j++) h = ((h * 33) ^ s.charCodeAt(j)) >>> 0;
  return `v${i}_${h.toString(36)}`;
}

// The whole of it. Give it a reply — finished or half-arrived — and get back
// prose safe to speak, plus where each visual begins in that prose.
export function parseVisualStream(raw) {
  const s = String(raw ?? '');
  // No lookahead for the brace: a `VIS` whose object has not arrived yet
  // must be caught HERE, or the word itself is left in the prose and spoken.
  const re = /(?:^|\n)[ \t]*VIS[ \t]*/g;
  let out = '';
  let cursor = 0;
  let truncated = false;
  const beats = [];
  let m;
  while ((m = re.exec(s))) {
    const braceAt = m.index + m[0].length;
    out += s.slice(cursor, m.index);
    // The match ate the newline that ended the previous paragraph. Put it
    // back, or two sentences weld together ("...second sentence.Finally,")
    // and the client's sentence splitter — which needs whitespace after the
    // full stop — stops finding the boundary and speaks the rest as one lump.
    if (m[0].startsWith('\n') && out.length) out += '\n';
    if (braceAt >= s.length) { cursor = s.length; truncated = true; break; }  // object still coming
    if (s[braceAt] !== '{') {
      // `VIS` with no object after it — a contract violation. Drop the line
      // rather than let the word be read out.
      const nl = s.indexOf('\n', braceAt);
      if (nl === -1) { cursor = s.length; truncated = true; break; }
      cursor = nl + 1;
      re.lastIndex = cursor;
      continue;
    }
    const end = balancedFrom(s, braceAt);
    if (end === -1) {
      // still being typed — withhold it and everything after, and say so, so
      // the caller knows the reply is mid-directive rather than finished
      cursor = s.length;
      truncated = true;
      break;
    }
    let spec = null;
    try { spec = normaliseSpec(JSON.parse(s.slice(braceAt, end))); } catch { spec = null; }
    if (spec) beats.push({ key: keyOfSpec(spec, beats.length), at: out.length, spec });
    cursor = end;
    while (cursor < s.length && (s[cursor] === ' ' || s[cursor] === '\t')) cursor++;
    if (s[cursor] === '\n') cursor++;
    re.lastIndex = cursor;
  }
  out += s.slice(cursor);
  // ...and the two prefixes too short for the pattern above to see. A line
  // ending in "V" or "VI" may be a directive one keystroke from existing;
  // holding it costs one 150ms poll tick, speaking it costs his trust.
  const stub = out.match(/(?:^|\n)([ \t]*VI?)$/);
  if (stub) { out = out.slice(0, out.length - stub[1].length); truncated = true; }
  return { text: out, beats, truncated };
}

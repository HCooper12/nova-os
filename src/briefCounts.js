// FINISHED WORK COMES BACK BY ITSELF, WITH COUNTS AND AN OFFER (the Rose
// study §2.5, 8 Nov 2026): "VR report's done. 12 blocks, 42 sources. Want me
// to put it on screen and walk you through it?" The counts are code's, read
// off the brief's own markdown; the model never guesses them. Pure.

/** Sections (headings) and distinct sources (links) in a brief's body. */
export function briefCounts(body) {
  const s = String(body || '');
  const sections = (s.match(/^#{1,3}\s+\S/gm) || []).length;
  const sources = new Set((s.match(/https?:\/\/[^\s)\]>"']+/g) || []).map((u) => u.replace(/[.,;:]+$/, ''))).size;
  return { sections, sources };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The spoken line when a brief he asked for lands while he is listening. */
export function briefDoneLine(title, { sections = 0, sources = 0 } = {}) {
  const what = String(title || 'The brief').replace(/\s+/g, ' ').trim();
  const bits = [sections ? plural(sections, 'section') : null, sources ? plural(sources, 'source') : null].filter(Boolean);
  return `${what} is done, sir${bits.length ? `: ${bits.join(', ')}` : ''}. Want it on screen?`;
}

/** The brief as a note card: its title and the first lines that are prose. */
export function briefCard(title, body) {
  const lines = String(body || '').split('\n')
    .map((l) => l.replace(/[*_`>]/g, "").replace(/\s*\[\d+\]/g, "").trim())
    .filter((l) => l && !/^#/.test(l) && !/^https?:\/\//.test(l) && !/^[-*]\s*\[?\d*\]?\s*https?:/.test(l))
    .slice(0, 3)
    .map((l) => l.slice(0, 160));
  if (!lines.length) return null;
  return { kind: 'note', label: String(title || 'Brief').slice(0, 60), title: String(title || 'Brief').slice(0, 60), lines, caption: lines[0] };
}

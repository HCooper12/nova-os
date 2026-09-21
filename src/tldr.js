// THE TL;DR — what a card is telling him, in the fewest words, computed by
// code from the shape the record already has. No model, no cost, never
// invented: if a body has no summary shape, there is no TL;DR, and the card
// says nothing rather than something made up.
//
// His report, 21 Sep 2026: "there is way too much information to read while
// I am skipping over it … sometimes I file things in the inbox system
// because it is not clear exactly what relevant information there is for me
// and I am just assuming that it is information relevant for nova and not as
// much for me." Every card that comes through gets one line and, where the
// body carries them, the actionable steps.
//
// Shared by the client (valsInbox) and pinned by server/test/tldr.test.js,
// the same way planCard.js is.

const MAX_ITEMS = 5;
const ITEM_CHARS = 120;
const LINE_CHARS = 220;

// Markdown emphasis and links stripped, whitespace collapsed.
export function plain(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The first one or two sentences of a paragraph, ending on a full stop and
// never mid-quote — the splitter that ate a report's first sentence on 21 Sep
// (planCard.reportOpening) is why this scans rather than regexes.
export function opening(text, { sentences = 2, max = LINE_CHARS } = {}) {
  const t = plain(text);
  if (!t) return '';
  const out = [];
  let start = 0;
  for (let i = 0; i < t.length && out.length < sentences; i++) {
    const c = t[i];
    if ((c === '.' || c === '!' || c === '?') && (i + 1 === t.length || /[\s"”')\]]/.test(t[i + 1]))) {
      // swallow a closing quote/bracket that belongs to the sentence
      let end = i + 1;
      while (end < t.length && /["”')\]]/.test(t[end])) end++;
      const s = t.slice(start, end).trim();
      if (s.length > 2 && !/\b(?:e\.g|i\.e|vs|approx|Dr|Mr|Mrs|No)$/i.test(t.slice(start, i))) { out.push(s); start = end; }
    }
  }
  if (!out.length) out.push(t);
  const joined = out.join(' ');
  return joined.length > max ? `${joined.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : joined;
}

// The first paragraph of a body that is not a heading, a table or a rule.
export function firstParagraph(body) {
  for (const block of String(body || '').split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || /^#/.test(t) || /^\|/.test(t) || /^-{3,}$/.test(t) || /^>/.test(t)) continue;
    return t;
  }
  return '';
}

// A numbered list under a heading such as "## What I would change" or
// "## Recommendations". Each item is cut to its first sentence.
export function numberedItems(body, headingRe = /^#{1,3}\s*(what i would change|recommendations|changes|next steps|actions?)\b/im) {
  const src = String(body || '');
  const m = headingRe.exec(src);
  if (!m) return [];
  const after = src.slice(m.index + m[0].length);
  const stop = after.search(/\n#{1,3}\s/);
  const section = stop >= 0 ? after.slice(0, stop) : after;
  const items = [];
  for (const line of section.split('\n')) {
    const mm = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (!mm) continue;
    const first = opening(mm[2], { sentences: 1, max: ITEM_CHARS });
    if (first) items.push(first);
  }
  return items;
}

// An explicit TL;DR line in the body wins over anything derived.
function explicit(body) {
  const m = /^\s*(?:\*\*)?TL;?DR:?(?:\*\*)?\s*:?\s*(.+)$/im.exec(String(body || ''));
  return m ? opening(m[1], { sentences: 2 }) : '';
}

/**
 * tldrFor — { line, items } for a record, or null when the record has no
 * summary shape (a bare capture, a shopping row). `items` are the actionable
 * steps when the body carries a numbered list of them.
 */
export function tldrFor(record) {
  const kind = record?.kind || '';
  const d = record?.decision || {};
  const body = String(d.payload?.body || d.body || '');
  const title = String(d.title || '');
  const text = String(record?.text || '');

  // reports and reviews: the opening verdict plus the numbered changes
  if ((kind === 'plan' && record?.finishedAt) || kind === 'coach-review' || kind === 'research' || kind === 'briefing') {
    const line = explicit(body) || opening(firstParagraph(body));
    const items = numberedItems(body).slice(0, MAX_ITEMS);
    const more = numberedItems(body).length - items.length;
    if (!line && !items.length) return null;
    return { line, items, more: more > 0 ? more : 0 };
  }
  // a proposed plan: the steps ARE the summary; the card already lists them
  if (kind === 'plan') {
    const steps = Array.isArray(record?.plan?.steps) ? record.plan.steps : [];
    if (!steps.length) return null;
    return { line: `${steps.length} step${steps.length === 1 ? '' : 's'}, waiting on your yes.`, items: [], more: 0 };
  }
  // the Coach's own program flags and typed proposals are already one line
  if (kind === 'coach-program' || d.route === 'routine-edit' || d.route === 'progression-tune') {
    const line = opening(title || text, { sentences: 2 });
    return line ? { line, items: [], more: 0 } : null;
  }
  // a budget pause: the reason line already says approve/discard; the body's
  // first line says what stopped
  if (d.route === 'continue') {
    return { line: opening(firstParagraph(body), { sentences: 1 }), items: [], more: 0 };
  }
  // anything else with a long body gets its opening; short things need none
  if (body.length > 400) {
    const line = explicit(body) || opening(firstParagraph(body));
    return line ? { line, items: [], more: 0 } : null;
  }
  return null;
}

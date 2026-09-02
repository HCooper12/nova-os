// READ NEXT — Librarian Phase 4's second half: let the graph drive
// acquisition instead of only storing it.
//
// The question this answers: what does his vault keep REACHING FOR that it
// does not actually hold? A concept that three different sources all link to
// but which has no developed page of its own is a hole in the second brain
// shaped exactly like the next book he should read.
//
// Deterministic, per the non-negotiable: code finds the gap and code ranks
// it; a model only ever phrases the suggestion. Nothing here invents a title
// or claims a book exists — it names the GAP, because "you have four sources
// circling deliberate practice and no page on it" is a true statement about
// his vault, whereas "you should read X" would be a guess about the world.

const SOURCE_PREFIX = 'Wiki/Sources/';
// A page this short is a stub — it exists, but it holds nothing. The gap is
// real even though the file is not missing.
export const STUB_CHARS = 400;
// Below this many distinct sources, a shared reference is a coincidence
// rather than a theme worth buying a book about.
export const MIN_SOURCES = 2;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// A link that resolves to a page can be typed, so we know whether it is a
// concept. A MISSING link cannot be — and a missing link is often a person
// an author mentioned. Observed on his real vault: "Leila (Hormozi's wife)"
// is referenced like a concept and would, with one more source, have become
// "a book on Leila (Hormozi's wife) would pay for itself".
//
// This is a heuristic and is deliberately conservative: it only skips things
// that are clearly person-shaped. Missing a real gap costs one quiet week;
// recommending he read a book about someone's wife costs his trust in the
// whole feature.
// Only STRONG signals. A first draft also treated "two capitalised words" as
// a name, which is true of "Cal Newport" but equally true of "Deliberate
// Practice", "Deep Work" and "Attention Residue" — it suppressed essentially
// every real concept and would have made the feature permanently silent. A
// bare name that never got an Entity page is the residual risk, and it is
// much smaller than never suggesting anything.
export function looksLikePerson(label) {
  const s = String(label || '').trim();
  if (/['’]s\b/i.test(s)) return true; // "Hormozi's wife", "Newport's editor"
  return /\b(wife|husband|brother|sister|father|mother|son|daughter|partner|spouse|co-?founder)\b/i.test(s);
}

// pages: the Vault.listPages() shape ({ id, title, type, links, raw }).
// Returns the gaps, strongest first. Pure — no IO, so the ranking is testable
// against a handful of fake pages rather than a whole vault.
export function findReadNextGaps(pages = [], { minSources = MIN_SOURCES, stubChars = STUB_CHARS } = {}) {
  // RESOLVE LINKS THE WAY OBSIDIAN DOES: a [[wikilink]] names the FILE, not
  // the frontmatter title, and the two routinely differ. Indexing only by
  // title made every link to a renamed page look like a missing concept —
  // on his real vault that turned "[[41 Harsh Truths Nobody Wants To Admit
  // (Hormozi)]]", one of his own SOURCES, into a recommendation to go and
  // read a book about it. Index both, filename first.
  const byKey = new Map();
  for (const p of pages || []) {
    if (!p) continue;
    const base = String(p.id || '').split('/').pop();
    for (const k of [base, p.title]) {
      const n = norm(k);
      if (n && !byKey.has(n)) byKey.set(n, p);
    }
  }

  const sources = pages.filter((p) => String(p.id || '').startsWith(SOURCE_PREFIX));
  // concept -> the set of SOURCES that reach for it
  const reachedBy = new Map();
  for (const s of sources) {
    // a source linking the same concept twice is still one source
    for (const raw of new Set(s.links || [])) {
      const link = norm(raw);
      if (!link) continue;
      // Raw/ holds verbatim originals — never a thing to read about.
      if (/^raw\b|^raw\//i.test(String(raw).trim())) continue;
      const target = byKey.get(link);
      // Only concepts and topics are "things to read about". A source
      // linking another source, or an entity (a person), is not a gap.
      if (target && !['concept', 'topic'].includes(String(target.type || '').toLowerCase())) continue;
      if (!reachedBy.has(link)) reachedBy.set(link, { label: String(raw).trim(), sources: new Set(), page: target });
      const e = reachedBy.get(link);
      e.sources.add(s.id);
      if (target && !e.page) e.page = target;
    }
  }

  const gaps = [];
  for (const [key, e] of reachedBy) {
    if (e.sources.size < minSources) continue;
    const page = e.page;
    const chars = page ? String(page.raw || '').trim().length : 0;
    // A developed page is not a gap. A missing one, or a stub, is.
    if (page && chars >= stubChars) continue;
    // An unresolvable link cannot be typed — refuse the person-shaped ones
    // rather than recommending a book about somebody's spouse.
    if (!page && looksLikePerson(e.label)) continue;
    gaps.push({
      // his own words, in his own casing — never the normalised key, which
      // reads like machine output when spoken back to him
      concept: page?.title || e.label,
      key: `readnext:${key}`,
      sourceCount: e.sources.size,
      sourceIds: [...e.sources].sort(),
      state: page ? 'stub' : 'missing',
      chars,
    });
  }
  // most-reached first; ties broken by name so the pick never wanders
  gaps.sort((a, b) => (b.sourceCount - a.sourceCount) || String(a.concept).localeCompare(String(b.concept)));
  return gaps;
}

// The line he actually reads. States the evidence before the suggestion,
// and never names a book — the gap is the finding; choosing the book is his.
export function readNextLine(gap, sourceTitles = []) {
  if (!gap) return null;
  const names = sourceTitles.filter(Boolean).slice(0, 3);
  const which = names.length ? ` (${names.join(', ')}${gap.sourceCount > names.length ? ', and others' : ''})` : '';
  const held = gap.state === 'stub'
    ? `you have a page for it, but it is ${gap.chars} characters — a placeholder, not an understanding`
    : 'you have no page for it at all';
  return `${gap.sourceCount} of your sources${which} keep reaching for ${gap.concept}, and ${held}. That is the gap in your second brain right now — a book on it would pay for itself faster than anything else on your shelf.`;
}

// MATERIAL-CHANGE RE-RAISE. A gap he answered (accepted → filed) stays
// answered. One he passed on comes back only when the graph has grown around
// it — two or more sources since the last raise — and says so ("noted on 12
// Jun at 3 sources; now 5"). Never on the calendar alone. Pure, exported.
export const REGROW_SOURCES = 2;
export function readNextEligible(gap, records = [], now = new Date()) {
  const mine = records.filter((r) => r.kind === 'read-next' && r.findingKey === gap.key)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (!mine.length) return { gap, eligible: true, history: null };
  const last = mine[0];
  if (last.status === 'filed' || last.status === 'pending') return { gap, eligible: false, why: last.status === 'filed' ? 'he acted on it' : 'still open' };
  const then = Number(last.meta?.sourceCount) || 0;
  if (gap.sourceCount - then < REGROW_SOURCES) return { gap, eligible: false, why: `declined at ${then} sources, now ${gap.sourceCount} — not materially more` };
  const when = new Date(last.createdAt || now).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { gap, eligible: true, history: `(You passed on this on ${when} at ${then} source${then === 1 ? '' : 's'}; it is now ${gap.sourceCount} — asking once more.)` };
}

/* --------------------------- raising on the rails -------------------------- */

// One proposal at a time, keyed so a gap he has already answered never comes
// back. Same discipline as the coach findings: raise once, never stack.
export async function raiseReadNext(vaultPath, deps = {}) {
  const now = deps.now ? new Date(deps.now) : new Date();
  const { createRecord, listRecords } = deps.store || await import('./inboxStore.js');
  const pages = deps.pages ? await deps.pages() : await (async () => {
    const { Vault } = await import('./vault.js');
    return new Vault(vaultPath).listPages();
  })();

  const gaps = findReadNextGaps(pages);
  if (!gaps.length) return { raised: null, gaps: 0 };

  const records = await listRecords();
  // never more than one open at a time — a reading list is not a proposal
  if (records.some((r) => r.kind === 'read-next' && r.status === 'pending')) return { raised: null, gaps: gaps.length };

  const pick = gaps.map((g) => readNextEligible(g, records)).find((e) => e.eligible);
  if (!pick) return { raised: null, gaps: gaps.length };
  const gap = pick.gap;

  const titleOf = new Map(pages.map((p) => [p.id, p.title]));
  const line = readNextLine(gap, gap.sourceIds.map((id) => titleOf.get(id))) + (pick.history ? ` ${pick.history}` : '');
  const { randomUUID } = await import('node:crypto');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'read-next',
    findingKey: gap.key,
    source: 'librarian',
    mode: 'draft',
    status: 'pending',
    text: `Librarian: ${line}`,
    nudges: 0,
    createdAt: now.toISOString(),
    lastRaisedAt: now.toISOString(),
    meta: { concept: gap.concept, sourceCount: gap.sourceCount, state: gap.state },
  });
  return { raised: record, gaps: gaps.length };
}

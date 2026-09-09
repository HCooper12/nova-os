// WHAT SURVIVES INTO THE ANSWER — the sieve, and who is trusted.
//
// Recall returns six things. Until now all six were decided by lexical score
// alone, and MEASURED against his real vault on 9 Sep 2026 that produced this:
//
//   raw share of all recall slots : 47%  (37 of 78, over 14 real queries)
//   queries whose TOP hit is raw  : 10 of 14
//
// `raw` is everything under `Raw/` — transcript dumps, most of them titled
// "Original - 0974b9aa". They are long, so they contain every word, so they
// win a term-frequency race against the short hand-written note that actually
// answers the question. Asking about training led with a transcript ten times
// out of fourteen.
//
// Two rules fix it, and neither needs a model:
//
//   THE SIEVE. Bulk sources may take at most HALF the slots. Borrowed from
//   Darwin (design/DARWIN-STUDY.md §14) and kept because it is right: an
//   archive must not steamroll the notes he wrote himself. If nothing but
//   transcripts match, transcripts still come back — the sieve caps a
//   majority, it never manufactures an empty result.
//
//   TRUST. A transcript is a RECORD, not a CONCLUSION. It carries whatever was
//   said, including what turned out to be wrong, so it must clear a higher bar
//   than a page he wrote and stands behind. Expressed as a multiplier, not a
//   tier, so a genuinely better transcript match still wins — it just has to
//   be genuinely better.
//
// Pure functions, no I/O, so the ranking is testable and explainable. When
// semantic recall lands it ranks the blended candidates through here too:
// meaning changes which hits are FOUND, not which are TRUSTED.

// Everything under `Raw/` — the Watcher's transcripts and pasted source text.
// `vault.js` stamps this type from the top folder, so it needs no frontmatter.
export const BULK_TYPES = new Set(['raw']);

// A transcript needs ~33% more lexical score than a note to outrank it
// (1 / 0.75). Chosen to be felt but not decisive: it re-orders ties and near
// ties, and leaves a clear winner alone.
export const BULK_TRUST = 0.75;

export function isBulk(hit) {
  return BULK_TYPES.has(hit?.type);
}

// The trust multiplier for one hit. Exported so a caller can explain a
// ranking rather than assert it.
export function trustFor(hit) {
  return isBulk(hit) ? BULK_TRUST : 1;
}

// Score after trust. Kept separate from `score` on the returned object so the
// raw lexical score stays visible to anything that reads it.
export function trustedScore(hit) {
  return (hit?.score || 0) * trustFor(hit);
}

// THE SIEVE. Take `limit` hits, letting bulk fill at most half of them —
// but never return fewer than `limit` when non-bulk candidates have run out.
//
// `candidates` must already be ordered best-first. Returns a new array.
export function sieve(candidates, limit) {
  if (!Array.isArray(candidates) || limit <= 0) return [];
  const cap = Math.floor(limit / 2);

  const kept = [];
  const deferred = [];
  let bulkKept = 0;

  for (const hit of candidates) {
    if (kept.length >= limit) break;
    if (isBulk(hit)) {
      if (bulkKept >= cap) { deferred.push(hit); continue; }
      bulkKept++;
    }
    kept.push(hit);
  }

  // Nothing else matched — honest degradation beats an artificially short
  // answer, so the deferred transcripts backfill the empty slots in order.
  for (const hit of deferred) {
    if (kept.length >= limit) break;
    kept.push(hit);
  }

  return kept;
}

// The whole ranking: trust re-orders, then the sieve fills. `candidates` is an
// over-fetched, best-first list; the caller decides how deep to over-fetch.
export function rankRecall(candidates, limit) {
  if (!Array.isArray(candidates) || limit <= 0) return [];
  // Stable: equal trusted scores keep the order the lexical pass gave them,
  // which is already score-then-recency.
  const ordered = candidates
    .map((hit, i) => ({ hit, i, t: trustedScore(hit) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.hit);
  return sieve(ordered, limit);
}

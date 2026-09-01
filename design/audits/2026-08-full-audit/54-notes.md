# 54 — Notes

Audited 2026-09-01. Read-only. Files opened: `src/vals/valsNotes.js`
(1-100 + return block structure), Notes.jsx + vault.js/noteSummaries
[mapped — the browser render + the page scanner + the summary cache with
its boot pruner (index.js, read at setup)]. Phone-width carried ([45]).

## 1. What it is (verified)

The vault browser: type filters built from the REAL types present, search,
the reader, plus the shared domains it feeds — the concept-review pick
(Mission Control's card) and the journal day-grouping with its category
filter.

- **Intent prefetch with its cost analysis in the comment** (23-28): the
  note body starts loading on pointerdown — "the reader is usually
  already filled by the time the tap registers" — with the scroll-gesture
  cost honestly weighed ("at worst one small cached GET per flick; the
  read is free and the write path is untouched").
- **The error sentinel "must never masquerade as a loaded note"** (35-36)
  — a failed detail renders as failed, not empty.
- **Review-card states are four-way honest** (93-99): live pick /
  summarizing… / add-concepts-to-start / "Offline — your daily review
  returns on the next sync" — with the scripted demo strictly demo-gated.
- Journal sections humanised ("Reflection on [[X]]" → "Concept reflection
  — X") and category-filtered; empty days drop out.

## 2-4. Trace / Pros / Cons

He types in search → rows filter → his finger lands on a row → the body
is already loading → the tap opens a filled reader. Pros: the prefetch
pattern (perceived-latency engineering with the trade documented); honest
four-way review states; real-types-only filters. Cons: none new — the
client-side review-pick hash is the [05]/[45] twin, already tracked with
its pinning test planned and its naming collision owned by 45.

## 5. Mission test

**Daily: earns its keep as the vault's reading room** — fast enough that
browsing the second brain feels native, which is what keeps the vault a
place he actually visits rather than a write-only archive.

## 6-7. Plan / UI

- **[Owned]** [05]'s hash-twin test; [45]'s renaming. Nothing else.

## 8. Verdict

**Keep as-is** — seventeenth clean keep; the prefetch comment alone is a
model of engineering honesty.

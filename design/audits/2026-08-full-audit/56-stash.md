# 56 — Stash

Audited 2026-09-01. Read-only. Files opened: `server/lib/stash.js`
(header + structure), `src/vals/valsMisc.js` stash section, Stash.jsx +
routes [mapped]. The 'stash' capture route's never-invent-URL contract
verified at 04. Phone-width carried ([45]).

## 1. What it is (verified)

Categorised links to come back to — "products to restock, references to
revisit, anything with a URL worth keeping one tap away." One source of
truth in the vault (Wiki/Library/Stash.md) "so Obsidian can read/edit it
too; this module is the single writer" — with the format contract stated
in the header in rule 7's own words: "change every reader/writer or
none." URL validation on add; new categories append at the end "so
vault-side ordering is preserved"; captures reach it via the classifier
route whose contract forbids inventing or fixing URLs (04). Standard
demo/offline header states.

## 2-5. Trace / Pros / Cons / Mission

"Stash this face wash under skincare <url>" → the capture files a stash
record → approve → the line lands under ## Skincare, one tap from the
screen. Pros: rule 7 stated as the header; single-writer discipline;
vault ordering respected. Cons: none. Rejected candidate: a dead-link
checker — a personal stash's links age at his pace, and a checker would
be maintenance theatre (drift).

Mission: **on-demand utility** — the one-tap-away promise kept, in a
page he owns.

## 6-8. Plan / UI / Verdict

Nothing proposed. **Keep as-is** — nineteenth clean keep.

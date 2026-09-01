# 57 — Ops (the machinery made visible)

Audited 2026-09-01. Read-only. Files opened: `src/vals/valsOps.js`
(1-199 — also drives Ambient, making item 61 largely pre-read),
`server/lib/ops.js` (9-67 + structure), Ops.jsx/streamFeed [mapped].
Phone-width carried ([45]).

## 1. What it is (verified)

"Every number here came from /api/ops (records + heartbeats); this file
only arranges. Missing data renders as missing" — the fleet on a ring
around the core, per-agent detail (skills owned + last receipts),
channels (how he reaches Nova) and connections (what Nova's hands touch,
from the server's own env truth), the Forge door, and the Stream.

- **Every gap states itself** (135-167): "no skills mapped yet" /
  "registry unavailable" / "leaves heartbeats, not inbox records" / "no
  receipts yet" / "never run" — the [18] three-state instinct as a UI
  discipline.
- **The Forge door's field names "read off a real job file, not
  assumed"** (65-67); costs show only when real; absent proof "is normal
  and must not render a broken image".
- **fleetRosterContext derives from the REAL arrays** — with its own
  incident noted ("a hardcoded list here once silently omitted an agent
  the Ops screen was already showing") — so "how do you work?" answers
  from the same roster the screen draws.

## 2. The [22] fix's donor, found

ops.js's SCHEDULED roster (29 entries, 10-46) carries the platform's
roster-drift history IN ITS COMMENTS: "These three beat but were absent
from the roster, so the fleet ring never showed them and Nova could not
name them when asked how it works. And these two ran with no heartbeat
at all — invisible to both the ring and the Guardian's staleness watch…
exactly the failure class that cost three days this week."

**[22] plan 1 sharpens accordingly**: Guardian's 13-entry
LOOP_CADENCE_HOURS should not derive from raw heartbeat keys alone — it
should SHARE this SCHEDULED registry (export it, add per-loop cadences),
making one roster serve the ring, the self-knowledge block, and the
staleness watch. One list, three consumers, and the drift class ends for
all of them at once.

Small completeness note: CONVERSATIONAL (60-66) covers
voice/coach/research/video/forge — study, scout, and read-next records
attribute to no card on the ring; three match-lines close it.

## 3-4. Pros / Cons

Pros: gaps-state-themselves throughout; env-truth connections; the
real-job-file discipline; the roster deriving self-knowledge.
Cons: the CONVERSATIONAL three-line gap; this is also the landing site
for [16]'s last-night line, [18]'s couldn't-look state, and [29]'s
ledger view — all owned there.

## 5. Mission test

**Weekly / when-something's-odd: the trust console** — the ring, the
receipts, and the honest gaps are how "is Nova actually working?" gets
answered without ssh.

## 6. Improvement plan

1. **[Sharpens 22 plan 1]** Export SCHEDULED (+cadences) as THE shared
   registry; Guardian consumes it. **Impact/effort:** H / M-L (was M-L
   on a weaker design).
2. **[Refine]** Three CONVERSATIONAL match-lines (study/scout/read-next).
   **Impact/effort:** L / L.
3. **[Owned landings]** [16]/[18]/[29] lines arrive here.

## 7-8. UI / Verdict

UI: none new. **Keep as-is** — and the audit's best example of a screen
whose comments solved another module's problem: the [22] registry lives
here already.

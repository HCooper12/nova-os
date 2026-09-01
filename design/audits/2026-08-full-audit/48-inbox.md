# 48 — Inbox (the gate)

Audited 2026-08-31. Read-only. Files opened: `src/vals/valsInbox.js`
(1-140 this pass + 250-520 across items 02/03/23; ~601 lines, the most
audit-visited file in the client), `src/screens/Inbox.jsx` +
IngestModal/IngestReview [mapped — render layers over the vals]. The
server rails behind every card were audited across items 01-43.
Phone-width: carried ([45]).

## 1. What it is (verified)

The platform's gate: the capture composer, the filing-mode trust ladder,
pending approvals, history with undo, the loops section (review /
meal-prep / todoist / guardian / dispatch cards), and the ingest review.

- **Per-route badges and previews** for every one of ~25 record kinds —
  including two-files honesty ("approving writes TWO files — the badge
  says so" on watch-note, :49-50) and **tap-to-expand full payloads**:
  "what approving will actually write, uncompressed" (119-135).
- **The mode ladder** (review-all / auto-high / auto-all) with honest
  hints ("full autonomy — history and undo keep the receipts") — and a
  **client-side proposal engine** that is the Trust Ladder's inbox-lane
  twin: "every nudge is grounded in real history", including the
  step-BACK proposal ("N of Nova's last M auto-filings had to be undone —
  step back to reviewing the uncertain ones?", 160-195). Bidirectional
  autonomy, mirrored here for captures.
- **Why-chips on advice kinds** (02/03's reads), retry affordances,
  DEEP WEAVE on videos, model-choice cards with their own meta table and
  the reasoning for it (53-58).
- **A real-browser-reproduced bug documented at its fix** (60-68): the
  caller-vs-onClick MouseEvent bug that made three buttons silently do
  nothing — "Reproduced in a real browser before fixing" — the
  verification culture again.

## 2. Current workflow, traced

A thought → the composer → classify → the pending card shows the badge,
reason, and preview; tap expands to the uncompressed filing → approve →
history with undo. The loops section carries each agent's config +
status card ([02]'s honest review states verified). After a streak of
undone auto-filings, the engine itself proposes stepping his own
autonomy back down.

Failure modes: every card state audited at its owning item renders here
honestly (error-with-retry, classifying, expired). This surface's gaps
are all landings:
- [02] review why-chips + [06] plan-today why-chips (extending the
  advice set).
- [03] the fuel-cross card's missing draft-fix action.
- [20] skipped-lines in the import reason.
- [23] the ephemeral proposals rail (owned there — becomes records).
- History pagination/virtualisation at scale [Unverified minor — the
  memoized-per-ISO comment (:139) shows perf was considered].

## 3. Pros — what genuinely works

- **The uncompressed-payload expand** — consent means seeing exactly
  what will be written; this is the gate's honesty made literal.
- **The client-side step-back engine** — the inbox proposes reducing its
  OWN autonomy from real undo history; rule 6's bidirectionality in a
  second, independent implementation.
- **Route-complete badge/preview coverage** — 25 kinds, no generic
  fallbacks that hide what a thing is.
- **Documented real-browser repro** at the bug site.

## 4. Cons and gaps (ranked)

1. **The landings list above** — five owned fixes whose UI halves arrive
   here.
2. **Two autonomy engines** ([29] server-side agent-mode vs this
   client-side inbox-mode ladder) — deliberate twins with different
   stores; flagged to the synthesis for a consistency decision, not a
   bug.
3. Phone-width carried.

## 5. Mission test

**Daily: the trust gate itself** — every agent's output passes through
this screen, and its honesty features (uncompressed payloads, receipts,
undo, step-back) are why the trust ladder can exist at all. The
mission's "receipts for everything" lives here.

## 6. Improvement plan

1. **[Owned landings]** 02/03/06/20/23's UI halves, as specified in
   those reports.
2. **[Synthesis flag]** unify or explicitly twin the two autonomy
   engines' designs.
3. **[Verify]** history behavior at 500+ records; phone-width pass.

## 7. UI recommendations

- **None new** — the gate already renders what the audit spent 43 items
  asking agents to provide.

## 8. Verdict

**Keep as-is** — eleventh clean keep; the gate's honesty features are
the platform's trust story rendered. Next action: land the five owned
UI halves in one pass.

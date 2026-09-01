# 30 — Librarian (read-next + the book dossier)

Audited 2026-08-31. Read-only. Files opened: `server/lib/readNext.js`
(full, 166 lines), `server/lib/librarian.js` (full, 181 lines); the Monday
raise site (coachCadence.js:243-250, item 01), approve-as-noted
(inbox.js:1194-1197, item 03). The dossier's ingest/weave pipeline
(staging, diff, approval, undo) is lib/ingest.js — deferred to item 33
(Watcher), whose rail it shares by design. Entry-point UI for book runs
deferred to item 53 (Library). Tests: prompt tests pin the anti-piracy
rules per the header (16-17); readNext pure functions exported for tests.

## 1. What it is (verified)

One agent, two halves:

- **Read Next** (readNext.js) — the graph drives acquisition: find
  concepts that ≥2 distinct sources link but which have no page or only a
  stub (<400 chars). Deterministic; "code finds the gap and code ranks it"
  — and it NAMES THE GAP, never a book: "'you have four sources circling
  deliberate practice and no page on it' is a true statement about his
  vault, whereas 'you should read X' would be a guess about the world"
  (1-13). Links resolve the way Obsidian does (filename first — the
  renamed-page false positive from his real vault documented, 53-62);
  person-shaped missing links are refused with both the incident ("Leila
  (Hormozi's wife)") and the over-correction (a draft that suppressed
  every real concept) recorded (25-45). One proposal open at a time — "a
  reading list is not a proposal" (140); raised Mondays in the cadence
  window; approve = noted (no write — only he can decide what to buy).
- **The book dossier** (librarian.js) — title + author → a triangulated
  research dossier that rides the SAME ingest weave as videos ("one rail,
  one review UI, one undo story", 9-11). The prompt is designed around
  its failure modes, each with a counter-rule (19-22): not-read honesty
  (rule 1, stamped in the dossier header and the page provenance),
  anti-piracy (rule 2, pinned by prompt tests), quote limits, a
  triangulation authority order with single-source marking, never-invent-
  resolution ("a gap filled with plausible filler poisons his vault"),
  claims-vs-ideas with evidence notes. `bookKey` canonical identity so
  re-runs DEEPEN existing pages instead of forking (31-58); a dossier
  missing its skeleton is refused, not woven (135-139); researched-vs-read
  provenance "must never wear each other's label" with the reading
  lifecycle attached (148-168); connection hooks are hypotheses tested
  against pages that actually exist, and contradictions get a sentence on
  BOTH pages (166).

## 2. Current workflow, traced

Monday: three of his sources all link [[Deliberate Practice]]; the page is
a 120-char stub → one pending card: "3 of your sources (…) keep reaching
for Deliberate Practice, and you have a page for it, but it is 120
characters — a placeholder, not an understanding." He approves (= noted)
and separately asks the Librarian for "Peak — Ericsson" → $4-capped
research run → skeleton-checked dossier → the ingest weave stages, diffs,
and lands it for approval with provenance: researched, reading:
want-to-read.

Failure modes, as they degrade today:
- No gaps / all raised → quiet (`gaps: 0` receipt to the caller). **Honest.**
- Person-shaped missing link → refused, with the trade documented. **Honest.**
- Dossier without skeleton → refused before weaving. **Honest.**
- Junk model output → rejected with stderr context. **Honest.**
- **A raised gap never returns** (137: seen = every read-next record,
  any status, forever): a concept he noted-and-ignored stays invisible
  even when three MORE sources pile onto it a year later — the
  respect-the-no family's sixth site, here with no material-change
  escape.
- **The two halves don't know each other**: accepting a gap ends the
  interaction — nothing offers to research the gap; he must remember to
  invoke the Researcher or Librarian himself. The agent that finds the
  hole and the agent that fills holes share a name and no wiring.
- Monday-only raise → [12] class (the cadence-window site already
  counted at 18).
- **CROSS-CUTTING, found here** (27-28): "--allowedTools is not enforced
  under bypassPermissions … the DISALLOWED list is the real boundary."
  This lane is correctly disallowed-list-guarded — but healthInsight
  (item 11), coachReflection (16), and scanStatement (20) all pass
  allowedTools with NO disallowed list (verified against those items'
  reads). If this comment is accurate, three model lanes believed to be
  read-only/composition-only are actually unboundaried, Write and Bash
  included. **The audit's most safety-critical discovery; raised to the
  index as an urgent sweep.**

## 3. Pros — what genuinely works

- **"Name the gap, never the book"** — the cleanest epistemics in the
  fleet: every claim the feature makes is a checkable statement about his
  own vault.
- **The failure-mode-first prompt** — the Librarian's prompt is built
  from the ways it fails, with the anti-piracy contract pinned by tests
  and honesty stamped into provenance the vault carries forever.
- **Researched vs read as load-bearing metadata** — "Nova reading ABOUT
  a book is not him reading it"; pages inherit the humility, and his own
  copy later DEEPENS rather than duplicates (bookKey + deepen-don't-fork).
- **One-at-a-time raising with the reason** ("a reading list is not a
  proposal") and evidence-first phrasing in his own casing.
- **Real-incident documentation density** — the renamed-page bug, the
  spouse recommendation, the suppressed-concepts over-correction: three
  lessons, all encoded where they happened.

## 4. Cons and gaps (ranked by real-life cost)

1. **The allowedTools boundary discovery** — not this lane's flaw (it's
   the lane that documents and handles it correctly) but this audit
   item's most important output; the sweep belongs to the synthesis and
   an urgent fix pass.
2. **The two halves are unwired** — gap found, gap never filled unless he
   carries it by hand. Mission axis: the knowledge loop's last step is
   manual.
3. **Gaps never re-raise on new evidence** — respect-the-no family, 6th
   site; here the "no" wasn't even a no (approve = noted) and still
   silences forever.
4. Monday-only raise window ([12], shared fix with the cadence sites).

## 5. Mission test

**Monthly/long-term: among the strongest in the fleet** — the vault
telling him what it's missing is the second brain becoming self-directed,
and the dossier pipeline turns a purchase decision into compounding,
provenance-honest knowledge. **Weekly:** one gap card at most. **Daily:
n/a by design.** The mission leak is con 2: discovery without a path to
acquisition leaves the loop's final step on his memory.

## 6. Improvement plan (ranked; uncapped)

1. **[Platform, urgent] The disallowed-list sweep.**
   - **Proposal:** verify librarian.js:27-28's claim once (a scratch spawn
     under bypassPermissions attempting a Write with only allowedTools
     set); if confirmed, add the standard disallowed list to
     healthInsight, coachReflection, and scanStatement (and grep every
     spawn for allowedTools-without-disallowed). One shared
     SPAWN_BOUNDARY constant ends the class.
   - **Doctrine:** rule 1's enforcement layer — "never let a model's
     output write unmediated" is only true if the boundary is real.
   - **Impact/effort:** H / L. **Verification:** the scratch spawn test +
     the grep sweep, then per-lane arg tests.
2. **[Add] Wire the halves: gap → research → book.**
   - **Proposal:** an accepted read-next gains one optional action:
     dispatch the existing Researcher ("the best-regarded books on
     ${concept}, cited") — its brief lands pending as usual; from there
     the Library's add-book flow (with title+author now in hand) is one
     step. No new lanes; two existing rails joined by one button and a
     prefilled question.
   - **Doctrine:** rules 5 (still his explicit tap), 7 (existing rails).
   - **Impact/effort:** M-H / M.
   - **Verification:** tap-through on scratch; the dispatched question
     carries the concept verbatim.
3. **[Refine] Material-change re-raise for gaps** — a gap re-raises when
   its sourceCount has grown ≥2 since it was last raised, history in the
   line ("noted in June at 3 sources; now 5"). The shared respect-the-no
   helper's sixth consumer.
   - **Impact/effort:** M / L (once the [29] helper exists).
4. **[Refine] Raise window** — rides the cadence-window fix ([12]).

## 7. UI recommendations

Where output lands: the read-next Inbox card (drawn via briefDecisions),
the dossier's ingest review UI (item 33's rail), Library screen (53).

- **The "research this gap" action on the read-next card** (plan 2) is
  the one UI change, and it's a button on an existing card. What changes:
  the vault's self-identified holes start getting filled the same week
  instead of when he remembers.
- Nothing else — provenance chips and reading-lifecycle rendering belong
  to item 53's pass.

## 8. Verdict

**Keep as-is / Refine** — the fleet's best epistemics on both halves, one
missing wire between them, and — incidentally — the audit's most
important safety discovery documented in its margins. Highest-value next
action: **the disallowed-list sweep** (plan item 1) — one comment in this
file says three other lanes' boundaries aren't real; prove it and close
it.

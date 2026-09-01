# 25 — Studio

Audited 2026-08-31. Read-only. Files opened: `server/routes/studio.js`
(full), `server/lib/studio.js` (full, 137 lines); the idea-capture route
(inbox 'idea' → Wiki/Studio/Ideas pages with the status pipeline) and the
idea-outline undo ("removed the appended outline") were read at items
19-20; the outline trigger from the client (draftIdeaOutline) at item 23's
read. taste.js internals [Inferred from usage — his content-taste context].
Tests: studio.test.js exists. Deferrals: the Studio board UI (Notes-family
screens, 51/53), overnight-queued outlines (43), stale-idea aging (flagged
to 27 Compost — aging content is its domain).

## 1. What it is (verified)

The idea pipeline, deliberately small (14-17):

- **Status moves** (seed → outlining → scripting → shipped): one-tap
  frontmatter edits with backupFile-first and an updated stamp (39-52) —
  deterministic, broadcast, nothing else.
- **The outline drafter**: on-demand only ("never scheduled, always
  requested"); refuse-before-record on a switched-off lane (78 — the [24]
  pattern, present); an in-flight record that flips to pending exactly
  like research (74-76). The prompt works from HIS vault and voice — the
  idea page, related notes searched by key terms, his taste context, and
  the org block because "his standing corrections about tone and wording
  are exactly the rules it must not miss" (91-96) — and must end with
  "Drawn from: …" naming the vault notes used or saying plainly that
  nothing related exists (55-69). Approval appends to the idea page with
  a precise undo; read-only tools, pinned model, $1 budget.

## 2. Current workflow, traced

He taps "draft an outline" on a seed idea → lane check → record
`classifying` → the model reads the idea page + related notes through his
taste and standing rules → hook / 3-6 beats / closing / Drawn-from →
pending card → approve → appended to the idea page (undoable); he moves
the status to `outlining` with one tap (backed up, stamped).

Failure modes, as they degrade today:
- Lane off → refused pre-record. **Honest.**
- Junk/empty outline → error record. **Honest** — though studio errors
  have no Inbox RETRY affordance (canRetry covers research/video/study);
  the origin button on the idea page serves as the retry, so no finding.
- Status write → backup-first. **Honest.**
- **No runtime watchdog** — spawn-and-settle family member #6 ([24]
  cross-cutting); a hung outline sits `classifying` until boot.
- **"Drawn from" is demanded, never checked** (unlike research's
  deterministic citation refusal) — an outline can file as pending
  without the section, and the vault-grounding contract rests on the
  prompt alone.
- **The format guess parses raw text with a regex** (97:
  `page.raw.match(/format:\s*(\w+)/)`) while gray-matter — already
  imported and used eight lines up — holds the parsed frontmatter. A
  fragile twin-parse of data the module already has properly.

## 3. Pros — what genuinely works

- **Taste + standing-rules grounding** — the one lane writing in his
  voice is the one lane that loads his voice rules; the comment says why.
- **The Drawn-from contract** (even unenforced) makes vault-grounding
  visible and auditable at approval time — "nothing related in the vault
  yet" is an honest answer the prompt explicitly permits.
- **Backup-first frontmatter moves** — even a one-line status change
  respects the snapshot doctrine.
- **Right-sized**: two endpoints, one model call, no scheduler, no state
  file. The lane does exactly what the content pipeline needs and nothing
  it doesn't.

## 4. Cons and gaps (ranked by real-life cost)

1. **The vault-grounding contract is prompt-only** — one cheap
   deterministic check (a Drawn-from section exists) would give the
   outline the same structural honesty research briefs get.
2. **Watchdog family member** — covered by the shared settle-timeout
   helper when it lands ([24] plan 2).
3. **Raw-regex frontmatter read beside a proper parser** — hygiene.
4. **Nothing notices a stalled pipeline** — an idea sitting in
   `outlining` for six weeks is invisible to every noticer; flagged to
   item 27 (Compost) rather than built here, since aging vault content is
   its whole domain.

## 5. Mission test

**On-demand (content days): earns its keep** — an outline built from his
own notes and taste, gated by his approval, is the difference between a
content assistant and a generic one; the status pipeline gives the board
its truth. **Weekly/monthly:** the pipeline statuses are the record of
what's moving; the stalled-idea gap (con 4) is where monthly value leaks,
and its fix belongs to Compost. **Long-term:** ideas and outlines
accumulate in the vault, in his voice.

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE; the stalled-idea ADD is flagged to 27.

1. **[Refine] Enforce the Drawn-from contract.**
   - **Proposal:** before flipping to pending, require /drawn from/i in
     the body (the research-gate shape, one line); missing → error with
     the honest reason, origin-button retry available.
   - **Doctrine:** rule 4; parity with the lane's own sibling.
   - **Impact/effort:** M / L.
   - **Verification:** unit test both branches.
2. **[Refine] Watchdog** — adopt the shared settle-timeout helper when
   [24] plan 2 lands. **Impact/effort:** L / trivial then.
3. **[Refine] Parse format from frontmatter data** — `matter(raw).data
   .format` instead of the raw regex; one-line, removes the twin-parse.
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the idea pages (vault), the Inbox outline card, the
Studio board. Screened against dashboard drift:

- **None here** — the board and idea rendering are items 51/53's pass;
  the outline card already carries approve/discard and the append-undo.

## 8. Verdict

**Keep as-is / Refine** — a right-sized on-demand lane whose voice
grounding is its differentiator; three small tightenings and one flag
passed to Compost. Highest-value next action: **enforce the Drawn-from
contract** (plan item 1) — the lane's honesty claim, made structural for
one line of code.

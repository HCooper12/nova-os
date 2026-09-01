# 24 — Researcher

Audited 2026-08-31. Read-only. Files opened: `server/lib/researcher.js`
(full, 158 lines); entry points verified at earlier items: the RESEARCH
directive + model-choice gate + overnight enqueue (claudeCode.js:422-465,
item 04), POST /research (inbox routes, item 23's read), inbox retry
affordance (canRetry includes research, item 02). Tests: researcher.test.js
+ retry/reaper coverage. Deferrals: overnight queue (43), Scout — which
builds on this lane (36), the sources-panel rendering (47).

## 1. What it is (verified)

Nova's first outside-reaching agent, with every boundary structural
(10-14): runs ONLY on an explicit ask (never classifier-triggered — rule 5
made literal); tools are web-read-only (WebSearch/WebFetch/Read, everything
else disallowed including Grep/Glob); and the brief ALWAYS lands pending —
"nothing it produces files itself."

- **The contract** (28-43): every claim carries a numbered citation, a
  Sources section lists them, disagreements noted not averaged, gaps
  stated, ~250-400 words, timeless phrasing for the vault.
- **Enforcement is deterministic** (63-69): `normalizeResearch` refuses a
  brief with no `[n]` markers or no Sources section — "refusing to file
  unsourced claims."
- **Lifecycle**: lane-off refuses BEFORE the record exists ("a switched-off
  lane must not leave a record sitting in 'classifying' that nothing will
  ever resolve", 80-82); the record carries its whole question in its text
  so a failed run retries in place (97-106); the model-choice gate's
  per-run answer overrides the lane default for that job only, documented
  (71-74, 117-123); $1 budget; the launchd-MCP constraint noted (115).
- **Where output lands**: pending Inbox note (route `note`, standard undo),
  the conversation's sources panel, and — for "tonight" asks — the
  overnight queue.

## 2. Current workflow, traced

"Research whether creatine timing matters" (spoken) → Ask Nova emits the
RESEARCH directive → the model-choice gate asks Opus or Sonnet → dispatch →
record `classifying` shows in-flight in the queue → the job searches,
returns JSON → normalizeResearch validates citations exist → `pending` with
the brief as a note payload → he reviews the sources → approve files it
into the vault. A failed run shows error with a RETRY that re-fires the
same record.

Failure modes, as they degrade today:
- Unsourced brief → refused with a named error, record errors, retryable.
  **Honest — the fleet's only deterministic citation gate.**
- Lane off → refused pre-record. **Honest.**
- Junk output/no JSON → error record. **Honest.**
- Server restart mid-run → boot reaper flips the orphan. **Honest at
  boot** — but **no runtime watchdog exists**: a hung web fetch mid-day
  leaves the record `classifying` indefinitely (the budget cap bounds
  spend, not time) until the next restart.
- **The citation gate is shallow** (67): one `[1]` anywhere plus the word
  "sources" passes — a brief with six claims and one citation, or numbered
  claims whose numbers don't exist in the list, or sources without URLs,
  all file as "citation-required" research.
- **Retry drops the gate's model choice** (104): a failed Opus-chosen run
  silently retries on the lane default — the one place the per-run answer
  doesn't stick.

## 3. Pros — what genuinely works

- **The boundary trio** (explicit trigger / web-read-only / always-pending)
  is doctrine rule 5's reference implementation, stated in the header and
  true in the flags.
- **Refuse-before-record** — the classifying-orphan lesson designed out of
  the entry path, not reaped after.
- **Retry-in-place from the record's own text** — no side-channel state,
  the record IS the job spec.
- **The deterministic citation refusal** — even shallow, it is the only
  lane in the fleet that structurally rejects its own model's unsourced
  output.
- **The model-choice gate contract documented at the pin site** with the
  ambient-default lesson.

## 4. Cons and gaps (ranked by real-life cost)

1. **Shallow citation validation** — the gate that gives this lane its
   authority checks presence, not integrity; mismatched numbers and
   URL-less sources pass.
2. **No runtime watchdog** — a hung job is invisible until a restart;
   `classifying` has no age limit.
3. **Retry loses the model override** — small, verified, contradicts the
   gate's promise.
4. Nothing else at this size. Rejected as non-findings: same-question
   dedupe (explicit trigger means twice is his call to make and his money
   to spend) and any auto-research trigger (rule 5 exists precisely to
   forbid it).

## 5. Mission test

**On-demand (daily when used): earns its keep** — cited, gap-honest
knowledge into the vault with his review as the gate; the overnight path
makes "queue it for tonight" real. **Weekly/monthly/long-term:** compounds
through the vault itself (notes, and Scout/Librarian building on the same
lane). The lane's value scales with trust in its citations — which is
exactly what cons 1 holds down.

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE — the lane's shape is the reference
implementation; only its guarantees need tightening.

1. **[Refine] Citation integrity validation.**
   - **Proposal:** extend normalizeResearch deterministically: collect all
     `[n]` markers in the body; require every n to appear as a numbered
     line in the Sources section carrying an http(s) URL; require ≥1
     citation per key-point block (cheap heuristic: every list item
     contains a marker). Failures name what's missing ("claims cite [3]
     but Sources lists 2 entries"), record errors, retry available.
   - **Doctrine:** rule 4; the lane's own founding contract, enforced as
     deeply as code can without a second model call.
   - **Impact/effort:** M-H / L.
   - **Verification:** unit tests per failure shape; replay against real
     past briefs on the rails to confirm current output passes.
2. **[Refine] Runtime watchdog.**
   - **Proposal:** a settle timer (~10 min) in runResearchJob that kills
     the child and errors the record ("research timed out — retry
     available"); the same helper serves every spawn-and-settle lane
     (review/plan/debrief/insight share the shape — note the twins).
   - **Doctrine:** rule 4. **Impact/effort:** M / L-M.
   - **Verification:** unit test with a never-exiting stub; scratch run.
3. **[Refine] Retry preserves the model override** — store the gate's
   answer on the record (`model: 'opus'`) and pass it through
   retryResearch. **Impact/effort:** L / L.
   - **Verification:** retry test asserting the spawn args.

## 7. UI recommendations

Where output lands: the Inbox research card (retry verified), the
conversation's sources panel, the vault note. Screened against dashboard
drift:

- **None.** The card already shows in-flight/pending/error with retry; the
  sources panel is item 47's render to verify. The integrity gate (plan 1)
  improves what's on the card without changing the card.

## 8. Verdict

**Keep as-is / Refine** — doctrine rule 5's reference implementation; its
three findings are all tightenings of promises it already makes. Highest-
value next action: **citation integrity validation** (plan item 1) — the
lane's authority is its citations, and the gate should check what it
claims to guarantee.

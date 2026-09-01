# 19 — Money (the ledger)

Audited 2026-08-30. Read-only. Files opened: `server/lib/money.js` (full,
298 lines), `server/routes/money.js` (route list + scan lane, 88-152),
`server/lib/inbox.js` expense classifier contract (:60), expense filing +
duplicate honesty (620-631), undo (995). money.test.js exists. Deliberate
deferrals: the CSV drop-folder pipeline (item 20 Money Import), the monthly
report + subscription actioning (21 CFO), the statement-scan lib internals
(20 — same import rails), the Money screen (51).

## 1. What it is (verified)

The deterministic money truth layer (7-11): transactions in monthly JSON
stores under data/money (high-volume machine state, vault gets the
human-readable report — rule 3 reasoning documented), keyword
categorisation ("deliberately coarse — a wrong guess is one tap to fix"),
and arithmetic-only subscription detection.

- **Identity + idempotence**: `dedupeKey` = day|cents|normalised-merchant
  (73-79); `addTransactions` returns ONLY what was inserted "so a filing's
  receipt and undo ids can never describe rows that aren't there"
  (100-126); atomic tmp+rename writes; change broadcasts.
- **Capture**: the spoken/typed expense route with the sign convention
  taught explicitly to the classifier ("amount NEGATIVE for spending" —
  inbox.js:60); a duplicate files honestly as "already recorded (duplicate,
  nothing added)" with an empty undo (622-625).
- **Subscriptions** (195-249): same merchant (noise-stripped key), ±12%
  amount, a cadence interval (weekly→yearly with tolerances), ≥2
  occurrences; emits next-expected date and a price-rise flag. Consumed by
  the morning brief (due ≤3 days) and the month summary.
- **Budgets** (per-category, optional, atomic config), **month summary**
  with previous-month comparison per category (253-282), **AU financial-
  year CSV export** with proper escaping (288-298).
- **Statement-photo scan lane** (routes 88-130): images → model extraction
  job → transactions deduped against 26 months of ledger → ONE pending
  money-import record; zero fresh rows answers honestly with the duplicate
  count. (Internals audited at item 20 — same rails as the CSV drop.)

## 2. Current workflow, traced

"Coffee six fifty" to Nova → capture classifier → route expense, amount
-6.50, merchant Coffee, category Eating Out → approve → ledger row with
undo; saying it twice → the second files as "already recorded — nothing
added". Month-end: getMonthSummary joins spend/income/budgets/categories/
prev-month + 13 months of subscription detection; the CFO (21) writes the
report; the brief warns of subscriptions landing within 3 days.

Failure modes, as they degrade today:
- Duplicate import/capture → dropped by dedupeKey, receipt says so.
  **Honest — the platform's best idempotence design.**
- Unparseable amount/merchant → thrown at normalize with named reasons.
  **Honest.**
- Corrupt month file → read as empty (61-63) — **silent**: a damaged
  month's history vanishes from summaries with no flag anywhere ([03]
  family, low likelihood but the file IS the ledger).
- Wrong auto-category → one tap to fix on the Money screen… **and the fix
  teaches nothing** (143-155): the same merchant re-miscategorises on
  every future import; his correction never compounds.
- Two coincidental same-merchant spends ~30 days apart within 12% → a
  "monthly subscription" with a predicted next date lands in his morning
  brief (212-249 checks only the LAST interval, min 2 occurrences).
  **Plausible false fire.**

## 3. Pros — what genuinely works

- **dedupeKey as a named, exported contract** — imports, captures, scans,
  and undo all share one identity definition; re-exports and overlapping
  ranges are structurally harmless. With the returns-only-inserted rule,
  this is the reference implementation of doctrine rule 7 for data.
- **The duplicate-capture receipt** ("already recorded — nothing added",
  empty undo) — honest degradation at the exact moment double-logging
  happens in real life.
- **Coarse-with-a-cheap-fix categorisation, stated as a philosophy**
  (20-21) — the right trade for a personal ledger.
- **Sign convention in the classifier contract** — the one place a spoken
  expense could silently become income is explicitly taught.
- **The FY export** — a real-world artefact (accountant-ready CSV) from
  one deterministic function.

## 4. Cons and gaps (ranked by real-life cost)

1. **Corrections don't compound.** Re-categorising "SQ *CAFE XYZ" fixes
   one row; the keyword map never learns, so every future import of the
   same merchant repeats the error. The platform's own correct-once
   doctrine (standing instructions, progression tunes, coach learnings)
   stops at the ledger's door. Mission axis, monthly/long-term.
2. **Subscription detection reads one interval** — the last gap between
   the last two charges, min 2 occurrences. Consistency across ALL gaps is
   never checked even when 5 occurrences exist, and coincidence-pairs
   qualify. Its false fires land in the morning brief as predictions.
3. **A corrupt month file reads as an empty month** — no flag, no
   backup-read attempt; summaries and the CFO would quietly under-report.
4. **Category-list twin** between money.CATEGORIES and the classifier's
   MONEY_CATEGORIES — [Inferred import-pinned; verify at implementation,
   pin with a test if it's a copy] ([12] twins sweep).
5. Budget pace (mid-month "Groceries at 80% with 10 days left") is
   computable from this layer and surfaced nowhere — **flagged to item
   21** (CFO owns money proactivity; don't build twice).

## 5. Mission test

**Daily: earns its keep** — spoken expense capture at near-zero friction
with honest dedupe is what makes the ledger true enough to reason from.
**Weekly:** subscriptions-due in the brief; **monthly:** the summary
feeds the CFO's report and the review's money line. **Long-term:** the FY
export and 13-month windows are real archival value. The mission gap is
con 1: the ledger is the one truth layer where his corrections evaporate
instead of compounding.

## 6. Improvement plan (ranked; uncapped)

Change types: 1 ADD; 2, 3, 4, 6 REFINE; 5 flagged to 21.

1. **[Add] Merchant-override learning.**
   - **Need:** a category fix should hold for the merchant forever — the
     correct-once rail, applied to money.
   - **Proposal:** `setTransactionCategory` also writes
     `merchantKey(t.merchant) → category` into config overrides;
     `categorize` consults overrides before keywords. One map, one file,
     fully deterministic, undone by re-fixing.
   - **Doctrine:** rules 1, 6, 7 (extends the existing config store).
   - **Impact/effort:** H / M-L.
   - **Verification:** unit tests; replay his real ledger's manual
     re-categorisations to count future fixes it would have saved.
2. **[Refine] Subscription gap-consistency.**
   - **Proposal:** with ≥3 occurrences, require ALL consecutive gaps
     within the cadence tolerance (not just the last); with exactly 2,
     require either a Subscriptions-keyword merchant or identical cents.
     Tune against the real ledger first (standing memory rule) so current
     true positives all survive.
   - **Doctrine:** rule 1; confident-guess screen (a predicted charge date
     is a claim).
   - **Impact/effort:** M / M-L.
   - **Verification:** detector replay on the real 13-month ledger,
     diffing detected sets before/after.
3. **[Refine] Corrupt-month honesty.**
   - **Proposal:** on JSON parse failure, quarantine the file
     (`.corrupt-<ts>` rename), log loudly, and surface one line via the
     Guardian/ops rail ("money: 2026-06.json unreadable — quarantined");
     summaries note the gap for that month.
   - **Doctrine:** rule 4; [03] family. **Impact/effort:** M / L-M.
4. **[Refine] Pin or verify the MONEY_CATEGORIES twin** — if it's an
   import, done; if a copy, one test. **Impact/effort:** L / L.
5. **[Flagged → 21] Budget pace line** — the CFO (or evening brief) owns
   mid-month pace; the summary already computes everything needed.
6. **[Refine] Test coverage check for detectSubscriptions + dedupeKey
   edge cases** (cents rounding, punctuation-noise merchants) in
   money.test.js; add what's missing. **Impact/effort:** L-M / L.

## 7. UI recommendations

Where output lands: Money screen (item 51), Inbox expense/import cards,
brief lines. Screened against dashboard drift:

- **None here.** The one-tap category fix already exists on the Money
  screen and plan 1 makes it permanent without any UI change; the scan
  lane already answers with counts. Screen-level recommendations belong
  to item 51 with the render in front of me (standing visual-verification
  rule).

## 8. Verdict

**Keep as-is / Refine** — a disciplined deterministic truth layer with
the platform's best idempotence contract; its one structural miss is that
corrections don't compound. Highest-value next action: **merchant-override
learning** (plan item 1) — the correct-once doctrine, extended to the last
domain that lacks it.

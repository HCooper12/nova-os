# 21 — CFO (the monthly report)

Audited 2026-08-31. Read-only. Files opened: `server/lib/cfoReport.js`
(full, 83 lines); rails read at 19-20 (getMonthSummary, subscriptions,
budgets, the rails). money.test.js coverage of the report composition
unverified (plan 5). Owns item 19's budget-pace flag. Deferrals: Money
screen (51), Inbox card (48).

## 1. What it is (verified)

The month-close: on the 1st, one deterministic record covering the month
just ended (setDate(0) framing, 25-28) — spend + count + delta vs the
prior month + income; top 3 categories; over-budget categories;
subscription count with the monthly-cadence total; each detected price
rise as its own line (32-47). Empty ledger → an honest line naming the
three feed paths (34). Journal route, category system, draft mode,
month-keyed once-guard, 6-hour tick with the stalled-loop heartbeat lesson
(74). No model call anywhere; the reason line says so.

## 2. Current workflow, traced

Sept 1, first tick: no cfo record this month → summary for August → "CFO
Report — August 2026: **Spend.** $2,140 across 96 transactions — up 6% on
the month before. $4,800 came in. **Where.** Groceries $540 · Eating Out
$310 · Transport $220. **Budgets.** Over in Eating Out ($310 of $250).
**Subscriptions.** 7 recurring charges detected (~$86/month on monthlies).
**Price rise.** Spotify: $12.99 → $13.99." → pending card → approve →
journal.

Failure modes, as they degrade today:
- Empty month → honest empty-ledger line… drafted every month regardless,
  forever, **with no way to turn the CFO off** — it is the one scheduled
  agent with no mode config and no lane switch (verified: none).
- **Mac asleep on the 1st → no report until next month's 1st** (76:
  `getDate() === 1` equality) — [12] class, 4th confirmed site, and the
  month-keyed guard (16-20) makes any-day catch-up free.
- Unapproved reports linger forever — `cfo` missing from
  TIME_VALUE_HOURS (verified against the list).
- Subscription false positives (19 con 2) flow through to the report's
  count and price-rise lines — inherits 19 plan 2's fix.

## 3. Pros — what genuinely works

- **A real month-close in ~40 composing lines** — delta, distribution,
  budget verdicts, recurring-spend picture, price rises — all arithmetic,
  all sourced from the shared summary so the report can never disagree
  with the Money screen.
- **Price rises as first-class lines** — the single most actionable
  money fact a month produces, surfaced by name.
- **The empty-ledger line teaches the feed paths** instead of just
  shrugging.
- **The heartbeat comment** (74) — "a stalled CFO loop was invisible" —
  the watch-the-watcher lesson recorded at the site.

## 4. Cons and gaps (ranked by real-life cost)

1. **All money proactivity is retrospective.** Budgets exist, pace is
   computable, and nothing speaks until the month is dead — "Over in
   Eating Out" on the 1st is an autopsy, not a steer (item 19's flag,
   landing here). Mission axis: the one domain where mid-course
   correction is the entire point.
2. **Slept-through 1st costs a whole month** — the free-catch-up class
   at its most expensive cadence.
3. **No off switch** — the only scheduled agent that cannot be turned
   off or down; an unused ledger means a monthly no-data record forever.
4. **Stale reports never expire** (TIME_VALUE omission).
5. Composition tests unverified.

## 5. Mission test

**Monthly: earns its keep** — an honest, comparable close of the money
month in the journal, feeding the review/Ask Nova money lines. **Weekly/
daily: nothing — and that's the finding**, not the design: money is the
one life domain audited so far where the platform offers zero mid-course
signal (the brief's subscriptions-due line excepted). Plan 2 is the
mission upgrade: money steering while spending can still change.
**Long-term:** the journal accumulates a clean monthly series.

## 6. Improvement plan (ranked; uncapped)

Change types: 2 ADD (owns 19's flag); 1, 3, 4, 5 REFINE.

1. **[Refine] Any-day catch-up** — replace the date-equality with "no
   report exists for this calendar month yet" (the guard already keys on
   month); a report drafted on the 4th still covers the closed month
   correctly. **Impact/effort:** M-H / L.
2. **[Add] Mid-month pace check.**
   - **Proposal:** around the 16th, one deterministic pass: any budgeted
     category ≥25% over pro-rata pace → ONE informational record
     ("Eating Out $210 of $250 with 15 days left — tracking ~$420");
     price rises detected since month start ride the same record.
     Silence when everything is on pace (the quiet_reason pattern in
     state). Thresholds tuned against the real ledger first (standing
     memory rule) so it would not have fired on ordinary months.
   - **Doctrine:** rules 1, 6; anti-nag screen (one record, only when
     off-pace, monthly at most).
   - **Impact/effort:** M-H / M-L.
   - **Verification:** replay across his real ledger months counting
     would-have-fired days; unit tests on the pro-rata math.
3. **[Refine] An off ramp** — either a mode config (off/draft like every
   sibling) or, minimally, suppress drafting after two consecutive
   empty months until the ledger moves again. **Impact/effort:** M-L / L.
4. **[Refine] `'cfo': 14 * 24` in TIME_VALUE_HOURS.**
   **Impact/effort:** L / L.
5. **[Refine] Pin the composition branches** (delta present/absent,
   budgets over, price rises, empty month) if money.test.js doesn't.
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the Inbox card → journal; the Money screen shows the
live summary independently. Screened against dashboard drift:

- **The pace record IS the UI change** (plan 2) — an Inbox card at
  mid-month whose acknowledgement is the interaction. What changes: he
  slows a category while it can still finish under budget.
- Nothing else — a monthly journal artefact needs no chrome.

## 8. Verdict

**Keep as-is / Refine** — an honest month-close whose real gap is that
it only ever speaks after the month is dead. Highest-value next action:
**the mid-month pace check** (plan item 2) — the first mid-course money
signal in the platform, built entirely from arithmetic that already
exists.

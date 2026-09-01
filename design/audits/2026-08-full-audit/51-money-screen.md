# 51 — Money (screen)

Audited 2026-08-31. Read-only. Files opened: `src/vals/valsMoney.js`
(full, 120 lines), Money.jsx [mapped — render over the vals]. Rails fully
audited at 19/20/21. Phone-width carried ([45]).

## 1. What it is (verified)

The CFO's glass: month summary with budget bars, the subscription radar,
the transaction ledger, the imports pipeline, and the statement scanner —
"everything reads the deterministic ledger; every write path goes through
the inbox rails." Sidebar-count restraint stated: "a dollar figure in the
sidebar would be noise."

- **Tri-state header with its lesson attached**: demo / "OFFLINE —
  SHOWING LAST-KNOWN LEDGER" / live counts — and the comment records that
  the offline promise "used to sit above a blank page" (81-83); offline
  now renders read-only from cache.
- **Subscription radar honesty**: "overdue — may have lapsed" /
  "expected today" / soon-flags ≤3 days; price rises shown as from→to.
- **Per-transaction**: one-tap category fix ([19]'s compounding fix
  lands here invisibly), source badges (MANUAL/IMPORT/SCAN/CAPTURE),
  remove; month picker across the store's real months; the quick-add
  composer with a sign toggle; FY export labelled correctly for the AU
  year; scan states (busy/error/question) surfaced.

## 2. Current workflow, traced

He opens Money → August, 96 transactions, spend vs July delta → Eating
Out's bar sits over its budget in warn tone → Spotify shows its price
rise → a miscategorised servo fuel gets one tap → ([19] built) every
future import of that merchant follows. A statement photo → scan busy →
the model's clarifying question surfaces verbatim if confidence was low.

Failure modes: owned by the rails; surface-specific:
- Offline → read-only cache with the honest header. **Fixed and
  documented.**
- **The transaction list renders the first 120 silently** (55) — a heavy
  month shows no "+N more" ([03] silent-cap family, small).
- Budget editing uses `window.prompt` — functional everywhere but
  off-idiom with the HUD; noted as polish only.

## 3. Pros / 4. Cons

Pros: honest lapse language on subscriptions; the blank-page lesson
fixed with its comment; source badges making provenance visible per row;
restraint in the sidebar.
Cons: the 120-cap; the prompt() polish note; phone-width carried.

## 5. Mission test

**Weekly/monthly: earns its keep** — budgets, subscriptions, and the
ledger visible and correctable in one place; the one-tap category fix is
the daily-touch surface for [19]'s compounding.

## 6. Improvement plan

1. **[Refine] Honest list cap** — "showing 120 of N · older in the
   export" one-liner. **Impact/effort:** L / L.
2. **[Polish] Budget editor to the HUD idiom** when the screen is next
   touched. **Impact/effort:** L / L.
3. **[Owned]** [19] merchant-override + [21] pace record land here with
   no UI change needed.

## 7. UI recommendations

- **None beyond the above.**

## 8. Verdict

**Keep as-is** — fourteenth clean keep; a compact glass over
well-audited rails with two small polish notes.

# Nova CFO — the Money system

Every dollar lives in a local ledger (`server/data/money/`, monthly JSON —
never leaves the Mac), visible on the **Money** screen (XII). Three feed
paths, all riding the same inbox rails as everything else — proposed,
approved, undoable:

| Path | How | Friction |
|---|---|---|
| **Capture** | say/type "coffee 6.50" anywhere Nova captures | zero — classifier routes it as EXPENSE |
| **Bank CSV drop** | save a bank export into `Money/Imports` in the vault | one save; everything after is automatic |
| **Statement/receipt photo** | 📷 SCAN on the Money screen | one photo |

## The Billroo situation, honestly

Billroo doesn't expose an API — data goes **in** (Open Banking feeds, bank
CSVs) but can't be pulled **out** programmatically. So Nova can't read
Billroo. The workable move: intercept the same source Billroo drinks from.
Your bank's CSV export is the file both systems accept — **one download
feeds both**:

1. In your bank app/site, export transactions (CSV) for whatever period.
2. Save it to `Money/Imports` inside the vault (it's iCloud — on iPhone,
   Share → Save to Files → the vault's Money/Imports folder).
3. Import the same file into Billroo as you already do (optional — keep
   both, or let Nova gradually take over).

Within five minutes Nova parses it, **drops everything the ledger already
has** (imports are idempotent — overlapping date ranges are fine), and puts
one pending record in the Inbox: "23 transactions from statement.csv —
~$840 spend". Approve → filed + the CSV archives to `Money/Imports/
Processed`. Undo removes the lot. Supported shapes: headered CSVs
(date/description/amount or debit+credit columns) and headerless
CommBank-style exports — the same formats Billroo takes.

**One-tap iPhone recipe ("Bank CSV to Nova"):** Shortcuts → new shortcut →
*Receive input from Share Sheet* (Files) → **Save File** → vault →
`Money/Imports`. Then in the bank app: export → Share → "Bank CSV to Nova".
Done — Nova does the rest.

If your bank happens to be Up, say so — Up has a genuinely open personal
API and Nova could poll it directly (a token in `server/.env`, no CSVs at
all). For everything else, the CSV drop is the honest automatic path — no
bank passwords ever touch Nova.

## What the CFO does with the ledger

- **Categorises deterministically** — a keyword map (Woolies → Groceries,
  "UBER *EATS" → Eating Out…), one tap to correct on the Money screen, and
  corrections are the map's future training list.
- **Subscription radar** — two same-merchant charges at a steady interval =
  detected: cadence, next expected date, **price rises flagged**
  ($22.99 → $24.99), and monthly total. Renewals due within 3 days appear
  in your Morning Dispatch.
- **Budgets** — tap a category, set a monthly number, get honest bars
  (over-budget goes red). No judgement, just arithmetic.
- **Weekly Review line** — spend this week vs last, automatically once the
  ledger has data.
- **Monthly CFO Report** — drafted to the Inbox on the 1st covering the
  month just closed: total vs previous, top categories, budget overruns,
  subscription drift. Approve → journal, like every brief.
- **FY export** — one tap on the Money screen downloads the Australian
  financial-year CSV (July–June) for tax time.

## Boundaries

- No bank connections, no credentials, no third-party aggregators — files
  and captures you initiate, full stop.
- The model only ever reads (classifying a capture, reading a statement
  photo); deterministic code does all filing, and every filing is undoable.
- Ledger data stays in `server/data/money/` on the Mac.

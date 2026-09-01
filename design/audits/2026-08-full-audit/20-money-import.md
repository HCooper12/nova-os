# 20 — Money Import (CSV drop-folder + statement scan)

Audited 2026-08-31. Read-only. Files opened: `server/lib/moneyImport.js`
(full, 211 lines), `server/lib/scanStatement.js` (1-80; tail past :80
unread — workDir cleanup [Unverified], plan item 4), `server/lib/inbox.js`
money-import filing (634-643) + undo (995-1000), routes read at item 19
(money.js:61-130). Tests: money.test.js exists (parseBankCsv coverage
unverified — plan item 5). Deferrals: Money screen scan UI (51), Inbox
card (48).

## 1. What it is (verified)

Two mouths into one pipeline, both landing as a single pending
`money-import` record that approval files (deduped, undoable) —

- **The CSV drop folder** (moneyImport.js): every 5 minutes, scan
  `Money/Imports` in the vault (iCloud-synced — "save to folder" on the
  phone is enough; the same file Billroo takes works unchanged, 8-14).
  `parseBankCsv` (60-105) handles AU bank shapes: headered CSVs
  (date/description/amount or debit+credit), headerless CommBank
  `date,amount,description[,balance]` with a fits-or-fails-loudly guard,
  RFC-4180 quoting, DD/MM/YYYY and 2-digit years, parenthesised negatives.
  New rows (deduped against 26 months via the shared `dedupeKey` contract)
  become ONE record per file with an honest reason: "N new after dedupe
  (M already in the ledger, K unparseable lines skipped). ~$X spend."
  Nothing new → quiet archive to Processed. Broken CSV → ONE born-error
  record per file (the every-5-minutes error-spam lesson documented,
  111-113) plus exactly one push with a per-file dedupe tag (149-155).
- **The statement-photo scan** (scanStatement.js + routes): up to 3
  images → a lane-gated, pinned, budget-capped model call that only READS
  (`--allowedTools Read`), returning typed JSON with a confidence/question
  contract (unreadable photo → empty + "what I see instead");
  deterministic normalization clamps/filters rows, categories fall back to
  `categorize`; the client then files via /money/scan-file, which dedupes
  against the ledger before creating the same one-pending-record shape.
- **Filing + undo** (inbox.js): addTransactions (returns-only-inserted) →
  archive the CSV → destination says imported-count or "all already
  recorded (duplicates, nothing added)"; undo removes exactly the inserted
  ids, throws honestly on an empty-undo duplicate filing, and notes the
  archived CSV stays put.

Scheduler: 5-min tick, heartbeat `money`, Guardian-watched.

## 2. Current workflow, traced

He exports a CommBank CSV on his phone → Save to Files → Money/Imports →
within 5 minutes: parsed, 42 rows, 38 already in the ledger, 1 line
unparseable → one pending record "3 transactions from august.csv — 3 new
after dedupe (38 already in the ledger, 1 unparseable lines skipped).
~$210 spend." → approve → 3 rows in the ledger, CSV archived, undo ready.
A receipt photo: scan lane extracts one transaction, confidence high →
scan-file → same record shape → same rails.

Failure modes, as they degrade today:
- Duplicate/overlapping export → deduped, counted in the reason; a fully
  duplicate file archives silently. **Honest.**
- Garbage CSV → loud parse error → one error record + one push, never
  spammed. **The [12]-era error-dedupe lesson, done right.**
- Unreadable photo → empty transactions + a question. **Honest.**
- **Unparseable CSV lines vanish behind a count**: "1 unparseable lines
  skipped" names the loss but not the line — a bank format quirk that
  breaks the same column every export silently drops those transactions
  forever, with his approval on the record. **Counted-but-unseen.**
- **A fixed CSV can't re-scan under the same name**: pending AND error
  records block by filename (114-119) until the record is discarded by
  hand — replacing a broken file with a corrected export does nothing.
  **Honest block, annoying recovery.**
- **The scan lane silently stamps TODAY on unparseable dates**
  (scanStatement normalize): a statement page whose dates the model
  mangles lands as today's spending — a confident guess in the one field
  dedupe and summaries key on. **Silent misdating.**

## 3. Pros — what genuinely works

- **The drop-folder is doctrine rule 6 embodied**: the happy path is
  "save the file"; everything else — parse, dedupe, receipt, archive,
  undo — is automatic but review-gated. Nothing auto-files v1; the trust
  ladder holds.
- **One-record-per-file-ever including errors**, with the spam lesson
  written where it was learned — and the error push tagged per file so a
  broken CSV is worth exactly one notification.
- **The reason line carries the full accounting** (new / duplicate /
  skipped / spend) — the approval is informed, not a rubber stamp.
- **Both mouths share every rail**: dedupeKey, addTransactions,
  archive, undo, record shape — the scan lane bought a whole pipeline for
  ~97 lines because the rails existed (rule 7 paying rent).
- **parseBankCsv's fits-or-fails-loudly headerless guard** (79-81) —
  assumption checked before use, garbage rejected with a named error.

## 4. Cons and gaps (ranked by real-life cost)

1. **Skipped lines are invisible** — systematic per-export data loss can
   be approved indefinitely without anyone seeing which rows die.
2. **Same-name recovery requires manual discard** — the block key is the
   filename alone, so the natural fix (replace the file) is a no-op.
3. **Scan-lane today-stamping on bad dates** — misdated ledger rows that
   also defeat dedupe against the real transaction when it later arrives
   by CSV (different date → different key → double-counted).
4. **workDir cleanup unverified** (scanStatement tail unread) — temp
   statement images may persist in tmpdir.
5. **parseBankCsv test coverage unverified** — four format branches and
   three date shapes deserve pinning if not already pinned.

## 5. Mission test

**Weekly/monthly: earns its keep decisively** — the ledger stays true at
near-zero friction, which is the precondition for everything the CFO,
review, and brief say about money; the dedupe contract means he can never
over-import. **Daily:** the 5-minute watcher makes "drop it and forget it"
real. **Long-term:** archived CSVs + the FY export form a complete audit
trail. The gaps are all edge honesty, not architecture.

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE — the pipeline's shape is right.

1. **[Refine] Show the skipped lines.**
   - **Proposal:** carry the first 3 skipped raw lines (truncated ~80
     chars) in the record's reason and payload — "skipped: 'PENDING
     AUTH…'" — so a recurring format quirk is visible on the first
     approval, not never.
   - **Doctrine:** rule 4; the silent-cap screen (the count exists; the
     content is the honesty). **Impact/effort:** M-H / L.
   - **Verification:** unit test with a mixed-validity fixture; reason
     text asserts the lines.
2. **[Refine] Content-aware re-scan blocking.**
   - **Proposal:** the pending/error block keys on file + content hash
     (or mtime > record.createdAt): replacing a broken CSV with a
     corrected export re-scans naturally; the old error record is
     superseded (discarded with a receipt) rather than hand-cleared.
   - **Doctrine:** rules 4, 6. **Impact/effort:** M / M-L.
   - **Verification:** scratch-vault flow: broken file → error → replace
     → new pending record, old record superseded.
3. **[Refine] Scan-lane date honesty.**
   - **Proposal:** an unparseable date DROPS the row into a named list
     ("2 rows had unreadable dates — not filed") carried in the scan
     result's question/low-confidence path, never silently stamped today.
   - **Doctrine:** rule 4; confident-guess screen. **Impact/effort:**
     M / L.
   - **Verification:** unit test the normalize branch.
4. **[Refine] Verify + ensure workDir cleanup** on scan completion and
   error (read the tail; add `rm(workDir, {recursive: true})` if absent).
   **Impact/effort:** L / L.
5. **[Refine] Pin parseBankCsv's branches** (headered, headerless,
   debit/credit, garbage, three date shapes) in money.test.js if not
   already. **Impact/effort:** L-M / L.

## 7. UI recommendations

Where output lands: the Inbox money-import card, the import-fail push,
the Money screen's scan flow (51). Screened against dashboard drift:

- **Skipped-lines in the card reason** (plan 1) is the only change, and
  it rides existing text. What changes: he spots a bank-format quirk the
  first week instead of never.
- Everything else about this pipeline's UI is already right-sized: one
  card, full accounting, one failure push.

## 8. Verdict

**Keep as-is / Refine** — a model pipeline: two input mouths, one set of
rails, honest receipts, and the trust ladder intact; its flaws are three
small honesty edges at the margins. Highest-value next action: **show the
skipped lines** (plan item 1) — the one place approved data loss can hide
today.

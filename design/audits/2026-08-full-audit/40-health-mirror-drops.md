# 40 — Health Mirror + Health Drops

Audited 2026-08-31. Read-only. Files opened: `server/lib/healthMirror.js`
(full, 106 lines), `server/lib/healthDrops.js` (full, 136 lines).
healthSentinel.js internals [mapped — the 09:00 missed-push nudge riding
the drops tick, verified at the call site]; healthData.js (the spine, 403
lines) covered piecewise across items 05/07/11/22 — its ingest gate is
cited here from the drops module's contract comment. Deferrals: the steps
overlay UI (45/46), Shortcut setup docs (55).

## 1. What it is (verified)

Two halves of the health data spine's reliability story:

- **The Mirror** (healthMirror.js) — "if it's not in the vault, it didn't
  happen": a MACHINE-OWNED monthly markdown table of
  steps/sleep/HRV/RHR/weight/kcal/protein/floor written into
  Wiki/Health/Health Log — greppable, linkable, "safe from any
  server/data mishap." Fully regenerated each pass, and **the page's own
  header says human edits don't survive** and where corrections belong
  instead; absent metrics render as an em dash, "never a zero"; partial
  step counts carry a legended `*`; the future is not data (rows stop at
  today). Unchanged content skips the write and the backup churn
  (generated-line-stripped comparison); the first 3 days of a month keep
  finalising the previous month as late pushes land.
- **The Drops** (healthDrops.js) — store-and-forward ingestion, "the fix
  for 'my Mac must be awake for the push to work'": the phone Shortcut
  SAVES the JSON to an iCloud folder (always succeeds); the Mac drains it
  whenever it wakes. The iOS constraint is documented (an automated Save
  File can only reach iCloud Drive/Shortcuts — so that folder is drained
  too, with tests fenced off the real iCloud path); `.icloud` dataless
  placeholders are skipped until materialised; **malformed files archive
  as `bad-` so they can't retry forever, while read blips retry next
  tick** — the SyntaxError distinction; every failure logs a push-attempt
  receipt (the evidence Guardian's health check quotes). Ingestion goes
  through **the SHARED gate**: "the drops channel gets the same midnight
  date-shift + monotonic-steps protection as the URL push — a guard
  living in only one writer is how the 9→10 Aug clobber happened" (rule
  7, with its incident). Double delivery is a no-op by day-file upsert.
  2-minute drain cadence (iCloud latency reasoning stated), with the
  missed-push sentinel riding the tick — "a silent overnight failure
  becomes one honest Telegram nudge instead of a hole he finds days
  later."

## 2. Current workflow, traced

00:05: the phone automation saves `2026-08-31.json` to iCloud; the Mac is
asleep. 07:10: Mac wakes, the 2-minute tick drains the file through the
shared gate → day upserted → broadcast → every surface fresh; the file
archives to Processed. The mirror's next half-hour tick regenerates
August's page — one new row, em dashes where the night's push carried no
weight. Had the automation failed instead, 09:00's sentinel would have
sent the one honest nudge.

Failure modes:
- Mac asleep at push time → THE DESIGN; drains on wake. **The [12]-class
  problem, solved at the data layer.**
- Malformed drop → receipted, archived as bad-, never loops. **Honest.**
- Still-syncing file → retried next tick. **Honest.**
- Mid-day partial → flagged `*` in the mirror; the brief and Guardian
  carry the same three-shape honesty (05/22). **Honest.**
- Human edits the mirror table → overwritten — and the page itself warned
  them. **Honest by declaration.**
- **A late correction to an old month never reaches its mirror**: only
  the current month (+previous, for 3 days) regenerates — a steps fix
  applied via the overlay to a two-month-old day updates the store but
  the vault page for that month stays wrong indefinitely. Small, real,
  and against the module's own founding line.
- `bad-` files accumulate in Processed forever (retention-sweep family,
  [34] plan 4's cousin).

## 3. Pros — what genuinely works

- **The shared-gate comment** is rule 7's best statement in the codebase
  — one guard, every writer, with the clobber incident named.
- **Store-and-forward as the architecture answer** to the platform's most
  chronic operational problem (the sleeping Mac), with the iOS constraint
  research done and documented.
- **The mirror's honesty stack**: machine-owned and says so, em-dash
  never zero, future-is-not-data, partial-legend, write-skip on
  no-change. A generated page that cannot lie about what it is.
- **Malformed-vs-blip distinction** — the retry-forever failure class
  designed out with one instanceof check.
- **Receipts everywhere** (push-attempt log) feeding Guardian's evidence
  lines.

## 4. Cons and gaps (ranked by real-life cost)

1. **Old-month corrections never mirror** — the vault copy of history
   can silently diverge from the store it exists to mirror.
2. **Processed/bad- accumulation** — retention hygiene, cosmetic.

## 5. Mission test

**Daily: earns its keep foundationally** — every health-reasoning agent
audited above (Coach, briefs, insight, Guardian) stands on this data
arriving reliably; the drops design is why a sleeping Mac no longer
punches holes in the record. **Monthly/long-term:** the mirror is the
vault's permanent, owned copy of the body's history — rule 3 honoured for
the highest-volume machine data. Infrastructure, honestly labelled.

## 6. Improvement plan (ranked; uncapped — short because both modules are
near-optimal)

1. **[Refine] Mirror the month a correction lands in.**
   - **Proposal:** when a health/nutrition write touches a date outside
     the current month, queue that monthKey for one writeMirror pass on
     the next tick (a tiny pending-months set beside the scheduler; the
     unchanged-skip makes spurious queuing free).
   - **Doctrine:** the module's own founding line. **Impact/effort:**
     M-L / L.
   - **Verification:** scratch correction to an old date; the old page
     regenerates.
2. **[Refine] Fold Processed/bad- pruning into the platform retention
   sweep** ([34] plan 4's shape). **Impact/effort:** L / L.

## 7. UI recommendations

- **None** — the mirror is a vault page whose header is its own UI; the
  drops are invisible by design; the sentinel's nudge is already the
  right surface.

## 8. Verdict

**Keep as-is** — fifth clean keep; the platform's reliability story at
its best, with one small divergence window to close. Highest-value next
action: mirror-on-old-correction (plan 1), one queued set away.

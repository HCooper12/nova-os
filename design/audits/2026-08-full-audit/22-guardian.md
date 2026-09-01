# 22 — Guardian (the integrity agent)

Audited 2026-08-31. Read-only. Files opened: `server/lib/guardian.js` (full,
455 lines), `server/lib/heartbeat.js` (38 lines, at enumeration); consumers
verified: loops routes, snapshot, valsOps/valsInbox cards (read at 03),
push/fleet registration. Tests: guardian.test.js exists. The restore-undo
routes in inbox.undoFiling are [Inferred] handled (not re-read this turn —
plan 6 pins them). Deferrals: Ops screen (57), backup.js write-side (its
consumers were audited per-item).

## 1. What it is (verified)

The watch-the-watcher: read-only daily checks + a monthly report + the
time machine (10-14).

- **Five checks** (59-248): vault reachable/populated/To-Do present;
  snapshots exist, recent, and the latest 3 restore-read clean ("a backup
  that can't be restored is not a backup"); stores parse + quarantined
  files noticed + filed records still carry the undo their receipts
  promise; loop heartbeats vs a cadence table; and the health feed with
  three hard-learned failure shapes (quiet feed / yesterday missing /
  yesterday a mid-day PARTIAL that the old check called "Fresh" — "exactly
  the wrong assurance") with the last push attempt as evidence (204-248).
- **Escalation done right** (415-441): a NEW degradation earns one push +
  one Telegram; a persisting one never re-fires daily; warns count because
  "a quiet health feed is exactly the thing worth hearing about the day it
  happens".
- **Monthly report** (375-411): the checks plus 30-day rails stats —
  including undo-net usage ("the undo net got used and held").
- **The time machine** (275-346): browse per-file snapshots; restore
  snapshots the CURRENT state first and files an auto receipt whose
  undoData covers both branches — including restore-of-a-deleted-file,
  with the comment noting this was "the ONE write on the rails with no
  undo". One-tap vault+data zip export to Desktop (351-363).

## 2. Current workflow, traced

Hourly tick: last report 25h old → runGuardian → five checks → health
check finds yesterday's steps are a 09:04 partial → overall `warn`, newly
degraded from `ok` → one push + one Telegram naming the exact problem and
the fix path ("Tap the Steps card to correct it") → the Ops card renders
the check list with tones. On the 1st: the monthly report drafts with the
30-day undo statistics. When a filing goes wrong, the Time Machine lists
the file's snapshots and restore is itself snapshotted and undoable.

Failure modes, as they degrade today:
- A check crashes → recorded as an `alert` check named "check crashed"
  (259-261). **Honest — the [18] couldn't-look state, present here.**
- Persisting problem → no daily re-nag. **Honest.**
- **The loop watch covers ~13 of 20+ heartbeats** (LOOP_CADENCE_HOURS,
  160): coach-cadence, coach-reflection, plan-today, weekly-debrief,
  brief-warm, pattern-scout, autonomy, distill, brain-week, reminders,
  health-mirror and pulse all beat (verified at their items) and are
  invisible here — a stalled flagship morning lane would surface nowhere.
  **The watcher watches half the fleet.**
- **The store check reads a hand list** (23-28) whose own comment records
  the last time the list fell behind ("claimed all stores parse clean
  while reading only 4 of ~13") — and it has fallen behind again:
  coach-cadence/reflection/receipts/audit state, spoken-log, brief-state,
  tts-voice, plan-today, weekly-debrief configs, and the money/ + health/
  subdirs are unchecked. **The same disease, recurred.**
- **Same-level swap is silent** (426): notification compares OVERALL
  status only — if the health warn resolves the same day the backup check
  newly warns, the new problem announces nothing.
- Monthly report on `getDate() === 1` — [12] class, 5th site; month-keyed
  guard makes catch-up free.

## 3. Pros — what genuinely works

- **The restore path is the platform's safety doctrine executed
  perfectly**: snapshot-first, receipt filed, undo covering both branches,
  the historical gap named in a comment. This plus [14]'s plan-note write
  are the two model write-paths of the audit.
- **The health-feed check encodes three real incidents** with evidence
  attached and a fix path in every message — the best failure-shape
  taxonomy in the fleet.
- **New-degradation-only notification** — alerting that respects
  attention, with the dual-channel rationale documented.
- **Filed-records-carry-undo** (143-146) — the Guardian audits the
  promise every receipt makes, not just the files.
- **The monthly undo-net stat** — "the net got used and held" is trust
  made measurable.

## 4. Cons and gaps (ranked by real-life cost)

1. **Half the fleet is unwatched** — the loop check's hand list has
   drifted from the heartbeat reality; the platform's most safety-critical
   blind spot found in this audit, in the module whose one job is blind
   spots.
2. **The store list has re-drifted** — with its own I-fell-behind-once
   comment attached.
3. **Same-level check swaps notify nothing** — per-check comparison is
   the honest unit, not the overall roll-up.
4. **Slept-through 1st costs the monthly report** ([12] class).
5. **The yesterday-partial logic is an unpinned twin** with the morning
   brief's steps-gap detector (dispatch.js:154-165 vs :239-246) — same
   three shapes, two implementations, no cross-reference ([12] twins
   sweep).
6. Restore undo-routes handling in inbox.undoFiling is inferred, untested
   here.

## 5. Mission test

**Daily/weekly: earns its keep as pure trust infrastructure** — like the
program audit (18), it changes behavior indirectly: the health-feed check
alone converts "Nova doesn't know yesterday's steps" from a multi-day
discovery into a same-day push with a fix path, which protects every
agent that reasons from that data. **Monthly:** the report's undo stats
make the safety net's real usage visible. **Long-term:** the time machine
and export are the difference between "trust me" and "check for
yourself". The mission risk is the blind-spot drift (cons 1-2): a trust
layer that silently covers less each month is spending credibility it
doesn't know it's losing.

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE — the architecture is right; the lists rotted.

1. **[Refine] Derive the loop watch from reality.**
   - **Proposal:** watch every key present in readHeartbeats() — stale =
     older than its cadence, from a table for known loops and a generous
     default (26h) for unknown ones; plus a small expected-loops registry
     (exported beside the schedulers or built from the beat() call sites)
     so a loop that has NEVER beaten is also named. The hand list stops
     being load-bearing.
   - **Doctrine:** rules 4, 7 (one source of truth — the heartbeat file
     itself); the module's own founding purpose.
   - **Impact/effort:** H / M-L.
   - **Verification:** unit test with an unknown-but-stale beat; live
     check that all ~20 current beats appear.
2. **[Refine] Scan the data dir for stores.**
   - **Proposal:** enumerate `*.json` under dataRoot (plus money/ and
     health/ one level down) instead of STORE_FILES; the absent-file skip
     is already safe, and quarantine detection already scans the real
     dir. Keep a small exclusion list if any file is legitimately
     non-JSON.
   - **Doctrine:** rule 7; the comment's own lesson, made structural.
   - **Impact/effort:** M-H / L.
   - **Verification:** unit test with a planted unparseable file outside
     the old list.
3. **[Refine] Per-check degradation notify** — compare each check's
   status to its predecessor; any check that worsened fires the (still
   deduplicated) notification, not just a worsened roll-up.
   **Impact/effort:** M / L.
4. **[Refine] Any-day monthly-report catch-up** (month-keyed guard
   already exists). **Impact/effort:** L-M / L.
5. **[Refine] Pin the yesterday-partial twin** — extract the shared
   three-shape helper (or cross-comment + a fixture test both files run).
   **Impact/effort:** L-M / L.
6. **[Refine] Test the restore undo routes** ('restore' and
   'restore-created') end-to-end on a scratch vault.
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the Ops/Inbox Guardian card (check list with tones,
verified at 02/03's reads), push/Telegram, the monthly journal report,
the Time Machine UI. Screened against dashboard drift:

- **None.** The card already renders per-check status honestly and the
  Time Machine is its own reviewed surface (57). The fleet-coverage fix
  (plan 1) will make the existing card's "N loops ticking" line simply
  become true — no new UI needed for that truth to land.

## 8. Verdict

**Keep as-is / Refine** — the right trust architecture with two rotted
hand lists at its core; everything else is the platform's safety doctrine
at its best. Highest-value next action: **derive the loop watch from
reality** (plan item 1) — the watcher must watch the whole fleet, and the
fix removes the maintenance burden that caused the drift twice.

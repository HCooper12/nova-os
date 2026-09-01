# 32 — Study Lane

Audited 2026-08-31. Read-only. Files opened: `server/lib/studyLane.js`
(full, 213 lines); entry points verified earlier: the intent router +
platformActivity lane registry (04), inbox retry affordance (02), Morning
Show PRODUCE_KINDS (03). Pure functions (enumerateSources,
dedupeRollingCaptions) exported for tests; dedicated test-file presence
unverified (plan 3). Deferrals: intent routing itself (04/47), the note
route (audited), yt-dlp/watch tooling shared with the Watcher (33).

## 1. What it is (verified)

"Analyse this creator" as a real job (1-13) — the hand-run WiseTwinz
protocol, automated: **ENUMERATE the body of work first (never sample
silently)**, transcribe the most recent long-form slice within budget
(captions only, no video downloads; the manual study's rolling-caption
dedupe codified, 78-96), then synthesize ONE brief whose sections are
fixed: what they've built / per-video findings (claims must cite a
transcript) / **capability diff vs Nova grounded ONLY in the inventory
file** / prioritised recommendations / **Coverage** — "state exactly:
enumerated 37; transcribed 10 of 12 attempted… no captions: X, Y" —
"'transcribed 10 of 37' is a finding, not a footnote."

Rails: lane-gated BEFORE the record exists; kind `study`, classifying →
pending (push + Telegram fire via notifyIfPending) → approve files a vault
note; error carries the reason; **retry-in-place from the record's own
stored inputs** (studyUrls/studyProse, 207-213 — the [24] pattern).
Subprocess calls have real timeouts (34-42); budget $1.50; pinned model;
inventory-unavailable degrades to "make NO Nova-side claims" (173).

## 2. Current workflow, traced

"Study @somecreator and compare against Nova" → record classifying → both
channel tabs enumerated (failures per-tab named), 37 items deduped →
10 most recent long-forms transcribed, 2 had no captions (named) →
synthesis over catalogue + transcripts + the capability inventory →
pending brief with its Coverage section stating exactly what was and
wasn't assessed → approve → vault note.

Failure modes, as they degrade today:
- Nothing enumerable → error naming the URLs and tab failures. **Honest.**
- Zero transcripts → "nothing honest to synthesize from". **Honest — the
  right refusal.**
- No captions on some → named in Coverage. **Honest.**
- Inventory unreadable → no Nova-side claims, stated. **Honest
  degradation…**
- **…but the inventory read is broken-by-path in the one deployment that
  matters** (174): `path.join(process.cwd(), 'design/…')` — every sibling
  resolves via import.meta.url or vaultPath, and under launchd the
  server's cwd is not the repo root. [Inferred runtime effect:] the
  capability-diff section — the feature's stated differentiator — has
  likely been silently running in its degraded no-Nova-claims mode in
  production, honestly labelled but needlessly empty.
- **The synthesis model call has no timeout** — the subprocesses are
  guarded; the most expensive step isn't ([24] family, site #8).
- Catalogue prompt slice (60 of N) — mitigated by Coverage stating the
  full enumeration count.

## 3. Pros — what genuinely works

- **Enumerate-first with Coverage as a mandatory output section** — the
  silent-cap doctrine elevated to a deliverable; the reader always knows
  the denominator. With the program audit's three-state receipt, this is
  the other honesty-reporting shape worth exporting.
- **The inventory-only grounding rule for Nova-side claims** — the
  capability diff cannot flatter or invent because its evidence source is
  a single named file, and its absence flips to claims-forbidden.
- **Subprocess discipline**: timeouts, cookie optionality, temp-dir
  cleanup, per-tab failure capture.
- **Retry-in-place with inputs on the record** — second confirmed
  implementation of the [24] pattern.
- **The rolling-caption dedupe** — a real manual-protocol trick,
  extracted pure and testable.

## 4. Cons and gaps (ranked by real-life cost)

1. **The cwd-relative inventory path** — one line that likely blanks the
   feature's headline section in production, invisibly-honestly. The
   path-discipline lesson ("never URL.pathname…") lives in six sibling
   comments; this slipped past it.
2. **No model-call timeout** ([24]).
3. **Test coverage unverified** for the two exported pure functions and
   the coverage-string composition.
4. Shorts never transcribed — deliberate, stated, correct (captions on
   shorts are rare and thin); noted as design, not gap.

## 5. Mission test

**On-demand (content strategy): earns its keep** — a creator's whole body
of work enumerated, sampled honestly, and diffed against Nova's real
capabilities is exactly the competitive-study work he did by hand once
and shouldn't again. **Monthly/long-term:** briefs accumulate as vault
notes; recommendations feed the backlog. **Daily/weekly: n/a by design.**
The mission leak is con 1: the diff-vs-Nova half of every brief since
launchd deployment may have been empty.

## 6. Improvement plan (ranked; uncapped)

1. **[Refine] Fix the inventory path.**
   - **Proposal:** resolve INVENTORY_REL from import.meta.url (repo root)
     like every sibling; add the regression test the standing method
     demands; verify live with one study run reading the produced brief's
     diff section (the §3.5 rule — this one specifically needs the
     real-service check, since the bug only exists under launchd's cwd).
   - **Impact/effort:** M-H / L.
2. **[Refine] Model-call timeout** — the shared settle-timeout helper
   ([24] plan 2), eighth consumer. **Impact/effort:** L / trivial then.
3. **[Refine] Pin the pure functions** — enumerateSources (tab failures,
   dedupe), dedupeRollingCaptions (overlap joins), and the coverage
   string, if not already covered. **Impact/effort:** L-M / L.

## 7. UI recommendations

Where output lands: the study Inbox card (retry verified), the vault
note, push/Telegram. Screened against dashboard drift:

- **None** — the Coverage section IS the transparency UI, and it lives in
  the artefact itself where it belongs.

## 8. Verdict

**Keep as-is / Refine** — the silent-cap doctrine as a working pipeline,
undermined by one path bug that likely blanked its headline section in
production. Highest-value next action: **fix the inventory path and
verify against the live service** (plan item 1) — a one-line fix whose
whole point is the real-vault verification step.

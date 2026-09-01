# 33 — Watcher (+ the shared ingest/weave rail)

Audited 2026-08-31. Read-only. Files opened: `server/lib/watcher.js`
(1-379 line-by-line; 380-530 — digest orchestration + runWatchModel —
mapped via structure, not line-read [declared]), `server/lib/ingest.js`
(1-200 + approveJob + startIngest; weave-prompt internals ~200-450 mapped
[declared]), `server/routes/ingest.js` (routes + approve/discard). The
watch-note filing route (inbox.js:687-695 area) and DEEP WEAVE affordance
verified at earlier items. Deferrals: Library/ingest review UI (48/53),
bookText/browserResearch feeders (53), Scout (36 — same rail).

## 1. What it is (verified)

Nova's eyes on video, two tiers deliberately priced apart ("triage
shouldn't cost absorption"):

- **The quick watch** (watcher.js): explicit link → local transcript via
  the watch toolchain (captions-first, Whisper fallback; 6-min timeout;
  launchd PATH + python resolution + plugin-version resolution all
  handled, 56-98) → one model pass drafts EITHER the Coach's
  evidence-checked verdict (claims judged well-supported/contested/wrong
  with web citations, adopt/partial/ignore, "an honest 'nothing here'
  beats manufactured value") or a distilled reference note — always
  pending, transcript never wholesale into Wiki (13-22, 215-229). Long
  transcripts (>150k chars — the real 575k 4-hour podcast) go through
  **measured chunk economics**: extraction is "a faithfulness job, not a
  judgment job", so 60k-char chunks on the chunk lane's model, with the
  $1.46-Opus-death vs $0.35-Sonnet measurement written at the constant
  (30-45). Digest notes are **cached per video id** so a retry or second
  surface never re-pays extraction (364-378). The note's source header is
  composed in CODE — "never the model's to get wrong" (241-247);
  transcripts persist to data/watch so approval never depends on a tmp
  dir (335-342); the WATCH directive shares the Researcher's boundary
  trio; both lanes are checked up front so a long video can't strand
  half-way (277-281); retry-in-place from the record's text.
- **The deep weave** (ingest.js — the rail books, people, and pasted
  transcripts also ride: "one rail, one review UI, one undo, however the
  knowledge arrived"): staged Wiki-only vault copy (full copies made
  iCloud re-download evicted files — documented, 81-84), model weaves in
  the staging tree, diffTrees consults the REAL Raw/ so rewrites read as
  updates not new files, jobs persist to disk (the $6-diff-died-twice
  lesson, 50-54), and **budgets are backstops, not caps** — "$3.08 spent,
  killed, wrote NOTHING… a cap that discards completed work is worse than
  no cap" (12-19; $25/$40, env-overridable).

## 2. Current workflow, traced

He pastes a 4-hour podcast link with "is the fasting claim legit?" →
record classifying → captions fetched in seconds → 575k chars → digest:
chunked exhaustive extraction (notes cached under the video id) → verdict
pass over the notes → pending card: verdict + note + APPROVE (files
Source page + transcript to Raw with undo) or DEEP WEAVE (the ingest rail
stages, weaves every concept, diffs). Deep weave ready → he approves →
**each file backed up, then overwritten** — job applied, job file
removed.

Failure modes, as they degrade today:
- No captions + no Whisper key → error naming the fix path (313). **Honest.**
- Toolchain missing/moved → named errors incl. the plugin-version walk. **Honest.**
- Budget death mid-extraction → the backstop redesign exists precisely
  because of this; chunk results cache incrementally. **Honest, learned.**
- Server restart with a ready weave → job survives on disk. **Honest,
  learned.**
- Same video re-submitted → videoIdOf dedupe across URL forms (156-163
  of ingest). **Honest.**
- **The deep-weave apply has no drift refusal, no priors, no undo, and
  no rails receipt** (approveJob, verified): backup-first per file, then
  wholesale overwrite; the job file is deleted after apply. Its sibling
  distill — SAME staged-pass family, smaller writes — stamps priors,
  refuses drift across all files first, files a review-all record, and
  restores verbatim on undo. The platform's most powerful write path has
  its weakest safety story: recovery is manual, file-by-file, through
  Guardian's time machine, and doctrine rule 2 ("every write… rides the
  inbox rails… has an undo — no exceptions") is not met here.
  **The item's central finding.**
- retryWatch drops the per-run model override (302 — the [24]
  researcher-twin, verified).
- Model-pass timeouts beyond the fetch [Unverified in the unread range]
  ([24] family).

## 3. Pros — what genuinely works

- **Measured economics as engineering**: the chunk-size constant carries
  its own experiment; the budget redesign carries its own incident;
  extraction-vs-judgment gets different models for stated reasons. No
  other lane documents its cost physics this well.
- **The digest cache** — expensive faithfulness work is never re-paid;
  retries and second surfaces reuse it by design.
- **Two-tier triage** — $0.50-class verdicts for "worth my time?", the
  full weave only on explicit DEEP WEAVE; the reason ("triage shouldn't
  cost absorption") is the right economics for a daily-use tool.
- **Toolchain resilience under launchd** — PATH, python, plugin-cache
  versioning: the deployment reality most codebases discover in
  production is handled and commented here.
- **Code-composed provenance** everywhere: source headers, Raw/
  verbatims, "you have the words, not the pictures" honesty in the
  prompt.

## 4. Cons and gaps (ranked by real-life cost)

1. **The deep-weave apply is a one-way door with per-file band-aids** —
   no drift check (a vault edited during the weave's pending window is
   silently clobbered, backups aside), no undo record, no receipt on the
   rails. Rule 2's "no exceptions" has an exception, at the largest
   writes.
2. **retryWatch loses the gate's model choice** ([24] twin).
3. **Timeout coverage of the model passes unverified** in the unread
   range.
4. **The digest cache ignores the question** — notes extracted under an
   old ask serve a retry with a new one; largely honest (extraction is
   exhaustive by design) but worth one header line in the notes naming
   the ask they were extracted under.

## 5. Mission test

**Daily/weekly: earns its keep decisively** — "should I watch this?"
answered for cents with citations, and "absorb this into my brain"
answered for dollars with receipts; this is the knowledge domain's
workhorse and its two-tier shape is why it stays affordable enough to
use. **Long-term:** every weave compounds the graph; the digest cache and
dedupe protect the economics of heavy use. The mission risk is con 1: the
lane that writes the most into the vault is the one lane where a bad
apply can't be un-done with a tap.

## 6. Improvement plan (ranked; uncapped)

1. **[Refine] Unify the staged-pass rail at its most powerful consumer.**
   - **Proposal:** port distill's apply shape into approveJob:
     prior-stamp changes at diff time, all-files-first drift refusal
     ("the vault moved under this weave — discard and re-run"),
     approval files a receipt on the rails whose undoData restores every
     prior verbatim (and removes created files), and the job file
     persists until undone/expired rather than deleting on apply. One
     shared apply/undo helper serves distill + ingest (+ [01]'s applyOps
     convergence — three write paths, one shape).
   - **Doctrine:** rule 2's "no exceptions", literally; the [26] named
     rail completed.
   - **Impact/effort:** H / M.
   - **Verification:** scratch-vault weave with a concurrent edit
     asserting refusal; apply→undo round-trip asserting byte-identical
     restoration.
2. **[Refine] retryWatch preserves the model override** — store it on
   the record (one commit with the researcher's same fix).
   **Impact/effort:** L / L.
3. **[Refine] Timeout audit of chunk/verdict spawns** — read the
   remaining range when touched; adopt the shared settle-timeout helper
   ([24]). **Impact/effort:** L-M / L.
4. **[Refine] Digest-notes header names the ask they were extracted
   under.** **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the video Inbox card (verdict + APPROVE/DEEP WEAVE +
retry), the ingest review UI, vault pages. Screened against dashboard
drift:

- **With plan 1, the weave receipt gains the standard undo affordance**
  — the one UI consequence, and it's the existing history-undo pattern,
  not new chrome. What changes: a regretted $6 weave is one tap back
  instead of an evening with the time machine.

## 8. Verdict

**Keep as-is / Refine** — the fleet's workhorse and its best-measured
economics, carrying one genuine doctrine exception at its most powerful
write. Highest-value next action: **unify the staged-pass apply**
(plan item 1) — one shared shape closes rule 2's last open door across
three write paths at once.

# 38 — Pulse

Audited 2026-08-31. Read-only. Files opened: `server/lib/pulse.js` (full,
197 lines). Consumers verified at earlier items: the SHOW pulse panel with
its honest empty note (04), the morning dispatch line (05), ambient strip
(61 deferred), ops routes. Injectable runner exported for tests.
Deferrals: Ambient screen (61), panels rendering (47).

## 1. What it is (verified)

Topic Pulse — "the brief that SHOWS" (11-16): for each topic on his
Interests page (**a vault page, his to edit**, seeded with the honest cost
note "each is a real overnight web run", 34-44), a small web-read-only run
fetches up to 5 current items with real URLs. The cache is
**display-only and self-labels its age** — pulses feed panels, the
ambient strip, and one dispatch line; "nothing ever enters the vault, so
there is nothing to review-gate" — the correct doctrinal reasoning for a
gate-free lane, stated. The citation rule stands: **no URL, no item**;
"fewer honest items beat five padded ones" (71). Nightly in the
03:30-06:30 quiet window, sequential one-model-at-a-time, $0.50/topic,
max 6 topics; a failed topic keeps its previous cache ("stale-and-
labelled beats gone", 148-149); topics removed from the page are pruned
from the cache (160-162).

## 2. Current workflow, traced

03:45: three interests refresh sequentially → cache updated per topic →
morning: "**Pulse.** Hypertrophy and strength: 4 ('Effects of proximity
to failure…')" in the brief → "what's new on training?" in conversation →
the SHOW pulse panel draws the cached items with age; nothing cached →
the honest note + a RESEARCH offer (04's verified behavior).

Failure modes:
- Topic run fails → previous cache kept, console log, counted in the
  summary. **Honest.**
- Nothing cached → panels say so. **Honest.**
- Junk URL/title → item dropped at normalize. **Honest.**
- Restart mid-window → in-memory day guard lost, topics re-run — a few
  dollars at worst, cache idempotent. **Acceptable, noted.**
- **No novelty memory**: yesterday's items re-qualify daily ("the last
  two weeks"), so the same five headlines can sit in the panel and
  ambient strip for days while labelled fresh — the pulse decays to
  wallpaper exactly where its job is to feel current.
- **Mac asleep 03:30-06:30 → stale pulses all day** (daily variant of
  [12]; mitigated by self-labelling — the morning line goes silent at
  24h rather than lying).
- **A 7th+ topic is silently ignored** (slice at MAX_TOPICS, 62): the
  seed asks him to keep to 6, but nothing says which ones didn't run if
  he doesn't ([03] silent-cap lite).
- Pulse is absent from Guardian's loop-cadence list — covered by [22]'s
  derive-from-reality fix.

## 3. Pros — what genuinely works

- **The gate-free reasoning** — display-only, vault-untouched, so no
  review theatre; the one lane where NO gate is the doctrinally correct
  amount of gate.
- **Interests as a vault page with the cost stated in its seed** — rule
  3 + rule 6 in one file he owns.
- **Stale-and-labelled beats gone** — failure keeps yesterday's truth
  visible instead of blanking it.
- **No-URL-no-item + fewer-beats-padded** — the citation discipline at
  display scale.
- **Injectable runner** — testability designed in.

## 4. Cons and gaps (ranked by real-life cost)

1. **No novelty memory** — repeats wear the "fresh" label.
2. **Sleep-through staleness** without a catch-up window.
3. **Silent topic cap** past 6.

## 5. Mission test

**Daily: earns a modest keep** — a cited two-minute scan of what moved in
his fields, in the brief and on the glass, without opening a feed app.
**Weekly/long-term:** correctly nothing — this is ambient awareness, not
knowledge; anything worth keeping goes through Research/Watch by his
explicit hand. The honest ceiling for the lane is exactly where it sits;
con 1 is what keeps it from feeling alive at that ceiling.

## 6. Improvement plan (ranked; uncapped)

1. **[Refine] Novelty memory.**
   - **Proposal:** pass the topic's previous item URLs into the prompt as
     an exclude list ("already shown — only return items NOT in this
     list; an empty result is honest when nothing new exists"), and keep
     yesterday's items in the cache under a `seen` flag so the panel can
     show "nothing new today; last items from <date>" instead of reprints
     wearing fresh labels.
   - **Doctrine:** rule 4. **Impact/effort:** M / L.
   - **Verification:** two consecutive scratch refreshes with a canned
     runner; second returns the exclusion behavior.
2. **[Refine] A late catch-up** — if today never ran and it is past
   09:00, run once (the day guard already prevents doubles; persist
   lastRunDay to the cache file so restarts don't re-run either).
   **Impact/effort:** L-M / L.
3. **[Refine] Name the cap when it bites** — >6 topics logs and marks the
   unrun ones in the cache so the panel can say "not refreshed (over the
   6-topic limit)". **Impact/effort:** L / L.

## 7. UI recommendations

- **None here** — the panel's honest empty note and age labels already
  exist; plan 1's "nothing new today" state rides them. Ambient rendering
  is item 61's pass.

## 8. Verdict

**Keep as-is / Refine** — a right-sized ambient lane with the correct
amount of gate (none) and one freshness flaw. Highest-value next action:
**novelty memory** (plan item 1) — the pulse's whole job is to feel
current, and repeats wearing fresh labels are the one way it lies today.

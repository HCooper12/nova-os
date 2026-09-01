# 31 — Brain Week

Audited 2026-08-31. Read-only. Files opened: `server/lib/brainWeek.js`
(full, 131 lines); consumers verified at earlier items: morningShow
PRODUCE_KINDS, learning KIND_LABEL, TIME_VALUE 8d (present), loops route.
Tests: brainWeek.test.js exists. Deferrals: journal rendering (52),
Morning Show beat (39/44).

## 1. What it is (verified)

"What entered my second brain this week" — fully deterministic (8-14): walk
the knowledge folders (Sources, Concepts, Entities, Topics, Inbox captures,
Raw originals), keep files whose `created` frontmatter (or mtime fallback)
falls in the last 7 days, compose a grouped, **wikilinked** digest → a
pending journal draft. "The week's additions are facts, not judgments."
An empty week files nothing — "honest silence" (67). ISO-week dedupe key,
retry-safe (an errored record doesn't block the week, 90); YAML
date-object-vs-string parsing handled with the reason documented (30-36);
Raw/ pages get their folder-prefixed link form (63-64). Sundays ≥16:00.

## 2. Current workflow, traced

Sunday 16:30: nine files created this week → "This week 9 pages entered
the second brain: **Sources** (2) - [[Peak (Ericsson)]]… **Concepts** (4)
…" → pending card → approve → a journal entry that is itself a wikilinked
hub for the week's knowledge — the digest joins the graph it describes.

Failure modes, as they degrade today:
- Empty week → skip with reason (to the caller only). **Honest-ish** — a
  quiet week and a permissions-broken walk both end in silence; the
  per-file reader falls back to mtime and a throwing readdir crash-logs,
  so the truly-silent-failure window is small but nonzero.
- Unparseable frontmatter → mtime fallback. **Honest.**
- Errored record → doesn't block the week's retry. **Honest.**
- Slept-through Sunday → no digest that week ([12] class, site #9 —
  though the rolling 7-day window means a Monday catch-up would still
  cover essentially the right week, making this the cheapest widening in
  the class).
- Flat (non-recursive) walk — Archive subfolders are excluded by
  accident-of-design, which is currently correct; if Sources ever nests,
  additions would silently vanish from the digest. [Assumed flat vault
  shape.]

## 3. Pros — what genuinely works

- **Facts-not-judgments as the design line** — the deterministic
  counterpart to the Weekly Debrief; no model, no cost, no invented
  significance.
- **The digest is itself graph material** — wikilinked, so approving it
  gives the journal a weekly hub page that backlinks every addition.
  Quietly the best "review your week" artefact shape possible in an
  Obsidian vault.
- **Retry-safe weekly dedupe** done right (error records don't burn the
  week).
- **Small enough to be correct** — 131 lines, tested, with its two
  parsing edge cases documented.

## 4. Cons and gaps (ranked by real-life cost)

1. **Sunday gate** ([12]) — cheapest fix in the class.
2. **Silence conflates quiet and broken** at the walk level — small
   window, worth one line when touched, not a build of its own.
3. Nothing else. Rejected candidate: including Studio/Ideas — ideas are
   his own output, not knowledge entering; their lifecycle belongs to
   Studio/Compost (25/27). Rejected: week-over-week counts or trends —
   the Weekly Debrief is the judgment layer; adding judgment here would
   blur the facts/judgment line that makes this module good.

## 5. Mission test

**Weekly: earns a modest, real keep** — a five-second review of what the
week actually added, with every line clickable, protects against the
collect-and-never-revisit failure of second brains. **Monthly/long-term:**
the accumulated weekly hubs form a browsable timeline of intellectual
input — genuine archival value for zero model cost. **Daily: n/a.**

## 6. Improvement plan (ranked; uncapped — short because the module is
near-optimal, not for lack of looking)

1. **[Refine] Widen the Sunday window** (Sun-Mon; the ISO-week key
   already dedupes and the rolling window keeps coverage honest).
   **Impact/effort:** L-M / L.
2. **[Refine] One honest line on walk failure** — if any KNOWLEDGE_DIR
   readdir throws, skip with reason 'walk failed (<dir>)' rather than
   composing a partial digest that looks complete; piggyback whenever the
   file is next touched. **Impact/effort:** L / L.

## 7. UI recommendations

- **None.** The card and journal entry are the right surfaces; the
  digest's wikilinks are the interaction.

## 8. Verdict

**Keep as-is** — the second of the fleet's near-optimal small agents
(with Food Scout); two one-line refinements when convenient. Highest-value
next action: the Sunday-window widening, folded into the fleet-wide [12]
fix rather than done alone.
